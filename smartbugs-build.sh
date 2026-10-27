#!/bin/bash
# Smart Bugs — Vercel build script.
#
# Used by the "smart-bugs" Vercel project (build command: `bash smartbugs-build.sh`,
# install command: `true`, output directory: `dist`). It fetches the branch source,
# installs dependencies (dev deps included — Vercel skips them when NODE_ENV=production),
# and runs the standard Vite build.
set -euxo pipefail
curl -sSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/refs/heads/arena/f9113ba1-smart-bugs" -o repo.tgz
tar xzf repo.tgz
cp -a Smart-bugs-*/. .
rm -rf Smart-bugs-* repo.tgz
npm install --include=dev --no-audit --no-fund --loglevel=error
npm run build
