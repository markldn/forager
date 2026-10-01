#!/usr/bin/env bash
# FORAGER — build (if node is available) and serve on 0.0.0.0:${PORT:-9050}
cd "$(dirname "$0")"
PORT=${PORT:-9050}
if command -v node >/dev/null 2>&1 && [ -z "$NO_BUILD" ]; then node build.mjs || echo "build failed — serving the last dist/"; fi
echo "FORAGER on http://0.0.0.0:$PORT/  (dev build: /dev.html)"
exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory dist
