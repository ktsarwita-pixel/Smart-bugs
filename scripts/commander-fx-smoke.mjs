/** Drive the rendered jaws, overhead spiral, Last Spark and final 3×3 impact. */
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
}, [key,n], {timeout:10000});
const read = () => page.locator('canvas').evaluate(el => JSON.parse(el.dataset.commanderFx));
const step = (n) => page.evaluate(n => window.commanderFxHarness.step(n), n);
const cast = (side) => page.evaluate(side => window.commanderFxHarness.cast(side), side);
function checkAxis({ top, hit, middle, sourceNdcY }, name) {
  assert.ok(top[1] - hit[1] > 2.5, `${name}: ray must start well above the target`);
  assert.ok(sourceNdcY > 1, `${name}: source must project above the battlefield, not onto a far-away bug`);
  assert.deepEqual([top[0],top[2]],[hit[0],hit[2]], `${name}: sky origin must be directly over the target`);
  assert.ok(Math.abs(middle[1] - (top[1] + hit[1]) / 2) < .01);
  assert.ok(Math.hypot(middle[0] - hit[0], middle[2] - hit[2]) > .15, `${name}: ray must curve, not just point straight down`);
}
try {
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1`);
  await rendered('traps',2);
  await step(4);
  await shot('01-toothed-traps');
  await step(36);
  await rendered('traps',0);
  await cast();
  await rendered('rays',0); // the ray grows in from the top on its first beat
  await step(1);
  await rendered('rays',1);
  const descent = (await read()).rayAxes[0];
  checkAxis(descent, 'ally');
  assert.ok(descent.leadY > descent.hit[1] + 1, 'the leading edge first travels from the sky');
  await step(3);
  await page.waitForFunction(n => {
    const axis = JSON.parse(document.querySelector('canvas').dataset.commanderFx).rayAxes[0];
    return axis && axis.segments > n && Math.abs(axis.leadY - axis.hit[1]) < .02;
  }, descent.segments);
  const landed = (await read()).rayAxes[0];
  assert.ok(Math.abs(landed.middle[0] - descent.middle[0]) > .02 && Math.abs(landed.middle[2] - descent.middle[2]) > .02, 'phase varies in both horizontal axes');
  await shot('02-overhead-spiral');

  await page.evaluate(() => { const f=window.commanderFxHarness; f.fall(); f.step(2); });
  await rendered('souls',3);
  await rendered('departureRings',1);
  await shot('03-white-soul');
  await step(3);
  await rendered('souls',0);
  await rendered('landingRings',1);
  await shot('04-last-spark-arrival');
  await step(51);
  await rendered('landingRings',0);
  await rendered('smoke',1);
  await shot('05-green-impact');
  assert.equal(await page.evaluate(() => window.commanderFxHarness.battle.waves.ally.pulses),4);
  await step(17);
  await rendered('smoke',0);
  await rendered('rays',0);

  // In a duel, the rival's sky source is also above its own marked ally.
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1&mirror`);
  await rendered('rays',0);
  await cast('ally'); await cast('foe'); await step(4);
  await rendered('rays',2);
  const [ally, foe] = (await read()).rayAxes;
  checkAxis(ally, 'mirror ally'); checkAxis(foe, 'mirror foe');
  assert.notEqual(ally.hit[2], foe.hit[2]);

  // Reduced Motion + Potato keep both skills readable with fewer FX instances.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2, lang:'en', motion:'reduced', potato:true})));
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1`);
  await rendered('traps',2);
  await rendered('debris',0);
  assert.equal(await page.locator('canvas').getAttribute('data-render-potato'),'1');
  await page.evaluate(() => { const f=window.commanderFxHarness; f.step(40); f.cast(); f.fall(); f.step(2); });
  await rendered('souls',1);
  await rendered('rays',1);
  const quiet = (await read()).rayAxes[0];
  checkAxis(quiet, 'reduced/Potato ally');
  assert.ok(quiet.segments < landed.segments, 'lower-budget mode omits the supplemental strand');
  await shot('06-reduced-potato');
  await step(60);
  await rendered('smoke',1);
  assert.deepEqual(errors,[]);
  console.log('commander-fx: PASS — trap jaws, sky descent and both ray axes, souls and landing halo, 3×3 impact, reduced motion and Potato');
} finally { await browser.close(); }
