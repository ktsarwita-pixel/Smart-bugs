import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Matrix4, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const result = await build({ stdin: { contents: `export * from './src/game/web-growth.ts'; export {createBattle,stepBattle,COLS,ROWS} from './src/game/engine.ts';`, resolveDir: process.cwd(), loader:'ts' }, bundle:true, platform:'node', format:'esm', write:false });
const { grandWebGrowth, GRAND_WEB_GROW_SECONDS, visualGrandImpactReady, setGrandWebScale, createBattle, stepBattle, COLS, ROWS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
// Lock the original silk texture (baseline 3b9d7ed); animation must not
// replace the design. Egg sacs are intentionally absent from the ultimate.
const scene = readFileSync('src/components/Scene3D.tsx', 'utf8');
const texture = scene.slice(scene.indexOf('    function makeWebTexture() {'), scene.indexOf('    const webTex ='));
assert.equal(createHash('sha256').update(texture).digest('hex'), '2a46bceed224220c0138057450df9c56133ae5045e9a50d172f38dba4f846dca');
assert.doesNotMatch(scene,/const canopyGeo/, 'later domed canopy must not replace the original web');
assert.match(scene,/for \(let si = 0; !grand && si < clutch\.length/,'ultimate must not create egg sacs');
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
assert.equal(b.units.find(u=>u.uid===1).roarEnd,1.5);
assert.ok(!b.shots.some(s=>s.kind==='webgrand'),'removed ultimate must not fire a grand-web shell');
assert.ok(!b.webs.some(w=>w.kind==='grand'),'removed ultimate must not create a grand web');
for(const u of b.units){u.hp=u.maxHp=5000;u.cd=100;u.spd=0;}
for(let i=0;i<30;i++) stepBattle(b,0.1);
assert.ok(!b.shots.some(s=>s.kind==='webgrand'));
assert.ok(!b.webs.some(w=>w.kind==='grand'),'grand web must remain absent after the opener resolves');
const hit={fromUid:7,at:0.5};
const shot={id:42,fromUid:7,kind:'webgrand',t0:0,dur:0.5};
assert.equal(visualGrandImpactReady(hit,[shot],new Map()),false);
assert.equal(visualGrandImpactReady(hit,[shot],new Map([[42,0.99]])),false);
assert.equal(visualGrandImpactReady(hit,[shot],new Map([[42,1]])),true);
assert.equal(visualGrandImpactReady(hit,[],new Map()),true);
console.log('PASS legacy web utility remains isolated; Spider opener creates no grand web');
