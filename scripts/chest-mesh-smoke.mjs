import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Color } from 'three';
const result=await build({entryPoints:['src/game/treasure-voxel.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {createChestGeometry}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const bounds={};
for (const detailed of [false, true]) for (const part of ['body','lid']) {
  const geo=createChestGeometry(part, detailed), p=geo.getAttribute('position'), n=geo.getAttribute('normal');
  const faces=new Set();
  for (let i=0;i<p.count;i+=3) {
    const points=Array.from({length:3},(_,j)=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)].map(v=>v.toFixed(5)).join(','));
    const key=points.sort().join('|');
    assert.ok(!faces.has(key), `${part} has duplicate coplanar triangles`); faces.add(key);
    const normal=Math.hypot(n.getX(i),n.getY(i),n.getZ(i)); assert.ok(normal>0.99,`${part} invalid normal`);
  }
  if (part==='body') {
    const c=geo.getAttribute('color'), mark=new Color(0xf1bf5b);
    let markVertices=0;
    for(let i=0;i<p.count;i++) if(Math.abs(p.getX(i))<=.041 && p.getY(i)>=.119 && p.getY(i)<=.161 && p.getZ(i)>.299 &&
      Math.abs(c.getX(i)-mark.r)<1e-5 && Math.abs(c.getY(i)-mark.g)<1e-5 && Math.abs(c.getZ(i)-mark.b)<1e-5) markVertices++;
    assert.equal(markVertices>0,detailed,`${part}: maker's mark belongs only to the advanced front`);
  }
  assert.ok(faces.size>100); assert.ok(Math.abs(geo.boundingBox.min.x+geo.boundingBox.max.x)<1e-6, `${part} silhouette must be centered`); bounds[`${part}-${detailed}`]=geo.boundingBox.clone(); geo.dispose(); console.log(`PASS ${part} detailed=${detailed}: ${faces.size} unique exposed triangles`);
}

assert.ok(bounds['lid-false'].min.y+0.46 > bounds['body-false'].max.y, 'legacy lid clearance remains unchanged');
assert.ok(Math.abs(bounds['lid-true'].min.y+0.44-bounds['body-true'].max.y)<1e-6, 'advanced lid must meet the body without a gap');
assert.ok(bounds['lid-true'].max.y>bounds['lid-false'].max.y, 'advanced lid has a fuller, connected upper step');
console.log('PASS legacy clearance and connected advanced lid');
