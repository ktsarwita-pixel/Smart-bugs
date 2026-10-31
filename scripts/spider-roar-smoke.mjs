import assert from 'node:assert/strict';
import * as THREE from 'three';
import {build} from 'esbuild';

const bundled=await build({entryPoints:['src/game/engine.ts','src/game/animate.ts','src/game/spider-roar-visual.ts'],bundle:true,platform:'node',format:'esm',outdir:'ignored',write:false});
const load=async name=>{
  const file=bundled.outputFiles.find(f=>f.path.endsWith(`${name}.js`));
  return import(`data:text/javascript;base64,${Buffer.from(file.contents).toString('base64')}`);
};
const {createBattle,stepBattle,SPIDER_ROAR_SECONDS,SPIDER_ROAR_DAMAGE}=await load('engine');
const {animateInsectRig}=await load('animate');
const {sampleSpiderRoar,sampleRoarWave}=await load('spider-roar-visual');
const unit=(uid,bugId,star,slot)=>({uid,bugId,star,slot,zone:'board'});
const b=createBattle([unit(1,'spider',3,4)],[unit(2,'stag',3,0),unit(3,'bomb',3,1),unit(4,'dragonfly',3,2)],'matriarch','matriarch');
for(const u of b.units){u.hp=u.maxHp=5000;u.cd=100;u.spd=0;}
const spider=b.units.find(u=>u.uid===1), foes=b.units.filter(u=>u.side==='foe'); const start=[spider.x,spider.y];
foes.at(-1).vuln=5; // exact roar damage ignores Vulnerable and Slipstream modifiers
assert.equal(spider.roarEnd,SPIDER_ROAR_SECONDS); assert.equal(b.shots.length,0); assert.equal(b.webs.length,0);
for(let i=0;i<Math.round(SPIDER_ROAR_SECONDS/.1)-1;i++) stepBattle(b,.1);
assert.deepEqual([spider.x,spider.y],start); assert.ok(foes.every(u=>u.hp===5000)); assert.equal(spider.roarEnd,SPIDER_ROAR_SECONDS);
assert.equal(b.lastRoarAt,undefined);
stepBattle(b,.1); assert.deepEqual(foes.map(u=>u.hp),foes.map(()=>5000-SPIDER_ROAR_DAMAGE)); assert.equal(spider.roarEnd,undefined); assert.equal(b.webs.length,0); assert.equal(b.shots.length,0);
assert.ok(Math.abs(b.lastRoarAt-SPIDER_ROAR_SECONDS)<1e-8);
stepBattle(b,.1); assert.deepEqual(foes.map(u=>u.hp),foes.map(()=>5000-SPIDER_ROAR_DAMAGE));
spider.x=foes[0].x; spider.y=foes[0].y+.4; spider.energy=spider.maxEnergy; spider.cd=0;
stepBattle(b,.1); assert.ok(b.shots.some(s=>s.kind==='websnare'),'After Web must remain the full-Energy skill'); assert.ok(!b.shots.some(s=>s.kind==='webgrand'));
const other=createBattle([unit(1,'spider',2,0)],[unit(2,'stag',3,0)],'matriarch','matriarch');assert.equal(other.units[0].roarEnd,undefined);
const interrupted=createBattle([unit(1,'spider',3,0)],[unit(2,'stag',3,0)],'matriarch','matriarch');
const killer=interrupted.units.find(u=>u.side==='foe'); const slain=interrupted.units.find(u=>u.side==='ally');
killer.hp=killer.maxHp=5000;killer.cd=100;killer.spd=0;slain.dead=true;slain.hp=0;
stepBattle(interrupted,.1);assert.equal(killer.hp,5000);assert.equal(interrupted.lastRoarAt,undefined);
const simultaneous=createBattle([unit(1,'spider',3,0)],[unit(2,'spider',3,0)],'matriarch','matriarch');
for(const u of simultaneous.units){u.hp=u.maxHp=5000;u.cd=100;u.spd=0;}
for(let i=0;i<15;i++)stepBattle(simultaneous,.1);
assert.deepEqual(simultaneous.units.map(u=>u.hp),[4350,4350],'opposing roars must resolve together');

assert.equal(sampleSpiderRoar(0).rear,0);
assert.ok(sampleSpiderRoar(.5).rear>.9);
assert.ok(sampleSpiderRoar(.9).rear>.7,'the enhanced pose must stay raised until impact');
assert.notDeepEqual(sampleRoarWave(0,0),sampleRoarWave(.25,0));
for(let i=0;i<=100;i++) for(let wave=0;wave<2;wave++) {
  const sample=sampleRoarWave(i/100,wave);
  assert.ok(sample.scale>=.54&&sample.scale<=1.26&&sample.opacity>=0&&sample.opacity<=.85);
}
const model=()=>{
  const rig={};
  for(const part of ['group','torso','head','leftArm','rightArm','legsA','legsB','crown']) rig[part]=new THREE.Group();
  rig.rest=Object.fromEntries(['torso','head','leftArm','rightArm','legsA','legsB','crown'].map(key=>[key,new THREE.Vector3()]));
  return rig;
};
const enhanced=model(), legacy=model();
for (const [rig,on] of [[enhanced,true],[legacy,false]]) animateInsectRig(rig,'spider',0,1,false,0,0,0,0,0,false,0,1,0,undefined,.9,on);
assert.ok(enhanced.torso.rotation.x<-.35,'enhanced spider should hold a distinct rear');
assert.ok(enhanced.torso.rotation.x<legacy.torso.rotation.x-.2,'legacy pose must remain unchanged');
assert.ok(Math.abs(enhanced.leftArm.rotation.z)>.6,'enhanced fangs should flare');
console.log('PASS unchanged roar damage/timing, interruption, simultaneous casts, and stronger sampled rig/waves');
