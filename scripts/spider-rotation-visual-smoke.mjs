import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:560},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:5173'}/scripts/spider-roar-harness.html?prep=1&advenced=1&doctor=1`);
  await page.waitForFunction(()=>document.querySelector('.ov-unit[data-unit-id="1"]')?.dataset.spiderFacing,null,{timeout:20000,polling:100});
  const prepFacing=await page.locator('.ov-unit[data-unit-id="1"]').getAttribute('data-spider-facing');
  assert.ok(Math.abs(Number(prepFacing)-Math.PI)<.0001,`allied Spider must face the player before the round: ${prepFacing}`);
  assert.equal(await page.locator('.ov-unit[data-unit-id="1"]').getAttribute('data-roar-facing'),null);
  await page.evaluate(()=>window.roarHarness.start());
  await page.waitForFunction(()=>[1,3].every(id=>document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.roarBody),null,{timeout:20000,polling:100});
  const transforms=()=>page.evaluate(()=>[1,3].map(id=>{
    const el=document.querySelector(`.ov-unit[data-unit-id="${id}"]`);
    return {facing:el.dataset.roarFacing,body:el.dataset.roarBody,head:el.dataset.roarHeadYaw,spiderFacing:el.dataset.spiderFacing};
  }));
  const initial=await transforms();
  for (const [index,pose] of initial.entries()) {
    assert.ok(Math.abs(Number(pose.facing)-Math.PI)<.0001,`${index ? 'opposing' : 'allied'} roar must start facing the player, not its target: ${JSON.stringify(pose)}`);
    assert.equal(pose.spiderFacing,pose.facing);
    assert.equal(pose.head,'0.00000','head must face front without idle yaw');
  }
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Spider not facing the player/,'Doctor must accept the healthy front-facing roar');
  await page.getByRole('button',{name:'DEEP SCAN'}).tap();
  await page.evaluate(()=>{
    const b=window.roarHarness.battle;
    b.units.find(u=>u.uid===2).x=0;
    b.units.find(u=>u.uid===4).x=6;
    window.roarHarness.step(1);
  });
  await page.getByText('WATCHING…').waitFor({state:'hidden',timeout:15000});
  report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Spider body rotated during roar|Spider not facing the player/,'healthy retargeting must not trigger Doctor');
  assert.match(await page.locator('.ui-doctor__history summary').innerText(),/0 events/,'healthy roar must not pollute passive history');
  await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
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
  await page.waitForFunction(()=>[1,3].every(id=>Math.abs(Number(document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.spiderFacing)-Math.PI)>.05),null,{timeout:30000,polling:100});
  assert.deepEqual(errors,[]);
  console.log('PASS Spider faces front in prep and throughout both sides during roar, stays still through retargeting, then resumes tracking');
} finally {await browser.close();}
