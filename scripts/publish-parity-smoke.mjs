import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';

/**
 * Publish parity check — "every advanced-server update also ships to the
 * original server".
 *
 * The rule is enforced by construction in `smartbugs-build.sh`: one
 * `npm run build`, whose single output bundle is copied to `/`, `/preview/`,
 * `/advanced` and `/advenced`. Only the original entry gets the `?advenced`
 * query router. This script proves the rule actually holds on the built output,
 * so a future edit cannot quietly give the original server its own stale build.
 */
const GAME_PATHS = {
  original: 'dist/index.html',
  preview: 'dist/preview/index.html',
  advanced: 'dist/advanced/index.html',
  advenced: 'dist/advenced/index.html',
};
const ROUTER = "<script>if(new URLSearchParams(location.search).has('advenced'))location.replace('/preview/'+location.search+location.hash);</script>";

// ── The build script must build and fetch exactly once ────────────────────
const script = readFileSync('smartbugs-build.sh', 'utf8');
// Comments describe the policy on purpose; only executable lines are counted.
const code = script.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
const count = (needle) => script.split(needle).length - 1;
const countCode = (needle) => code.split(needle).length - 1;
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
assert.equal(countCode('npm run build'), 1, 'the publish script must build exactly one bundle');
assert.equal(countCode('npm ci'), 1, 'the publish script must install exactly once');
assert.equal(countCode('codeload.github.com'), 1, 'only the branch itself may be downloaded - no second, pinned build');
assert.doesNotMatch(script, /PUBLIC_COMMIT|723715b/, 'the old pinned public build is gone for good');
for (const path of ['dist/preview', 'dist/advanced', 'dist/advenced']) {
  assert.ok(script.includes(path), `the publish script must still write ${path}`);
}

// ── Build if the output is not there yet (CI and a fresh clone) ───────────
if (!Object.values(GAME_PATHS).every((file) => existsSync(file))) {
  execFileSync('bash', ['smartbugs-build.sh'], {stdio: 'inherit'});
}

const bundles = {};
for (const [name, file] of Object.entries(GAME_PATHS)) {
  assert.ok(existsSync(file), `${file} is missing from the published output`);
  bundles[name] = readFileSync(file, 'utf8');
}

// ── The original entry is the test bundle plus the router, nothing else ───
const originalWithRouter = bundles.original.split(ROUTER);
assert.equal(originalWithRouter.length, 2, 'the original entry carries the ?advenced router exactly once');
assert.equal(occurrences(bundles.original, ROUTER), 1, 'the router must not be duplicated');
assert.ok(bundles.original.includes('<head>'), 'the original entry is still the built game document');
assert.equal(
  originalWithRouter.join(''),
  bundles.preview,
  'the original server must serve byte-identical game code to the test server',
);

// ── Every alias ships the same bytes ─────────────────────────────────────
for (const name of ['advanced', 'advenced']) {
  assert.equal(bundles[name], bundles.preview, `${GAME_PATHS[name]} must serve the same bundle as /preview/`);
  assert.ok(!bundles[name].includes(ROUTER), 'only the original entry gets the query router');
}

// ── One fingerprint, printed once, so a human can eyeball the publish ─────
const digest = createHash('sha256').update(bundles.preview).digest('hex').slice(0, 16);
assert.ok(bundles.preview.includes('id="root"'), 'the bundle really is the game shell');
assert.ok(bundles.preview.length > 500_000, 'the bundle really contains the inlined game');

console.log(
  `publish-parity: PASS (one build feeds /, /preview/, /advanced and /advenced; bundle ${digest})`,
);
