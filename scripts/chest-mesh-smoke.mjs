import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({entryPoints:['src/game/treasure-voxel.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {createChestGeometry}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const bounds={};
for (const part of ['body','lid']) {
  const geo=createChestGeometry(part), p=geo.getAttribute('position'), n=geo.getAttribute('normal');
  const faces=new Set();
  for (let i=0;i<p.count;i+=3) {
    const points=Array.from({length:3},(_,j)=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)].map(v=>v.toFixed(5)).join(','));
    const key=points.sort().join('|');
    assert.ok(!faces.has(key), `${part} has duplicate coplanar triangles`); faces.add(key);
    const normal=Math.hypot(n.getX(i),n.getY(i),n.getZ(i)); assert.ok(normal>0.99,`${part} invalid normal`);
  }
  assert.ok(faces.size>100); bounds[part]=geo.boundingBox.clone(); geo.dispose(); console.log(`PASS ${part}: ${faces.size} unique exposed triangles`);
}

assert.ok(bounds.lid.min.y+0.46 > bounds.body.max.y, 'closed lid must not overlap body');
console.log('PASS closed lid has physical clearance');
