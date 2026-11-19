import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TRAP_STUN_SECONDS, type BattleState } from "./engine";

const SLICES = 48;
const TAU = 2 * Math.PI;
const MAX_HOLES = 4;
const CLODS = 10;
const FOLD = 0.34;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => { const p = clamp(t); return p * p * (3 - 2 * p); };

// Smooth, irregular earth falling away into a dark throat. The centre sits
// just above the tile; the raised crest makes it read as a well, not a disc.
function soilBowl() {
  const bands = [
    [0, 0.002, 0x0b070b], [.24, .002, 0x0c070b], [.48, .006, 0x1a0d11],
    [.62, .014, 0x321a1c], [.72, .041, 0x57302c], [.80, .082, 0x9b5743],
    [.85, .087, 0x86543a], [.91, .055, 0x62422c], [.96, .017, 0x432e20], [1, .002, 0x29211a],
  ];
  const p: number[] = [], c: number[] = [], f: number[] = [];
  const tint = new THREE.Color();
  bands.forEach(([r, y, color], row) => {
    for (let s = 0; s < SLICES; s++) {
      const a = s * TAU / SLICES;
      const grain = 1 + .025 * Math.sin(5 * a + .2) + .031 * Math.cos(3 * a + 1.2) + .012 * Math.sin(11 * a);
      const bank = y * (1 + .19 * Math.sin(5 * a + row * .34) + .09 * Math.cos(9 * a));
      p.push(.633 * r * grain * Math.cos(a), bank, .568 * r * grain * Math.sin(a));
      tint.setHex(color).multiplyScalar(.88 + .13 * Math.sin(a - .65) + .16 * Math.sin(8 * a + row * .81) ** 2);
      c.push(tint.r, tint.g, tint.b);
      if (row === bands.length - 1) continue;
      const i = row * SLICES + s, next = row * SLICES + (s + 1) % SLICES;
      f.push(i, next, i + SLICES, next, next + SLICES, i + SLICES);
    }
  });
  return geometry(p, c, f);
}

function geometry(p: number[], c: number[], f: number[]) {
  const geo = new THREE.BufferGeometry().setIndex(f)
    .setAttribute("position", new THREE.Float32BufferAttribute(p, 3))
    .setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

// The skin and the teeth are curved surfaces, not extruded sprite pixels. The
// hinge sits along the outer bank. Both jaws are copies of this crescent.
const BANK = .42;
function jawSkin() {
  const columns = 29;
  const p: number[] = [], c: number[] = [], f: number[] = [];
  const crossSection = [
    [.52, .025, 0x2b161c], [.50, .060, 0x4e262c], [.453, .102, 0xaf6256],
    [.407, .127, 0xd9184a], [.353, .112, 0xa94150], [.310, .064, 0x522433], [.302, .012, 0x301522],
  ];
  const tint = new THREE.Color();
  crossSection.forEach(([radius, y, color], row) => {
    for (let i = 0; i < columns; i++) {
      const t = i / (columns - 1), a = Math.PI * (.18 + .64 * t);
      const taper = Math.sin(Math.PI * t) ** .57;
      const r = .416 + (radius - .416) * (.32 + .68 * taper);
      const rib = .008 * Math.cos(t * TAU * 5) * taper;
      p.push(1.07 * r * Math.cos(a), y * (.33 + .67 * taper) + rib, r * Math.sin(a) - BANK);
      tint.setHex(color).multiplyScalar(.74 + .26 * taper);
      c.push(tint.r, tint.g, tint.b);
      if (row === crossSection.length - 1 || i === columns - 1) continue;
      const n = row * columns + i;
      f.push(n, n + 1, n + columns, n + 1, n + columns + 1, n + columns);
    }
  });
  return geometry(p, c, f);
}

function jawFangs() {
  const p: number[] = [], c: number[] = [], f: number[] = [];
  const div = 10, steps = 7;
  const tint = new THREE.Color(), bone = new THREE.Color(0xffe2ad), root = new THREE.Color(0x9a5540);
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * (.24 + .104 * k);
    const rx = Math.cos(a), rz = Math.sin(a);
    const length = [.125, .163, .192, .174, .155, .115][k];
    const start = p.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rad = .373 - length * t ** 1.34;
      const height = .103 + .12 * Math.sin(t * Math.PI * .78) - .025 * t;
      const width = .049 * (1 - .987 * t) ** .73;
      for (let s = 0; s < div; s++) {
        const theta = s * TAU / div;
        const lip = Math.cos(theta) * width;
        p.push(rx * rad - rz * lip, height + .59 * width * Math.sin(theta), rz * rad + rx * lip - BANK);
        tint.copy(root).lerp(bone, ease(t * 2.6 + .23)).multiplyScalar(.80 + .20 * Math.sin(theta) ** 2);
        c.push(tint.r, tint.g, tint.b);
        if (i === steps) continue;
        const x = start + i * div + s, n = start + i * div + (s + 1) % div;
        f.push(x, x + div, n, n, x + div, n + div);
      }
    }
  }
  return geometry(p, c, f);
}

// Jaw profile is backed by the real hole data. Timings here only pose the
// burrow and never alter where the trap lands or when the target is released.
export function createWormBurrows(parent: THREE.Group) {
  const group = new THREE.Group();
  group.name = "World Worm burrows";
  parent.add(group);
  const bedGeo = soilBowl();
  const skin = jawSkin(), fangs = jawFangs();
  const jawGeo = mergeGeometries([skin, fangs]);
  skin.dispose(); fangs.dispose();
  const bedMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const jawMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .65, emissive: 0x884332, emissiveIntensity: .29 });
  const dustGeo = new THREE.IcosahedronGeometry(1, 1);
  const dustMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x2f2317 });
  const debris = new THREE.InstancedMesh(dustGeo, dustMat, MAX_HOLES * CLODS);
  debris.frustumCulled = false;
  debris.count = 0;
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(debris);
  const colors = [0x835d38, 0xaf7c55, 0x6b402c, 0xd79967].map(hex => new THREE.Color(hex));
  const clods = Array.from({ length: CLODS }, (_, i) => {
    const a = i * 2.39996 + .26;
    return { x: Math.cos(a), z: Math.sin(a), loft: .13 + (i % 4) * .058 };
  });
  const make = () => {
    const root = new THREE.Group();
    root.visible = false;
    group.add(root);
    const bed = new THREE.Mesh(bedGeo, bedMat);
    const jaws = [1, -1].map(side => {
      const hinge = new THREE.Group();
      const jaw = new THREE.Mesh(jawGeo, jawMat);
      hinge.rotation.y = side < 0 ? Math.PI : 0;
      hinge.add(jaw);
      root.add(hinge);
      return { hinge, jaw, side };
    });
    root.add(bed);
    return { root, bed, jaws, snap: 0, gap: 0, jawY: 0 };
  };
  const holes = Array.from({ length: MAX_HOLES }, make);
  const dummy = new THREE.Object3D();
  const extent = new THREE.Box3(), size = new THREE.Vector3();
  return {
    update({ battle, time, openerTime, reduced, potato }: {
      battle: BattleState | null; time: number; openerTime: number; reduced: boolean; potato: boolean;
    }) {
      let count = 0;
      const release = time - TRAP_STUN_SECONDS;
      for (let i = 0; i < holes.length; i++) {
        const { root, bed, jaws } = holes[i];
        const hole = battle?.holes[i];
        root.visible = !!hole && release < (reduced ? 0 : FOLD);
        if (!root.visible || !hole) continue;
        const age = Math.max(openerTime, time) - i % 2 * .04;
        const dig = reduced ? 1 : ease(age / .28);
        const rise = reduced ? 1 : ease((age - .11) / .215);
        const snap = holes[i].snap = reduced ? 1 : ease((age - .34) / .15);
        const recoil = reduced ? 0 : Math.sin(Math.PI * clamp((age - .44) / .19));
        const collapse = reduced ? 0 : ease((release - .075) / (FOLD - .075));
        const free = reduced ? 0 : ease(release / .108);
        const gape = Math.max(rise * (1 - snap), free * .92);
        root.position.set(hole.x, .027, hole.y);
        root.rotation.y = hole.owner === "foe" ? .16 : Math.PI + .16;
        root.scale.set((.14 + .86 * dig) * (1 - .96 * collapse), 1 - .87 * collapse, (.085 + .915 * dig) * (1 - .97 * collapse));
        bed.scale.y = .37 + .63 * dig;
        holes[i].gap = .12 + .45 * gape;
        holes[i].jawY = -.056 + .148 * rise + .116 * gape - .055 * recoil;
        for (const { hinge, jaw, side } of jaws) {
          hinge.visible = rise > .08 && collapse < .77;
          hinge.position.set(0, holes[i].jawY, side * (BANK - .056 * snap + .116 * gape));
          jaw.rotation.x = -.10 + 1.04 * gape + .16 * recoil;
          jaw.scale.setScalar(.73 + .27 * rise);
        }
        if (reduced) continue;
        const t = release >= 0 ? release / .33 : (age - .30) / .60;
        const num = potato ? 3 : release >= 0 ? 6 : CLODS;
        for (let j = 0; j < num && t > 0 && t < 1; j++) {
          const { x, z, loft } = clods[j];
          const r = .37 + .30 * (1 - (1 - t) ** 2);
          dummy.position.set(hole.x + x * r, .026 + Math.sin(t * Math.PI) * loft, hole.y + z * r);
          dummy.rotation.set(t * 3 + j, j * .54, t * 6);
          const s = (.023 + (j % 3) * .010) * (1 - t * .88);
          dummy.scale.set(s, s * .56, s * .82);
          dummy.updateMatrix();
          debris.setMatrixAt(count, dummy.matrix);
          debris.setColorAt(count++, colors[j % colors.length]);
        }
      }
      debris.count = count;
      debris.visible = count > 0;
      if (count) {
        debris.instanceMatrix.needsUpdate = true;
        if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
      }
    },
    inspect() {
      return {
        traps: holes.filter(h => h.root.visible).length, debris: debris.count,
        trapMeasures: holes.flatMap(({ root, bed, snap, gap, jawY }) => root.visible ? [{
          size: extent.setFromObject(bed).getSize(size).toArray(), snap, gap, jawY: root.position.y + jawY * root.scale.y,
        }] : []),
      };
    },
    dispose() {
      parent.remove(group);
      debris.dispose();
      for (const resource of [bedGeo, jawGeo, bedMat, jawMat, dustGeo, dustMat]) resource.dispose();
    },
  };
}
