/** Play the real app through delayed payouts, spending, bench targeting, and a live mark. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';

const base = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
page.setDefaultTimeout(12000);
await page.emulateMedia({reducedMotion:'reduce'});
await page.addInitScript(() => {
  sessionStorage.setItem('smartbugs.admin.unlocked','1');
  localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2, lang:'en', motion:'reduced', resolution:'low'}));
  localStorage.setItem('smartbugs.speed','1');
  // Keep forced-outcome rounds in their built-in pre-roll until the admin
  // action. The live targeting case below uses the normal combat clock.
  const timer = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay, ...args) => timer(fn, window.__holdPreRoll && delay === 640 ? 60000 : delay, ...args);
});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, {recursive:true});
const shot = async (name) => { if (shots) await page.screenshot({path:`${shots}/${name}.png`}); };
const button = (name) => page.getByRole('button',{name,exact:true});
const control = page.locator('.commander-control');
const status = control.locator('.commander-control__status');
const skill = control.locator('.commander-control__skill');
const picker = control.getByRole('combobox');
const result = page.locator('.result-card');
const bench = page.locator('.bench-slot[data-skill-target="true"]');
const combat = page.locator('.combat-scroll');
const engage = async () => { await page.getByRole('button',{name:/Engage battle/}).tap(); await combat.waitFor(); };
const next = async () => { await result.locator('.result-next').tap(); await page.locator('.prep-dock .commander-control').waitFor(); };
const noBonds = async () => assert.equal(await page.locator('.bonds-bar, .bond-chip, .bond-mini').count(),0);
const pause = () => button('Open admin panel').first().tap();
const close = () => button('Close admin panel').tap();

async function start(name, query = '?doctor=1', beforePlay) {
  await page.goto(`${base}/${query}`, {waitUntil:'domcontentloaded'});
  await button('PLAY MATCH').waitFor();
  assert.equal(await page.locator('.advanced-banner').count(),Number(query.includes('advenced')));
  await page.evaluate(hold => { window.__holdPreRoll = hold; }, name !== 'Hyber Lantern');
  if (beforePlay) await beforePlay();
  await button('PLAY MATCH').tap();
  await button(name).tap();
  await button('BEGIN ROUND 1').first().tap();
  await control.waitFor();
  await noBonds();
}
async function admin(cmds) {
  await pause();
  const input = page.locator('#admin-command-input');
  if (!await input.isVisible()) await page.getByRole('button',{name:/ADVANCED — TYPE COMMANDS/}).tap();
  for (const cmd of cmds) {
    await input.fill(cmd);
    await input.press('Enter');
  }
  await close();
}
async function force(win, inBattle = false) {
  if (!inBattle) await engage();
  await pause();
  await page.getByRole('tab',{name:'MATCH',exact:true}).tap();
  await button(win ? 'FORCE WIN' : 'FORCE LOSE').tap();
  await close();
  await result.waitFor();
  assert.equal(await result.getAttribute('data-win'),win ? '1' : '0');
}
const statusMatches = async (pattern) => assert.match(await status.innerText(),pattern);

try {
  await start('Ancient Scavanger','?doctor=1', async () => {
    await button('FIELD GUIDE').tap();
    const guide = page.getByRole('dialog',{name:'SPECIMEN FIELD GUIDE'});
    const commanderTab = guide.getByRole('button',{name:'COMMANDERS'});
    await commanderTab.tap();
    assert.match(await guide.innerText(),/Recurrent heals of waves/i);
    await guide.getByRole('button',{name:'TACTICS'}).tap();
    assert.doesNotMatch(await guide.innerText(),/Colony Bonds|Shield Wall|Night Signal/);
    await guide.getByRole('button',{name:'CLOSE'}).tap();
  });
  await admin(['give stag 1','give spider 2']);
  await page.locator('.bench-slot').nth(0).tap();
  for (let i = 0; i < 3; i++) {
    await force(false);
    assert.equal(await result.getByText('Pressure present arrives after the next round.',{exact:true}).count(),i === 2 ? 1 : 0);
    await noBonds();
    await next();
  }
  await force(true);
  assert.match(await result.locator('.pressure-result').innerText(),/Pressure present.*\+25G.*2 × Spider \(1★\)/s);
  await shot('queen-pressure');
  await next();
  assert.equal(await page.locator('.bench-slot').filter({has:page.locator('.spec-icon')}).count(),3,'two recruits and original bench Spider');
  await force(true);
  assert.equal(await result.locator('.pressure-result').count(),0,'pressure reward is not repeated');
  await next();
  await statusMatches(/Uses: 1 · Ready/);
  await skill.tap();
  const before = Number(await page.locator('.deck-resources .gold-flash').innerText());
  await bench.first().tap();
  assert.equal(Number(await page.locator('.deck-resources .gold-flash').innerText()) - before,6);
  assert.equal(await page.locator('.bench-slot').filter({has:page.locator('.spec-icon')}).count(),3,'Incomes does not consume its target');
  assert.ok(await skill.isDisabled());
  await statusMatches(/Ready in 2 rd/);
  await force(true); await next();
  await statusMatches(/Ready in 1 rd/);
  await force(true); await next();
  await statusMatches(/Uses: 1 · Ready/);
  assert.ok(await skill.isEnabled());
  console.log('PASS Queen pressure at round four, payout, non-consuming 6G and two-round cooldown');

  await start('World Worm','?advenced=1&doctor=1');
  await admin(['give stag 1','give bomb 2']);
  await page.locator('.bench-slot').nth(0).tap();
  await statusMatches(/0\/5 uses/);
  await engage();
  await page.waitForFunction(() => JSON.parse(document.querySelector('.battle-stage canvas')?.dataset.commanderFx ?? '{}').traps === 2);
  assert.match(await page.locator('.combat-toolbar').innerText(),/2 TRAPPED/i);
  await force(true,true); await next();
  await force(true); await next();
  await force(true); await next();
  await statusMatches(/1\/5 uses/);
  await skill.tap();
  const options = await picker.locator('option:not([disabled])').allTextContents();
  assert.equal(options.length,1);
  assert.match(options[0],/Bombardier.*2★.*BENCH/);
  await page.keyboard.press('Escape');
  assert.equal(await picker.count(),0,'Escape cancels targeting');
  await skill.tap();
  await bench.first().tap();
  assert.equal(await page.locator('.bench-slot').filter({has:page.locator('.spec-icon')}).count(),2);
  await statusMatches(/0\/5 uses/);
  console.log('PASS World Worm opening pair and a bench-only use below storage capacity');

  await start('Hyber Lantern');
  await admin(['give stag 1','give mantis 1','give bomb 2']);
  await page.locator('.bench-slot').nth(0).tap();
  await page.locator('.bench-slot').nth(1).tap();
  await skill.tap();
  const opts = await picker.locator('option:not([disabled])').allTextContents();
  assert.equal(opts.length,2,'Oracle marks deployed bugs only');
  const stagUid = await picker.locator('option:not([disabled])').first().getAttribute('value');
  await picker.selectOption(stagUid);
  await statusMatches(/Marked: .*STAG/);
  await engage();
  await statusMatches(/Marked: .*STAG/);
  await skill.tap();
  const other = await picker.locator(`option:not([disabled]):not([value="${stagUid}"])`).getAttribute('value');
  const target = page.locator(`[data-unit-id="${other}"][data-skill-point]`);
  await target.waitFor({state:'attached'});
  await page.evaluate(() => window.scrollTo(0,0));
  const unitPoint = await target.evaluate(el => {
    const canvas = document.querySelector('.battle-stage canvas');
    const rect = canvas.getBoundingClientRect(), [x,y] = JSON.parse(el.dataset.skillPoint);
    return {x: rect.left + x, y: rect.top + y, hitsCanvas: document.elementFromPoint(rect.left + x,rect.top + y) === canvas};
  });
  assert.ok(unitPoint.hitsCanvas, `target point must meet canvas: ${JSON.stringify(unitPoint)}`);
  await page.touchscreen.tap(unitPoint.x,unitPoint.y);
  await statusMatches(/Marked: .*MANTIS/);
  await noBonds();
  await shot('oracle-mark-mobile');
  assert.equal(await picker.count(),0,'committing a mark closes the picker');
  await result.waitFor({timeout:65000});
  await next();
  await statusMatches(/Once per battle · ≤50 HP/);
  assert.equal(await skill.getAttribute('aria-pressed'),'false','next round starts with a fresh mark and no targeting');
  assert.deepEqual(errors,[]);
  console.log('PASS Hyber Lantern prep picker, live allied 3D touch target and mark reset; EN catalog clean');
} finally { await browser.close(); }
