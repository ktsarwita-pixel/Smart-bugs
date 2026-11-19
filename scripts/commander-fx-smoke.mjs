/** Exercise the actual event-driven FX, including a ray at the zero-delay heal. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1024,height:650}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, {recursive:true});
const shot = async (name) => { if (shots) await page.screenshot({path:`${shots}/${name}.png`}); };
const rendered = (key, n) => page.waitForFunction(([key,n]) => {
  const raw = document.querySelector('canvas')?.dataset.commanderFx;
  return raw && JSON.parse(raw)[key] === n;
}, [key,n], {timeout:12000});
const read = () => page.locator('canvas').evaluate(el => JSON.parse(el.dataset.commanderFx));
const step = (n) => page.evaluate(n => window.commanderFxHarness.step(n), n);
const cast = (side = 'ally') => page.evaluate(side => {
  const f = window.commanderFxHarness;
  const t = f.battle.t;
  const before = f.cast(side);
  const wave = f.battle.waves[side];
  const target = f.battle.units.find(u => u.uid === wave.uid);
  return {t, pulseAt: wave.lastPulseAt, pulses: wave.pulses, gained: target.hp - before, want: Math.round(target.maxHp * .15)};
}, side);
function checkAxis({top, hit, middle, sourceNdcY, leadY}, name) {
  assert.ok(top[1] - hit[1] > 2.5, `${name}: ray must start well above the target`);
  assert.ok(sourceNdcY > 1, `${name}: source must project above the battlefield, not onto a rival`);
  assert.deepEqual([top[0],top[2]],[hit[0],hit[2]], `${name}: sky origin must be directly above the target`);
  assert.ok(Math.abs(middle[1] - (top[1] + hit[1]) / 2) < .01);
  assert.ok(Math.hypot(middle[0] - hit[0], middle[2] - hit[2]) > .08, `${name}: the filament curves around the axis`);
  assert.ok(Math.abs(leadY - hit[1]) < .01, `${name}: full ray reaches the marked ally immediately`);
}
try {
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1`);
  await rendered('traps',2);
  await step(7);
  await page.waitForFunction(() => {
    const fx = JSON.parse(document.querySelector('canvas').dataset.commanderFx);
    return fx.trapMeasures.length === 2 && fx.trapMeasures.every(m => m.snap === 1 && m.gap <= .13);
  });
  const held = (await read()).trapMeasures;
  for (const {size, snap, jawY} of held) {
    assert.equal(snap, 1, 'both actual targets have locked jaws');
    assert.ok(size[0] >= 1.24 && size[0] <= 1.50 && size[2] >= 1.08 && size[2] <= 1.45 && size[1] >= .073,
      `the curved well spans the target tile and has a raised bank: ${size}`);
    assert.ok(jawY > .07 && jawY < .16, 'the teeth stay around the feet while holding');
  }
  if (shots) {
    // Let the generic deployment rings clear; battle time remains fixed.
    await page.waitForTimeout(950);
    await shot('01-trap-hold');
  }
  await step(23); // exactly the gameplay release at 3s
  await page.waitForFunction(() => window.commanderFxHarness.battle.units.filter(u => u.vuln > 0).length === 2);
  await step(1);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).trapMeasures.every(m => m.gap > .40));
  const release = (await read()).trapMeasures;
  assert.equal(release.length,2);
  assert.ok(release.every((m, i) => m.jawY > held[i].jawY + .06), 'both jaws visibly lift to release');
  await shot('01-trap-release');
  await step(2);
  await page.waitForFunction(() => {
    const m = JSON.parse(document.querySelector('canvas').dataset.commanderFx).trapMeasures;
    return m.length === 2 && m.every(trap => trap.size[2] < .56);
  });
  const folded = (await read()).trapMeasures;
  assert.ok(folded.length === 2 && folded.every(m => m.size[2] < .56), 'the split caves in before disappearing');
  await step(7);
  await rendered('traps',0);
  await rendered('rays',0);

  await page.evaluate(() => window.commanderFxHarness.arm());
  await rendered('marks',1);
  assert.equal((await read()).rays,0, 'a healthy mark has a ward, not a premature ray');
  await shot('02-armed-ward');
  const first = await page.evaluate(() => {
    const f = window.commanderFxHarness;
    const before = f.crossThreshold(); // observe this very tick, without stepping again
    const wave = f.battle.waves.ally;
    const target = f.battle.units.find(u => u.uid === wave.uid);
    return {t: f.battle.t, pulseAt: wave.lastPulseAt, pulses: wave.pulses,
      uid: target.uid, hp: target.hp, maxHp: target.maxHp, threshold: before - Number(f.battle.pops.at(-2).text)};
  });
  const gain = Math.round(first.maxHp * .15);
  assert.equal(first.threshold / first.maxHp, .5, 'the crossing hit leaves exactly 50% HP');
  assert.ok(first.threshold > 50, 'the percentage threshold is not a flat 50 HP');
  assert.equal(first.pulseAt, first.t);
  assert.equal(first.pulses, 1);
  assert.equal(first.hp, first.threshold + gain);
  await rendered('rays',1);
  const instant = (await read()).rayAxes[0];
  checkAxis(instant, '0s ally');
  assert.equal(instant.age, 0);
  assert.ok(instant.prismWidth >= .2 && instant.motes > 0, 'the full prism and arrival glints start immediately');
  assert.equal(instant.bandProgress, 0, 'the moving band starts at the sky, after the heal is already visible');
  assert.equal(await page.locator('[data-heal-source="oracle"]').innerText(), `+${gain} HP`);
  const bar = await page.locator(`[data-unit-id="${first.uid}"][data-heal-receive="oracle"] .ov-hp i`).evaluate(el => ({
    declared: el.style.width, ratio: el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width,
  }));
  assert.equal(bar.declared, `${Math.round(first.hp / first.maxHp * 100)}%`, 'the first rendered pulse already has the post-heal HP');
  assert.ok(Math.abs(bar.ratio - first.hp / first.maxHp) < .015, 'the bar itself snaps, not just its declared width');
  await shot('03-instant-prism');
  await step(3);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).rayAxes[0]?.bandProgress > .24);
  const moved = (await read()).rayAxes[0];
  assert.ok(Math.abs(moved.middle[0] - instant.middle[0]) > .01 && Math.abs(moved.middle[2] - instant.middle[2]) > .01,
    'refraction changes phase in both horizontal axes');
  await shot('04-prism-descent');

  await page.evaluate(() => window.commanderFxHarness.fall());
  await rendered('souls',1);
  await rendered('departureRings',1);
  await shot('05-last-spark-departure');
  await step(2);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).threads >= 2);
  await shot('06-last-spark-flight');
  await step(3);
  await rendered('souls',0);
  await rendered('landingRings',1);
  assert.ok((await read()).landingFlecks > 0);
  assert.match(await page.locator('[data-heal-source="spark"]').innerText(), /^\+\d+ HP$/, 'amber seal lands with the healing tick');
  await step(2);
  await rendered('rays',0);
  await shot('07-last-spark-arrival');
  await step(2);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).charges[0] > .21);
  await step(2);
  await rendered('rays',1);
  assert.equal(await page.evaluate(() => window.commanderFxHarness.battle.waves.ally.pulses), 2);
  await step(46);
  await rendered('landingRings',0);
  await rendered('smoke',1);
  assert.deepEqual((await read()).impactTiles, [9, 0], 'the last pulse illuminates the real 3×3');
  await shot('08-green-impact');
  assert.equal(await page.evaluate(() => window.commanderFxHarness.battle.waves.ally.pulses),4);
  await step(17);
  await rendered('smoke',0);
  await rendered('rays',0);

  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1&mirror`);
  await rendered('rays',0);
  for (const side of ['ally', 'foe']) {
    const first = await cast(side);
    assert.equal(first.pulses, 1);
    assert.equal(first.pulseAt, first.t, 'marking a living ally already at 50% heals in the mark call');
    assert.equal(first.gained, first.want);
  }
  await rendered('rays',2);
  const [ally, foe] = (await read()).rayAxes;
  checkAxis(ally, 'mirror ally'); checkAxis(foe, 'mirror foe');
  assert.notEqual(ally.hit[2], foe.hit[2]);
  await page.setViewportSize({width:390,height:510});
  await page.waitForFunction(() => document.querySelector('canvas').clientWidth === 390);
  const [portraitAlly, portraitFoe] = (await read()).rayAxes;
  checkAxis(portraitAlly, 'portrait ally'); checkAxis(portraitFoe, 'portrait foe');
  await shot('09-portrait-mirror');
  await page.evaluate(() => window.commanderFxHarness.edgeMark());
  await step(60);
  await rendered('smoke',2);
  assert.deepEqual((await read()).impactTiles, [4, 9], 'the final nine-tile pattern clips at the board corner');

  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2, lang:'en', motion:'reduced', potato:true})));
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1`);
  await rendered('traps',2);
  await rendered('debris',0);
  assert.ok((await read()).trapMeasures.every(m => m.size[0] > 1.24 && m.snap === 1), 'quiet traps keep the carved footprint and hold pose');
  assert.equal(await page.locator('canvas').getAttribute('data-render-potato'),'1');
  await page.evaluate(() => { const f=window.commanderFxHarness; f.step(40); f.cast(); f.fall(); f.step(2); });
  await rendered('souls',1);
  await rendered('threads',0);
  await rendered('rays',1);
  const quiet = (await read()).rayAxes[0];
  checkAxis(quiet, 'reduced/Potato ally');
  assert.ok(quiet.segments < instant.segments, 'lower-budget mode omits the supplemental strand');
  assert.equal(quiet.prismWidth, 0);
  assert.equal(quiet.motes, 0);
  await shot('10-reduced-potato');
  await step(60);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).impactTiles[0] === 9);
  assert.equal((await read()).smoke, 0, 'Potato keeps the footprint but sheds the fog');
  assert.deepEqual(errors,[]);
  console.log('commander-fx: PASS — larger carved traps and timed release, marked ward and instant prism, travelling soul and same-tick halo, clipped 3×3, reduced motion and Potato');
} finally { await browser.close(); }
