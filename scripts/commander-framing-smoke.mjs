/** Verify actual projected 3D commander geometry stays in the stage. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:180},isMobile:true,hasTouch:true});
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  for (const commander of ['matriarch','lampyris','worm']) {
    await page.goto(`${base}/scripts/spider-roar-harness.html?doctor=1&advenced=1&cmdA=${commander}&cmdB=${commander}`);
    await page.waitForFunction(()=>{
      const data=document.querySelector('canvas')?.dataset.commanderBounds;
      if(!data) return false;
      const b=JSON.parse(data); return b.ally && b.foe;
    },null,{timeout:20000,polling:100});
    await page.waitForTimeout(1200); // complete the entrance pop
    for (const [width,height] of [[280,180],[384,180],[812,225],[390,560],[1280,640]]) {
      await page.setViewportSize({width,height});
      await page.waitForFunction(([w,h])=>{const c=document.querySelector('canvas');return c&&c.clientWidth===w&&c.clientHeight===h;},[width,height],{timeout:10000,polling:100});
      await page.waitForTimeout(850); // camera easing and Doctor sampling
      const result=await page.locator('canvas').evaluate(el=>JSON.parse(el.dataset.commanderBounds));
      for (const side of ['ally','foe']) {
        const b=result[side];
        assert.ok(b?.length===4 && b.every(n=>n>=0&&n<=1),`${commander} ${side} clipped at ${width}×${height}: ${JSON.stringify(result)}`);
        assert.ok(Math.abs((b[0]+b[2])/2-.5)<.08,`${commander} ${side} not centered at ${width}×${height}: ${JSON.stringify(result)}`);
        assert.ok(b[2]>b[0]&&b[3]>b[1],`${commander} ${side} has no visible projected geometry`);
      }
      console.log(`PASS ${commander} commander framing at ${width}×${height}`);
    }
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
