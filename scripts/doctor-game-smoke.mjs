/** Reproduce the reported in-game Doctor scan while a unit is selected. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 384, height: 725 }, deviceScaleFactor: 1.875, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:5176') + '/?advenced');
  await page.getByRole('button', { name: 'PLAY MATCH' }).tap();
  await page.getByRole('button', { name: 'BEGIN ROUND 1' }).first().tap();
  const stageMetrics = () => page.locator('.battle-stage').evaluate(el => ({ y: el.getBoundingClientRect().top + scrollY, h: el.getBoundingClientRect().height, width: el.clientWidth }));
  const checkReportedFit = async state => {
    const metrics = await page.evaluate(() => {
      const rect = el => {const r=el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height};};
      return {viewport:innerHeight, document:document.documentElement.scrollHeight, stage:rect(document.querySelector('.battle-stage')), dock:rect(document.querySelector('.game-dock')), actions:[...document.querySelectorAll('.action-bar button')].map(rect)};
    });
    assert.ok(metrics.document <= metrics.viewport + 1, `${state}: unexpected page scroll at reported size: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.stage.height >= 180 && metrics.stage.bottom <= metrics.dock.top + 1, `${state}: board and dock must fit without overlapping`);
    assert.ok(metrics.actions.every(a => a.top >= 0 && a.bottom <= metrics.viewport), `${state}: an action is partially off-screen: ${JSON.stringify(metrics)}`);
  };
  const emptyBoard = await stageMetrics();
  await checkReportedFit('empty prep');
  await page.locator('.shop-grid button:not([disabled])').first().tap();
  assert.deepEqual(await stageMetrics(), emptyBoard, 'buying into bench resized the board');
  await checkReportedFit('bought');
  await page.locator('.selected-actions').getByRole('button', { name: 'DEPLOY' }).tap();
  assert.deepEqual(await stageMetrics(), emptyBoard, 'deploying resized the board');
  await checkReportedFit('deployed');
  await page.locator('.selected-actions').getByRole('button', { name: 'BENCH' }).tap();
  assert.deepEqual(await stageMetrics(), emptyBoard, 'returning to bench resized the board');
  await checkReportedFit('selected');
  await page.locator('.selected-actions').waitFor();
  const board = () => page.locator('.battle-stage').evaluate(el => ({ y: el.getBoundingClientRect().top + scrollY, h: el.getBoundingClientRect().height }));
  const before = await board();
  const ladder = page.locator('.ladder-button').first();
  await ladder.tap();
  assert.equal(await ladder.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await board(), before, 'ladder detail must not resize or move board');
  await page.locator('.ladder-detail button').tap();
  assert.equal(await ladder.getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb-doctor', {detail:true})));
  await page.waitForFunction(() => document.querySelector('.battle-stage canvas')?.dataset.commanderBounds, null, {timeout:10000,polling:100});
  const totem = await page.locator('.battle-stage canvas').evaluate(el => JSON.parse(el.dataset.commanderBounds).ally);
  assert.ok(totem.length === 4 && totem.every(n => n >= 0 && n <= 1), `player commander must remain inside the battlefield: ${totem}`);
  await page.getByRole('button', { name: 'Open UI Doctor' }).tap();
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  const report = await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report, /COVERED[\s\S]*button\.ladder-button/);
  assert.doesNotMatch(report, /TAP[\s\S]*button\.ladder-button/);
  assert.doesNotMatch(report, /button\.vs-plaque/);
  assert.doesNotMatch(report, /Open admin panel/);
  assert.doesNotMatch(report, /AUTO-DEPLOY/);
  assert.doesNotMatch(report, /Inspect bench units/);
  assert.doesNotMatch(report, /bench-inspect/);
  assert.doesNotMatch(report, /HUD elements overlap|HUD element outside its deck|Specimen portrait misaligned|Commander model clipped|Page requires vertical scrolling/);
  // The seal can be centered while the SVG itself is not. Fault-inject the
  // art, then verify Doctor catches it without confusing it with the frame.
  await page.evaluate(() => { document.querySelector('.shop-grid .spec-icon__plate > svg').style.transform = 'translate(6px, 3px)'; });
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  assert.match(await page.locator('.ui-doctor__body').innerText(), /Specimen portrait misaligned/);
  await page.evaluate(() => { document.querySelector('.shop-grid .spec-icon__plate > svg').style.transform = ''; });
  // Deliberately move the decorative (non-interactive) round map over health.
  // A button-only audit would miss precisely the reported failure.
  await page.evaluate(() => {
    const health = document.querySelector('.deck-health').getBoundingClientRect();
    const track = document.querySelector('.round-track--compact');
    const r = track.getBoundingClientRect();
    track.style.transform = `translateX(${health.left - r.left}px)`;
  });
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  const overlapped = await page.locator('.ui-doctor__body').innerText();
  assert.match(overlapped, /HUD elements overlap/);
  assert.match(overlapped, /Colony health overlaps Round map/);
  await page.evaluate(() => { document.querySelector('.round-track--compact').style.transform = ''; });
  await page.getByRole('button', { name: 'Minimize UI Doctor' }).tap();
  // On a truly short phone, preserve scrolling and access rather than forcing
  // the board or the dock to overlap just to suppress a warning.
  await page.setViewportSize({width:320,height:568});
  const short = await page.evaluate(() => {
    const stage=document.querySelector('.battle-stage').getBoundingClientRect(), dock=document.querySelector('.game-dock').getBoundingClientRect();
    return {height:document.documentElement.scrollHeight, stageBottom:stage.bottom, dockTop:dock.top};
  });
  assert.ok(short.height > 568 && short.stageBottom <= short.dockTop + 1, `short phone must scroll without overlapping: ${JSON.stringify(short)}`);
  await page.locator('.action-bar button').last().scrollIntoViewIfNeeded();
  const action = await page.locator('.action-bar button').last().boundingBox();
  assert.ok(action.y >= 0 && action.y + action.height <= 568, 'short-screen action must remain reachable by scrolling');
  console.log('PASS reported 384×725 layout, portrait diagnostics, short-screen scrolling and ladder interactions');
  console.log('Remaining scan findings:\n' + report);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
