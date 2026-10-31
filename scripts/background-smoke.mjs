/** Background settings and persistence regression. Start Vite; set CHROMIUM_PATH. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:5176') + '/?advenced');
  await page.getByRole('button', { name: 'SETTINGS' }).first().tap();
  const dark = page.getByRole('radio', { name: 'Dark mode' }), light = page.getByRole('radio', { name: 'Light mode' });
  assert.equal(await dark.getAttribute('aria-checked'), 'true');
  await light.tap();
  await page.waitForFunction(() => document.documentElement.dataset.background === 'light');
  assert.equal(await light.getAttribute('aria-checked'), 'true');
  const color = await page.locator('.cabinet-bg').first().evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(color, 'rgb(104, 113, 110)');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.background === 'light');
  await page.getByRole('button', { name: 'SETTINGS' }).first().tap();
  assert.equal(await light.getAttribute('aria-checked'), 'true');
  await dark.tap();
  await page.waitForFunction(() => document.documentElement.dataset.background === 'dark');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.background === 'dark');
  assert.deepEqual(errors, []);
  console.log('PASS light/dark background controls, muted palette, and persistence');
} finally { await browser.close(); }
