import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle = await build({
  stdin: {contents: `
    export * from './src/game/engine.ts';
    export * from './src/game/commander.ts';
    export * from './src/game/roster.ts';
    export {COMMANDERS, BUGS, BENCH_SIZE} from './src/game/data.ts';
    export {hasTranslation} from './src/i18n.tsx';
  `, resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'esm', write: false,
});
const {
  createBattle, stepBattle, battleStats, markOracleTarget, nextUid, damageLedger, SPIDER_ROAR_DAMAGE,
  freshCommander, settleCommander, incomeFrom, strongestOwned, eatAndSpit, PRESSURE_GOLD,
  deliverRecruits, COMMANDERS, BUGS, BENCH_SIZE, hasTranslation,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const unit = (bugId, slot, star = 1, zone = 'board') => ({uid: nextUid(), bugId, star, zone, slot});
const isolate = (b) => b.units.forEach((u) => { u.spd = 0; u.cd = 100; });
const tick = (b, n) => { for (let i = 0; i < n; i++) stepBattle(b, 0.1); };

// No role or Queen stat modifiers on either side, even with four bugs of a role.
for (const [i, c] of COMMANDERS.entries()) {
  const line = () => ['stag','stag','spider','spider','bomb','bomb','mantis','mantis','dragonfly','dragonfly'].map((id, slot) => unit(id, slot));
  const b = createBattle(line(), line(), c.id, COMMANDERS[(i + 1) % 3].id);
  for (const u of b.units) {
    const st = battleStats(u.bugId, u.star);
    assert.equal(u.maxHp, st.hp);
    assert.equal(u.atk, BUGS[u.bugId].atk);
    assert.equal(u.atkCd, BUGS[u.bugId].atkCd);
  }
  assert.equal('bondsA' in b || 'bondsB' in b, false);
  for (const copy of [c.perk, c.desc, c.skill.name, c.skill.desc]) assert.ok(hasTranslation(copy), `Missing ID translation for ${copy}`);
  assert.equal(c.art.length, 16);
  for (const line of c.art) assert.ok(line.length === 16 && [...line].every(pixel => pixel === '.' || c.pal[pixel]));
}

// Queen: third loss only schedules; fourth (even a win) pays exactly once.
{
  let p = freshCommander();
  for (let i = 0; i < 10; i++) {
    const streak = [-1,-2,-3,1,-1,-2,-3,-4,-5,-6][i];
    const next = settleCommander(p, 'matriarch', i, streak);
    assert.equal(next.payout, i === 3, `pressure payout on round ${i + 1}`);
    if (i === 2) assert.deepEqual(next.progress.pressure, {dueRound: 3});
    p = next.progress;
  }
  assert.equal(p.pressure, 'paid');
  assert.equal(PRESSURE_GOLD, 25);
  assert.equal(strongestOwned([unit('spider',0,1),unit('stag',0,2,'bench'),unit('mantis',1,2)]), 'stag', 'both bench and drawer count; stars then HP');
  assert.equal(strongestOwned([]), null);
}
{
  let p = freshCommander();
  assert.equal(incomeFrom(p,0,unit('spider',0)), null);
  for (let i = 0; i < 20; i++) p = settleCommander(p,'matriarch',i,i + 1).progress;
  assert.equal(p.charges,10,'uncapped, non-overlapping pairs');
  const earned = incomeFrom(p,20,unit('spider',0,3,'bench'));
  assert.equal(earned.gold,6,'5G base cost, regardless of stars');
  assert.equal(earned.progress.charges,9);
  assert.equal(incomeFrom(earned.progress,20,unit('stag',0)), null);
  assert.equal(incomeFrom(earned.progress,21,unit('stag',0)), null);
  assert.equal(incomeFrom(earned.progress,22,unit('stag',0)).gold,3);
  assert.equal(settleCommander(p,'matriarch',20,1).progress.charges,10,'first win of a fresh streak does not charge');
}

// Worm: charges work below five, cap storage, and replenish after spending.
{
  let p = freshCommander();
  for (let i = 0; i < 24; i++) {
    p = settleCommander(p,'worm',i,-1).progress;
    assert.equal(p.charges, Math.min(5, Math.floor((i + 1) / 3)));
    if (i === 2) assert.equal(eatAndSpit(p,unit('bomb',0,2,'bench'), () => 0).progress.charges,0);
  }
  assert.equal(eatAndSpit(p,unit('stag',0), () => 0), null, 'reject drawer target');
  const values = [0.99,0.2];
  const eaten = eatAndSpit(p,unit('mantis',0,2,'bench'),() => values.shift());
  assert.deepEqual(eaten.rewards,['dragonfly','bomb'], 'first role pool, second entire roster');
  assert.equal(eaten.progress.charges,4);
  for (let i = 24; i < 27; i++) p = settleCommander(eaten.progress,'worm',i,1).progress;
  assert.equal(p.charges,5, 'capacity is not a lifetime limit');
}
{
  const occupied = Array.from({length: BENCH_SIZE},(_, i) => unit('mantis', i, 3, 'bench'));
  const keep = unit('stag',0);
  const get = deliverRecruits([keep,...occupied],['stag','stag']);
  assert.deepEqual(get.reserve,['stag','stag']);
  const retry = deliverRecruits(get.out.filter(u => u !== occupied[0]), get.reserve);
  assert.deepEqual(retry.reserve,[],'the second recruit fits by moulting');
  assert.equal(retry.out.find(u => u.uid === keep.uid).star,2,'rewards moult and keep a fielded copy');
  assert.ok(retry.out.filter(u => u.zone === 'bench').every(u => u.slot < BENCH_SIZE));
}

// Trap holes: two distinct strongest targets, opening damage and consecutive statuses.
{
  const b = createBattle([unit('stag',3,3)], [unit('spider',8,2), unit('dragonfly',4,3), unit('stag',12,1)],'worm','matriarch');
  isolate(b);
  const [src, spider, fly, safe] = b.units;
  assert.deepEqual(b.holes.map(h => [h.targetUid,h.x,h.y]), [[fly.uid,fly.x,fly.y],[spider.uid,spider.x,spider.y]]);
  assert.equal(src.dealt,200);
  assert.equal(safe.taken,0);
  assert.equal(fly.hp,fly.maxHp - 100, 'opening damage is 100 even against Slipstream');
  assert.equal(spider.stun,3);
  assert.equal(spider.vuln,0);
  tick(b,29);
  assert.ok(spider.stun > 0 && spider.vuln === 0);
  tick(b,1);
  assert.equal(spider.stun,0);
  assert.equal(spider.vuln,10);
  // A real basic attack during Vulnerable uses the 50% modifier.
  src.x = spider.x; src.y = spider.y + 0.1; src.cd = 0;
  tick(b,1);
  assert.equal(spider.taken,100 + Math.round(src.atk * 1.5));
  src.cd = 100;
  tick(b,99);
  assert.equal(spider.vuln,0);
  assert.equal(b.holes.length,0);
  assert.equal(damageLedger(b).allyTotal, spider.taken + fly.taken);
}
{
  const b = createBattle([unit('spider',0,3),unit('stag',1,2)],[unit('stag',14,3),unit('stag',15,2)],'worm','worm');
  isolate(b);
  const [spider,,foe] = b.units;
  assert.equal(b.holes.length,4);
  assert.equal(spider.roarEnd,4.5,'trapped opening caster waits for the stun to end');
  tick(b,44);
  assert.equal(foe.taken,100);
  tick(b,1);
  assert.equal(foe.taken,100 + SPIDER_ROAR_DAMAGE);
}

// Oracle: first hit crossing 50% of max HP, the same cadence, and a tile square.
{
  const b = createBattle([unit('stag',0), unit('mantis',6)], [unit('stag',0),unit('dragonfly',1),unit('stag',2)],'lampyris','matriarch');
  isolate(b);
  const [ally,other,attacker,corner,outside] = b.units;
  ally.x = 3.21; ally.y = 3.22;
  attacker.x = 3.1; attacker.y = 2.9;
  corner.x = 4.88; corner.y = 4.91; // diagonally inside the 3×3 tiles, outside any 1.5-radius circle
  outside.x = 5.01; outside.y = 3.21;
  const halfHp = ally.maxHp / 2;
  ally.hp = halfHp + 1;
  assert.equal(markOracleTarget(b,'ally',attacker.uid),false);
  assert.equal(markOracleTarget(b,'foe',attacker.uid),false);
  assert.equal(markOracleTarget(b,'ally',ally.uid),true);
  assert.equal(b.waves.ally.pulses,0);
  tick(b,1);
  assert.equal(ally.hp,halfHp + 1,'a mark waits while HP is above half');
  ally.hp = halfHp + attacker.atk; attacker.cd = 0;
  tick(b,1); // exactly half (150/300) after the 34 damage hit
  attacker.cd = 100;
  assert.equal(b.waves.ally.startAt,0.2);
  assert.equal(b.waves.ally.lastPulseAt,b.t);
  assert.equal(ally.hp,195,'150/300 HP heals by 45 in the hit tick');
  assert.equal(markOracleTarget(b,'ally',other.uid),false,'cannot switch once fired');
  tick(b,14); assert.equal(ally.hp,195);
  tick(b,1); assert.equal(ally.hp,240);
  tick(b,14); assert.equal(ally.hp,240);
  tick(b,1); assert.equal(ally.hp,285);
  // Make room for the entire 30% final heal without bringing HP below half.
  attacker.atk = 90; attacker.cd = 0;
  tick(b,1);
  attacker.cd = 100;
  tick(b,28); assert.equal(ally.hp,195);
  tick(b,1); assert.equal(ally.hp,285);
  assert.equal(b.waves.ally.pulses,4);
  assert.deepEqual([b.waves.ally.impact.x,b.waves.ally.impact.y],[3.5,3.5]);
  assert.equal(corner.taken,26,'round(34 × 1.5 / 2), ray is not reduced by Slipstream');
  assert.equal(attacker.taken,26);
  assert.equal(outside.taken,0);
  assert.equal(other.hp,other.maxHp);
  assert.equal(ally.dealt,52);
  ally.hp = 20;
  tick(b,35);
  assert.equal(ally.hp,20,'no fifth pulse or periodic glow');
}
// Already at/below half: synchronous on either side, at multiple max HP values.
for (const [bug, star, offset, time, side] of [
  ['stag',1,0,0,'ally'], ['stag',2,-1,2.2,'ally'], ['stag',3,0,3.7,'foe'], ['mantis',1,0,1,'ally'],
]) {
  const b = createBattle([unit(bug,0,star)], [unit(bug,17,star)], 'lampyris', 'lampyris');
  isolate(b);
  b.t = time;
  const target = b.units.find(u => u.side === side);
  // A 205-max-HP Mantis qualifies at 102, not at 103 (don't round the ratio).
  const halfHp = Math.floor(target.maxHp / 2);
  target.hp = halfHp + 1;
  assert.equal(markOracleTarget(b,side,target.uid),true);
  assert.equal(b.waves[side].startAt,null,'above 50% stays dormant');
  const hp = halfHp + offset;
  target.hp = hp;
  const gain = Math.round(target.maxHp * .15);
  assert.equal(markOracleTarget(b,side,target.uid),true);
  assert.equal(b.waves[side].startAt,time);
  assert.equal(b.waves[side].lastPulseAt,time);
  assert.equal(b.waves[side].pulses,1);
  assert.equal(target.hp,hp + gain,'0s pulse heals before another simulation step');
  assert.ok(b.pops.some(p => p.healSource === 'oracle' && p.text === `+${gain}`));
  tick(b,1);
  assert.equal(target.hp,hp + gain,'tick does not repeat the instant pulse');
}
{
  // The heal must resolve inside the first hit, not even at the end of its tick.
  const b = createBattle([unit('stag',3)], [unit('stag',17),unit('stag',16)], 'lampyris','matriarch');
  isolate(b);
  const [target, ...foes] = b.units;
  target.hp = 151;
  for (const [i,foe] of foes.entries()) Object.assign(foe,{x: target.x + (i ? 0.2 : -0.2), y: target.y - .22, atk:80, cd:0});
  markOracleTarget(b,'ally',target.uid);
  tick(b,1);
  assert.equal(target.hp,36,'instant +45 HP saves the ally from the second 80 damage in the same tick');
  assert.deepEqual(b.pops.map(p=>p.text),['80','+45','80']);
}
{
  const c = createBattle([unit('stag',3)], [unit('stag',17)], 'lampyris','matriarch');
  isolate(c);
  const [v,a] = c.units;
  v.hp = 151;
  markOracleTarget(c,'ally',v.uid);
  Object.assign(a,{x:v.x,y:v.y-.24,atk:151,cd:0});
  tick(c,1);
  assert.ok(v.dead && v.hp===0,'Oracle is not a resurrection');
  assert.equal(c.waves.ally.pulses,0);
}
{
  const b = createBattle([unit('stag',3),unit('spider',1),unit('mantis',6)],[unit('stag',17)],'lampyris','matriarch');
  isolate(b);
  const [fallen,near,far,attacker] = b.units;
  fallen.hp = 5; near.hp -= 110; far.hp -= 90;
  attacker.x = fallen.x; attacker.y = fallen.y - 0.3; attacker.cd = 0;
  tick(b,1);
  assert.ok(fallen.dead);
  assert.equal(b.sparks.length,1);
  assert.equal(b.sparks[0].targetUid,near.uid,'nearest living teammate, not the most wounded');
  tick(b,4); assert.equal(near.hp,near.maxHp - 110);
  tick(b,1); assert.equal(near.hp,near.maxHp - 110 + Math.round(near.maxHp * 0.1));
  assert.equal(far.hp,far.maxHp - 90);
  assert.equal(b.sparks[0].landedAt, b.t, 'landing halo starts when the heal is applied');
  tick(b,6);
  assert.equal(near.hp,near.maxHp - 110 + Math.round(near.maxHp * 0.1),'halo never re-applies the heal');
  assert.equal(b.sparks.length,0,'the visual cue is retired');
}
{
  const b = createBattle([unit('stag',0)], [unit('mantis',0),unit('bomb',1,2)], 'matriarch', 'lampyris', {autoOracle:['foe']});
  assert.equal(b.waves.foe.uid, b.units[2].uid, 'rival uses its actual Oracle skill');
  assert.equal(b.waves.ally,null);
}
{
  const b = createBattle([unit('stag',0)], [unit('bomb',17)], 'worm', 'lampyris', {autoOracle:['foe']});
  assert.equal(b.waves.foe.startAt,0,'90/190 HP after the opening trap qualifies at time zero');
  assert.equal(b.units[1].hp,119,'90 HP + 29 from the first pulse');
}
console.log('commander-rules: PASS — base stats, timing and combat ledger, charge economy, rewards, and EN/ID skill copy');
