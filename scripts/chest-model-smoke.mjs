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
assert.ok(chest.inspect().hingeGap<1e-6,'lid hinge must touch the back of the body');
assert.equal(chest.lid.parent,chest.root);
const pileTop=chest.pile.position.y+.10;
assert.ok(Math.abs(chest.pile.position.y-.10-.12)<1e-6,'treasure pile must rest on the chest floor');
const coins=chest.root.children.filter(x=>x.geometry?.type==='CylinderGeometry'&&x.position.y<.4);
assert.equal(coins.length,10);
for(const coin of coins) {
  const bottom=coin.position.y-.0175;
  if (coin.userData.chestCoinLevel===0) assert.ok(Math.abs(bottom-pileTop)<1e-6,'base coins rest on the pile');
  else assert.ok(coins.some(base=>base.userData.chestCoinLevel===0 && base.position.x===coin.position.x && base.position.z===coin.position.z && Math.abs(bottom-(base.position.y+.0175))<1e-6),'stacked coins are physically supported');
  assert.ok(coin.position.y+.0175<.44,'coins fit beneath the closed lid');
}
chest.update(.5); const middle=chest.lid.rotation.x;
chest.update(1); assert.ok(chest.lid.rotation.x<middle);
assert.ok(chest.inspect().hingeGap<1e-6,'opening must preserve the hinge position');
const gems=chest.root.children.filter(x=>x.geometry?.type==='OctahedronGeometry');
assert.equal(gems.length,2,'a pair of gems fills the treasure pile');
for(const gem of gems) assert.ok(Math.abs(gem.position.y-gem.geometry.parameters.radius-pileTop)<1e-6,'gems rest on the supported pile');
chest.dispose();
console.log('PASS smooth hinge, connected lid and supported 3D treasure');
