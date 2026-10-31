/** Presentation-only reveal; combat coverage remains immediate on impact. */
export const GRAND_WEB_GROW_SECONDS = 2.2;
export function grandWebGrowth(age: number, motion: boolean): number {
  if (!motion) return 1;
  const progress = Math.max(0, Math.min(1, age / GRAND_WEB_GROW_SECONDS));
  // The silk visibly advances for the whole animation instead of rushing to
  // near-full size in the first few frames.
  return 0.025 + 0.975 * progress;
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
