/** User-selected resolution of the 3D drawing buffer, not the page/UI. */
export type RenderResolution = "auto" | "low" | "medium" | "high";

export function isRenderResolution(value: unknown): value is RenderResolution {
  return value === "auto" || value === "low" || value === "medium" || value === "high";
}

/** Keep very dense screens affordable. Manual presets are percentages of the
 * capped device DPR; Auto starts lower and can adapt further on the board.
 * Potato mode applies its own ceiling without changing the saved preset. */
export function renderPixelRatio(
  resolution: RenderResolution,
  devicePixelRatio: number,
  compact: boolean,
  potato: boolean,
  autoScale = 1,
): number {
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const native = Math.min(device, compact ? 1.75 : 2);
  const auto = Math.min(native, compact ? 1.35 : 1.65);
  const scale = Number.isFinite(autoScale) ? Math.max(0.6, Math.min(1, autoScale)) : 1;
  const desired = resolution === "auto" ? auto * scale
    : native * (resolution === "low" ? 0.5 : resolution === "medium" ? 0.75 : 1);
  return potato ? Math.min(desired, Math.min(native, 1.6) * 0.6) : desired;
}

/** Pace rendering to 60 fps on high-refresh displays without changing the
 * simulation clock. Carry fractional time so 90/120/144 Hz remain smooth. */
export class RenderFrameGate {
  private last = 0;
  private carry = 0;
  private readonly interval: number;

  constructor(fps = 60) {
    this.interval = 1000 / fps;
  }

  reset(now: number) {
    this.last = now;
    this.carry = 0;
  }

  shouldRender(now: number): boolean {
    this.carry += Math.max(0, Math.min(250, now - this.last));
    this.last = now;
    if (this.carry + 0.01 < this.interval) return false;
    this.carry = Math.max(0, this.carry - this.interval) % this.interval;
    return true;
  }
}
