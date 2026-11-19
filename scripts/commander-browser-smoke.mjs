/** Play the real app through delayed payouts, spending, bench targeting, and a live mark. */
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright-core';

const base = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:process.env.WIDE ? {width:1440,height:900} : {width:390,height:844}, isMobile:true, hasTouch:true});
page.setDefaultTimeout(12000);
const dist = process.env.RELEASE_DIST;
if (dist) {
  const original = readFileSync(join(dist, 'index.html'), 'utf8');
  const preview = readFileSync(join(dist, 'preview/index.html'), 'utf8');
  await page.route(url => url.origin === new URL(base).origin, route => route.fulfill({contentType:'text/html',
    body: new URL(route.request().url()).pathname === '/preview/' ? preview : original}));
}
await page.emulateMedia({reducedMotion:'no-preference'});
await page.addInitScript(() => {
  sessionStorage.setItem('smartbugs.admin.unlocked','1');
  localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2, lang:'en', motion:'full', resolution:'low'}));
  localStorage.setItem('smartbugs.speed','1');
  // Keep forced-outcome rounds in their built-in pre-roll until the admin
  // action or retarget before the first heal can spend the mark. Then let
  // the Oracle case finish with the normal combat clock.
  const timer = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay, ...args) => {
    const captureCue = window.__holdCue && (delay === 3210 || delay === 3050);
    const preRoll = window.__holdPreRoll && delay === 640;
    if (!captureCue && !preRoll) return timer(fn, delay, ...args);
    const id = timer(fn, 60000, ...args);
    const release = () => { window.clearTimeout(id); fn(...args); };
    if (captureCue) window.__releaseCue = () => { window.__holdCue = false; release(); };
    else window.__releasePreRoll = release;
    return id;
  };
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
const pressure = result.locator('[data-skill-fx="pressure-present"]');
const cast = (kind) => page.locator(`.spell-fx[data-skill-fx="${kind}"]`);
const animation = (locator) => locator.evaluate(el => getComputedStyle(el).animationName);
const atFrame = (locator, time) => locator.evaluate((el, time) => {
  for (const a of el.getAnimations({subtree:true})) { a.pause(); a.currentTime = time; }
}, time);
const point = (locator) => locator.evaluate(el => {
  const { x,y,width,height } = el.getBoundingClientRect();
  return [x + width / 2, y + height / 2];
});
// Let screenshots set the CSS clock without racing a short expiry timer.
const holdCue = () => page.evaluate(() => { window.__holdCue = true; });
const releaseCue = () => page.evaluate(() => window.__releaseCue());
const engage = async () => { await page.getByRole('button',{name:/Engage battle/}).tap(); await combat.waitFor(); };
const next = async () => { await result.locator('.result-next').tap(); await page.locator('.prep-dock .commander-control').waitFor(); };
const noBonds = async () => assert.equal(await page.locator('.bonds-bar, .bond-chip, .bond-mini').count(),0);
const pause = () => button('Open admin panel').first().tap();
const close = () => button('Close admin panel').tap();

async function start(name, query = '?doctor=1', beforePlay) {
  await page.goto(`${base}/${query}`, {waitUntil:'domcontentloaded'});
  // On the packaged build the query hands off to /preview/ before mounting.
  if (dist && query.includes('advenced')) await page.waitForURL(url => url.pathname === '/preview/');
  await button('PLAY MATCH').waitFor();
  assert.equal(await page.locator('.advanced-banner').count(),Number(query.includes('advenced')));
  await page.evaluate(() => { window.__holdPreRoll = true; });
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
    if (i === 2) {
      assert.equal(await pressure.getAttribute('data-gift'),'sealed');
      assert.equal(await animation(pressure.locator('.pressure-shutter').first()),'vault-seal');
      if (shots) { await atFrame(pressure, 760); await shot('scavanger-vault-sealed'); }
    }
    await noBonds();
    await next();
  }
  await force(true);
  assert.match(await pressure.innerText(),/Pressure present.*\+25G.*2 × Spider \(1★\)/s);
  assert.equal(await pressure.getAttribute('data-gift'),'open');
  assert.equal(await animation(pressure.locator('.pressure-shutter').first()),'vault-unseal');
  const [locked, open] = await pressure.locator('.pressure-shutter').first().evaluate(el => {
    const move = el.getAnimations()[0];
    move.pause(); move.currentTime = 100;
    const locked = getComputedStyle(el).transform;
    move.currentTime = 840;
    const open = getComputedStyle(el).transform;
    move.finish();
    return [locked,open];
  });
  assert.notEqual(locked,open,'the vault actually opens across the payout sequence');
  assert.equal(await pressure.locator('.pressure-specimens .spec-icon').count(),2);
  if (shots) { await atFrame(pressure, 920); await shot('scavanger-vault-payout'); }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await animation(pressure.locator('.pressure-shutter').first()),'none','reduced motion keeps a static open vault');
  assert.equal(await pressure.locator('.pressure-specimens .spec-icon').count(),2);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await next();
  assert.equal(await page.locator('.bench-slot').filter({has:page.locator('.spec-icon')}).count(),3,'two recruits and original bench Spider');
  await force(true);
  assert.equal(await result.locator('.pressure-result').count(),0,'pressure reward is not repeated');
  await next();
  await statusMatches(/Uses: 1 · Ready/);
  await skill.tap();
  const before = Number(await page.locator('.deck-resources .gold-flash').innerText());
  await bench.first().scrollIntoViewIfNeeded();
  const [x,y] = await point(bench.first());
  const targetUid = await bench.first().getAttribute('data-unit-id');
  const [bankX,bankY] = await point(page.locator('.deck-resources .gold-flash').locator('..'));
  await holdCue();
  await bench.first().tap();
  const mint = cast('incomes');
  const income = await mint.evaluate((el, uid) => {
    const at = node => { const r = node.getBoundingClientRect(); return [r.x + r.width / 2,r.y + r.height / 2]; };
    const sample = (node, ms, name) => {
      const a = node.getAnimations().find(a => !name || a.animationName === name);
      a.pause(); a.currentTime = ms;
      return at(node);
    };
    const avatar = el.querySelector('.mint-avatar'), whole = el.querySelector('.mint-metal__whole');
    const start = sample(avatar, 0), lifted = sample(avatar, 645);
    sample(whole, 380, 'mint-gild'); const color = getComputedStyle(whole).clipPath;
    sample(whole, 870, 'mint-gild'); const gilded = getComputedStyle(whole).clipPath;
    const carrier = el.querySelector('.mint-coin');
    const {delay, duration} = carrier.getAnimations()[0].effect.getTiming();
    const depart = sample(carrier, delay), during = sample(carrier, delay + 405), end = sample(carrier, delay + duration);
    const base = document.querySelector(`.bench-slot[data-unit-id="${uid}"] .spec-icon__plate svg`);
    const svg = el.querySelector('.mint-ink');
    const pixels = svg => [...new Set([...svg.querySelectorAll('rect[height="1"]')]
      .filter(r => r.getAttribute('fill') !== '#090705')
      .flatMap(r => Array.from({length:Number(r.getAttribute('width'))}, (_, i) => `${Number(r.getAttribute('x')) + i},${r.getAttribute('y')}`)))].sort().join(' ');
    const shape = [...el.querySelector('defs [id$="-shape"]').getAttribute('d').matchAll(/M(\d+) (\d+)h1v1h-1Z/g)]
      .map(([,x,y]) => `${x},${y}`).sort().join(' ');
    const chips = [...el.querySelectorAll('.mint-piece use')];
    return { pointer: getComputedStyle(el).pointerEvents, type: el.dataset.specimen,
      carriers: el.querySelectorAll('.mint-coin').length, sameArt: pixels(svg) === shape && pixels(base) === shape,
      chips: chips.length, sameGold: chips.every(use => use.getAttribute('href') === el.querySelector('.mint-metal__whole use').getAttribute('href')),
      color, gilded, start, lifted, depart, during, end, credit: el.querySelector('.mint-credit').textContent };
  }, targetUid);
  const distance = ([x,y],[sx,sy]) => Math.hypot(x - sx, y - sy);
  assert.equal(income.pointer,'none');
  assert.equal(income.type,'spider');
  assert.equal(income.sameArt,true,'the live slot, lift and metal all show its exact specimen silhouette');
  assert.notEqual(income.color, income.gilded, 'the metal sweeps across the actual art');
  assert.equal(income.chips,8);
  assert.ok(income.sameGold, 'each chip carries a piece of that same SVG');
  assert.equal(income.carriers,6);
  assert.equal(income.credit,'+6G');
  assert.ok(distance(income.start, [x,y]) < 8 && distance(income.start,income.lifted) > 75, 'a large portrait lift begins at the bench bug');
  assert.ok(distance(income.depart,income.lifted) < 3 && distance(income.depart,income.during) > 30, 'coins really leave the fractured art');
  assert.ok(distance(income.end,[bankX,bankY]) < 8, 'the flight lands at the Gold counter');
  if (shots) {
    for (const [phase, time] of [['lift', 290], ['gilded', 950], ['shatter', 1420], ['transfer', 1810], ['credit', 2260]]) {
      await atFrame(mint, time); await shot(`scavanger-incomes-${phase}`);
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => document.querySelector('.mint-fx')?.dataset.quiet === 'true');
  assert.equal(await animation(mint.locator('.mint-metal__whole')), 'none');
  assert.equal(await mint.locator('.mint-metal').isVisible(), true, 'Reduced Motion still has a visible gold bug');
  assert.equal(await mint.locator('.mint-coin').count(), 0);
  assert.equal(await mint.locator('.mint-credit').isVisible(), true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await releaseCue();
  await cast('incomes').waitFor({state:'detached'});
  assert.equal(Number(await page.locator('.deck-resources .gold-flash').innerText()) - before,6);
  assert.equal(await page.locator('.bench-slot').filter({has:page.locator('.spec-icon')}).count(),3,'Incomes does not consume its target');
  assert.ok(await skill.isDisabled());
  await statusMatches(/Ready in 2 rd/);
  await force(true); await next();
  await statusMatches(/Ready in 1 rd/);
  await force(true); await next();
  await statusMatches(/Uses: 1 · Ready/);
  assert.ok(await skill.isEnabled());
  await skill.tap();
  const boardId = await picker.locator('option').filter({hasText:/STAG.*DRAWER/i}).getAttribute('value');
  const boardPoint = await page.locator(`.ov-unit[data-unit-id="${boardId}"][data-skill-point]`).evaluate(el => {
    const canvas = document.querySelector('.battle-stage canvas').getBoundingClientRect();
    const [x, y] = JSON.parse(el.dataset.skillPoint);
    return [canvas.left + x, canvas.top + y];
  });
  const bank = page.locator('.deck-resources .gold-flash').locator('..');
  const oldGold = Number(await bank.locator('.gold-flash').textContent());
  // Make the bank unavailable without changing the actual gold balance or
  // shifting the drawer during the local-credit test.
  await bank.evaluate(el => { el.style.translate = '200vw 0'; });
  await holdCue();
  await picker.selectOption(boardId);
  const local = cast('incomes');
  const mintPoint = await local.locator('[data-cast-origin]').evaluate(el => [parseFloat(el.style.left), parseFloat(el.style.top)]);
  assert.ok(Math.hypot(mintPoint[0] - boardPoint[0], mintPoint[1] - boardPoint[1]) < 8, 'a deployed target starts at the 3D body, not the health label');
  assert.equal(await local.getAttribute('data-specimen'),'stag');
  assert.equal(await local.getAttribute('data-local-credit'),'true');
  const localEnd = (await local.locator('.mint-coin').first().getAttribute('data-destination')).split(',').map(Number);
  assert.deepEqual(localEnd,mintPoint, 'the offscreen bank falls back to collecting over the target');
  assert.equal(Number(await bank.locator('.gold-flash').textContent()) - oldGold, 3);
  assert.equal(await page.locator(`.ov-unit[data-unit-id="${boardId}"]`).count(),1,'the gilded deployed bug stays in play');
  await bank.evaluate(el => { el.style.translate = ''; });
  if (shots) { await atFrame(local, 930); await shot('scavanger-incomes-drawer'); }
  await releaseCue();
  console.log('PASS Ancient Scavanger vault, bench and deployed gilding, coin flights to Gold, local credit and cooldown');

  await page.setViewportSize({width:390,height:844});
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
  const bittenUid = await bench.first().getAttribute('data-unit-id');
  const eatenSlot = await bench.first().evaluate(el => [...document.querySelectorAll('.bench-slot')].indexOf(el));
  await holdCue();
  await bench.first().tap();
  const feed = cast('eat-spit');
  const grid = page.locator('.bench-grid');
  const arrivals = grid.locator('.worm-arrival > .spec-icon');
  await feed.waitFor();
  // Ensure the effect plays by itself before seeking for the visual checks.
  await page.waitForFunction(() => document.querySelector('.feed-worm')?.getAnimations().some(a => a.currentTime > 240));
  assert.equal(await feed.locator('.feed-worm').evaluate(el => getComputedStyle(el).animationName),'feed-rise');
  assert.equal(await feed.evaluate(el => getComputedStyle(el).pointerEvents),'none');
  assert.equal(await page.locator(`.bench-slot[data-unit-id="${bittenUid}"]`).count(),0,'the meal really leaves the roster');
  assert.equal(await arrivals.count(),2,'only real bench recruits take part');
  await atFrame(feed, 655);
  const gape = await feed.locator('.feed-worm').evaluate(el => {
    const [u,l] = el.querySelectorAll('.feed-worm__upper, .feed-worm__lower');
    const box = el.getBoundingClientRect();
    return [l.getBoundingClientRect().top - u.getBoundingClientRect().bottom, box.width, box.height];
  });
  assert.ok(gape[1] > 140 && gape[2] > 125, 'the Worm rises visibly above the bench rather than staying clipped in its socket');
  if (shots) { await atFrame(grid, 655); await shot('worm-feed-open'); }
  await atFrame(feed, 850);
  const shut = await feed.locator('.feed-worm').evaluate(el => {
    const [u,l] = el.querySelectorAll('.feed-worm__upper, .feed-worm__lower');
    return l.getBoundingClientRect().top - u.getBoundingClientRect().bottom;
  });
  assert.ok(shut < gape[0] - 20, 'both jaws actually snap shut');
  if (shots) { await atFrame(grid, 850); await shot('worm-feed-bite'); }
  const flights = await feed.locator('.feed-recruit').evaluateAll((recruits, fromSlot) => {
    const slot = i => document.querySelector(`.bench-slot[data-bench-slot="${i}"]`);
    const center = node => { const r = node.getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2]; };
    const near = ([x,y],[u,v]) => Math.hypot(x-u,y-v);
    return recruits.map(el => {
      const {toSlot,unit} = el.dataset;
      const a = el.getAnimations().find(a => a.animationName === 'spell-flight');
      const {delay,duration} = a.effect.getTiming();
      a.pause(); a.currentTime = delay;
      const mouth = center(el);
      a.currentTime = delay + duration * .45;
      const moved = near(mouth, center(el));
      a.currentTime = delay + duration;
      return {slot: Number(toSlot), mouthAbove: center(slot(fromSlot))[1] - mouth[1], moved,
        miss: near(center(slot(toSlot)),center(el)), real: slot(toSlot).dataset.unitId === unit && !!slot(toSlot).querySelector('[data-skill-arrival]')};
    });
  }, eatenSlot);
  assert.equal(new Set(flights.map(f => f.slot)).size,2);
  assert.ok(flights.every(f => f.real && f.mouthAbove > 65 && f.moved > 21 && f.miss < 3), JSON.stringify(flights));
  if (shots) {
    await atFrame(feed, 1385); await atFrame(grid, 1385); await shot('worm-feed-launch');
    await atFrame(feed, 1870); await atFrame(grid, 1870); await shot('worm-feed-land');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => document.querySelector('.feed-fx')?.dataset.quiet === 'true');
  assert.equal(await animation(arrivals.first()), 'none');
  assert.equal(await feed.locator('.feed-worm').isVisible(), true, 'Reduced Motion keeps a visible Worm instead of hiding it');
  assert.equal(await feed.locator('.feed-recruit').count(),0);
  assert.equal(await arrivals.count(), 2, 'quiet mode keeps the actual arrivals');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await releaseCue();
  await feed.waitFor({state:'detached'});
  assert.equal(await page.locator('.bench-slot').filter({has:page.locator('.spec-icon')}).count(),2);
  await statusMatches(/0\/5 uses/);
  console.log('PASS World Worm: two real battle traps, full Worm emergence, chomp and visible arcs into real recruit slots');

  await page.emulateMedia({reducedMotion:'reduce'});
  await start('Hyber Lantern');
  await admin(['give stag 1','give mantis 1','give bomb 2']);
  await page.locator('.bench-slot').nth(0).tap();
  await page.locator('.bench-slot').nth(1).tap();
  await skill.tap();
  const opts = await picker.locator('option:not([disabled])').allTextContents();
  assert.equal(opts.length,2,'Oracle marks deployed bugs only');
  const stagUid = await picker.locator('option:not([disabled])').first().getAttribute('value');
  await picker.selectOption(stagUid);
  await statusMatches(/Marked: .*STAG · ≤50% HP/);
  await page.waitForFunction(() => JSON.parse(document.querySelector('.battle-stage canvas')?.dataset.commanderFx ?? '{}').marks === 1);
  await engage();
  await statusMatches(/Marked: .*STAG · ≤50% HP/);
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
  await statusMatches(/Marked: .*MANTIS · ≤50% HP/);
  await noBonds();
  await shot('oracle-mark-mobile');
  assert.equal(await picker.count(),0,'committing a mark closes the picker');
  await page.evaluate(() => window.__releasePreRoll());
  await result.waitFor({timeout:65000});
  await next();
  await statusMatches(/Once per battle · ≤50% HP/);
  assert.equal(await skill.getAttribute('aria-pressed'),'false','next round starts with a fresh mark and no targeting');
  assert.deepEqual(errors,[]);
  console.log('PASS Hyber Lantern prep picker, live allied 3D touch target and mark reset; EN catalog clean');
} finally { await browser.close(); }
