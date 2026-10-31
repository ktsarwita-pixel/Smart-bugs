import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
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
    if (round===1 || round===4) assert.ok(await page.getByText('TREASURE GUARDS').count()>0);
    await page.getByRole('button',{name:/Engage battle/}).tap();
    await page.getByText('COMBAT TELEMETRY').waitFor();
    await page.getByRole('button',{name:'Open admin panel'}).first().tap();
    await page.getByRole('tab',{name:'MATCH'}).tap();
    await page.getByRole('button',{name:'FORCE WIN'}).tap();
    await page.getByRole('button',{name:'Close admin panel'}).tap();
    await page.locator('.result-card').waitFor();
    assert.equal(await page.locator('.result-period .round-track__cell').count(),4);
    if (round===1 || round===4) {
      assert.equal(await page.locator('.treasure-result').count(),1);
      assert.equal(await page.locator('.pixel-treasure--open').count(),1);
      await page.waitForTimeout(800);
      const sprite = await page.locator('.pixel-treasure').evaluate(el => {
        const back=el.querySelector('.pixel-treasure__lid-open'), closed=el.querySelector('.pixel-treasure__lid-closed'), rect=back.getBoundingClientRect(), outer=el.getBoundingClientRect();
        return { back: getComputedStyle(back).opacity, closed: getComputedStyle(closed).opacity, offset: Math.abs((rect.left+rect.right-outer.left-outer.right)/2) };
      });
      assert.equal(sprite.back,'1'); assert.equal(sprite.closed,'0'); assert.ok(sprite.offset<4,'open lid should stay centered behind chest');
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
