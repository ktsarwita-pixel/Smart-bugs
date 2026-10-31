#!/usr/bin/env bash
# Publish two independent bundles: the original remains at the pinned public
# commit, while /?advenced is built from this checkout (the test branch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PUBLIC_COMMIT="723715b"

# Vercel's install command is intentionally a no-op; install exactly the lockfile
# for both projects here. The test build must not fetch a different branch.
cd "$ROOT"
npm ci --include=dev --no-audit --no-fund --loglevel=error
npm run build
cp dist/index.html "$WORK/preview.html"

mkdir "$WORK/public"
curl -fsSL "https://codeload.github.com/ktsarwita-pixel/Smart-bugs/tar.gz/$PUBLIC_COMMIT" | tar xz --strip-components=1 -C "$WORK/public"
(cd "$WORK/public" && npm ci --include=dev --no-audit --no-fund --loglevel=error && npm run build)

rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist/preview" "$ROOT/dist/advanced" "$ROOT/dist/advenced"
# Static files can take precedence over Vercel's query redirect. Preserve the
# existing fallback router in the public HTML; the public game itself remains
# the pinned build and does not include any test-build visual changes.
PUBLIC_HTML="$WORK/public/dist/index.html" OUTPUT_HTML="$ROOT/dist/index.html" node <<'JSROUTE'
const fs = require("fs");
const html = fs.readFileSync(process.env.PUBLIC_HTML, "utf8");
const router = "<script>if(new URLSearchParams(location.search).has('advenced'))location.replace('/preview/'+location.search+location.hash);</script>";
fs.writeFileSync(process.env.OUTPUT_HTML, html.replace("<head>", "<head>" + router));
JSROUTE
cp "$WORK/public/dist/index.html" "$ROOT/dist/advanced/index.html"
cp "$WORK/public/dist/index.html" "$ROOT/dist/advenced/index.html"
cp "$WORK/preview.html" "$ROOT/dist/preview/index.html"
