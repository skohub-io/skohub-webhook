const fs = require("fs-extra")
const { readBuildDir, sortBuildInfo, checkIfBranchExists } = require("./commonChoreForVocabs.js")
const logger = require("./logger.js")
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

const cleanupVocabularies = async (dry = false) => {
  if (dry) {
    logger.info("Dry run, won't delete anything.")
  }
  const buildInfo = await readBuildDir()
  const sortedBuildInfo = sortBuildInfo(buildInfo)
  const branchesExisting = await Promise.all(sortedBuildInfo.map(b => checkIfBranchExists(b.repository, b.ref)))
  const branchesNotExisting = sortedBuildInfo.filter((_, i) => !branchesExisting[i])
  // build paths to be removed
  const filePathsToBeDeleted = branchesNotExisting.map(buildFilePaths)
  logger.info(`Will delete ${filePathsToBeDeleted.length} vocabulary branches.`)
  logger.info(`Will delete these paths (vocabularies): \n ${filePathsToBeDeleted}`)
  const fileErrors = []
  if (!dry) {
    // rm paths
    await Promise.all(filePathsToBeDeleted.map(async (p) => {
      try {
        await fs.rm(p, { recursive: true, force: false })
      } catch (error) {
        fileErrors.push([[p], error])
      }
    }))
  }
  // rm build logs of branches that are no longer existing
  // find all build logs with repository & ref == branchesNotExisting
  const buildInfoToBeDeleted = buildInfo
    .filter(b => branchesNotExisting.
      some(e => (e.repository === b.repository && e.ref === b.ref)))
  const buildInfoFilePathsToBeDeleted = buildInfoToBeDeleted.map(buildFilePathsForBuildLog)
  logger.info(`Will delete ${buildInfoToBeDeleted.length} build logs.`)
  logger.info(`Will delete these paths (build logs): \n ${buildInfoFilePathsToBeDeleted}`)
  // rm that logs
  if (!dry) {
    await Promise.all(buildInfoFilePathsToBeDeleted.map(async (p) => {
      try {
        await fs.rm(p, { recursive: true, force: false })
      } catch (error) {
        fileErrors.push([[p], error])
      }
    })
    )
  }
  if (fileErrors.length) {
    logger.info("Encoutered errors deleting:")
    fileErrors.forEach(e => {
      logger.info(`Path: ${e[0]}, error: ${e[1]}`)
    })
  }
}

const main = async () => {
  if (args.length) {
    if (args[0] === "--dry") {
      cleanupVocabularies(true)
    } else {
      throw Error("Invalid option. Pass --dry for dry run or nothing for a cleanup.")
    }
  } else {
    cleanupVocabularies(false)
  }
}

main()
