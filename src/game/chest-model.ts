import * as THREE from "three";
import { createChestGeometry } from "./treasure-voxel";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * t * (t * (t * 6 - 15) + 10); };

/** A smooth, eased hinge, with a small damped settle after the lid opens. */
export function sampleChestOpening(progress: number) {
  const p = clamp(progress);
  const opening = smooth((p - 0.08) / 0.72);
  const settleT = Math.max(0, p - 0.68);
  const settle = 0.035 * Math.sin(settleT * 20) * Math.exp(-settleT * 8) * smooth(settleT / 0.10) * (1 - smooth((p - 0.93) / 0.07));
  return { angle: -1.52 * (opening + settle), glow: smooth((p - 0.2) / 0.55) };
}

/** One physical chest, shared by the battlefield and the result card. */
export function createDetailedChest() {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const mat = <T extends THREE.Material>(m: T): T => { materials.push(m); return m; };
  const wood = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.12 }));
  const body = new THREE.Mesh(geo(createChestGeometry("body", true)), wood);
  root.add(body);
  const lid = new THREE.Group();
  lid.position.set(0, 0.46, -0.30);
  lid.add(new THREE.Mesh(geo(createChestGeometry("lid", true)), wood));
  root.add(lid);

  // Real, raised loot in the hollow interior, visible from different angles.
  const coinMat = mat(new THREE.MeshStandardMaterial({ color: 0xffc653, emissive: 0x613100, emissiveIntensity: 0.32, roughness: 0.4, metalness: 0.45 }));
  const coinGeo = geo(new THREE.CylinderGeometry(0.092, 0.092, 0.035, 8));
  const coins: [number, number, number][] = [[-.22,.34,-.06],[-.04,.36,-.12],[.15,.34,-.13],[-.13,.37,.08],[.07,.37,.06],[.23,.33,.06],[.03,.40,-.02]];
  coins.forEach(([x,y,z], i) => { const c = new THREE.Mesh(coinGeo, coinMat); c.position.set(x,y,z); c.rotation.z = (i % 3 - 1) * .12; root.add(c); });
  const gemMat = mat(new THREE.MeshStandardMaterial({ color: 0x6fe1d4, emissive: 0x174a43, metalness: 0.25, roughness: 0.3 }));
  const gem = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.09, 0)), gemMat);
  gem.position.set(-.12,.34,-.03); gem.rotation.y = .4; root.add(gem);

  const glowMat = mat(new THREE.MeshBasicMaterial({ color: 0xffc95d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Mesh(geo(new THREE.PlaneGeometry(.59,.39)), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = .31; root.add(glow);
  const sparkMat = mat(new THREE.MeshBasicMaterial({ color: 0xffe291, transparent: true, opacity: 0, depthWrite: false }));
  const sparkGeo = geo(new THREE.OctahedronGeometry(.045, 0));
  const sparks = Array.from({ length: 8 }, () => { const s = new THREE.Mesh(sparkGeo, sparkMat); root.add(s); return s; });

  function update(progress: number, time: number, reduced = false, hideSparks = false) {
    const sample = sampleChestOpening(progress);
    lid.rotation.x = sample.angle;
    glowMat.opacity = sample.glow * .34;
    sparkMat.opacity = hideSparks ? 0 : sample.glow * .95;
    sparks.forEach((spark, i) => {
      const phase = reduced ? .35 + i * .045 : (time * .48 + i / sparks.length) % 1;
      const angle = i * 2.4;
      const spread = .16 + phase * .22;
      spark.position.set(Math.cos(angle) * spread, .44 + phase * .72, Math.sin(angle) * spread * .7);
      const scale = reduced ? .55 : Math.max(.03, Math.sin(phase * Math.PI));
      spark.scale.set(scale * .65, scale * 1.45, scale * .65);
    });
  }
  update(0, 0);
  return { root, lid, update, dispose: () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
