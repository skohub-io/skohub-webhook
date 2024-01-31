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

const cleanupVocabularies = async (dry = false) => {
  if (dry) {
    console.log("Dry run, won't delete anything.")
  }
  const buildInfo = await readBuildDir()
  const sortedBuildInfo = sortBuildInfo(buildInfo)
  const branchesExisting = await Promise.all(sortedBuildInfo.map(b => checkIfBranchExists(b.repository, b.ref)))
  const branchesNotExisting = sortedBuildInfo.filter((_, i) => !branchesExisting[i])
  // console.log(branchesNotExisting)
  // build paths to be removed
  const filePathsToBeDeleted = branchesNotExisting.map(buildFilePaths)
  console.log("Will delete ", filePathsToBeDeleted.length, "vocabulary branches.")
  console.log("Will delete these paths (vocabularies): \n", filePathsToBeDeleted)
  const fileErrors = []
  if (!dry) {
    // rm paths
    await Promise.all(filePathsToBeDeleted.map(async (p) => {
      try {
        await fs.rm(p, { recursive: true, force: false })
      } catch (error) {
        console.log("caught")
        console.error(error)
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
  console.log("Will delete ", buildInfoToBeDeleted.length, "build logs.")
  console.log("Will delete these paths (build logs): \n", buildInfoFilePathsToBeDeleted)
  // rm that logs
  if (!dry) {
    await Promise.all(buildInfoFilePathsToBeDeleted.map(async (p) => {
      try {
        await fs.rm(p, { recursive: true, force: false })
      } catch (error) {
        console.log("caught")
        console.error(error)
        fileErrors.push([[p], error])
      }
    })
    )
  }
  if (fileErrors.length) {
    console.log("Encoutered errors deleting:")
    fileErrors.forEach(e => {
      console.log(`Path: ${e[0]}, error: ${e[1]}`)
    })
  }
}

const main = async () => {
  if (args.length) {
    console.log(args[0])
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
