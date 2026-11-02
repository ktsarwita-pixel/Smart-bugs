import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync, rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * "The original server shows the updated UI too" — no browser needed.
 *
 * v0.7 publishes one bundle to `/` and `/preview/`, but the interface used to be
 * selected at runtime: without `?advenced` (or the `/preview/` path) the app
 * rendered the legacy screens, so the original server still looked old even
 * though it served the new version. `isAdvancedGameLocation` now always returns
 * true; only the ADVANCED TEST BUILD banner is still URL-dependent.
 */
const bundled = await build({
  stdin: {
    contents: `
      export {isAdvancedGameLocation, isTestBuildLocation} from "./src/game/build-mode";
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
    sourcefile: 'ui-default-entry.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  define: {'process.env.NODE_ENV': '"production"'},
  outfile: 'ignored-ui-default/ui-default-entry.mjs',
  write: true,
});
assert.equal(bundled.errors.length, 0);
process.on('exit', () => rmSync('ignored-ui-default', {recursive: true, force: true}));
const {isAdvancedGameLocation, isTestBuildLocation} =
  await import(pathToFileURL('ignored-ui-default/ui-default-entry.mjs').href);

// ── The modern UI renders on every door ──────────────────────────────────
const DOORS = [
  {label: 'original server', location: {pathname: '/', search: ''}},
  {label: 'original + query', location: {pathname: '/', search: '?advenced=1'}},
  {label: 'test server', location: {pathname: '/preview/', search: ''}},
  {label: 'test server + query', location: {pathname: '/preview/', search: '?advenced=1'}},
  {label: 'advanced alias', location: {pathname: '/advanced', search: ''}},
  {label: 'typo alias', location: {pathname: '/advenced', search: ''}},
];
for (const door of DOORS) {
  assert.equal(
    isAdvancedGameLocation(door.location),
    true,
    `the updated interface must render at ${door.label}`,
  );
}

// ── Only the banner stays tied to the test URL ───────────────────────────
assert.equal(isTestBuildLocation({pathname: '/', search: ''}), false, 'the original server shows no test banner');
assert.equal(isTestBuildLocation({pathname: '/', search: '?advenced=1'}), true, '?advenced is the test door');
assert.equal(isTestBuildLocation({pathname: '/preview/', search: ''}), true, '/preview/ is the test door');
assert.equal(isTestBuildLocation({pathname: '/preview', search: ''}), true, '/preview without the slash counts too');
assert.equal(isTestBuildLocation({pathname: '/advanced', search: ''}), false, 'the alias is not a banner door');

// ── The app must actually use those two decisions ────────────────────────
const app = readFileSync('src/App.tsx', 'utf8');
assert.match(app, /const advancedGame = isAdvancedGameLocation\(window\.location\);/, 'the UI flag comes from the shared helper');
const roots = app.match(/advancedGame \? "advanced-ui " : ""/g) || [];
assert.ok(roots.length >= 5, `every screen root must carry the updated UI class (found ${roots.length})`);
assert.match(app, /isTestBuildLocation\(window\.location\) && \(/, 'the banner must use the test-door helper');
assert.doesNotMatch(
  app,
  /new URLSearchParams\(window\.location\.search\)\.has\("advenced"\)/,
  'no screen may still sniff ?advenced to choose its layout',
);

// ── Guard the CSS so the modern rules are not scoped to the test door ────
const css = readFileSync('src/index.css', 'utf8');
assert.ok((css.match(/\.advanced-ui/g) || []).length > 40, 'the updated styles are still the .advanced-ui set');
assert.doesNotMatch(css, /html\[data-advanced=/, 'the styles must not depend on a per-URL attribute');

console.log(
  `ui-default: PASS (updated interface on /, /preview/, /advanced and /advenced; only the banner is URL-gated)`,
);
