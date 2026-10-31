import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:560},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
try {
  await page.goto(`${base}/scripts/chest-3d-harness.html`);
  const chest=page.locator('.treasure-chest-3d');
  await chest.locator('canvas').waitFor({state:'visible'});
  assert.equal(await chest.getAttribute('data-renderer'),'webgl');
  assert.equal(Number(await chest.locator('canvas').getAttribute('data-lid-angle')),0,'losing chest remains closed');
  assert.equal(await chest.locator('canvas').evaluate(c=>(c.getContext('webgl2')||c.getContext('webgl')).isContextLost()),false,'StrictMode leaves the context alive');
  await page.evaluate(()=>{
    window.chestFrames=[];
    new MutationObserver(changes=>changes.forEach(c=>window.chestFrames.push([c.target.dataset.openProgress,c.target.dataset.lidAngle])))
      .observe(document.querySelector('.treasure-chest-3d canvas'),{attributes:true,attributeFilter:['data-lid-angle']});
  });
  await page.getByRole('button',{name:'Open'}).click();
  await page.waitForFunction(()=>Number(document.querySelector('.treasure-chest-3d canvas')?.dataset.openProgress)===100,null,{timeout:15000});
  const frames=await page.evaluate(()=>window.chestFrames);
  assert.ok(new Set(frames.map(f=>f[1])).size>5,'lid animation must render multiple intermediate frames');
  assert.ok(frames.some(f=>Number(f[1])<-.2 && Number(f[1])>-1.3),'opening must visibly move through intermediate angles');
  assert.ok(Math.abs(Number(await chest.locator('canvas').getAttribute('data-lid-angle'))+1.52)<.001);
  if (process.env.CAPTURE) await chest.screenshot({path:process.env.CAPTURE});
  await chest.locator('canvas').evaluate(c=>(c.getContext('webgl2')||c.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>document.querySelector('.treasure-chest-3d')?.dataset.renderer==='fallback',null,{timeout:10000});
  assert.equal(await chest.locator('.pixel-treasure').evaluate(el=>getComputedStyle(el).visibility),'visible','context loss reveals fallback');
  assert.equal(await chest.locator('canvas').evaluate(el=>getComputedStyle(el).visibility),'hidden','lost canvas does not obscure fallback');
  await page.goto(`${base}/scripts/chest-3d-harness.html?open=1&reduced=1`);
  await page.waitForFunction(()=>document.querySelector('.treasure-chest-3d')?.dataset.renderer==='webgl');
  const reduced=await page.locator('.treasure-chest-3d canvas').evaluate(c=>[c.dataset.openProgress,c.dataset.lidAngle]);
  assert.deepEqual(reduced,['100','-1.5200'],'reduced motion is immediately and statically open');
  await page.waitForTimeout(400);
  assert.deepEqual(await page.locator('.treasure-chest-3d canvas').evaluate(c=>[c.dataset.openProgress,c.dataset.lidAngle]),reduced);
  assert.deepEqual(errors,[]);
  console.log('PASS true 3D chest, smooth opening, StrictMode, WebGL fallback and reduced motion');
} finally {await browser.close();}
