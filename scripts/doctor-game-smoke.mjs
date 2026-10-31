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
  await page.locator('.shop-grid button:not([disabled])').first().tap();
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
  await page.getByRole('button', { name: 'Open UI Doctor' }).tap();
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  const report = await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report, /COVERED[\s\S]*button\.ladder-button/);
  assert.doesNotMatch(report, /TAP[\s\S]*button\.ladder-button/);
  assert.doesNotMatch(report, /button\.vs-plaque/);
  assert.doesNotMatch(report, /Open admin panel/);
  assert.doesNotMatch(report, /AUTO-DEPLOY/);
  console.log('PASS reported 384×725 layout and ladder interactions');
  console.log('Remaining scan findings:\n' + report);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
