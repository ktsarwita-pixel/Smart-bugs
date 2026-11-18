#!/usr/bin/env bash
# Publish one bundle to every door. Vercel's existing project runs this script
# with a no-op install command. A file-based deploy supplies an exact Git SHA
# in smartbugs-release-ref, then builds that checkout rather than a moving ref.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SOURCE="$ROOT"
if [[ ! -f "$ROOT/package-lock.json" ]]; then
  if [[ ! -f "$ROOT/smartbugs-release-ref" ]]; then
    echo 'No source or smartbugs-release-ref supplied' >&2
    exit 1
  fi
  REF="$(cat "$ROOT/smartbugs-release-ref")"
  if [[ ! "$REF" =~ ^[a-f0-9]{40}$ ]]; then
    echo 'smartbugs-release-ref must contain an exact Git commit SHA' >&2
    exit 1
  fi
  SOURCE="$WORK/source"
  mkdir -p "$SOURCE"
  echo "building Smart-bugs commit $REF"
  curl -fsSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/$REF" | tar xz --strip-components=1 -C "$SOURCE"
fi

(cd "$SOURCE" && npm ci --include=dev --no-audit --no-fund --loglevel=error && npm run build)
cp "$SOURCE/dist/index.html" "$WORK/game.html"

mkdir -p "$ROOT/dist/preview" "$ROOT/dist/advanced" "$ROOT/dist/advenced"
# Static hosts honor the same test door even without Vercel's redirect.
GAME_HTML="$WORK/game.html" OUTPUT_HTML="$ROOT/dist/index.html" node <<'JSROUTE'
const fs = require("node:fs");
const html = fs.readFileSync(process.env.GAME_HTML, "utf8");
const router = "<script>if(new URLSearchParams(location.search).has('advenced'))location.replace('/preview/'+location.search+location.hash);</script>";
fs.writeFileSync(process.env.OUTPUT_HTML, html.replace("<head>", "<head>" + router));
JSROUTE
cp "$WORK/game.html" "$ROOT/dist/preview/index.html"
cp "$WORK/game.html" "$ROOT/dist/advanced/index.html"
cp "$WORK/game.html" "$ROOT/dist/advenced/index.html"

FINGERPRINT="$(sha256sum "$WORK/game.html" | cut -c1-16)"
echo "bundle $FINGERPRINT (one build, every path)"
