import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['src/game/engine.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {createBattle,stepBattle,SPIDER_ROAR_SECONDS,SPIDER_ROAR_DAMAGE}=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString('base64')}`);
const unit=(uid,bugId,star,slot)=>({uid,bugId,star,slot,zone:'board'});
const b=createBattle([unit(1,'spider',3,4)],[unit(2,'stag',3,0),unit(3,'bomb',3,1),unit(4,'dragonfly',3,2)],'matriarch','matriarch');
for(const u of b.units){u.hp=u.maxHp=5000;u.cd=100;u.spd=0;}
const spider=b.units.find(u=>u.uid===1), foes=b.units.filter(u=>u.side==='foe'); const start=[spider.x,spider.y];
foes.at(-1).vuln=5; // exact roar damage ignores Vulnerable and Slipstream modifiers
assert.equal(spider.roarEnd,SPIDER_ROAR_SECONDS); assert.equal(b.shots.length,0); assert.equal(b.webs.length,0);
for(let i=0;i<Math.round(SPIDER_ROAR_SECONDS/.1)-1;i++) stepBattle(b,.1);
assert.deepEqual([spider.x,spider.y],start); assert.ok(foes.every(u=>u.hp===5000)); assert.equal(spider.roarEnd,SPIDER_ROAR_SECONDS);
stepBattle(b,.1); assert.deepEqual(foes.map(u=>u.hp),foes.map(()=>5000-SPIDER_ROAR_DAMAGE)); assert.equal(spider.roarEnd,undefined); assert.equal(b.webs.length,0); assert.equal(b.shots.length,0);
stepBattle(b,.1); assert.deepEqual(foes.map(u=>u.hp),foes.map(()=>5000-SPIDER_ROAR_DAMAGE));
spider.x=foes[0].x; spider.y=foes[0].y+.4; spider.energy=spider.maxEnergy; spider.cd=0;
stepBattle(b,.1); assert.ok(b.shots.some(s=>s.kind==='websnare'),'After Web must remain the full-Energy skill'); assert.ok(!b.shots.some(s=>s.kind==='webgrand'));
const other=createBattle([unit(1,'spider',2,0)],[unit(2,'stag',3,0)],'matriarch','matriarch');assert.equal(other.units[0].roarEnd,undefined);
const interrupted=createBattle([unit(1,'spider',3,0)],[unit(2,'stag',3,0)],'matriarch','matriarch');
const killer=interrupted.units.find(u=>u.side==='foe'); const slain=interrupted.units.find(u=>u.side==='ally');
killer.hp=killer.maxHp=5000;killer.cd=100;killer.spd=0;slain.dead=true;slain.hp=0;
stepBattle(interrupted,.1);assert.equal(killer.hp,5000);
console.log('PASS spider roar timing, fixed damage to every enemy, stationary cast, interruption and no grand web');
