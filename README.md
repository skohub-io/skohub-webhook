# SkoHub Webhook

A webhook server that allows triggering the build SKOS vocabularies to nice HTML pages with a basic lookup API using [SkoHub Vocabs](https://github.com/skohub-io/skohub-vocabs). The build can be triggered from GitHub or GitLab. For usage & implementation details see the [blog post](https://blog.lobid.org/2019/09/27/presenting-skohub-vocabs.html).

## Prerequisites

- **Docker** installed on the host (the daemon the service talks to).
- **Node.js 22** on the host (matches `.nvmrc`); [nvm](https://github.com/nvm-sh/nvm) is recommended.
- A dedicated service user (e.g. `skohub`) that is a member of the **`docker` group**.

## Set up

    git clone https://github.com/skohub-io/skohub-webhook.git
    cd skohub-webhook
    cp .env.example .env


The `.env` file contains configuration details used by the static site generator and the webhook server:

- `PORT`: Port the application should use
- `SECRET`: The secret that needs to be provided when triggering the webhook
- `BUILD_URL`: URL of the build page. This URL with a specific ID for each build can be used to retrieve information about success or errors of a triggered build. 
- `VOCABS_URL`: URL under which the dist folder is served. Usually the same as `BUILD_URL` but without `/build`.
- `DOCKER_IMAGE`: The docker image which should be used to build the vocabulary, defaults to `skohub/skohub-vocabs-docker`
- `DOCKER_TAG`: The docker tag for the `DOCKER_IMAGE`, defaults to `latest`
- `PULL_IMAGE_SECRET`: The secret needed for the `/image` endpoint to trigger the pull of new images via webhook.
- `GITHUB_TOKEN`: In order to avoid api rate limits when using GitHub, provide a personal access token.
- `REBUILD_MAX_ATTEMPTS`: Max attempts trying to check the build status of the vocabulary. The build status is checked every 2 seconds, so 30 attempts make 60 seconds of waiting for the build status.

## How does it work?

### `/build`

The webhook server is based on Koa and exposes a `build` endpoint listening to a `POST`-request.
When a request is reveived and the SECRET matches, a build is triggered.
This will make use of the `skohub-vocabs-docker` image (or some other image you defined in `.env`) and build HTML pages out of the provided SKOS files.
The resulting pages are then copied to the `dist` directory, while using the repository and ref informations to build the paths to avoid paths conflicts (e.g. `dist/sroertgen/test-vocabs/heads/main`).
This directory can then be served from a webserver like Apache.

### `/image`

The webhook server pulls the in `.env` defined image when it starts.
To always build with the most recent image, you can trigger the `image` endpoint with a `POST`-request.
The request is triggered by a GitHub Webhook when the [`docker` workflow_job](https://github.com/skohub-io/skohub-vocabs/blob/master/.github/workflows/main.yml) completes.
You can set up the webhook in the skohub-vocabs repo and choose "Workflow jobs" as event type.
The secret has to match the `PULL_IMAGE_SECRET` from `.env`.

### `/vocabs`

Returns a list of vocabularies that are currently served, e.g.

```json
[
	{
		"repository": "test/test-vocabs",
		"vocabulary": "http://localhost:8000/test/test-vocabs/heads/main/",
		"date": "2024-02-01T08:59:36.730Z"
	}
]
```

### How does it work in detail?

The webhook server runs **directly on the host** as a systemd service. On each valid hook, it runs `docker run … skohub/skohub-vocabs-docker` against the **host Docker daemon** — a sibling container, not a nested one. It bind-mounts `./public` and `./data` (resolved as host paths because the service's `WorkingDirectory` is the repo root), then moves the built site into `dist/<repository>/<ref>/`.

The build container is started with `--user $(id -u):$(id -g)`, i.e. as the **service user**. This matters: the `skohub/skohub-vocabs-docker` image is built to run as its baked-in `node` user (uid 1000). If the container ran as that user but our service user has a different uid, the files written into `public/` would be owned by uid 1000, and on the *next* build the service user could not delete the previous output (`EACCES` while removing `dist/<repository>/<ref>/`). Running the container as the service user makes all build output service-user-owned, so rebuilds always succeed regardless of which uid the service user has.

> **Image requirement:** `--user` only works with a **uid-agnostic** image — one whose npm/Gatsby caches live in a writable location and whose `/app` is writable by an arbitrary uid. The stock `skohub/skohub-vocabs-docker` image is *not* uid-agnostic yet (it hardcodes `HOME=/home/node` and an unwritable npm cache); running it as a foreign uid fails the build. Publish the patched image **before** deploying a webhook with `--user`. See the companion change in the [skohub-vocabs](https://github.com/skohub-io/skohub-vocabs) repo.

## Running the webhook server

The webhook server is managed by systemd. Follow the runbook below to set it up on the host.

### Systemd setup

```bash
# As root, on the host:
useradd --system --create-home --shell /bin/bash skohub
usermod -aG docker skohub

git clone https://github.com/skohub-io/skohub-webhook.git /opt/skohub-webhook
chown -R skohub:skohub /opt/skohub-webhook

# Install nvm for the service user (the service unit sources $HOME/.nvm/nvm.sh).
# Skip if Node 22 is already on PATH for the skohub user by other means.
sudo -u skohub bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'

sudo -u skohub bash -lc 'cd /opt/skohub-webhook && nvm install 22 && npm ci --omit=dev'
sudo -u skohub cp /opt/skohub-webhook/.env.example /opt/skohub-webhook/.env   # then edit secrets

# Create required directories owned by the service user:
sudo -u skohub mkdir -p /opt/skohub-webhook/{data,public,dist/build}

ln -s /opt/skohub-webhook/skohub-webhook.service /etc/systemd/system/skohub-webhook.service
systemctl daemon-reload
systemctl enable --now skohub-webhook.service
journalctl -u skohub-webhook -f
```

In order to wire this up with GitHub, the webhook endpoint has to be available to the public. You can then configure the webhook in your GitHub repositories settings:

![image](https://user-images.githubusercontent.com/149825/62695510-c756b880-b9d6-11e9-86a9-0c4dcd6bc2cd.png)

To restart the service after a `git pull`:

```bash
cd /opt/skohub-webhook && sudo -u skohub npm ci --omit=dev
sudo systemctl restart skohub-webhook.service
```

### Migrating from the Docker-in-Docker setup

Two separate things caused `EACCES` (issues #34 and #36); both must be handled.

1. **Legacy root-owned trees (one-time).** If the server previously ran the DinD setup, the existing `dist/`, `public/`, and `data/` directories may be owned by root (created inside the old container). Reclaim them once:

```bash
# One-time: fixes EACCES from root-owned dirs left behind by the old DinD container.
sudo chown -R skohub:skohub /opt/skohub-webhook/dist /opt/skohub-webhook/public /opt/skohub-webhook/data
sudo systemctl restart skohub-webhook
```

2. **Ongoing build output ownership (every build).** The chown above only fixes the *old* directories. New builds still produce output owned by whoever the build container runs as. This is handled by running the container as the service user (`--user`, see [How does it work in detail?](#how-does-it-work-in-detail)) **together with** a uid-agnostic `skohub/skohub-vocabs-docker` image. If you deploy this webhook against the unpatched stock image, builds will fail; publish the patched image first.

## Rebuilding vocabularies

**Notice:**

During the rebuild of all hosted vocabularies, the service might make a lot of requests to the GitHub Api.
Depending on the number of hosted vocabularies, you might run into API rate limits.
To avoid this you can provide a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) in `.env` file (see above).
You also might want to increase the number of `REBUILD_MAX_ATTEMPTS` (to something like 300 or 3000), because rebuilds might take some time, depending on your machine, network, number of vocabularies etc.

**Note:** These commands talk to the running webhook server via `BUILD_URL` (configured in `.env`); make sure the `skohub-webhook` service is active before running them.

To rebuild all vocabularies:

1. Make a backup of the dist-folder: `cp -R ./dist ./dist-backup`
1. Run the rebuild as the service user:

```bash
sudo -u skohub bash -lc 'cd /opt/skohub-webhook && npm run rebuild-vocabs'
```

To rebuild only a specific vocabulary you can provide the GitHub repository and the branch to build:

```bash
sudo -u skohub bash -lc 'cd /opt/skohub-webhook && npm run rebuild-vocabs -- test/test-vocabs main'
```

## Cleaning up vocabularies

From time to time you might want to clean up the `dist` folder and the build logs.
Since we build vocabuilaries for every branch, but do not get notified when a branch is deleted, a regular cleanup is sensible.
To clean up we provide a cleanup script that checks for still active branches on GitHub for currently served vocabularies by parsing the build logs.
If the branch does not exist anymore the respective folder will be removed from `dist` and the build logs will be cleaned up as well.

To clean up do this:

1. Make a backup of the dist-folder: `cp -R ./dist ./dist-backup`
2. Do a dry run first and check the output:

```bash
sudo -u skohub bash -lc 'cd /opt/skohub-webhook && npm run cleanup-dist:dry'
```

3. Cleanup, if everything looks ok:

```bash
sudo -u skohub bash -lc 'cd /opt/skohub-webhook && npm run cleanup-dist'
```


## Connecting to our webhook server

Feel free to clone https://github.com/literarymachine/skos.git to poke around. Go to https://github.com/YOUR_GITHUB_USER/skos/settings/hooks/new to set up the web hook (get in touch to receive the secret). Edit https://github.com/YOUR_GITHUB_USER/skos/edit/master/hochschulfaecher.ttl and commit the changes to master. This will trigger a build and expose it at https://test.skohub.io/YOUR_GITHUB_USER/skos/w3id.org/class/hochschulfaecher/scheme.

## Use start scripts and monit (legacy)

*For legacy reasons these scripts are still there to start the server manually and directly run node.*
You may want to use the start scripts in `scripts/` to manage via init and to monitor with `monit`.

## Development

### Tests

Run unit tests with `npm run test:unit`.
Run integration tests with `npm run test:int`.
Run both with `npm run test`.

To test the docker setup, set `SECRET=ThisIsATest` in `.env` and make sure Docker is available on the host.
Start the server in one terminal:

```bash
npm start
```

Then run the docker test script in a separate terminal:

```bash
npm run test:docker
```

### Test the `/build` endpoint

Here is an example Curl to test the build endpoint with `SECRET=ThisIsATest`:

```bash
curl --request POST \
  --url http://localhost:3000/build \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'x-github-event: push' \
  --header 'x-github-token: ThisIsATest' \
  --header 'x-hub-signature: sha1=76cf6b20692888081b4e7e2e3cc57c7dbe034049' \
  --data '{
  "ref": "refs/heads/main",
  "repository": {
    "full_name": "sroertgen/test-vocabs"
  }
}'
```

### Test the `/image` endpoint

Here is an example Curl to test the image endpoint with `PULL_IMAGE_SECRET=ThisIsATest`:

```bash
curl --request POST \
  --url http://localhost:3000/image \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'x-github-event: workflow_job' \
  --header 'x-github-token: ThisIsATest' \
  --header 'x-hub-signature: sha1=4f7bf1daf9b62eb38c568ed17d3371917cbc565f' \
  --data '{
  "action": "completed",
	"repository": {
		"full_name": "test/testing"
	},
	"ref": "refs/heads/master",
	"workflow_job": "docker"
}'

```

## Web server

In order to publish the webhook endpoints and the resulting vocabs we recommend a reverse-proxy setup using the Apache web server. Here is an example configuration:

```
# Reverse proxy
<VirtualHost *:443>
    ServerName your.domain
    [...]

    RewriteEngine On

    RewriteRule (.*)/images/(.*)           http://10.0.0.1/$1/images/$2 [P,L]
    
    RewriteCond %{REQUEST_METHOD} "=POST"
    RewriteRule ^/build(.*)           http://10.0.0.1:3000/build$1 [P,L]
    RewriteRule ^/image$           http://10.0.0.1:3000/image [P,L]

    ProxyPass / http://10.0.0.1/
    ProxyPassReverse / http://10.0.0.1/
    ProxyRequests Off

</VirtualHost>
```

```
# Backend server 10.0.0.1
<VirtualHost *:80>
    [...]

    DocumentRoot /opt/skohub-webhook/dist   
 
    <Directory "/opt/skohub-webhook/dist">
       DirectoryIndex index
       Header set Access-Control-Allow-Origin "*"
       Options Indexes FollowSymlinks Multiviews
       AddType text/index .index
       AddType application/ld+json .json
       AllowOverride All
       Require all granted
    </Directory>

</VirtualHost>
```

## Credits

The project to create a stable beta version of SkoHub has been funded by the North-Rhine Westphalian Library Service Centre (hbz) and carried out in cooperation with [graphthinking GmbH](https://graphthinking.com/) in 2019/2020.

<a target="_blank" href="https://www.hbz-nrw.de"><img src="https://raw.githubusercontent.com/skohub-io/skohub.io/master/img/logo-hbz-color.svg" width="120px"></a>
