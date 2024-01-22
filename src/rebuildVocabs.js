const fs = require("fs-extra")
const path = require('path');
const { securePayload } = require("./common.js")
require("dotenv").config()

const { SECRET, BUILD_URL } =
  process.env

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
    const response = await fetch(BUILD_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error("Network response was not ok!")
    }
    const respBody = await response.text()
    // get url from response
    const responseUrl = respBody.substring(17).startsWith("http")
      ? respBody.substring(17)
      : "https://" + respBody.substring(17)
    const url = new URL(responseUrl)
    const id = url.searchParams.get("id")

    return id
  } catch (error) {
    console.error("Error sending request", error)
  }
}

//
const checkBuildStatus = (id) => {
  const maxAttempts = 30
  let attempts = 0
  const getData = async () => {
    try {
      const response = fs.readFileSync(`./dist/build/${id}.json`)
      /** @type {BuildInfo} */
      const json = JSON.parse(response)
      if (json.status === "complete" || json.status === "error") {
        console.log(`${json.repository}, ${json.ref}: Finish with status: ${json.status} (ID: ${id})`)
        return
      } else {
        throw new Error("Not completed")
      }
    } catch (error) {
      if (attempts > maxAttempts) {
        console.log(`${json.repository}, ${json.ref}: did not finish after ${attempts} attempts. Aborting. Error: ${error} (ID: ${id})`)
        return
      }
      setTimeout(() => {
        attempts++;
        getData()
      }, 2000)
    }
  }
  getData()
}

const main = async () => {
  const buildInfo = await readBuildDir()
  const sortedBuildInfo = sortBuildInfo(buildInfo)
  const buildIds = await Promise.all(sortedBuildInfo.map((b) => sendBuildRequest(b)))
  buildIds.forEach(id => checkBuildStatus(id))
}

main()
