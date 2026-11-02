#!/usr/bin/env bash
# POLICY: every update published to the advanced/test server is published to
# the original server in the SAME build. There is exactly one `npm run build`
# below; its output is copied to `/`, `/preview/`, `/advanced` and `/advenced`.
# The URL only decides whether the ADVANCED TEST BUILD banner and the test-only
# visuals switch on (`isAdvancedGameLocation`), so let `isTestBuildLocation`
# own the banner and keep the screens identical everywhere.
# `npm run test:publish` and `npm run test:ui-default` fail if that drifts.
#
# This recipe works in both deployment shapes:
#   - full source uploaded            -> builds the uploaded checkout in place
#   - only this file + vercel.json    -> downloads the branch from codeload
#     first (Vercel's GitHub app is not connected to this project, so
#     git-triggered builds fail with git_info_fail; the two-file deployment
#     carries the branch ref inside this script instead).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PREVIEW_REF="${PREVIEW_REF:-refs/heads/arena/ec287bd6-smart-bugs}"

cd "$ROOT"
PREVIEW_SRC="$ROOT"
if [ ! -f package.json ] || [ ! -f package-lock.json ]; then
  echo "no source in this deployment - fetching $PREVIEW_REF"
  mkdir -p "$WORK/preview"
  curl -fsSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/$PREVIEW_REF" | tar xz --strip-components=1 -C "$WORK/preview"
  PREVIEW_SRC="$WORK/preview"
fi

# Vercel's install command is intentionally a no-op; install exactly the lockfile.
(cd "$PREVIEW_SRC" && npm ci --include=dev --no-audit --no-fund --loglevel=error && npm run build)
cp "$PREVIEW_SRC/dist/index.html" "$WORK/game.html"

rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist/preview" "$ROOT/dist/advanced" "$ROOT/dist/advenced"
# Static files take precedence over Vercel's query redirect, so `/` gets the
# existing router: a bare visit loads the v0.7 game, `?advenced` hands off to
# /preview/ where the test banner lives. Everything ships the same bundle.
GAME_HTML="$WORK/game.html" OUTPUT_HTML="$ROOT/dist/index.html" node <<'JSROUTE'
const fs = require("fs");
const html = fs.readFileSync(process.env.GAME_HTML, "utf8");
const router = "<script>if(new URLSearchParams(location.search).has('advenced'))location.replace('/preview/'+location.search+location.hash);</script>";
fs.writeFileSync(process.env.OUTPUT_HTML, html.replace("<head>", "<head>" + router));
JSROUTE
cp "$WORK/game.html" "$ROOT/dist/preview/index.html"
cp "$WORK/game.html" "$ROOT/dist/advanced/index.html"
cp "$WORK/game.html" "$ROOT/dist/advenced/index.html"

# One fingerprint for the whole publish: if these ever differ, the original
# server has drifted from the test server and the release must not be promoted.
FINGERPRINT="$(sha256sum "$WORK/game.html" | cut -c1-16)"
echo "bundle $FINGERPRINT (one build, every path)"
echo "  /            original server - v$(sed -n 's/.*version: "\([^"]*\)".*/\1/p' "$PREVIEW_SRC/src/game/data.ts" | head -1) + query router"
echo "  /preview/    test server     - same bundle, ADVANCED banner on"
echo "  /advanced, /advenced         - same bundle"
