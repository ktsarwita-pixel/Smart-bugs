export const AIRSTRIKE_RADIUS = 1.45;

/**
 * Airstrike damage model (designer spec):
 * the field deals 220% (2.2× = 100% base + 120% bonus) of the WHOLE
 * team's combined ATK in total, split evenly across its ticks
 * (AIRSTRIKE_SECONDS ticks, one per second). "Team" = every living
 * unit on the dragonfly's side, dragonfly included — and each tick
 * is recomputed from whoever is still alive at that moment, so a
 * fuller / stronger line hits harder and a thinned line hits softer.
 *
 * Example: allies ATK 235 + 90 + 79 + 61 = 465 combined
 *   → 465 × 2.2 / 2 ticks ≈ 512 raw damage per tick, 1,023 total.
 * A lone 3-star dragonfly: 235 × 2.2 / 2 ≈ 259 per tick.
 *
 * Tune the whole ultimate by changing this one constant.
 */
export const AIRSTRIKE_TEAM_ATK_MULT = 2.2;
export const AIRSTRIKE_SECONDS = 2;

/** Raw (pre-DEF) damage of one Airstrike tick for a combined team ATK. */
export const airstrikeTickDamage = (combinedTeamAtk: number): number =>
  Math.max(1, Math.round((combinedTeamAtk * AIRSTRIKE_TEAM_ATK_MULT) / AIRSTRIKE_SECONDS));
export const AIRSTRIKE_FLIGHT = 1.35;
export const AIRSTRIKE_RECOVERY = 0.28;
export const AIRSTRIKE_HEIGHT = 2.1;
export const AIRSTRIKE_LOCK_PROGRESS = 0.3;

/** This is the unit's own flight, not a projectile or a second model. */
export interface AirstrikeDive {
  id: number;
  startAt: number;
  duration: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  targetLocked: boolean;
  landed: boolean;
}

export type FlightPhase = "climb" | "approach" | "dive" | "landing";

export interface AirstrikePose {
  phase: FlightPhase;
  progress: number;
  x: number;
  y: number;
  height: number;
  pitch: number;
  bank: number;
  wingFold: number;
  /**
   * 0..1 — how hard the wings are working. Real dragonflies beat ~30x a
   * second, which the eye reads as a translucent blur rather than wings.
   */
  blur: number;
  /**
   * 0..1 — air the body is punching through. Drives the condensation
   * streak that trails behind a steep dive.
   */
  streak: number;
  /**
   * 0..1 — how strongly the specimen shadows the soil. Falls away with
   * altitude and returns as it bears down on the landing point.
   */
  shadow: number;
  /** 0..1 — downwash strength, strongest at takeoff and at the flare. */
  downwash: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

export function createAirstrikePose(): AirstrikePose {
  return {
    phase: "climb", progress: 0, x: 0, y: 0, height: 0,
    pitch: 0, bank: 0, wingFold: 0, blur: 0, streak: 0, shadow: 1, downwash: 0,
  };
}

/**
 * Shared by the simulation and the renderer, so the same unit lands at the
 * same place and the effects always agree with the physics.
 */
export function sampleAirstrikeDive(
  dive: AirstrikeDive,
  time: number,
  out: AirstrikePose = createAirstrikePose(),
): AirstrikePose {
  const progress = clamp((time - dive.startAt) / dive.duration);
  let travel = 0;
  let height = 0;
  out.progress = progress;
  out.bank = 0;
  out.blur = 1;
  out.streak = 0;
  out.downwash = 0;

  if (progress < AIRSTRIKE_LOCK_PROGRESS) {
    // Vertical climb straight out of the takeoff tile. Wings at full beat,
    // downwash kicking soil off the ground beneath it.
    const t = progress / AIRSTRIKE_LOCK_PROGRESS;
    out.phase = "climb";
    height = AIRSTRIKE_HEIGHT * smooth(t);
    out.pitch = 0.3 * Math.sin(t * Math.PI) + 0.1 * smooth(t);
    out.wingFold = 0;
    out.blur = 1;
    out.streak = 0.1 * t;
    out.downwash = 1 - t * 0.45;
  } else if (progress < 0.62) {
    // Level transit across the board. Slight bank into the turn reads as
    // controlled flight rather than a slide.
    const t = (progress - AIRSTRIKE_LOCK_PROGRESS) / (0.62 - AIRSTRIKE_LOCK_PROGRESS);
    out.phase = "approach";
    travel = smooth(t) * 0.78;
    height = AIRSTRIKE_HEIGHT;
    out.pitch = 0.1;
    out.bank = Math.sin(t * Math.PI) * 0.15;
    out.wingFold = 0.12;
    out.blur = 1;
    out.streak = 0.45;
    out.downwash = 0.25;
  } else if (progress < 1) {
    // The dive: wings fold back into a dart, the body pitches nose-down and
    // accelerates. Air streaks tear past; the shadow rushes up to meet it.
    const t = (progress - 0.62) / 0.38;
    const flare = smooth((t - 0.82) / 0.18);
    out.phase = "dive";
    travel = 0.78 + smooth(t) * 0.22;
    height = AIRSTRIKE_HEIGHT * (1 - t * t);
    // The model faces -Z. A negative X rotation points its head DOWN.
    out.pitch = -1.25 * smooth(t / 0.55) * (1 - flare * 0.75);
    out.wingFold = smooth(t / 0.35) * (1 - flare * 0.8);
    out.blur = 1 - out.wingFold * 0.85;
    out.streak = Math.min(1, 0.35 + t * 1.1) * (1 - flare * 0.6);
    out.downwash = t * 0.5;
  } else {
    // Touchdown flare: wings snap open to brake, body settles onto the soil.
    const recovery = smooth((time - dive.startAt - dive.duration) / AIRSTRIKE_RECOVERY);
    out.phase = "landing";
    travel = 1;
    height = Math.sin(recovery * Math.PI) * 0.045;
    out.pitch = -0.3125 * (1 - recovery);
    out.wingFold = 0.2 * (1 - recovery);
    out.blur = 0.45 * (1 - recovery);
    out.streak = 0;
    out.downwash = 1 - recovery;
  }

  // Shadow strength is a function of altitude: crisp and dark near the soil,
  // soft and faint at altitude. Scaled against the dive ceiling so every
  // phase stays inside 0..1.
  out.shadow = clamp(1 - (height / AIRSTRIKE_HEIGHT) * 0.8);
  out.height = height;
  out.x = dive.fromX + (dive.toX - dive.fromX) * travel;
  out.y = dive.fromY + (dive.toY - dive.fromY) * travel;
  return out;
}
