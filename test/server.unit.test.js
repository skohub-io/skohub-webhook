/* eslint no-console: 0 */ // --> OFF
process.env.SECRET = "secret"
process.env.BUILD_URL = "http://localhost:8081/build"

const fs = require("fs-extra")
const { server, getFile } = require("../src/server")
const request = require("supertest")
const nock = require("nock")
const { v4: uuidv4 } = require("uuid")

afterEach(() => {
  server.close()
})

describe("webHookServer", () => {
  test("Should return a bad request without headers or body", async () => {
    const response = await request(server).post("/build")

    expect(response.status).toEqual(400)
    expect(response.type).toEqual("text/plain")
    expect(response.text).toEqual("Bad request, the event header is missing")
  })

  test("Signature is incorrect", async () => {
    const response = await request(server)
      .post("/build")
      .send({ foo: "bar" })
      .set("x-github-event", "push")
      .set("x-hub-signature", "wrongToken")
      .set("Accept", "application/json")

    expect(response.status).toEqual(400)
    expect(response.text).toEqual("Bad request, the token is incorrect")
  })

  test("Push event is incorrect", async () => {
    process.env = Object.assign(process.env, { SECRET: "secret" })
    const response = await request(server)
      .post("/build")
      .send({ foo: "bar" })
      .set("x-github-event", "push wrong")
      .set("x-hub-signature", "sha1=52b582138706ac0c597c315cfc1a1bf177408a4d")
      .set("Accept", "application/json")

    expect(response.status).toEqual(400)
    expect(response.text).toEqual("Payload was invalid, build not triggered")
  })

  test("Payload is incorrect", async () => {
    const response = await request(server)
      .post("/build")
      .send({ foo: "bar" })
      .set("x-github-event", "push")
      .set("x-hub-signature", "sha1=52b582138706ac0c597c315cfc1a1bf177408a4d")
      .set("Accept", "application/json")

    expect(response.status).toEqual(400)
    expect(response.text).toEqual("Payload was invalid, build not triggered")
  })
})

describe("getFile", () => {
  test("Creates the file", async () => {
    const id = uuidv4()
    const cwd = process.cwd()
    process.chdir("/tmp")

    nock("https://fakeURL.test").get("/file").reply(200, { foo: "bar" })

    await getFile(
      {
        url: "https://fakeURL.test/file",
        path: "file",
      },
      id
    )
    const file = await fs.readFile(`/tmp/data/${id}/file`)
    expect(JSON.parse(file)).toStrictEqual({ foo: "bar" })
    process.chdir(cwd)
  })

  test("Should fail with missing parameters", async () => {
    await expect(getFile()).rejects.toThrow("Missing parameters for getFile")
  })
})
