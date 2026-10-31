/** Presentation-only reveal; combat coverage remains immediate on impact. */
export const GRAND_WEB_GROW_SECONDS = 2.2;
export function grandWebGrowth(age: number, motion: boolean): number {
  if (!motion) return 1;
  const progress = Math.max(0, Math.min(1, age / GRAND_WEB_GROW_SECONDS));
  // The silk visibly advances for the whole animation instead of rushing to
  // near-full size in the first few frames.
  return 0.025 + 0.975 * progress;
}
