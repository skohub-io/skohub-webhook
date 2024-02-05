/* eslint no-console: 0 */ // --> OFF
const Koa = require("koa")
const Router = require("koa-router")
const bodyParser = require("koa-bodyparser")
const { v4: uuidv4 } = require("uuid")
const fs = require("fs-extra")
const { exec, execSync } = require("child_process")
const fetch = require("node-fetch")

// credits: https://quickref.me/strip-ansi-codes-from-a-string.html
const stripAnsiCodes = str => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

const {
  isValid,
  getRepositoryFiles,
  parseHook,
  checkStdOutForError,
} = require("./common")

const { getCurrentVocabs } = require("./commonChoreForVocabs")

require("dotenv").config()
require("colors")

const { PORT, SECRET, BUILD_URL, DOCKER_IMAGE, DOCKER_TAG, PULL_IMAGE_SECRET } =
  process.env
const app = new Koa()
const router = new Router()

const webhooks = []
let processingWebhooks = false
let buildLink

const pullImage = async () => {
  console.info(`Pull docker image: ${DOCKER_IMAGE}:${DOCKER_TAG}`)
  const build = execSync(`docker pull ${DOCKER_IMAGE}:${DOCKER_TAG}`)
  console.log(build.toString())
  console.info("Pull docker image: Done")
}

pullImage()

const getFile = async (file, repository) => {
  if (!file || !repository) {
    throw new Error("Missing parameters for getFile")
  }

  try {
    const response = await fetch(file.url)
    const data = await response.text()
    const path = `data/${repository}/`
    await fs.outputFile(`${path}${file.path}`, data)
    console.info("Created file:".green, file.path)
  } catch (error) {
    console.error(error)
  }
}

router.get("/vocabs", async (ctx) => {
  const currentVocabs = await getCurrentVocabs()
  ctx.status = 200
  ctx.body = currentVocabs

  return
})

router.post("/build", async (ctx) => {
  const { body, headers } = ctx.request

  let hook = parseHook(headers, body, SECRET)
  if (!hook) {
    console.warn("Bad request, the event header is missing")
    ctx.status = 400
    ctx.body = "Bad request, the event header is missing"
    return
  }

  // Check if the given signature is valid
  if (!hook.isSecured) {
    console.warn("Bad request, the token is incorrect")
    ctx.status = 400
    ctx.body = "Bad request, the token is incorrect"
    return
  }

  // Check if the given event is valid
  if (isValid(hook, "push")) {
    const id = uuidv4()
    const { type, repository, headers, ref, filesURL } = hook
    webhooks.push({
      id,
      body,
      repository,
      headers,
      date: new Date().toISOString(),
      status: "processing",
      log: [],
      type,
      filesURL,
      ref,
    })
    buildLink = `${BUILD_URL}?id=${id}`
    ctx.status = 202
    ctx.body = `Build triggered: ${buildLink}`
    console.log("Build triggered")
  } else {
    ctx.status = 400
    ctx.body = "Payload was invalid, build not triggered"
    console.log("Payload was invalid, build not triggered")
  }
})

router.post("/image", async (ctx) => {
  const { body, headers } = ctx.request

  let hook = parseHook(headers, body, PULL_IMAGE_SECRET)
  if (!hook) {
    console.warn("Bad request, the event header is missing")
    ctx.status = 400
    ctx.body = "Bad request, the event header is missing"
    return
  }

  // Check if the given signature is valid
  if (!hook.isSecured) {
    console.warn("Bad request, the token is incorrect")
    ctx.status = 400
    ctx.body = "Bad request, the token is incorrect"
    return
  }

  // Check if the given event is valid
  if (isValid(hook, "workflow_job")) {
    const dockerCommand = `docker pull ${DOCKER_IMAGE}:${DOCKER_TAG}`
    exec(
      dockerCommand,
      {
        encoding: "UTF-8",
        shell: "/bin/bash",
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`)
          return
        }
        stdout && console.log(`stdout: ${stdout}`)
        stderr && console.error(`stderr: ${stderr}`)
      }
    )
    ctx.status = 200
    ctx.body = `Pulling new image`
    console.log("Pulling new image")
  } else {
    ctx.status = 400
    ctx.body = "Payload was invalid, pull of new image not triggered"
    console.log("Payload was invalid, pull of new image not triggered")
  }
})

const processWebhooks = async () => {
  if (processingWebhooks === false) {
    if (webhooks.length > 0) {
      processingWebhooks = true
      console.log(`Processing`.green)
      const webhook = webhooks.shift()
      const ref = webhook.ref.replace("refs/", "")

      try {
        // Fetch urls for the repository files
        const files = await getRepositoryFiles(webhook)

        // see https://github.com/eslint/eslint/issues/12117
        // Fetch each one of the repository files
        // eslint-disable-next-line no-unused-vars
        for (const file of files) {
          await getFile({ url: file.url, path: file.path }, webhook.repository)
        }
      } catch (error) {
        // If there is an error fetching the files,
        // stop the current webhook and return
        console.error(error)
        webhook.log.push({
          date: new Date(),
          text: error.message,
          warning: true,
        })
        webhook.status = "error"
        fs.writeFile(
          `${__dirname}/../dist/build/${webhook.id}.json`,
          JSON.stringify(webhook)
        )
        processingWebhooks = false
        return
      }

      let repositoryURL = ""
      if (webhook.type === "github") {
        repositoryURL = `GATSBY_RESPOSITORY_URL=https://github.com/${webhook.repository}`
      } else if (webhook.type === "gitlab") {
        repositoryURL = `GATSBY_RESPOSITORY_URL=https://gitlab.com/${webhook.repository}`
      }

      // the folder is necessary for the build, but we don't need it in the repo all the time, so it gets deleted later
      fs.ensureDir(`${__dirname}/../public`)

      // repositoryURL is not set in tests, therefore we add it conditionally
      const dockerCommand = `
        docker run \
        -v $(pwd)/public:/app/public \
        -v $(pwd)/data:/app/data \
        -e BASEURL=/${webhook.repository}/${ref} \
        ${repositoryURL ? `-e ${repositoryURL}` : ""}  \
        ${DOCKER_IMAGE}:${DOCKER_TAG}`
      const build = exec(dockerCommand, {
        encoding: "UTF-8",
        shell: "/bin/bash",
      })
      build.stdout.on("data", (data) => {
        if (checkStdOutForError(data.toString().toLowerCase())) {
          webhook.log.push({
            date: new Date(),
            text: stripAnsiCodes(data.toString()),
            warning: true,
          })
          webhook.status = "error"
          fs.writeFile(
            `${__dirname}/../dist/build/${webhook.id}.json`,
            JSON.stringify(webhook)
          )
        }

        console.log("gatsbyLog: " + data.toString())
        webhook.log.push({
          date: new Date(),
          text: stripAnsiCodes(data.toString()),
        })

        fs.writeFile(
          `${__dirname}/../dist/build/${webhook.id}.json`,
          JSON.stringify(webhook)
        )
      })
      build.stderr.on("data", (data) => {
        console.log("gatsbyError: " + data.toString())
        if (
          !data.toString().includes("Deprecation") &&
          !data.toString().includes("warning") &&
          !data.toString().includes("lscpu") &&
          !data.toString().includes("Unable to find image") &&
          !data.toString().includes("Pulling") &&
          !data.toString().includes("Waiting") &&
          !data.toString().includes("Already exists") &&
          !data.toString().includes("Download complete") &&
          !data.toString().includes("Verifying Checksum") &&
          !data.toString().includes("Pull complete") &&
          !data.toString().includes("Digest:") &&
          !data.toString().includes("Status: Downloaded newer image")
        ) {
          webhook.log.push({
            date: new Date(),
            text: stripAnsiCodes(data.toString()),
            warning: true,
          })
          webhook.status = "error"
          fs.writeFile(
            `${__dirname}/../dist/build/${webhook.id}.json`,
            JSON.stringify(webhook)
          )
        }
      })
      build.on("exit", () => {
        try {
          fs.readdirSync(`${__dirname}/../data/`)
            .filter((filename) => filename !== ".gitignore")
            .forEach((filename) =>
              fs.removeSync(`${__dirname}/../data/${filename}`)
            )
          fs.removeSync(`${__dirname}/../dist/${webhook.repository}/${ref}/`)
          fs.moveSync(
            `${__dirname}/../public/`,
            `${__dirname}/../dist/${webhook.repository}/${ref}/`
          )
        } catch (error) {
          webhook.log.push({
            date: new Date(),
            text: error,
            warning: true,
          })
          webhook.status = "error"
          fs.writeFile(
            `${__dirname}/../dist/build/${webhook.id}.json`,
            JSON.stringify(webhook)
          )
          console.error(error)
        }
        if (webhook.status !== "error") {
          webhook.status = "complete"
          webhook.log.push({
            date: new Date(),
            text: "Build Finish",
          })
          console.info("Build Finish".yellow)
        } else {
          console.error(`Error during build, see log for details: ${buildLink}`)
        }
        fs.writeFile(
          `${__dirname}/../dist/build/${webhook.id}.json`,
          JSON.stringify(webhook)
        )
        processingWebhooks = false
      })
    }
  }
}

app.use(bodyParser()).use(router.routes()).use(router.allowedMethods())

const server = app.listen(PORT, () =>
  console.info(`⚡ Listening on localhost:${PORT}`.green)
)

// Loop to processing requests
setInterval(() => {
  processWebhooks()
}, 1)

module.exports = { server, getFile }
