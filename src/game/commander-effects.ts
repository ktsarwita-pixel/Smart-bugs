import * as THREE from "three";
import { COLS, ROWS, TRAP_STUN_SECONDS, WAVE_BEATS, type BattleSide, type BattleState } from "./engine";

const SIDES = ["ally", "foe"] as const;
const SEGMENTS = 28;
const SPARKS = 24;
const PUFFS = 18;
const TAU = 2 * Math.PI;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type UnitAnchor = (uid: number, into: THREE.Vector3) => boolean;
type RayOrigin = (side: BattleSide, into: THREE.Vector3) => void;

/** Commander meshes are pooled and driven by the simulation's event times. */
export function createCommanderEffects(scene: THREE.Scene, glowTexture: THREE.Texture) {
  const group = new THREE.Group();
  group.name = "Commander effects";
  scene.add(group);
  const resources: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { resources.push(x); return x; };
  const up = new THREE.Vector3(0, 1, 0);
  const pit = track(new THREE.CircleGeometry(0.43, 24).rotateX(-Math.PI / 2));
  const rim = track(new THREE.TorusGeometry(0.40, 0.065, 6, 18).rotateX(Math.PI / 2));
  const rock = track(new THREE.BoxGeometry(0.15, 0.09, 0.12));
  const fang = track(new THREE.ConeGeometry(0.063, 0.20, 4));
  const pitMat = track(new THREE.MeshBasicMaterial({ color: 0x170a16 }));
  const rimMat = track(new THREE.MeshStandardMaterial({ color: 0x803e4c, roughness: 0.78 }));
  const rockMat = track(new THREE.MeshStandardMaterial({ color: 0x62503a, roughness: 0.96 }));
  const teethMat = track(new THREE.MeshStandardMaterial({ color: 0xffdfb1, roughness: 0.45, emissive: 0x514127 }));
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
    return { root, jaws };
  });

  const dummy = new THREE.Object3D();
  const from = new THREE.Vector3(), to = new THREE.Vector3(), previous = new THREE.Vector3(), point = new THREE.Vector3();
  const diff = new THREE.Vector3(), direction = new THREE.Vector3(), cross = new THREE.Vector3();
  const shard = track(new THREE.OctahedronGeometry(1));
  const soulMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }));
  const souls = track(new THREE.InstancedMesh(shard, soulMat, SPARKS * 3));
  souls.count = 0;
  souls.frustumCulled = false;
  souls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(souls);

  const beamGeo = track(new THREE.CylinderGeometry(1, 1, 1, 5));
  const patchGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const oracles = SIDES.map(() => {
    const beamMat = track(new THREE.MeshBasicMaterial({ color: 0xadf1ff, toneMapped: false, transparent: true, depthWrite: false }));
    const beam = track(new THREE.InstancedMesh(beamGeo, beamMat, SEGMENTS));
    beam.count = 0;
    beam.frustumCulled = false;
    beam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const flareMat = track(new THREE.SpriteMaterial({ map: glowTexture, color: 0xa0e9ff, depthWrite: false, transparent: true, toneMapped: false }));
    const flare = new THREE.Sprite(flareMat);
    const patchMat = track(new THREE.MeshBasicMaterial({ color: 0x90ee78, transparent: true, depthWrite: false, toneMapped: false }));
    const patch = new THREE.Mesh(patchGeo, patchMat);
    const cloudMat = track(new THREE.SpriteMaterial({ map: glowTexture, color: 0x8cfb78, transparent: true, depthWrite: false, toneMapped: false }));
    const cloud = new THREE.Group();
    const puffs = Array.from({ length: PUFFS }, (_, i) => {
      const mote = new THREE.Sprite(cloudMat);
      cloud.add(mote);
      const a = i * 2.39996;
      return { mote, dx: Math.cos(a), dz: Math.sin(a), reach: 0.38 + (i % 5) * 0.2, lift: 0.12 + (i % 4) * 0.1 };
    });
    flare.visible = patch.visible = cloud.visible = false;
    group.add(beam, flare, patch, cloud);
    return { beam, beamMat, flare, flareMat, patch, patchMat, cloud, cloudMat, puffs };
  });

  function update(battle: BattleState | null, time: number, reduced: boolean, potato: boolean, anchor: UnitAnchor, origin: RayOrigin) {
    const holes = battle?.holes ?? [];
    for (let i = 0; i < traps.length; i++) {
      const { root, jaws } = traps[i];
      const hole = holes[i];
      root.visible = !!hole && time < TRAP_STUN_SECONDS + 0.35;
      if (!hole || !root.visible) continue;
      const close = reduced ? 0.3 : (1 - Math.cos(time * TAU / 0.57)) * 0.5;
      const sink = clamp((time - TRAP_STUN_SECONDS) / 0.35, 0, 1);
      root.position.set(hole.x, -0.20 * sink, hole.y);
      root.scale.setScalar(reduced ? 1 : 0.84 + Math.min(1, time * 6) * 0.16);
      for (let j = 0; j < jaws.length; j++) {
        jaws[j].position.set((j === 0 ? -1 : 1) * (0.075 - close * 0.16), close * 0.16, 0);
        jaws[j].rotation.z = (j === 0 ? -1 : 1) * close * 0.13;
      }
    }

    let soulCount = 0;
    for (const spark of battle?.sparks ?? []) {
      if (soulCount >= SPARKS * 3 || time > spark.arrivesAt || !anchor(spark.targetUid, to)) continue;
      const progress = clamp((time - spark.startAt) / (spark.arrivesAt - spark.startAt), 0, 1);
      from.set(spark.x, 0.24, spark.y);
      for (let i = 0; i < (potato || reduced ? 1 : 3); i++) {
        const p = Math.max(0, progress - i * 0.105);
        dummy.position.lerpVectors(from, to, p);
        dummy.position.y += Math.sin(Math.PI * p) * 0.48;
        dummy.rotation.set(reduced ? 0 : time * 6, i + p * 4, 0);
        dummy.scale.setScalar(0.095 - i * 0.025);
        dummy.updateMatrix();
        souls.setMatrixAt(soulCount++, dummy.matrix);
      }
    }
    souls.count = soulCount;
    if (soulCount) souls.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < SIDES.length; i++) {
      const side = SIDES[i], fx = oracles[i], wave = battle?.waves[side];
      fx.beam.count = 0;
      fx.flare.visible = fx.patch.visible = fx.cloud.visible = false;
      if (!wave || wave.startAt === null || !wave.pulses) continue;
      const since = Math.max(0, time - wave.startAt);
      const beatAge = Math.max(0, since - WAVE_BEATS[wave.pulses - 1]);
      const pulse = Math.exp(-beatAge * 9);
      if (since <= WAVE_BEATS[3] + 0.18 && anchor(wave.uid, to)) {
        origin(side, from);
        diff.subVectors(to, from);
        cross.set(diff.z, 0, -diff.x).normalize();
        const n = potato ? 14 : SEGMENTS;
        previous.copy(from);
        for (let j = 1; j <= n; j++) {
          const u = j / n;
          const phase = u * TAU * 2.2 - (reduced ? 0 : since * 8);
          const amplitude = Math.sin(Math.PI * u) * (reduced ? 0.12 : 0.30);
          point.lerpVectors(from, to, u).addScaledVector(cross, Math.cos(phase) * amplitude);
          point.y += Math.sin(phase) * amplitude;
          dummy.position.addVectors(previous, point).multiplyScalar(0.5);
          diff.subVectors(point, previous);
          dummy.quaternion.setFromUnitVectors(up, direction.copy(diff).normalize());
          const width = (0.028 + pulse * 0.016) * (0.8 + u * 0.2);
          dummy.scale.set(width, diff.length() + 0.012, width);
          dummy.updateMatrix();
          fx.beam.setMatrixAt(j - 1, dummy.matrix);
          previous.copy(point);
        }
        fx.beam.count = n;
        fx.beam.instanceMatrix.needsUpdate = true;
        fx.beamMat.opacity = 0.69 + pulse * 0.3;
        fx.flare.visible = !potato;
        fx.flare.position.copy(to);
        fx.flare.scale.setScalar(0.26 + 0.55 * pulse);
        fx.flareMat.opacity = 0.50 + 0.42 * pulse;
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
    inspect: () => ({ traps: traps.filter(({ root }) => root.visible).length, souls: souls.count,
      rays: oracles.filter(({ beam }) => beam.count > 0).length,
      smoke: oracles.filter(({ cloud }) => cloud.visible).length }),
    dispose: () => { scene.remove(group); resources.forEach((x) => x.dispose()); },
  };
}
