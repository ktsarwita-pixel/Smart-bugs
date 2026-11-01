import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync, rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * UI Doctor language check — no browser needed.
 *
 * The Doctor is a developer tool, so its copy was written inline in English and
 * never routed through the translator: with Bahasa Indonesia selected, opening
 * the panel (or running DEEP SCAN, which adds finding rows) still printed
 * English. Both source files now pass every string through `t()`/`tf()`, and
 * this asserts that:
 *   1. every diagnostic literal in the Doctor has an Indonesian entry,
 *   2. every entry really is Indonesian (no sentence falls back to English),
 *   3. the mounted panel paints Indonesian chrome under the ID locale,
 *   4. `auditVisuals`/`watchVisuals` keep their exact English wording when no
 *      translator is supplied (harnesses and the copied EN report rely on it).
 */
const bundled = await build({
  stdin: {
    contents: `
      export {UiDoctor} from "./src/components/UiDoctor";
      export {SettingsProvider, hasTranslation, translate, fill} from "./src/i18n";
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
    sourcefile: 'ui-doctor-entry.tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: {'.css': 'empty'},
  define: {'process.env.NODE_ENV': '"production"'},
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  outfile: 'ignored-doctor-smoke/ui-doctor-entry.js',
  write: true,
});
assert.equal(bundled.errors.length, 0);
process.on('exit', () => rmSync('ignored-doctor-smoke', {recursive: true, force: true}));

const {UiDoctor, SettingsProvider, hasTranslation, translate, fill} =
  await import(pathToFileURL('ignored-doctor-smoke/ui-doctor-entry.js').href);

// ── 1. every literal in the Doctor files is translatable ──────────────────
const sources = ['src/components/UiDoctor.tsx', 'src/game/ui-visual-audit.ts'];
const literals = new Set();
for (const file of sources) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\btf?\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    literals.add(match[1].replace(/\\(["\\])/g, '$1'));
  }
}
assert.ok(literals.size >= 140, `expected the Doctor to declare its whole vocabulary, found ${literals.size}`);

// Report line shape: only the placeholders, so both languages print it the same.
const SAME_IN_BOTH = new Set(['FPS', 'horizontal {px}px', 'vertical {px}px', '[{severity}] {kind} {label}: {detail}']);
const untranslated = [...literals].filter((key) => !SAME_IN_BOTH.has(key) && !hasTranslation(key));
assert.deepEqual(untranslated, [], `these Doctor strings have no Indonesian entry: ${untranslated.join(' | ')}`);

// ── 2. no entry is just the English sentence again ────────────────────────
const ENGLISH_MARKERS = [
  /\bthe\b/i, /\bis\b/i, /\bare\b/i, /\bwas\b/i, /\bwere\b/i, /\bhas\b/i, /\bhave\b/i,
  /\bthis\b/i, /\bthat\b/i, /\bwith\b/i, /\bfrom\b/i, /\bwhile\b/i, /\bduring\b/i,
  /\bmissing\b/i, /\bclipped\b/i, /\bfound\b/i, /\bscan\b/i, /\bchecked\b/i, /\bwarnings?\b/i,
];
const copyOfEnglish = [];
for (const key of literals) {
  if (SAME_IN_BOTH.has(key)) continue;
  const id = translate(key, 'id');
  if (id === key) copyOfEnglish.push(key);
  else {
    // Placeholder names ({warnings}, {controls}, …) are code, not copy.
    const prose = id.replace(/\{[a-z]+\}/gi, ' ');
    const leaked = ENGLISH_MARKERS.filter((rule) => rule.test(prose));
    assert.deepEqual(leaked.map(String), [], `Indonesian copy still reads as English: "${id}"`);
  }
}
assert.deepEqual(copyOfEnglish, [], `these Doctor strings are identical in both languages: ${copyOfEnglish.join(' | ')}`);

// ── 3. the mounted panel speaks Indonesian ────────────────────────────────
// Minimal browser-ish globals: the Doctor reads storage for its opt-in flag and
// the advanced-build check for its visibility, nothing else runs before paint.
const store = new Map([['smartbugs.settings', JSON.stringify({lang: 'id', rev: 2})]]);
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.location = {pathname: '/preview/', search: '?advenced=1&doctor=1'};
globalThis.window = {
  location: globalThis.location,
  addEventListener() {}, removeEventListener() {}, matchMedia: () => ({matches: false}),
  innerWidth: 390, innerHeight: 844,
};

function mount(lang) {
  store.set('smartbugs.settings', JSON.stringify({lang, rev: 2}));
  return renderToStaticMarkup(
    createElement(SettingsProvider, null, createElement(UiDoctor, null)),
  );
}

const idPanel = mount('id');
assert.match(idPanel, /aria-label="Buka Dokter UI"/, 'the Doctor badge must announce itself in Indonesian');
assert.doesNotMatch(idPanel, /aria-label="Open UI Doctor"/, 'the English badge label leaked through');

const enPanel = mount('en');
assert.match(enPanel, /aria-label="Open UI Doctor"/, 'English must still be available');

// The panel body is behind an opt-in toggle in component state, so prove the
// same copy through the translator the panel uses at runtime.
const panelCopy = [
  'SCAN SCREEN', 'DEEP SCAN', 'WATCHING…', 'COPY REPORT', 'CLEAR HISTORY', 'Full report',
  'No issues found in the visible area.', 'Copied', 'Copy unavailable — select the report below',
  'Screen changed during the scan — please scan again.',
  'Visual observation failed — try scanning again.',
  'This control is no longer on screen. Scan again.',
  'Touch, visual & animation diagnostics', 'Touch & scroll diagnostics',
];
for (const copy of panelCopy) {
  assert.ok(hasTranslation(copy), `missing Indonesian copy for "${copy}"`);
  assert.notEqual(translate(copy, 'id'), copy, `"${copy}" must change under the ID locale`);
}
assert.equal(fill(translate('{n} findings', 'id'), {n: 3}), '3 temuan');
assert.equal(
  fill(translate('{high} high · {warnings} warnings · {scroll} scroll', 'id'), {high: 1, warnings: 2, scroll: 0}),
  '1 berat · 2 peringatan · 0 gulir',
);
assert.equal(
  fill(translate('Visual history · {n} events', 'id'), {n: 4}),
  'Riwayat visual · 4 kejadian',
);

// ── 4. English rendering is untouched ─────────────────────────────────────
for (const key of literals) {
  assert.equal(translate(key, 'en'), key, `"${key}" must render verbatim in English`);
}

console.log(
  `ui-doctor-i18n: PASS (${literals.size} Doctor strings, all translated; ID badge + panel copy verified)`,
);
