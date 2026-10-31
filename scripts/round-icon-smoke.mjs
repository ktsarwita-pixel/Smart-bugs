import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const bundled=await build({entryPoints:['src/game/round-icons.ts'],bundle:true,platform:'node',format:'esm',write:false});
const icons=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);
for (const [name,rows] of [['chest',icons.CHEST_PIXELS],['stag',icons.STAG_PIXELS]]) {
  assert.equal(rows.length,16);
  for (const row of rows) {assert.equal(row.length,16);assert.equal(row,[...row].reverse().join(''),`${name} asymmetric`);}
  const cells=rows.flatMap((row,y)=>[...row].flatMap((v,x)=>v==='1'?[[x,y]]:[]));
  assert.equal(Math.min(...cells.map(c=>c[0]))+Math.max(...cells.map(c=>c[0])),15);
  assert.equal(Math.min(...cells.map(c=>c[1]))+Math.max(...cells.map(c=>c[1])),15);
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
try {
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:5191')+'/?advenced');
 await page.getByRole('button',{name:'PLAY MATCH'}).tap();await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
 for (const width of [280,320,384,768]) {
  await page.setViewportSize({width,height:725});
  const measurements=await page.locator('.round-track--compact').evaluate(track=>{
   const oldCount=track.dataset.roundCount; track.dataset.roundCount='7';
   const wrap=track.querySelector('.round-track__cells');
   // Exercise each state and the maximum seven-cell period without changing game state.
   const originals=[...wrap.children];while(wrap.children.length<7)wrap.appendChild(originals[0].cloneNode(true));
   const cells=[...wrap.children];cells.forEach((c,i)=>c.dataset.state=['past','current','future'][i%3]);
   const a=cells.map(cell=>{const c=cell.getBoundingClientRect(),svg=cell.querySelector('svg'),s=svg.getBoundingClientRect(),ink=svg.querySelector('path').getBBox();
     return {dx:Math.abs(c.left+c.width/2-s.left-s.width/2),dy:Math.abs(c.top+c.height/2-s.top-s.height/2),ix:ink.x+ink.width/2,iy:ink.y+ink.height/2};});
   const bounds=track.getBoundingClientRect(),last=cells.at(-1).getBoundingClientRect();
   cells.slice(originals.length).forEach(c=>c.remove());track.dataset.roundCount=oldCount;return {a,bounds:{left:bounds.left,right:bounds.right},last:last.right};
  });
  for (const m of measurements.a) {assert.ok(m.dx<0.1&&m.dy<0.1,`${width}px cell misaligned ${JSON.stringify(m)}`);assert.equal(m.ix,8);assert.equal(m.iy,8);}
  assert.ok(measurements.bounds.left>=0&&measurements.bounds.right<=width&&measurements.last<=measurements.bounds.right,`${width}px track clips`);
 }
 console.log('PASS symmetric pixel art, centered icons and 7-cell layout at 280–768px');
} finally {await browser.close();}
