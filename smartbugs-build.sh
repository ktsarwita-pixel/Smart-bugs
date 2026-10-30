#!/bin/bash
# Smart Bugs — Vercel build script.
#
# Used by the "smart-bugs" Vercel project (build command: `bash smartbugs-build.sh`,
# install command: `true`, output directory: `dist`). It fetches the branch source,
# installs dependencies (dev deps included — Vercel skips them when NODE_ENV=production),
# and runs the standard Vite build.
#
# NOTE: the repo copy is unpacked WITHOUT overwriting this file — bash reads the
# script lazily, so replacing it mid-run corrupts execution (syntax error at `)`).
set -euxo pipefail
curl -sSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/refs/heads/arena/f9113ba1-smart-bugs" -o repo.tgz
rm -rf repo-src
mkdir repo-src
tar xzf repo.tgz -C repo-src
(cd repo-src/Smart-bugs-* && tar cf - --exclude=smartbugs-build.sh .) | tar xf -
rm -rf repo-src repo.tgz
npm install --include=dev --no-audit --no-fund --loglevel=error
npm run build
# Private test range needs real paths: this build is single-file, and Vercel
# 404s unknown paths before the SPA router can see them (and vercel.json is
# parsed before this script runs, so rewrites added here would be ignored).
# Physical copies let /advanced and /advenced serve the app directly.
mkdir -p dist/advanced dist/advenced
cp dist/index.html dist/advanced/index.html
cp dist/index.html dist/advenced/index.html

