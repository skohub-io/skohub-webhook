FROM node:18.13.0-buster

# Docker install
RUN apt-get update && apt-get install --no-install-recommends -y \
       apt-transport-https \
       ca-certificates \
       curl \
       gnupg2 \
       software-properties-common
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -
RUN apt-key fingerprint 0EBFCD88
RUN add-apt-repository \
       "deb [arch=amd64] https://download.docker.com/linux/debian \
       $(lsb_release -cs) \
       stable"
RUN apt-get update && apt-get install --no-install-recommends -y docker-ce docker-ce-cli containerd.io

# Node setup and install
ENV NODE_ENV production

WORKDIR /app

RUN chown -R node:node /app

COPY --chown=node:node .env.example .env
COPY --chown=node:node . .

# don't run prepare step with husky
RUN npm pkg delete scripts.prepare

RUN npm i --only=production

ENTRYPOINT [ "/bin/bash", "entrypoint.sh" ]
CMD ["npm run start"]
