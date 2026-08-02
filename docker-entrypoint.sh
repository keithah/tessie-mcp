#!/bin/sh
set -eu
DATA_DIR=${DATA_DIR:-/data}
mkdir -p "$DATA_DIR"
exec node dist/index.js
