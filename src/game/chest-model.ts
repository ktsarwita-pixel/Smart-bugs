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
  // The pivot sits exactly on the back edge of the body (the previous 0.02
  // gap made the lid look detached). Two hinge pins physically bridge it.
  lid.position.set(0, 0.44, -0.30);
  lid.add(new THREE.Mesh(geo(createChestGeometry("lid", true)), wood));
  root.add(lid);
  const hingeMat = mat(new THREE.MeshStandardMaterial({ color: 0xc28a38, metalness: 0.4, roughness: 0.48 }));
  const hingeGeo = geo(new THREE.CylinderGeometry(.035, .035, .12, 8));
  for (const x of [-.30, .30]) {
    const hinge = new THREE.Mesh(hingeGeo, hingeMat);
    hinge.rotation.z = Math.PI / 2; hinge.position.set(x, .44, -.30); root.add(hinge);
  }

  // A supported treasure pile, rather than coins floating over an empty floor.
  const coinMat = mat(new THREE.MeshStandardMaterial({ color: 0xffc653, emissive: 0x613100, emissiveIntensity: 0.32, roughness: 0.4, metalness: 0.45 }));
  const pile = new THREE.Mesh(geo(new THREE.BoxGeometry(.54, .20, .34)), coinMat);
  pile.position.set(0, .22, 0); root.add(pile); // rests on the interior floor
  const coinGeo = geo(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 8));
  const coins: [number, number][] = [[-.19,-.08],[-.02,-.09],[.16,-.08],[-.16,.07],[0,.06],[.17,.07]];
  coins.forEach(([x,z]) => { const c = new THREE.Mesh(coinGeo, coinMat); c.position.set(x,.3375,z); root.add(c); });
  const gemMat = mat(new THREE.MeshStandardMaterial({ color: 0x6fe1d4, emissive: 0x174a43, metalness: 0.25, roughness: 0.3 }));
  const gem = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.055, 0)), gemMat);
  gem.position.set(-.1,.375,0); gem.rotation.y = .4; root.add(gem);

  const glowMat = mat(new THREE.MeshBasicMaterial({ color: 0xffc95d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Mesh(geo(new THREE.PlaneGeometry(.59,.39)), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = .31; root.add(glow);
  // The glow stays inside the chest; no detached floating shards.
  function update(progress: number) {
    const sample = sampleChestOpening(progress);
    lid.rotation.x = sample.angle;
    glowMat.opacity = sample.glow * .25;
  }
  const inspect = () => {
    const bounds = body.geometry.boundingBox!;
    const attached = lid.parent === root && body.parent === root;
    return { hingeGap: attached ? Math.hypot(lid.position.y - bounds.max.y, lid.position.z - bounds.min.z) : Infinity };
  };
  update(0);
  return { root, body, lid, pile, inspect, update, dispose: () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
