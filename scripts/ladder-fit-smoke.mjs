import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/**
 * Colony detail ↔ ladder fit check — no browser needed.
 *
 * Tapping a colony used to swap an 8-cell rail for a panel pinned with
 * `left/right/top/bottom` constants and `min-height:48px`, while the rail itself
 * was `visibility:hidden`. The panel therefore had a different box from the rail
 * and could hang over the deck border. Now the rail stays in the flow and the
 * panel is pinned to the rail's own rectangle (`inset: 0`), so the two boxes are
 * identical by construction. This guards that construction.
 */
const app = readFileSync('src/App.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

// ── markup: the panel lives inside the rail wrapper, after the strip ──────
const railOpen = app.indexOf('<div className="ladder-rail">');
const stripOpen = app.indexOf('<div className="ladder-strip"');
const detailOpen = app.indexOf('className="ladder-detail"');
assert.ok(railOpen > 0, 'the ladder needs a .ladder-rail wrapper to size the detail panel');
assert.ok(stripOpen > railOpen, 'the strip must sit inside the rail wrapper');
assert.ok(detailOpen > stripOpen, 'the detail panel must render after the strip so it paints on top');

const tail = app.slice(detailOpen);
const detailClose = tail.indexOf('</div>');
const between = app.slice(stripOpen, detailOpen);
const stripClosed = between.lastIndexOf('</div>');
assert.ok(stripClosed > 0, 'the strip must close before the detail panel starts');

// the rail wrapper must close after the panel (one extra div at the end)
const afterDetail = app.slice(detailOpen);
assert.match(afterDetail.slice(0, 1400), /<\/div>\s*\)\}\s*<\/div>/, 'the panel and the strip must share the rail wrapper');

// no leftovers of the hidden-rail trick
assert.doesNotMatch(app, /ladder-strip--detail/, 'the rail must not be hidden when a colony is focused');
assert.doesNotMatch(css, /ladder-strip--detail/, 'the CSS rule that hid the rail must be gone');
assert.doesNotMatch(app, /focusedColony \? "ladder-strip/, 'the strip class must not change when a colony is focused');

// ── CSS: the panel takes the rail's box, with no magic offsets ────────────
const rules = [...css.matchAll(/\.ladder-detail\s*\{([^}]*)\}/g)].map((m) => m[1]);
assert.ok(rules.length > 0, 'the detail panel needs a style rule');
const last = rules[rules.length - 1];
const decl = (block, prop) => {
  const hit = [...block.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))].pop();
  return hit ? hit[1].trim() : null;
};
for (const block of rules) {
  assert.equal(decl(block, 'left'), null, '.ladder-detail must not use a fixed left offset');
  assert.equal(decl(block, 'right'), null, '.ladder-detail must not use a fixed right offset');
  assert.equal(decl(block, 'top'), null, '.ladder-detail must not use a fixed top offset');
  assert.equal(decl(block, 'bottom'), null, '.ladder-detail must not use a fixed bottom offset');
  assert.equal(decl(block, 'min-height'), null, '.ladder-detail must never be taller than the rail');
  assert.equal(decl(block, 'margin-top'), null, '.ladder-detail must not add space above the rail');
}
assert.equal(decl(last, 'position'), 'absolute');
assert.equal(decl(last, 'inset'), '0', 'the panel must cover exactly the rail rectangle');
assert.equal(decl(last, 'box-sizing'), 'border-box', 'its 1px border must stay inside the rail box');
assert.match(css, /\.ladder-rail\s*\{\s*position:\s*relative;?\s*\}/, 'the rail must be the positioning context');

// the rail defines one row of 8 cells, so the panel is one rail tall
assert.match(css, /\.ladder-strip\s*\{[^}]*grid-template-columns:\s*repeat\(8, minmax\(0, 1fr\)\)/,
  'the rail must stay a single 8-column row');

// the close control fills the panel height, so it is never clipped or tiny
const button = [...css.matchAll(/\.ladder-detail button\s*\{([^}]*)\}/g)].map((m) => m[1]).pop() || '';
assert.match(button, /align-self:\s*stretch/, 'the close button must span the panel height');
assert.match(button, /width:\s*40px/, 'the close button keeps a 40px touch target');

console.log('ladder-fit: PASS (detail panel pinned to the rail box; no fixed offsets, no hidden rail)');
