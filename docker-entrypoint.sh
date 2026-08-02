#!/bin/sh
set -eu
DATA_DIR=${DATA_DIR:-/data}
mkdir -p "$DATA_DIR"
chown node:node "$DATA_DIR"
exec su -s /bin/sh node -c 'exec node dist/index.js'
