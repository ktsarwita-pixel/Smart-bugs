/** Retain the fair-initiative and career checks from the v0.8 regression suite. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const output = await build({
  stdin: { contents: `export * from './src/game/engine.ts'; export * as career from './src/game/career.ts'; export {BUGS} from './src/game/data.ts';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', define: {'process.env.NODE_ENV': '"production"'}, write: false,
});
const {createBattle, stepBattle, nextUid, career, BUGS} = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`);
const unit = (bugId, slot, star = 1) => ({uid: nextUid(), bugId, star, zone: 'board', slot});
// ── Fair initiative on mirror matches ────────────────────
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
  'four frontline bugs': ['stag', 'stag', 'stag', 'stag', 'bomb', 'bomb'],
  'four artillery bugs': ['stag', 'stag', 'bomb', 'bomb', 'bomb', 'bomb'],
  'four assassins': ['stag', 'stag', 'mantis', 'mantis', 'mantis', 'mantis'],
  'mixed line': ['stag', 'stag', 'bomb', 'bomb', 'mantis', 'mantis'],
};
const N = 500;
const rates = [];
for (const [name, ids] of Object.entries(MIRRORS)) {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    let b = createBattle(team(ids, 1), team(ids, 1).map((u) => ({...u, slot: mirrorSlot(u.slot)})), 'matriarch', 'matriarch');
    for (let tick = 0; !b.over && tick < 600; tick++) b = stepBattle(b, 0.1);
    assert.ok(b.over, `${name}: the battle must end`);
    if (b.over === 'ally') wins++;
  }
  const rate = wins / N;
  rates.push(`${name} ${(rate * 100).toFixed(0)}%`);
  // 500 fair coin flips land inside 40–60% all but ~1 time in 100,000.
  assert.ok(rate > 0.4 && rate < 0.6, `${name}: identical line-ups must be near 50/50, ally side won ${(rate * 100).toFixed(1)}%`);
}

// ── Career record ────────────────────────────────────────
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

console.log(`v08-regression: PASS — career record and fair initiative (${rates.join(', ')})`);
