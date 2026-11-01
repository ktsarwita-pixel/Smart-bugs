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
      <button disabled style="position:fixed;z-index:200;top:135px;left:8px;width:10px;height:10px">Disabled fixture</button>
      <button id="doc-no-pointer" style="position:fixed;z-index:200;top:190px;left:8px;width:48px;height:48px;pointer-events:none">No pointer fixture</button>
      <div aria-label="Scrollable fixture" style="position:fixed;z-index:200;top:250px;left:8px;width:80px;height:45px;overflow:auto"><div style="width:180px;height:160px"><button style="margin-top:90px;width:48px;height:48px">Offscreen fixture</button></div></div>
      <div style="position:fixed;z-index:200;top:310px;left:8px;width:25px;height:48px;overflow:hidden"><button style="position:absolute;left:30px;width:48px;height:48px">Clipped fixture</button></div>
      <div data-ui-boundary aria-label="Overflow panel fixture" style="position:fixed;z-index:200;top:380px;left:8px;width:60px;height:40px;overflow:hidden"><div style="width:150px;height:30px">Long content</div></div>
      <div aria-label="Offscreen border fixture" style="position:fixed;z-index:200;top:430px;left:-2px;width:70px;height:36px;border:3px solid red">Border</div>
      <div style="position:fixed;z-index:200;top:250px;left:120px;width:80px;height:50px;overflow:hidden"><div style="width:80px;height:50px;overflow-x:auto;overflow-y:hidden"><div style="width:220px;height:40px;display:flex"><div aria-label="Partly scrolled border fixture" style="margin-left:60px;flex:none;width:40px;height:35px;border:2px solid red"></div><div aria-label="Offscreen scroller border fixture" style="margin-left:50px;flex:none;width:40px;height:35px;border:2px solid red"></div></div></div></div>
      <div style="position:fixed;z-index:200;top:320px;left:120px;width:60px;height:40px;overflow:hidden"><div aria-label="Genuinely clipped border fixture" style="position:absolute;left:40px;width:40px;height:35px;border:2px solid red"></div></div>
      <button style="position:fixed;z-index:200;top:480px;left:-65px;width:80px;height:48px">Edge fixture</button>
      <button id="doc-partial" style="position:fixed;z-index:200;top:calc(100vh - 12px);left:120px;width:48px;height:48px">Partly below fixture</button>
      <button id="doc-below" style="position:absolute;top:1400px;left:10px;width:48px;height:48px">Below fixture</button>`;
    fixture.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {window.__doctorClicks=(window.__doctorClicks||0)+1;}));
    document.body.append(fixture);
  });
  await page.getByRole('button', { name: 'Open UI Doctor' }).tap();
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  const list = page.locator('.ui-doctor__list');
  assert.match(await list.innerText(), /TAP[\s\S]*Tiny fixture/);
  assert.match(await list.innerText(), /COVERED[\s\S]*Covered fixture/);
  assert.match(await list.innerText(), /INTERACTION[\s\S]*No pointer fixture/);
  assert.match(await list.innerText(), /SCROLL[\s\S]*Scrollable fixture[\s\S]*horizontal 100px[\s\S]*vertical 115px/);
  assert.match(await list.innerText(), /Page requires vertical scrolling/);
  assert.match(await list.innerText(), /[1-9]\d* enabled controls fully below and [1-9]\d* partly below the viewport/, 'report partly clipped controls as well as wholly below ones');
  assert.match(await list.innerText(), /CLIPPED[\s\S]*Clipped fixture/);
  assert.match(await list.innerText(), /OVERFLOW[\s\S]*Overflow panel fixture/);
  assert.match(await list.innerText(), /BORDER[\s\S]*Offscreen border fixture/);
  assert.match(await list.innerText(), /BORDER[\s\S]*Genuinely clipped border fixture/);
  assert.doesNotMatch(await list.innerText(), /Partly scrolled border fixture|Offscreen scroller border fixture/, 'reachable scrolled items are not broken borders');
  assert.match(await list.innerText(), /CLIPPED[\s\S]*Edge fixture/);
  assert.equal(await page.evaluate(() => window.__doctorClicks || 0),0, 'scan must never trigger game actions');
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
  await page.evaluate(() => {
    document.querySelector('#doctor-fixture').remove();
    const behind=document.createElement('button');behind.id='behind-dialog';behind.textContent='Behind dialog fixture';behind.style.cssText='position:fixed;top:10px;left:10px;width:10px;height:10px';document.body.append(behind);
    const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Test modal');modal.style.cssText='position:fixed;z-index:500;top:50px;left:50px;width:140px;height:80px;overflow:auto';modal.innerHTML='<div style="height:200px"><button style="width:48px;height:48px">Modal button</button></div>';document.body.append(modal);
  });
  await page.getByRole('button', { name: 'Open UI Doctor' }).tap();
  await page.getByRole('button', { name: 'SCAN SCREEN' }).tap();
  const modalReport=await page.locator('.ui-doctor__body').innerText();
  assert.match(modalReport, /SCROLL[\s\S]*Test modal[\s\S]*vertical 120px/);
  assert.doesNotMatch(modalReport, /Behind dialog fixture/);
  await page.getByRole('button', { name: 'Minimize UI Doctor' }).tap();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb-doctor', {detail:false})));
  await page.getByRole('button', { name: 'Open UI Doctor' }).waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PASS UI Doctor scan, issue navigation, copy feedback, minimize and disable');
} finally { await browser.close(); }
