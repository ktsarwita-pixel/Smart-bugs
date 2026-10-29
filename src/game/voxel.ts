import * as THREE from "three";

/** World units per voxel — each bug spans ~16-18 voxels (~0.95 world units) */
export const V = 1 / 18;

interface Cell {
  r: number;
  g: number;
  b: number;
  glow: boolean;
}

interface PartGeo {
  bodyGeo: THREE.BufferGeometry;
  glowGeo: THREE.BufferGeometry | null;
  pivot: [number, number, number];
}

interface CompiledRig {
  torso: PartGeo;
  head: PartGeo;
  leftArm: PartGeo | null;
  rightArm: PartGeo | null;
  legsA: PartGeo;
  legsB: PartGeo;
  crown: PartGeo | null;
  height: number;
  /**
   * true (default): arms are mouthparts and ride under the HEAD group.
   * false: arms are WINGS and ride under the TORSO group — the dragonfly's
   * wing roots must inherit every body tilt exactly, otherwise an independent
   * head bob drags the roots through the thorax shell while the wings stroke.
   */
  armsOnHead?: boolean;
}

/** Rest-pose joint offsets, so animation can add motion without losing placement */
export interface RigRest {
  torso: THREE.Vector3;
  head: THREE.Vector3;
  leftArm: THREE.Vector3;
  rightArm: THREE.Vector3;
  legsA: THREE.Vector3;
  legsB: THREE.Vector3;
  crown: THREE.Vector3;
}

export interface VoxModel {
  group: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  legsA: THREE.Group;
  legsB: THREE.Group;
  crown: THREE.Group;
  rest: RigRest;
  bodyMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial | null;
  /** Base emissive tint (3★ champions carry a warm inner sheen). Hit flashes
   *  add on top of this and reset back to it — never to flat black. */
  emissiveBase: [number, number, number];
  height: number;
  species: string;
  star: number;
  dispose: () => void;
}

/* ── fast integer key for (-31..31, -7..31, -31..31) ────────── */
const keyOf = (x: number, y: number, z: number) =>
  ((x + 32) & 63) | (((y + 8) & 63) << 6) | (((z + 32) & 63) << 12);

const unpackX = (k: number) => (k & 63) - 32;
const unpackY = (k: number) => ((k >> 6) & 63) - 8;
const unpackZ = (k: number) => ((k >> 12) & 63) - 32;

function parseHex(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const n = parseInt(s, 16);
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

export class VoxSculptor {
  map = new Map<number, Cell>();
  colorCache = new Map<string, [number, number, number]>();

  private rgb(hex: string) {
    let c = this.colorCache.get(hex);
    if (!c) {
      c = parseHex(hex);
      this.colorCache.set(hex, c);
    }
    return c;
  }

  set(x: number, y: number, z: number, hex: string, glow = false) {
    const [r, g, b] = this.rgb(hex);
    this.map.set(keyOf(Math.round(x), Math.round(y), Math.round(z)), { r, g, b, glow });
  }

  sym(x: number, y: number, z: number, hex: string, glow = false) {
    this.set(x, y, z, hex, glow);
    if (x !== 0) this.set(-x, y, z, hex, glow);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: string, glow = false) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, hex, glow);
  }

  line(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    hex: string,
    glow = false
  ) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, hex, glow);
    }
  }

  symLine(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    hex: string,
    glow = false
  ) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.sym(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, hex, glow);
    }
  }

  ellipsoid(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    colorAt: (x: number, y: number, z: number, d2: number) => { hex: string; glow?: boolean } | null
  ) {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    const z0 = Math.floor(cz - rz);
    const z1 = Math.ceil(cz + rz);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const dz = (z - cz) / rz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 <= 1.0) {
            const res = colorAt(x, y, z, d2);
            if (res) this.set(x, y, z, res.hex, !!res.glow);
          }
        }
      }
    }
  }

  singleLeg(
    hipX: number,
    hipY: number,
    hipZ: number,
    kneeX: number,
    kneeY: number,
    kneeZ: number,
    footX: number,
    footZ: number,
    femurHex: string,
    tibiaHex: string
  ) {
    this.line(hipX, hipY, hipZ, kneeX, kneeY, kneeZ, femurHex);
    // armored knee ball + joint spike
    this.set(kneeX, kneeY, kneeZ, femurHex);
    this.set(kneeX, kneeY + 1, kneeZ, femurHex);
    this.line(kneeX, kneeY, kneeZ, footX, 0, footZ, tibiaHex);
    // splayed two-toe claw + rear dewclaw
    const sgn = footX > 0 ? 1 : -1;
    this.set(footX + sgn, 0, footZ, tibiaHex);
    this.set(footX + sgn, 0, footZ + 1, tibiaHex);
    this.set(footX, 0, footZ - 1, tibiaHex);
  }
}

/* ── Face-Culled Mesher with Baked Voxel AO ───────────────── */
interface FaceDef {
  nx: number;
  ny: number;
  nz: number;
  shade: number;
  corners: [number, number, number][];
}

const FACES: FaceDef[] = [
  { nx: 0, ny: 1, nz: 0, shade: 1.12, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { nx: 0, ny: -1, nz: 0, shade: 0.58, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { nx: 1, ny: 0, nz: 0, shade: 0.88, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { nx: -1, ny: 0, nz: 0, shade: 0.84, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { nx: 0, ny: 0, nz: 1, shade: 0.82, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { nx: 0, ny: 0, nz: -1, shade: 0.98, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const AO_CURVE = [0.48, 0.7, 0.86, 1.0];

function compilePart(s: VoxSculptor, pivot: [number, number, number] = [0, 0, 0]): PartGeo {
  const has = (x: number, y: number, z: number) => s.map.has(keyOf(x, y, z));
  const [pX, pY, pZ] = pivot;

  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];

  const gPos: number[] = [];
  const gNrm: number[] = [];
  const gCol: number[] = [];

  s.map.forEach((cell, k) => {
    const x = unpackX(k);
    const y = unpackY(k);
    const z = unpackZ(k);

    for (let f = 0; f < 6; f++) {
      const fd = FACES[f];
      const ax = x + fd.nx;
      const ay = y + fd.ny;
      const az = z + fd.nz;
      if (s.map.has(keyOf(ax, ay, az))) continue;

      const aos = [3, 3, 3, 3];
      for (let ci = 0; ci < 4; ci++) {
        const [ox, oy, oz] = fd.corners[ci];
        const sx = ox === 0 ? -1 : 1;
        const sy = oy === 0 ? -1 : 1;
        const sz = oz === 0 ? -1 : 1;
        let s1 = false;
        let s2 = false;
        let cn = false;
        if (fd.ny !== 0) {
          s1 = has(x + sx, y + fd.ny, z);
          s2 = has(x, y + fd.ny, z + sz);
          cn = has(x + sx, y + fd.ny, z + sz);
        } else if (fd.nx !== 0) {
          s1 = has(x + fd.nx, y + sy, z);
          s2 = has(x + fd.nx, y, z + sz);
          cn = has(x + fd.nx, y + sy, z + sz);
        } else {
          s1 = has(x + sx, y, z + fd.nz);
          s2 = has(x, y + sy, z + fd.nz);
          cn = has(x + sx, y + sy, z + fd.nz);
        }
        aos[ci] = s1 && s2 ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (cn ? 1 : 0));
      }

      const triOrder = aos[0] + aos[2] < aos[1] + aos[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];

      for (let ti = 0; ti < 6; ti++) {
        const ci = triOrder[ti];
        const [ox, oy, oz] = fd.corners[ci];
        const wx = (x - pX + ox - 0.5) * V;
        const wy = (y - pY + oy) * V;
        const wz = (z - pZ + oz - 0.5) * V;

        const m = fd.shade * (cell.glow ? 1.0 : AO_CURVE[aos[ci]]);
        pos.push(wx, wy, wz);
        nrm.push(fd.nx, fd.ny, fd.nz);
        col.push(Math.min(1, cell.r * m), Math.min(1, cell.g * m), Math.min(1, cell.b * m));

        if (cell.glow) {
          gPos.push(wx + fd.nx * V * 0.16, wy + fd.ny * V * 0.16, wz + fd.nz * V * 0.16);
          gNrm.push(fd.nx, fd.ny, fd.nz);
          gCol.push(Math.min(1, cell.r * 1.35 + 0.12), Math.min(1, cell.g * 1.35 + 0.1), Math.min(1, cell.b * 1.35 + 0.08));
        }
      }
    }
  });

  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  bodyGeo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  bodyGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  bodyGeo.computeBoundingSphere();

  let glowGeo: THREE.BufferGeometry | null = null;
  if (gPos.length > 0) {
    glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(gPos, 3));
    glowGeo.setAttribute("normal", new THREE.Float32BufferAttribute(gNrm, 3));
    glowGeo.setAttribute("color", new THREE.Float32BufferAttribute(gCol, 3));
    glowGeo.computeBoundingSphere();
  }

  return { bodyGeo, glowGeo, pivot: [pX * V, pY * V, pZ * V] };
}

/* ── 5 Articulated Insect Voxel Rigs ──────────────────────── */
function buildRigSculptures(id: string, star: number): CompiledRig {
  const torsoS = new VoxSculptor();
  const headS = new VoxSculptor();
  const leftArmS = new VoxSculptor();
  const rightArmS = new VoxSculptor();
  const legsAS = new VoxSculptor();
  const legsBS = new VoxSculptor();
  const crownS = new VoxSculptor();

  let headPivot: [number, number, number] = [0, 3.3, -4.5];
  let leftArmPivot: [number, number, number] = [-2.2, 3.3, -5.5];
  let rightArmPivot: [number, number, number] = [2.2, 3.3, -5.5];
  let crownPivot: [number, number, number] = [0, 8, -1];
  // The torso must pivot around the thorax. At the old origin (the feet) every
  // abdomen pitch swung the whole body like a falling tree.
  let torsoPivot: [number, number, number] = [0, 3.4, -0.5];
  let maxY = 8;

  if (id === "stag") {
    // Legs: Tripod A (L1, R2, L3) and Tripod B (R1, L2, R3)
    legsAS.singleLeg(-3, 2, -3, -6, 4, -4, -7, -5, "#3E2B1D", "#23170F");
    legsAS.singleLeg(4, 2, 0, 7, 4, 0, 8, 0, "#3E2B1D", "#23170F");
    legsAS.singleLeg(-4, 2, 4, -7, 4, 5, -8, 7, "#3E2B1D", "#23170F");

    legsBS.singleLeg(3, 2, -3, 6, 4, -4, 7, -5, "#3E2B1D", "#23170F");
    legsBS.singleLeg(-4, 2, 0, -7, 4, 0, -8, 0, "#3E2B1D", "#23170F");
    legsBS.singleLeg(4, 2, 4, 7, 4, 5, 8, 7, "#3E2B1D", "#23170F");

    // Torso: Pronotum shield (-4..-1) + emerald domed elytra (-1..+8)
    torsoS.ellipsoid(0, 4.0, -2.5, 4.6, 2.5, 2.2, (x, y) => {
      if (y <= 1) return null;
      if (Math.abs(x) >= 4 && y === 4) return { hex: "#63462F" };
      return { hex: y >= 5 ? "#4B3525" : "#2D1F15" };
    });
    torsoS.ellipsoid(0, 4.3, 3.2, 4.7, 3.2, 4.8, (x, y, z) => {
      if (y <= 1) return null;
      if (y === 2) return { hex: "#1B130D" };
      if (x === 0 && y >= 5 && z >= 0) return { hex: "#0E3627" };
      // transverse segment grooves across the shell
      if (y === 4 && z >= -1 && z <= 7 && (z + 9) % 3 === 0) return { hex: "#0E3627" };
      if ((x === -2 || x === -1) && y >= 6 && z >= 0 && z <= 5) return { hex: "#68E8B7" };
      if (Math.abs(x) === 1 && y >= 7) return { hex: "#68E8B7" }; // dorsal ridge light
      if (y >= 6) return { hex: "#28966E" };
      if (y >= 4) return { hex: "#1F7A5A" };
      return { hex: "#134B37" };
    });
    // pronotum collar rim + shoulder spikes + elytra side skirt + tail plate
    torsoS.box(-3, 5, -4, 3, 5, -4, "#63462F");
    torsoS.sym(5, 4, -3, "#63462F");
    torsoS.sym(5, 5, -2, "#4B3525");
    for (let _z = 1; _z <= 5; _z++) torsoS.sym(5, 4, _z, "#1F7A5A");
    torsoS.box(-2, 4, 7, 2, 5, 8, "#134B37");

    // Head: pivoting at (0, 3.3, -4.8)
    headPivot = [0, 3.3, -4.8];
    torsoPivot = [0, 3.2, -1.0];
    headS.ellipsoid(0, 3.3, -5.2, 3.2, 1.9, 1.9, (_x, y) => ({
      hex: y >= 4 ? "#422E20" : "#261A11",
    }));
    headS.box(-2, 5, -6, 2, 5, -5, "#4B3525"); // heavy brow ridge
    headS.sym(3, 4, -5, "#FF4D2D", true);
    headS.sym(3, 3, -5, "#FF4D2D", true);
    headS.sym(2, 4, -6, "#FF4D2D", true); // inner eye facet
    headS.sym(3, 4, -6, "#FF7A50", true); // outer eye facet
    headS.symLine(3, 3, -6, 5, 4, -7, "#6E4E32");
    headS.sym(6, 4, -7, "#DA9630"); // antennal club
    headS.sym(6, 5, -7, "#DA9630");
    headS.sym(7, 4, -7, "#F7C866");

    // Articulated Left & Right Great Mandibles!
    leftArmPivot = [-2.2, 3.3, -5.8];
    rightArmPivot = [2.2, 3.3, -5.8];

    leftArmS.line(-2, 3.3, -5.8, -4, 4.3, -8, "#C98526");
    leftArmS.line(-1.2, 3.3, -5.5, -3.2, 4.3, -7.5, "#8A5A2A"); // girthy base
    leftArmS.line(-4, 4.3, -8, -4, 5.3, -10, "#E5A53D");
    leftArmS.line(-4, 5.3, -10, -2, 7.3, -11, "#F7C866");
    leftArmS.set(-1, 7.3, -11, "#FFE08C");
    leftArmS.set(-1, 8, -11, "#FFE08C"); // forked crown prong (up)
    leftArmS.set(-1, 7, -12, "#FFE08C"); // forked crown prong (forward)
    leftArmS.set(-3, 4.3, -8, "#F7C866");
    leftArmS.set(-2, 5.3, -9, "#F7C866");
    leftArmS.set(-3, 6.3, -10, "#FFE08C");
    leftArmS.set(-2, 6.3, -9, "#F7C866");

    rightArmS.line(2, 3.3, -5.8, 4, 4.3, -8, "#C98526");
    rightArmS.line(1.2, 3.3, -5.5, 3.2, 4.3, -7.5, "#8A5A2A");
    rightArmS.line(4, 4.3, -8, 4, 5.3, -10, "#E5A53D");
    rightArmS.line(4, 5.3, -10, 2, 7.3, -11, "#F7C866");
    rightArmS.set(1, 7.3, -11, "#FFE08C");
    rightArmS.set(1, 8, -11, "#FFE08C");
    rightArmS.set(1, 7, -12, "#FFE08C");
    rightArmS.set(3, 4.3, -8, "#F7C866");
    rightArmS.set(2, 5.3, -9, "#F7C866");
    rightArmS.set(3, 6.3, -10, "#FFE08C");
    rightArmS.set(2, 6.3, -9, "#F7C866");

    crownPivot = [0, 8, -1];
    maxY = 8;
  } else if (id === "bomb") {
    // Legs: Tripod A & B
    legsAS.singleLeg(-2, 2, -3, -5, 4, -4, -7, -5, "#D96823", "#3A281A");
    legsAS.singleLeg(3, 2, 0, 6, 4, 0, 8, 1, "#D96823", "#3A281A");
    legsAS.singleLeg(-3, 2, 4, -6, 4, 5, -8, 7, "#D96823", "#3A281A");

    legsBS.singleLeg(2, 2, -3, 5, 4, -4, 7, -5, "#D96823", "#3A281A");
    legsBS.singleLeg(-3, 2, 0, -6, 4, 0, -8, 1, "#D96823", "#3A281A");
    legsBS.singleLeg(3, 2, 4, 6, 4, 5, 8, 7, "#D96823", "#3A281A");

    // Torso: Narrow orange prothorax + cobalt artillery abdomen with rear cannons
    torsoS.ellipsoid(0, 3.8, -3.2, 2.6, 2.0, 1.9, (_x, y) => {
      if (y <= 1) return null;
      return { hex: y >= 5 ? "#FFA052" : "#D96823" };
    });
    torsoS.ellipsoid(0, 4.6, 2.8, 4.5, 3.1, 4.7, (x, y, z) => {
      const lift = z > 2 ? 1 : 0;
      if (y <= 1 + lift) return null;
      if (y === 2 + lift) return { hex: "#2B1D14" };
      if (x === 0 && y >= 5) return { hex: "#152844" };
      if (Math.abs(x) === 2 && y >= 6) return { hex: "#A8D1FF" };
      if (y >= 6) return { hex: "#3564A4" };
      if (y >= 4) return { hex: "#2D5994" };
      return { hex: "#1B3457" };
    });
    // prothorax collar + glowing pressure-chamber window on the back
    torsoS.box(-2, 5, -4, 2, 5, -3, "#FFA052");
    torsoS.box(-1, 7, 1, 1, 7, 3, "#FF8038", true);
    // heat-vent slits breathing down both flanks
    for (const _vz of [0, 2, 4]) torsoS.sym(4, 5, _vz, "#FF8038", true);
    // armored triple-barrel cannon block at the rear
    torsoS.sym(2, 6, 7, "#4A3525");
    torsoS.sym(2, 5, 7, "#4A3525");
    torsoS.sym(2, 7, 8, "#4A3525"); // muzzle brake (top)
    torsoS.sym(2, 4, 8, "#4A3525"); // muzzle brake (bottom)
    torsoS.sym(2, 6, 8, "#FFA052", true); // left/right glowing bores
    torsoS.sym(2, 5, 8, "#FF4828", true);
    torsoS.set(0, 6, 7, "#FF8038", true);
    torsoS.set(0, 6, 8, "#FF4828", true); // center cannon bore
    torsoS.sym(1, 6, 8, "#4A3525"); // center housing cheeks
    torsoS.sym(1, 5, 8, "#4A3525");
    torsoS.set(0, 7, 7, "#A8D1FF"); // gunner's sight bead
    torsoS.sym(1, 7, 6, "#DCE9E2"); // folded wing tips

    headPivot = [0, 3.6, -4.5];
    torsoPivot = [0, 3.6, 0.8];
    headS.ellipsoid(0, 3.6, -5.8, 2.4, 1.7, 1.8, (_x, y) => ({
      hex: y >= 4 ? "#FFA052" : "#C45B1C",
    }));
    headS.sym(2, 4, -6, "#FF4828", true); // compound eyes, upper + lower
    headS.sym(2, 5, -6, "#FF4828", true);
    headS.sym(1, 4, -7, "#C45B1C"); // blunt snout
    headS.sym(1, 3, -7, "#8A4A1E"); // tasting palps

    // Left & Right Sweeping Antennae
    leftArmPivot = [-1.5, 4.2, -6.5];
    rightArmPivot = [1.5, 4.2, -6.5];
    leftArmS.line(-1.5, 4.2, -6.5, -4.5, 6.5, -9.5, "#FFA052");
    leftArmS.line(-1.5, 4.2, -6.5, -3.5, 6, -9, "#D96823"); // girth at the base
    leftArmS.set(-5, 7, -10, "#FFE7A3", true); // glowing club tip
    leftArmS.set(-6, 7, -10, "#FFE7A3", true);
    leftArmS.set(-5, 8, -10, "#FFA052");
    rightArmS.line(1.5, 4.2, -6.5, 4.5, 6.5, -9.5, "#FFA052");
    rightArmS.line(1.5, 4.2, -6.5, 3.5, 6, -9, "#D96823");
    rightArmS.set(5, 7, -10, "#FFE7A3", true);
    rightArmS.set(6, 7, -10, "#FFE7A3", true);
    rightArmS.set(5, 8, -10, "#FFA052");

    crownPivot = [0, 8, 1];
    maxY = 8;
  } else if (id === "mantis") {
    // Legs: Stalking walking legs
    legsAS.singleLeg(-2, 3, 0, -6, 5, -1, -8, -1, "#33A350", "#1A5C2A");
    legsAS.singleLeg(2, 3, 4, 6, 5, 5, 8, 7, "#33A350", "#1A5C2A");

    legsBS.singleLeg(2, 3, 0, 6, 5, -1, 8, -1, "#33A350", "#1A5C2A");
    legsBS.singleLeg(-2, 3, 4, -6, 5, 5, -8, 7, "#33A350", "#1A5C2A");

    // Torso: Leaf-shaped slender abdomen (0..+9)
    torsoS.ellipsoid(0, 3.9, 4.0, 3.2, 2.3, 4.8, (x, y, z) => {
      const lift = z > 5 ? 1 : 0;
      if (y <= 1 + lift) return null;
      if (Math.abs(x) >= 3 && y === 4) return { hex: "#A6FFDE" };
      if (y === 4 && z % 2 === 0) return { hex: "#1E612E" }; // segment grooves
      if (y >= 5) return { hex: "#54BD6B" };
      return { hex: "#287D3C" };
    });
    for (let _mz = 0; _mz <= 8; _mz++) torsoS.set(0, 6, _mz, "#8BF09D"); // leaf midrib
    torsoS.box(1, 6, 2, 2, 6, 7, "#2F8F45"); // folded tegmina (right)
    torsoS.box(-2, 6, 2, -1, 6, 7, "#2F8F45"); // folded tegmina (left)
    torsoS.line(1, 7, 2, 1, 7, 6, "#8BF09D"); // wing veins
    torsoS.line(-1, 7, 2, -1, 7, 6, "#8BF09D");
    torsoS.sym(1, 6, 8, "#8BF09D"); // tail cerci
    torsoS.sym(1, 6, 9, "#8BF09D");
    torsoS.sym(1, 7, 8, "#54BD6B");

    // Head / Rearing Prothorax: Rises from (0, 4, -1) to (0, 11, -5.5) with pivoting neck!
    headPivot = [0, 4.0, -1.0];
    torsoPivot = [0, 4.0, 0.0];
    for (let i = 0; i <= 7; i++) {
      const py = 4 + i;
      const pz = -1 - Math.floor(i * 0.65);
      headS.box(-1, py, pz, 1, py, pz + 1, i % 2 === 0 ? "#33A350" : "#236B34");
      headS.set(0, py, pz - 1, "#8BF09D");
    }
    headS.box(-2, 4, -1, 2, 4, 0, "#1E612E"); // neck collar at the prothorax base
    headS.box(-2, 11, -6, 2, 12, -5, "#45B85F");
    headS.set(0, 10, -6, "#236B34");
    headS.set(0, 13, -5, "#8BF09D"); // head crest spike
    headS.sym(3, 12, -6, "#A6FFDE", true); // great compound eyes
    headS.sym(3, 11, -6, "#A6FFDE", true);
    headS.sym(3, 10, -6, "#A6FFDE", true);
    headS.sym(2, 13, -6, "#A6FFDE", true);
    headS.symLine(1, 13, -6, 3, 15, -8, "#8BF09D");

    // Articulated Left & Right Raptor Scythe Forelegs!
    leftArmPivot = [-2.2, 9.0, -5.2];
    rightArmPivot = [2.2, 9.0, -5.2];

    leftArmS.line(-2.2, 9.0, -5.2, -4.2, 7.2, -7.2, "#45B85F");
    leftArmS.line(-1.6, 9.0, -5.6, -3.6, 7.2, -7.6, "#2F8F45"); // femur girth
    leftArmS.line(-4.2, 7.2, -7.2, -3.2, 9.2, -9.2, "#8BF09D");
    leftArmS.line(-3.2, 9.2, -9.2, -2.2, 6.2, -10.2, "#EAFFF0");
    leftArmS.set(-3.2, 7.2, -9.2, "#EAFFF0"); // raptorial spines
    leftArmS.set(-4.2, 8.2, -8.2, "#EAFFF0");
    leftArmS.set(-3, 7, -10, "#EAFFF0");
    leftArmS.set(-4, 8, -9, "#EAFFF0");
    leftArmS.set(-5, 8, -8, "#EAFFF0");

    rightArmS.line(2.2, 9.0, -5.2, 4.2, 7.2, -7.2, "#45B85F");
    rightArmS.line(1.6, 9.0, -5.6, 3.6, 7.2, -7.6, "#2F8F45");
    rightArmS.line(4.2, 7.2, -7.2, 3.2, 9.2, -9.2, "#8BF09D");
    rightArmS.line(3.2, 9.2, -9.2, 2.2, 6.2, -10.2, "#EAFFF0");
    rightArmS.set(3.2, 7.2, -9.2, "#EAFFF0");
    rightArmS.set(4.2, 8.2, -8.2, "#EAFFF0");
    rightArmS.set(3, 7, -10, "#EAFFF0");
    rightArmS.set(4, 8, -9, "#EAFFF0");
    rightArmS.set(5, 8, -8, "#EAFFF0");

    crownPivot = [0, 14, -5];
    maxY = 14;
  } else if (id === "dragonfly") {
    // REWORK v7 — "Dartwing". Every earlier pass pivoted the wings at the
    // shell SURFACE (|x| = 2, y 8) and rested the root ON TOP of socket
    // boxes, so attachment was only face-contact: from many camera angles
    // the blades read as planks floating beside the body, and successive
    // fixes kept adding boxes (shelves, sockets, caps) that built stepped
    // towers on the thorax. v7 flips the approach — DEEP ROOT: the pivot
    // lives INSIDE the thorax mass and the root chord starts at |x| = 1,
    // so two voxels of every wing are inside the body at rest. No camera
    // angle, flap phase, dart, or skill fold can detach a root that is
    // embedded in the volume it flaps against. Blades curve away from the
    // shoulder (fore pair swept forward, hind pair swept back — a real
    // odonate X), 3-voxel chords at the root tapering to a single vein
    // row, gently upswept, in glassy teal instead of flat white.
    const bodyDark = "#0E3A44";
    const bodyMid = "#177E8C";
    const bodyLite = "#35C2D6";
    const glint = "#BDF6FF";
    const glow = "#8FF0FA";
    const amber = "#F0A93B";
    const membrane = "#C9F2FA";
    const leading = "#EFFDFF";

    // Six slender legs tucked UNDER the wing plane — knees at y4 with no
    // upward knee spike (singleLeg's y+1 knee ball would pierce the y6 wing
    // row and read as clipped wings at rest). Femur + tibia lines only.
    const dfLeg = (S: VoxSculptor, sx: number, hz: number, fz: number) => {
      S.line(sx * 2, 3, hz, sx * 4, 3, hz, bodyMid); // horizontal femur
      S.line(sx * 4, 3, hz, sx * 5, 0, fz, bodyDark); // straight tibia down
      S.set(sx * 5, 0, fz, bodyDark);
      S.set(sx * 5 + sx, 0, fz, bodyDark);
    };
    dfLeg(legsAS, -1, -2, -3);
    dfLeg(legsAS, -1, 0, 0);
    dfLeg(legsAS, -1, 2, 3);
    dfLeg(legsBS, 1, -2, -3);
    dfLeg(legsBS, 1, 0, 0);
    dfLeg(legsBS, 1, 2, 3);

    // Thorax: ONE smooth hunched ellipsoid — no collar/ridge/fairing/
    // shelf/socket/cap stacks to read as a tower under each wing.
    // Dark belly seam, teal flanks, glazed crest, luminous shoulder lamps.
    torsoS.ellipsoid(0, 5.0, -0.2, 2.7, 2.2, 2.8, (x, y, _z) => {
      if (y <= 2) return null;
      if (y <= 3) return { hex: bodyDark };
      if (x === 0 && y >= 7) return { hex: glint };
      if (y >= 6) return { hex: bodyLite };
      return { hex: y >= 4 ? bodyMid : bodyDark };
    });
    torsoS.sym(2, 6, -2, glow, true); // shoulder lamps
    // Wing-base plates: at wing height the ellipsoid flank ends near
    // |z| ~ 1.7, which left the hind root chord (z 2..3) hanging off the
    // flank — read as wings noclipping the body. STEPPED plates enclose
    // both root chords (an inner column + a shorter outer plate tucking
    // under the blades) — the old full 2x3x5 slabs read as bolted-on
    // engine blocks. Shell gradient, one soft glint each.
    torsoS.box(-2, 5, -1, -2, 7, 3, bodyMid); // inner column carries the chords
    torsoS.box(2, 5, -1, 2, 7, 3, bodyMid);
    torsoS.box(-3, 6, 2, -3, 7, 3, bodyLite); // outer plate — narrow rear
    torsoS.box(3, 6, 2, 3, 7, 3, bodyLite); // shelf behind BOTH flap arcs
    torsoS.set(-3, 7, 2, glint); // fairing glints
    torsoS.set(3, 7, 2, glint);
    // Notch fills: probe-verified diagonal pockets (deep 1-cell dents where
    // three shell faces meet — read as stray voxels / holes in the shell).
    // Colors follow the local gradient so each fill reads as shell.
    torsoS.sym(1, 3, -1, bodyDark); // low flank seam
    torsoS.sym(2, 4, -2, bodyMid); // under-plate belly
    torsoS.sym(2, 4, 2, bodyMid);
    // (|x|3, y5, z0..2) left EMPTY: the blade roots live face-adjacent
    // there — any torso cell would coplanar-clash or block the root
    torsoS.sym(1, 6, 3, bodyLite); // crest shoulder
    torsoS.sym(1, 7, -1, bodyLite);
    torsoS.sym(1, 7, 1, bodyLite);
    torsoS.set(0, 6, 4, bodyLite); // ring-2 top
    torsoS.sym(1, 5, 7, bodyMid); // ring-5 flank
    torsoS.set(0, 5, 9, bodyMid); // ring-7 top
    torsoS.sym(3, 5, -1, bodyMid); // plate front foot
    torsoS.sym(2, 4, 3, bodyMid); // column rear underside
    torsoS.set(0, 7, 1, bodyLite); // crest line
    torsoS.sym(1, 7, 2, bodyLite);
    torsoS.sym(1, 6, 4, bodyLite); // ring-2 shoulder
    torsoS.set(0, 7, 2, bodyLite); // crest continues over ring-1
    torsoS.sym(1, 7, 3, bodyLite); // ring-2 crest
    torsoS.sym(1, 6, 5, bodyLite); // ring-3 shoulder
    torsoS.sym(1, 5, 8, bodyMid); // ring-5 rear flank
    torsoS.sym(1, 5, 12, bodyLite); // tail cone top shoulder
    torsoS.set(0, 4, 12, bodyMid); // tail cone tip underside
    torsoS.set(0, 7, 3, bodyLite); // ring-2 crest cap
    torsoS.sym(1, 5, 11, bodyLite); // cone->cerci shoulder
    torsoS.sym(1, 5, 13, bodyLite); // cerci base shoulder

    // Eight abdominal rings sliding low behind the wings — alternating
    // enamel bands, a dark annulus on each joint, amber dorsal studs.
    for (let i = 0; i < 8; i++) {
      const z = 1.8 + i * 1.05;
      const taper = 2.1 - i * 0.16;
      const cy = 5.0 - i * 0.13;
      const bandLite = i % 2 === 0;
      torsoS.ellipsoid(0, cy, z, taper, 1.2 - i * 0.05, 1.0, (_x, y) => {
        if (y <= 2) return null;
        if (y >= Math.round(cy) + 1) return { hex: bandLite ? glint : bodyLite };
        if (y === Math.round(cy)) return { hex: bodyDark };
        return { hex: bandLite ? bodyMid : "#12324A" };
      });
      // studs only on rings clear of the wing chord sweep (front rings sit
      // in the hind-wing trailing arc — a pitched torso swings the stud
      // into the membrane)
      if (i >= 3 && i % 3 === 0) torsoS.set(0, Math.round(cy) + 1, Math.round(z), amber, true);
    }
    // Tail cone: seals the last-ring -> cerci junction (an open notch sat
    // there — you could see straight into the tail break).
    torsoS.ellipsoid(0, 4.35, 10.55, 1.15, 0.85, 1.35, (_x, y) => {
      if (y <= 2) return null;
      return { hex: y >= 5 ? bodyLite : bodyMid };
    });
    // Paired tail cerci + a glowing tip spike.
    torsoS.symLine(1, 4, 11.2, 2, 5, 13.0, bodyLite);
    torsoS.set(0, 5, 12, glint, true);
    torsoS.set(0, 5, 13, glow, true);
    torsoS.set(0, 5, 14, glow, true);

    // Head: broad teal dome under a heavy brow, chunky glowing eye
    // clusters, short antenna clubs.
    headPivot = [0, 6, -4.2];
    torsoPivot = [0, 4.9, 0.4];
    headS.ellipsoid(0, 6, -5.4, 2.7, 1.9, 1.8, (_x, y) => ({
      hex: y >= 7 ? bodyLite : bodyMid,
    }));
    headS.box(-2, 7, -6.8, 2, 7, -5.8, bodyDark); // brow ridge
    headS.sym(2, 7, -5.8, glow, true);
    headS.sym(3, 7, -5.8, bodyLite, true);
    headS.sym(3, 6, -5.8, bodyLite, true);
    headS.sym(2, 6, -6.8, glow, true);
    headS.set(0, 5, -6.8, bodyDark); // frons
    headS.symLine(1, 7, -6.8, 2, 7, -7.6, bodyLite); // low antenna bristles
    headS.sym(2, 7, -7.8, glint);
    // Dome dents: probe-verified pockets, filled with the local shell color.
    headS.sym(1, 5, -7, bodyMid);
    headS.sym(1, 5, -4, bodyMid);
    headS.sym(1, 7, -4, bodyLite);
    headS.sym(2, 5, -7, bodyMid);

    // DEEP-ROOT WINGS — one mirrored painter so left and right stay exact
    // reflections. Root cells i = 0..1 are INSIDE the shell (|x| = 1..2,
    // at the wing row y6 the thorax spans |x| <= 2 for |z| <= ~2), so the
    // visible blade always grows out of body mass. ROSTER-SCALED: tips
    // reach |x| = 7, well inside the old |x| = 8+ moth canopy.
    leftArmPivot = [-1.5, 5.5, -0.4];
    rightArmPivot = [1.5, 5.5, -0.4];
    const paintWing = (
      S: VoxSculptor,
      side: number,
      zRoot: number,
      len: number,
      sweep: number,
      row: number,
      narrow = false
    ) => {
      const zr = Math.round(zRoot);
      for (let i = 0; i <= len; i++) {
        // blades START at the plate face |x| = 3 — the old deep-root cells
        // (|x| = 1..2) shared sculpt cells with the thorax/plate, and two
        // opaque boxes in one cell z-FIGHT (the "wings noclip the body"
        // flicker). Face-adjacent to the column = attached, zero overlap.
        const wx = side * (3 + i);
        const wz = zr + Math.round(i * sweep); // curved sweep
        const wy = row + (i >= len - 1 ? 1 : 0); // tip pair kicks up
        // TRUE odonate plan: narrow petiole (i 0..1), broad gliding chord
        // through the middle, tapered tip. Fore wings peak at a 5-cell
        // chord; the hind pair peaks 4 — a real dragonfly silhouette.
        const half = i < 2 ? 0 : i < (narrow ? 4 : 5) ? 1 : i < (narrow ? 6 : 7) ? 2 : i < len ? 1 : 0;
        for (let dz = -half; dz <= half; dz++) {
          // solid glassy membrane: bright cutwater at the root, leading
          // edge caught by light, soft teal-dark trailing edge for shape
          let hex = membrane;
          if (dz === -half) hex = i <= 2 || i >= len - 2 ? leading : "#DCF6FC";
          else if (dz === half && half > 0) hex = "#A8E2F0";
          S.set(wx, wy, wz + dz, hex, i === 0);
        }
        if (i === len - 2) S.set(wx, wy, wz, amber, true); // stigma
      }
    };
    for (const S of [leftArmS, rightArmS]) {
      const side = S === leftArmS ? -1 : 1;
      // fore pair on row y6 (span 10), hind pair a full row LOWER (y5,
      // span 9) swept back — the rows keep a 1-vox vertical channel so the
      // blades never fuse, the sweep gives the paired glider look
      paintWing(S, side, -0.4, 7, 0.3, 6); // fore pair — blades |x| 3..10
      paintWing(S, side, 1.8, 6, 0.5, 5, true); // hind pair — lower row, swept back
    }

    crownPivot = [0, 8, -3];
    maxY = 8;
  } else if (id === "matriarch") {
    legsAS.singleLeg(-3, 2, -3, -6, 4, -4, -7, -5, "#6E4B2E", "#3D2817");
    legsAS.singleLeg(4, 2, 0, 7, 4, 0, 8, 1, "#6E4B2E", "#3D2817");
    legsAS.singleLeg(-4, 2, 4, -7, 4, 5, -8, 6, "#6E4B2E", "#3D2817");

    legsBS.singleLeg(3, 2, -3, 6, 4, -4, 7, -5, "#6E4B2E", "#3D2817");
    legsBS.singleLeg(-4, 2, 0, -7, 4, 0, -8, 1, "#6E4B2E", "#3D2817");
    legsBS.singleLeg(4, 2, 4, 7, 4, 5, 8, 6, "#6E4B2E", "#3D2817");

    torsoS.ellipsoid(0, 4.4, -2.6, 4.2, 2.6, 2.0, (_x, y) => {
      if (y <= 1) return null;
      return { hex: y >= 6 ? "#F0A93B" : "#755334" };
    });
    torsoS.ellipsoid(0, 4.5, 3.4, 5.0, 3.5, 5.2, (x, y, z) => {
      if (y <= 1) return null;
      if (y === 2) return { hex: "#382617" };
      const band = Math.abs(z) % 2 === 0;
      if (y >= 7 && x === 0) return { hex: "#F0A93B" };
      if (y === 3 && Math.abs(x) <= 2 && z >= 2 && z <= 5) return { hex: "#FFF4CC", glow: true }; // brood glow
      if (band && y >= 4 && y <= 6) return { hex: Math.abs(x) >= 3 ? "#F0A93B" : "#EAD7B8" };
      return { hex: y >= 5 ? "#7E5B3B" : "#543C25" };
    });

    headPivot = [0, 4.0, -4.5];
    torsoPivot = [0, 4.0, 0.0];
    headS.ellipsoid(0, 4.0, -5.2, 3.0, 2.3, 2.0, (_x, y) => ({
      hex: y >= 5 ? "#8C6642" : "#543C25",
    }));
    headS.sym(3, 4, -6, "#FF4D2D", true);
    headS.sym(2, 3, -7, "#543C25"); // jaw nubs
    headS.box(-2, 6, -6, 2, 7, -5, "#F0A93B");
    headS.set(0, 8, -6, "#FFF4CC", true);
    headS.sym(2, 8, -6, "#F0A93B");
    torsoS.sym(4, 6, -2, "#F0A93B"); // royal shoulder pads

    crownPivot = [0, 9, -2];
    maxY = 9;
  } else if (id === "worm") {
    // REWORK v6 — "Earth Colossus". Roster-scale and densely detailed, with
    // ZERO free-standing decoration: the v5 dark soil skirt face-welded to
    // the flanks still READ as floating debris against the dark pod, and
    // v5 shrank the body too far. Every cell now belongs to the body, the
    // head dome, or the jaw chains rooted inside the dome. Detail comes
    // from the painters themselves: alternating plate bands, dark annulus
    // grooves at each segment boundary, a serrated dorsal keel, the pale
    // clitellum saddle with ridge texture, a dorsal vessel dash, wet flank
    // shine, glowing eye pair, a pale shovel face and pale hook jaws.
    const skinDark = "#6E3D4A";
    const skinMid = "#A85E6E";
    const plateLite = "#D98A96";
    const groove = "#4F2A35";
    const shine = "#F6C2C8";
    const saddle1 = "#EFD0C6";
    const saddle2 = "#D9A99C";
    const keel = "#C9788A";
    const vessel = "#8A4A57";

    // Nine plump segments, belly-down, nose at -z, gently overlapping so
    // the body is one continuous mass; the boundary rings shade dark
    // automatically where consecutive ellipsoids meet.
    for (let seg = 0; seg < 9; seg++) {
      const cz = -4.2 + seg * 1.5;
      const t = seg / 8;
      const swollen = seg === 3 || seg === 4;
      const rx = 3.8 - t * 1.8 + (swollen ? 0.35 : 0); // 3.8 -> 2.0
      const ry = 2.7 - t * 0.9;                        // 2.7 -> 1.8
      const even = seg % 2 === 0;
      const rxi = Math.round(rx);
      // deep tail rings: the last three overlap their neighbour by more than
      // half a cell so the tapering tail never reads as detached blobs
      const rz = seg >= 6 ? 1.6 : 1.2;
      torsoS.ellipsoid(0, ry, cz, rx, ry, rz, (x, y, z) => {
        if (y < 0) return null;
        const zz = z - cz;
        // dorsal vessel dash along the spine of even segments
        if (x === 0 && y >= ry * 2 - 0.6 && even && zz < 0.5) return { hex: vessel };
        // serrated keel: alternating spine plates
        if (Math.abs(x) <= 0 && y >= ry * 2 - 1 && (seg + Math.round(z)) % 2 === 0) return { hex: keel };
        // clitellum saddle with ridge texture
        if (swollen && y >= ry) return { hex: y % 2 === 0 ? saddle1 : saddle2 };
        // alternating plate bands on the back
        if (y >= ry) return { hex: even ? plateLite : skinMid };
        // dark annulus groove at the trailing edge of each segment
        if (zz >= 0.55) return { hex: groove };
        // wet flank shine
        if (Math.abs(x) >= rxi - 1 && y >= 1) return { hex: shine };
        // belly contact row
        if (y === 0) return { hex: groove };
        return { hex: even ? skinMid : skinDark };
      });
    }

    // Head: broad shovel-faced dome — glowing eye pair and pale face plate
    // painted by the dome painter itself (a glow cell that is not a dome
    // cell cannot exist, so floating parts are structurally impossible).
    // Dome is now slightly narrower (2.7) and sits 0.4 forward: at the old
    // size its rear flanks (half-width 2.9) were WIDER than body segment 0
    // (~2.8 at the seam), so the buried part poked out and visibly slid
    // against the body whenever the head yawed — the "moving voxels
    // clipping" report. Inside the body mass, no relative slide can show.
    headPivot = [0, 2.4, -5.4];
    torsoPivot = [0, 2.2, 0.3];
    headS.ellipsoid(0, 2.4, -5.4, 2.7, 2.2, 2.4, (x, y, z) => {
      if (y < 0) return null;
      // glowing eye pair, set into the dome flanks
      if (Math.abs(x) === 2 && y === 3 && z <= -5.4) return { hex: "#FFE08C", glow: true };
      // pale shovel face + crowned plate
      if (z <= -6.8 && y >= 1) return { hex: saddle1 };
      if (y >= 4) return { hex: saddle2 };
      // dark cheek/belly contact
      if (Math.abs(x) >= 2 && y <= 1) return { hex: skinDark };
      return { hex: skinMid };
    });

    // Neck-corner shave: ring0's top-front edge cells sit exactly where the
    // dome's upper rim sweeps on every nod/chomp. Carve the whole corner
    // band — but ONLY cells the head dome provably covers (same ellipsoid
    // test), so the silhouette cannot change; the carve is sub-surface.
    for (let cx = -2; cx <= 2; cx++) {
      for (let cy = 3; cy <= 4; cy++) {
        for (let cz = -6; cz <= -4; cz++) {
          const dx = cx / 2.7, dy = (cy - 2.4) / 2.2, dz = (cz + 5.4) / 2.4;
          if (dx * dx + dy * dy + dz * dz <= 1) torsoS.map.delete(keyOf(cx, cy, cz));
        }
      }
    }

    // Seam seal: drop dome cells in the rear half whose rim lies outside
    // segment 0's footprint — those slivers poked out of the body flank and
    // visibly slid against it whenever the head reared or bulldozed. The
    // neck is now carried by ring0's own surface and every head rotation
    // happens on sub-surface volume.
    headS.map.forEach((_cell, k) => {
      const x = unpackX(k), y = unpackY(k), z = unpackZ(k);
      if (z < -5.3) return;
      const dx = x / 3.8, dy = (y - 2.7) / 2.7, dz = (z + 4.2) / 1.2;
      if (dx * dx + dy * dy + dz * dz > 0.98) headS.map.delete(k);
    });

    // Hooked jaw chains — five cells each, the two roots buried INSIDE the
    // dome (multi-face contact), then out, forward, and an upturned pale
    // hook. No single-cell nubs anywhere.
    leftArmPivot = [-2, 2, -5.5];
    rightArmPivot = [2, 2, -5.5];
    // chains protrude from the shovel face — every cell is OUTSIDE the dome
    // ellipsoid (the old interior roots shared cells with it and z-fought)
    leftArmS.set(-2, 2, -7, skinDark); // root, face-adjacent to the dome skin
    leftArmS.set(-3, 2, -7, skinDark);
    leftArmS.set(-3, 2, -6, skinDark);
    leftArmS.set(-3, 3, -6, saddle1); // pale hook
    leftArmS.set(-3, 4, -6, skinDark); // upturned point
    leftArmS.set(-2, 3, -7, skinDark); // second root mass
    rightArmS.set(2, 2, -7, skinDark);
    rightArmS.set(3, 2, -7, skinDark);
    rightArmS.set(3, 2, -6, skinDark);
    rightArmS.set(3, 3, -6, saddle1);
    rightArmS.set(3, 4, -6, skinDark);
    rightArmS.set(2, 3, -7, skinDark);

    // Hidden filler exactly at each legs pivot — keeps the leg groups
    // non-empty with zero visible, swingable parts.
    legsAS.set(0, 2, 0, skinDark);
    legsBS.set(0, 2, 0, skinDark);

    // Neck-corner shave, part 2: the ring0 shoulder-top corner cells stand
    // proud beside the dome rim and every jaw swing / head bob grazes them
    // (audit-proven across stun, death and idle). Flanked by the dome rim
    // (±1,4,−5), the dome flank (±2,3,−5) and the body flank (±3,3,−4),
    // their removal reads as a smooth neck crease.
    torsoS.map.delete(keyOf(2, 4, -5));
    torsoS.map.delete(keyOf(-2, 4, -5));
    torsoS.map.delete(keyOf(2, 4, -4));
    torsoS.map.delete(keyOf(-2, 4, -4));
    torsoS.map.delete(keyOf(1, 4, -4));
    torsoS.map.delete(keyOf(-1, 4, -4));
    // Neck-corner shave, part 3: the ring0 y2 corner row interlocks
    // diagonally with the dome's lower rim and the jaw chains — idle
    // pulse/roll closed those diagonals (0.05-0.08 vox). Carve the row
    // (±0..2, 2, −5/−4): every cell is deep-interior (ellipsoid ≤ 0.72)
    // and sealed — the dome overhangs the column from the front, the belly
    // row (y1) from below. The neck now parts cleanly: dome rim at z −5/−6,
    // next body surface at z −3.
    for (const cx of [-2, -1, 0, 1, 2]) {
      torsoS.map.delete(keyOf(cx, 2, -5));
      torsoS.map.delete(keyOf(cx, 2, -4));
    }
    // part 4: the belly's top-front corner row (±1..0, 1, −5) sat diagonal
    // to the dome's lower-front rim — same closure class. Sealed by the
    // belly row (±1..0, 1, −4) behind, flank (±2,1,−5) beside and the
    // chin-front (±1,1,−6) ahead; the dome overhangs it from above.
    for (const cx of [-1, 0, 1]) {
      torsoS.map.delete(keyOf(cx, 1, -5));
    }
    // part 5: the dome's bottom-front cells (±1..0, 1, −4) shared sculpt
    // cells with the belly top — two boxes, one cell, z-fight. The dome
    // provably covers them (same ellipsoid test); the belly row behind and
    // the flank beside seal the void.
    for (const cx of [-1, 0, 1]) {
      const dx = cx / 2.7, dy = (1 - 2.4) / 2.2, dz = (-4 + 5.4) / 2.4;
      if (dx * dx + dy * dy + dz * dz <= 1) torsoS.map.delete(keyOf(cx, 1, -4));
    }

    // NECK-ANCHOR the torso transform: peristalsis (torsoS) scaled about the
    // old body-center pivot swung ring0's neck corner ±0.24 vox into the
    // dome every pulse — the 20-wave "head noclips the body" read. Sculpt
    // keys are absolute world-vox, so RE-ANCHORING the pivot alone moves no
    // geometry: the pulse now travels down the segments while the seam
    // stays still.
    torsoPivot = [0, 4.2, -4.7];

    crownPivot = [0, 6.4, -1];
    maxY = 7;
    } else {
    // lampyris
    legsAS.singleLeg(-3, 2, -3, -5, 4, -4, -7, -5, "#323D2E", "#1B2219");
    legsAS.singleLeg(3, 2, 0, 6, 4, 0, 7, 1, "#323D2E", "#1B2219");
    legsAS.singleLeg(-3, 2, 3, -6, 4, 4, -7, 6, "#323D2E", "#1B2219");

    legsBS.singleLeg(3, 2, -3, 5, 4, -4, 7, -5, "#323D2E", "#1B2219");
    legsBS.singleLeg(-3, 2, 0, -6, 4, 0, -7, 1, "#323D2E", "#1B2219");
    legsBS.singleLeg(3, 2, 3, 6, 4, 4, 7, 6, "#323D2E", "#1B2219");

    // Torso: Radiant glowing lantern abdomen (+1..+8)
    torsoS.ellipsoid(0, 3.6, 4.2, 3.6, 2.1, 4.0, (_x, y, z) => {
      if (y <= 1) return null;
      if (z >= 3) return { hex: y >= 4 ? "#FFF8D1" : "#F0A93B", glow: true };
      return { hex: "#96FFE5", glow: y <= 3 };
    });

    headPivot = [0, 4.2, -4.0];
    torsoPivot = [0, 3.6, 0.0];
    headS.ellipsoid(0, 4.2, -4.6, 3.6, 2.3, 2.6, (x, y, z) => {
      if (y <= 1) return null;
      if (z <= -6 && Math.abs(x) === 2 && y === 4) return { hex: "#96FFE5", glow: true };
      if (Math.abs(x) >= 3 || z <= -6) return { hex: "#F0A93B" };
      if (y >= 5 && Math.abs(x) <= 1) return { hex: "#E06A3B" };
      return { hex: "#1C241A" };
    });
    headS.symLine(1, 5, -7, 3, 7, -9, "#A69470");
    headS.sym(3, 7, -9, "#FFE7A3", true); // glowing antennal clubs
    headS.sym(3, 7, -10, "#A69470");

    // Articulated Left & Right Translucent Wing Covers (Elytra)!
    leftArmPivot = [-1.8, 5.0, 0.5];
    rightArmPivot = [1.8, 5.0, 0.5];

    leftArmS.ellipsoid(-2.4, 5.0, 1.5, 2.2, 1.8, 4.0, (_x, y) => {
      if (y <= 3) return null;
      return { hex: y >= 6 ? "#2E3B2B" : "#1C241A" };
    });
    leftArmS.line(-1.0, 5.2, -1.0, -1.0, 5.2, 4.5, "#D9A443");
    leftArmS.set(-2, 6, 5, "#96FFE5", true); // wing-tip signal lights

    rightArmS.ellipsoid(2.4, 5.0, 1.5, 2.2, 1.8, 4.0, (_x, y) => {
      if (y <= 3) return null;
      return { hex: y >= 6 ? "#2E3B2B" : "#1C241A" };
    });
    rightArmS.line(1.0, 5.2, -1.0, 1.0, 5.2, 4.5, "#D9A443");
    rightArmS.set(2, 6, 5, "#96FFE5", true);

    crownPivot = [0, 8, -2];
    maxY = 8;
  }

  // Star Regalia
  if (star === 2) {
    crownS.set(0, crownPivot[1] + 1, crownPivot[2], "#F0A93B");
    crownS.set(0, crownPivot[1] + 2, crownPivot[2], "#FFF4CC", true);
  } else if (star >= 3) {
    crownS.box(-1, crownPivot[1] + 2, crownPivot[2], 1, crownPivot[1] + 2, crownPivot[2], "#F0A93B");
    crownS.sym(2, crownPivot[1] + 3, crownPivot[2], "#FFF4CC", true);
    crownS.set(0, crownPivot[1] + 4, crownPivot[2], "#FFF4CC", true);
    crownS.set(0, crownPivot[1] + 3, crownPivot[2] - 1, "#F0A93B");
    crownS.set(0, crownPivot[1] + 3, crownPivot[2] + 1, "#F0A93B");
  }

  (globalThis as any).__sculptDebug = { torsoS, headS, leftArmS, rightArmS, legsAS, legsBS };
  return {
    torso: compilePart(torsoS, torsoPivot),
    head: compilePart(headS, headPivot),
    leftArm: leftArmS.map.size > 0 ? compilePart(leftArmS, leftArmPivot) : null,
    rightArm: rightArmS.map.size > 0 ? compilePart(rightArmS, rightArmPivot) : null,
    legsA: compilePart(legsAS, [0, 2, 0]),
    legsB: compilePart(legsBS, [0, 2, 0]),
    crown: crownS.map.size > 0 ? compilePart(crownS, crownPivot) : null,
    height: maxY * V,
    armsOnHead: id !== "dragonfly",
  };
}

const rigCache = new Map<string, CompiledRig>();

export function getCompiledRig(id: string, star = 1): CompiledRig {
  const key = `${id}:${star}`;
  let hit = rigCache.get(key);
  if (!hit) {
    hit = buildRigSculptures(id, star);
    rigCache.set(key, hit);
  }
  return hit;
}

function assemblePartGroup(part: PartGeo, bodyMat: THREE.Material, glowMat: THREE.Material | null): THREE.Group {
  const g = new THREE.Group();
  g.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);

  const bodyMesh = new THREE.Mesh(part.bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  if (part.glowGeo && glowMat) {
    const glowMesh = new THREE.Mesh(part.glowGeo, glowMat);
    glowMesh.renderOrder = 2;
    g.add(glowMesh);
  }
  return g;
}

/**
 * Reparents a limb under the head. The limb geometry is baked relative to its own
 * pivot, so its local offset must be expressed in head space — otherwise the
 * parent's pivot gets applied twice and the limb floats away from the body.
 */
function attachToHead(limb: THREE.Group, headPivot: [number, number, number]) {
  limb.position.set(
    limb.position.x - headPivot[0],
    limb.position.y - headPivot[1],
    limb.position.z - headPivot[2]
  );
  return limb;
}

/**
 * Instantiates an Articulated 3D Voxel Insect Rig with independent
 * Head, Mandibles/Arms, and Alternating Tripod Walking Legs.
 */
const FINISH: Record<string, { roughness: number; metalness: number }> = {
  stag: { roughness: 0.32, metalness: 0.32 }, // glossy lacquered elytra
  bomb: { roughness: 0.46, metalness: 0.18 }, // oiled cobalt carapace
  mantis: { roughness: 0.62, metalness: 0.06 }, // matte leaf chitin
  matriarch: { roughness: 0.55, metalness: 0.16 },
  lampyris: { roughness: 0.5, metalness: 0.1 },
  worm: { roughness: 0.72, metalness: 0.02 }, // damp annelid skin — matte, wet bands carry the shine
  dragonfly: { roughness: 0.38, metalness: 0.25 }, // iridescent dasher carapace
};

/** Shared glow material for every voxel model (see buildVoxelModel). */
const sharedGlowMat = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});
sharedGlowMat.polygonOffset = true;
sharedGlowMat.polygonOffsetFactor = -2;
sharedGlowMat.polygonOffsetUnits = -2;

export function buildVoxelModel(id: string, star = 1): VoxModel {
  const rig = getCompiledRig(id, star);
  const group = new THREE.Group();

  const finish = FINISH[id] ?? { roughness: 0.54, metalness: 0.12 };
  // Star-tier carapace finish: a fresh moult reads glossier, and a 3★ champion
  // carries a warm inner sheen — tiers are readable at a glance mid-battle,
  // beyond the star pips and ground ring. Zero extra GPU cost per frame.
  const tier = star >= 3 ? 2 : star === 2 ? 1 : 0;
  // Metalness is kept nearly stock: a metal finish mirrors whatever light it
  // stands under, and in the prep drawer that is the warm amber lamp — the
  // reason moults looked orange. Tier gloss comes from roughness instead,
  // with only a whisper of emissive sheen on 3-stars.
  const emissiveBase: [number, number, number] = tier === 2 ? [0.045, 0.028, 0.013] : [0, 0, 0];
  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: finish.roughness * (tier === 2 ? 0.8 : tier === 1 ? 0.9 : 1),
    metalness: Math.min(0.6, finish.metalness + (tier === 2 ? 0.04 : tier === 1 ? 0.02 : 0)),
  });
  if (tier === 2) bodyMat.emissive.setRGB(emissiveBase[0], emissiveBase[1], emissiveBase[2]);

  // One glow material shared by every unit and specimen: the configuration
  // is identical for all of them, and sharing removes a material + program
  // switch per rendered part mid-battle. Never disposed (lives for the
  // session); dispose() below only retires the per-model body material.
  const glowMat = sharedGlowMat;

  const torso = assemblePartGroup(rig.torso, bodyMat, glowMat);
  const head = assemblePartGroup(rig.head, bodyMat, glowMat);
  const legsA = assemblePartGroup(rig.legsA, bodyMat, glowMat);
  const legsB = assemblePartGroup(rig.legsB, bodyMat, glowMat);

  const hp = rig.head.pivot;
  const tp = rig.torso.pivot;
  const leftArm = rig.leftArm
    ? assemblePartGroup(rig.leftArm, bodyMat, glowMat)
    : new THREE.Group();
  const rightArm = rig.rightArm
    ? assemblePartGroup(rig.rightArm, bodyMat, glowMat)
    : new THREE.Group();

  // Arms ride under the head by default (mandibles, scythes, clubs — they
  // must track the head's look/bite motion). The dragonfly's WINGS ride under
  // the TORSO instead: wing roots must inherit every body tilt and breath
  // scale exactly, or an independent head bob drags the roots through the
  // thorax shell mid-stroke (the noclip the wing audits kept missing).
  if (rig.armsOnHead === false) {
    leftArm.position.set(
      leftArm.position.x - tp[0],
      leftArm.position.y - tp[1],
      leftArm.position.z - tp[2]
    );
    rightArm.position.set(
      rightArm.position.x - tp[0],
      rightArm.position.y - tp[1],
      rightArm.position.z - tp[2]
    );
    torso.add(leftArm);
    torso.add(rightArm);
  } else {
    attachToHead(leftArm, hp);
    attachToHead(rightArm, hp);
    head.add(leftArm);
    head.add(rightArm);
  }

  const crown = rig.crown
    ? assemblePartGroup(rig.crown, bodyMat, glowMat)
    : new THREE.Group();

  // Hierarchy: root → torso / legsA / legsB / crown, and head → both arms
  // (unless the rig mounts its arms on the torso — see above). Every joint
  // group sits exactly at its sculpt pivot at rest.
  group.add(torso);
  group.add(legsA);
  group.add(legsB);
  group.add(head);
  if (rig.crown) group.add(crown);

  const rest: RigRest = {
    torso: torso.position.clone(),
    head: head.position.clone(),
    leftArm: leftArm.position.clone(),
    rightArm: rightArm.position.clone(),
    legsA: legsA.position.clone(),
    legsB: legsB.position.clone(),
    crown: crown.position.clone(),
  };

  return {
    group,
    torso,
    head,
    leftArm,
    rightArm,
    legsA,
    legsB,
    crown,
    rest,
    bodyMat,
    glowMat,
    emissiveBase,
    height: rig.height,
    species: id,
    star,
    dispose() {
      bodyMat.dispose(); // glowMat is shared — never disposed here
    },
  };
}

/** Pre-warm rigs so battles never compile mid-frame.
 *  All 1★ sculpts (title turntable, totems, prep) build synchronously; the
 *  2★/3★ tiers — only needed once a battle actually starts — are chipped in
 *  ~6ms idle slices afterwards so the title screen paints instantly. */
export function warmVoxelCache() {
  const ids = ["stag", "bomb", "mantis", "dragonfly", "matriarch", "lampyris", "worm"];
  for (const id of ids) getCompiledRig(id, 1);
  const rest: [string, number][] = [];
  for (const id of ids) {
    for (const star of [2, 3]) rest.push([id, star]);
  }
  let i = 0;
  const step = () => {
    const budget = performance.now() + 6;
    while (i < rest.length && performance.now() < budget) {
      getCompiledRig(rest[i][0], rest[i][1]);
      i++;
    }
    if (i < rest.length) window.setTimeout(step, 60);
  };
  window.setTimeout(step, 350);
}

/** Build every (species, star) rig a specific battle needs — synchronously.
 *  Called by ENGAGE with the exact round roster so no sculpt ever compiles
 *  during the pre-roll; usually a no-op thanks to warmVoxelCache(). */
export function warmRoster(units: ReadonlyArray<{ bugId: string; star: number }>) {
  for (const u of units) getCompiledRig(u.bugId, u.star);
}

/** Soft radial dot used by fireflies and ground auras (procedural, no image files) */
export function dotTexture(inner = "rgba(255,240,200,1)", outer = "rgba(255,240,200,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.45, inner.replace(/[\d.]+\)$/, "0.45)"));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
