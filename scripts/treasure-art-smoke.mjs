/** Short real-game check of the VS, board and post-round chest artwork. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5173')+'/?advenced');
  await page.evaluate(()=>sessionStorage.setItem('smartbugs.admin.unlocked','1')); await page.reload();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  const icon=page.locator('.vs-plaque .chest-icon--advanced');
  assert.equal(await icon.locator('[data-chest-grain]').count(),1);
  assert.equal(await icon.locator('[data-chest-emblem]').count(),1);
  assert.equal(await icon.locator('[data-chest-corners]').count(),1);
  const centered=await icon.evaluate(el=>{const b=el.querySelector('[data-chest-lock]').getBBox();return Math.abs(b.x+b.width/2-el.viewBox.baseVal.width/2)});
  assert.ok(centered<.1,'VS icon lock stays centered');
  if(process.env.CAPTURE_PREFIX) await icon.screenshot({path:`${process.env.CAPTURE_PREFIX}-vs.png`});
  await page.waitForFunction(()=>document.querySelector('.battle-stage canvas')?.dataset.chestFacingError!==undefined,null,{timeout:20000,polling:100});
  const board=await page.locator('.battle-stage canvas').evaluate(c=>({facing:Number(c.dataset.chestFacingError),gap:Number(c.dataset.chestHingeGap)}));
  assert.ok(Math.abs(board.facing)<.01&&board.gap<.001,'board chest faces player with connected hinge');
  if(process.env.CAPTURE_PREFIX) await page.locator('.battle-stage canvas').screenshot({path:`${process.env.CAPTURE_PREFIX}-board.png`});
  await page.getByRole('button',{name:'Open admin panel'}).first().tap();
  await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
  await page.getByLabel('Admin command').fill('give spider 3'); await page.getByRole('button',{name:'RUN',exact:true}).tap();
  await page.getByRole('button',{name:'Close admin panel'}).tap();
  await page.getByRole('button',{name:/Engage battle/}).tap();
  await page.getByText('COMBAT TELEMETRY').waitFor();
  await page.getByRole('button',{name:'Open admin panel'}).first().tap();
  await page.getByRole('tab',{name:'MATCH'}).tap(); await page.getByRole('button',{name:'FORCE WIN'}).tap();
  await page.getByRole('button',{name:'Close admin panel'}).tap();
  const chest=page.locator('.treasure-result .treasure-chest-3d'); await chest.waitFor({state:'visible',timeout:30000});
  assert.equal(await chest.getAttribute('data-renderer'),'css3d');
  assert.equal(await chest.locator('.pixel-treasure,canvas').count(),0,'no old artwork or renderer swap');
  assert.equal(await chest.locator('.treasure-chest-3d__body-front > svg[shape-rendering="crispEdges"]').count(),1);
  assert.equal(await chest.locator('.treasure-chest-3d__lid-bottom > svg[shape-rendering="crispEdges"]').count(),1);
  assert.equal(await chest.locator('[data-chest-emblem]').count(),1);
  assert.equal(await chest.locator('[data-chest-ridge]').count(),1);
  if(process.env.CAPTURE_PREFIX) await chest.screenshot({path:`${process.env.CAPTURE_PREFIX}-reward.png`});
  for (const [width,height] of [[320,568],[384,725]]) {
    await page.setViewportSize({width,height});
    const geom=await chest.evaluate(el=>{const r=el.getBoundingClientRect(),a=el.querySelector('.treasure-chest-3d__body-anchor').getBoundingClientRect(),b=el.querySelector('.treasure-chest-3d__lid-anchor').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,gap:Math.hypot(a.left-b.left,a.top-b.top)}});
    assert.ok(geom.left>=0&&geom.right<=width&&geom.top>=0&&geom.bottom<=height&&geom.gap<1,`chest fits and stays connected at ${width}x${height}: ${JSON.stringify(geom)}`);
    assert.ok(await page.locator('.result-next').isVisible());
  }
  assert.deepEqual(errors,[]);
  console.log('PASS real VS, board and reward pixel art at desktop and narrow mobile sizes');
} finally {await browser.close();}
