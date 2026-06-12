#!/usr/bin/env bash
# Rebuild and (re)start the Riichi-Trainer container.
# Run this after a `git pull` to ship new code. No root needed (docker group).
#   bash /opt/Riichi-Trainer/deploy/build.sh
set -euo pipefail
cd /opt/Riichi-Trainer
docker compose up -d --build
echo "Container is up on 127.0.0.1:8485"
docker compose ps
