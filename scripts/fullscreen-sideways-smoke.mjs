/** Fullscreen close zoom, real landscape interactions and orientation API fallbacks. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:353,height:784},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
const waitZoom=async value=>page.waitForFunction(value=>{
  const c=document.querySelector('.battle-stage canvas');
  return c?.dataset.commanderBounds && Number(c.dataset.drawerZoom)===value && Math.abs(Number(c.dataset.cameraMagnification)-value)<.02;
},value,{timeout:20000,polling:100});
const checkLandscape=async(width,height)=>{
  await page.setViewportSize({width,height});
  await page.waitForFunction(([w,h])=>{
    const c=document.querySelector('.battle-stage canvas');
    return innerWidth===w&&innerHeight===h&&c&&c.clientWidth>100&&c.clientHeight>100;
  },[width,height],{timeout:15000,polling:100});
  await page.waitForTimeout(900);
  const data=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const stage=document.querySelector('.battle-stage'),dock=document.querySelector('.game-dock'),row=document.querySelector('.deck-row');
    return {documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      stage:rect(stage),dock:rect(dock),row:rect(row),health:rect(row.querySelector('.deck-health')),round:rect(row.querySelector('.round-track')),
      matchup:rect(row.querySelector('.vs-plaque')),resources:rect(row.querySelector('.deck-resources')),help:rect(row.querySelector('.help-btn')),
      shop:[...document.querySelectorAll('.shop-grid button')].map(rect),actions:[...document.querySelectorAll('.action-bar button')].map(rect),
      ladder:[...document.querySelectorAll('.ladder-button')].map(rect),
      zoom:rect(document.querySelector('.drawer-zoom')),scene:rect(document.querySelector('.battle-stage .scene-host'))};
  });
  assert.ok(data.documentWidth<=width&&data.documentHeight<=height+1,`${width}×${height}: the page should fit sideways: ${JSON.stringify(data)}`);
  assert.ok(data.stage.right<=data.dock.left+1&&data.stage.height>=150,`${width}×${height}: drawer and side dock must fit without overlap: ${JSON.stringify(data)}`);
  assert.ok(data.actions.every(r=>r.top>=0&&r.bottom<=height&&r.width>=40&&r.height>=40),`${width}×${height}: actions must stay reachable: ${JSON.stringify(data)}`);
  assert.ok(data.shop.length===5&&data.shop.every(r=>r.left>=data.dock.left&&r.right<=data.dock.right),`${width}×${height}: five supply cards must fit`);
  assert.ok(data.ladder.length===8&&data.ladder.every(r=>r.width>=40&&r.height>=40),`${width}×${height}: standings must have tappable targets`);
  assert.ok(data.scene.right<=data.zoom.left+1&&data.zoom.bottom<=data.stage.bottom,`${width}×${height}: zoom covers the drawer`);
  const parts=[data.health,data.round,data.matchup,data.resources,data.help];
  for(let i=0;i<parts.length;i++){
    assert.ok(parts[i].left>=data.row.left-1&&parts[i].right<=data.row.right+1&&parts[i].top>=data.row.top-1&&parts[i].bottom<=data.row.bottom+1,`${width}×${height}: HUD part outside the deck: ${JSON.stringify(data)}`);
    for(const b of parts.slice(i+1)) assert.ok(!overlaps(parts[i],b),`${width}×${height}: HUD overlaps: ${JSON.stringify(data)}`);
  }
  return data;
};
const openTitleSettings=async()=>{await page.getByRole('button',{name:'SETTINGS'}).first().tap();return page.getByRole('dialog',{name:'SETTINGS'});};
try {
  // Reproduce the reported view in genuine Chromium fullscreen, not just CSS.
  await page.goto(`${base}/?advenced&doctor=1`);
  let settings=await openTitleSettings();
  await settings.getByRole('button',{name:'Enter fullscreen'}).tap();
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true,'browser entered actual fullscreen');
  await settings.getByRole('button',{name:'CLOSE'}).first().tap();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  await page.getByRole('button',{name:'Zoom in drawer'}).tap();
  await page.getByRole('button',{name:'Zoom in drawer'}).tap();
  await waitZoom(1.32); await page.waitForTimeout(1500);
  let bounds=await page.locator('.battle-stage canvas').evaluate(el=>JSON.parse(el.dataset.commanderBounds));
  assert.ok(bounds.ally?.every(n=>n>=0&&n<=1),`fullscreen 132% player commander is cut off: ${JSON.stringify(bounds)}`);
  assert.equal(await page.locator('.drawer-zoom output').innerText(),'132%');
  await checkLandscape(568,320);
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let smallReport=await page.locator('.ui-doctor__body').innerText();
  assert.match(smallReport,/Colony ladder scroll area/,'narrow sideways standings can be swiped');
  assert.doesNotMatch(smallReport,/BORDER|TAP|COVERED|HUD elements overlap|Commander model clipped/,`scrolling standings must not create false defects: ${smallReport}`);
  await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
  await page.locator('.ladder-strip').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const lastColony=page.locator('.ladder-button').last();
  await lastColony.tap(); assert.equal(await lastColony.getAttribute('aria-expanded'),'true','last scrolled colony must be tappable');
  await page.locator('.ladder-detail button').tap();
  for(const [w,h] of [[667,375],[784,353],[812,375],[1024,500]]) await checkLandscape(w,h);
  await checkLandscape(784,353);
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let report=await page.locator('.ui-doctor__body').innerText();
  assert.doesNotMatch(report,/Commander model clipped|HUD elements overlap|HUD element outside its deck|Page requires vertical scrolling/,`healthy sideways view must pass Doctor: ${report}`);
  await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
  await page.locator('.vs-plaque').tap();
  const scout=await page.locator('.scout-panel').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));
  assert.ok(scout.scroll<=scout.client+1,`sideways scout must not cut off the lineup: ${JSON.stringify(scout)}`);
  await page.locator('.vs-plaque').tap();
  await page.locator('.shop-grid button:not([disabled])').first().tap();
  await page.locator('.selected-actions').waitFor();
  const selections=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
    return {selection:rect(document.querySelector('.selected-actions')),zoom:rect(document.querySelector('.drawer-zoom'))};
  });
  assert.ok(!overlaps(selections.selection,selections.zoom),'selected actions must not cover the zoom rail');
  // At 132%, tapping actual tiles must still raycast to a valid allied cell.
  const canvas=await page.locator('.battle-stage canvas').boundingBox();
  for(const y of [.55,.62,.69,.76,.83]) {
    for(const x of [.38,.5,.62]) {
      await page.touchscreen.tap(canvas.x+canvas.width*x,canvas.y+canvas.height*y);
      if(await page.locator('.selected-actions').getByRole('button',{name:'BENCH',exact:true}).isVisible()) break;
    }
    if(await page.locator('.selected-actions').getByRole('button',{name:'BENCH',exact:true}).isVisible()) break;
  }
  assert.ok(await page.locator('.selected-actions').getByRole('button',{name:'BENCH',exact:true}).isVisible(),'landscape max-zoom tile taps must deploy the selected bug');
  await page.getByRole('button',{name:/Engage battle/}).tap();
  await page.getByText('COMBAT TELEMETRY').waitFor({timeout:15000});
  assert.equal(await page.locator('.drawer-zoom output').innerText(),'132%','zoom survives the combat transition');
  await page.getByRole('button',{name:'Zoom out drawer'}).tap();
  await waitZoom(1.15);

  // Mock a browser with an orientation API to cover ownership and permissions
  // deterministically; real orientation locking is unavailable in headless.
  await page.goto(`${base}/?advenced`);
  await page.evaluate(()=>{
    let full=null;
    window.__sideways={requests:0,exits:0,locks:[],unlocks:0,reject:false};
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>full});
    Element.prototype.requestFullscreen=async function(){window.__sideways.requests++;full=this;document.dispatchEvent(new Event('fullscreenchange'));};
    document.exitFullscreen=async()=>{window.__sideways.exits++;full=null;document.dispatchEvent(new Event('fullscreenchange'));};
    Object.defineProperty(screen,'orientation',{configurable:true,value:{
      lock:async value=>{window.__sideways.locks.push(value);if(window.__sideways.reject)throw new Error('denied');},
      unlock:()=>{window.__sideways.unlocks++;},type:'landscape-primary'
    }});
  });
  settings=await openTitleSettings();
  await settings.getByRole('button',{name:'Lock sideways orientation'}).tap();
  assert.equal(await settings.getByRole('button',{name:'Unlock sideways orientation'}).getAttribute('aria-pressed'),'true');
  assert.match(await settings.locator('#sideways-help').innerText(),/orientation is locked/);
  assert.deepEqual(await page.evaluate(()=>window.__sideways.locks),['landscape']);
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true,'lock requested fullscreen when needed');
  await settings.getByRole('button',{name:'CLOSE'}).first().tap();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  await page.locator('.bench-settings').tap();
  settings=page.getByRole('dialog',{name:'SETTINGS'});
  assert.equal(await settings.getByRole('button',{name:'Unlock sideways orientation'}).getAttribute('aria-pressed'),'true','lock survives the menu-to-match remount');
  await settings.getByRole('button',{name:'Unlock sideways orientation'}).tap();
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,'unlock releases fullscreen started by sideways mode');
  assert.equal(await page.evaluate(()=>window.__sideways.unlocks),1);
  await settings.getByRole('button',{name:'Enter fullscreen'}).tap();
  await settings.getByRole('button',{name:'Lock sideways orientation'}).tap();
  await settings.getByRole('button',{name:'Unlock sideways orientation'}).tap();
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true,'unlock preserves fullscreen entered separately');
  await settings.getByRole('button',{name:'Lock sideways orientation'}).tap();
  await settings.getByRole('button',{name:'Exit fullscreen'}).tap();
  assert.equal(await settings.getByRole('button',{name:'Lock sideways orientation'}).getAttribute('aria-pressed'),'false','fullscreen exit clears the lock state');
  assert.doesNotMatch(await settings.locator('#sideways-help').innerText(),/orientation is locked/,'fullscreen exit must clear stale lock feedback');
  await page.evaluate(()=>window.__sideways.reject=true);
  await settings.getByRole('button',{name:'Lock sideways orientation'}).tap();
  assert.match(await settings.locator('#sideways-help').innerText(),/Rotate your device sideways/,'denial explains the manual fallback');
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,'failed lock rolls back fullscreen it opened');
  assert.equal(await settings.getByRole('button',{name:'Lock sideways orientation'}).getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>Object.defineProperty(screen,'orientation',{configurable:true,value:{type:'portrait-primary',unlock(){}}}));
  await settings.getByRole('button',{name:'Lock sideways orientation'}).tap();
  assert.match(await settings.locator('#sideways-help').innerText(),/Rotate your device sideways/,'unsupported API has the same honest fallback');
  await settings.getByRole('button',{name:'CLOSE'}).first().tap();
  await page.goto(`${base}/?advenced`);
  await page.evaluate(()=>localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2,lang:'id',motion:'reduced',potato:false,background:'dark'})));
  await page.reload();
  await page.getByRole('button',{name:'PENGATURAN'}).first().tap();
  assert.ok(await page.getByText('MODE MENYAMPING').isVisible(),'sideways setting is translated');
  assert.ok(await page.getByRole('button',{name:'Kunci orientasi menyamping'}).isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS actual fullscreen 132% framing, sideways layouts, zoomed tile taps, combat, lock ownership, denial, fallback and Indonesian');
} finally {await browser.close();}
