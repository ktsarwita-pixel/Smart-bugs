import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync, rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * Damage Shower rendering check — runs without a browser.
 *
 * The panel is bundled exactly as the app bundles it (one React, one i18n,
 * one engine instance) and rendered to static markup, so the checks below
 * prove the chart really lists every bug with the engine's own numbers, and
 * that both languages render a complete panel.
 */
const bundled = await build({
  stdin: {
    contents: `
      export {DamageShower} from "./src/App";
      export {SettingsProvider} from "./src/i18n";
      export {createBattle, stepBattle, damageLedger} from "./src/game/engine";
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
    sourcefile: 'damage-shower-entry.tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: {'.css': 'empty'},
  define: {'process.env.NODE_ENV': '"production"'},
  // One React instance only: the view is bundled, the renderer is not.
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  outfile: 'ignored-smoke/damage-shower-entry.js',
  write: true,
});
assert.equal(bundled.errors.length, 0);
process.on('exit', () => rmSync('ignored-smoke', {recursive: true, force: true}));

const {DamageShower, SettingsProvider, createBattle, stepBattle, damageLedger} =
  await import(pathToFileURL('ignored-smoke/damage-shower-entry.js').href);

const unit = (uid, bugId, star, slot) => ({uid, bugId, star, slot, zone: 'board'});
const battle = createBattle(
  [unit(1, 'spider', 3, 4), unit(2, 'bomb', 2, 5), unit(3, 'dragonfly', 3, 3)],
  [unit(11, 'stag', 3, 1), unit(12, 'mantis', 2, 2), unit(13, 'bomb', 3, 4)],
  'matriarch',
  'matriarch',
);
for (let i = 0; i < 250; i++) stepBattle(battle, 0.1);
const led = damageLedger(battle);
assert.ok(led.allyTotal > 0 && led.foeTotal > 0, 'the test battle must produce damage on both sides');

/** Renders the panel in a given language, mirroring how App mounts it. */
const render = (lang) => {
  if (lang === 'id') {
    globalThis.localStorage = {
      getItem: (k) => (k === 'smartbugs.settings' ? JSON.stringify({lang: 'id', rev: 2}) : null),
      setItem: () => {},
      removeItem: () => {},
    };
  } else {
    delete globalThis.localStorage;
  }
  return renderToStaticMarkup(
    createElement(SettingsProvider, null, createElement(DamageShower, {snap: battle})),
  );
};

const count = (html, re) => (html.match(re) ?? []).length;

// ── English: own line only, enemy folded behind the toggle ────────────────
{
  const html = render('en');
  assert.match(html, /class="damage-shower"/);
  assert.match(html, />DAMAGE SHOWER</, 'panel title renders');
  assert.match(html, /class="damage-shower__head"[^>]*aria-expanded="true"/, 'the chart starts expanded');
  assert.match(html, /class="damage-shower__sum"[^>]*>[^<]+</, 'own total renders');
  assert.equal(count(html, /class="damage-row"/g), 3, 'one row per ally, enemy line stays folded');
  assert.equal(count(html, /damage-row__track/g), 3, 'every row carries a share bar');
  assert.match(html, /SHOW ENEMY DAMAGE/, 'the enemy toggle is offered');
  assert.doesNotMatch(html, /data-side="foe"/, 'enemy rows are not rendered until toggled');
  assert.match(html, /width:\s*\d+%/, 'the bar width is a percentage of the line total');
  assert.match(html, /aria-controls="damage-shower-body"/, 'the toggle is wired to the chart body');
  assert.match(html, /aria-controls="damage-shower-enemy"/, 'the enemy toggle is wired to the enemy list');

  // Rows are ordered from the heaviest hitter down and show the engine's own
  // ledger values, not a re-derivation in the view.
  const values = [...html.matchAll(/class="damage-row__val">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(values, led.ally.map((r) => r.dealt.toLocaleString('en-US')), 'rendered figures match the ledger');
}

// ── Bahasa Indonesia: same chart, translated labels, numbers unchanged ────
{
  const html = render('id');
  assert.match(html, />STATISTIK DAMAGE</, 'Indonesian title renders');
  assert.match(html, /LIHAT DAMAGE MUSUH/, 'Indonesian enemy toggle renders');
  assert.equal(count(html, /class="damage-row"/g), 3, 'the Indonesian chart lists the same rows');
  const values = [...html.matchAll(/class="damage-row__val">([^<]+)</g)].map((m) => m[1]);
  // id-ID groups thousands with a dot, en-US with a comma — the numbers are
  // formatted for the active language, not copied from English.
  assert.deepEqual(values, led.ally.map((r) => r.dealt.toLocaleString('id-ID')), 'figures use Indonesian grouping');
  assert.match(html, /damage diterima/, 'the taken figure is translated');
  assert.doesNotMatch(html, /DAMAGE SHOWER|SHOW ENEMY DAMAGE/, 'no English leaks into the Indonesian panel');
}

// Every string the panel can show needs an Indonesian entry, or a Bahasa
// player silently drops back to English mid-battle.
{
  const i18n = readFileSync('src/i18n.tsx', 'utf8');
  const idKeys = new Set([...i18n.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]));
  for (const key of [
    'DAMAGE SHOWER', 'damage dealt', 'damage taken', 'taken',
    'Damage each of your bugs dealt this battle', 'Total damage your line dealt',
    'SHOW ENEMY DAMAGE', 'HIDE ENEMY DAMAGE', 'No bugs on the drawer yet.',
  ]) {
    assert.ok(idKeys.has(key), `missing Indonesian translation for "${key}"`);
  }
}

// The chart must stay inside its frame in any language: lock the layout
// guards that make long Indonesian labels truncate instead of overflow, and
// keep the row list scrolling inside the dock rather than pushing it open.
{
  const css = readFileSync('src/index.css', 'utf8');
  const block = css.slice(css.indexOf('.damage-shower {'), css.indexOf('/* Wide docks can afford'));
  for (const guard of [
    'grid-template-columns: 22px minmax(0, 1fr) auto',
    'text-overflow: ellipsis',
    'white-space: nowrap',
    'overflow-y: auto',
    'max-height: 164px',
    'min-width: 0',
  ]) {
    assert.ok(block.includes(guard), `damage chart lost its layout guard: ${guard}`);
  }
  assert.match(css, /@media \(max-width: 359\.98px\)[\s\S]{0,400}\.damage-row__val/, 'tiny phones get a smaller damage figure');
}

console.log('damage-shower-dom: PASS');
