# SkoHub Webhook

A webhook server that allows triggering the build SKOS vocabularies to nice HTML pages with a basic lookup API using [SkoHub Vocabs](https://github.com/skohub-io/skohub-vocabs). The build can be triggered from GitHub or GitLab. For usage & implementation details see the [blog post](https://blog.lobid.org/2019/09/27/presenting-skohub-vocabs.html).
## Prerequisites

- We use docker for building the vocabs, so make sure to have it installed (https://docs.docker.com/get-docker/)
- We use sysbox to safley run docker in docker. Make sure you have it installed: https://github.com/nestybox/sysbox

## Set up

    $ git clone https://github.com/skohub-io/skohub-webhook.git
    $ cd skohub-webhook
    $ cp .env.example .env

The `.env` file contains configuration details used by the static site generator and the webhook server:

- `PORT`: Port the application should use
- `SECRET`: The secret that needs to be provided when triggering the webhook
- `BUILD_URL`: URL of the build page. This URL with a specific ID for each build can be used to retrieve information about success or errors of a triggered build. 
- `DOCKER_IMAGE`: The docker image which should be used to build the vocabulary, defaults to `skohub/skohub-vocabs-docker`
- `DOCKER_TAG`: The docker tag for the `DOCKER_IMAGE`, defaults to `latest`
- `PULL_IMAGE_SECRET`: The secret needed for the `/image` endpoint to trigger the pull of new images via webhook.

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

### How does it work in detail?

The webhook server is started via the `docker-compose.yml` with a simple `docker compose up`.
The [Sysbox](https://github.com/nestybox/sysbox) runtime is used to safley run docker in docker.
This is necessary, because the webhook server starts the docker image of [`skohub-vocabs`](https://hub.docker.com/r/skohub/skohub-vocabs-docker/tags) to build the vocabularies, when it got triggered.
We also bind mount the `.env` file to pass environment variables and the `dist`-folder.
When a webhook is received and valid, the webhook server executes a docker run command where it bind mounts the received turtle files into the container and at the end copies the built vocabularies from the public folder to the dist folder with the above mentioned path construction.
The `images` volume is used to save the downloaded docker images, so the are persisted during restarts.

## Running the webhook server

The webhook server allows to trigger a build when vocabularies are updated (i.e. changes are merged into the `main` branch) on GitHub.

Running `docker compose up` will start the server on the defined `PORT` and expose the `/build` and `/image` endpoints.
Add `-d` flag to run in detached mode.
Use `docker compose logs` to see the logs (add `-f` to follow).
In order to wire this up with GitHub, this has to be available to the public. You can then configure the webhook in your GitHub repositories settings:

![image](https://user-images.githubusercontent.com/149825/62695510-c756b880-b9d6-11e9-86a9-0c4dcd6bc2cd.png)

## Restarting or Rebuilding the webhook server

To restart and rebuild the service, e.g. after a `git pull` do `docker compose up --build --force-recreate`.

## Rebuilding all vocabularies

To rebuild all vocabularies:

1. Make a backup of the dist-folder: `cp -R ./dist ./dist-backup`
1. Make sure to have built docker image:  `docker build -t skohub-webhook .`
1. Then mount the dist folder of the webhook container and rebuilt the vocabs: `docker run --network=host -v ./dist:/app/dist skohub-webhook:latest "npm run rebuild-vocabs"`

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

To test the docker setup change the secret in `.env` to `SECRET=ThisIsATest`
Then start the service with `docker compose up`.
Run the test script in a separate terminal with `npm run test:docker`.

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
