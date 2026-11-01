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
  // Put the nearest enemies diagonally off-center. A lock to the target
  // would turn both Spiders away from straight across the opposing side.
  const targetOffsets=await page.evaluate(()=>{
    const units=window.roarHarness.battle.units;
    const ally=units.find(u=>u.uid===1), foe=units.find(u=>u.uid===3);
    const allyStag=units.find(u=>u.uid===2), foeStag=units.find(u=>u.uid===4);
    Object.assign(allyStag,{x:foe.x-1,y:foe.y+1});
    Object.assign(foeStag,{x:ally.x+1,y:ally.y-1});
    return [Math.atan2(-(foeStag.x-ally.x),-(foeStag.y-ally.y)),Math.atan2(-(allyStag.x-foe.x),-(allyStag.y-foe.y))];
  });
  assert.ok(Math.abs(targetOffsets[0])>.2 && Math.abs(targetOffsets[1]-Math.PI)>.2,'fixture must present diagonal targets');
  await page.evaluate(()=>window.roarHarness.start());
  await page.waitForFunction(()=>[1,3].every(id=>document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.roarBody),null,{timeout:20000,polling:100});
  const transforms=()=>page.evaluate(()=>[1,3].map(id=>{
    const el=document.querySelector(`.ov-unit[data-unit-id="${id}"]`);
    return {facing:el.dataset.roarFacing,aim:el.dataset.roarAim,body:el.dataset.roarBody,head:el.dataset.roarHeadYaw,spiderFacing:el.dataset.spiderFacing};
  }));
  const initial=await transforms();
  for (const [index,pose] of initial.entries()) {
    const expected=index===0?0:Math.PI, facing=Number(pose.facing);
    const difference=Math.atan2(Math.sin(facing-expected),Math.cos(facing-expected));
    assert.ok(Math.abs(difference)<.0001,`${index ? 'foe' : 'ally'} Spider must face straight across the opposing side: ${JSON.stringify(pose)}`);
    assert.equal(pose.aim,pose.facing,'Doctor must record the straight-ahead direction');
    assert.equal(pose.spiderFacing,pose.facing);
    assert.equal(pose.head,'0.00000','head must stay aligned with the body');
  }
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Spider not facing the enemy side|Spider roar label covers health|Spider roar label clipped/,'Doctor must accept the healthy straight-ahead roar');
  // Inject the exact non-interactive label/health overlap the Doctor should
  // catch, then restore the normal layout before observing animation.
  await page.evaluate(()=>{
    const cue=document.querySelector('.roar-cue[data-roar-unit="1"]');
    const badge=cue.querySelector('.roar-cue__badge');
    const bars=document.querySelector('.ov-unit[data-unit-id="1"] .ov-bars');
    const delta=bars.getBoundingClientRect().top-badge.getBoundingClientRect().bottom+6;
    badge.style.transform=`translate(calc(-50% + var(--roar-label-shift, 0px)), calc(-100% + ${delta}px))`;
  });
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  report=await page.locator('.ui-doctor__body').innerText();
  assert.match(report,/Spider roar label covers health/,'Doctor must detect a decorative roar label over HP');
  await page.evaluate(()=>{
    const badge=document.querySelector('.roar-cue[data-roar-unit="1"] .roar-cue__badge');
    badge.style.transform=''; badge.style.top='-1000px';
  });
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  report=await page.locator('.ui-doctor__body').innerText();
  assert.match(report,/Spider roar label clipped/,'Doctor must detect a clipped roar label');
  await page.evaluate(()=>{document.querySelector('.roar-cue[data-roar-unit="1"] .roar-cue__badge').style.top='';});
  await page.getByRole('button',{name:'DEEP SCAN'}).tap();
  await page.evaluate(()=>{
    const b=window.roarHarness.battle;
    b.units.find(u=>u.uid===2).x=0;
    b.units.find(u=>u.uid===4).x=6;
    window.roarHarness.step(1);
  });
  await page.getByText('WATCHING…').waitFor({state:'hidden',timeout:15000});
  report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Spider body rotated during roar|Spider not facing the enemy side/,'healthy retargeting must not trigger Doctor');
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
  // After the roar, force each side to track targets first left, then right.
  for (const [offset,expected] of [[-.4,Math.PI/2],[.4,-Math.PI/2]]) {
    await page.evaluate(offset=>{
      const units=window.roarHarness.battle.units;
      const ally=units.find(u=>u.uid===1), foe=units.find(u=>u.uid===3);
      Object.assign(units.find(u=>u.uid===2),{x:foe.x+offset,y:foe.y});
      Object.assign(units.find(u=>u.uid===4),{x:ally.x+offset,y:ally.y});
    },offset);
    await page.waitForFunction(expected=>[1,3].every(id=>{
      const now=Number(document.querySelector(`.ov-unit[data-unit-id="${id}"]`)?.dataset.spiderFacing);
      return Math.abs(Math.atan2(Math.sin(now-expected),Math.cos(now-expected)))<.15;
    }),expected,{timeout:30000,polling:100});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS both Spiders face straight across the opposing side through roar and turn freely afterward');
} finally {await browser.close();}
