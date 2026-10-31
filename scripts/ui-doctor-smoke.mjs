/** UI Doctor diagnostics regression. Requires CHROMIUM_PATH and a running Vite server. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:5176') + '/?doctor=1');
  await page.evaluate(() => {
    const fixture = document.createElement('div'); fixture.id = 'doctor-fixture';
    fixture.innerHTML = `<button id="doc-tiny" style="position:fixed;z-index:200;top:8px;left:8px;width:20px;height:20px">Tiny fixture</button>
      <button id="doc-covered" style="position:fixed;z-index:200;top:70px;left:8px;width:48px;height:48px">Covered fixture</button>
      <div style="position:fixed;z-index:201;top:70px;left:8px;width:48px;height:48px;background:black"></div>
      <button disabled style="position:fixed;z-index:200;top:135px;left:8px;width:10px;height:10px">Disabled fixture</button>`;
    document.body.append(fixture);
  });
  await page.getByRole('button', { name: 'Open UI Doctor' }).tap();
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  const list = page.locator('.ui-doctor__list');
  assert.match(await list.innerText(), /TAP[\s\S]*Tiny fixture/);
  assert.match(await list.innerText(), /COVERED[\s\S]*Covered fixture/);
  assert.doesNotMatch(await list.innerText(), /Disabled fixture/);
  assert.ok(await page.locator('.ui-doctor__panel').evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().top >= 0));
  await list.getByRole('button', { name: /Tiny fixture/ }).tap();
  assert.equal(await page.locator('.ui-doctor__highlight').count(), 1);
  assert.equal(await page.getByRole('dialog', { name: 'UI Doctor' }).count(), 0);
  await page.getByRole('button', { name: 'Open UI Doctor' }).tap();
  await page.getByRole('button', { name: 'COPY REPORT' }).tap();
  await page.getByRole('status').waitFor();
  assert.match(await page.getByRole('status').innerText(), /Copied|Copy unavailable/);
  await page.getByRole('button', { name: 'Minimize UI Doctor' }).tap();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb-doctor', {detail:false})));
  await page.getByRole('button', { name: 'Open UI Doctor' }).waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PASS UI Doctor scan, issue navigation, copy feedback, minimize and disable');
} finally { await browser.close(); }
