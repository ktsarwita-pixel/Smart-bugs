import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * v0.8 check — no browser needed.
 *
 *  1. Colony Bonds: tiers, the exact stat-sheet numbers, role isolation, and
 *     that both sides of a battle are counted by the same rule.
 *  2. Treasure guards keep their specified neutral stats.
 *  3. Fair initiative: with identical line-ups on both sides, neither side
 *     may win far from half of the fights (it used to reach 81%).
 *  4. Career record bookkeeping is pure and survives bad storage.
 *  5. Every new piece of copy has an Indonesian translation.
 *
 *   node scripts/bonds-smoke.mjs
 */
const bundled = await build({
  stdin: {
    contents: `
      export * as engine from "./src/game/engine";
      export * as bonds from "./src/game/bonds";
      export * as career from "./src/game/career";
      export * as treasure from "./src/game/treasure";
      export {BUGS} from "./src/game/data";
      export {hasTranslation, translate} from "./src/i18n";
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
    sourcefile: 'bonds-entry.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: {'.css': 'empty'},
  define: {'process.env.NODE_ENV': '"production"'},
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  outfile: 'ignored-bonds/entry.mjs',
  write: true,
});
assert.equal(bundled.errors.length, 0);
process.on('exit', () => rmSync('ignored-bonds', {recursive: true, force: true}));
const {engine, bonds, career, treasure, BUGS, hasTranslation, translate} =
  await import(pathToFileURL(`${process.cwd()}/ignored-bonds/entry.mjs`).href);

const {createBattle, stepBattle, battleStats, statsFor, nextUid} = engine;
const {bondLevels, bondCounts, bondMods, bondNeed, BONDS, ROLE_ORDER, NO_BONDS} = bonds;

// ── 1. tiers ────────────────────────────────────────────────
assert.deepEqual(bondLevels([]), {Frontline: 0, Artillery: 0, Assassin: 0});
assert.deepEqual(bondLevels(['stag']), {Frontline: 0, Artillery: 0, Assassin: 0});
assert.deepEqual(bondLevels(['stag', 'spider']), {Frontline: 1, Artillery: 0, Assassin: 0}, 'species do not matter, roles do');
assert.deepEqual(bondLevels(['stag', 'stag', 'stag']), {Frontline: 1, Artillery: 0, Assassin: 0});
assert.deepEqual(bondLevels(['stag', 'stag', 'stag', 'spider', 'bomb', 'bomb']), {Frontline: 2, Artillery: 1, Assassin: 0});
assert.deepEqual(bondLevels(['mantis', 'dragonfly', 'mantis', 'dragonfly']), {Frontline: 0, Artillery: 0, Assassin: 2});
assert.deepEqual(bondCounts(['bomb', 'mantis', 'bomb']), {Frontline: 0, Artillery: 2, Assassin: 1});
assert.deepEqual([0, 1, 2, 3, 4, 6].map(bondNeed), [2, 1, 2, 1, 0, 0]);
for (const id of Object.keys(BUGS)) assert.ok(ROLE_ORDER.includes(BUGS[id].role), `${id} has a known role`);

// ── exact stat-sheet numbers ────────────────────────────────
const plain = (id, star = 1) => battleStats(id, star, 'lampyris');
assert.deepEqual(plain('stag'), {hp: 300, atk: 34, def: 30, atkCd: 1.2}, 'no bond = the old numbers exactly');
assert.deepEqual(battleStats('stag', 1, 'lampyris', NO_BONDS), plain('stag'));
const wall1 = {Frontline: 1, Artillery: 0, Assassin: 0};
const wall2 = {Frontline: 2, Artillery: 0, Assassin: 0};
assert.equal(battleStats('stag', 1, 'lampyris', wall1).hp, 336, 'Shield Wall I: 300 × 1.12');
assert.equal(battleStats('stag', 1, 'lampyris', wall2).hp, 375, 'Shield Wall II: 300 × 1.25');
assert.equal(battleStats('stag', 1, 'lampyris', wall2).atk, 34, 'Shield Wall never touches ATK');
assert.equal(battleStats('stag', 1, 'matriarch', wall2).hp, Math.round(300 * 1.18 * 1.25), 'stacks with the Termite Queen');
assert.equal(battleStats('bomb', 1, 'lampyris', {Frontline: 0, Artillery: 1, Assassin: 0}).atk, 51, 'Battery I: 44 × 1.15');
assert.equal(battleStats('bomb', 1, 'lampyris', {Frontline: 0, Artillery: 2, Assassin: 0}).atk, 57, 'Battery II: 44 × 1.30');
assert.equal(battleStats('mantis', 1, 'lampyris', {Frontline: 0, Artillery: 0, Assassin: 1}).atkCd, 0.9, 'Ambush I: 1.0s × 0.9');
assert.equal(battleStats('mantis', 1, 'lampyris', {Frontline: 0, Artillery: 0, Assassin: 2}).atkCd, 0.8, 'Ambush II: 1.0s × 0.8');
assert.equal(battleStats('dragonfly', 3, 'lampyris', {Frontline: 0, Artillery: 0, Assassin: 2}).atk, 235, 'Ambush never touches ATK');
// role isolation: a bond is inert for every other role
const allMax = {Frontline: 2, Artillery: 2, Assassin: 2};
assert.deepEqual(bondMods('stag', allMax), {hpMul: 1.25, atkMul: 1, cdMul: 1});
assert.deepEqual(bondMods('bomb', allMax), {hpMul: 1, atkMul: 1.3, cdMul: 1});
assert.deepEqual(bondMods('mantis', allMax), {hpMul: 1, atkMul: 1, cdMul: 0.8});
assert.deepEqual(battleStats('bomb', 2, 'lampyris', wall2), plain('bomb', 2), 'Shield Wall does nothing for Artillery');

// ── both sides, same rule ───────────────────────────────────
const unit = (bugId, slot, star = 1) => ({uid: nextUid(), bugId, star, zone: 'board', slot});
{
  const line = () => [unit('stag', 0), unit('stag', 1), unit('bomb', 14), unit('mantis', 7)];
  const b = createBattle(line(), line(), 'lampyris', 'lampyris');
  assert.deepEqual(b.bondsA, {Frontline: 1, Artillery: 0, Assassin: 0});
  assert.deepEqual(b.bondsB, b.bondsA, 'the rival earns the same bond from the same line');
  for (const side of ['ally', 'foe']) {
    const of = (id) => b.units.filter((u) => u.side === side && u.bugId === id);
    for (const u of of('stag')) assert.equal(u.maxHp, 336, `${side} stag carries Shield Wall I`);
    for (const u of of('stag')) assert.equal(u.hp, u.maxHp);
    assert.equal(of('bomb')[0].atk, 44, `${side} lone bombardier has no Battery`);
    assert.equal(of('mantis')[0].atkCd, 1, `${side} lone mantis has no Ambush`);
  }
  // an un-bonded rival is not buffed by the player's bond
  const c = createBattle(line(), [unit('stag', 3), unit('bomb', 10)], 'lampyris', 'lampyris');
  assert.deepEqual(c.bondsB, {Frontline: 0, Artillery: 0, Assassin: 0});
  assert.equal(c.units.find((u) => u.side === 'foe' && u.bugId === 'stag').maxHp, 300);
}

// ── 2. treasure guards keep their neutral stats ─────────────
for (const round of [0, 3]) {
  const b = treasure.createTreasureBattle([unit('stag', 0), unit('stag', 1)], 'lampyris', round);
  const mult = round === 0 ? 1.15 : 1.1;
  for (const g of b.units.filter((u) => u.side === 'foe')) {
    const base = statsFor(g.bugId, g.star);
    assert.equal(g.maxHp, Math.round(base.hp * mult), `round ${round + 1} guard HP is the specified neutral value`);
    assert.equal(g.atk, Math.round(base.atk * mult), `round ${round + 1} guard ATK is the specified neutral value`);
    assert.equal(g.atkCd, BUGS[g.bugId].atkCd, `round ${round + 1} guard attack delay is untouched`);
    assert.ok(g.treasureGuard);
  }
  // round 4 fields two Bombardiers: they must not be shown as a Battery bond
  assert.deepEqual(b.bondsB, {Frontline: 0, Artillery: 0, Assassin: 0}, 'neutral guards report no bond');
  assert.deepEqual(b.bondsA, {Frontline: 1, Artillery: 0, Assassin: 0}, 'the player still earns bonds against guards');
}

// ── 3. fair initiative on mirror matches ────────────────────
const COLS = [3, 4, 2, 5, 1, 6, 0];
const team = (ids, star) => {
  const used = new Set();
  return ids.map((bugId) => {
    const base = BUGS[bugId].role === 'Frontline' ? 0 : BUGS[bugId].role === 'Artillery' ? 14 : 7;
    const slot = base + COLS.find((c) => !used.has(base + c));
    used.add(slot);
    return unit(bugId, slot, star);
  });
};
const mirrorSlot = (s) => (2 - Math.floor(s / 7)) * 7 + (s % 7);
const MIRRORS = {
  'two stags': ['stag', 'stag'],
  'three mantises': ['mantis', 'mantis', 'mantis'],
  'shield wall line': ['stag', 'stag', 'stag', 'stag', 'bomb', 'bomb'],
  'battery line': ['stag', 'stag', 'bomb', 'bomb', 'bomb', 'bomb'],
  'ambush line': ['stag', 'stag', 'mantis', 'mantis', 'mantis', 'mantis'],
  'mixed line': ['stag', 'stag', 'bomb', 'bomb', 'mantis', 'mantis'],
};
const N = 500;
const rates = [];
for (const [name, ids] of Object.entries(MIRRORS)) {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    let b = createBattle(team(ids, 1), team(ids, 1).map((u) => ({...u, slot: mirrorSlot(u.slot)})), 'lampyris', 'lampyris');
    for (let tick = 0; !b.over && tick < 600; tick++) b = stepBattle(b, 0.1);
    assert.ok(b.over, `${name}: the battle must end`);
    if (b.over === 'ally') wins++;
  }
  const rate = wins / N;
  rates.push(`${name} ${(rate * 100).toFixed(0)}%`);
  // 500 fair coin flips land inside 40–60% all but ~1 time in 100,000.
  assert.ok(rate > 0.4 && rate < 0.6, `${name}: identical line-ups must be near 50/50, ally side won ${(rate * 100).toFixed(1)}%`);
}

// ── 4. career record ────────────────────────────────────────
{
  const {recordMatch, sanitizeCareer, EMPTY_CAREER, roundWinRate, favouriteCommander} = career;
  const first = recordMatch(EMPTY_CAREER, {place: 4, commander: 'worm', roundsPlayed: 9, roundsWon: 4, bestStreak: 2});
  assert.equal(first.career.matches, 1);
  assert.equal(first.career.bestPlace, 4);
  assert.equal(first.career.podiums, 0);
  assert.equal(first.newBestPlace, false, 'a first match is not announced as a new record');
  assert.equal(first.newBestStreak, false);
  assert.equal(EMPTY_CAREER.matches, 0, 'recordMatch does not mutate its input');
  const second = recordMatch(first.career, {place: 1, commander: 'matriarch', roundsPlayed: 14, roundsWon: 11, bestStreak: 6});
  assert.equal(second.newBestPlace, true);
  assert.equal(second.newBestStreak, true);
  assert.equal(second.firstChampionship, true);
  assert.deepEqual(
    {m: second.career.matches, w: second.career.wins, p: second.career.podiums, b: second.career.bestPlace, l: second.career.lastPlace, s: second.career.bestStreak},
    {m: 2, w: 1, p: 1, b: 1, l: 1, s: 6},
  );
  assert.equal(roundWinRate(second.career), Math.round((15 / 23) * 100));
  assert.equal(favouriteCommander(second.career), 'matriarch');
  const third = recordMatch(second.career, {place: 3, commander: 'matriarch', roundsPlayed: 10, roundsWon: 6, bestStreak: 3});
  assert.equal(third.newBestPlace, false, 'a worse finish is not a record');
  assert.equal(third.firstChampionship, false);
  assert.equal(third.career.bestPlace, 1);
  assert.equal(third.career.lastPlace, 3);
  assert.equal(third.career.podiums, 2);
  assert.deepEqual(third.career.byCmd.matriarch, {matches: 2, wins: 1});
  // hostile storage never produces NaN or an impossible record
  for (const junk of [null, 42, 'x', [], {matches: -3}, {matches: 'many', wins: 9}, {matches: 2, wins: 99, bestPlace: 0, byCmd: {worm: null}}]) {
    const c = sanitizeCareer(junk);
    assert.ok(Number.isInteger(c.matches) && c.matches >= 0);
    assert.ok(c.wins <= c.matches && c.podiums <= c.matches);
    assert.ok(c.bestPlace === null || c.bestPlace >= 1);
  }
  assert.deepEqual(sanitizeCareer(JSON.parse(JSON.stringify(third.career))), third.career, 'a saved record reloads unchanged');
}

// ── 5. every new string is translated ───────────────────────
const copy = [
  'Colony Bonds', 'COLONY BONDS', 'BONDS', 'RIVAL',
  '{name}: {n} more {role} to activate', 'The rival line has no active bond', '{name} {tier} ACTIVE — {effect}',
  'CAREER', 'CAREER RECORD', 'MATCHES', 'TITLES', 'PODIUMS', 'BEST FINISH', 'WIN STREAK', 'ROUNDS WON',
  'FIRST CHAMPIONSHIP', 'NEW BEST FINISH', 'NEW STREAK RECORD',
  'Best commander: {name} — {m} matches, {w} titles', 'Saved on this device only.',
  'No finished matches yet', 'Tap again to erase the record', 'Erase career record ({n} matches)',
  'SOUND', 'VOLUME', 'On — synthesized effects', 'Off — silent',
  'All sounds are generated on your device — nothing is downloaded. Sound starts after your first tap.',
];
for (const role of ROLE_ORDER) copy.push(role, BONDS[role].name, BONDS[role].effect, BONDS[role].short, BONDS[role].desc);
const missing = copy.filter((s) => !hasTranslation(s));
assert.deepEqual(missing, [], 'every v0.8 string needs an Indonesian entry');
// placeholders must survive translation, or fill() would print a raw {n}
for (const s of copy) {
  const want = (s.match(/\{\w+\}/g) ?? []).sort();
  const got = (translate(s, 'id').match(/\{\w+\}/g) ?? []).sort();
  assert.deepEqual(got, want, `placeholders changed in the translation of "${s}"`);
}

console.log(`bonds-smoke: PASS — tiers, exact stats, role isolation, neutral guards, career record, ${copy.length} translated strings`);
console.log(`  mirror matches, ally-side win rate over ${N} fights each: ${rates.join(' · ')}`);
