FROM node:22-bookworm-slim

# Install prerequisites
RUN apt-get update && apt-get install --no-install-recommends -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker GPG key
RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
RUN echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker CLI
RUN apt-get update && apt-get install --no-install-recommends -y \
    docker-ce \
    docker-ce-cli \
    containerd.io

# Node setup and install
ENV NODE_ENV=production

WORKDIR /app

RUN chown -R node:node /app

COPY --chown=node:node .env.example .env
COPY --chown=node:node . .

RUN npm config set update-notifier false
RUN npm install --omit=dev

ENTRYPOINT ["/bin/bash", "entrypoint.sh"]
CMD ["npm run start"]
