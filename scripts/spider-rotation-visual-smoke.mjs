import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:560},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:5173'}/scripts/spider-roar-harness.html?prep=1&advenced=1&doctor=1`);
  await page.waitForFunction(()=>document.querySelector('.ov-unit[data-unit-id="1"]')?.dataset.spiderFacing,null,{timeout:20000,polling:100});
  const prepFacing=await page.locator('.ov-unit[data-unit-id="1"]').getAttribute('data-spider-facing');
  assert.ok(Math.abs(Number(prepFacing))<.0001,`allied Spider must face the enemy's half during prep: ${prepFacing}`);
  assert.equal(await page.locator('.ov-unit[data-unit-id="1"]').getAttribute('data-roar-facing'),null);
  // Compute expected headings from the actual nearest opposing unit, before
  // battle begins. The Spider sculpt faces local -Z, not +Z.
  const openingTargets=await page.evaluate(()=>[1,3].map(id=>{
    const units=window.roarHarness.battle.units, spider=units.find(u=>u.uid===id);
    const enemy=units.filter(u=>u.side!==spider.side && !u.dead).reduce((a,b)=>
      Math.hypot(a.x-spider.x,a.y-spider.y)<=Math.hypot(b.x-spider.x,b.y-spider.y)?a:b);
    const dx=enemy.x-spider.x, dz=enemy.y-spider.y;
    return {dx,dz,angle:Math.atan2(-dx,-dz),enemy:enemy.uid};
  }));
  await page.evaluate(()=>window.roarHarness.start());
  await page.waitForFunction(()=>[1,3].every(id=>document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.roarBody),null,{timeout:20000,polling:100});
  const transforms=()=>page.evaluate(()=>[1,3].map(id=>{
    const el=document.querySelector(`.ov-unit[data-unit-id="${id}"]`);
    return {facing:el.dataset.roarFacing,aim:el.dataset.roarAim,body:el.dataset.roarBody,head:el.dataset.roarHeadYaw,spiderFacing:el.dataset.spiderFacing};
  }));
  const initial=await transforms();
  for (const [index,pose] of initial.entries()) {
    const {dx,dz,angle,enemy}=openingTargets[index], facing=Number(pose.facing);
    const difference=Math.atan2(Math.sin(facing-angle),Math.cos(facing-angle));
    assert.ok(Math.abs(difference)<.0001,`${index ? 'opposing' : 'allied'} Spider must face opening enemy ${enemy}: ${JSON.stringify(pose)}`);
    assert.ok((-Math.sin(facing)*dx-Math.cos(facing)*dz)/Math.hypot(dx,dz)>.99999,'sculpt face normal must point at the enemy');
    assert.equal(pose.aim,pose.facing,'Doctor must record the opening enemy direction');
    assert.equal(pose.spiderFacing,pose.facing);
    assert.equal(pose.head,'0.00000','head must stay aligned with the enemy');
  }
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Spider not facing its opening enemy/,'Doctor must accept the healthy enemy-facing roar');
  await page.getByRole('button',{name:'DEEP SCAN'}).tap();
  await page.evaluate(()=>{
    const b=window.roarHarness.battle;
    b.units.find(u=>u.uid===2).x=0;
    b.units.find(u=>u.uid===4).x=6;
    window.roarHarness.step(1);
  });
  await page.getByText('WATCHING…').waitFor({state:'hidden',timeout:15000});
  report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Spider body rotated during roar|Spider not facing its opening enemy/,'healthy retargeting must not trigger Doctor');
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
  await page.waitForFunction(initial=>[1,3].some((id,i)=>{
    const now=Number(document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.spiderFacing), before=Number(initial[i].facing);
    return Math.abs(Math.atan2(Math.sin(now-before),Math.cos(now-before)))>.05;
  }),initial,{timeout:30000,polling:100});
  assert.deepEqual(errors,[]);
  console.log('PASS both Spiders aim at the opening enemy, stay still through retargeting, then resume tracking');
} finally {await browser.close();}
