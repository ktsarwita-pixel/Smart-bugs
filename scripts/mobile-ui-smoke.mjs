/** Mobile interaction regression: start Vite, set CHROMIUM_PATH, then run npm run test:mobile. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to a Chromium executable');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--single-process', '--no-zygote'] });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
try {
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [812, 375]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/?advenced`);
    await page.getByRole('button', { name: 'PLAY MATCH' }).tap();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole('button', { name: 'BEGIN ROUND 1' }).first().tap();
    await page.waitForTimeout(800);
    const metrics = await page.evaluate(() => {
      const rect = s => document.querySelector(s).getBoundingClientRect();
      const stage = rect('.battle-stage'), dock = rect('.game-dock');
      return { scrollY: window.scrollY, documentWidth: document.documentElement.scrollWidth, stageHeight: stage.height, dockBottom: dock.bottom, viewportHeight: window.innerHeight };
    });
    assert.equal(metrics.scrollY, 0, `${width}: new screen must reset scroll`);
    assert.ok(metrics.documentWidth <= width, `${width}: page overflows horizontally`);
    assert.ok(metrics.stageHeight >= 120, `${width}: board collapsed`);
    if (width < 580 && metrics.dockBottom <= height) assert.ok(height - metrics.dockBottom < 3, `${width}: unused blank space below dock`);
    if (width === 320) {
      // A vertical swipe beginning on the WebGL board must scroll the page,
      // not dispatch a board tap or trap the gesture.
      const stage = await page.locator('.battle-stage').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const x = stage.x + stage.width / 2, y = stage.y + stage.height * 0.8;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 90 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => window.scrollY) > 0, 'swiping over board should scroll on a short screen');
      await page.evaluate(() => window.scrollTo(0, 0));
      await cdp.detach();
    }
    if (width === 390) {
      // A completed touch on an empty allied board cell must still dispatch
      // its placement hint after scrolling was enabled on the canvas.
      const canvas = page.locator('.battle-stage canvas');
      const box = await canvas.boundingBox();
      for (const fraction of [0.66, 0.72, 0.78, 0.84]) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * fraction);
        if (await page.getByText('TAP A BENCH BUG TO DEPLOY IT', { exact: false }).count()) break;
      }
      assert.ok(await page.getByText('TAP A BENCH BUG TO DEPLOY IT', { exact: false }).count(), 'board tap did not reach placement handler');
    }
    await page.locator('.shop-grid button:not([disabled])').first().tap();
    const bench = page.locator('.bench-slot[title*="tap to deploy"]');
    await bench.waitFor();
    // At 320px the old inspect overlay covered the centre of this button.
    await bench.first().tap();
    await page.waitForTimeout(200);
    assert.equal(await bench.count(), 0, `${width}: tapping bench centre did not deploy`);
    await page.getByRole('button', { name: /Engage battle/ }).tap();
    await page.getByText('COMBAT TELEMETRY').waitFor();
    await page.getByRole('button', { name: '2×' }).tap();
    assert.equal(await page.getByRole('button', { name: '2×' }).getAttribute('aria-pressed'), 'true', `${width}: battle control did not respond`);
    console.log(`PASS ${width}x${height}`);
  }
  assert.deepEqual(errors, [], 'uncaught browser errors');
} finally {
  await browser.close();
}
