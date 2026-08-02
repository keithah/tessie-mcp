#!/bin/sh
set -eu
mkdir -p /data
chown node:node /data
exec su -s /bin/sh node -c 'exec node dist/index.js'
