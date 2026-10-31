import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({viewport:{width:384,height:725},deviceScaleFactor:1.875,isMobile:true,hasTouch:true});
const errors=[]; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:5188')+'/?advenced');
  await page.evaluate(() => sessionStorage.setItem('smartbugs.admin.unlocked','1'));
  await page.reload();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  // A strong fielded unit keeps this UI fixture from naturally losing while
  // software WebGL is busy and the admin panel is being opened.
  await page.getByRole('button',{name:'Open admin panel'}).first().tap();
  await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
  await page.getByLabel('Admin command').fill('give spider 3');
  await page.getByRole('button',{name:'RUN',exact:true}).tap();
  await page.getByRole('button',{name:'Close admin panel'}).tap();
  for (let round=1;round<=4;round++) {
    const track = page.locator('.round-track--compact');
    assert.match(await track.getAttribute('aria-label'), new RegExp(`PERIOD 1.*ROUND ${round}/4`));
    assert.equal(await track.locator('.round-track__cell').count(),4);
    assert.equal(await track.locator('.round-track__icon').count(),4);
    assert.equal(await track.locator('.round-track__cell[data-treasure="1"] svg').count(),2);
    assert.equal(await track.locator('.round-track__cell[data-treasure="0"] svg').count(),2);
    const colors = await track.locator('.round-track__cell').evaluateAll(els => els.map(el => getComputedStyle(el).color));
    for (const color of colors) { const rgb = color.match(/\d+/g).map(Number); assert.equal(rgb[0],rgb[1]); assert.equal(rgb[1],rgb[2]); }

    assert.equal(await track.locator('.round-track__cell[data-state="current"]').count(),1);
    assert.equal(await track.locator('.round-track__cell[data-treasure="1"]').count(),2);
    if (round===1 || round===4) {
      assert.ok(await page.getByText('TREASURE GUARDS').count()>0);
      assert.equal(await page.locator('.vs-plaque .chest-icon--advanced').count(),1,'enhanced VS chest icon');
      const icon=await page.locator('.vs-plaque .chest-icon--advanced').evaluate(svg=>{
        const silhouette=svg.querySelector('path').getBBox(), lock=svg.querySelector('[data-chest-lock]').getBBox(), view=svg.viewBox.baseVal;
        const mid=view.x+view.width/2;
        return {silhouette:Math.abs(silhouette.x+silhouette.width/2-mid),lock:Math.abs(lock.x+lock.width/2-mid)};
      });
      assert.ok(icon.silhouette<.1 && icon.lock<.1,'VS icon must be symmetric and face the player');
      await page.waitForFunction(()=>document.querySelector('.battle-stage canvas')?.dataset.chestFacingError!==undefined,null,{timeout:15000});
      const board=await page.locator('.battle-stage canvas').evaluate(c=>({facing:Number(c.dataset.chestFacingError),hinge:Number(c.dataset.chestHingeGap)}));
      assert.ok(Math.abs(board.facing)<.01&&board.hinge<.001,'board chest must face the camera and have an attached hinge');
    }
    await page.getByRole('button',{name:/Engage battle/}).tap();
    if (round===1 || round===4) assert.equal(await page.locator('.vs-plaque .chest-icon--advanced').count(),1,'enhanced combat VS chest icon');
    await page.getByText('COMBAT TELEMETRY').waitFor();
    await page.getByRole('button',{name:'Open admin panel'}).first().tap();
    await page.getByRole('tab',{name:'MATCH'}).tap();
    await page.getByRole('button',{name:'FORCE WIN'}).tap();
    await page.getByRole('button',{name:'Close admin panel'}).tap();
    await page.locator('.result-card').waitFor();
    const body = page.locator('.result-body');
    const overflow = await body.evaluate(el => el.scrollHeight - el.clientHeight);
    assert.ok(overflow <= 1, `round ${round} result requires ${overflow}px of scrolling at 384×725`);
    assert.ok(await page.locator('.result-next').isVisible());
    assert.equal(await page.locator('.result-details').getAttribute('open'),null);
    if (round===1) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb-doctor',{detail:true})));
      await page.getByRole('button',{name:'Open UI Doctor'}).tap();
      await page.getByRole('button',{name:'SCAN SCREEN'}).tap();
      const report=await page.locator('.ui-doctor__body').innerText();
      assert.doesNotMatch(report,/SCROLL[^\n]*result-body/,'doctor should not find result-body scrolling');
      assert.match(report,/1 visual targets/,'doctor checks the actual result chest');
      assert.doesNotMatch(report,/Chest not facing|Chest lid disconnected|Old chest artwork|Chest depth flattened|Chest is clipped/,'healthy result has no chest visual faults');
      await page.getByRole('button',{name:'DEEP SCAN'}).tap();
      await page.getByText('WATCHING…').waitFor({state:'hidden',timeout:12000});
      assert.doesNotMatch(await page.locator('.ui-doctor__body').innerText(),/Chest opening is stalled|Chest artwork changed during scan|Open chest lid is still closed/,'healthy opening passes the deeper observation');
      await page.getByRole('button',{name:'Minimize UI Doctor'}).tap();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb-doctor',{detail:false})));
      await page.locator('.result-details summary').tap();
      assert.equal(await page.locator('.result-details').getAttribute('open'),'');
      assert.ok(await page.getByText('ROUND STIPEND').isVisible());
      assert.ok(await page.locator('.result-details section').count());
      const scrollInfo = await body.evaluate(el => {
        const range = el.scrollHeight - el.clientHeight;
        const width = getComputedStyle(el).scrollbarWidth;
        const webkitDisplay = getComputedStyle(el, '::-webkit-scrollbar').display;
        el.scrollTop = range;
        return {range, width, webkitDisplay, position:el.scrollTop};
      });
      assert.ok(scrollInfo.range > 0 && scrollInfo.position > 0, 'expanded details should still scroll');
      assert.equal(scrollInfo.width, 'none');
      assert.equal(scrollInfo.webkitDisplay, 'none');
      assert.ok(await page.locator('.result-next').isVisible());
      await body.evaluate(el => { el.scrollTop = 0; });
      await page.locator('.result-details summary').tap();
      assert.equal(await page.locator('.result-details').getAttribute('open'),null);
    }
    assert.equal(await page.locator('.result-period .round-track__cell').count(),4);
    const aligned = await page.locator('.result-period .round-track__cell').evaluateAll(cells => cells.every(cell => {
      const c=cell.getBoundingClientRect(), i=cell.querySelector('svg').getBoundingClientRect();
      return Math.abs(c.left+c.width/2-i.left-i.width/2)<.1 && Math.abs(c.top+c.height/2-i.top-i.height/2)<.1;
    }));
    assert.ok(aligned,'result icons must remain centered in every state');
    if (round===1 || round===4) {
      assert.equal(await page.locator('.treasure-result').count(),1);
      const chest3d = page.locator('.treasure-chest-3d');
      await chest3d.waitFor();
      assert.equal(await chest3d.getAttribute('data-renderer'),'css3d');
      assert.equal(await page.locator('.treasure-result .pixel-treasure, .treasure-result canvas').count(),0,'no old artwork or delayed WebGL swap');
      await page.waitForFunction(() => {
        const lid = document.querySelector('.treasure-chest-3d__lid');
        if (!lid) return false;
        const m = new DOMMatrixReadOnly(getComputedStyle(lid).transform);
        return Math.atan2(m.m23,m.m22)*180/Math.PI > 80;
      }, null, {timeout:15000});
      const visual = await chest3d.evaluate(el => {
        const world=el.querySelector('.treasure-chest-3d__world'), a=el.querySelector('.treasure-chest-3d__body-anchor').getBoundingClientRect(), b=el.querySelector('.treasure-chest-3d__lid-anchor').getBoundingClientRect();
        const m=new DOMMatrixReadOnly(getComputedStyle(world).transform);
        return {yaw:Math.atan2(m.m31,m.m33),gap:Math.hypot(a.left-b.left,a.top-b.top)};
      });
      assert.ok(Math.abs(visual.yaw)<.01 && visual.gap<1,'result chest faces the player and the lid stays attached');
      assert.equal(await page.locator('.treasure-loot > span').count(),2);
      if(round===4) assert.match(await page.locator('.treasure-result').innerText(),/\+25G/);
      assert.equal(await page.locator('.result-health__change').getAttribute('data-loss'),'0');
    } else assert.equal(await page.locator('.treasure-result').count(),0);
    await page.locator('.result-next').tap();
    if(round===1) {
      const queue=page.locator('.treasure-queue');
      assert.match(await queue.innerText(),/· 2/);
      const bounds = await page.locator('.battle-stage').boundingBox();
      await queue.getByRole('button').tap();
      assert.match(await queue.innerText(),/· 1/);
      await queue.getByRole('button').tap();
      assert.equal(await queue.count(),0);
      const after=await page.locator('.battle-stage').boundingBox();
      assert.equal(bounds.height,after.height);
    }
  }
  assert.match(await page.locator('.round-track--compact').getAttribute('aria-label'), /PERIOD 2.*ROUND 1\/5/);
  assert.equal(await page.locator('.round-track--compact .round-track__cell').count(),5);
  assert.equal(await page.locator('.round-track--compact .round-track__cell[data-treasure="1"]').count(),0);
  assert.match(await page.locator('.treasure-queue').innerText(),/· 2/);
  await page.setViewportSize({width:280,height:653});
  const claimBox = await page.locator('.treasure-queue button').boundingBox();
  assert.ok(claimBox.x >= 0 && claimBox.x + claimBox.width <= 280 && claimBox.height >= 40, 'claim control must fit small phones');
  await page.setViewportSize({width:384,height:725});
  await page.getByRole('button',{name:'Open admin panel'}).first().tap();
  const advanced = page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'});
  if (await advanced.count()) await advanced.tap();
  for (const id of ['stag','bomb','mantis','dragonfly','spider','stag']) {
    await page.getByLabel('Admin command').fill(`give ${id} 3`);
    await page.getByRole('button',{name:'RUN',exact:true}).tap();
  }
  await page.getByLabel('Admin command').fill('level 7');
  await page.getByRole('button',{name:'RUN',exact:true}).tap();
  await page.getByRole('button',{name:'Close admin panel'}).tap();
  assert.equal(await page.locator('.bench-slot[title*="tap to deploy"]').count(),6);
  await page.locator('.treasure-queue button').tap();
  assert.match(await page.locator('.treasure-queue').innerText(),/· 2/, 'full bench must retain rewards');
  if (await page.getByRole('button',{name:'Deselect'}).count()) await page.getByRole('button',{name:'Deselect'}).tap();
  await page.locator('.bench-slot[title*="tap to deploy"]').first().tap();
  await page.locator('.treasure-queue button').tap();
  assert.match(await page.locator('.treasure-queue').innerText(),/· 1/, 'reward becomes claimable when a slot opens');
  assert.deepEqual(errors,[]);
  console.log('PASS four-round treasure flow, reward claims, gold and board size');
} finally { await browser.close(); }
