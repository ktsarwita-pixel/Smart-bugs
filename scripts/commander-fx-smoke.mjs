/** Drive the rendered teeth, blue beam, white souls, and final green smoke. */
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
try {
  await page.goto(`${base}/scripts/commander-fx-harness.html?doctor=1`);
  await rendered('traps',2);
  await page.waitForTimeout(900); // settle the camera and plinths
  await page.evaluate(() => window.commanderFxHarness.step(2));
  await shot('01-toothed-traps');
  await page.evaluate(() => { const f=window.commanderFxHarness; f.step(38); f.cast(); f.step(3); });
  await rendered('traps',0);
  await rendered('rays',1);
  await shot('02-light-blue-ray');
  await page.evaluate(() => { const f=window.commanderFxHarness; f.fall(); f.step(2); });
  await rendered('souls',3);
  await shot('03-white-soul');
  await page.evaluate(() => window.commanderFxHarness.step(61));
  await rendered('smoke',1);
  await shot('04-green-smoke');
  assert.equal(await page.evaluate(() => window.commanderFxHarness.battle.waves.ally.pulses),4);
  await page.evaluate(() => window.commanderFxHarness.step(17));
  await rendered('smoke',0);

  // Reduced motion and Potato keep the skills legible, without the full trail.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2, lang:'en', motion:'reduced', potato:true})));
  await page.reload();
  await rendered('traps',2);
  assert.equal(await page.locator('canvas').getAttribute('data-render-potato'),'1');
  await page.evaluate(() => { const f=window.commanderFxHarness; f.step(40); f.cast(); f.fall(); f.step(3); });
  await rendered('souls',1);
  await rendered('rays',1);
  await page.evaluate(() => window.commanderFxHarness.step(60));
  await rendered('smoke',1);
  await shot('05-reduced-potato');
  assert.deepEqual(errors,[]);
  console.log('commander-fx: PASS — trap jaws, ray, white soul, 3×3 smoke, reduced motion and Potato');
} finally { await browser.close(); }
