/** Real-game drawer zoom, fit, hit-target and localization regression. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:725},deviceScaleFactor:1.875,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
const settle=async value=>{
  await page.waitForFunction(value=>{
    const c=document.querySelector('.battle-stage canvas'), z=document.querySelector('.drawer-zoom');
    return c&&z&&Number(z.dataset.zoom)===value&&Math.abs(Number(c.dataset.cameraMagnification)-value)<.025;
  },value,{timeout:18000,polling:100});
  return Number(await page.locator('.battle-stage canvas').getAttribute('data-camera-distance'));
};
const layout=async (width,height,selected=false)=>{
  await page.setViewportSize({width,height});
  await page.locator('.drawer-zoom').scrollIntoViewIfNeeded();
  const result=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const stage=document.querySelector('.battle-stage'),group=stage.querySelector('.drawer-zoom'),scene=stage.querySelector('.scene-host'),sel=stage.querySelector('.selected-actions');
    return {stage:rect(stage),scene:rect(scene),group:rect(group),buttons:[...group.querySelectorAll('button')].map(rect),selected:sel?rect(sel):null,scrollWidth:document.documentElement.scrollWidth};
  });
  assert.ok(result.scrollWidth<=width,`${width}×${height}: horizontal overflow`);
  assert.ok(result.group.left>=result.stage.left&&result.group.right<=result.stage.right&&result.group.top>=result.stage.top&&result.group.bottom<=result.stage.bottom,`${width}×${height}: zoom controls outside stage: ${JSON.stringify(result)}`);
  assert.ok(result.scene.right<=result.group.left+1,`${width}×${height}: controls cover the drawer: ${JSON.stringify(result)}`);
  assert.ok(result.buttons.every(b=>b.width>=40&&b.height>=40&&b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=height),`${width}×${height}: zoom controls unreachable: ${JSON.stringify(result)}`);
  if(selected&&result.selected) assert.ok(!overlaps(result.group,result.selected),`${width}×${height}: zoom covers selected-unit actions: ${JSON.stringify(result)}`);
};
try {
  await page.goto(`${base}/?advenced&doctor=1`);
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  const plus=page.getByRole('button',{name:'Zoom in drawer'}), minus=page.getByRole('button',{name:'Zoom out drawer'}), output=page.locator('.drawer-zoom output');
  const normal=await settle(1);
  assert.equal(await output.innerText(),'100%');
  const initialGold=await page.locator('.deck-resources').innerText();
  await plus.tap(); const closer=await settle(1.15);
  assert.ok(closer<normal*.92,`zoom in did not move the actual camera: ${normal} -> ${closer}`);
  await plus.tap(); await settle(1.32); assert.equal(await plus.isDisabled(),true,'zoom-in limit');
  assert.equal(await output.innerText(),'132%');
  await page.waitForTimeout(1200); // allow the commander entrance and audit sample to settle
  const closeBounds=await page.locator('.battle-stage canvas').evaluate(c=>JSON.parse(c.dataset.commanderBounds));
  assert.ok(closeBounds.ally?.every(n=>n>=0&&n<=1),`commander must stay visible at maximum zoom: ${JSON.stringify(closeBounds)}`);
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  assert.doesNotMatch(await page.locator('.ui-doctor__body').innerText(),/Commander model clipped/,'the real close-zoom view must not clip the commander');
  await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
  for(let i=0;i<4;i++) await minus.tap();
  const farther=await settle(.74); assert.ok(farther>normal*1.25,`zoom out did not move actual camera: ${normal} -> ${farther}`);
  assert.equal(await minus.isDisabled(),true,'zoom-out limit');
  assert.equal(await output.innerText(),'74%');
  assert.equal(await page.locator('.deck-resources').innerText(),initialGold,'zoom must not spend gold or alter gameplay');
  await plus.tap(); await plus.tap(); await settle(1);
  assert.equal(await output.innerText(),'100%');
  for(const [w,h] of [[280,653],[320,568],[384,725],[812,375],[1280,800]]) await layout(w,h);
  await page.setViewportSize({width:384,height:725}); await page.evaluate(()=>scrollTo(0,0));
  await page.locator('.shop-grid button:not([disabled])').first().tap();
  await page.locator('.selected-actions').waitFor();
  for(const [w,h] of [[280,653],[384,725],[812,375]]) await layout(w,h,true);
  await page.setViewportSize({width:384,height:725}); await page.evaluate(()=>scrollTo(0,0));
  await plus.tap(); await settle(1.15);
  // Raycasting must use the zoomed camera: place the selected bench bug by
  // tapping an allied tile, not only by pressing the separate deploy button.
  const canvas=await page.locator('.battle-stage canvas').boundingBox();
  for (const y of [.58,.65,.72,.78,.84]) {
    await page.touchscreen.tap(canvas.x+canvas.width/2,canvas.y+canvas.height*y);
    if (await page.locator('.selected-actions').getByRole('button',{name:'BENCH',exact:true}).isVisible()) break;
  }
  assert.ok(await page.locator('.selected-actions').getByRole('button',{name:'BENCH',exact:true}).isVisible(),'zoomed drawer taps must still deploy on board cells');
  await page.getByRole('button',{name:/Engage battle/}).tap();
  await page.getByText('COMBAT TELEMETRY').waitFor({timeout:15000});
  assert.equal(await output.innerText(),'115%','zoom persists into combat');
  await minus.tap(); await settle(1);
  assert.equal(await output.innerText(),'100%','zoom works in combat');
  // Check Indonesian labels and reduced-motion camera changes in a fresh game.
  await page.goto(`${base}/?advenced&doctor=1`);
  await page.evaluate(()=>localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2,lang:'id',motion:'reduced',potato:false,background:'dark'})));
  await page.reload();
  await page.getByRole('button',{name:'MAINKAN'}).tap();
  await page.getByRole('button',{name:'MULAI RONDE 1'}).first().tap();
  await settle(1); await page.getByRole('button',{name:'Perkecil laci'}).tap();
  await settle(.86);
  assert.equal(await page.locator('.drawer-zoom output').innerText(),'86%');
  assert.equal(await page.getByRole('group',{name:'Zoom laci'}).count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS real camera zoom, limits, touch layout, selected actions, combat, Indonesian and reduced motion');
} finally {await browser.close();}
