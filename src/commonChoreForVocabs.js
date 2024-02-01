const fs = require("fs-extra")
const path = require('path');
const { gitHubApiHeaders } = require("./common.js")
const types = require("./types.js")
const logger = require("./logger.js")
require("dotenv").config()

const { VOCABS_URL } = process.env


/** get all json data from dist/build folder
  * @returns {types.BuildInfo[]} 
  */
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
    logger.error(`Error: ${err}`);
    throw err;
  }
}

/**
 * Create an array only containing the most recent webhook requests
 * @param {types.BuildInfo[]} buildInfo
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
        // console.log(`${repository}/${branchName} exists!`);
        return true
      } else {
        logger.error(`Branch "${branchName}" does not exist.`);
        return false
      }
    })
    .catch(error => {
      logger.error(`Fetch error for repo ${repository} and branch ${branchName}, ${error}`);
      return false
    });
  return result
}

const getCurrentVocabs = async () => {
  const buildInfo = await readBuildDir()
  const sortedBuildInfo = sortBuildInfo(buildInfo).filter(b => b.status === "complete")
  const currentVocabs = sortedBuildInfo.map(b => {
    return {
      repository: b.repository,
      vocabulary: `${VOCABS_URL.endsWith("/") ? VOCABS_URL : VOCABS_URL + "/"}${b.repository}/${b.ref.replace("refs/", "")}/`,
      date: b.date,
    }
  })
  return currentVocabs
}

module.exports = {
  readBuildDir,
  sortBuildInfo,
  checkIfBranchExists,
  getCurrentVocabs
}
