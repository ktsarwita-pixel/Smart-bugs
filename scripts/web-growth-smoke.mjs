import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Matrix4, Vector3 } from 'three';
const result = await build({ stdin: { contents: `export * from './src/game/web-growth.ts'; export {createBattle,stepBattle,COLS,ROWS} from './src/game/engine.ts';`, resolveDir: process.cwd(), loader:'ts' }, bundle:true, platform:'node', format:'esm', write:false });
const { grandWebGrowth, GRAND_WEB_GROW_SECONDS, visualGrandImpactReady, setGrandWebScale, createBattle, stepBattle, COLS, ROWS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
let last = 0;
for (let t=0;t<=GRAND_WEB_GROW_SECONDS;t+=0.1) {
  const size=grandWebGrowth(t,true);
  assert.ok(size>=last && size<=1); last=size;
}
assert.equal(grandWebGrowth(0,true),0);
assert.ok(grandWebGrowth(GRAND_WEB_GROW_SECONDS/2,true)>0.45 && grandWebGrowth(GRAND_WEB_GROW_SECONDS/2,true)<0.55);
assert.equal(grandWebGrowth(GRAND_WEB_GROW_SECONDS,true),1);
assert.equal(grandWebGrowth(0,false),1);
// A 7×6 rectangular sheet must begin at exactly 1×1 tile, reach all
// four board edges, and keep every original part anchored to impact.
for (const progress of [0,0.25,0.5,1]) {
  const matrix=setGrandWebScale(new Matrix4(),progress,COLS/2,ROWS/2,COLS,ROWS);
  const anchor=new Vector3(COLS/2,0.052,ROWS/2).applyMatrix4(matrix);
  assert.ok(anchor.distanceTo(new Vector3(COLS/2,0.052,ROWS/2))<1e-9);
  const near=new Vector3(0,0.052,0).applyMatrix4(matrix);
  const far=new Vector3(COLS,0.052,ROWS).applyMatrix4(matrix);
  assert.ok(Math.abs(far.x-near.x-(1+(COLS-1)*progress))<1e-9);
  assert.ok(Math.abs(far.z-near.z-(1+(ROWS-1)*progress))<1e-9);
  assert.ok(near.x>=0 && near.z>=0 && far.x<=COLS && far.z<=ROWS);
  if (progress===1) assert.ok(near.distanceTo(new Vector3(0,0.052,0))<1e-9 && far.distanceTo(new Vector3(COLS,0.052,ROWS))<1e-9);
}
const b=createBattle([{uid:1,bugId:'spider',star:3,zone:'board',slot:10}],[{uid:2,bugId:'stag',star:3,zone:'board',slot:10}], 'matriarch','matriarch');
assert.equal(b.shots[0].kind,'webgrand');
assert.equal(b.shots[0].x1,COLS/2); assert.equal(b.shots[0].y1,ROWS/2);
assert.equal(b.webs.length,0,'web must not spawn before impact');
for(let i=0;i<20 && !b.webs.length;i++) stepBattle(b,0.1);
const web=b.webs.find(w=>w.kind==='grand');
assert.ok(web); assert.ok(web.spawnedAt>0); assert.equal(web.half,999); assert.equal(web.dotDps,500); assert.equal(web.slowPct,0.5);
const hit={fromUid:7,at:0.5};
const shot={id:42,fromUid:7,kind:'webgrand',t0:0,dur:0.5};
assert.equal(visualGrandImpactReady(hit,[shot],new Map()),false);
assert.equal(visualGrandImpactReady(hit,[shot],new Map([[42,0.99]])),false);
assert.equal(visualGrandImpactReady(hit,[shot],new Map([[42,1]])),true);
assert.equal(visualGrandImpactReady(hit,[],new Map()),true);
console.log('PASS progressive web growth, reduced motion and unchanged combat coverage');
