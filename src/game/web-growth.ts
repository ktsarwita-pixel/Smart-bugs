import { Matrix4 } from "three";

/** Presentation-only reveal; combat coverage remains immediate on impact. */
export const GRAND_WEB_GROW_SECONDS = 2.8;
export function grandWebGrowth(age: number, motion: boolean): number {
  if (!motion) return 1;
  const progress = Math.max(0, Math.min(1, age / GRAND_WEB_GROW_SECONDS));
  // Progress, not scale: the board is 7×6, so each horizontal axis needs
  // its own scale to begin at exactly one tile and finish at each edge.
  return progress;
}

/** A projectile can outlive combat visually. Do not reveal its web until its
 * rendered flight reaches the ground; never alter the battle simulation. */
export function visualGrandImpactReady(
  hit: { fromUid: number; at: number },
  shots: readonly { id: number; fromUid: number; kind: string; t0: number; dur: number }[],
  progress: ReadonlyMap<number, number>,
): boolean {
  const shot = shots.find(s => s.kind === 'webgrand' && s.fromUid === hit.fromUid && Math.abs(s.t0 + s.dur - hit.at) < 0.001);
  return !shot || (progress.get(shot.id) ?? 0) >= 1;
}

/** Scale the original full-board web about impact. At zero the 7×6 sheet
 * occupies exactly 1×1 tile; at one it occupies the entire drawer. */
export function setGrandWebScale(matrix: Matrix4, progress: number, x: number, z: number, cols: number, rows: number, ground = 0.052): Matrix4 {
  const p = Math.max(0, Math.min(1, progress));
  const sx = (1 + (cols - 1) * p) / cols;
  const sz = (1 + (rows - 1) * p) / rows;
  const sy = (sx + sz) / 2;
  return matrix.makeScale(sx, sy, sz).setPosition(x * (1 - sx), ground * (1 - sy), z * (1 - sz));
}
