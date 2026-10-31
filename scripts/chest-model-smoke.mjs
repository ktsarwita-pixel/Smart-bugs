import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out=await build({entryPoints:['src/game/chest-model.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {sampleChestOpening,createDetailedChest}=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString('base64')}`);
assert.ok(Math.abs(sampleChestOpening(0).angle)<1e-6);
assert.ok(Math.abs(sampleChestOpening(1).angle+1.52)<1e-6);
let prev=0;
for(let i=0;i<=200;i++){
  const sample=sampleChestOpening(i/200);
  assert.ok(Number.isFinite(sample.angle)&&sample.angle<=.0001&&sample.angle>=-1.6);
  assert.ok(Math.abs(sample.angle-prev)<.035,'no discontinuous hinge jumps');
  assert.ok(sample.glow>=0&&sample.glow<=1);
  prev=sample.angle;
}
const chest=createDetailedChest();
assert.ok(Math.abs(chest.lid.rotation.x)<1e-6);
chest.update(.5,.5); const middle=chest.lid.rotation.x;
chest.update(1,1); assert.ok(chest.lid.rotation.x<middle);
chest.update(1,999,true); const still=chest.root.children.slice(-8).map(s=>s.position.toArray());
chest.update(1,1000,true); assert.deepEqual(chest.root.children.slice(-8).map(s=>s.position.toArray()),still,'reduced-motion sparks stay still');
chest.dispose();
console.log('PASS hinged chest, smoothly sampled motion, 3D loot and reduced motion');
