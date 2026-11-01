import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
try {
  await page.goto(`${base}/?advenced&doctor=1`);
  await page.getByRole('button',{name:'Open UI Doctor'}).waitFor();
  await page.getByRole('button',{name:'SETTINGS'}).tap();
  const on=page.getByRole('radio',{name:'On — find UI and visual bugs'});
  assert.equal(await on.getAttribute('aria-checked'),'true','query-enabled Doctor must match Settings');
  assert.ok(await page.getByText(/Deep Scan watches for flashes/).isVisible());
  await page.getByRole('radio',{name:'Off — normal play'}).tap();
  await page.getByRole('button',{name:'CLOSE',exact:true}).last().tap();
  await page.getByRole('button',{name:'Open UI Doctor'}).waitFor({state:'hidden'});
  await page.reload();
  await page.getByRole('button',{name:'SETTINGS'}).tap();
  assert.equal(await page.getByRole('radio',{name:'Off — normal play'}).getAttribute('aria-checked'),'true','stored Off overrides query');
  assert.deepEqual(errors,[]);
  console.log('PASS advanced Doctor settings description, query state and persisted Off');
} finally {await browser.close();}
