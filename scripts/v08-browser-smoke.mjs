/** Live regression for sound, career bookkeeping, and compact phone layout.
 * BASE_URL overrides the preview URL; SHOTS=dir keeps browser captures. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to a Chromium executable');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, {recursive: true});

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

/** A fresh, isolated player. `stagShop` makes the opening shop five Stag Beetles. */
async function open({width, height, stagShop = false, career = null, lang = 'en'}) {
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
  await context.addInitScript(({stagShop, career}) => {
    localStorage.setItem('smartbugs.speed', '3');
    if (career && !localStorage.getItem('smartbugs.career')) localStorage.setItem('smartbugs.career', JSON.stringify(career));
    // Count synthesised voices so the test can tell sound actually played.
    window.__voices = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const make = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () { window.__voices++; return make.call(this); };
    }
    if (stagShop) {
      // The opening shop is rolled at mount. Pin Math.random low until the
      // drawer opens (the weight table starts with the Stag Beetle), then
      // hand it back so battles stay genuinely random.
      const real = Math.random;
      window.__pinShop = true;
      Math.random = () => (window.__pinShop ? 0.01 : real());
    }
  }, {stagShop, career});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // offline sandboxes cannot reach the web-font CDN; that is not a game error
    if (/Failed to load resource|net::ERR|fonts\.g/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  await page.goto(BASE, {waitUntil: 'domcontentloaded'});
  if (lang === 'id') {
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('smartbugs.settings') || '{}');
      localStorage.setItem('smartbugs.settings', JSON.stringify({...raw, lang: 'id', rev: 2}));
    });
    await page.reload({waitUntil: 'domcontentloaded'});
  }
  return {context, page, errors};
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`}); };
const visibleButton = (page, text) => page.locator(`button:has-text("${text}"):visible`).first();

async function startMatch(page, play = 'PLAY MATCH', begin = 'BEGIN ROUND 1') {
  await visibleButton(page, play).click();
  await visibleButton(page, begin).click();
  await page.locator('.prep-dock .commander-control').waitFor({state: 'visible', timeout: 20000});
  await page.evaluate(() => { window.__pinShop = false; });
}

async function assertFits(page, label) {
  const m = await page.locator('.commander-control').evaluate(el => {
    const row = el.getBoundingClientRect(), button = el.querySelector('button').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth - innerWidth, fits:button.left >= row.left && button.right <= row.right, height:button.height};
  });
  assert.ok(m.overflow <= 1 && m.fits && m.height >= 40, `${label}: commander control must fit: ${JSON.stringify(m)}`);
  assert.equal(await page.locator('.bonds-bar, .bond-chip').count(),0);
}

try {
  // ── A. Desktop: recruit five Stag Beetles, then fight ───
  {
    const {context, page, errors} = await open({width: 1280, height: 800, stagShop: true});
    assert.equal(await page.locator('.career-strip').count(), 0, 'no career strip before any match is finished');
    await shot(page, 'a1-title');
    await startMatch(page);
    await assertFits(page, 'desktop prep (empty)');

    for (const key of ['1', '2', '3', '4', '5']) { await page.keyboard.press(key); await page.waitForTimeout(120); }
    await page.keyboard.press('a'); // auto-deploy: a 2-star Stag + two 1-star Stags
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => window.__voices) > 0, 'recruiting and deploying made sound');
    await assertFits(page, 'desktop prep (recruited)');
    await shot(page, 'a2-prep-recruited');

    const before = await page.evaluate(() => window.__voices);
    await page.getByRole('button', { name: /Engage battle/ }).click();
    await page.locator('.combat-scroll').waitFor({state: 'visible', timeout: 15000});
    await page.waitForTimeout(2500);
    await shot(page, 'a3-battle');
    await page.locator('#round-result-title').waitFor({state: 'visible', timeout: 90000});
    assert.ok(await page.evaluate(() => window.__voices) > before + 5, 'the battle was voiced (hits, knock-outs, result)');
    await shot(page, 'a4-result');

    // Settings: the sound switch persists
    await page.keyboard.press('Enter');
    await page.locator('.prep-dock .commander-control').waitFor({state: 'visible', timeout: 15000});
    await page.locator('button[aria-label="SETTINGS"]:visible').first().click();
    await page.getByRole('radiogroup', {name: 'SOUND'}).waitFor({state: 'visible'});
    await page.waitForTimeout(900); // let the sheet finish sliding in before the screenshot
    await shot(page, 'a5-settings');
    await page.getByRole('radio', {name: 'Off — silent'}).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('smartbugs.sfx')).enabled), false, 'sound off is saved');
    const silentFrom = await page.evaluate(() => window.__voices);
    await page.getByRole('radio', {name: 'Off — silent'}).click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__voices), silentFrom, 'nothing plays while sound is off');
    assert.deepEqual(errors, [], `desktop session logged errors:\n${errors.join('\n')}`);
    await context.close();
  }

  // ── B. Phone: one bug, lose every round → final standings + career ──────
  let recorded = null;
  {
    const {context, page, errors} = await open({width: 390, height: 844, stagShop: true});
    await startMatch(page);
    await page.keyboard.press('1');
    await page.waitForTimeout(200);
    await assertFits(page, 'phone 390 prep');
    await shot(page, 'b1-phone-prep');

    const deadline = Date.now() + 8 * 60 * 1000;
    let rounds = 0;
    while (Date.now() < deadline) {
      if (await page.locator('.career-card').count()) break;
      if (await page.locator('#round-result-title').count()) {
        rounds++;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(350);
      } else if (await page.locator('.prep-dock .commander-control').count()) {
        await page.getByRole('button', { name: /Engage battle/ }).click();
        await page.waitForTimeout(700);
      } else {
        await page.waitForTimeout(400);
      }
    }
    await page.locator('.career-card').waitFor({state: 'visible', timeout: 5000});
    await shot(page, 'b2-phone-final');
    recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('smartbugs.career')));
    assert.equal(recorded.matches, 1, 'the finished match is recorded exactly once');
    assert.ok(recorded.lastPlace >= 2 && recorded.lastPlace <= 8, `a pinned colony gets a real place, got ${recorded.lastPlace}`);
    assert.equal(recorded.bestPlace, recorded.lastPlace);
    assert.equal(recorded.wins, 0);
    assert.ok(recorded.roundsPlayed >= 3 && recorded.roundsPlayed <= rounds + 1, `rounds played ${recorded.roundsPlayed} vs ${rounds} result cards`);
    assert.ok(recorded.roundsWon <= recorded.roundsPlayed);
    assert.match(await page.locator('.career-card').innerText(), /CAREER RECORD/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `final screen scrolls sideways by ${overflow}px`);

    await visibleButton(page, 'NEW CABINET MATCH').click();
    await page.locator('.career-strip').waitFor({state: 'visible', timeout: 10000});
    assert.match(await page.locator('.career-strip').innerText(), /1\s+MATCHES/, 'the main menu shows the record');
    await shot(page, 'b3-phone-title-career');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('smartbugs.career')).matches), 1, 'returning to the menu does not record again');
    assert.deepEqual(errors, [], `phone session logged errors:\n${errors.join('\n')}`);
    await context.close();
  }

  // ── C. Small phone, Indonesian supply: the tightest layout ────────
  {
    const {context, page, errors} = await open({width: 360, height: 640, stagShop: true, lang: 'id'});
    await startMatch(page, 'MAINKAN', 'MULAI RONDE 1').catch(async () => {
      // copy may differ; fall back to the first two primary buttons
      throw new Error(`Indonesian start buttons not found. Visible buttons: ${(await page.locator('button:visible').allInnerTexts()).join(' | ').slice(0, 400)}`);
    });
    for (const key of ['1', '2', '3', '4', '5']) { await page.keyboard.press(key); await page.waitForTimeout(120); }
    await page.keyboard.press('a');
    await page.waitForTimeout(500);
    await assertFits(page, 'phone 360 Indonesian');
    assert.match(await page.locator('.commander-control').innerText(), /Pendapatan/i, 'the skill reads in Indonesian');
    await shot(page, 'c1-small-phone-id');
    assert.deepEqual(errors, [], `small-phone session logged errors:\n${errors.join('\n')}`);
    await context.close();
  }

  console.log(`v08-browser-smoke: PASS — real recruitment, voiced battle, sound switch, phone fit at 390/360px, full match recorded once (place #${recorded.lastPlace}, ${recorded.roundsPlayed} rounds)`);
} finally {
  await browser.close();
}
