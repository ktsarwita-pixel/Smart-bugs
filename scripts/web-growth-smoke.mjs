import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Matrix4, Vector3 } from 'three';
const result = await build({ stdin: { contents: `export * from './src/game/web-growth.ts'; export {createBattle,stepBattle} from './src/game/engine.ts';`, resolveDir: process.cwd(), loader:'ts' }, bundle:true, platform:'node', format:'esm', write:false });
const { grandWebGrowth, GRAND_WEB_GROW_SECONDS, visualGrandImpactReady, setGrandWebScale, createBattle, stepBattle } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
let last = 0;
for (let t=0;t<=GRAND_WEB_GROW_SECONDS;t+=0.1) {
  const size=grandWebGrowth(t,true);
  assert.ok(size>=last && size<=1); last=size;
}
assert.ok(grandWebGrowth(0,true)<0.05);
assert.ok(grandWebGrowth(GRAND_WEB_GROW_SECONDS/2,true)>0.45 && grandWebGrowth(GRAND_WEB_GROW_SECONDS/2,true)<0.55);
assert.equal(grandWebGrowth(GRAND_WEB_GROW_SECONDS,true),1);
assert.equal(grandWebGrowth(0,false),1);
// All original-web parts share a uniform XYZ scale about ground impact.
for (const size of [0.025,0.25,0.5,1]) {
  const matrix=setGrandWebScale(new Matrix4(),size,3.5,3);
  const anchor=new Vector3(3.5,0.052,3).applyMatrix4(matrix);
  assert.ok(anchor.distanceTo(new Vector3(3.5,0.052,3))<1e-9);
  for (const part of [new Vector3(0,0.052,0),new Vector3(7,1,6),new Vector3(3.5,1.2,3)]) {
    const full=part.clone().sub(new Vector3(3.5,0.052,3));
    const scaled=part.clone().applyMatrix4(matrix).sub(anchor);
    assert.ok(scaled.distanceTo(full.multiplyScalar(size))<1e-8,'web part must uniformly scale about impact');
  }
}
const b=createBattle([{uid:1,bugId:'spider',star:3,zone:'board',slot:10}],[{uid:2,bugId:'stag',star:3,zone:'board',slot:10}], 'matriarch','matriarch');
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
