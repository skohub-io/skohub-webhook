/* eslint no-console: 0 */
process.env.SECRET = "secret"
process.env.BUILD_URL = "http://localhost:8081/build"
process.env.DOCKER_IMAGE = "skohub/skohub-vocabs-docker"
process.env.DOCKER_TAG = "test"

// Mock child_process before requiring the server. Both exec (used for the
// build) and execSync (used by pullImage at module load) are stubbed.
// Variable name MUST start with `mock` to satisfy jest.mock factory hoisting.
const mockBuildState = { current: null }
jest.mock("child_process", () => {
  const { EventEmitter } = require("events")
  return {
    exec: jest.fn(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      mockBuildState.current = child
      return child
    }),
    execSync: jest.fn(() => Buffer.from("")),
  }
})

// Stub fs-extra writes/moves/reads so the exit handler doesn't need a real
// docker build output on disk. We capture the last-written webhook JSON.
const mockWriteState = { last: null }
jest.mock("fs-extra", () => {
  const actual = jest.requireActual("fs-extra")
  return {
    ...actual,
    writeFile: jest.fn((file, contents, cb) => {
      mockWriteState.last = JSON.parse(contents)
      if (cb) cb(null)
      return Promise.resolve()
    }),
    ensureDir: jest.fn(() => Promise.resolve()),
    readdirSync: jest.fn(() => [".gitignore"]),
    removeSync: jest.fn(),
    moveSync: jest.fn(),
    outputFile: jest.fn(() => Promise.resolve()),
    pathExists: jest.fn(() => Promise.resolve(false)),
  }
})

// Stub getRepositoryFiles so we don't hit the network.
jest.mock("../src/common", () => {
  const actual = jest.requireActual("../src/common")
  return {
    ...actual,
    getRepositoryFiles: jest.fn(() => Promise.resolve([])),
  }
})

const { server } = require("../src/server")
const request = require("supertest")

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Wait until the global processWebhooks setInterval has invoked exec()
// for our queued webhook and mockBuildState.current is populated.
const waitForBuildToStart = async (timeoutMs = 2000) => {
  const start = Date.now()
  while (mockBuildState.current === null && Date.now() - start < timeoutMs) {
    await wait(20)
  }
  if (mockBuildState.current === null) {
    throw new Error("Build never started")
  }
}

const triggerBuild = async () => {
  const response = await request(server)
    .post("/build")
    .send({
      ref: "refs/heads/master",
      repository: { full_name: "owner/repo" },
      files_url: "https://example.invalid/files",
    })
    .set("x-skohub-event", "push")
    .set("x-skohub-token", "secret")
    .set("Accept", "application/json")
  expect(response.status).toBe(202)
}

beforeEach(() => {
  mockBuildState.current = null
  mockWriteState.last = null
})

afterAll(() => {
  server.close()
})

describe("processWebhooks build status", () => {
  test("Build with exit code 0 results in status=complete, even when stdout contains 'ERROR UNKNOWN'", async () => {
    await triggerBuild()
    await waitForBuildToStart()

    // Simulate Gatsby printing the punycode deprecation warning, which Gatsby
    // formats with an "ERROR UNKNOWN" prefix. Pre-fix this would have been
    // misclassified as a build error.
    mockBuildState.current.stdout.emit(
      "data",
      "ERROR UNKNOWN \n(node:77) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.\n"
    )

    // Build process exits successfully.
    mockBuildState.current.emit("exit", 0)

    // Give the exit handler a tick to write the final JSON.
    await wait(50)

    expect(mockWriteState.last).not.toBeNull()
    expect(mockWriteState.last.status).toBe("complete")
  })

  test("Build with non-zero exit code results in status=error", async () => {
    await triggerBuild()
    await waitForBuildToStart()

    mockBuildState.current.emit("exit", 1)
    await wait(50)

    expect(mockWriteState.last).not.toBeNull()
    expect(mockWriteState.last.status).toBe("error")
    // The exit-code log entry should be present.
    expect(
      mockWriteState.last.log.some((entry) =>
        typeof entry.text === "string" &&
        entry.text.includes("exited with code 1")
      )
    ).toBe(true)
  })
})
