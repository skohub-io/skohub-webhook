#!/bin/bash

# start docker daemon
dockerd > /var/log/dockerd.log 2>&1 &

# add node to docker group
usermod -aG docker node

# execute command as node user
exec su node -c "$@"
