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
  await step(6);
  await page.waitForFunction(() => {
    const fx = JSON.parse(document.querySelector('canvas').dataset.commanderFx);
    return fx.trapMeasures.length === 2 && fx.trapMeasures.every(m => m.gap < .03);
  });
  for (const {size} of (await read()).trapMeasures) {
    assert.ok(size[0] < .68 && size[2] < .68 && size[1] < .1, `jaws should stay low and use less than a tile: ${size}`);
  }
  if (shots) {
    // Let the generic deployment rings clear; battle time remains fixed.
    await page.waitForTimeout(950);
    await shot('01-carved-traps');
  }
  await step(25);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).trapMeasures.some(m => m.gap > .07));
  await step(9);
  await rendered('traps',0);
  await rendered('rays',0);

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
  assert.equal(instant.bandProgress, 0, 'the moving band starts at the sky, after the heal is already visible');
  assert.equal(await page.locator('[data-heal-source="oracle"]').innerText(), `+${gain} HP`);
  assert.equal(await page.locator(`[data-unit-id="${first.uid}"] .ov-hp i`).evaluate(el => el.style.width),
    `${Math.round(first.hp / first.maxHp * 100)}%`, 'the first rendered pulse already has the post-heal HP');
  await shot('02-instant-opal');
  await step(3);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commanderFx).rayAxes[0]?.bandProgress > .24);
  const moved = (await read()).rayAxes[0];
  assert.ok(Math.abs(moved.middle[0] - instant.middle[0]) > .01 && Math.abs(moved.middle[2] - instant.middle[2]) > .01,
    'refraction changes phase in both horizontal axes');
  await shot('03-opal-descent');

  await page.evaluate(() => { const f=window.commanderFxHarness; f.fall(); f.step(2); });
  await rendered('souls',1);
  await rendered('departureRings',1);
  assert.ok((await read()).threads >= 2, 'Last Spark leaves a tapered thread');
  await shot('04-soul-thread');
  await step(3);
  await rendered('souls',0);
  await rendered('landingRings',1);
  await step(2);
  await rendered('rays',0);
  await shot('05-last-spark-arrival');
  await step(4);
  await rendered('rays',1);
  assert.equal(await page.evaluate(() => window.commanderFxHarness.battle.waves.ally.pulses), 2);
  await step(47);
  await rendered('landingRings',0);
  await rendered('smoke',1);
  await shot('06-green-impact');
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

  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2, lang:'en', motion:'reduced', potato:true})));
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1`);
  await rendered('traps',2);
  await rendered('debris',0);
  assert.equal(await page.locator('canvas').getAttribute('data-render-potato'),'1');
  await page.evaluate(() => { const f=window.commanderFxHarness; f.step(40); f.cast(); f.fall(); f.step(2); });
  await rendered('souls',1);
  await rendered('threads',0);
  await rendered('rays',1);
  const quiet = (await read()).rayAxes[0];
  checkAxis(quiet, 'reduced/Potato ally');
  assert.ok(quiet.segments < instant.segments, 'lower-budget mode omits the supplemental strand');
  await shot('07-reduced-potato');
  await step(60);
  await rendered('smoke',1);
  assert.deepEqual(errors,[]);
  console.log('commander-fx: PASS — low-profile traps, instant sky ray and travelling band, soul thread, 3×3 impact, reduced motion and Potato');
} finally { await browser.close(); }
