import * as THREE from "three";
import { COLS, ROWS, SPARK_LANDING_SECONDS, TRAP_STUN_SECONDS, WAVE_BEATS, type BattleState } from "./engine";

const SIDES = ["ally", "foe"] as const;
const SEGMENTS = 30;
const MIN_SKY_HEIGHT = 3.3;
const SKY_NDC_Y = 1.04; // start just outside the top of the drawer
const SPARKS = 24;
const PUFFS = 18;
const CLUMPS = 9;
const TAU = 2 * Math.PI;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const unit = (v: number) => clamp(v, 0, 1);
const smooth = (v: number) => { const k = unit(v); return k * k * (3 - 2 * k); };

type UnitAnchor = (uid: number, into: THREE.Vector3) => boolean;

/** A top-to-bottom spiral in the horizontal plane: sin and cos never change
 * the vertical axis or drift either end toward a commander model. */
function rayPoint(top: THREE.Vector3, hit: THREE.Vector3, u: number, phase: number, width: number, out: THREE.Vector3) {
  const a = TAU * 1.85 * u + phase;
  const spread = Math.sin(Math.PI * u) * width;
  out.lerpVectors(top, hit, u);
  out.x += Math.cos(a) * spread;
  out.z += Math.sin(a) * spread;
}

/** Commander meshes are pooled and driven by simulation events, not by damage heuristics. */
export function createCommanderEffects(scene: THREE.Scene, camera: THREE.PerspectiveCamera, glowTexture: THREE.Texture) {
  const group = new THREE.Group();
  group.name = "Commander effects";
  scene.add(group);
  const resources: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { resources.push(x); return x; };
  const up = new THREE.Vector3(0, 1, 0);
  const dummy = new THREE.Object3D();
  const from = new THREE.Vector3(), to = new THREE.Vector3(), previous = new THREE.Vector3(), point = new THREE.Vector3();
  const diff = new THREE.Vector3(), direction = new THREE.Vector3();
  const viewProjection = new THREE.Matrix4();
  function skyAbove(hit: THREE.Vector3, out: THREE.Vector3) {
    // A point can be high in world space but line up with a far-away bug in
    // the isometric view. Lift the source past the top edge at any zoom so
    // the ray visibly enters from the sky, not from someone else's model.
    camera.updateMatrixWorld();
    const e = viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const clipY = e[1] * hit.x + e[5] * hit.y + e[9] * hit.z + e[13];
    const clipW = e[3] * hit.x + e[7] * hit.y + e[11] * hit.z + e[15];
    const rise = (SKY_NDC_Y * clipW - clipY) / (e[5] - SKY_NDC_Y * e[7]);
    out.copy(hit);
    out.y += Math.max(MIN_SKY_HEIGHT, rise);
  }
  const pool = (geo: THREE.BufferGeometry, material: THREE.Material, limit: number) => {
    const mesh = track(new THREE.InstancedMesh(geo, material, limit));
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  };
  const ink = (color: number) => track(new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false }));
  const glow = (color: number) => track(new THREE.SpriteMaterial({ color, map: glowTexture, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  const ringGeo = track(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2));
  const patchGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const shard = track(new THREE.OctahedronGeometry(1));

  // Trap holes: raise the jaws, snap once, hold, then open and subside.
  const pit = track(new THREE.CircleGeometry(0.43, 24).rotateX(-Math.PI / 2));
  const rim = track(new THREE.TorusGeometry(0.40, 0.065, 6, 18).rotateX(Math.PI / 2));
  const rock = track(new THREE.BoxGeometry(0.15, 0.09, 0.12));
  const fang = track(new THREE.ConeGeometry(0.063, 0.20, 4));
  const pitMat = track(new THREE.MeshBasicMaterial({ color: 0x170a16 }));
  const rimMat = track(new THREE.MeshStandardMaterial({ color: 0x803e4c, roughness: 0.78 }));
  const rockMat = track(new THREE.MeshStandardMaterial({ color: 0x806346, roughness: 0.96 }));
  const teethMat = track(new THREE.MeshStandardMaterial({ color: 0xffdfb1, roughness: 0.45, emissive: 0x514127 }));
  const debris = pool(rock, rockMat, 4 * CLUMPS);
  const traps = Array.from({ length: 4 }, () => {
    const root = new THREE.Group();
    root.visible = false;
    group.add(root);
    const floor = new THREE.Mesh(pit, pitMat);
    floor.position.y = 0.035;
    const gums = new THREE.Mesh(rim, rimMat);
    gums.position.y = 0.085;
    root.add(floor, gums);
    const jaws = [new THREE.Group(), new THREE.Group()];
    root.add(...jaws);
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) / 12 * TAU;
      const x = Math.cos(a), z = Math.sin(a);
      const clod = new THREE.Mesh(rock, rockMat);
      clod.position.set(0.44 * x, 0.045 + (i % 3) * 0.013, 0.44 * z);
      clod.rotation.y = -a;
      root.add(clod);
      const tooth = new THREE.Mesh(fang, teethMat);
      tooth.position.set(0.39 * x, 0.14, 0.39 * z);
      tooth.quaternion.setFromUnitVectors(up, new THREE.Vector3(-x, 0.72 + (i % 2) * 0.26, -z).normalize());
      jaws[x > 0 ? 1 : 0].add(tooth);
    }
    const ringMat = ink(0xffa777);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.055;
    root.add(ring);
    return { root, jaws, gums, ring, ringMat };
  });
  const clumps = Array.from({ length: CLUMPS }, (_, i) => {
    const a = i * 2.39996;
    return { x: Math.cos(a), z: Math.sin(a), height: 0.20 + (i % 4) * 0.1 };
  });

  // A burst at the fallen ally, a white moving soul, and a cyan landing halo.
  const soulMat = ink(0xffffff);
  soulMat.opacity = 0.94;
  const souls = pool(shard, soulMat, SPARKS * 3);
  const wispsMat = ink(0xccf6ff);
  wispsMat.opacity = 0.52;
  const wisps = pool(shard, wispsMat, SPARKS * 2);
  const imprintMat = ink(0xdcfaff);
  imprintMat.opacity = 0.65;
  const sendRings = pool(ringGeo, imprintMat, SPARKS);
  const receiveMat = ink(0x95ebff);
  receiveMat.opacity = 0.80;
  receiveMat.blending = THREE.AdditiveBlending;
  const receiveRings = pool(ringGeo, receiveMat, SPARKS);

  // Twin sin/cos strands wind around a thin blue shaft dropped from the sky.
  const beamGeo = track(new THREE.CylinderGeometry(1, 1, 1, 6));
  const oracles = SIDES.map(() => {
    const beamMat = ink(0xb5efff);
    const beam = pool(beamGeo, beamMat, SEGMENTS * 2);
    const shaftMat = ink(0x7edaff);
    shaftMat.blending = THREE.AdditiveBlending;
    const shaft = new THREE.Mesh(beamGeo, shaftMat);
    const flareMat = glow(0xa5eeff);
    const flare = new THREE.Sprite(flareMat);
    const bandMat = glow(0xddfbff);
    const band = new THREE.Sprite(bandMat);
    const rippleMat = ink(0x89e5ff);
    const ripple = new THREE.Mesh(ringGeo, rippleMat);
    const patchMat = ink(0x90ee78);
    const patch = new THREE.Mesh(patchGeo, patchMat);
    const cloudMat = track(new THREE.SpriteMaterial({ map: glowTexture, color: 0x8cfb78, transparent: true, depthWrite: false, toneMapped: false }));
    const cloud = new THREE.Group();
    const puffs = Array.from({ length: PUFFS }, (_, i) => {
      const mote = new THREE.Sprite(cloudMat);
      cloud.add(mote);
      const a = i * 2.39996;
      return { mote, dx: Math.cos(a), dz: Math.sin(a), reach: 0.38 + (i % 5) * 0.2, lift: 0.12 + (i % 4) * 0.1 };
    });
    shaft.visible = flare.visible = band.visible = ripple.visible = patch.visible = cloud.visible = false;
    group.add(shaft, flare, band, ripple, patch, cloud);
    return { beam, beamMat, shaft, shaftMat, flare, flareMat, band, bandMat,
      ripple, rippleMat, patch, patchMat, cloud, cloudMat, puffs, top: new THREE.Vector3(), sample: new THREE.Vector3() };
  });

  const put = (mesh: THREE.InstancedMesh, index: number) => { dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); };
  const commit = (mesh: THREE.InstancedMesh, count: number) => {
    mesh.count = count;
    if (count) mesh.instanceMatrix.needsUpdate = true;
  };
  const imprint = (mesh: THREE.InstancedMesh, index: number, x: number, z: number, r: number) => {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, 0.054, z);
    dummy.scale.setScalar(r);
    put(mesh, index);
  };

  function update(battle: BattleState | null, time: number, openerTime: number, reduced: boolean, potato: boolean, anchor: UnitAnchor) {
    let debrisCount = 0;
    for (let i = 0; i < traps.length; i++) {
      const { root, jaws, gums, ring, ringMat } = traps[i];
      const hole = battle?.holes[i];
      root.visible = !!hole && time < TRAP_STUN_SECONDS + 0.35;
      if (!hole || !root.visible) continue;
      // Board preroll may be frozen at t=0; the cosmetic entrance can still play.
      const age = Math.max(time, openerTime);
      const rise = reduced ? 1 : smooth(age / 0.20);
      const bite = reduced ? 0.76 : smooth((age - 0.15) / 0.13);
      const release = smooth((time - TRAP_STUN_SECONDS + 0.23) / 0.27);
      const sink = smooth((time - TRAP_STUN_SECONDS) / 0.35);
      const grip = bite * (1 - release);
      const rattleTime = Math.max(0, age - 0.25);
      const rattle = reduced ? 0 : Math.sin(rattleTime * 33) * Math.exp(-rattleTime * 7);
      root.position.set(hole.x, -0.24 * sink, hole.y);
      root.scale.setScalar(0.79 + rise * 0.21);
      gums.scale.y = 0.60 + rise * 0.40;
      for (let j = 0; j < jaws.length; j++) {
        const sign = j === 0 ? -1 : 1;
        jaws[j].position.set(sign * (0.13 - grip * 0.24), -0.18 + rise * 0.18 + grip * 0.086, 0);
        jaws[j].rotation.z = sign * (grip * 0.20 + rattle * 0.055);
      }
      ring.visible = grip > 0.08;
      ring.scale.setScalar(0.50 + (reduced ? 0 : Math.exp(-rattleTime * 8) * 0.17));
      ringMat.opacity = 0.62 * grip;
      if (reduced || age < 0.20 || age >= 0.65) continue;
      const burst = unit((age - 0.20) / 0.45);
      for (let j = 0; j < (potato ? 4 : CLUMPS); j++) {
        const c = clumps[j];
        const radius = 0.32 + burst * (0.23 + 0.055 * (j % 4));
        dummy.position.set(hole.x + c.x * radius, 0.085 + Math.sin(Math.PI * burst) * c.height, hole.y + c.z * radius);
        dummy.rotation.set(burst * 8 + i, j * 1.6, burst * 3);
        dummy.scale.setScalar((1.1 - burst * 1.05) * (0.6 + j % 3 * 0.16));
        put(debris, debrisCount++);
      }
    }
    commit(debris, debrisCount);

    let soulCount = 0, wispCount = 0, sending = 0, receiving = 0;
    for (const spark of battle?.sparks ?? []) {
      if (time < spark.startAt || !anchor(spark.targetUid, to)) continue;
      if (spark.landedAt !== undefined && time >= spark.landedAt) {
        const age = (time - spark.landedAt) / SPARK_LANDING_SECONDS;
        if (age < 1 && receiving < SPARKS) imprint(receiveRings, receiving++, to.x, to.z, reduced ? 0.49 : 0.42 + smooth(age) * 0.39);
        continue;
      }
      if (time > spark.arrivesAt + 0.10) continue; // no fake landing if the battle ended mid-flight
      const k = unit((time - spark.startAt) / (spark.arrivesAt - spark.startAt));
      if (k < 0.58 && sending < SPARKS) imprint(sendRings, sending++, spark.x, spark.y, reduced ? 0.32 : 0.12 + k * 0.68);
      if (soulCount >= SPARKS * 3) continue;
      from.set(spark.x, 0.26, spark.y);
      for (let i = 0; i < (potato || reduced ? 1 : 3); i++) {
        const p = Math.max(0, k - i * 0.15);
        dummy.position.lerpVectors(from, to, p);
        dummy.position.y += Math.sin(Math.PI * p) * (reduced ? 0.14 : 0.57);
        dummy.rotation.set(reduced ? 0 : k * 3, reduced ? 0 : i + p * 4, 0);
        dummy.scale.setScalar(0.113 - i * 0.026);
        put(souls, soulCount++);
      }
      if (!reduced && !potato && wispCount + 2 <= SPARKS * 2) {
        point.lerpVectors(from, to, k);
        point.y += Math.sin(Math.PI * k) * 0.57;
        for (const side of [-1, 1]) {
          const flutter = Math.sin(k * TAU * 3);
          dummy.position.set(point.x + side * (0.09 + flutter * 0.027), point.y + 0.035 * flutter, point.z);
          dummy.rotation.set(0, 0, side * (0.48 + flutter * 0.40));
          dummy.scale.set(0.09, 0.038, 0.065);
          put(wisps, wispCount++);
        }
      }
    }
    commit(souls, soulCount);
    commit(wisps, wispCount);
    commit(sendRings, sending);
    commit(receiveRings, receiving);

    for (let i = 0; i < SIDES.length; i++) {
      const fx = oracles[i], wave = battle?.waves[SIDES[i]];
      fx.beam.count = 0;
      fx.shaft.visible = fx.flare.visible = fx.band.visible = fx.ripple.visible = fx.patch.visible = fx.cloud.visible = false;
      if (!wave || wave.startAt === null || !wave.pulses) continue;
      const since = time - wave.startAt;
      if (since < 0) continue;
      const beatAge = Math.max(0, since - WAVE_BEATS[wave.pulses - 1]);
      const glowPulse = reduced ? 0.56 : Math.exp(-beatAge * 6.5);
      if (since <= WAVE_BEATS[3] + 0.32 && anchor(wave.uid, to)) {
        skyAbove(to, from);
        fx.top.copy(from);
        const phase = reduced ? 0 : -since * 11;
        const n = potato ? 14 : SEGMENTS;
        const strands = potato || reduced ? 1 : 2;
        const reveal = reduced ? 1 : smooth(since / 0.27);
        const widthScale = reduced ? 0.22 : 0.33 + glowPulse * 0.13;
        rayPoint(from, to, 0.5, phase, widthScale, fx.sample);
        const segments = Math.ceil(n * reveal);
        let count = 0;
        for (let strand = 0; strand < strands; strand++) {
          previous.copy(from);
          for (let j = 1; j <= segments; j++) {
            const u = Math.min(j / n, reveal);
            rayPoint(from, to, u, phase + Math.PI * strand, widthScale, point);
            dummy.position.addVectors(previous, point).multiplyScalar(0.5);
            diff.subVectors(point, previous);
            dummy.quaternion.setFromUnitVectors(up, direction.copy(diff).normalize());
            const width = (strand === 0 ? 0.027 : 0.019) + glowPulse * 0.012;
            dummy.scale.set(width, diff.length() + 0.009, width);
            put(fx.beam, count++);
            previous.copy(point);
          }
        }
        commit(fx.beam, count);
        fx.beamMat.opacity = 0.70 + glowPulse * 0.28;
        fx.shaft.visible = reveal > 0;
        fx.flare.visible = reveal > 0.92;
        fx.shaft.position.copy(from).lerp(to, reveal * 0.5);
        fx.shaft.scale.set(0.044 + glowPulse * 0.031, (from.y - to.y) * reveal, 0.044 + glowPulse * 0.031);
        fx.shaftMat.opacity = 0.24 + glowPulse * 0.31;
        fx.flare.position.copy(to);
        fx.flare.scale.setScalar(0.25 + glowPulse * 0.37);
        fx.flareMat.opacity = 0.41 + glowPulse * 0.36;
        if (!reduced && !potato && beatAge < 0.36) {
          const down = smooth(beatAge / 0.36);
          fx.band.visible = true;
          fx.band.position.copy(from).lerp(to, down);
          fx.band.scale.set(0.41 - down * 0.12, 0.31, 1);
          fx.bandMat.opacity = 0.76 * (1 - down);
        }
        if (reveal > 0.92 && beatAge < 0.52) {
          fx.ripple.visible = true;
          fx.ripple.position.set(to.x, 0.055, to.z);
          fx.ripple.scale.setScalar(reduced ? 0.52 : 0.20 + smooth(beatAge / 0.52) * 0.57);
          fx.rippleMat.opacity = reduced ? 0.78 : 0.82 * (1 - beatAge / 0.52);
        }
      }
      if (wave.impact) {
        const { at, x, y } = wave.impact;
        const age = Math.max(0, time - at);
        if (age >= 0.95) continue;
        const x1 = Math.max(0, x - 1.5), x2 = Math.min(COLS, x + 1.5);
        const z1 = Math.max(0, y - 1.5), z2 = Math.min(ROWS, y + 1.5);
        const fade = 1 - age / 0.95;
        fx.patch.visible = true;
        fx.patch.position.set((x1 + x2) / 2, 0.038, (z1 + z2) / 2);
        fx.patch.scale.set(x2 - x1, 1, z2 - z1);
        fx.patchMat.opacity = 0.27 * fade;
        fx.cloud.visible = true;
        fx.cloudMat.opacity = 0.68 * fade;
        const spread = reduced ? 1 : 0.35 + 0.65 * Math.min(1, age / 0.42);
        fx.puffs.forEach(({ mote, dx, dz, reach, lift }, p) => {
          mote.visible = !potato || p % 2 === 0;
          const width = 0.28 + reach * 0.32 + (reduced ? 0 : age * 0.38);
          const pad = width / 2;
          mote.position.set(clamp(x + dx * reach * spread, x1 + pad, x2 - pad), 0.16 + lift * spread,
            clamp(y + dz * reach * spread, z1 + pad, z2 - pad));
          mote.scale.set(width, width * 0.78, 1);
        });
      }
    }
  }

  return {
    update,
    inspect: () => ({
      traps: traps.filter(({ root }) => root.visible).length, debris: debris.count,
      souls: souls.count, departureRings: sendRings.count, landingRings: receiveRings.count,
      rays: oracles.filter(({ beam }) => beam.count > 0).length,
      rayAxes: oracles.map(({ beam, top, flare, sample, shaft }) => beam.count ? {
        top: top.toArray(), sourceNdcY: point.copy(top).project(camera).y,
        hit: flare.position.toArray(), middle: sample.toArray(), segments: beam.count,
        leadY: shaft.position.y - shaft.scale.y / 2,
      } : null),
      smoke: oracles.filter(({ cloud }) => cloud.visible).length,
    }),
    dispose: () => { scene.remove(group); resources.forEach((x) => x.dispose()); },
  };
}
