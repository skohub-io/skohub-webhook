/* eslint no-console: 0 */ // --> OFF
process.env.SECRET = "secret"
process.env.BUILD_URL = "http://localhost:8081/build"

const fs = require("fs-extra")
const { server } = require("../src/server")
const request = require("supertest")
const nock = require("nock")

const timeout = async (ms) => new Promise((resolve) => setTimeout(resolve, ms))

afterEach(() => {
  server.close()
})

describe("processWebhooks", () => {
  test("Should process a correct hook and create the files for a build", async () => {
    const ttlFile = await fs.readFile(`${__dirname}/data/interactivityType.ttl`)

    // Fake files url
    nock("https://fakeURL.test")
      .get("/files")
      .reply(200, [
        {
          path: "interactivityType.ttl",
          url: "https://fakeURL.test/interactivityType.ttl",
        },
      ])

    // Fake ttl file with the one in test
    nock("https://fakeURL.test")
      .get("/interactivityType.ttl")
      .reply(200, ttlFile)

    const response = await request(server)
      .post("/build")
      .send({
        ref: "refs/heads/master",
        repository: {
          full_name: "custom/test",
        },
        files_url: "https://fakeURL.test/files",
      })
      .set("x-skohub-event", "push")
      .set("x-skohub-token", "secret")
      .set("Accept", "application/json")

    expect(response.status).toEqual(202)
    console.log(response.text)
    expect(response.text.includes("Build triggered:")).toEqual(true)

    // wait for the build
    await timeout(40000)

    // Check if build log exists
    const id = /id=([a-zA-Z0-9_.-]*)/.exec(response.text.split("?")[1])[1]
    console.log(`dist/build/${id}.json`)
    const buildLogExists = await fs.pathExists(`dist/build/${id}.json`)
    expect(buildLogExists).toBe(true)

    // data folder should be empty
    const dataDirContent = (await fs.readdir("data")).filter(
      (filename) => filename !== ".gitignore"
    )
    expect(dataDirContent.length).toBe(0)

    // public folder should be deleted
    const publicDirExists = await fs.pathExists("public")
    expect(publicDirExists).toBe(false)

    // The index should be in the dist for this build
    const buildExists = await fs.pathExists(
      "dist/custom/test/heads/master/index.en.html"
    )
    expect(buildExists).toBe(true)
  }, 50000)
})