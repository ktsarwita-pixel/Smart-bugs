import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LANTERN_INK as opal, WORM_INK as chitin, WORM_MAW, WORM_MAW_COLS, WORM_MAW_ROWS } from "./commander-motifs";
import { COLS, ROWS, SPARK_LANDING_SECONDS, TRAP_STUN_SECONDS, type BattleState } from "./engine";

const SIDES = ["ally", "foe"] as const;
const TAU = 2 * Math.PI;
const RAY_SEGMENTS = 32;
const RAY_SECONDS = 0.9;
const SKY_NDC_Y = 1.04;
const SPARKS = 24;
const THREADS = 7;
const GRIT = 6;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const unit = (v: number) => clamp(v, 0, 1);
const smooth = (v: number) => { const k = unit(v); return k * k * (3 - 2 * k); };

type UnitAnchor = (uid: number, into: THREE.Vector3) => boolean;

/** The sine/cosine refraction stays centered on an axis straight down from the sky. */
function rayPoint(top: THREE.Vector3, hit: THREE.Vector3, u: number, phase: number, radius: number, out: THREE.Vector3) {
  const a = TAU * 2.15 * u + phase;
  const taper = Math.sin(Math.PI * u) * radius;
  out.lerpVectors(top, hit, u);
  out.x += Math.cos(a) * taper;
  out.z += Math.sin(a) * taper;
}

/** From the same stepped pixels as the bench SVG. Shallow ledges, not protruding cones. */
function mawLip(half: number) {
  const cellX = 0.051, cellZ = 0.071;
  const parts = WORM_MAW.filter(p => p.ink !== "b" && Number(p.y >= WORM_MAW_ROWS / 2) === half).map(({ x, y, ink }) => {
    const h = ink === "t" ? 0.018 : ink === "e" ? 0.032 : 0.038;
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

/** Pooled commander visuals, driven by the actual battle events. */
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
    // Project past the top edge, even on a close zoom. A world-space source
    // high above the target can otherwise read as the rival commander.
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
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  };
  const ink = (color: THREE.ColorRepresentation, opacity = 1) => track(new THREE.MeshBasicMaterial({ color, opacity, toneMapped: false, transparent: true, depthWrite: false }));
  const glow = (color: THREE.ColorRepresentation) => track(new THREE.SpriteMaterial({ color, map: glowTexture, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  const ringGeo = track(new THREE.RingGeometry(0.93, 1, 12).rotateX(-Math.PI / 2));
  const patchGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const chipGeo = track(new THREE.BoxGeometry(0.041, 0.027, 0.036));
  const flint = track(new THREE.OctahedronGeometry(1));
  const filament = track(new THREE.CylinderGeometry(1, 1, 1, 5));

  // Trap holes: a dark seam parts, its serrated lips meet, then fold away.
  const lipGeo = [track(mawLip(0)), track(mawLip(1))];
  const lipMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, emissive: 0x13090e, emissiveIntensity: 0.45 }));
  const soil = new THREE.Shape().moveTo(-0.28, -0.09).lineTo(-0.17, -0.242).lineTo(0.16, -0.242)
    .lineTo(0.28, -0.09).lineTo(0.28, 0.15).lineTo(0.18, 0.243).lineTo(-0.17, 0.243).lineTo(-0.28, 0.15);
  const bedGeo = track(new THREE.ShapeGeometry(soil).rotateX(-Math.PI / 2));
  const bedMat = ink(chitin.b, 0.95);
  const dust = pool(chipGeo, track(new THREE.MeshStandardMaterial({ color: chitin.d, roughness: 1 })), 4 * GRIT);
  const traps = Array.from({ length: 4 }, () => {
    const root = new THREE.Group();
    root.visible = false;
    group.add(root);
    const bed = new THREE.Mesh(bedGeo, bedMat);
    const lips = lipGeo.map(geo => new THREE.Mesh(geo, lipMat));
    const scoreMat = ink(chitin.r, 0.3);
    const score = new THREE.Mesh(ringGeo, scoreMat);
    score.position.y = 0.002;
    score.scale.set(0.31, 1, 0.27);
    root.add(bed, score, ...lips);
    return { root, lips, scoreMat };
  });
  const gritOffsets = Array.from({ length: GRIT }, (_, i) => {
    const a = i * 2.39996;
    return { x: Math.cos(a), z: Math.sin(a), height: 0.055 + (i % 3) * 0.025 };
  });

  // Last Spark: a sliver of the Lantern's opal, with a fine taper to show direction.
  const souls = pool(flint, ink(opal.w, 0.92), SPARKS);
  const threads = pool(filament, ink(opal.e, 0.63), SPARKS * THREADS);
  const sendRings = pool(ringGeo, ink(opal.e, 0.46), SPARKS);
  const receiveRings = pool(ringGeo, ink(opal.w, 0.76), SPARKS);
  function sparkPoint(k: number, reduced: boolean, into: THREE.Vector3) {
    into.lerpVectors(from, to, k);
    if (!reduced) into.y += Math.sin(Math.PI * k) * 0.31;
  }

  // Each actual heal lights the whole narrow shaft immediately. A dimmer
  // refraction and a travelling band follow it, not the other way around.
  const oracles = SIDES.map(() => {
    const beamMat = ink(opal.e);
    const beam = pool(filament, beamMat, RAY_SEGMENTS * 2);
    const shaftMat = ink(opal.w);
    shaftMat.blending = THREE.AdditiveBlending;
    const shaft = new THREE.Mesh(filament, shaftMat);
    const flareMat = glow(opal.e);
    const flare = new THREE.Sprite(flareMat);
    const bandMat = glow(opal.w);
    const band = new THREE.Sprite(bandMat);
    const sealMat = ink(opal.e);
    const seal = new THREE.Mesh(ringGeo, sealMat);
    const patchMat = ink(0x84bd77);
    const patch = new THREE.Mesh(patchGeo, patchMat);
    const cornerMat = ink(0xa6d08f);
    const cornerGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    const corners = Array.from({ length: 8 }, () => new THREE.Mesh(cornerGeo, cornerMat));
    const cloudMat = track(new THREE.SpriteMaterial({ map: glowTexture, color: 0x9acb89, transparent: true, depthWrite: false, toneMapped: false }));
    const cloud = new THREE.Group();
    const puffs = Array.from({ length: 9 }, (_, i) => {
      const mote = new THREE.Sprite(cloudMat);
      cloud.add(mote);
      return { mote, dx: i % 3 - 1, dz: Math.floor(i / 3) - 1, drift: i % 2 ? -1 : 1 };
    });
    shaft.visible = flare.visible = band.visible = seal.visible = patch.visible = cloud.visible = false;
    corners.forEach(mesh => { mesh.visible = false; });
    group.add(shaft, flare, band, seal, patch, cloud, ...corners);
    return { beam, beamMat, shaft, shaftMat, flare, flareMat, band, bandMat, seal, sealMat, patch, patchMat, corners, cornerMat,
      cloud, cloudMat, puffs, top: new THREE.Vector3(), sample: new THREE.Vector3(), bandProgress: 0, age: 0 };
  });

  const put = (mesh: THREE.InstancedMesh, index: number) => { dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); };
  const commit = (mesh: THREE.InstancedMesh, count: number) => {
    mesh.count = count;
    if (count) mesh.instanceMatrix.needsUpdate = true;
  };
  const imprint = (mesh: THREE.InstancedMesh, index: number, x: number, z: number, radius: number) => {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, 0.041, z);
    dummy.scale.setScalar(radius);
    put(mesh, index);
  };
  const segment = (mesh: THREE.InstancedMesh, index: number, a: THREE.Vector3, b: THREE.Vector3, width: number) => {
    dummy.position.addVectors(a, b).multiplyScalar(0.5);
    diff.subVectors(b, a);
    const len = diff.length();
    if (len > 0.001) dummy.quaternion.setFromUnitVectors(up, direction.copy(diff).multiplyScalar(1 / len));
    dummy.scale.set(width, len + 0.005, width);
    put(mesh, index);
  };

  function update(battle: BattleState | null, time: number, openerTime: number, reduced: boolean, potato: boolean, anchor: UnitAnchor) {
    let dustCount = 0;
    for (let i = 0; i < traps.length; i++) {
      const { root, lips, scoreMat } = traps[i];
      const hole = battle?.holes[i];
      root.visible = !!hole && time < TRAP_STUN_SECONDS + 0.35;
      if (!hole || !root.visible) continue;
      // The seat opens in preroll, while release follows the actual stun.
      const age = Math.max(time, openerTime);
      const rise = reduced ? 1 : smooth((age - 0.04) / 0.27);
      const snap = reduced ? 1 : smooth((age - 0.24) / 0.33);
      const open = reduced ? 0 : smooth((time - TRAP_STUN_SECONDS + 0.22) / 0.28);
      const fold = reduced ? 0 : smooth((time - TRAP_STUN_SECONDS) / 0.35);
      const gap = 0.005 + 0.045 * (1 - snap * (1 - open));
      const size = 0.86 + 0.14 * rise;
      // The front edge peeks out from the specimen's shadow. Keep the whole
      // cut within its tile, even when the jaws part.
      const rimZ = hole.y + 0.16;
      root.position.set(hole.x, 0.025 - 0.09 * fold, rimZ);
      root.rotation.y = hole.owner === "foe" ? Math.PI : 0;
      root.scale.set(size, 1, size);
      scoreMat.opacity = (0.19 + 0.25 * snap) * (1 - 0.8 * fold);
      for (let j = 0; j < lips.length; j++) {
        const sign = j === 0 ? -1 : 1;
        lips[j].position.set(0, -0.046 + rise * 0.052, gap * sign);
        lips[j].rotation.x = -sign * (0.045 + open * 0.10);
      }
      if (reduced || age < 0.21 || age >= 0.78) continue;
      const dustAge = unit((age - 0.21) / 0.57);
      for (let j = 0; j < (potato ? 2 : GRIT); j++) {
        const c = gritOffsets[j];
        const radius = 0.19 + dustAge * 0.145;
        dummy.position.set(hole.x + c.x * radius, 0.037 + Math.sin(Math.PI * dustAge) * c.height, rimZ + c.z * radius);
        dummy.rotation.set(dustAge * 1.8, i + j, dustAge * 0.7);
        dummy.scale.setScalar((1 - dustAge) * (0.91 + j % 3 * 0.13));
        put(dust, dustCount++);
      }
    }
    commit(dust, dustCount);

    let soulCount = 0, trailCount = 0, sending = 0, receiving = 0;
    for (const spark of battle?.sparks ?? []) {
      if (time < spark.startAt || !anchor(spark.targetUid, to)) continue;
      if (spark.landedAt !== undefined && time >= spark.landedAt) {
        const age = (time - spark.landedAt) / SPARK_LANDING_SECONDS;
        if (age < 1 && receiving < SPARKS) imprint(receiveRings, receiving++, to.x, to.z, reduced ? 0.48 : 0.39 + smooth(age) * 0.20);
        continue;
      }
      if (time > spark.arrivesAt + 0.10 || soulCount >= SPARKS) continue;
      const k = unit((time - spark.startAt) / (spark.arrivesAt - spark.startAt));
      if (!reduced && k < 0.69 && sending < SPARKS) imprint(sendRings, sending++, spark.x, spark.y, 0.21 + k * 0.34);
      from.set(spark.x, 0.22, spark.y);
      sparkPoint(k, reduced, dummy.position);
      dummy.rotation.set(reduced ? 0 : 0.33, reduced ? 0 : k * 2.8, 0);
      dummy.scale.set(0.052, 0.088, 0.052);
      put(souls, soulCount++);
      if (reduced) continue;
      previous.copy(dummy.position);
      const pieces = potato ? 3 : THREADS;
      for (let i = 1; i <= pieces; i++) {
        const trail = Math.max(0, k - i * 0.50 / pieces);
        sparkPoint(trail, false, point);
        segment(threads, trailCount++, previous, point, 0.025 * (1 - i / (pieces + 1)) + 0.004);
        previous.copy(point);
        if (trail === 0) break;
      }
    }
    commit(souls, soulCount);
    commit(threads, trailCount);
    commit(sendRings, sending);
    commit(receiveRings, receiving);

    for (let i = 0; i < SIDES.length; i++) {
      const fx = oracles[i], wave = battle?.waves[SIDES[i]];
      fx.beam.count = 0;
      fx.shaft.visible = fx.flare.visible = fx.band.visible = fx.seal.visible = fx.patch.visible = fx.cloud.visible = false;
      fx.corners.forEach(mesh => { mesh.visible = false; });
      if (wave?.lastPulseAt === undefined) continue;
      // Visual position interpolation may lag by a tick. The heal itself and
      // its full initial light show in the same frame as the new HP value.
      const age = fx.age = Math.max(0, time - wave.lastPulseAt);
      if (age < RAY_SECONDS && anchor(wave.uid, to)) {
        skyAbove(to, from);
        fx.top.copy(from);
        const fade = 1 - smooth(age / RAY_SECONDS);
        const hit = reduced ? 0.47 : Math.exp(-age * 6.6);
        const phase = reduced ? 0 : -age * 9.5 - wave.pulses * 0.83;
        const n = potato ? 18 : RAY_SEGMENTS;
        const radius = reduced ? 0.115 : 0.155 + hit * 0.07;
        rayPoint(from, to, 0.5, phase, radius, fx.sample);
        let count = 0;
        for (let strand = 0; strand < (potato || reduced ? 1 : 2); strand++) {
          previous.copy(from);
          for (let j = 1; j <= n; j++) {
            const u = j / n;
            rayPoint(from, to, u, phase + Math.PI * strand, radius * (strand ? .74 : 1), point);
            segment(fx.beam, count++, previous, point, (strand ? 0.008 : 0.014) + hit * 0.005 * Math.sin(Math.PI * u));
            previous.copy(point);
          }
        }
        commit(fx.beam, count);
        fx.beamMat.opacity = (0.39 + hit * 0.34) * fade;
        fx.shaft.visible = fx.flare.visible = fx.seal.visible = true;
        fx.shaft.position.copy(from).lerp(to, 0.5);
        fx.shaft.scale.set(0.018 + hit * 0.012, from.y - to.y, 0.018 + hit * 0.012);
        fx.shaftMat.opacity = (0.43 + hit * 0.44) * fade;
        fx.flare.position.copy(to);
        fx.flare.scale.setScalar(0.25 + hit * 0.17);
        fx.flareMat.opacity = (0.36 + hit * 0.26) * fade;
        fx.seal.position.set(to.x, 0.05, to.z);
        fx.seal.scale.setScalar(reduced ? 0.52 : 0.35 + smooth(age / 0.57) * 0.28);
        fx.sealMat.opacity = 0.82 * fade;
        fx.bandProgress = reduced ? 1 : smooth(age / 0.48);
        if (!reduced && !potato && fx.bandProgress < 1) {
          fx.band.visible = true;
          fx.band.position.copy(from).lerp(to, fx.bandProgress);
          fx.band.scale.set(0.30, 0.16 + hit * 0.09, 1);
          fx.bandMat.opacity = 0.62 * (1 - fx.bandProgress * 0.6);
        }
      }
      const impact = wave.impact;
      if (!impact || age >= 1.10) continue;
      const { x, y } = impact;
      const x1 = Math.max(0, x - 1.5), x2 = Math.min(COLS, x + 1.5);
      const z1 = Math.max(0, y - 1.5), z2 = Math.min(ROWS, y + 1.5);
      const fade = 1 - smooth(age / 1.10);
      fx.patch.visible = fx.cloud.visible = true;
      fx.patch.position.set((x1 + x2) / 2, 0.022, (z1 + z2) / 2);
      fx.patch.scale.set(x2 - x1, 1, z2 - z1);
      fx.patchMat.opacity = 0.13 * fade;
      // Inset corner marks describe the actual clipped tile footprint.
      const len = reduced ? 0.32 : 0.16 + smooth(age / 0.42) * 0.18;
      fx.cornerMat.opacity = 0.62 * fade;
      for (let c = 0; c < 4; c++) {
        const sx = c % 2 ? -1 : 1, sz = c >= 2 ? -1 : 1;
        const px = sx > 0 ? x1 + 0.034 : x2 - 0.034, pz = sz > 0 ? z1 + 0.034 : z2 - 0.034;
        const cross = fx.corners[c * 2], upright = fx.corners[c * 2 + 1];
        cross.visible = upright.visible = true;
        cross.position.set(px + sx * len / 2, 0.035, pz);
        upright.position.set(px, 0.035, pz + sz * len / 2);
        cross.scale.set(len, 1, 0.027);
        upright.scale.set(0.027, 1, len);
      }
      fx.cloudMat.opacity = 0.49 * fade;
      for (let p = 0; p < fx.puffs.length; p++) {
        const { mote, dx, dz, drift } = fx.puffs[p];
        const at = reduced ? 1 : smooth((age - Math.hypot(dx, dz) * 0.088) / 0.55);
        const tx = x + dx, tz = y + dz;
        mote.visible = tx > x1 && tx < x2 && tz > z1 && tz < z2 && (!potato || p % 2 === 0) && at > 0;
        if (!mote.visible) continue;
        const width = 0.36 + at * 0.27;
        mote.position.set(tx + at * drift * 0.12, 0.10 + at * 0.21, tz + at * dx * 0.12);
        mote.scale.set(width, width * 0.73, 1);
      }
    }
  }

  const inspectBox = new THREE.Box3(), inspectSize = new THREE.Vector3();
  return {
    update,
    inspect: () => ({
      traps: traps.filter(({ root }) => root.visible).length, debris: dust.count,
      trapMeasures: traps.flatMap(({ root, lips }) => root.visible ? [{
        size: inspectBox.setFromObject(root).getSize(inspectSize).toArray(), gap: lips[1].position.z - lips[0].position.z,
      }] : []),
      souls: souls.count, threads: threads.count, departureRings: sendRings.count, landingRings: receiveRings.count,
      rays: oracles.filter(({ beam }) => beam.count > 0).length,
      rayAxes: oracles.map(({ beam, top, flare, sample, shaft, bandProgress, age }) => beam.count ? {
        top: top.toArray(), sourceNdcY: point.copy(top).project(camera).y,
        hit: flare.position.toArray(), middle: sample.toArray(), segments: beam.count,
        leadY: shaft.position.y - shaft.scale.y / 2, bandProgress, age,
      } : null),
      smoke: oracles.filter(({ cloud }) => cloud.visible).length,
    }),
    dispose: () => { scene.remove(group); resources.forEach((x) => x.dispose()); },
  };
}
