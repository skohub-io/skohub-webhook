const fs = require("fs-extra")
const { readBuildDir, sortBuildInfo, checkIfBranchExists } = require("./commonChoreForVocabs.js")
const args = process.argv.slice(2);
const types = require("./types.js")

/**
  * @param {types.BuildInfo} buildInfo
  */
const buildFilePaths = (buildInfo) => {
  return "dist" + "/" + buildInfo.repository + "/" + buildInfo.ref.split("/").slice(1,).join("/")
}

/**
  * @param {types.BuildInfo} buildInfo
  */
const buildFilePathsForBuildLog = (buildInfo) => {
  return "dist/build/" + buildInfo.id + ".json"
}

const main = async () => {
  if (args.length) {
    // TODO make a dry run option
  } else {
    const buildInfo = await readBuildDir()
    const sortedBuildInfo = sortBuildInfo(buildInfo)
    const branchesExisting = await Promise.all(sortedBuildInfo.map(b => checkIfBranchExists(b.repository, b.ref)))
    const branchesNotExisting = sortedBuildInfo.filter((_, i) => !branchesExisting[i])
    // console.log(branchesNotExisting)
    // build paths to be removed
    const filePathsToBeDeleted = branchesNotExisting.map(buildFilePaths)
    console.log(filePathsToBeDeleted)
    // rm paths
    filePathsToBeDeleted.forEach(p => {
      try {
        fs.rm(p, { recursive: true, force: true })
      } catch (error) {
        console.error(error)
      }
    })
    // rm build logs of branches that are no longer existing
    // find all build logs with repository & ref == branchesNotExisting
    const buildInfoToBeDeleted = buildInfo
      .filter(b => branchesNotExisting.
        some(e => (e.repository === b.repository && e.ref === b.ref)))
    console.log(buildInfoToBeDeleted.length)
    // rm that logs
    const buildInfoFilePathsToBeDeleted = buildInfoToBeDeleted.map(buildFilePathsForBuildLog)
    console.log(buildInfoFilePathsToBeDeleted)
    buildInfoFilePathsToBeDeleted.forEach(p => {
      try {
        fs.rm(p, { recursive: true, force: true })
      } catch (error) {
        console.error(error)
      }
    })
  }
}

main()
