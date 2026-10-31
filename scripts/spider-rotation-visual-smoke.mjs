import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:560},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:5173'}/scripts/spider-roar-harness.html`);
  await page.waitForFunction(()=>[1,3].every(id=>document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.roarBody),null,{timeout:20000});
  const transforms=()=>page.evaluate(()=>[1,3].map(id=>{
    const el=document.querySelector(`.ov-unit[data-unit-id="${id}"]`);
    return {facing:el.dataset.roarFacing,body:el.dataset.roarBody};
  }));
  const initial=await transforms();
  for (let i=0;i<5;i++) {
    // Force dramatic target switches on both sides while the cast progresses.
    await page.evaluate(i=>{
      const b=window.roarHarness.battle;
      const [ally,foe]=[b.units.find(u=>u.uid===2),b.units.find(u=>u.uid===4)];
      ally.x=i%2?0:6; ally.y=i%2?6:0;
      foe.x=i%2?6:0; foe.y=i%2?0:6;
      window.roarHarness.step(2);
    },i);
    await page.waitForFunction(n=>Number(document.querySelector('.ov-unit[data-unit-id="1"]')?.dataset.roarProgress)>=n,(i+1)*6,{timeout:30000,polling:100});
    assert.deepEqual(await transforms(),initial,`both Spider bodies stay fixed as targets move, step ${i}`);
  }
  await page.evaluate(()=>window.roarHarness.step(5));
  await page.waitForFunction(()=>[1,3].every(id=>!document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.roarBody),null,{timeout:30000,polling:100});
  assert.deepEqual(errors,[]);
  console.log('PASS both Spider bodies and facings stay fixed through retargeting, then unlock after roar');
} finally {await browser.close();}
