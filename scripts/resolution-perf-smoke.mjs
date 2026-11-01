/** Resolution, frame pacing and real-device interactions for the advanced game. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const bundled = await build({entryPoints:['src/game/render-quality.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {renderPixelRatio,RenderFrameGate,isRenderResolution} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);
for (const value of ['auto','low','medium','high']) assert.ok(isRenderResolution(value));
for (const value of ['',null,'ultra','HIGH',42]) assert.equal(isRenderResolution(value),false);
assert.equal(renderPixelRatio('high',3,true,false),1.75);
assert.equal(renderPixelRatio('high',3,false,false),2);
assert.equal(renderPixelRatio('low',3,true,false),.875);
assert.equal(renderPixelRatio('medium',3,true,false),1.3125);
assert.equal(renderPixelRatio('auto',3,true,false),1.35);
assert.ok(Math.abs(renderPixelRatio('auto',3,true,false,.6)-.81)<1e-8);
assert.equal(renderPixelRatio('high',3,true,false,.6),1.75,'manual presets never adapt');
assert.equal(renderPixelRatio('high',3,true,true),.96,'Potato caps the selected resolution');
assert.equal(renderPixelRatio('low',1,true,true),.5,'Potato never increases a low choice');
assert.equal(renderPixelRatio('high',NaN,false,false),1,'invalid device DPR is safe');
for (const hz of [30,60,90,120,144,240]) {
  const gate=new RenderFrameGate(); gate.reset(0); let rendered=0;
  for (let i=1;i<=hz*10;i++) if(gate.shouldRender(i*1000/hz)) rendered++;
  const expected=Math.min(60,hz)*10;
  assert.ok(Math.abs(rendered-expected)<=1,`${hz} Hz should render about ${expected} frames, got ${rendered}`);
  gate.reset(20_000);
  assert.equal(gate.shouldRender(20_008),false,'resume starts a fresh frame interval');
}

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:725},deviceScaleFactor:1.875,isMobile:true,hasTouch:true});
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
const canvas=()=>page.locator('canvas[data-render-resolution]');
const read=()=>canvas().evaluate(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,mode:c.dataset.renderResolution,dpr:Number(c.dataset.renderDpr),potato:c.dataset.renderPotato}));
const waitMode=async (mode,dpr)=>{
  await page.waitForFunction(({mode,dpr})=>{
    const c=document.querySelector('canvas[data-render-resolution]');
    return !!c && c.dataset.renderResolution===mode && Math.abs(Number(c.dataset.renderDpr)-dpr)<.002 && c.width>1 && c.height>1 && Math.abs(c.width-c.clientWidth*dpr)<3 && Math.abs(c.height-c.clientHeight*dpr)<3;
  },{mode,dpr},{timeout:20000,polling:100});
  return read();
};
const choose=async label=>page.getByRole('radio',{name:label,exact:true}).tap();
const openSettings=async()=>page.getByRole('button',{name:'SETTINGS',exact:true}).tap();
const closeSettings=async()=>page.getByRole('dialog',{name:'SETTINGS'}).getByRole('button',{name:'CLOSE',exact:true}).last().tap();
try {
  await page.goto(`${base}/?advenced&doctor=1`);
  await waitMode('auto',1.35);
  await openSettings();
  assert.equal(await page.getByRole('radio',{name:'Auto — adaptive'}).getAttribute('aria-checked'),'true');
  for(const [w,h] of [[280,653],[320,568],[384,725],[812,375]]) {
    await page.setViewportSize({width:w,height:h});
    await page.getByRole('radiogroup',{name:'3D RESOLUTION'}).scrollIntoViewIfNeeded();
    const boxes=await page.getByRole('radiogroup',{name:'3D RESOLUTION'}).evaluate(group=>{
      const p=group.getBoundingClientRect();return {group:{left:p.left,right:p.right},buttons:[...group.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scroll:b.scrollWidth,client:b.clientWidth};})};
    });
    assert.ok(boxes.group.left>=0&&boxes.group.right<=w&&boxes.buttons.every(b=>b.width>=40&&b.height>=40&&b.left>=0&&b.right<=w&&b.scroll<=b.client+1),`resolution choices fit and stay tappable ${w}×${h}: ${JSON.stringify(boxes)}`);
  }
  await page.setViewportSize({width:384,height:725});
  await choose('High — 100%'); const high=await waitMode('high',1.75);
  await page.setViewportSize({width:812,height:375}); await waitMode('high',1.875);
  await page.setViewportSize({width:384,height:725}); await waitMode('high',1.75);
  await choose('Medium — 75%'); const medium=await waitMode('medium',1.3125);
  await choose('Low — 50%'); const low=await waitMode('low',.875);
  assert.equal(low.cssWidth,high.cssWidth,'CSS/UI size remains unchanged');
  assert.equal(low.cssHeight,high.cssHeight,'CSS/UI size remains unchanged');
  assert.ok(low.width*low.height < high.width*high.height*.26,'Low should render about one quarter as many pixels as High');
  assert.ok(medium.width*medium.height > low.width*low.height && medium.width*medium.height < high.width*high.height);
  // Arrow keys use the radio pattern and must not also spin the title menu.
  await page.getByRole('radio',{name:'Low — 50%'}).focus();
  await page.keyboard.press('ArrowRight'); await waitMode('medium',1.3125);
  assert.equal(await page.getByRole('radio',{name:'Medium — 75%'}).getAttribute('aria-checked'),'true');
  assert.equal(await page.getByRole('radio',{name:'Medium — 75%'}).evaluate(el=>el===document.activeElement),true);
  await choose('High — 100%');
  await choose('On — weakest devices'); const potato=await waitMode('high',.96); assert.equal(potato.potato,'1');
  await choose('Off — full quality'); await waitMode('high',1.75);
  await closeSettings();
  assert.equal(await page.evaluate(()=>localStorage.getItem('smartbugs.renderResolution')),'high');
  await page.reload(); await waitMode('high',1.75);
  await openSettings(); assert.equal(await page.getByRole('radio',{name:'High — 100%'}).getAttribute('aria-checked'),'true'); await closeSettings();
  // The original build has no new option, and its old settings writer must
  // not erase the preference when a player returns to the advanced build.
  await page.goto(base+'/');
  await openSettings(); assert.equal(await page.getByRole('radiogroup',{name:'3D RESOLUTION'}).count(),0); await closeSettings();
  await page.goto(`${base}/?advenced&doctor=1`); await waitMode('high',1.75);
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  await waitMode('high',1.75);
  const scroll=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
  assert.ok(scroll<=2,`384×725 preparation must still fit without scrolling: ${scroll}px`);
  // Settings is now available during preparation without moving the board.
  const boardBefore=await page.locator('.battle-stage').boundingBox();
  await openSettings();
  await page.getByRole('radio',{name:'Low — 50%'}).focus(); await page.keyboard.press('Enter');
  await waitMode('low',.875);
  assert.equal(await page.getByText('COMBAT TELEMETRY').count(),0,'Enter in Settings must not engage battle behind the modal');
  await closeSettings();
  assert.deepEqual(await page.locator('.battle-stage').boundingBox(),boardBefore,'opening Settings must not resize the board');
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let report=await page.locator('.ui-doctor__body').innerText();
  assert.match(report,/3D render \d+×\d+ · 0\.875× · low/);
  assert.doesNotMatch(report,/3D resolution (unavailable|mismatch)/,'valid low resolution is not a Doctor error');
  await page.evaluate(()=>{const c=document.querySelector('canvas[data-render-resolution]');c.dataset.renderDpr='invalid';});
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  report=await page.locator('.ui-doctor__body').innerText();
  assert.match(report,/3D resolution unavailable/,'Doctor catches invalid render metadata');
  await page.evaluate(()=>{document.querySelector('canvas[data-render-resolution]').dataset.renderDpr='4';});
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  assert.match(await page.locator('.ui-doctor__body').innerText(),/3D resolution mismatch/,'Doctor catches a wrongly sized drawing buffer');
  await page.evaluate(()=>{document.querySelector('canvas[data-render-resolution]').dataset.renderDpr='0.875';});
  await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
  await page.locator('.shop-grid button:not([disabled])').first().tap();
  await page.locator('.selected-actions').getByRole('button',{name:'DEPLOY'}).tap();
  await page.getByRole('button',{name:/Engage battle/}).tap();
  await page.getByText('COMBAT TELEMETRY').waitFor({timeout:15000});
  await waitMode('low',.875);
  assert.equal(await page.getByRole('button',{name:'SETTINGS',exact:true}).isVisible(),true,'combat settings remain available');
  const speedBefore=await page.getByRole('button',{name:'1×',exact:true}).getAttribute('aria-pressed');
  await openSettings();
  await page.getByRole('radio',{name:'Medium — 75%'}).focus(); await page.keyboard.press('Space');
  await waitMode('medium',1.3125); await closeSettings();
  assert.equal(await page.getByRole('button',{name:'1×',exact:true}).getAttribute('aria-pressed'),speedBefore,'Space in Settings must not change battle speed');
  // Language and saved quality survive a fresh advanced visit.
  await page.goto(`${base}/?advenced`);
  await page.evaluate(()=>localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2,lang:'id',motion:'reduced',potato:false,background:'dark'})));
  await page.reload(); await waitMode('medium',1.3125);
  await page.getByRole('button',{name:'PENGATURAN'}).tap();
  assert.equal(await page.getByRole('radio',{name:'Sedang — 75%'}).getAttribute('aria-checked'),'true');
  await page.getByRole('radio',{name:'Rendah — 50%'}).tap(); await waitMode('low',.875);
  // Exercise Auto's actual slow-frame governor with a monotonically faster
  // synthetic RAF clock in prep (no simulation/game rules are altered).
  await page.goto(`${base}/?advenced`);
  await page.evaluate(()=>{
    localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2,lang:'en',motion:'full',potato:false,background:'dark'}));
    localStorage.setItem('smartbugs.renderResolution','auto');
  });
  await page.reload();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  await page.locator('.battle-stage canvas[data-render-resolution="auto"]').waitFor();
  await page.evaluate(()=>{
    const native=window.requestAnimationFrame.bind(window), start=performance.now();
    window.requestAnimationFrame=callback=>native(timestamp=>callback(start+Math.max(0,timestamp-start)*3));
  });
  await page.waitForFunction(()=>Number(document.querySelector('.battle-stage canvas')?.dataset.renderDpr)<1.3,null,{polling:100,timeout:20000});
  assert.equal(await page.locator('.battle-stage canvas').getAttribute('data-render-resolution'),'auto','Auto must remain selected while it adapts');
  await page.evaluate(()=>localStorage.setItem('smartbugs.renderResolution','invalid'));
  await page.reload(); await waitMode('auto',1.35);
  assert.equal(await page.evaluate(()=>localStorage.getItem('smartbugs.renderResolution')),'auto','invalid saved values fall back safely');
  assert.deepEqual(errors,[]);
  console.log(`PASS frame pacing at 30–240 Hz, adaptive scaling, real 3D resolution presets (${low.width}×${low.height} vs ${high.width}×${high.height}), settings, persistence, Potato, Doctor, gameplay and Indonesian`);
} finally {await browser.close();}
