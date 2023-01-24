/* eslint no-console: 0 */ // --> OFF
process.env.SECRET = "ThisIsATest"
process.env.BUILD_URL = "http://localhost:8081/build"

const fs = require("fs-extra")
// const { server } = require("../src/server")
// const request = require("supertest")
const nock = require("nock")

const timeout = async (ms) => new Promise((resolve) => setTimeout(resolve, ms))


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

    const payload = JSON.stringify(
      {
        "ref": "refs/heads/main",
        "before": "cf8bbf83563e1d534204643771ebe91c6698e88f",
        "after": "fa4b1e75e67a066dacedf8537fcc4af54ad90b16",
        "repository": {
          "id": 568709917,
          "node_id": "R_kgDOIeXTHQ",
          "name": "test-vocabs",
          "full_name": "sroertgen/test-vocabs",
          "private": false,
          "owner": {
            "name": "sroertgen",
            "email": "sroertgen@gmail.com",
            "login": "sroertgen",
            "id": 18149685,
            "node_id": "MDQ6VXNlcjE4MTQ5Njg1",
            "avatar_url": "https://avatars.githubusercontent.com/u/18149685?v=4",
            "gravatar_id": "",
            "url": "https://api.github.com/users/sroertgen",
            "html_url": "https://github.com/sroertgen",
            "followers_url": "https://api.github.com/users/sroertgen/followers",
            "following_url": "https://api.github.com/users/sroertgen/following{/other_user}",
            "gists_url": "https://api.github.com/users/sroertgen/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/sroertgen/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/sroertgen/subscriptions",
            "organizations_url": "https://api.github.com/users/sroertgen/orgs",
            "repos_url": "https://api.github.com/users/sroertgen/repos",
            "events_url": "https://api.github.com/users/sroertgen/events{/privacy}",
            "received_events_url": "https://api.github.com/users/sroertgen/received_events",
            "type": "User",
            "site_admin": false
          },
          "html_url": "https://github.com/sroertgen/test-vocabs",
          "description": "For testing vocabs and workflows around skohub development",
          "fork": false,
          "url": "https://github.com/sroertgen/test-vocabs",
          "forks_url": "https://api.github.com/repos/sroertgen/test-vocabs/forks",
          "keys_url": "https://api.github.com/repos/sroertgen/test-vocabs/keys{/key_id}",
          "collaborators_url": "https://api.github.com/repos/sroertgen/test-vocabs/collaborators{/collaborator}",
          "teams_url": "https://api.github.com/repos/sroertgen/test-vocabs/teams",
          "hooks_url": "https://api.github.com/repos/sroertgen/test-vocabs/hooks",
          "issue_events_url": "https://api.github.com/repos/sroertgen/test-vocabs/issues/events{/number}",
          "events_url": "https://api.github.com/repos/sroertgen/test-vocabs/events",
          "assignees_url": "https://api.github.com/repos/sroertgen/test-vocabs/assignees{/user}",
          "branches_url": "https://api.github.com/repos/sroertgen/test-vocabs/branches{/branch}",
          "tags_url": "https://api.github.com/repos/sroertgen/test-vocabs/tags",
          "blobs_url": "https://api.github.com/repos/sroertgen/test-vocabs/git/blobs{/sha}",
          "git_tags_url": "https://api.github.com/repos/sroertgen/test-vocabs/git/tags{/sha}",
          "git_refs_url": "https://api.github.com/repos/sroertgen/test-vocabs/git/refs{/sha}",
          "trees_url": "https://api.github.com/repos/sroertgen/test-vocabs/git/trees{/sha}",
          "statuses_url": "https://api.github.com/repos/sroertgen/test-vocabs/statuses/{sha}",
          "languages_url": "https://api.github.com/repos/sroertgen/test-vocabs/languages",
          "stargazers_url": "https://api.github.com/repos/sroertgen/test-vocabs/stargazers",
          "contributors_url": "https://api.github.com/repos/sroertgen/test-vocabs/contributors",
          "subscribers_url": "https://api.github.com/repos/sroertgen/test-vocabs/subscribers",
          "subscription_url": "https://api.github.com/repos/sroertgen/test-vocabs/subscription",
          "commits_url": "https://api.github.com/repos/sroertgen/test-vocabs/commits{/sha}",
          "git_commits_url": "https://api.github.com/repos/sroertgen/test-vocabs/git/commits{/sha}",
          "comments_url": "https://api.github.com/repos/sroertgen/test-vocabs/comments{/number}",
          "issue_comment_url": "https://api.github.com/repos/sroertgen/test-vocabs/issues/comments{/number}",
          "contents_url": "https://api.github.com/repos/sroertgen/test-vocabs/contents/{+path}",
          "compare_url": "https://api.github.com/repos/sroertgen/test-vocabs/compare/{base}...{head}",
          "merges_url": "https://api.github.com/repos/sroertgen/test-vocabs/merges",
          "archive_url": "https://api.github.com/repos/sroertgen/test-vocabs/{archive_format}{/ref}",
          "downloads_url": "https://api.github.com/repos/sroertgen/test-vocabs/downloads",
          "issues_url": "https://api.github.com/repos/sroertgen/test-vocabs/issues{/number}",
          "pulls_url": "https://api.github.com/repos/sroertgen/test-vocabs/pulls{/number}",
          "milestones_url": "https://api.github.com/repos/sroertgen/test-vocabs/milestones{/number}",
          "notifications_url": "https://api.github.com/repos/sroertgen/test-vocabs/notifications{?since,all,participating}",
          "labels_url": "https://api.github.com/repos/sroertgen/test-vocabs/labels{/name}",
          "releases_url": "https://api.github.com/repos/sroertgen/test-vocabs/releases{/id}",
          "deployments_url": "https://api.github.com/repos/sroertgen/test-vocabs/deployments",
          "created_at": 1669020401,
          "updated_at": "2022-11-22T09:47:20Z",
          "pushed_at": 1671542583,
          "git_url": "git://github.com/sroertgen/test-vocabs.git",
          "ssh_url": "git@github.com:sroertgen/test-vocabs.git",
          "clone_url": "https://github.com/sroertgen/test-vocabs.git",
          "svn_url": "https://github.com/sroertgen/test-vocabs",
          "homepage": null,
          "size": 82,
          "stargazers_count": 0,
          "watchers_count": 0,
          "language": "Shell",
          "has_issues": true,
          "has_projects": true,
          "has_downloads": true,
          "has_wiki": true,
          "has_pages": false,
          "has_discussions": false,
          "forks_count": 0,
          "mirror_url": null,
          "archived": false,
          "disabled": false,
          "open_issues_count": 0,
          "license": null,
          "allow_forking": true,
          "is_template": false,
          "web_commit_signoff_required": false,
          "topics": [
      
          ],
          "visibility": "public",
          "forks": 0,
          "open_issues": 0,
          "watchers": 0,
          "default_branch": "main",
          "stargazers": 0,
          "master_branch": "main"
        },
        "pusher": {
          "name": "sroertgen",
          "email": "sroertgen@gmail.com"
        },
        "sender": {
          "login": "sroertgen",
          "id": 18149685,
          "node_id": "MDQ6VXNlcjE4MTQ5Njg1",
          "avatar_url": "https://avatars.githubusercontent.com/u/18149685?v=4",
          "gravatar_id": "",
          "url": "https://api.github.com/users/sroertgen",
          "html_url": "https://github.com/sroertgen",
          "followers_url": "https://api.github.com/users/sroertgen/followers",
          "following_url": "https://api.github.com/users/sroertgen/following{/other_user}",
          "gists_url": "https://api.github.com/users/sroertgen/gists{/gist_id}",
          "starred_url": "https://api.github.com/users/sroertgen/starred{/owner}{/repo}",
          "subscriptions_url": "https://api.github.com/users/sroertgen/subscriptions",
          "organizations_url": "https://api.github.com/users/sroertgen/orgs",
          "repos_url": "https://api.github.com/users/sroertgen/repos",
          "events_url": "https://api.github.com/users/sroertgen/events{/privacy}",
          "received_events_url": "https://api.github.com/users/sroertgen/received_events",
          "type": "User",
          "site_admin": false
        },
        "created": false,
        "deleted": false,
        "forced": false,
        "base_ref": null,
        "compare": "https://github.com/sroertgen/test-vocabs/compare/cf8bbf83563e...fa4b1e75e67a",
        "commits": [
          {
            "id": "fa4b1e75e67a066dacedf8537fcc4af54ad90b16",
            "tree_id": "dfbd9212ac3114f83323d9f05fdb225e865f8204",
            "distinct": true,
            "message": "Trigger build",
            "timestamp": "2022-12-20T14:22:59+01:00",
            "url": "https://github.com/sroertgen/test-vocabs/commit/fa4b1e75e67a066dacedf8537fcc4af54ad90b16",
            "author": {
              "name": "@s.roertgen",
              "email": "sroertgen@gmail.com",
              "username": "sroertgen"
            },
            "committer": {
              "name": "@s.roertgen",
              "email": "sroertgen@gmail.com",
              "username": "sroertgen"
            },
            "added": [
      
            ],
            "removed": [
      
            ],
            "modified": [
              "hcrt.ttl"
            ]
          }
        ],
        "head_commit": {
          "id": "fa4b1e75e67a066dacedf8537fcc4af54ad90b16",
          "tree_id": "dfbd9212ac3114f83323d9f05fdb225e865f8204",
          "distinct": true,
          "message": "Trigger build",
          "timestamp": "2022-12-20T14:22:59+01:00",
          "url": "https://github.com/sroertgen/test-vocabs/commit/fa4b1e75e67a066dacedf8537fcc4af54ad90b16",
          "author": {
            "name": "@s.roertgen",
            "email": "sroertgen@gmail.com",
            "username": "sroertgen"
          },
          "committer": {
            "name": "@s.roertgen",
            "email": "sroertgen@gmail.com",
            "username": "sroertgen"
          },
          "added": [
      
          ],
          "removed": [
      
          ],
          "modified": [
            "hcrt.ttl"
          ]
        }
      })
    const response = await fetch("http://localhost:3000/build", {
      method: "POST",
      body: payload,
      headers: {
        "x-github-event": "push",
        "x-github-token": "ThisIsATest",
        "x-hub-signature": "sha1=5ce3beac0084cdaef7adb1669888260dd9bbfb70",
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
    })
    const res = await response.text()
    expect(response.status).toEqual(202)
    expect(res.includes("Build triggered:")).toEqual(true)

    // wait for the build
    await timeout(40000)

    // Check if build log exists
    const id = /id=([a-zA-Z0-9_.-]*)/.exec(res.split("?")[1])[1]
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
