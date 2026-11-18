/** Measure the fitted 3D drawer in CSS pixels, not just its canvas size. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.emulateMedia({ reducedMotion: 'reduce' });

const canvas = page.locator('.battle-stage canvas');
const overlaps = (a, b) => a.x + a.width > b.x + 1 && b.x + b.width > a.x + 1
  && a.y + a.height > b.y + 1 && b.y + b.height > a.y + 1;
const within = (box, width, height) => box.x >= -1 && box.y >= -1
  && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;

async function measure(width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
  await page.evaluate(() => scrollTo(0, 0));
  // The Doctor samples the actual projected bounds periodically. Discard the
  // last sample after resizing instead of mixing it with the new canvas size.
  await canvas.evaluate(el => { delete el.dataset.drawerBounds; });
  await page.waitForFunction(() => document.querySelector('.battle-stage canvas')?.dataset.drawerBounds, null, { timeout: 15000 });
  return page.evaluate(() => {
    const scene = document.querySelector('.battle-stage canvas');
    const rect = el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    };
    const box = rect(scene);
    const drawer = JSON.parse(scene.dataset.drawerBounds);
    return {
      canvas: box,
      drawer,
      commander: JSON.parse(scene.dataset.commanderBounds).ally,
      boardWidth: box.width * (drawer[2] - drawer[0]),
      boardHeight: box.height * (drawer[3] - drawer[1]),
      dock: rect(document.querySelector('.game-dock')),
      zoom: rect(document.querySelector('.drawer-zoom')),
      actions: [...document.querySelectorAll('.action-bar button, .combat-toolbar button')].map(rect),
      viewportOverflow: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    };
  });
}

function checkLayout(layout, width, height, minWidth, minHeight, scrolls = false) {
  const label = `${width}×${height}`;
  assert.ok(layout.viewportOverflow[0] <= width, `${label}: horizontal overflow`);
  assert.ok(scrolls || layout.viewportOverflow[1] <= height + 1, `${label}: page shouldn't need vertical scrolling: ${JSON.stringify(layout)}`);
  assert.ok(!overlaps(layout.canvas, layout.zoom) && !overlaps(layout.canvas, layout.dock), `${label}: controls cover the battlefield`);
  assert.ok(layout.drawer?.length === 4 && layout.drawer.every(n => n >= 0 && n <= 1), `${label}: FIT clipped the drawer: ${layout.drawer}`);
  assert.ok(layout.commander?.length === 4 && layout.commander.every(n => n >= 0 && n <= 1), `${label}: FIT clipped the commander: ${layout.commander}`);
  assert.ok(layout.boardWidth >= minWidth && layout.boardHeight >= minHeight, `${label}: fitted 3D drawer is too small: ${layout.boardWidth.toFixed(1)}×${layout.boardHeight.toFixed(1)}px`);
  assert.ok(layout.actions.length >= 3 && layout.actions.every(a => a.width >= 40 && a.height >= 40 && (scrolls || within(a, width, height))), `${label}: action controls are too small or off-screen: ${JSON.stringify(layout.actions)}`);
}

try {
  await page.goto(`${base}/?doctor=1`);
  await page.getByRole('button', { name: 'PLAY MATCH' }).tap();
  await page.getByRole('button', { name: 'BEGIN ROUND 1' }).first().tap();

  // Floor regressions for the real projected drawer rather than the dark
  // space around it. Short phones intentionally scroll to the setup actions.
  for (const [w, h, minW, minH, scrolls] of [
    [320, 568, 200, 157, true],
    [390, 844, 340, 270],
    [768, 1024, 550, 435],
    [812, 375, 265, 210],
    [1440, 900, 790, 625],
    [1920, 1080, 990, 785],
  ]) {
    const layout = await measure(w, h);
    checkLayout(layout, w, h, minW, minH, scrolls);
    console.log(`PASS setup ${w}×${h}: ${Math.round(layout.boardWidth)}×${Math.round(layout.boardHeight)}px fitted drawer`);
  }

  const prep = await measure(390, 844);
  await page.locator('.shop-grid button:not([disabled])').first().tap();
  await page.getByRole('button', { name: /Engage battle/ }).tap();
  await page.getByText('COMBAT TELEMETRY', { exact: true }).waitFor();
  const combat = await measure(390, 844);
  checkLayout(combat, 390, 844, 340, 285);
  assert.ok(combat.canvas.height >= prep.canvas.height + 90, 'combat should use the room freed by the shop and bench');

  const speed = page.getByRole('group', { name: 'Battle speed' }).getByRole('button', { name: '2×' });
  const speedBefore = await speed.boundingBox();
  const scrolled = await page.getByRole('region', { name: 'COMBAT TELEMETRY' }).evaluate(el => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  assert.ok(scrolled > 0, 'telemetry details should be independently scrollable');
  assert.equal(await page.evaluate(() => scrollY), 0, 'scrolling telemetry moved the page');
  assert.deepEqual(await speed.boundingBox(), speedBefore, 'scrolling telemetry moved the speed controls');
  assert.equal((await canvas.boundingBox()).height, combat.canvas.height, 'scrolling telemetry resized the battlefield');
  await speed.tap();
  assert.equal(await speed.getAttribute('aria-pressed'), 'true', 'speed control remains usable after scrolling');
  const settings = page.getByRole('button', { name: 'SETTINGS', exact: true });
  await settings.tap();
  await page.getByRole('dialog', { name: 'SETTINGS', exact: true }).waitFor();
  assert.deepEqual(errors, [], 'uncaught browser errors');
  console.log(`PASS combat 390×844: ${combat.canvas.height}px canvas, fitted drawer, independent telemetry and reachable controls`);
} finally {
  await browser.close();
}
