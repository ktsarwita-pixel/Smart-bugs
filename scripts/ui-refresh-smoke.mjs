/** Real-screen and geometry regression for the opt-in v0.62 field-lab UI. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const checkDeck = async (width, height, count) => {
  await page.setViewportSize({ width, height });
  const result = await page.evaluate(count => {
    const row = document.querySelector('.deck-row');
    const track = row.querySelector('.round-track--compact');
    const cells = track.querySelector('.round-track__cells');
    const old = { count: track.dataset.roundCount, long: row.dataset.longPeriod, caption: track.querySelector('.round-track__caption').textContent };
    const originals = [...cells.children];
    track.dataset.roundCount = String(count);
    if (count >= 6) row.dataset.longPeriod = '1'; else delete row.dataset.longPeriod;
    while (cells.children.length < count) cells.append(originals[cells.children.length % originals.length].cloneNode(true));
    track.querySelector('.round-track__caption').textContent = `PERIOD 18 · ROUND ${count}/${count}`;
    const resources = row.querySelector('.deck-resources');
    const gold = resources.querySelector('.gold-flash');
    const savedGold = gold.textContent;
    gold.textContent = '9999';
    const streak = resources.firstElementChild.cloneNode(true);
    streak.innerHTML = '<span class="deck-num">W12</span><span class="deck-cap">+5g</span>';
    resources.append(streak);
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const parts = Object.fromEntries([
      ['health', row.querySelector('.deck-health')], ['round', track], ['matchup', row.querySelector('.vs-plaque')],
      ['resources', resources], ['help', row.querySelector('.help-btn')],
    ].map(([name, el]) => [name, rect(el)]));
    const grid = document.querySelector('.shop-grid');
    const data = {
      parts, deck: rect(row), caption: rect(track.querySelector('.round-track__caption')),
      healthText: rect(row.querySelector('.colony-health')), shop: [...grid.children].map(rect), shopGrid: rect(grid),
      viewportWidth: document.documentElement.scrollWidth,
      iconWidths: [...cells.children].map(cell => cell.querySelector('svg').getBoundingClientRect().width),
    };
    streak.remove(); gold.textContent = savedGold;
    [...cells.children].slice(originals.length).forEach(el => el.remove());
    track.dataset.roundCount = old.count;
    if (old.long === undefined) delete row.dataset.longPeriod; else row.dataset.longPeriod = old.long;
    track.querySelector('.round-track__caption').textContent = old.caption;
    return data;
  }, count);
  const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const entries = Object.entries(result.parts);
  for (let i = 0; i < entries.length; i++) {
    const [name, rect] = entries[i];
    assert.ok(inside(rect, result.deck), `${width}x${height}/${count}: ${name} outside deck: ${JSON.stringify(result)}`);
    for (const [other, otherRect] of entries.slice(i + 1)) {
      assert.ok(!overlaps(rect, otherRect), `${width}x${height}/${count}: ${name} covers ${other}: ${JSON.stringify(result)}`);
    }
  }
  assert.ok(inside(result.healthText, result.parts.health), `${width}/${count}: health text clipped`);
  assert.ok(inside(result.caption, result.parts.round), `${width}/${count}: round label clipped`);
  assert.ok(result.iconWidths.every(size => size >= 14), `${width}/${count}: round artwork too small`);
  assert.equal(result.shop.length, 5);
  assert.ok(result.shop.every(card => inside(card, result.shopGrid)), `${width}/${count}: shop card clipped`);
  for (let i = 1; i < result.shop.length; i++) assert.ok(!overlaps(result.shop[i - 1], result.shop[i]), `${width}/${count}: shop cards overlap`);
  assert.ok(result.viewportWidth <= width, `${width}/${count}: horizontal page overflow`);
};


const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
const checkTitle = async (width, height) => {
  await page.setViewportSize({ width, height });
  const layout = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    return {
      brand: rect(document.querySelector('.title-brand')),
      header: [...document.querySelectorAll('.title-header > button')].map(rect),
      actions: [...document.querySelectorAll('.hero-actions > button')].map(rect),
      heading: rect(document.querySelector('.hero-copy h1')),
      width: document.documentElement.scrollWidth,
    };
  });
  assert.ok(layout.width <= width, `${width}: title page overflows horizontally`);
  for (const group of [[layout.brand, ...layout.header], [layout.heading, ...layout.actions]]) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      assert.ok(a.left >= -1 && a.right <= width + 1, `${width}: menu item is off-screen: ${JSON.stringify(layout)}`);
      for (const b of group.slice(i + 1)) assert.ok(!overlaps(a,b), `${width}: menu items overlap: ${JSON.stringify(layout)}`);
    }
  }
  assert.ok([...layout.header, ...layout.actions].every(b => b.width >= 40 && b.height >= 40), `${width}: menu actions must be tappable`);
};
const checkCommander = async (width, height, expectedPerk) => {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  const layout = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    const shown = el => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const current = document.querySelector('.commander-current');
    const confirm = [...document.querySelectorAll('.commander-confirm button, .commander-start-desktop')].find(shown);
    const description = current.querySelector('p');
    return {
      cards: [...document.querySelectorAll('.commander-card')].map(rect),
      header: [...document.querySelectorAll('.commander-header > button')].map(rect),
      current: shown(current) ? rect(current) : null,
      summary: rect(document.querySelector('.rival-preview summary')), confirm: rect(confirm),
      description: shown(current) ? { text: current.innerText, scroll: description.scrollWidth, client: description.clientWidth } : null,
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    };
  });
  assert.ok(layout.width <= width, `${width}x${height}: commander page overflows horizontally`);
  assert.ok(layout.height <= height + 1, `${width}x${height}: compact selection unexpectedly needs scrolling: ${JSON.stringify(layout)}`);
  assert.ok(layout.confirm.bottom <= height, `${width}x${height}: start button below viewport`);
  assert.ok(layout.cards.every(c => c.left >= 0 && c.right <= width && c.width >= 44 && c.height >= 44), `${width}: commander portraits must fit and be tappable`);
  assert.ok(layout.header.every(c => c.width >= 40 && c.height >= 40), `${width}: utility controls must remain tappable`);
  const areas = [...layout.cards, layout.summary, layout.confirm, ...(layout.current ? [layout.current] : [])];
  for (let i = 0; i < areas.length; i++) for (const other of areas.slice(i + 1)) {
    assert.ok(!overlaps(areas[i], other), `${width}x${height}: commander controls or details overlap: ${JSON.stringify(layout)}`);
  }
  for (let i = 0; i < layout.header.length; i++) for (const other of layout.header.slice(i + 1)) {
    assert.ok(!overlaps(layout.header[i], other), `${width}: header controls overlap`);
  }
  if (layout.description) {
    assert.ok(layout.description.text.includes(expectedPerk), `${width}: selected perk did not update: ${layout.description.text}`);
    assert.ok(layout.description.scroll <= layout.description.client + 1, `${width}: selected perk is clipped`);
  }
};

try {
  await page.goto(`${base}/?advenced`);
  await page.evaluate(() => { sessionStorage.setItem('smartbugs.admin.unlocked', '1'); localStorage.setItem('smartbugs.settings', JSON.stringify({ rev: 2, lang: 'en', motion: 'reduced', potato: false, background: 'dark' })); });
  await page.reload();
  assert.equal(await page.locator('.advanced-ui .hero-copy').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'FIELD GUIDE' }).count(), 1);
  for (const [width, height] of [[280,653],[320,568],[390,844],[480,800],[812,375],[768,1024],[1280,800]]) await checkTitle(width, height);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.showcase-selector button').nth(2).tap();
  assert.equal(await page.locator('.showcase-selector button').nth(2).locator('.spec-icon--sel').count(), 1, 'showcase selection responds');
  await page.getByRole('button', { name: 'SETTINGS' }).tap();
  await page.getByRole('dialog', { name: 'SETTINGS' }).getByRole('button', { name: 'CLOSE' }).first().tap();
  await page.getByRole('button', { name: 'PLAY MATCH' }).tap();
  const commanders = page.locator('.commander-card');
  assert.equal(await commanders.count(), 3);
  const commanderSizes = [[280,653],[320,568],[360,740],[390,844],[480,320],[568,320],[640,360],[812,375],[768,1024],[1280,800]];
  const perks = ['Brood Hymn', 'Night Signal', 'Dig Hole'];
  for (const [width, height] of commanderSizes) {
    await page.setViewportSize({ width, height });
    for (let i = 0; i < 3; i++) {
      await commanders.nth(i).tap();
      assert.equal(await commanders.nth(i).getAttribute('aria-pressed'), 'true', 'commander selection responds');
      assert.equal(await page.locator('.commander-card[aria-pressed="true"]').count(), 1);
      await checkCommander(width, height, perks[i]);
    }
    console.log(`PASS compact commander ${width}x${height}`);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('.rival-preview summary').tap();
  assert.equal(await page.locator('.rival-preview[open] .rival-grid > div').count(), 7, 'all rivals stay available on demand');
  await page.locator('.rival-preview summary').tap();
  assert.equal(await page.locator('.rival-preview[open]').count(), 0);
  await page.getByRole('button', { name: 'GUIDE', exact: true }).tap();
  const guide = page.getByRole('dialog', { name: 'SPECIMEN FIELD GUIDE' });
  assert.equal(await guide.count(), 1, 'guide is an accessible dialog');
  await guide.getByRole('button', { name: 'CLOSE' }).tap();
  await page.getByRole('button', { name: 'SETTINGS' }).tap();
  await page.getByRole('dialog', { name: 'SETTINGS' }).getByRole('button', { name: 'CLOSE' }).first().tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await commanders.nth(1).tap();
  await page.getByRole('button', { name: 'BEGIN ROUND 1' }).first().tap();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.vs-plaque .spec-icon').first().evaluate(el => el.style.getPropertyValue('--accent')), '#7FE0C0', 'selected Oracle must enter the match');

  // Intrinsic sizes include large balances and a streak, not only the empty
  // starting state. Long maps model the real 6- and 7-round period markup.
  for (const [width, height] of [[280,653],[320,568],[360,740],[380,740],[390,844],[480,800],[580,800],[720,1024],[735,1024],[768,1024],[812,375],[1024,768],[1160,800],[1280,800]]) {
    for (const count of [4, 6, 7]) await checkDeck(width, height, count);
    console.log(`PASS HUD and shop ${width}x${height}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const vs = page.locator('button.vs-plaque');
  const boardBeforeScout = await page.locator('.battle-stage').boundingBox();
  await vs.tap(); assert.equal(await vs.getAttribute('aria-pressed'), 'true');
  await page.locator('.ladder-strip').waitFor({ state: 'hidden' }); // scout replaces the ladder, not its hit targets
  assert.equal(await page.locator('.scout-panel').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.deepEqual(await page.locator('.battle-stage').boundingBox(), boardBeforeScout, 'scout must not move the board');
  await vs.tap(); assert.equal(await vs.getAttribute('aria-pressed'), 'false');
  await page.locator('.ladder-strip').waitFor({ state: 'visible' });
  await page.locator('.shop-grid button:not([disabled])').first().tap();
  await page.locator('.selected-actions').getByRole('button', { name: 'DEPLOY' }).tap();
  await page.getByRole('button', { name: /Engage battle/ }).tap();
  await page.getByText('COMBAT TELEMETRY').waitFor();
  await page.getByRole('button', { name: '2×' }).tap();
  assert.equal(await page.getByRole('button', { name: '2×' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '1×' }).tap();
  const result = page.locator('.result-card');
  // A real battle can finish before the admin tap on a slow WebGL runner.
  // Accept that result rather than trying to click behind its modal.
  if (!await result.isVisible()) {
    try {
      await page.getByRole('button', { name: 'Open admin panel' }).first().tap({ timeout: 3000 });
      await page.getByRole('tab', { name: 'MATCH' }).tap();
      await page.getByRole('button', { name: 'FORCE WIN' }).tap();
      await page.getByRole('button', { name: 'Close admin panel' }).tap();
    } catch (error) {
      if (!await result.isVisible()) throw error;
      const closeAdmin = page.getByRole('button', { name: 'Close admin panel' });
      if (await closeAdmin.isVisible()) await closeAdmin.tap();
    }
  }
  await result.waitFor();
  assert.ok(['0', '1'].includes(await result.getAttribute('data-win')), 'result must show an actual outcome');
  const resultHealth = Number(await result.locator('.result-health__track').getAttribute('aria-valuenow'));
  assert.ok(resultHealth >= 0 && resultHealth <= 100, 'result must report valid colony health');
  assert.equal(Number(await result.locator('.result-health__value strong').innerText()), resultHealth, 'health text and accessible value agree');
  const resultBounds = await result.evaluate(el => {
    const a = el.querySelector('.round-track').getBoundingClientRect(), b = el.querySelector('.result-health').getBoundingClientRect();
    return { a: {left:a.left,right:a.right,top:a.top,bottom:a.bottom}, b: {left:b.left,right:b.right,top:b.top,bottom:b.bottom} };
  });
  assert.ok(resultBounds.a.bottom <= resultBounds.b.top, 'result map covers health');
  await result.locator('.result-next').tap();
  assert.ok(await page.locator('.round-track--compact').isVisible(), 'next round did not return to prep');

  // Localized labels can have very different lengths; they must fit too.
  await page.goto(`${base}/?advenced`);
  await page.evaluate(() => localStorage.setItem('smartbugs.settings', JSON.stringify({ rev: 2, lang: 'id', motion: 'reduced', potato: false, background: 'dark' })));
  await page.reload();
  await page.getByRole('button', { name: 'MAINKAN' }).tap();
  const indonesianPerks = ['Himne Keturunan', 'Sinyal Malam', 'Gali Lubang'];
  for (const [width, height] of [[280,653],[320,568],[390,844],[480,320],[568,320],[812,375]]) {
    await page.setViewportSize({ width, height });
    for (let i = 0; i < 3; i++) {
      await page.locator('.commander-card').nth(i).tap();
      await checkCommander(width, height, indonesianPerks[i]);
    }
  }
  await page.getByRole('button', { name: 'MULAI RONDE 1' }).first().tap();
  for (const [width, height] of [[280,653],[320,568],[390,844],[812,375],[1280,800]]) await checkDeck(width, height, 7);
  assert.match(await page.locator('.round-track__caption').innerText(), /PERIODE 1 · RONDE 1\/4/);

  await page.goto(base + '/');
  assert.equal(await page.locator('.advanced-ui').count(), 0, 'advanced UI must be opt-in');
  assert.deepEqual(errors, []);
  console.log('PASS menu, commander, responsive health/map/resource geometry, shop, combat, result, localization and opt-in isolation');
} finally {
  await browser.close();
}
