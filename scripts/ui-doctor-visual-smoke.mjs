/** Verify Doctor detects real, injected visual faults without pressing game controls. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:560},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:5173'}/scripts/chest-3d-harness.html?advenced=1&doctor=1`);
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  let text=await page.locator('.ui-doctor__body').innerText();
  assert.match(text,/1 visual targets/);
  assert.doesNotMatch(text,/Chest not facing|Chest lid disconnected|Old chest artwork|Chest depth flattened/,'healthy chest must not generate false positives');
  await page.evaluate(()=>{
    const chest=document.querySelector('.treasure-chest-3d');
    chest.querySelector('.treasure-chest-3d__world').style.transform='rotateX(-12deg) rotateY(35deg)';
    chest.querySelector('.treasure-chest-3d__lid-anchor').style.left='calc(50% + 7px)';
    const old=document.createElement('div');old.className='pixel-treasure';old.id='old-chest-fixture';chest.appendChild(old);
    const canvas=document.createElement('canvas');canvas.id='bad-board';canvas.width=70;canvas.height=50;canvas.style.cssText='position:fixed;left:5px;top:100px;width:70px;height:50px';canvas.dataset.chestFacingError='0.7';canvas.dataset.chestHingeGap='0.05';document.body.append(canvas);
    const img=document.createElement('img');img.src='/missing-doctor-image.png';img.alt='Broken visual fixture';img.style.cssText='position:fixed;left:5px;top:165px;width:30px;height:30px';document.body.append(img);
    const spider=document.createElement('div');spider.className='ov-unit';spider.id='bad-spider';spider.textContent='Spider';spider.style.cssText='position:fixed;left:5px;top:205px;width:55px;height:25px';
    spider.dataset.unitId='999';spider.dataset.roaring='true';spider.dataset.roarFacing='1';spider.dataset.roarHeadYaw='0';spider.dataset.roarBody='0,0,0';document.body.append(spider);
  });
  await page.waitForFunction(()=>document.querySelector('img[alt="Broken visual fixture"]').complete);
  await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
  text=await page.locator('.ui-doctor__body').innerText();
  for(const phrase of ['Chest not facing the player','Chest lid disconnected','Old chest artwork visible','Board chest not facing the player','Board chest hinge disconnected','Image failed to load','Spider not facing the player']) assert.ok(text.includes(phrase),`missing Doctor finding: ${phrase}\n${text}`);
  await page.locator('.ui-doctor__history summary').tap();
  assert.match(await page.locator('.ui-doctor__history').innerText(), /Old pixel chest appeared/, 'passive history should catch the flash before a deep scan');
  await page.evaluate(()=>{
    const chest=document.querySelector('.treasure-chest-3d');
    chest.querySelector('.treasure-chest-3d__world').style.transform='';
    chest.querySelector('.treasure-chest-3d__lid-anchor').style.left='';
    document.querySelector('#bad-board').remove();document.querySelector('img[alt="Broken visual fixture"]').remove();
    document.querySelector('#bad-spider').dataset.roarFacing=String(Math.PI);
  });
  await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
  await page.getByRole('button',{name:'Open',exact:true}).tap();
  await page.evaluate(()=>{
    const chest=document.querySelector('.treasure-chest-3d');
    chest.querySelector('.treasure-chest-3d__lid').getAnimations()[0].pause();
    chest.dataset.renderer='fallback';
    setTimeout(()=>{chest.dataset.renderer='webgl';document.querySelector('#old-chest-fixture')?.remove();},650);
  });
  await page.getByRole('button',{name:'Open UI Doctor'}).tap();
  await page.getByRole('button',{name:'DEEP SCAN'}).tap();
  await page.evaluate(()=>{ document.querySelector('#bad-spider').dataset.roarBody='0,0.5,0'; });
  await page.getByText('WATCHING…').waitFor({state:'hidden',timeout:10000});
  text=await page.locator('.ui-doctor__body').innerText();
  assert.match(text,/Chest artwork changed during scan/,'deep scan catches a late renderer swap');
  assert.match(text,/Chest opening is stalled/,'deep scan catches paused lid animation');
  assert.match(text,/Spider body rotated during roar/,'deep scan catches body rotation while roaring');
  assert.match(text,/deep observation/);
  await page.locator('.ui-doctor__history summary').tap();
  assert.match(await page.locator('.ui-doctor__history').innerText(), /renderer switched/i, 'history retains the transient renderer swap');
  assert.match(await page.locator('.ui-doctor__history').innerText(), /Spider body rotated during Battle Roar/i, 'history retains brief roar rotation');
  await page.getByRole('button',{name:'CLEAR HISTORY'}).tap();
  assert.match(await page.locator('.ui-doctor__history summary').innerText(),/0 events/);
  for(const [width,height] of [[280,653],[320,568],[390,844],[812,375]]) {
    await page.setViewportSize({width,height});
    const layout=await page.locator('.ui-doctor__panel').evaluate(panel=>{
      const p=panel.getBoundingClientRect();
      return {panel:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},buttons:[...panel.querySelectorAll('.ui-doctor__actions button')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,scroll:b.scrollWidth,client:b.clientWidth}})};
    });
    assert.ok(layout.panel.left>=0&&layout.panel.right<=width&&layout.panel.top>=0&&layout.panel.bottom<=height,`Doctor panel must fit ${width}x${height}`);
    assert.ok(layout.buttons.every(b=>b.left>=0&&b.right<=width&&b.height>=40&&b.scroll<=b.client+1),`Doctor actions must fit and stay tappable at ${width}x${height}`);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS advanced Doctor detects chest faults, bad Spider facing/rotation, fallback flashes, failed images and stalled animation');
} finally {await browser.close();}
