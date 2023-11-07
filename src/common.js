const crypto = require("crypto")
const fetch = require("node-fetch")

const getHookGitHub = (headers, payload, SECRET) => {
  const obj = {
    type: "github",
    isPush: (headers && headers["x-github-event"] === "push") || false,
    isCompletedWorkflowJob:
      (headers &&
        headers["x-github-event"] === "workflow_job" &&
        payload?.action === "completed" &&
        payload.workflow_job.name === "docker") ||
      false,
    repository: payload?.repository?.full_name ?? null,
    isSecured:
      (headers &&
        headers["x-hub-signature"] &&
        isSecured(headers["x-hub-signature"], payload, SECRET)) ||
      false,
    ref: (payload && payload.ref) || null,
    headers,
  }
  obj.headers && (obj.headers["x-hub-signature"] = "*******************") // Delete token for report
  return obj
}

const getHookGitLab = (headers, payload, SECRET) => {
  const obj = {
    type: "gitlab",
    isPush: /Push Hook$/.test(headers && headers["x-gitlab-event"]),
    repository: payload?.project?.path_with_namespace ?? null,
    isSecured:
      (headers &&
        headers["x-gitlab-token"] &&
        headers["x-gitlab-token"] === SECRET) ||
      false,
    ref: (payload && payload.ref) || null,
    headers,
  }
  obj.headers && (obj.headers["x-gitlab-token"] = "*******************") // Delete token for report
  return obj
}

const getHookSkoHub = (headers, payload, SECRET) => {
  const obj = {
    type: "skohub",
    isPush: (headers && headers["x-skohub-event"] === "push") || false,
    repository: payload?.repository?.full_name ?? null,
    isSecured:
      (headers &&
        headers["x-skohub-token"] &&
        headers["x-skohub-token"] === SECRET) ||
      false,
    ref: (payload && payload.ref) || null,
    filesURL: (payload && payload.files_url) || null,
    headers,
  }
  obj.headers && (obj.headers["x-skohub-token"] = "*******************") // Delete token for report
  return obj
}

const isValid = (hook, event) => {
  const { isPush, isCompletedWorkflowJob, repository, ref } = hook

  if (event === "push") {
    return (
      isPush === true && // Only accept push request
      repository !== null &&
      /^[^/]+\/[^/]+$/.test(repository) && // Has a valid repository
      ref !== null &&
      /^refs\/heads|tags\/[^/]+$/.test(ref)
    ) // Has a valid ref
  } else if (event === "workflow_job") {
    return (
      isCompletedWorkflowJob === true && // Only accept completed workflow job
      repository !== null &&
      /^[^/]+\/[^/]+$/.test(repository) // Has a valid repository
    )
  }
  return false
}

const isSecured = (signature, payload, SECRET) => {
  // Is not secured if all the parameters are not present
  if (!signature || !payload || !SECRET) {
    return false
  }

  const hmac = crypto.createHmac("sha1", SECRET)
  const digest = "sha1=" + hmac.update(JSON.stringify(payload)).digest("hex")
  if (signature === digest) {
    return true
  }
  // eslint-disable-next-line no-console
  console.warn("Invalid signature", signature, digest)
  return false
}

const getRepositoryFiles = async ({ type, repository, ref, filesURL }) => {
  let url
  let getLinks
  let links
  ref = ref.replace(
    /refs\/(heads|tags)\//,
    ""
  )

  if (type === "github") {
    links = await fetchTTLFilesFromGitHubRepository(repository, "", ref)
  }

  if (type === "gitlab") {
    url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(
      repository
    )}/repository/tree?ref=${ref}`
    getLinks = formatGitLabFiles
    links = getLinks(await (await fetch(url)).json(), repository, ref)
  }

  if (type === "skohub") {
    url = filesURL
    getLinks = (files) => files
    links = getLinks(await (await fetch(url)).json(), repository, ref)
  }

  return verifyFiles(links)
}

async function fetchTTLFilesFromGitHubRepository(repository, path = '', ref = '') {
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${path}?` + new URLSearchParams({
    ref: ref
  }));
  const contents = await response.json();
  let ttlFiles = formatGitHubFiles(contents)
  const subDirectories = contents.filter(file => file.type === 'dir');
  for (const directory of subDirectories) {
    const subFiles = await fetchTTLFilesFromGitHubRepository(repository, directory.path, ref);
    ttlFiles = ttlFiles.concat(subFiles);
  }
  return ttlFiles;
}


const formatGitHubFiles = (files) => {
  if (files.message) {
    throw new Error(files.message)
  }

  return files
    .filter((file) => file.name.endsWith(".ttl"))
    .map((file) => {
      return {
        path: file.path,
        url: file.download_url,
      }
    })
}

const formatGitLabFiles = (files, repository, ref) => {
  if (files.message) {
    throw new Error(files.message)
  }

  return files
    .filter((file) => file.name.endsWith(".ttl"))
    .map((file) => {
      return {
        path: file.path,
        url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(
          repository
        )}/repository/files/${file.path}/raw?ref=${ref}`,
      }
    })
}

const verifyFiles = (files) => {
  if (files.every((file) => file.path && file.url)) {
    return files
  } else {
    throw Error("Malformed custom files")
  }
}

const getHeaders = (hub, self, path) =>
  `Header set Link "<${hub}>; rel=\\"hub\\", <${self}>; rel=\\"self\\"" "expr=%{REQUEST_URI} =~ m|${path}|"`

const parseHook = (headers, body, secret) => {
  if (headers["x-github-event"]) {
    return getHookGitHub(headers, body, secret)
  } else if (headers["x-gitlab-event"]) {
    return getHookGitLab(headers, body, secret)
  } else if (headers["x-skohub-event"]) {
    return getHookSkoHub(headers, body, secret)
  } else {
    return
  }
}

function checkStdOutForError(text) {
  // SHACL Warning message
  if (text.includes("-----------warning--------------")) {
    return false
  } else if (text.includes("error")) {
    return true
  }
}


module.exports = {
  getHeaders,
  getHookGitHub,
  getHookGitLab,
  getHookSkoHub,
  isValid,
  isSecured,
  getRepositoryFiles,
  parseHook,
  checkStdOutForError
}
