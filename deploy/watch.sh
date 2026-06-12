#!/usr/bin/env bash
# Watch the source tree and rebuild the bundle on change, so edits go
# live on trainer-haipai.ylue.de without touching the container (the
# container bind-mounts ./build, see docker-compose.yml).
# No root needed:
#   bash /opt/Riichi-Trainer/deploy/watch.sh
#
# Polls every 2s (inotify-tools not installed on this host). The site
# updates as soon as `npm run build` finishes, roughly 30-60s per change.
set -euo pipefail
cd /opt/Riichi-Trainer

# react-scripts 3.4.4 / webpack 4 needs this on Node >= 17.
export NODE_OPTIONS=--openssl-legacy-provider

STAMP=$(mktemp /tmp/riichi-trainer-watch.XXXXXX)
trap 'rm -f "$STAMP"' EXIT

echo "Initial build..."
npm run build
echo "Watching src/ public/ package.json for changes (Ctrl-C to stop)..."

while true; do
    sleep 2
    if [ -n "$(find src public package.json -newer "$STAMP" -print -quit)" ]; then
        # Stamp before building so edits made mid-build trigger another run.
        touch "$STAMP"
        echo "Change detected at $(date '+%H:%M:%S'), rebuilding..."
        if npm run build; then
            echo "Live at $(date '+%H:%M:%S')."
        else
            echo "BUILD FAILED -- site still serves the previous bundle."
        fi
    fi
done
