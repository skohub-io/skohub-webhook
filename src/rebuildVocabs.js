const fs = require("fs-extra")
const { securePayload } = require("./common.js")
const { readBuildDir, sortBuildInfo, checkIfBranchExists } = require("./commonChoreForVocabs.js")
const types = require("./types.js")
const logger = require("./logger.js")
require("dotenv").config()

const { SECRET, BUILD_URL, REBUILD_MAX_ATTEMPTS } = process.env
const args = process.argv.slice(2);

function protocolizeUrl(url) {
  return url.startsWith("http")
    ? url
    : "https://" + url
}


/**
 * send fetch request to webhook
 * @param {types.BuildInfo} buildInfo
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
    logger.info(`Build Urls: ${responseUrl}`)
    const url = new URL(responseUrl)
    const id = url.searchParams.get("id")

    return {
      id,
      repository: buildInfo.repository,
      ref: buildInfo.ref
    }
  } catch (error) {
    logger.error(`Error sending request ${error} `)
    return {
      id: null,
      repository: buildInfo.repository,
      ref: buildInfo.ref
    }
  }
}

/**
 * @param {types.BuildInfo} buildInfo
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
      if (json.status === "complete") {
        logger.info(`${json.repository}, ${json.ref}: Finish with status: ${json.status} (ID: ${buildInfo.id})`)
        return
      } else if (json.status === "error") {
        logger.error(`${json.repository}, ${json.ref}: Finish with status: ${json.status} (ID: ${buildInfo.id})`)
        return
      } else {
        throw new Error("Not completed")
      }
    } catch (error) {
      if (attempts > maxAttempts || !buildInfo.id) {
        logger.info(`${buildInfo.repository}, ${buildInfo.ref}: did not finish after ${attempts} attempts.Aborting.Error: ${error} (ID: ${buildInfo.id})`)
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
