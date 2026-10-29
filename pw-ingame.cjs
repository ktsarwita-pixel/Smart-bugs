/* pw-ingame.cjs — real-browser verification (wave-28c: spider webs v3 + UI).
   Modes: prep | spider | flap */
const { chromium: pw } = require("playwright-core");
const { createRequire } = require("module");
const req = createRequire("/tmp/chr/package.json");
const chromium = req("@sparticuz/chromium");

const MODE = process.argv[2] || "prep";
const OUT = "/home/user/shots";
const fs = require("fs");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickBtn(page, text, idx = 0) {
  const btns = page.locator("button", { hasText: text });
  try {
    await btns.nth(idx).click({ timeout: 3500, force: true });
    return btns.nth(idx);
  } catch {
    try {
      await btns.nth(idx).evaluate((el) => el.click());
      return btns.nth(idx);
    } catch {
      await page.screenshot({ path: `${OUT}/fail_${text.replace(/\W+/g, "_")}.png` });
      throw new Error(`click failed: ${text}`);
    }
  }
}

(async () => {
  const exe = await chromium.default.executablePath();
  const browser = await pw.launch({
    executablePath: exe,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
  await page.goto("http://localhost:5173", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(4200);

  if (MODE === "prep") {
    // patch notes modal first (menu button)
    await clickBtn(page, "PATCH NOTES");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/sp_patchnotes.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await clickBtn(page, "SPIDER");
    await page.waitForTimeout(3200);
    await page.screenshot({ path: `${OUT}/sp_menu_tab.png` });
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path: `${OUT}/sp_sculpt.png` });
    console.log("prep done");
  }

  if (MODE === "flap") {
    await clickBtn(page, "DRAGONFLY");
    await page.waitForTimeout(3200);
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path: `${OUT}/sp_flap_a.png` });
    await page.waitForTimeout(180);
    await canvas.screenshot({ path: `${OUT}/sp_flap_c.png` });
    console.log("flap done");
  }

  if (MODE === "spider") {
    // battle flow: grant 3★ spider, quick-deploy from bench (NEW flow), verify HUD
    await clickBtn(page, "PLAY MATCH");
    await page.waitForTimeout(2500);
    await clickBtn(page, "BEGIN ROUND");
    await page.waitForTimeout(1500);
    await clickBtn(page, "ADMIN");
    await page.waitForTimeout(900);
    const pwGate = page.locator("input[type='password'], input[placeholder*='ass']");
    if (await pwGate.count()) {
      await pwGate.first().fill("Wira67");
      await page.waitForTimeout(900);
    }
    await page.screenshot({ path: `${OUT}/sp_admin_auth.png` });
    const cmdInput = page.locator("#admin-command-input");
    if (!(await cmdInput.count())) {
      await clickBtn(page, "ADVANCED");
      await page.waitForTimeout(400);
    }
    await cmdInput.fill("give spider 3");
    await cmdInput.press("Enter");
    await page.waitForTimeout(900);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    // NEW placement: one tap on the bench slot deploys instantly
    await page.screenshot({ path: `${OUT}/sp_bench_before.png` });
    const benchSlot = page.locator("button.bench-slot").first();
    await benchSlot.click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/sp_quick_deploy.png` });
    // engage round 1 — grand web + fight flare + new round pips
    await clickBtn(page, "ENGAGE");
    await page.waitForTimeout(1300);
    if (await page.locator("button", { hasText: "ENGAGE" }).count()) {
      await clickBtn(page, "ENGAGE");
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/sp_flare.png` });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/sp_web_grand.png` });
    // round 2 resolves fast; march to round 10 (3★ foes) where the fight
    // stretches long enough for natural energy -> AFTER WEB snare
    await page.waitForSelector("text=VICTORY", { timeout: 30000 });
    await page.waitForTimeout(400);
    for (let r = 3; r <= 10; r++) {
      await clickBtn(page, "NEXT ROUND");
      await page.waitForTimeout(2300);
      await clickBtn(page, "ENGAGE");
      await page.waitForTimeout(1300);
      if (await page.locator("button", { hasText: "ENGAGE" }).count()) {
        await clickBtn(page, "ENGAGE");
      }
      await page.waitForSelector("text=VICTORY", { timeout: 30000 });
      await page.waitForTimeout(400);
      console.log(`round ${r} done`);
    }
    await clickBtn(page, "NEXT ROUND");
    await page.waitForTimeout(2300);
    await clickBtn(page, "ENGAGE");
    await page.waitForTimeout(1300);
    if (await page.locator("button", { hasText: "ENGAGE" }).count()) {
      await clickBtn(page, "ENGAGE");
    }
    for (let i = 0; i < 30; i++) {
      await page.screenshot({ path: `${OUT}/sp_sn_${String(i).padStart(2, "0")}.png` });
      await page.waitForTimeout(400);
    }
    console.log("spider battle done");
  }

  await browser.close();
})().catch((e) => {
  console.error("HARNESS FAIL:", String(e).slice(0, 400));
  process.exit(1);
});
