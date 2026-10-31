#!/bin/bash
# Build the published game from its last production commit and the current
# session branch separately. Vercel routes /?advenced to the latter.
set -euxo pipefail
ROOT="$PWD"
mkdir -p repo-preview repo-public
curl -fsSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/refs/heads/arena/9fb9b0ed-smart-bugs" | tar xz --strip-components=1 -C repo-preview
curl -fsSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/723715b" | tar xz --strip-components=1 -C repo-public
for dir in repo-preview repo-public; do
  (cd "$ROOT/$dir" && npm install --include=dev --no-audit --no-fund --loglevel=error && npm run build)
done
rm -rf dist
mkdir -p dist/preview dist/advanced dist/advenced
# Static files take precedence over Vercel rewrites at /. Route the test
# query before the public bundle executes; keep the public bundle unchanged.
node <<'JSROUTE'
const fs = require("fs");
const html = fs.readFileSync("repo-public/dist/index.html", "utf8");
const router = "<script>if(new URLSearchParams(location.search).has('advenced'))location.replace('/preview/'+location.search+location.hash);</script>";
fs.writeFileSync("dist/index.html", html.replace("<head>", "<head>" + router));
JSROUTE
cp repo-public/dist/index.html dist/advanced/index.html
cp repo-public/dist/index.html dist/advenced/index.html
cp repo-preview/dist/index.html dist/preview/index.html
