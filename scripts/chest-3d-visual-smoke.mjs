import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:560},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const geometry=()=>page.locator('.treasure-chest-3d').evaluate(root=>{
  const body=root.querySelector('.treasure-chest-3d__body-front'), world=root.querySelector('.treasure-chest-3d__world'), lid=root.querySelector('.treasure-chest-3d__lid');
  const a=root.querySelector('.treasure-chest-3d__body-anchor').getBoundingClientRect(), b=root.querySelector('.treasure-chest-3d__lid-anchor').getBoundingClientRect();
  const w=new DOMMatrixReadOnly(getComputedStyle(world).transform), l=new DOMMatrixReadOnly(getComputedStyle(lid).transform);
  const r=root.getBoundingClientRect(), fr=body.getBoundingClientRect();
  const sides=['lid','lid-ridge','lid-crown'].map(group=>{
    const m=name=>new DOMMatrixReadOnly(getComputedStyle(lid.querySelector(`.treasure-chest-3d__${group}-${name}`)).transform).m43;
    return [m('front'),m('back'),m('side--left'),m('side--right')];
  });
  return {yaw:Math.atan2(w.m31,w.m33), pitch:Math.atan2(l.m23,l.m22)*180/Math.PI, gap:Math.hypot(a.left-b.left,a.top-b.top), center:Math.abs((fr.left+fr.right-r.left-r.right)/2), depth:getComputedStyle(world).transformStyle, sides};
});
try {
  await page.goto(`${base}/scripts/chest-3d-harness.html`);
  const chest=page.locator('.treasure-chest-3d');
  await chest.waitFor({state:'visible'});
  assert.equal(await chest.getAttribute('data-renderer'),'css3d');
  assert.equal(await chest.locator('.pixel-treasure,canvas').count(),0,'no legacy sprite or delayed canvas swap');
  assert.equal(await chest.locator('.treasure-chest-3d__body-front > svg[shape-rendering="crispEdges"]').count(),1,'pixel grain is part of the body face');
  assert.equal(await chest.locator('.treasure-chest-3d__lid-bottom > svg[shape-rendering="crispEdges"]').count(),1,'pixel inlay is part of the opening lid');
  assert.equal(await chest.locator('.treasure-chest-3d__body-front [data-chest-emblem]').count(),1,'front emblem is integrated into the body face');
  assert.equal(await chest.locator('.treasure-chest-3d__lid-ridge-top [data-chest-ridge]').count(),1,'lid grain belongs to the attached top plane');
  assert.equal(await chest.locator('.treasure-chest-3d__lid-crown-top [data-chest-crown]').count(),1,'fuller lid crown belongs to the hinged 3D model');
  assert.equal(await chest.locator('.treasure-chest-3d__lid-crown-side').count(),2,'both stepped lid ends are closed');
  let initial=await geometry();
  assert.ok(Math.abs(initial.yaw)<.001 && initial.center<1,'closed chest faces and centers on the player');
  assert.ok(Math.abs(initial.pitch)<.1 && initial.gap<.5 && initial.depth==='preserve-3d','closed lid is connected to the actual 3D body');
  for (const [front,back,left,right] of initial.sides) {
    assert.ok(Math.abs(front-24)<.001 && Math.abs(back)<.001 && Math.abs(left-12)<.001 && Math.abs(right-12)<.001,'every lid side spans exactly between its front and back');
  }
  await page.evaluate(()=>{
    window.frames=[];
    const loop=()=>{const root=document.querySelector('.treasure-chest-3d');if(!root)return; const m=new DOMMatrixReadOnly(getComputedStyle(root.querySelector('.treasure-chest-3d__lid')).transform);const a=root.querySelector('.treasure-chest-3d__body-anchor').getBoundingClientRect(),b=root.querySelector('.treasure-chest-3d__lid-anchor').getBoundingClientRect();window.frames.push([Math.atan2(m.m23,m.m22)*180/Math.PI,Math.hypot(a.left-b.left,a.top-b.top)]);requestAnimationFrame(loop)};requestAnimationFrame(loop);
  });
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await page.waitForTimeout(1450);
  const frames=await page.evaluate(()=>window.frames);
  assert.ok(frames.filter(([angle])=>angle>5&&angle<85).length>=4,'opening must render several intermediate positions');
  assert.ok(frames.every(([,gap])=>gap<.5),'the hinge remains connected throughout opening');
  assert.ok(frames.every(([angle])=>angle>=-.1 && angle<=94.1),'smooth lid never overshoots');
  assert.ok(frames.every(([angle],i)=>!i || angle>=frames[i-1][0]-.1),'lid opens smoothly without reversing or snapping back');
  assert.equal(await chest.locator('.treasure-chest-3d__cavity i').count(),7,'a fuller treasure pile stays anchored inside the cavity');
  assert.equal(await chest.locator('.treasure-chest-3d__gem').count(),2);
  assert.equal(await chest.locator('.treasure-chest-3d__cavity [data-chest-treasure]').count(),1);
  const end=await geometry();
  assert.ok(Math.abs(end.pitch-94)<1 && Math.abs(end.yaw)<.001 && end.gap<.5,'open chest stays front-facing and attached');
  assert.deepEqual(end.sides,initial.sides,'all lid faces stay aligned while opening');
  if(process.env.CAPTURE) await chest.screenshot({path:process.env.CAPTURE});
  await page.goto(`${base}/scripts/chest-3d-harness.html?open=1`);
  await chest.waitFor({state:'visible'});
  assert.equal(await chest.locator('.pixel-treasure,canvas').count(),0,'open result has the same model immediately');
  await page.waitForTimeout(2300);
  assert.equal(await chest.getAttribute('data-renderer'),'css3d','model never swaps after loading');
  assert.equal(await chest.locator('.pixel-treasure,canvas').count(),0);
  await page.goto(`${base}/scripts/chest-3d-harness.html?open=1&reduced=1`);
  const reduced=await geometry();
  assert.ok(Math.abs(reduced.pitch-94)<1 && reduced.gap<.5,'reduced motion immediately opens a connected lid');
  await page.waitForTimeout(300);
  assert.equal((await geometry()).pitch,reduced.pitch,'reduced-motion pose is static');
  assert.equal(await chest.locator('.treasure-chest-3d__cavity').evaluate(el=>getComputedStyle(el,'::before').animationName),'none','loot reveal also respects reduced motion');
  assert.deepEqual(errors,[]);
  console.log('PASS immediate front-facing 3D chest, smooth monotonic connected hinge, anchored treasure, no artwork swap and reduced motion');
} finally {await browser.close();}
