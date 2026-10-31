/** Visual-only timing for the Spider's 1.5s opening roar. The combat engine
 * remains authoritative: these samples never affect movement or damage. */
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function sampleSpiderRoar(progress: number) {
  const p = clamp01(progress);
  const windup = smoothstep(0.02, 0.3, p);
  const release = smoothstep(0.8, 1, p);
  return {
    // Rise quickly, hold the threat pose, then push into the hit rather than
    // returning to idle before it lands.
    rear: windup * (1 - 0.18 * release),
    release,
    tremble: Math.sin(p * Math.PI * 10) * windup * (1 - 0.5 * release),
  };
}

export function sampleRoarWave(progress: number, index: number) {
  // Two staggered, outward-moving pressure fronts; driven by battle time so
  // changing the battle speed or pausing the simulation never desynchronises.
  const cycle = ((clamp01(progress) * 2.4 + index * 0.5) % 1 + 1) % 1;
  return { scale: 0.54 + cycle * 0.72, opacity: 0.85 * (1 - cycle) };
}
