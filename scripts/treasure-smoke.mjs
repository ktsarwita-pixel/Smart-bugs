import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: `export * from './src/game/match.ts'; export * from './src/game/treasure.ts'; export {statsFor} from './src/game/engine.ts';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { createMatch, getRoundFixtures, resolveMatchRound, advanceMatchRound, createTreasureBattle, treasureRound, statsFor, TREASURE_ID } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const ally = [{ uid: 999999, bugId:'stag', star:1, slot:3, zone:'board' }];
for (const round of [0,3]) {
  assert.equal(treasureRound(round), round + 1);
  const b = createTreasureBattle(ally, 'worm', round);
  const guards = b.units.filter(u => u.side === 'foe');
  assert.deepEqual(guards.map(u => [u.bugId,u.star]), round === 0 ? [['stag',1],['stag',1]] : [['bomb',1],['dragonfly',2],['bomb',1]]);
  for (const u of guards) {
    const s = statsFor(u.bugId,u.star), mult = round === 0 ? 1.15 : 1.10;
    assert.equal(u.hp, Math.round(s.hp*mult)); assert.equal(u.atk, Math.round(s.atk*mult)); assert.equal(u.def, Math.round(s.def*mult)); assert.equal(u.treasureGuard,true);
  }
  const m = { ...createMatch(), round };
  assert.equal(getRoundFixtures(m).length, m.colonies.length);
  assert.ok(getRoundFixtures(m).every(f => f.bId === TREASURE_ID));
  assert.equal(resolveMatchRound(m), m, 'unfinished player battle cannot settle');
  b.over='ally';
  const settled=resolveMatchRound(m,b,ally);
  assert.deepEqual(settled.colonies.map(c => c.hp), m.colonies.map(c => c.hp));
  assert.equal(settled.lastRound.duels.length, 8);
  assert.equal(advanceMatchRound(settled).round, round + 1);
  assert.equal(resolveMatchRound(settled,b,ally), settled, 'settlement is idempotent');
}
assert.equal(treasureRound(1), null); assert.equal(treasureRound(2), null); assert.equal(treasureRound(4), null); assert.equal(treasureRound(20), null);
console.log('Treasure rosters, stats, neutral settlement and schedule passed.');
