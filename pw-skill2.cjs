const { default: chromium } = require('@sparticuz/chromium');
const { chromium: pw } = require('playwright-core');
(async () => {
  const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--enable-unsafe-swiftshader'], headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("PLAY MATCH")').first().click();
  await page.waitForTimeout(700);
  await page.locator('button.paper-card:visible').first().click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("BEGIN ROUND 1"):visible').first().click();
  await page.waitForTimeout(800);
  // ADMIN: unlock, give a 3-star dragonfly (picker defaults: dragonfly / 3★)
  await page.locator('button:has-text("ADMIN"):visible').first().click();
  await page.waitForTimeout(500);
  const pass = page.locator('#admin-passcode');
  if (await pass.count()) {
    await pass.fill('Wira67');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  }
  await page.locator('button:has-text("GIVE")').first().click();
  await page.waitForTimeout(400);
  // close the panel (Escape)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const auto = page.locator('button:has-text("AUTO-DEPLOY")');
  if (await auto.count()) { await auto.first().click(); await page.waitForTimeout(300); }
  await page.locator('button:has-text("ENGAGE"):visible').first().click();
  await page.waitForTimeout(2500);
  // charge all allies -> dragonfly skill should fire
  const adminBtn = page.locator('button:has-text("ADMIN"):visible');
  if (await adminBtn.count()) {
    await adminBtn.first().click();
    await page.waitForTimeout(400);
    const charge = page.locator('button:has-text("CHARGE ALL ALLIES")');
    if (await charge.count()) { await charge.first().click(); console.log('charged all'); }
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  }
  console.log('waiting for airstrike...');
  const canvas = page.locator('canvas').first();
  let captured = 0;
  const t0 = Date.now();
  let lastPhase = '';
  while (Date.now() - t0 < 75000 && captured < 26) {
    const ph = await page.evaluate(() => {
      const els = [...document.querySelectorAll('div,span')];
      for (const el of els) {
        const txt = (el.textContent || '').trim();
        if ((txt === 'CLIMB' || txt === 'LOCK ON' || txt === 'DIVE' || txt === 'LANDED') && el.children.length === 0) return txt;
      }
      return null;
    });
    if (ph) {
      if (ph !== lastPhase) console.log('PHASE:', ph, 'at', ((Date.now() - t0) / 1000).toFixed(1) + 's');
      lastPhase = ph;
      await canvas.screenshot({ path: `/home/user/shots/skb_${String(captured).padStart(2, '0')}_${ph}.png` });
      captured++;
    } else {
      await page.waitForTimeout(120);
    }
  }
  console.log('captured:', captured);
  await page.screenshot({ path: '/home/user/shots/skb_end.png' });
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
