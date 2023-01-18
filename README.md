# SkoHub Webhook

A webhook server that allows triggering the build SKOS vocabularies to nice HTML pages with a basic lookup API using [SkoHub Vocabs](https://github.com/skohub-io/skohub-vocabs). The build can be triggered from GitHub or GitLab. For usage & implementation details see the [blog post](https://blog.lobid.org/2019/09/27/presenting-skohub-vocabs.html)
## Prerequisites

- We use docker for building the vocabs, so make sure to have it installed (https://docs.docker.com/get-docker/)
- We also use node to run the webhook:

### Install Node.js

We currently support Node >= 18.
#### Windows

Download and install the latest Node.js version from [the official Node.js website]( https://nodejs.org/en/).

#### Unix

[Install the lastest nvm version](https://github.com/nvm-sh/nvm#installing-and-updating).

Set default Node.js version. When nvm is installed, it does not default to a particular node version. You’ll need to install the version you want and give nvm instructions to use it.
See [here](https://github.com/nvm-sh/nvm#bash) to automatically switch to the correct node version (not necessary, but handy).

```
nvm install 18
nvm use 18
```

## Set up

    $ git clone https://github.com/skohub-io/skohub-webhook.git
    $ cd skohub-webhook
    $ npm i
    $ cp .env.example .env

The `.env` file contains configuration details used by the static site generator and the webhook server:

- `PORT`: Port the application should use
- `SECRET`: The secret that needs to be provided when triggering the webhook
- `BUILD_URL`: URL of the build page. This URL with a specific ID for each build can be used to retrieve information about success or errors of a triggered build. 
- `SKOHUB_VOCABS_TAG`: The docker tag which should be used to build the vocabulary, defaults to `latest`

## How does it work?

The webhook server is based on Koa and exposes a `build` endpoint listening to a `POST`-request.
When a request is reveived and the SECRET matches, a build is triggered.
This will make use of the `skohub-vocabs-docker` image and build HTML pages out of the provided SKOS files.
The resulting pages are then copied from a temporary `public` directory to the `dist` directory, while using the repository and ref informations to build the paths to avoid paths conflicts (e.g. `dist/sroertgen/test-vocabs/heads/main`).
This directory can then be served from a webserver like Apache.

## Running the webhook server

The webhook server allows to trigger a build when vocabularies are updated (i.e. changes are merged into the `main` branch) on GitHub.

Running `npm run start` will start the server on the defined `PORT` and expose a `build` endpoint. In order to wire this up with GitHub, this has to be available to the public. You can then configure the webhook in your GitHub repositories settings:

![image](https://user-images.githubusercontent.com/149825/62695510-c756b880-b9d6-11e9-86a9-0c4dcd6bc2cd.png)


## Connecting to our webhook server

Feel free to clone https://github.com/literarymachine/skos.git to poke around. Go to https://github.com/YOUR_GITHUB_USER/skos/settings/hooks/new to set up the web hook (get in touch to receive the secret). Edit https://github.com/YOUR_GITHUB_USER/skos/edit/master/hochschulfaecher.ttl and commit the changes to master. This will trigger a build and expose it at https://test.skohub.io/YOUR_GITHUB_USER/skos/w3id.org/class/hochschulfaecher/scheme.

## Use start scripts and monit

You may want to use the start scripts in `scripts/` to manage via init and to monitor with `monit`.

## Credits

The project to create a stable beta version of SkoHub has been funded by the North-Rhine Westphalian Library Service Centre (hbz) and carried out in cooperation with [graphthinking GmbH](https://graphthinking.com/) in 2019/2020.

<a target="_blank" href="https://www.hbz-nrw.de"><img src="https://raw.githubusercontent.com/skohub-io/skohub.io/master/img/logo-hbz-color.svg" width="120px"></a>
