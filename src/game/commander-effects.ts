import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  LANTERN_INK as opal, LANTERN_LENS, LANTERN_LENS_COLS, LANTERN_LENS_ROWS,
  WORM_INK as chitin, WORM_MAW, WORM_MAW_COLS, WORM_MAW_ROWS,
} from "./commander-motifs";
import { COLS, ROWS, SPARK_LANDING_SECONDS, TRAP_STUN_SECONDS, WAVE_BEATS, type BattleSide, type BattleState, type OracleWave } from "./engine";
import type { CmdId } from "./data";

const SIDES = ["ally", "foe"] as const;
const TAU = 2 * Math.PI;
const RAY_SEGMENTS = 32;
const RAY_SECONDS = 0.96;
const SKY_NDC_Y = 1.045;
const SPARKS = 24;
const THREADS = 8;
const SOUL_FLECKS = 5;
const TRAPS = 4;
const GRIT = 9;
const RAY_MOTES = 12;
const unit = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = unit(v); return k * k * (3 - 2 * k); };
const pulseAge = (wave: OracleWave | null | undefined, time: number) =>
  wave?.lastPulseAt === undefined ? Infinity : Math.max(0, time - wave.lastPulseAt);

function waveCharge(wave: OracleWave | null | undefined, time: number) {
  if (wave?.startAt == null) return 0;
  const nextBeat = WAVE_BEATS[wave.pulses];
  return nextBeat === undefined ? 0 : smooth((time - wave.startAt - nextBeat + 0.38) / 0.38);
}

/** Reflect an existing cast on the stand; none of these cues schedule an event. */
export function commanderBattleSignal(battle: BattleState | null, id: CmdId, side: BattleSide, time: number, openerTime: number) {
  if (!battle) return 0;
  if (id === "worm" && battle.holes.some(hole => hole.owner === side)) {
    const age = Math.max(time, openerTime);
    return smooth(age / 0.24) * (1 - smooth((age - 0.31) / 0.45));
  }
  if (id === "lampyris") {
    const wave = battle.waves[side];
    return Math.max(1 - smooth(pulseAge(wave, time) / 0.65), battle.over ? 0 : 0.66 * waveCharge(wave, time));
  }
  return 0;
}

type UnitAnchor = (uid: number, into: THREE.Vector3) => boolean;
type Frame = {
  battle: BattleState | null;
  time: number;
  openerTime: number;
  ambientTime: number;
  prepMark: number | undefined;
  reduced: boolean;
  potato: boolean;
  anchor: UnitAnchor;
};

/** Refraction wraps a vertical axis without moving the actual sky origin. */
function rayPoint(top: THREE.Vector3, hit: THREE.Vector3, u: number, phase: number, radius: number, out: THREE.Vector3) {
  const a = TAU * 2.15 * u + phase;
  const taper = Math.sin(Math.PI * u) * radius;
  out.lerpVectors(top, hit, u);
  out.x += Math.cos(a) * taper;
  out.z += Math.sin(a) * taper;
}

/** The same shallow, stepped teeth as the bench SVG. */
function mawLip(half: number) {
  const cellX = 0.052, cellZ = 0.063;
  const parts = WORM_MAW.filter(p => p.ink !== "b" && Number(p.y >= WORM_MAW_ROWS / 2) === half).map(({ x, y, ink }) => {
    const h = ink === "t" ? 0.020 : ink === "e" ? 0.032 : 0.039;
    const geo = new THREE.BoxGeometry(cellX, h, cellZ).translate(
      (x + 0.5 - WORM_MAW_COLS / 2) * cellX, h / 2, (y + 0.5 - WORM_MAW_ROWS / 2) * cellZ,
    );
    const c = new THREE.Color(chitin[ink]);
    const rgb = new Float32Array(geo.getAttribute("position").count * 3);
    for (let i = 0; i < rgb.length; i += 3) { rgb[i] = c.r; rgb[i + 1] = c.g; rgb[i + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    return geo;
  });
  const geo = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geo;
}

function lanternPrint() {
  const pixels = new Uint8Array(LANTERN_LENS_COLS * LANTERN_LENS_ROWS * 4);
  for (const { x, y, ink } of LANTERN_LENS) {
    const n = 4 * ((LANTERN_LENS_ROWS - 1 - y) * LANTERN_LENS_COLS + x);
    const rgb = Number.parseInt(opal[ink].slice(1), 16);
    pixels.set([rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff, 255], n);
  }
  const texture = new THREE.DataTexture(pixels, LANTERN_LENS_COLS, LANTERN_LENS_ROWS);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** All geometry is pooled. Transforms and visibility come from real targets, hits and arrivals. */
export function createCommanderEffects(scene: THREE.Scene, camera: THREE.PerspectiveCamera, glowTexture: THREE.Texture) {
  const group = new THREE.Group();
  group.name = "Commander effects";
  scene.add(group);
  const resources: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { resources.push(x); return x; };
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const from = new THREE.Vector3(), to = new THREE.Vector3(), previous = new THREE.Vector3(), point = new THREE.Vector3();
  const diff = new THREE.Vector3(), direction = new THREE.Vector3();
  const viewProjection = new THREE.Matrix4();
  function skyAbove(hit: THREE.Vector3, out: THREE.Vector3) {
    // Solve for an offscreen source at the current zoom and aspect. A fixed
    // height projects onto the rival's stand on some phone layouts.
    camera.updateMatrixWorld();
    const e = viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const clipY = e[1] * hit.x + e[5] * hit.y + e[9] * hit.z + e[13];
    const clipW = e[3] * hit.x + e[7] * hit.y + e[11] * hit.z + e[15];
    const rise = (SKY_NDC_Y * clipW - clipY) / (e[5] - SKY_NDC_Y * e[7]);
    out.copy(hit);
    out.y += Math.max(3.3, rise);
  }
  const pool = (geo: THREE.BufferGeometry, material: THREE.Material, limit: number) => {
    const mesh = track(new THREE.InstancedMesh(geo, material, limit));
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  };
  const ink = (color: THREE.ColorRepresentation, opacity = 1) => track(new THREE.MeshBasicMaterial({ color, opacity, toneMapped: false, transparent: true, depthWrite: false }));
  const glow = (color: THREE.ColorRepresentation) => track(new THREE.SpriteMaterial({ color, map: glowTexture, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  const ringGeo = track(new THREE.RingGeometry(0.88, 1, 8).rotateX(-Math.PI / 2));
  const fineRingGeo = track(new THREE.RingGeometry(0.94, 1, 12).rotateX(-Math.PI / 2));
  const patchGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const tileFrameGeo = track(new THREE.RingGeometry(0.89, 1, 4, 1, Math.PI / 4)
    .rotateX(-Math.PI / 2).scale(Math.SQRT1_2, 1, Math.SQRT1_2));
  const chipGeo = track(new THREE.BoxGeometry(0.047, 0.032, 0.038));
  const flint = track(new THREE.OctahedronGeometry(1));
  const filament = track(new THREE.CylinderGeometry(1, 1, 1, 6));
  const lens = track(lanternPrint());
  const lightTeal = new THREE.Color(opal.e), lightGreen = new THREE.Color(0xb0ffd2);

  // Worm: bevelled soil cut, a hairline split, then the teeth lock into place.
  const lipGeo = [track(mawLip(0)), track(mawLip(1))];
  const lipMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87, emissive: 0x392020, emissiveIntensity: 0.48 }));
  const cut = new THREE.Shape().moveTo(-0.32, -0.08).lineTo(-0.20, -0.25).lineTo(0.20, -0.25)
    .lineTo(0.32, -0.08).lineTo(0.32, 0.15).lineTo(0.21, 0.267).lineTo(-0.21, 0.267).lineTo(-0.32, 0.15);
  const bedGeo = track(new THREE.ShapeGeometry(cut).rotateX(-Math.PI / 2));
  const bedMat = ink(chitin.b, 0.98);
  const edgeMat = ink(chitin.s, 0.95);
  const dust = pool(chipGeo, track(new THREE.MeshStandardMaterial({ color: chitin.m, roughness: 1 })), TRAPS * GRIT);
  const gritOffsets = Array.from({ length: GRIT }, (_, i) => {
    const a = i * 2.39996;
    return { x: Math.cos(a), z: Math.sin(a), height: 0.06 + (i % 4) * 0.028 };
  });
  const traps = Array.from({ length: TRAPS }, () => {
    const root = new THREE.Group();
    root.visible = false;
    group.add(root);
    const rim = new THREE.Mesh(bedGeo, edgeMat);
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.scale.set(0.88, 1, 0.87);
    bed.position.y = 0.002;
    const scoreMat = ink(chitin.r, 0.48);
    const score = new THREE.Mesh(ringGeo, scoreMat);
    score.position.y = 0.004;
    score.scale.set(0.305, 1, 0.235);
    const seamMat = ink(chitin.e);
    const seam = new THREE.Mesh(patchGeo, seamMat);
    seam.position.y = 0.008;
    const lips = lipGeo.map(geo => new THREE.Mesh(geo, lipMat));
    root.add(rim, bed, score, seam, ...lips);
    return { root, lips, scoreMat, seam, seamMat, snap: 0 };
  });

  // Spark: ivory faceted core, amber husk and taper, and separate send/receive seals.
  const souls = pool(flint, ink(opal.w, 0.99), SPARKS);
  const husks = pool(flint, ink(opal.g, 0.57), SPARKS);
  const threads = pool(filament, ink(0xffd798, 0.79), SPARKS * THREADS);
  const sendRings = pool(fineRingGeo, ink(opal.g, 0.70), SPARKS);
  const sendPrints = pool(patchGeo, track(new THREE.MeshBasicMaterial({ map: lens, color: 0xffedcf, opacity: 0.74, transparent: true, depthWrite: false, toneMapped: false })), SPARKS);
  const receiveRings = pool(ringGeo, ink(0xffdfa7, 0.85), SPARKS);
  const receiveEdges = pool(fineRingGeo, ink(opal.w, 0.62), SPARKS);
  const soulFlecks = pool(flint, ink(0xfff2d2, 0.87), SPARKS * SOUL_FLECKS);
  function sparkPoint(k: number, bend: number, into: THREE.Vector3) {
    const p = smooth((k - 0.07) / 0.93);
    into.lerpVectors(from, to, p);
    const arch = Math.sin(Math.PI * p);
    into.y += arch * 0.48;
    into.x += (to.z - from.z) * arch * bend;
    into.z -= (to.x - from.x) * arch * bend;
  }

  // A single prism takes the whole path on the healing tick. The ribbons,
  // moving band and collecting ground light are its follow-through.
  const sleeveGeo = track(new THREE.CylinderGeometry(1, 0.58, 1, 8, 1, true));
  const oracles = SIDES.map(() => {
    const beamMat = ink(opal.e);
    const beam = pool(filament, beamMat, RAY_SEGMENTS * 2);
    const shaftMat = ink(opal.w);
    const shaft = new THREE.Mesh(filament, shaftMat);
    const sleeveMat = ink(opal.e);
    sleeveMat.side = THREE.DoubleSide;
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    const flareMat = glow(opal.e), bandMat = glow(opal.w);
    const flare = new THREE.Sprite(flareMat), band = new THREE.Sprite(bandMat);
    const lensMat = track(new THREE.MeshBasicMaterial({ map: lens, transparent: true, depthWrite: false, toneMapped: false }));
    const sealMat = ink(opal.e), echoMat = ink(opal.c), prismMat = ink(opal.e, 0.85);
    const seal = new THREE.Mesh(ringGeo, sealMat), echo = new THREE.Mesh(fineRingGeo, echoMat);
    const stamp = new THREE.Mesh(patchGeo, lensMat), prism = new THREE.Mesh(flint, prismMat);
    const moteMat = ink(opal.w);
    const motes = pool(flint, moteMat, RAY_MOTES);

    const ward = new THREE.Group();
    const wardMat = ink(opal.e);
    const wardRing = new THREE.Mesh(fineRingGeo, wardMat);
    wardRing.scale.setScalar(0.52);
    const wardPrint = new THREE.Mesh(patchGeo, track(lensMat.clone()));
    wardPrint.position.y = 0.001;
    wardPrint.scale.setScalar(0.43);
    const ticks = Array.from({ length: WAVE_BEATS.length }, (_, i) => {
      const tick = new THREE.Mesh(patchGeo, ink(i === 3 ? lightGreen : opal.w));
      const a = i * Math.PI / 2 + Math.PI / 4;
      tick.position.set(Math.cos(a) * 0.53, 0.003, Math.sin(a) * 0.53);
      tick.rotation.y = -a;
      tick.scale.set(0.108, 1, 0.043);
      return tick;
    });
    ward.add(wardRing, wardPrint, ...ticks);
    ward.visible = false;

    const impactMat = ink(0x8dce8c), frameMat = ink(0xb5e49d), shardMat = ink(0xb8ffb2);
    const impactTiles = pool(patchGeo, impactMat, 9);
    const frames = pool(tileFrameGeo, frameMat, 9);
    const shards = pool(flint, shardMat, 18);
    const cloudMat = track(new THREE.SpriteMaterial({ map: glowTexture, color: 0xa7db91, transparent: true, depthWrite: false, toneMapped: false }));
    const cloud = new THREE.Group();
    const puffs = Array.from({ length: 9 }, (_, i) => {
      const mote = new THREE.Sprite(cloudMat);
      cloud.add(mote);
      return { mote, dx: i % 3 - 1, dz: Math.floor(i / 3) - 1 };
    });
    const transient = [shaft, sleeve, flare, band, seal, echo, stamp, prism, cloud];
    transient.forEach(mesh => { mesh.visible = false; });
    group.add(ward, ...transient);
    return { beam, beamMat, shaft, shaftMat, sleeve, sleeveMat, flare, flareMat, band, bandMat,
      seal, sealMat, echo, echoMat, stamp, lensMat, prism, moteMat, motes, transient,
      ward, wardMat, wardPrint, ticks, impactMat, frameMat, shardMat, impactTiles, frames, shards, cloud, cloudMat, puffs,
      top: new THREE.Vector3(), sample: new THREE.Vector3(), bandProgress: 0, age: 0, charge: 0 };
  });
  type OracleFx = typeof oracles[number];

  const put = (mesh: THREE.InstancedMesh, index: number) => { dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); };
  const commit = (mesh: THREE.InstancedMesh, count: number) => {
    mesh.count = count;
    mesh.visible = count > 0;
    if (count) mesh.instanceMatrix.needsUpdate = true;
  };
  const ground = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, size: number, yaw = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(size);
    put(mesh, index);
  };
  const segment = (mesh: THREE.InstancedMesh, index: number, a: THREE.Vector3, b: THREE.Vector3, width: number) => {
    dummy.position.addVectors(a, b).multiplyScalar(0.5);
    diff.subVectors(b, a);
    const len = diff.length();
    if (len > 0.001) dummy.quaternion.setFromUnitVectors(up, direction.copy(diff).multiplyScalar(1 / len));
    dummy.scale.set(width, len + 0.006, width);
    put(mesh, index);
  };

  function updateTraps({ battle, time, openerTime, reduced, potato }: Frame) {
    let dustCount = 0;
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      const { root, lips, scoreMat, seamMat, seam } = trap;
      const hole = battle?.holes[i];
      root.visible = !!hole && time < TRAP_STUN_SECONDS + (reduced ? 0 : 0.34);
      if (!hole || !root.visible) continue;
      const age = Math.max(time, openerTime) - (i % 2) * 0.065;
      const rise = reduced ? 1 : smooth((age - 0.06) / 0.23);
      const snap = trap.snap = reduced ? 1 : smooth((age - 0.25) / 0.25);
      const release = time - TRAP_STUN_SECONDS;
      const open = reduced ? 0 : smooth((release + 0.19) / 0.29);
      const fold = reduced ? 0 : smooth(release / 0.34);
      const bite = reduced ? 0 : Math.sin(Math.PI * unit((age - 0.36) / 0.22));
      const gap = Math.max(0.003, 0.010 + 0.066 * rise * (1 - snap * (1 - open)) - 0.010 * bite);
      // The rim peeks out from the target's shadow without extending into a second tile.
      const rimZ = hole.y + 0.13;
      root.position.set(hole.x, 0.027 - 0.088 * fold, rimZ);
      root.rotation.y = hole.owner === "foe" ? Math.PI : 0;
      root.scale.set(0.58 + 0.42 * rise, 1, 0.42 + 0.58 * rise);
      scoreMat.opacity = (0.36 + 0.44 * bite) * (1 - 0.8 * fold);
      seam.scale.set(0.35 + 0.13 * (1 - snap), 1, 0.017 + 0.024 * bite);
      seamMat.opacity = (0.25 + 0.68 * bite) * (1 - fold);
      for (let j = 0; j < lips.length; j++) {
        const sign = j === 0 ? -1 : 1;
        lips[j].position.set(0, -0.043 + rise * 0.056 - bite * 0.012, gap * sign);
        lips[j].rotation.x = -sign * (0.06 + (1 - snap + open) * 0.15);
      }
      if (reduced) continue;
      const clearing = release >= 0;
      const dustAge = clearing ? release / 0.33 : (age - 0.33) / 0.52;
      if (dustAge < 0 || dustAge >= 1) continue;
      const count = potato ? 2 : clearing ? 5 : GRIT;
      for (let j = 0; j < count; j++) {
        const c = gritOffsets[j];
        const radius = 0.19 + dustAge * 0.15;
        dummy.position.set(hole.x + c.x * radius, 0.038 + Math.sin(Math.PI * dustAge) * c.height, rimZ + c.z * radius);
        dummy.rotation.set(dustAge * 2.8, i + j, dustAge * 0.72);
        dummy.scale.setScalar((1 - dustAge) * (0.91 + j % 3 * 0.16));
        put(dust, dustCount++);
      }
    }
    commit(dust, dustCount);
  }

  function updateSparks({ battle, time, reduced, potato, anchor }: Frame) {
    let soulCount = 0, trailCount = 0, sending = 0, receiving = 0, flecks = 0;
    for (const spark of battle?.sparks ?? []) {
      if (!anchor(spark.targetUid, to)) continue;
      // Use the authoritative landing flag, not the interpolated flight clock.
      // The receiving halo is there on the very first +HP frame.
      if (spark.landedAt !== undefined) {
        const age = Math.max(0, time - spark.landedAt) / SPARK_LANDING_SECONDS;
        if (age >= 1 || receiving >= SPARKS) continue;
        ground(receiveRings, receiving, to.x, 0.047, to.z, reduced ? 0.53 : 0.50 + smooth(age) * 0.21);
        ground(receiveEdges, receiving++, to.x, 0.051, to.z, reduced ? 0.40 : 0.38 + smooth(age * 2) * 0.14, Math.PI / 8);
        if (!reduced && !potato) for (let j = 0; j < SOUL_FLECKS; j++) {
          const a = TAU * j / SOUL_FLECKS + spark.id;
          const r = 0.48 + age * 0.16;
          dummy.position.set(to.x + Math.cos(a) * r, 0.075 + age * (0.27 + j * 0.012), to.z + Math.sin(a) * r);
          dummy.rotation.set(0, a + age, 0.22);
          dummy.scale.set(0.037, 0.074, 0.037).multiplyScalar(1 - smooth(age));
          put(soulFlecks, flecks++);
        }
        continue;
      }
      if (time > spark.arrivesAt + 0.10 || soulCount >= SPARKS) continue;
      const k = unit((time - spark.startAt) / (spark.arrivesAt - spark.startAt));
      if ((reduced || k < 0.76) && sending < SPARKS) {
        ground(sendRings, sending, spark.x, 0.042, spark.y, reduced ? 0.29 : 0.34 - 0.15 * smooth(k));
        ground(sendPrints, sending++, spark.x, 0.044, spark.y, reduced ? 0.31 : 0.36 - k * 0.21);
      }
      from.set(spark.x, 0.22, spark.y);
      const bend = (spark.id % 2 ? -1 : 1) * Math.min(0.21, 0.27 / Math.max(0.01, from.distanceTo(to)));
      if (reduced) dummy.position.copy(from);
      else sparkPoint(k, bend, dummy.position);
      dummy.rotation.set(reduced ? 0 : 0.33, reduced ? 0 : k * 6, 0);
      const wind = reduced ? 1 : 0.60 + 0.40 * smooth(k / 0.24);
      dummy.scale.set(0.082, 0.132, 0.082).multiplyScalar(wind);
      put(souls, soulCount);
      dummy.scale.multiplyScalar(1.56);
      put(husks, soulCount++);
      if (reduced || k < 0.09) continue;
      previous.copy(dummy.position);
      const pieces = potato ? 3 : THREADS;
      for (let i = 1; i <= pieces; i++) {
        const trail = Math.max(0.07, k - i * 0.48 / pieces);
        sparkPoint(trail, bend, point);
        segment(threads, trailCount++, previous, point, 0.032 * (1 - i / (pieces + 1)) + 0.005);
        previous.copy(point);
        if (trail <= 0.07) break;
      }
    }
    commit(souls, soulCount);
    commit(husks, soulCount);
    commit(threads, trailCount);
    commit(sendRings, sending);
    commit(sendPrints, sending);
    commit(receiveRings, receiving);
    commit(receiveEdges, receiving);
    commit(soulFlecks, flecks);
  }

  function updateMark(fx: OracleFx, wave: OracleWave | null | undefined, mark: number | undefined, frame: Frame) {
    const { reduced, potato, ambientTime, time, anchor } = frame;
    const uid = wave?.uid ?? mark;
    fx.ward.visible = uid !== undefined && (wave?.pulses ?? 0) < WAVE_BEATS.length && anchor(uid, to);
    fx.charge = fx.ward.visible && !frame.battle?.over ? waveCharge(wave, time) : 0;
    if (!fx.ward.visible) return;
    const idle = reduced ? 0 : 0.5 + 0.5 * Math.sin(ambientTime * 3.8);
    fx.ward.position.set(to.x, 0.036, to.z);
    fx.ward.scale.setScalar(reduced ? 1 : 1 + 0.09 * fx.charge);
    fx.wardMat.opacity = 0.63 + 0.07 * idle + 0.25 * fx.charge;
    fx.wardPrint.visible = !potato;
    fx.wardPrint.material.opacity = 0.34 + 0.15 * idle + 0.26 * fx.charge;
    for (let i = 0; i < fx.ticks.length; i++) {
      fx.ticks[i].material.opacity = (wave?.pulses ?? 0) > i ? 0.94 : 0.40 + 0.50 * fx.charge;
    }
  }

  function drawRay(fx: OracleFx, wave: OracleWave, age: number, { reduced, potato }: Frame) {
    skyAbove(to, from);
    fx.top.copy(from);
    const fade = 1 - smooth(age / RAY_SECONDS);
    const hit = reduced ? 0.62 : Math.exp(-age * 6.4);
    const final = wave.pulses === WAVE_BEATS.length;
    const phase = reduced ? 0 : -age * 10.5 - wave.pulses * 0.87;
    const radius = reduced ? 0.142 : 0.18 + hit * 0.083;
    const n = potato ? 18 : RAY_SEGMENTS;
    rayPoint(from, to, 0.5, phase, radius, fx.sample);
    let count = 0;
    for (let strand = 0; strand < (potato || reduced ? 1 : 2); strand++) {
      previous.copy(from);
      for (let j = 1; j <= n; j++) {
        const u = j / n;
        rayPoint(from, to, u, phase + Math.PI * strand, radius * (strand ? 0.83 : 1), point);
        segment(fx.beam, count++, previous, point, (strand ? 0.012 : 0.021) + hit * 0.012 * Math.sin(Math.PI * u));
        previous.copy(point);
      }
    }
    commit(fx.beam, count);
    fx.beamMat.color.copy(final ? lightGreen : lightTeal);
    fx.beamMat.opacity = (0.55 + hit * 0.39) * fade;
    fx.shaft.visible = fx.flare.visible = fx.seal.visible = true;
    fx.shaft.position.copy(from).lerp(to, 0.5);
    const core = 0.022 + hit * (final ? 0.029 : 0.019);
    fx.shaft.scale.set(core, from.y - to.y, core);
    fx.shaftMat.opacity = (0.64 + hit * 0.33) * fade;
    fx.sleeve.visible = !potato;
    fx.sleeve.position.copy(fx.shaft.position);
    const width = 0.12 + hit * (final ? 0.143 : 0.10);
    fx.sleeve.scale.set(width, fx.shaft.scale.y, width);
    fx.sleeve.rotation.y = phase * 0.28;
    fx.sleeveMat.color.copy(fx.beamMat.color);
    fx.sleeveMat.opacity = (0.10 + hit * 0.14) * fade;
    fx.flare.position.copy(to);
    fx.flare.scale.setScalar(0.43 + hit * 0.37);
    fx.flareMat.color.copy(fx.beamMat.color);
    fx.flareMat.opacity = (0.48 + hit * 0.46) * fade;
    fx.seal.position.set(to.x, 0.057, to.z);
    fx.seal.scale.setScalar(reduced ? 0.57 : 0.44 + smooth(age / 0.56) * 0.24);
    fx.sealMat.color.copy(fx.beamMat.color);
    fx.sealMat.opacity = 0.92 * fade;
    fx.echo.visible = !reduced && !potato;
    fx.echo.position.set(to.x, 0.048, to.z);
    fx.echo.scale.setScalar(0.55 + smooth(age / 0.72) * 0.41);
    fx.echoMat.opacity = (0.71 - 0.36 * smooth(age / 0.57)) * fade;
    fx.stamp.visible = !potato;
    fx.stamp.position.set(to.x, 0.039, to.z);
    fx.stamp.scale.setScalar(reduced ? 0.62 : 0.52 + 0.13 * smooth(age / 0.34));
    fx.lensMat.opacity = 0.84 * fade;
    fx.bandProgress = reduced ? 1 : smooth(age / 0.56);
    if (!reduced && !potato && fx.bandProgress < 1) {
      fx.band.visible = fx.prism.visible = true;
      fx.band.position.copy(from).lerp(to, fx.bandProgress);
      fx.band.scale.set(0.66, 0.32 + hit * 0.18, 1);
      fx.bandMat.opacity = 0.81 * (1 - fx.bandProgress * 0.64);
      fx.prism.position.copy(fx.band.position);
      fx.prism.scale.set(0.158, 0.11 + hit * 0.043, 0.158);
      fx.prism.rotation.y = phase;
    }
    if (!reduced && !potato) {
      let motes = 0;
      fx.moteMat.opacity = 0.91 * fade;
      for (let i = 0; i < RAY_MOTES; i++) {
        const t = unit((age + 0.07 - (i % 4) * 0.037) / 0.67);
        if (t <= 0 || t >= 1) continue;
        const a = i * 2.39996 + t * 1.28;
        const r = 0.30 + 0.27 * Math.sin(Math.PI * t);
        dummy.position.set(to.x + Math.cos(a) * r, 0.09 + t * (0.56 + i % 3 * 0.14), to.z + Math.sin(a) * r);
        dummy.rotation.set(0, a, Math.PI / 6 * t);
        dummy.scale.set(0.031, 0.050, 0.031).multiplyScalar(1 - t * 0.63);
        put(fx.motes, motes++);
      }
      commit(fx.motes, motes);
    }
  }

  function drawImpact(fx: OracleFx, impact: NonNullable<OracleWave["impact"]>, age: number, { reduced, potato }: Frame) {
    const { x, y } = impact;
    const fade = 1 - smooth(age / 1.16);
    const strength = reduced ? 0.79 : 1 - 0.53 * smooth(age / 0.46);
    fx.impactMat.opacity = (0.12 + 0.21 * strength) * fade;
    fx.frameMat.opacity = (0.25 + 0.56 * strength) * fade;
    fx.cloud.visible = !potato;
    fx.cloudMat.opacity = (reduced ? 0.31 : 0.76) * fade;
    fx.shardMat.opacity = 0.88 * fade;
    let tiles = 0, shards = 0;
    for (const { mote, dx, dz } of fx.puffs) {
      const tx = x + dx, tz = y + dz;
      const inside = tx > 0 && tx < COLS && tz > 0 && tz < ROWS;
      mote.visible = inside && !potato;
      if (!inside) continue;
      ground(fx.impactTiles, tiles, tx, 0.023, tz, 0.92);
      ground(fx.frames, tiles++, tx, 0.031, tz, 0.93);
      // The entire actual footprint lights up at once. Only the crystals and
      // afterglow fan out in order from the centre.
      const t = reduced ? 0.3 : unit((age + 0.08 - Math.hypot(dx, dz) * 0.093) / 0.65);
      mote.visible &&= t > 0;
      const size = 0.46 + t * 0.32;
      mote.position.set(tx + dx * t * 0.07, 0.12 + t * 0.23, tz + dz * t * 0.07);
      mote.scale.set(size, size * 0.80, 1);
      if (reduced || potato || t <= 0 || t >= 1) continue;
      for (let i = 0; i < 2; i++) {
        const dir = i ? -1 : 1;
        const up = Math.sin(Math.PI * t);
        dummy.position.set(tx + dir * (0.15 + t * 0.12), 0.073 + up * (i ? 0.16 : 0.22), tz + dir * 0.19);
        dummy.rotation.set(dir * 0.39, t * 3.2 + dx, -dir * 0.3);
        dummy.scale.set(0.044, 0.14, 0.044).multiplyScalar(0.32 + up * 0.68);
        put(fx.shards, shards++);
      }
    }
    commit(fx.impactTiles, tiles);
    commit(fx.frames, tiles);
    commit(fx.shards, shards);
  }

  function update(frame: Frame) {
    updateTraps(frame);
    updateSparks(frame);
    const { battle, time, anchor, prepMark } = frame;
    for (let i = 0; i < SIDES.length; i++) {
      const fx = oracles[i], wave = battle?.waves[SIDES[i]];
      fx.transient.forEach(mesh => { mesh.visible = false; });
      commit(fx.beam, 0);
      commit(fx.motes, 0);
      commit(fx.impactTiles, 0);
      commit(fx.frames, 0);
      commit(fx.shards, 0);
      updateMark(fx, wave, i === 0 && !battle ? prepMark : undefined, frame);
      const age = fx.age = pulseAge(wave, time);
      // Interpolation can lag the engine. Never postpone the first visible
      // ray just because its position is being sampled between sim ticks.
      if (wave && age < RAY_SECONDS && anchor(wave.uid, to)) drawRay(fx, wave, age, frame);
      if (wave?.impact) {
        const impactAge = Math.max(0, time - wave.impact.at);
        if (impactAge < 1.16) drawImpact(fx, wave.impact, impactAge, frame);
      }
    }
  }

  const inspectBox = new THREE.Box3(), inspectSize = new THREE.Vector3();
  return {
    update,
    inspect: () => ({
      traps: traps.filter(({ root }) => root.visible).length, debris: dust.count,
      trapMeasures: traps.flatMap(({ root, lips, snap }) => root.visible ? [{
        size: inspectBox.setFromObject(root).getSize(inspectSize).toArray(), gap: lips[1].position.z - lips[0].position.z, snap,
      }] : []),
      souls: souls.count, threads: threads.count, departureRings: sendRings.count, landingRings: receiveRings.count, landingFlecks: soulFlecks.count,
      marks: oracles.filter(({ ward }) => ward.visible).length,
      charges: oracles.map(({ charge }) => charge),
      rays: oracles.filter(({ beam }) => beam.count > 0).length,
      rayAxes: oracles.map(({ beam, top, flare, sample, shaft, sleeve, motes, bandProgress, age }) => beam.count ? {
        top: top.toArray(), sourceNdcY: point.copy(top).project(camera).y,
        hit: flare.position.toArray(), middle: sample.toArray(), segments: beam.count,
        leadY: shaft.position.y - shaft.scale.y / 2, bandProgress, age, prismWidth: sleeve.visible ? sleeve.scale.x : 0, motes: motes.count,
      } : null),
      smoke: oracles.filter(({ cloud }) => cloud.visible).length,
      impactTiles: oracles.map(({ impactTiles }) => impactTiles.count),
    }),
    dispose: () => { scene.remove(group); resources.forEach(x => x.dispose()); },
  };
}
