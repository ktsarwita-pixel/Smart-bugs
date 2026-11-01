import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const reduced=process.env.REDUCED==='1', edge=process.env.EDGE==='1', short=process.env.SHORT==='1', lang=process.env.GAME_LANG||'en', zoom=Number(process.env.ZOOM)||1;
const scenario=process.env.SCENARIO||'interrupt'; // interrupt, simultaneous, legacy
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:edge?280:384,height:560},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await page.addInitScript(({reduced,lang})=>localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2,lang,motion:reduced?'reduced':'full',potato:false,background:'dark'})),{reduced,lang});
  const params=new URLSearchParams(); if(scenario==='legacy') params.set('legacy','1'); if(edge) params.set('edge','1'); if(short) params.set('short','1'); if(zoom!==1) params.set('zoom',String(zoom));
  await page.goto(`${base}/scripts/spider-roar-harness.html?${params}`);
  await page.waitForFunction(()=>window.roarHarness&&document.querySelectorAll('.ov-unit[data-roaring="true"]').length===2,null,{timeout:20000});
  const cue = uid => page.locator(`.roar-cue[data-roar-unit="${uid}"]`);
  if (scenario==='legacy') assert.equal(await page.locator('.roar-cue').count(),0);
  else {
    await cue(1).waitFor({state:'visible'}); await cue(3).waitFor({state:'visible'});
    assert.equal(await cue(1).getAttribute('data-roar-side'),'ally');
    assert.equal(await cue(3).getAttribute('data-roar-side'),'foe');
    assert.notEqual(await cue(1).evaluate(el=>getComputedStyle(el).getPropertyValue('--roar-line')),await cue(3).evaluate(el=>getComputedStyle(el).getPropertyValue('--roar-line')));
    assert.equal(await cue(1).getAttribute('aria-hidden'),'true');
    for (const uid of [1,3]) {
      assert.equal(await cue(uid).locator('.roar-cue__wave circle').count(),1,'one simple ring per Spider');
      assert.equal(await cue(uid).locator('.roar-cue__wave').count(),1);
      assert.equal(await cue(uid).locator('.roar-cue__rays, .roar-cue__halo').count(),0,'no busy rays or halo');
      const opacity=Number(await cue(uid).locator('.roar-cue__wave').evaluate(el=>getComputedStyle(el).opacity));
      assert.ok(opacity>=0&&opacity<=.52,`pressure ring should be translucent: ${opacity}`);
    }
    const separates = (a,b) => a.right<=b.left+1 || a.left>=b.right-1 || a.bottom<=b.top+1 || a.top>=b.bottom-1;
    for (const uid of [1,3]) {
      const {width,badge,bars}=await cue(uid).evaluate((el,uid)=>({
        width:el.getBoundingClientRect().width,
        badge:el.querySelector('.roar-cue__badge').getBoundingClientRect().toJSON(),
        bars:document.querySelector(`.ov-unit[data-unit-id="${uid}"] .ov-bars`).getBoundingClientRect().toJSON(),
      }),uid);
      assert.ok(width<=54,`roar cue should leave the battlefield visible on this phone: ${width}px`);
      assert.ok(separates(badge,bars),`roar label must not cover its health bar: ${JSON.stringify({badge,bars})}`);
    }
    // A vulnerable label grows the tag upward during a cast. The roar label
    // must follow the health bar instead of covering it in this real state.
    await page.evaluate(()=>window.roarHarness.battle.units.filter(u=>u.uid===1||u.uid===3).forEach(u=>u.vuln=2));
    await page.waitForFunction(()=>[1,3].every(id=>document.querySelector(`.ov-unit[data-unit-id="${id}"] .ov-name`)?.textContent),null,{timeout:10000,polling:100});
    // WebGL and layout can settle on different frames under CI load.
    await page.waitForFunction(short=>[1,3].every(id=>{
      const cue=document.querySelector(`.roar-cue[data-roar-unit="${id}"]`), unit=document.querySelector(`.ov-unit[data-unit-id="${id}"]`);
      const badge=cue.querySelector('.roar-cue__badge').getBoundingClientRect(), bars=unit.querySelector('.ov-bars').getBoundingClientRect(), stage=cue.closest('.ov-layer').getBoundingClientRect();
      const separate=badge.right<=bars.left+1||badge.left>=bars.right-1||badge.bottom<=bars.top+1||badge.top>=bars.bottom-1;
      return separate && (!short || [badge,bars].every(r=>r.left>=stage.left-1&&r.right<=stage.right+1&&r.top>=stage.top-1&&r.bottom<=stage.bottom+1));
    }),short,{timeout:10000,polling:100});
    for (const uid of [1,3]) {
      const {badge,bars,stage}=await cue(uid).evaluate((el,uid)=>({
        badge:el.querySelector('.roar-cue__badge').getBoundingClientRect().toJSON(),
        bars:document.querySelector(`.ov-unit[data-unit-id="${uid}"] .ov-bars`).getBoundingClientRect().toJSON(),
        stage:el.closest('.ov-layer').getBoundingClientRect().toJSON(),
      }),uid);
      assert.ok(separates(badge,bars),`status tag must not cause the roar to hide health: ${JSON.stringify({badge,bars})}`);
      if (short) for (const rect of [badge,bars]) assert.ok(rect.left>=stage.left-1&&rect.right<=stage.right+1&&rect.top>=stage.top-1&&rect.bottom<=stage.bottom+1,`short stage clips a roar label or health: ${JSON.stringify({rect,stage})}`);
    }
    await page.evaluate(()=>window.roarHarness.battle.units.forEach(u=>u.vuln=0));
    if (edge) {
      for (const uid of [1,3]) {
        const {badge,stage,text}=await cue(uid).evaluate(el=>({badge:el.querySelector('.roar-cue__badge').getBoundingClientRect().toJSON(),stage:el.closest('.ov-layer').getBoundingClientRect().toJSON(),text:el.innerText}));
        assert.ok(badge.left>=stage.left-1&&badge.right<=stage.right+1,`edge badge clipped: ${JSON.stringify(badge)}`);
        if (lang==='id') assert.match(text,/RAUNGAN!/);
      }
    }
  }
  const before = scenario==='legacy'?[]:await cue(1).locator('.roar-cue__wave').evaluateAll(nodes=>nodes.map(el=>el.style.transform));
  await page.evaluate(()=>window.roarHarness.step(6));
  await page.waitForFunction(reduced=>{
    const u=document.querySelector('.ov-unit[data-unit-id="1"]');
    return u && (reduced ? u.dataset.roarProgress==='50' : Number(u.dataset.roarProgress)>=25);
  },reduced,{timeout:10000});
  if (scenario!=='legacy') {
    const after = await cue(1).locator('.roar-cue__wave').evaluateAll(nodes=>nodes.map(el=>el.style.transform));
    if (reduced) assert.deepEqual(after,before,'reduced motion must hold still pressure rings');
    else assert.notDeepEqual(after,before,'pressure waves should follow cast progress');
  }
  if (scenario==='interrupt') {
    await page.evaluate(()=>window.roarHarness.interrupt(3));
    await page.waitForFunction(()=>document.querySelector('.roar-cue[data-roar-unit="3"]')?.hidden,null,{timeout:10000});
  }
  await page.evaluate(()=>window.roarHarness.step(9));
  if (scenario!=='legacy') {
    await page.waitForFunction(()=>document.querySelector('.roar-cue[data-roar-unit="1"]')?.dataset.roarCue==='impact',null,{timeout:10000});
    assert.match(await cue(1).innerText(),lang==='id'?/HANTAM!/:/IMPACT!/);
  }
  const state=await page.evaluate(()=>({units:window.roarHarness.battle.units.map(({uid,hp,roarEnd})=>({uid,hp,roarEnd})),lastRoarAt:window.roarHarness.battle.lastRoarAt}));
  assert.ok(Math.abs(state.lastRoarAt-1.5)<1e-8);
  if (scenario==='interrupt') {
    assert.equal(state.units.find(u=>u.uid===2).hp,5000,'interrupted foe must not damage allies');
    assert.equal(state.units.find(u=>u.uid===4).hp,4350,'completed allied roar still hits');
    assert.equal(state.units.find(u=>u.uid===3).roarEnd,1.5,'interrupted cast must not complete');
    assert.equal(await cue(3).isHidden(),true,'interrupted cast must not show impact');
  } else {
    assert.equal(state.units.find(u=>u.uid===2).hp,4350);
    assert.equal(state.units.find(u=>u.uid===4).hp,4350);
    if (scenario==='simultaneous') await page.waitForFunction(()=>document.querySelector('.roar-cue[data-roar-unit="3"]')?.dataset.roarCue==='impact',null,{timeout:10000});
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS roar cue ${scenario}, both sides, damage, reduced-motion=${reduced}, edge=${edge}, short-stage=${short}, zoom=${zoom}, lang=${lang}`);
} finally {await browser.close();}
