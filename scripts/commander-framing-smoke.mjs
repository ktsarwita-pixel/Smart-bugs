/** Verify actual projected 3D commander geometry stays in the stage at every zoom. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:180},isMobile:true,hasTouch:true});
await page.emulateMedia({reducedMotion:'reduce'});
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const checkBounds=async(label)=>{
  const result=await page.locator('canvas').evaluate(el=>JSON.parse(el.dataset.commanderBounds));
  for (const side of ['ally','foe']) {
    const b=result[side];
    assert.ok(b?.length===4 && b.every(n=>n>=0&&n<=1),`${label}: ${side} clipped: ${JSON.stringify(result)}`);
    assert.ok(Math.abs((b[0]+b[2])/2-.5)<.1,`${label}: ${side} not centered: ${JSON.stringify(result)}`);
    assert.ok(b[2]>b[0]&&b[3]>b[1],`${label}: ${side} has no projected geometry`);
  }
};
const zoom=async(value)=>{
  await page.evaluate(v=>window.roarHarness.zoom(v),value);
  await page.waitForFunction(v=>{
    const c=document.querySelector('canvas');
    return c && Number(c.dataset.drawerZoom)===v && Math.abs(Number(c.dataset.cameraMagnification)-v)<.015;
  },value,{timeout:15000,polling:100});
  // Bounds and camera metadata are sampled together; wait for one more sample
  // so animated entrance poses, not just the previous frame, are checked.
  await page.waitForTimeout(600);
};
try {
  for (const commander of ['matriarch','lampyris','worm']) {
    await page.goto(`${base}/scripts/spider-roar-harness.html?doctor=1&advenced=1&cmdA=${commander}&cmdB=${commander}`);
    await page.waitForFunction(()=>{
      const data=document.querySelector('canvas')?.dataset.commanderBounds;
      if(!data) return false;
      const b=JSON.parse(data); return b.ally && b.foe;
    },null,{timeout:20000,polling:100});
    await page.waitForTimeout(1400); // complete the entrance pop
    for (const [width,height] of [[280,180],[384,180],[812,225],[390,560],[1280,640]]) {
      await page.setViewportSize({width,height});
      await page.waitForFunction(([w,h])=>{const c=document.querySelector('canvas');return c&&c.clientWidth===w&&c.clientHeight===h;},[width,height],{timeout:10000,polling:100});
      for(const level of [1,1.15,1.32]) {
        await zoom(level);
        await checkBounds(`${commander} ${width}×${height} ${Math.round(level*100)}%`);
      }
      // Mouse parallax must not push the near model out of the frame either.
      await page.mouse.move(width-2,height-2);
      await page.waitForTimeout(1000);
      await checkBounds(`${commander} ${width}×${height} 132% with parallax`);
      await page.mouse.move(0,0);
      await page.waitForTimeout(700);
      await checkBounds(`${commander} ${width}×${height} 132% opposite parallax`);
      await page.mouse.move(width+5,height+5);
      console.log(`PASS ${commander} commander framing and parallax at ${width}×${height}`);
    }
    for(const level of [.86,.74]) {
      await zoom(level);
      await checkBounds(`${commander} ${Math.round(level*100)}%`);
    }
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
