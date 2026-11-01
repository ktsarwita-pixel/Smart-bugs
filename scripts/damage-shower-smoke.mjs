import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundled = await build({
  entryPoints: ['src/game/engine.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'ignored',
  write: false,
});
const load = async (name) => {
  const file = bundled.outputFiles.find((f) => f.path.endsWith(`${name}.js`));
  return import(`data:text/javascript;base64,${Buffer.from(file.contents).toString('base64')}`);
};
const {createBattle, stepBattle, damageLedger, SPIDER_ROAR_DAMAGE} = await load('engine');

const unit = (uid, bugId, star, slot) => ({uid, bugId, star, slot, zone: 'board'});

// ---------------------------------------------------------------- attribution
// Poison ticks belong to the bug that applied the poison, not to the victim.
{
  const b = createBattle([unit(1, 'spider', 3, 4)], [unit(2, 'stag', 3, 0)], 'matriarch', 'matriarch');
  const spider = b.units.find((u) => u.uid === 1);
  const foe = b.units.find((u) => u.uid === 2);
  b.units.forEach((u) => { u.hp = u.maxHp = 100000; u.cd = 1e9; u.spd = 0; });
  foe.poisonLeft = 3;
  foe.poisonIn = 0.05;
  foe.poisonDmg = 40;
  foe.poisonFrom = spider.uid;
  const dealtBefore = spider.dealt;
  const takenBefore = foe.taken;
  for (let i = 0; i < 15; i++) stepBattle(b, 0.1);
  const ticks = Math.round((spider.dealt - dealtBefore) / 40);
  assert.ok(ticks >= 1, `poison ticks must be credited to the spider (got ${spider.dealt - dealtBefore})`);
  assert.equal(foe.taken - takenBefore, spider.dealt - dealtBefore, 'poison taken/dealt must balance');
  assert.equal(foe.dealt, 0, 'the victim must not be credited for its own poison');
  // Without an owner on record the tick falls back to the victim: no phantom credit.
  foe.poisonLeft = 1;
  foe.poisonIn = 0.05;
  foe.poisonFrom = 0;
  const snap = [spider.dealt, foe.dealt];
  for (let i = 0; i < 15; i++) stepBattle(b, 0.1);
  assert.deepEqual([spider.dealt, foe.dealt], snap, 'ownerless poison must not invent a damage source');
}

// The opening roar is priced exactly and credited to the caster.
{
  const b = createBattle([unit(1, 'spider', 3, 4)], [unit(2, 'stag', 3, 0)], 'matriarch', 'matriarch');
  b.units.forEach((u) => { u.hp = u.maxHp = 100000; u.spd = 0; u.cd = 1e9; });
  const spider = b.units.find((u) => u.uid === 1);
  const foe = b.units.find((u) => u.uid === 2);
  for (let i = 0; i < 60; i++) stepBattle(b, 0.1);
  assert.equal(spider.dealt, SPIDER_ROAR_DAMAGE, 'roar damage is credited exactly once');
  assert.equal(foe.taken, SPIDER_ROAR_DAMAGE);
}

// ------------------------------------------------------------- full battle
{
  const b = createBattle(
    [unit(1, 'spider', 3, 4), unit(2, 'bomb', 2, 5), unit(3, 'dragonfly', 3, 3)],
    [unit(11, 'stag', 3, 1), unit(12, 'mantis', 2, 2), unit(13, 'bomb', 3, 4), unit(14, 'spider', 2, 5)],
    'matriarch',
    'matriarch',
  );
  for (let i = 0; i < 900; i++) stepBattle(b, 0.1);
  const led = damageLedger(b);

  assert.equal(led.ally.length, 3, 'every ally is listed');
  assert.equal(led.foe.length, 4, 'every enemy is listed');
  assert.ok(led.allyTotal > 0 && led.foeTotal > 0, 'both sides dealt damage');

  const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
  assert.equal(sum(led.ally, 'dealt'), sum(led.foe, 'taken'), 'ally dealt === foe taken');
  assert.equal(sum(led.foe, 'dealt'), sum(led.ally, 'taken'), 'foe dealt === ally taken');
  assert.equal(sum(led.ally, 'dealt'), led.allyTotal);
  assert.equal(sum(led.foe, 'dealt'), led.foeTotal);

  for (const rows of [led.ally, led.foe]) {
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].dealt >= rows[i].dealt, 'rows are sorted by damage dealt');
    }
    const shares = rows.reduce((n, r) => n + r.share, 0);
    assert.ok(Math.abs(shares - 1) < 1e-6, `shares sum to 1 (got ${shares})`);
    for (const r of rows) {
      assert.ok(r.share >= 0 && r.share <= 1, 'share is a 0..1 fraction');
      assert.ok(r.dealt >= 0 && r.taken >= 0, 'no negative ledger values');
      assert.ok(r.uid > 0 && r.bugId && r.star >= 1 && r.star <= 3);
    }
  }

  // Ledger must be plain, JSON-safe data (it crosses the 4 Hz HUD snapshot).
  const round = JSON.parse(JSON.stringify(led));
  assert.deepEqual(round, led, 'ledger survives a JSON round trip');

  // Dead bugs keep their numbers so the chart still tells the whole story.
  const dead = [...led.ally, ...led.foe].filter((r) => r.dead);
  assert.ok(dead.length > 0, 'the battle produced at least one corpse');
  assert.ok(dead.every((r) => r.taken > 0), 'dead bugs still report the damage they took');
}

// ------------------------------------------------------------- empty battle
{
  const b = createBattle([], [], 'matriarch', 'matriarch');
  const led = damageLedger(b);
  assert.deepEqual([led.ally.length, led.foe.length, led.allyTotal, led.foeTotal], [0, 0, 0, 0]);
}

console.log('damage-shower-smoke: PASS');
