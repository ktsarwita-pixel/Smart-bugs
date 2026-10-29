/* pw-audit.mjs — whole-roster deterministic noclip audit (no GPU). */
import * as THREE from "three";
import { buildVoxelModel, V } from "./src/game/voxel.ts";
import { animateInsectRig } from "./src/game/animate.ts";

const IDS = ["stag", "bomb", "mantis", "dragonfly", "matriarch", "lampyris", "worm", "spider"];
const STARS = [1, 2, 3];

const scenes = (id) => {
  const base = [
    ["rest", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0 }],
    ["idle", { t: 3.7, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0 }],
    ["walkA", { t: 0, moving: true, walkPhase: Math.PI / 2, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0 }],
    ["walkB", { t: 0, moving: true, walkPhase: (Math.PI * 3) / 2, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0 }],
    ["lunge", { t: 0, moving: false, walkPhase: 0, lunge: 0.5, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0 }],
    ["cast", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0.3, flash: 0, stun: 0, dead: false, deadT: 0 }],
    ["stun", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 1, dead: false, deadT: 0 }],
    ["flash", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 1, stun: 0, dead: false, deadT: 0 }],
    ["dead1", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: true, deadT: 0.05 }],
    ["dead2", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: true, deadT: 0.15 }],
    ["dead3", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: true, deadT: 0.3 }],
    ["dead4", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: true, deadT: 0.6 }],
  ];
  if (id === "dragonfly") {
    base.push(
      ["air-in", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0, flight: { phase: "approach", t: 0.3 } }],
      ["air-hit", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0, flight: { phase: "impact", t: 0.5 } }],
      ["air-out", { t: 0, moving: false, walkPhase: 0, lunge: 0, cast: 0, flash: 0, stun: 0, dead: false, deadT: 0, flight: { phase: "retreat", t: 0.7 } }],
    );
  }
  return base;
};

const PARTS = ["torso", "head", "leftArm", "rightArm", "legsA", "legsB", "crown"];
const cellKey = (x, y, z) => `${x}|${y}|${z}`;

function collectCells(m, out) {
  m.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4();
  for (const part of PARTS) {
    const g = m[part];
    if (!g) continue;
    const cellMap = new Map();
    g.updateMatrixWorld(true);
    inv.copy(g.matrixWorld).invert();
    g.traverse((o) => {
      if (o.isInstancedMesh) {
        const tmp = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, tmp);
          pos.setFromMatrixPosition(tmp);
          pos.applyMatrix4(g.matrixWorld);
          const cx = Math.round(pos.x / V);
          const cy = Math.round(pos.y / V);
          const cz = Math.round(pos.z / V);
          const k = cellKey(cx, cy, cz);
          cellMap.set(k, (cellMap.get(k) ?? 0) + 1);
        }
      }
    });
    out.set(part, cellMap);
  }
}

function audit(id, star, verbose) {
  const m = buildVoxelModel(id, star);
  let fatal = 0;
  const rows = [];
  for (const [name, prm] of scenes(id)) {
    for (let i = 0; i < 600; i++) {
      animateInsectRig(
        m, id, prm.t, 1, prm.moving, prm.walkPhase, prm.lunge, prm.cast,
        prm.flash, prm.stun, prm.dead, prm.deadT, 1 / 60, 0, prm.flight,
      );
    }
    const cells = new Map();
    collectCells(m, cells);
    const hash = PARTS.map((p) => {
      const cm = cells.get(p);
      return cm ? cm.size : 0;
    }).join(",");
    const seen = new Map();
    let zf = 0;
    for (const [pa, cm] of cells) {
      for (const k of cm.keys()) {
        const prev = seen.get(k);
        if (prev && prev !== pa) {
          zf++;
          if (zf <= 3 && verbose) rows.push(`      zfight ${k} ${prev}<->${pa}`);
        } else if (!prev) seen.set(k, pa);
      }
    }
    let cl = 0;
    for (const [pa, cm] of cells) {
      for (const k of cm.keys()) {
        const [x, y, z] = k.split("|").map(Number);
        if (y < 0 && y * V < -0.45 * V) {
          cl++;
          if (cl <= 3 && verbose) rows.push(`      clip y=${(y * V).toFixed(3)} ${pa}@${k}`);
        }
        void x; void z;
      }
    }
    let gz = 0;
    const flat = [];
    for (const [pa, cm] of cells) for (const k of cm.keys()) flat.push([k, pa]);
    for (let i = 0; i < flat.length; i++) {
      const [ka, pa] = flat[i];
      const a = ka.split("|").map(Number);
      for (let j = i + 1; j < flat.length; j++) {
        const [kb, pb] = flat[j];
        if (pa === pb) continue;
        const b = kb.split("|").map(Number);
        const dx = (a[0] - b[0]) * V, dy = (a[1] - b[1]) * V, dz = (a[2] - b[2]) * V;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < (0.8 * V) * (0.8 * V)) { gz++; if (gz <= 3 && verbose) rows.push(`      graze ${ka}/${pa} ~ ${kb}/${pb} d=${Math.sqrt(d2).toFixed(4)}`); }
      }
    }
    if (zf || cl) fatal += zf + cl;
    rows.push(`    ${name.padEnd(8)} zfight=${zf} clip=${cl} graze=${gz} cells=[${hash}]`);
  }
  m.dispose();
  return { fatal, rows };
}

let total = 0;
for (const id of IDS) {
  for (const star of STARS) {
    const t0 = performance.now();
    const { fatal, rows } = audit(id, star, process.argv.includes("-v"));
    total += fatal;
    console.log(`  ${id} ${String(star).padStart(1)}★: ${fatal ? `FATAL ${fatal}` : "CLEAN"} (${(performance.now() - t0).toFixed(0)}ms)`);
    if (fatal || process.argv.includes("-v")) console.log(rows.join("\n"));
  }
}
console.log(total === 0 ? "ALL CLEAN" : `TOTAL FATAL ${total}`);
process.exit(total === 0 ? 0 : 1);
