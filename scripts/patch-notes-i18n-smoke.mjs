import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * Patch notes check — no browser needed.
 *
 * Every release card is rendered through `t()`, so a note without an Indonesian
 * entry silently falls back to English and the whole modal looks half
 * translated. This asserts that literally every title and every bullet has a
 * translation, that the newest card is the shipped version, and that the
 * Indonesian modal really paints the translated copy.
 */
const bundled = await build({
  stdin: {
    contents: `
      export {VERSIONS, PatchNotesModal} from "./src/components/PatchNotesModal";
      export {SettingsProvider, hasTranslation, translate} from "./src/i18n";
      export {GAME_INFO} from "./src/game/data";
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
    sourcefile: 'patch-notes-entry.tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: {'.css': 'empty'},
  define: {'process.env.NODE_ENV': '"production"'},
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  outfile: 'ignored-smoke/patch-notes-entry.js',
  write: true,
});
assert.equal(bundled.errors.length, 0);
process.on('exit', () => rmSync('ignored-smoke', {recursive: true, force: true}));

const {VERSIONS, PatchNotesModal, SettingsProvider, hasTranslation, translate, GAME_INFO} =
  await import(pathToFileURL('ignored-smoke/patch-notes-entry.js').href);

// ── The newest card is the version the build claims to be ─────────────────
assert.equal(VERSIONS[0].v, GAME_INFO.version, 'the top patch-notes card must match GAME_INFO.version');
assert.equal(GAME_INFO.version, '0.7', 'the shipped build is v0.7');

const seen = new Set();
for (const entry of VERSIONS) {
  assert.ok(!seen.has(entry.v), `duplicate patch-notes card for v${entry.v}`);
  seen.add(entry.v);
  assert.ok(entry.items.length > 0, `v${entry.v} has no notes`);
  assert.equal(new Set(entry.items).size, entry.items.length, `v${entry.v} repeats a note`);
}

// ── The Damage Shower notes live in the current card ──────────────────────
const current = VERSIONS[0];
for (const marker of ['DAMAGE SHOWER chart', 'SHOW ENEMY DAMAGE', 'credited to the bug that caused it']) {
  assert.ok(
    current.items.some((item) => item.includes(marker)),
    `the current card should carry the "${marker}" note`,
  );
}

// ── Every note, in every card, is translated ──────────────────────────────
const untranslated = [];
for (const entry of VERSIONS) {
  if (!hasTranslation(entry.title)) untranslated.push(`v${entry.v} title: "${entry.title}"`);
  for (const item of entry.items) {
    if (!hasTranslation(item)) untranslated.push(`v${entry.v} note: "${item.slice(0, 60)}…"`);
  }
}
assert.deepEqual(untranslated, [], `untranslated patch notes:\n${untranslated.join('\n')}`);

// A translation identical to the English source is a silent miss too.
const identical = VERSIONS.flatMap((entry) =>
  entry.items.filter((item) => translate(item, 'id') === item),
);
assert.deepEqual(identical, [], 'these notes have no real Indonesian translation');

// ── The Indonesian modal actually paints the translation ──────────────────
{
  globalThis.localStorage = {
    getItem: (k) => (k === 'smartbugs.settings' ? JSON.stringify({lang: 'id', rev: 2}) : null),
    setItem: () => {},
    removeItem: () => {},
  };
  const html = renderToStaticMarkup(
    createElement(SettingsProvider, null, createElement(PatchNotesModal, {open: true, onClose: () => {}})),
  );
  assert.match(html, /v0\.7/, 'the current card renders');
  assert.match(html, /Dokter UI kini berbicara dalam bahasamu/, 'the Doctor note is translated');
  assert.match(html, /panel kesehatan yang pas dengan relnya/, 'the ladder-fit note is translated');
  assert.doesNotMatch(html, /DAMAGE SHOWER chart in the battle telemetry dock/, 'no English note text in the Indonesian modal');
  assert.match(html, /Grafik STATISTIK DAMAGE baru di panel telemetri tempur/, 'the Damage Shower note is translated');
  assert.match(html, /STATISTIK DAMAGE/, 'the chart name is translated in the copy');
}

console.log(`patch-notes-i18n: PASS (${VERSIONS.length} cards, ${VERSIONS.reduce((n, v) => n + v.items.length + 1, 0)} strings, all translated)`);
