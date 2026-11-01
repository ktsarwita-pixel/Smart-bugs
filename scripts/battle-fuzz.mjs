import assert from 'node:assert/strict';
import {build} from 'esbuild';

/**
 * Battle fuzz — throws hundreds of random fights at the engine and checks the
 * Damage Shower ledger never drifts from the actual HP the battle removed:
 *
 *   sum(ally.dealt) === sum(foe.taken)  and vice versa
 *
 * plus the boring invariants that a long random run is good at breaking
 * (NaN, negative pools, battles that never end, corpses that still move).
 */
const bundled = await build({
  entryPoints: ['src/game/engine.ts', 'src/game/data.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'ignored',
  write: false,
});
const load = async (path) => {
  const file = bundled.outputFiles.find((f) => f.path.endsWith(path));
  return import(`data:text/javascript;base64,${Buffer.from(file.contents).toString('base64')}`);
};
const {createBattle, stepBattle, damageLedger} = await load('engine.js');
const {BUGS} = await load('data.js');

const BUG_IDS = Object.keys(BUGS);
assert.ok(BUG_IDS.length >= 5, `expected the bug roster, got ${BUG_IDS.length}`);

// Deterministic RNG so a failure is reproducible from its seed.
const rngFor = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const COMMANDERS = ['matriarch', 'oracle', 'lamppris'];
/** Commanders that restore HP, so the HP-ledger equality legitimately breaks. */
const healers = new Set(['lamppris']);

let battles = 0;
let totalDamage = 0;
const failures = [];
for (let seed = 1; seed <= 400; seed++) {
  const rand = rngFor(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const team = (side) => {
    const size = 1 + Math.floor(rand() * 6);
    return Array.from({length: size}, (_, i) => ({
      uid: side === 'ally' ? i + 1 : 100 + i,
      bugId: pick(BUG_IDS),
      star: 1 + Math.floor(rand() * 3),
      slot: i,
      zone: 'board',
    }));
  };
  try {
    const b = createBattle(team('ally'), team('foe'), pick(COMMANDERS), pick(COMMANDERS));
    let guard = 0;
    while (!b.over && guard++ < 1200) stepBattle(b, 0.1);
    battles++;
    assert.ok(b.over, 'battle never reached a result');
    assert.ok(b.t <= 45, `battle ran ${b.t.toFixed(1)}s`);

    for (const u of b.units) {
      for (const key of ['hp', 'atk', 'energy', 'x', 'y', 'dealt', 'taken', 'kills', 'maxHp']) {
        assert.ok(Number.isFinite(u[key]), `${u.bugId} ${u.side} has non-finite ${key}: ${u[key]}`);
      }
      assert.ok(u.hp >= 0, `${u.bugId} has negative HP`);
      assert.ok(u.dealt >= 0 && u.taken >= 0, `${u.bugId} has negative ledger values`);
      assert.ok(Number.isInteger(u.dealt) && Number.isInteger(u.taken), `${u.bugId} ledger is not whole numbers`);
      if (u.dead) assert.equal(u.hp, 0, `${u.bugId} is dead but still holds HP`);
      assert.ok(u.x >= 0 && u.x <= 7 && u.y >= 0 && u.y <= 6, `${u.bugId} left the board at ${u.x},${u.y}`);
    }

    // The ledger must be the whole truth about the HP this battle removed:
    // with no healer on the drawer, a survivor's damage taken is exactly the
    // HP it is missing, and a corpse must have taken at least its whole pool.
    if (!healers.has(b.cmdA) && !healers.has(b.cmdB)) {
      for (const u of b.units) {
        const removed = u.maxHp - u.hp;
        if (u.dead) {
          assert.ok(u.taken >= u.maxHp, `${u.bugId} died having taken only ${u.taken} of ${u.maxHp}`);
        } else {
          assert.equal(u.taken, removed, `${u.bugId} shows ${u.taken} taken but is missing ${removed} HP`);
        }
      }
    }

    const led = damageLedger(b);
    const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
    assert.equal(led.ally.length + led.foe.length, b.units.length, 'ledger dropped a unit');
    assert.equal(sum(led.ally, 'dealt'), sum(led.foe, 'taken'), 'ally damage does not match enemy damage taken');
    assert.equal(sum(led.foe, 'dealt'), sum(led.ally, 'taken'), 'enemy damage does not match ally damage taken');
    for (const rows of [led.ally, led.foe]) {
      for (const r of rows) assert.ok(r.share >= 0 && r.share <= 1, 'share out of range');
      const total = rows.reduce((n, r) => n + r.dealt, 0);
      if (total > 0) {
        const shares = rows.reduce((n, r) => n + r.share, 0);
        assert.ok(Math.abs(shares - 1) < 1e-6, `shares sum to ${shares}, not 1`);
      }
      for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].dealt >= rows[i].dealt, 'rows unsorted');
    }
    totalDamage += led.allyTotal + led.foeTotal;
  } catch (err) {
    failures.push(`seed ${seed}: ${err.message}`);
  }
}

assert.deepEqual(failures.slice(0, 5), [], `${failures.length} of 400 random battles failed`);
console.log(`battle-fuzz: PASS — ${battles} battles, ${totalDamage.toLocaleString('en-US')} damage logged, ledger balanced every time`);
