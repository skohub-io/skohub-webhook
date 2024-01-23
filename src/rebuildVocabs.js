const fs = require("fs-extra")
const path = require('path');
const { securePayload, gitHubApiHeaders } = require("./common.js")
require("dotenv").config()

const { SECRET, BUILD_URL, REBUILD_MAX_ATTEMPTS } = process.env
const args = process.argv.slice(2);
console.log(args); // ['arg1', 'arg2', 'arg3']

function protocolizeUrl(url) {
  return url.startsWith("http")
    ? url
    : "https://" + url

}

/**
 * @typedef {Object} BuildInfo
 * @property {string} id
 * @property {Object} body
 * @property {Date} date
 * @property {string} ref
 * @property {string} repository
 * @property {string} status
*/

// get all json data from dist/build folder
const readBuildDir = async () => {
  const directoryPath = './dist/build';
  try {
    const files = await fs.readdir(directoryPath);
    const jsonFiles = files.filter(file => path.extname(file) === '.json');

    const jsonObjects = await Promise.all(jsonFiles.map(async file => {
      const filePath = path.join(directoryPath, file);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }));

    return jsonObjects;
  } catch (err) {
    console.error('Error:', err);
    throw err;
  }
}

/**
 * Create an array only containing the most recent webhook requests
 * @param {BuildInfo[]} buildInfo
 * @returns {BuildInfo[]} sorted build information
 */
const sortBuildInfo = (buildInfo) => {
  const reposToBuild = buildInfo.filter(b => {
    if (buildInfo.some(e => e.ref === b.ref && e.repository === b.repository && new Date(e.date).getTime() > new Date(b.date).getTime())) {
      return false
    } else if (buildInfo.some(e => e.ref === b.ref && e.repository === b.repository && new Date(e.date).getTime() <= new Date(b.date).getTime())) {
      return true
    }
  })
  return reposToBuild
}

/**
 * @param {string} repository
 * @param {string} ref
 */
async function checkIfBranchExists(repository, ref) {
  const branchName = ref.split("/").slice(-1)[0]
  const result = await fetch(`https://api.github.com/repos/${repository}/branches`, {
    headers: gitHubApiHeaders
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      const branchExists = data.some(branch => branch.name === branchName);
      if (branchExists) {
        console.log(`${repository}/${branchName} exists!`);
        return true
      } else {
        console.log(`Branch "${branchName}" does not exist.`);
        return false
      }
    })
    .catch(error => {
      console.error(`Fetch error for repo ${repository} and branch ${branchName}, ${error}`);
      return false
    });
  return result
}

/**
 * send fetch request to webhook
 * @param {BuildInfo} buildInfo
 * @returns {string} buildId
 */
const sendBuildRequest = async (buildInfo) => {
  const payload = {
    repository: {
      full_name: buildInfo.repository
    },
    ref: buildInfo.ref
  }
  const signature = securePayload(payload, SECRET)
  const headers = {
    "x-hub-signature": signature,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "x-github-event": "push",
  }
  try {
    const response = await fetch(protocolizeUrl(BUILD_URL), {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error("Network response was not ok!")
    }
    const respBody = await response.text()
    // get url from response
    const responseUrl = protocolizeUrl(respBody.substring(17))
    console.log("Build Urls:", responseUrl)
    const url = new URL(responseUrl)
    const id = url.searchParams.get("id")

    return {
      id,
      repository: buildInfo.repository,
      ref: buildInfo.ref
    }
  } catch (error) {
    console.error("Error sending request", error)
    return {
      id: null,
      repository: buildInfo.repository,
      ref: buildInfo.ref
    }
  }
}

/**
 * @param {{
 * id: string
 * repository: string
 * ref: string
 * }} buildInfo
 */
const checkBuildStatus = (buildInfo) => {
  const maxAttempts = REBUILD_MAX_ATTEMPTS ? Number(REBUILD_MAX_ATTEMPTS) : 30
  let attempts = 0
  let json = {}
  const getData = async () => {
    try {
      const response = fs.readFileSync(`./dist/build/${buildInfo.id}.json`)
      /** @type {BuildInfo} */
      json = JSON.parse(response)
      if (json.status === "complete" || json.status === "error") {
        console.log(`${json.repository}, ${json.ref}: Finish with status: ${json.status} (ID: ${buildInfo.id})`)
        return
      } else {
        throw new Error("Not completed")
      }
    } catch (error) {
      if (attempts > maxAttempts || !buildInfo.id) {
        console.log(`${buildInfo.repository}, ${buildInfo.ref}: did not finish after ${attempts} attempts. Aborting. Error: ${error} (ID: ${buildInfo.id})`)
        return
      }
      setTimeout(() => {
        if (json?.status === "processing") {
          // we just keep trying to get the data
          getData()
        } else {
          // increase attempts as it seems to be somewhere in between defined statuses
          attempts++;
          getData()
        }
      }, 2000)
    }
  }
  getData()
}

const main = async () => {
  if (args.length) {
    const buildInfo = {
      repository: args[0],
      ref: "refs/heads/" + args[1]
    }
    const branchesExisting = await Promise.all([buildInfo].map(b => checkIfBranchExists(b.repository, b.ref)))
    const cleanedBuildInfo = [buildInfo].filter((_, i) => branchesExisting[i])
    const newBuildInfo = await Promise.all(cleanedBuildInfo.map((b) => sendBuildRequest(b)))
    newBuildInfo.forEach(info => checkBuildStatus(info))

  } else {
    const buildInfo = await readBuildDir()
    const sortedBuildInfo = sortBuildInfo(buildInfo)
    const branchesExisting = await Promise.all(sortedBuildInfo.map(b => checkIfBranchExists(b.repository, b.ref)))
    const cleanedBuildInfo = sortedBuildInfo.filter((_, i) => branchesExisting[i])
    const newBuildInfo = await Promise.all(cleanedBuildInfo.map((b) => sendBuildRequest(b)))
    newBuildInfo.forEach(info => checkBuildStatus(info))
  }
}

main()
