const { chromium: pw } = require("playwright-core");
const { createRequire } = require("module");
const req = createRequire(`${__dirname}/package.json`);
(async () => {
  const chromium = req("@sparticuz/chromium");
  const exec = await chromium.default.executablePath();
  const browser = await pw.launch({ executablePath: exec, args: [...chromium.default.args, "--enable-unsafe-swiftshader"], headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(2500);
  const tabs = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter((t) => t && t.length < 12).slice(0, 14));
  console.log("buttons:", JSON.stringify(tabs));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
