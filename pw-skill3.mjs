/* pw-skill3.mjs — SKILL-ONLY audit: drives animateInsectRig with the REAL
 * sampleAirstrikeDive timeline at TRUE 60fps easing (not converged targets),
 * and measures (a) cube penetrations, (b) wing-root daylight gap. */
import * as THREE from "three";
import { buildVoxelModel, getCompiledRig, V } from "./src/game/voxel.ts";
import { animateInsectRig } from "./src/game/animate.ts";
import { createAirstrikePose, sampleAirstrikeDive, AIRSTRIKE_FLIGHT } from "./src/game/airstrike.ts";

const EPS = 1e-6, HALF = V / 2;
function partCells(part) {
  const pos = part.bodyGeo.getAttribute("position");
  const nrm = part.bodyGeo.getAttribute("normal");
  const pX = part.pivot[0] / V, pY = part.pivot[1] / V, pZ = part.pivot[2] / V;
  const set = new Set(); const cells = [];
  for (let t = 0; t < pos.count; t += 3) {
    let mx = 1e9, my = 1e9, mz = 1e9;
    for (let i = 0; i < 3; i++) { const vx = pos.getX(t+i), vy = pos.getY(t+i), vz = pos.getZ(t+i); if (vx<mx)mx=vx; if (vy<my)my=vy; if (vz<mz)mz=vz; }
    const cx = Math.round(mx/V+pX+0.5)-(nrm.getX(t)>0.5?1:0);
    const cy = Math.round(my/V+pY)-(nrm.getY(t)>0.5?1:0);
    const cz = Math.round(mz/V+pZ+0.5)-(nrm.getZ(t)>0.5?1:0);
    const k = cx+","+cy+","+cz;
    if (!set.has(k)) { set.add(k); cells.push({ c: new THREE.Vector3((cx-pX)*V,(cy-pY+0.5)*V,(cz-pZ)*V), k }); }
  }
  return cells;
}
const GRID = [];
for (let i=0;i<3;i++) for (let j=0;j<3;j++) for (let k=0;k<3;k++) GRID.push([(i-1)*0.42,(j-1)*0.42,(k-1)*0.42]);
const _v = new THREE.Vector3();
function obbCache(cells, M) {
  const out = [];
  for (const c of cells) {
    const pts = GRID.map(([gx,gy,gz]) => new THREE.Vector3(c.c.x+gx*V, c.c.y+gy*V, c.c.z+gz*V).applyMatrix4(M));
    out.push({ key: c.k, c: new THREE.Vector3().copy(c.c).applyMatrix4(M), pts, local: c.c });
  }
  return out;
}
const _inv = new THREE.Matrix4();
function pairPen(A, B, Binv, Ainv) {
  let deep = 0;
  _inv.copy(Binv);
  for (const p of A.pts) { const q = _v.copy(p).applyMatrix4(_inv);
    const dx=Math.abs(q.x-B.local.x), dy=Math.abs(q.y-B.local.y), dz=Math.abs(q.z-B.local.z);
    if (dx<HALF&&dy<HALF&&dz<HALF) { const d=HALF-Math.max(dx,dy,dz); if (d>deep) deep=d; } }
  _inv.copy(Ainv);
  for (const p of B.pts) { const q = _v.copy(p).applyMatrix4(_inv);
    const dx=Math.abs(q.x-A.local.x), dy=Math.abs(q.y-A.local.y), dz=Math.abs(q.z-A.local.z);
    if (dx<HALF&&dy<HALF&&dz<HALF) { const d=HALF-Math.max(dx,dy,dz); if (d>deep) deep=d; } }
  return deep;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function gm(parent, g) { _e.set(g.rotation.x,g.rotation.y,g.rotation.z); _q.setFromEuler(_e); _m.compose(g.position,_q,g.scale); return parent?new THREE.Matrix4().multiplyMatrices(parent,_m):_m.clone(); }

const rig = getCompiledRig("dragonfly", 3);
const model = buildVoxelModel("dragonfly", 3);
const C = {
  torso: partCells(rig.torso), head: partCells(rig.head),
  L: partCells(rig.leftArm), R: partCells(rig.rightArm),
};
console.log("cells:", Object.entries(C).map(([k,v])=>k+"="+v.length).join(" "));

/* root-gap metric: wing root band cells (|x|=2, y=8) vs static torso cells
 * (y7 shelf + y8 sockets, |x|=2): min world distance at REST mapping. */
const rootCells = [...C.L, ...C.R].filter(c => { const [x,y] = c.k.split(",").map(Number); return Math.abs(x)===2 && y===8; });
const socketCells = C.torso.filter(c => { const [x,y] = c.k.split(",").map(Number); return Math.abs(x)<=2 && y>=7 && y<=9; });

/* simulate the skill: lock phase (charge), then the dive timeline ×3 runs */
const dive = { startAt: 0, duration: AIRSTRIKE_FLIGHT, fromX: 0, fromY: 0, toX: 3, toY: -2, id: 1 };
let worstPen = { d: -1, info: "" };
let worstGap = { d: -1, info: "" };
const pose = createAirstrikePose();
const DT = 1 / 60;
for (let run = 0; run < 3; run++) {
  // reset eased state between runs by re-building (rig cache keeps geometry)
  const m = buildVoxelModel("dragonfly", 3);
  for (let f = 0; f < Math.ceil(AIRSTRIKE_FLIGHT / DT) + 30; f++) {
    const t = f * DT + run * 0.37; // desync phases across runs
    sampleAirstrikeDive(dive, t, pose);
    animateInsectRig(m, "dragonfly", t, 7, false, 0, 0, 0, 0, 0, false, 0, DT, 0, pose);
    const root = gm(null, m.group);
    const Mt = gm(root, m.torso);
    const armParent = m.leftArm.parent === m.torso ? Mt : gm(root, m.head);
    const ML = gm(armParent, m.leftArm), MR = gm(armParent, m.rightArm);
    const It = Mt.clone().invert(), Il = ML.clone().invert(), Ir = MR.clone().invert();
    const OT = obbCache(C.torso, Mt), OL = obbCache(C.L, ML), OR = obbCache(C.R, MR);
    // penetrations wing↔torso (skip coincident + root-band joint)
    for (const [obs, key] of [[OL, "L"], [OR, "R"]]) {
      for (const a of obs) for (const b of OT) {
        if (a.key === b.key) continue;
        if (a.c.distanceTo(b.c) > 1.9 * V) continue;
        const pen = pairPen(a, b, It, key === "L" ? Il : Ir);
        if (pen <= EPS) continue;
        const cells3 = pen / V;
        const [wx,wy,wz] = a.key.split(",").map(Number);
        const [tx,ty,tz] = b.key.split(",").map(Number);
        const joint = (Math.abs(wx)<=4 && wy>=8 && wy<=9 && Math.abs(wz)<=3 && Math.abs(tx)<=4 && ty>=7 && ty<=9 && Math.abs(tz)<=3)
          || (Math.abs(wx)===2 && wy===7 && ty>=6 && ty<=9); // buried post vs pocket wall
        if (!joint && cells3 > 0.05) { if (cells3 > worstPen.d) worstPen = { d: cells3, info: `f=${f} t=${t.toFixed(2)} ${key}:${a.key} vs ${b.key}` }; }
        else if (joint && cells3 > 0.5) { if (cells3 > worstPen.d) worstPen = { d: cells3, info: `JOINT f=${f} ${key}:${a.key} vs ${b.key}` }; }
      }
    }
    // root daylight gap: every root cell must stay within 0.7 voxel of SOME socket/shelf cell
    for (const rc of rootCells) {
      const w = new THREE.Vector3().copy(rc.c).applyMatrix4(m.leftArm.parent === m.torso ? ML : ML); // both sides use own matrix below
    }
    // (per-side properly)
    for (const [obs, M] of [[C.L, ML], [C.R, MR]]) {
      for (const rc of obs.filter(c => { const [x,y] = c.k.split(",").map(Number); return Math.abs(x)===2 && y===8; })) {
        const wp = new THREE.Vector3().copy(rc.c).applyMatrix4(M);
        let best = Infinity;
        for (const sc of socketCells) {
          const ws = new THREE.Vector3().copy(sc.c).applyMatrix4(Mt);
          const d = wp.distanceTo(ws);
          if (d < best) best = d;
        }
        const dVox = best / V - 1; // centers 1 voxel apart = touching faces
        if (dVox > worstGap.d) worstGap = { d: dVox, info: `f=${f} t=${t.toFixed(2)} ${rc.key} gap ${(dVox).toFixed(2)} vox` };
      }
    }
  }
}
console.log("worst non-joint penetration:", worstPen.d.toFixed(3), worstPen.info);
console.log("worst root daylight gap:", worstGap.d.toFixed(2), "voxels", worstGap.info);
console.log(worstPen.d <= 0.05 && worstGap.d <= 0.7 ? "SKILL AUDIT CLEAN ✓" : "SKILL AUDIT FAILS ✗");
process.exit(worstPen.d <= 0.05 && worstGap.d <= 0.7 ? 0 : 1);
