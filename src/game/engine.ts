import { BUGS, BOTS, MAX_FIELD_SIZE, STAR_MULT, type BugId, type CmdId, BOARD_SLOTS } from "./data";
import {
  AIRSTRIKE_FLIGHT, AIRSTRIKE_LOCK_PROGRESS, AIRSTRIKE_RADIUS, AIRSTRIKE_RECOVERY, AIRSTRIKE_SECONDS,
  airstrikeTickDamage,
  createAirstrikePose, sampleAirstrikeDive, type AirstrikeDive,
} from "./airstrike";

export {
  AIRSTRIKE_FLIGHT, AIRSTRIKE_RADIUS, AIRSTRIKE_SECONDS, AIRSTRIKE_TEAM_ATK_MULT, airstrikeTickDamage,
} from "./airstrike";

/**
 * Combined ATK of every living unit on a side — the Airstrike power
 * source. Exported so the HUD can show the same number the engine uses.
 */
export function combinedTeamAtk(b: BattleState, side: "ally" | "foe"): number {
  let sum = 0;
  for (const u of b.units) if (!u.dead && u.side === side) sum += u.atk;
  return sum;
}

export const COLS = 7;
export const ROWS = 6;
export const TICK = 0.1;

export interface PrepUnit {
  uid: number;
  bugId: BugId;
  star: number;
  zone: "board" | "bench";
  slot: number; // board: 0..20 (row 3..5, col) | bench: 0..5
}

export interface BUnit {
  uid: number;
  bugId: BugId;
  star: number;
  side: "ally" | "foe";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  range: number;
  spd: number;
  atkCd: number;
  cd: number;
  energy: number;
  maxEnergy: number;
  stun: number;
  vuln: number;
  flash: number;
  cast: number;
  dead: boolean;
  fade: number;
  dive: AirstrikeDive | null;
  /** Spider only: seconds until the next bite is Enraged (0 = armed). */
  enrageIn: number;
  /** Active poison (Spider's Enraged bite): ticks left, time to next, dmg. */
  poisonLeft: number;
  poisonIn: number;
  poisonDmg: number;
}

export interface Pop {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  kind: "dmg" | "heal" | "skill" | "ko";
}

/** A projectile in flight. Rendered from battle time, so it needs no state of its own. */
export interface Shot {
  id: number;
  fromUid: number;
  kind: "acid" | "burst" | "webgrand" | "websnare";
  /** visual shell size from the shooter's star (1 / 1.25 / 1.5) */
  size: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t0: number;
  dur: number;
}

/** Damage that lands when a shell arrives, rather than the instant it is fired. */
export interface PendingHit {
  id: number;
  at: number;
  fromUid: number;
  targetUid: number | null;
  x: number;
  y: number;
  raw: number;
  aoe: number;
  kind: "acid" | "burst" | "webgrand" | "websnare";
}

/**
 * Airstrike ground effect (Dragonfly 3★ ultimate).
 * Time-based: the field stays AIRSTRIKE_SECONDS and ticks once per
 * second. Each tick's raw damage is recomputed from the owner's
 * living team ATK (see airstrikeTickDamage), so it weakens as the
 * owner's line falls. `dps` holds the most recent tick damage and
 * `combinedAtk` the team ATK it came from — both for HUD display.
 */
export interface Zone {
  id: number;
  owner: "ally" | "foe";
  srcUid: number;
  x: number;
  y: number;
  radius: number;
  /** raw damage of the next/most recent tick (recomputed per tick) */
  dps: number;
  /** living team ATK the current `dps` was derived from (for HUD) */
  combinedAtk: number;
  remaining: number;
  tickIn: number;
  ticks: number;
  createdAt: number;
  expiresAt: number;
}

/** Dig Hole — a one-tile trap that stuns and exposes whatever steps in. */
export interface Hole {
  id: number;
  owner: "ally" | "foe";
  x: number;
  y: number;
  armed: boolean;
  /** a triggered hole collapses and can never re-arm */
  spent: boolean;
  arm: number;
  life: number;
}

/**
 * Spider webs (3-star "Sticky Webs").
 * - grand: the whole-board opening web — 50% slow + 500 dmg/s to enemies.
 * - snare: a 3×3 web from the After-Web spit — 750 dmg on entry + 30% slow
 *   while standing in it. Webs last the rest of the battle.
 */
export interface Web {
  id: number;
  owner: "ally" | "foe";
  kind: "grand" | "snare";
  x: number;
  y: number;
  /** coverage: enemies within this radius of (x, y) are ON the web */
  half: number;
  /** seconds of life left; undefined = lasts the whole battle (grand web) */
  life?: number;
  slowPct: number;
  /** grand only: raw damage per 1s tick while the enemy stands anywhere */
  dotDps: number;
  /** snare only: damage dealt on stepping in (per continuous presence) */
  snareDmg: number;
  tickIn: number;
  /** units currently inside a snare (entry = one 750 hit) */
  inside: Set<number>;
  /** slight random spin so multiple snares don't look stamped */
  rot: number;
}

export interface BattleState {
  t: number;
  units: BUnit[];
  pops: Pop[];
  cmdA: CmdId;
  cmdB: CmdId;
  glowA: number;
  glowB: number;
  nid: number;
  over: null | "ally" | "foe";
  banner: string;
  shots: Shot[];
  pending: PendingHit[];
  /** at most one burrow per worm side, dug at battle start */
  holes: Hole[];
  /** live Airstrike fields */
  zones: Zone[];
  /** live spider webs (whole-board grand + aimed 3x3 snares) */
  webs: Web[];
}

let UID = 1;
export const nextUid = () => UID++;

/** True only when this unit's star tier has unlocked its active skill. */
export const canCastSkill = (bugId: BugId, star: number): boolean =>
  star >= (BUGS[bugId].skillMinStar ?? 1);

export const statsFor = (bugId: BugId, star: number) => {
  const b = BUGS[bugId];
  const exact = b.starStats?.[star as 1 | 2 | 3];
  if (exact) {
    return {
      hp: exact.hp,
      atk: exact.atk,
      def: exact.def ?? b.def,
    };
  }
  const m = STAR_MULT[star - 1] ?? 1;
  return {
    hp: Math.round(b.hp * m),
    atk: Math.round(b.atk * m),
    def: Math.round(b.def * (star === 3 ? 1.5 : star === 2 ? 1.2 : 1)),
  };
};

/** Shared targeting priority for the Worm's opening burrow and combat AI. */
export function isStrongerTarget(candidate: BUnit, current: BUnit | null): boolean {
  return (
    !current ||
    candidate.star > current.star ||
    (candidate.star === current.star && candidate.maxHp > current.maxHp) ||
    (candidate.star === current.star && candidate.maxHp === current.maxHp && candidate.atk > current.atk) ||
    (candidate.star === current.star && candidate.maxHp === current.maxHp && candidate.atk === current.atk && candidate.uid < current.uid)
  );
}

export const boardXY = (slot: number) => ({
  x: (slot % COLS) + 0.5,
  y: 3 + Math.floor(slot / COLS) + 0.5,
});

export const foeXY = (slot: number) => ({
  x: (slot % COLS) + 0.5,
  y: Math.floor(slot / COLS) + 0.5,
});

/**
 * The stats a unit actually enters battle with, commander bonus included.
 * Single source of truth: mkUnit uses it, and the prep inspector shows
 * it — so the ATK on the stat sheet is the damage the bug deals.
 */
export function battleStats(bugId: BugId, star: number, cmd: CmdId) {
  const s = statsFor(bugId, star);
  const hpMul = cmd === "matriarch" ? 1.18 : 1;
  const atkMul = cmd === "matriarch" ? 1.08 : 1;
  return {
    hp: Math.round(s.hp * hpMul),
    atk: Math.round(s.atk * atkMul),
    def: s.def,
  };
}

function mkUnit(uid: number, bugId: BugId, star: number, side: "ally" | "foe", x: number, y: number, cmd: CmdId): BUnit {
  const s = battleStats(bugId, star, cmd);
  const b = BUGS[bugId];
  const maxHp = s.hp;
  return {
    uid,
    bugId,
    star,
    side,
    x,
    y,
    hp: maxHp,
    maxHp,
    atk: s.atk,
    def: s.def,
    range: b.range,
    spd: b.spd,
    atkCd: b.atkCd,
    cd: Math.random() * 0.4,
    energy: 40,
    maxEnergy: 100,
    stun: 0,
    vuln: 0,
    flash: 0,
    cast: 0,
    dead: false,
    fade: 1,
    dive: null,
    enrageIn: bugId === "spider" ? enrageInterval(star) * 0.4 : 0,
    poisonLeft: 0,
    poisonIn: 0,
    poisonDmg: 0,
  };
}

/** Enraged cadence by star tier: 5s / 4s / 2.5s — tuned so the bite
 *  actually lands inside real battle lengths (the old 6/5/3 arming was
 *  longer than most fights, so the passive literally never fired). */
const enrageInterval = (star: number) => (star >= 3 ? 2.5 : star === 2 ? 4 : 5);

export function createBattle(
  allies: PrepUnit[],
  foes: PrepUnit[],
  cmdA: CmdId,
  cmdB: CmdId
): BattleState {
  const units: BUnit[] = [];
  for (const u of allies) {
    const p = boardXY(u.slot);
    units.push(mkUnit(u.uid, u.bugId, u.star, "ally", p.x, p.y, cmdA));
  }
  for (const u of foes) {
    const p = foeXY(u.slot);
    units.push(mkUnit(u.uid, u.bugId, u.star, "foe", p.x, p.y, cmdB));
  }
  const st: BattleState = {
    t: 0,
    units,
    pops: [],
    cmdA,
    cmdB,
    glowA: 5,
    glowB: 5,
    nid: 1,
    over: null,
    banner: "",
    shots: [],
    pending: [],
    holes: [],
    zones: [],
    webs: [],
  };
  // Dig Hole is an opening gambit: each worm side burrows exactly once,
  // under the enemy's strongest bug, before the first step is taken.
  if (cmdA === "worm") digHole(st, "ally");
  if (cmdB === "worm") digHole(st, "foe");
  // Sticky Webs is an opening gambit too: every 3-star spider webs the
  // whole board right as the battle begins.
  for (const u of units) {
    if (u.bugId === "spider" && u.star >= 3) spitWeb(st, u, "grand");
  }
  return st;
}

/**
 * Spider spit: lob a sticky ball (a white shell) from the spider to the
 * target tile. The web itself is created when the ball lands (resolveShells).
 */
function spitWeb(b: BattleState, u: BUnit, kind: "grand" | "snare") {
  const tx = kind === "grand" ? COLS / 2 : Math.min(COLS - 0.3, Math.max(0.3, u.x));
  const ty = kind === "grand" ? ROWS / 2 : Math.min(ROWS - 0.3, Math.max(0.3, u.y));
  const d = Math.hypot(tx - u.x, ty - u.y);
  const dur = 0.32 + Math.min(0.4, d * 0.07);
  b.shots.push({
    id: b.nid++,
    fromUid: u.uid,
    kind: kind === "grand" ? "webgrand" : "websnare",
    size: kind === "grand" ? 1.7 : 1.4,
    x0: u.x,
    y0: u.y,
    x1: tx,
    y1: ty,
    t0: b.t,
    dur,
  });
  b.pending.push({
    id: b.nid++,
    at: b.t + dur,
    fromUid: u.uid,
    targetUid: null,
    x: tx,
    y: ty,
    raw: 0,
    aoe: 0,
    kind: kind === "grand" ? "webgrand" : "websnare",
  });
  u.cast = Math.max(u.cast, 0.4);
  pop(b, u, kind === "grand" ? "STICKY WEBS" : "AFTER WEB", "skill");
}

/** Builds the actual web where a sticky ball landed. */
function landWeb(b: BattleState, src: BUnit, kind: "grand" | "snare", x: number, y: number) {
  if (kind === "grand") {
    if (b.webs.some((w) => w.owner === src.side && w.kind === "grand")) return;
    b.webs.push({
      id: b.nid++,
      owner: src.side,
      kind: "grand",
      x: COLS / 2,
      y: ROWS / 2,
      half: 999, // the entire board
      slowPct: 0.5,
      dotDps: 500,
      snareDmg: 0,
      tickIn: 1,
      inside: new Set<number>(),
      rot: 0,
    });
    return;
  }
  b.webs.push({
    id: b.nid++,
    owner: src.side,
    kind: "snare",
    x: Math.min(COLS - 0.5, Math.max(0.5, Math.round(x - 0.5) + 0.5)),
    y: Math.min(ROWS - 0.5, Math.max(0.5, Math.round(y - 0.5) + 0.5)),
    half: 1.5, // 3x3 tiles
    slowPct: 0.3,
    dotDps: 0,
    snareDmg: 750,
    life: 5, // the 3x3 web dissolves after 5 seconds
    tickIn: 0,
    inside: new Set<number>(),
    rot: (b.nid % 7) * 0.13,
  });
}

const dist = (a: BUnit, b: BUnit) => Math.hypot(a.x - b.x, a.y - b.y);

function pop(b: BattleState, u: BUnit, text: string, kind: Pop["kind"]) {
  b.pops.push({ id: b.nid++, x: u.x, y: u.y - 0.25, text, life: kind === "skill" ? 1.1 : 0.85, kind });
  if (b.pops.length > 30) b.pops.shift();
}

function damage(b: BattleState, _src: BUnit, tgt: BUnit, raw: number, projectile = false) {
  if (tgt.dead) return;
  // Airborne: a diving dragonfly is metres above the soil. Nothing —
  // melee, shells, fields or traps — can touch it until touchdown.
  // (Zones/holes already exempted it; direct attacks did not, so the
  // ultimate could be killed mid-flight and silently lost.)
  if (tgt.dive && !tgt.dive.landed) return;
  // DESIGNER RULE: damage dealt equals the ATK stat, exactly.
  // A basic attack from a 254-ATK dragonfly pops "254" — what the stat
  // sheet says is what the hit does. There is NO hidden DEF/armour
  // mitigation any more (the old 100/(100+DEF) factor made a 254 ATK
  // hit land for 195, which read as a bug). `def` stays in the data
  // for possible future use but has no combat effect and is no longer
  // shown to players.
  // The only modifiers left are the two that are openly written on
  // the tin: the Worm-hole Vulnerable mark (1.5×, its tooltip says so)
  // and the dragonfly's Slipstream passive (50% vs non-projectiles,
  // its Codex entry says so). Skills multiply ATK exactly as stated
  // (e.g. Pincer Lock = 2.1 × ATK).
  const amp = tgt.vuln > 0 ? 1.5 : 1;
  const slipstream = tgt.bugId === "dragonfly" && !projectile ? 0.5 : 1;
  const dmg = Math.max(1, Math.round(raw * amp * slipstream));
  tgt.hp -= dmg;
  tgt.flash = 0.3;
  tgt.energy = Math.min(tgt.maxEnergy, tgt.energy + 8);
  pop(b, tgt, String(dmg), "dmg");
  if (tgt.hp <= 0) {
    tgt.hp = 0;
    tgt.dead = true;
    tgt.fade = 0.5;
    tgt.dive = null;
    pop(b, tgt, "KO", "ko");
  }
}

function heal(b: BattleState, u: BUnit, amt: number) {
  if (u.dead) return;
  const v = Math.round(Math.min(amt, u.maxHp - u.hp));
  if (v <= 0) return;
  u.hp += v;
  pop(b, u, "+" + v, "heal");
}

function enemiesOf(b: BattleState, side: "ally" | "foe") {
  return b.units.filter((u) => !u.dead && u.side !== side);
}
function alliesOf(b: BattleState, side: "ally" | "foe") {
  return b.units.filter((u) => !u.dead && u.side === side);
}

/** Returns false when the cast fizzles (caller should not spend energy). */
function castSkill(b: BattleState, u: BUnit, t: BUnit): boolean {
  // Defensive gate: a 1/2-star Dragonfly has Slipstream only, never Airstrike.
  if (!canCastSkill(u.bugId, u.star)) return false;
  if (u.bugId === "spider") {
    // After Web: spit a 3x3 web ball at the densest enemy group.
    const cluster = densestFoeCluster(b, u.side);
    const tx = cluster ? cluster.x : t.x;
    const ty = cluster ? cluster.y : t.y;
    u.cast = 0.55;
    spitWeb(b, u, "snare");
    // re-aim the pending ball at the cluster centroid (spitWeb staged it at
    // the spider's own tile for snare — retarget before it flies)
    const shot = b.shots[b.shots.length - 1];
    const pending = b.pending[b.pending.length - 1];
    if (shot && shot.kind === "websnare") {
      shot.x1 = tx;
      shot.y1 = ty;
      pending.x = tx;
      pending.y = ty;
    }
    return true;
  }
  if (u.bugId === "dragonfly") {
    // Airstrike: climb, sweep the board for the densest enemy group, dive,
    // and leave a field whose ticks scale with the whole living team's
    // combined ATK (2.2× total — see airstrike.ts). One dive, one field.
    const cluster = densestFoeCluster(b, u.side);
    if (!cluster) return false; // no foes to strike — keep the energy
    u.cast = AIRSTRIKE_FLIGHT;
    u.dive = {
      id: b.nid++,
      startAt: b.t,
      duration: AIRSTRIKE_FLIGHT,
      fromX: u.x,
      fromY: u.y,
      toX: cluster.x,
      toY: cluster.y,
      targetLocked: false,
      landed: false,
    };
    pop(b, u, "AIRSTRIKE", "skill");
    return true;
  }
  u.cast = 0.55;
  if (u.bugId === "stag") {
    damage(b, u, t, u.atk * 2.1);
    if (!t.dead) t.stun = 1.4;
    pop(b, t, "PINCER", "skill");
  } else if (u.bugId === "bomb") {
    fireShell(b, u, t, true);
  } else {
    const targets = enemiesOf(b, u.side)
      .filter((e) => dist(e, u) <= 4.6)
      .sort((a, c) => a.hp - c.hp)
      .slice(0, 3);
    for (const e of targets) damage(b, u, e, u.atk * 0.95);
    pop(b, t, "RAKE", "skill");
  }
  return true;
}

/** Bombardier: lob a shell. Damage is queued and lands when it arrives. */
function fireShell(b: BattleState, u: BUnit, t: BUnit, skill: boolean) {
  const d = dist(u, t);
  const dur = 0.24 + Math.min(0.34, d * 0.06);
  b.shots.push({
    id: b.nid++,
    fromUid: u.uid,
    kind: skill ? "burst" : "acid",
    size: u.star === 3 ? 1.5 : u.star === 2 ? 1.25 : 1,
    x0: u.x,
    y0: u.y,
    x1: t.x,
    y1: t.y,
    t0: b.t,
    dur,
  });
  b.pending.push({
    id: b.nid++,
    at: b.t + dur,
    fromUid: u.uid,
    targetUid: t.uid,
    x: t.x,
    y: t.y,
    raw: u.atk * (skill ? 1.5 : 1),
    aoe: skill ? 1.35 : 0,
    kind: skill ? "burst" : "acid",
  });
}

function attack(b: BattleState, u: BUnit, t: BUnit) {
  u.cd = u.atkCd;
  if (u.bugId === "spider") {
    // After Web on full Energy (3-star); below 3-star the Energy just sits.
    if (u.star >= 3 && u.energy >= u.maxEnergy && castSkill(b, u, t)) {
      u.energy = 0;
      return;
    }
    const enraged = u.enrageIn <= 0;
    if (enraged) u.enrageIn = enrageInterval(u.star);
    damage(b, u, t, u.atk * (enraged ? 2 : 1));
    if (enraged) {
      // the moment is the feedback: the spider always announces the
      // Enraged bite (before, the pop only showed when the target died,
      // which hid the passive almost every time)
      pop(b, u, "ENRAGED", "skill");
    }
    if (enraged && !t.dead) {
      // poison: 3 ticks, 1s apart, 50% ATK (80% at 3-star)
      t.poisonLeft = 3;
      t.poisonIn = 1;
      t.poisonDmg = Math.max(1, Math.round(u.atk * (u.star >= 3 ? 0.8 : 0.5)));
      pop(b, t, "POISON", "skill");
    }
    u.energy = Math.min(u.maxEnergy, u.energy + 20);
    if (!t.dead) t.energy = Math.min(t.maxEnergy, t.energy + 10);
    return;
  }
  if (u.bugId === "dragonfly") {
    // Airstrike is a 3-star ultimate. Lower tiers make a normal attack even
    // at full Energy — no cast state, no shots, no pending Airstrike hits.
    if (u.star >= 3 && u.energy >= u.maxEnergy && castSkill(b, u, t)) {
      u.energy = 0;
    } else {
      damage(b, u, t, u.atk);
      u.energy = Math.min(u.maxEnergy, u.energy + 20);
      if (!t.dead) t.energy = Math.min(t.maxEnergy, t.energy + 10);
    }
    return;
  }
  if (u.bugId === "bomb") {
    const skill = u.energy >= u.maxEnergy;
    if (skill) {
      u.energy = 0;
      u.cast = 0.55;
      pop(b, t, "BURST", "skill");
    } else {
      u.energy = Math.min(u.maxEnergy, u.energy + 20);
    }
    fireShell(b, u, t, skill);
    return;
  }
  if (u.energy >= u.maxEnergy) {
    u.energy = 0;
    castSkill(b, u, t);
  } else {
    damage(b, u, t, u.atk);
    u.energy = Math.min(u.maxEnergy, u.energy + 20);
    if (!t.dead) t.energy = Math.min(t.maxEnergy, t.energy + 10);
  }
}

function glow(b: BattleState, side: "ally" | "foe") {
  const a = alliesOf(b, side);
  if (!a.length) return;
  const wounded = a.slice().sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
  heal(b, wounded, wounded.maxHp * 0.12);
  wounded.energy = Math.min(wounded.maxEnergy, wounded.energy + 25);
  pop(b, wounded, "GLOW", "skill");
}


/** Resolve any shell whose flight time has elapsed. */
function resolveShells(b: BattleState) {
  if (!b.pending.length) return;
  const due: PendingHit[] = [];
  const keep: PendingHit[] = [];
  for (const p of b.pending) (p.at <= b.t ? due : keep).push(p);
  if (!due.length) return;
  b.pending = keep;
  for (const p of due) {
    const src = b.units.find((u) => u.uid === p.fromUid);
    if (!src || src.dead) continue;
    if (p.kind === "webgrand" || p.kind === "websnare") {
      landWeb(b, src, p.kind === "webgrand" ? "grand" : "snare", p.x, p.y);
      continue;
    }
    if (p.aoe > 0) {
      // Caustic Burst: splash everything clustered around the impact tile
      for (const e of b.units) {
        if (e.dead || e.side === src.side) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= p.aoe)
          damage(b, src, e, p.raw, p.kind === "acid" || p.kind === "burst");
      }
    } else {
      const tgt = b.units.find((u) => u.uid === p.targetUid && !u.dead);
      if (tgt) damage(b, src, tgt, p.raw, p.kind === "acid" || p.kind === "burst");
    }
  }
}

/**
 * Airstrike target acquisition: the cluster containing the most enemies
 * wins (ties break toward the greater total remaining HP, then the lower
 * average distance). Returns the cluster centroid so the field drops on
 * the group, not on a lone straggler.
 */
export function densestFoeCluster(
  b: BattleState,
  side: "ally" | "foe",
): { x: number; y: number; count: number; ids: number[] } | null {
  const foes = b.units.filter((u) => !u.dead && u.side !== side && !(u.dive && !u.dive.landed));
  if (!foes.length) return null;
  let best: { x: number; y: number; count: number; ids: number[]; hp: number; spread: number } | null = null;
  for (const anchor of foes) {
    const group = foes.filter((f) => Math.hypot(f.x - anchor.x, f.y - anchor.y) <= AIRSTRIKE_RADIUS);
    const hp = group.reduce((n, f) => n + f.hp, 0);
    const cx = group.reduce((n, f) => n + f.x, 0) / group.length;
    const cy = group.reduce((n, f) => n + f.y, 0) / group.length;
    const spread = group.reduce((n, f) => n + Math.hypot(f.x - cx, f.y - cy), 0) / group.length;
    const candidate = { x: cx, y: cy, count: group.length, ids: group.map((f) => f.uid), hp, spread };
    if (
      !best ||
      candidate.count > best.count ||
      (candidate.count === best.count && candidate.hp > best.hp) ||
      (candidate.count === best.count && candidate.hp === best.hp && candidate.spread < best.spread)
    ) {
      best = candidate;
    }
  }
  return best ? { x: best.x, y: best.y, count: best.count, ids: best.ids } : null;
}

/** The strongest hostile: highest star, then biggest health pool, then attack. */
function strongestFoe(b: BattleState, side: "ally" | "foe"): BUnit | null {
  let best: BUnit | null = null;
  for (const u of b.units) {
    if (u.dead || u.side === side) continue;
    if (isStrongerTarget(u, best)) best = u;
  }
  return best;
}

/** Dig Hole: burrow beneath the enemy's strongest bug. Called once at battle start. */
function digHole(b: BattleState, side: "ally" | "foe") {
  const target = strongestFoe(b, side);
  if (!target) return;
  if (b.holes.some((h) => h.owner === side)) return; // one burrow per side, ever
  const tx = Math.min(COLS - 0.5, Math.max(0.5, Math.floor(target.x) + 0.5));
  const ty = Math.min(ROWS - 0.5, Math.max(0.5, Math.floor(target.y) + 0.5));
  b.holes.push({
    id: b.nid++,
    owner: side,
    x: tx,
    y: ty,
    armed: true, // the pit opens underfoot — no warning
    spent: false,
    arm: 0,
    life: 40, // an untriggered pit waits all battle as a hazard
  });
  pop(b, target, "HOLE", "skill");
}

/** Arms, triggers and expires burrows. No digging here — holes are dug once at battle start. */
function stepHoles(b: BattleState, dt: number) {
  for (const h of b.holes) {
    h.life -= dt;
    if (h.spent) continue; // collapsing; never re-arms, never re-triggers
    if (!h.armed) {
      h.arm -= dt;
      if (h.arm <= 0) h.armed = true;
      continue;
    }
    for (const u of b.units) {
      if (u.dead || u.side === h.owner || (u.dive && !u.dive.landed)) continue;
      if (Math.hypot(u.x - h.x, u.y - h.y) <= 0.5) {
        u.stun = Math.max(u.stun, 2); // held for 2s
        u.vuln = 2; // and exposed for 2s (1.5x incoming)
        h.armed = false;
        h.spent = true;
        h.life = 0.5; // brief collapse animation, then gone
        pop(b, u, "TRAP!", "skill");
        break;
      }
    }
  }
  if (b.holes.some((h) => h.life <= 0)) b.holes = b.holes.filter((h) => h.life > 0);
}

/** Worst slow affecting the unit right now from enemy webs (0..0.5). */
export function webSlowMul(b: BattleState, u: BUnit): number {
  let slow = 0;
  for (const w of b.webs) {
    if (w.owner === u.side) continue;
    if (u.dead || (u.dive && !u.dive.landed)) continue;
    if (Math.hypot(u.x - w.x, u.y - w.y) <= w.half) slow = Math.max(slow, w.slowPct);
  }
  return 1 - slow;
}

/** Grand-web damage ticks + snare on-entry hits. Runs every step. */
function stepWebs(b: BattleState, dt: number) {
  if (!b.webs.length) return;
  // limited-life webs (After Web snares) dissolve when their timer runs out
  if (b.webs.some((w) => w.life !== undefined)) {
    b.webs = b.webs.filter((w) => w.life === undefined || (w.life -= dt) > 0);
    if (!b.webs.length) return;
  }
  for (const w of b.webs) {
    if (w.kind === "grand") {
      w.tickIn -= dt;
      if (w.tickIn <= 0) {
        w.tickIn = 1;
        const src = b.units.find((u) => !u.dead && u.side === w.owner) ?? b.units.find((u) => u.side === w.owner);
        for (const foe of b.units) {
          if (foe.dead || foe.side === w.owner || (foe.dive && !foe.dive.landed)) continue;
          if (Math.hypot(foe.x - w.x, foe.y - w.y) <= w.half) damage(b, src ?? foe, foe, w.dotDps);
        }
      }
    } else {
      for (const u of b.units) {
        if (u.dead || u.side === w.owner || (u.dive && !u.dive.landed)) continue;
        const inNow = Math.hypot(u.x - w.x, u.y - w.y) <= w.half;
        const was = w.inside.has(u.uid);
        if (inNow && !was) {
          w.inside.add(u.uid);
          const src = b.units.find((s2) => !s2.dead && s2.side === w.owner) ?? b.units.find((s2) => s2.side === w.owner);
          damage(b, src ?? u, u, w.snareDmg);
          pop(b, u, "SNARED!", "skill");
        } else if (!inNow && was) {
          w.inside.delete(u.uid);
        }
      }
    }
  }
}

const divePose = createAirstrikePose();

/** Move the actual unit through its flight; only its own touchdown creates a field. */
function stepAirstrikeDives(b: BattleState) {
  for (const unit of b.units) {
    const dive = unit.dive;
    if (!dive) continue;
    if (unit.dead) {
      unit.dive = null;
      unit.cast = 0;
      continue;
    }
    if (!dive.targetLocked && b.t >= dive.startAt + dive.duration * AIRSTRIKE_LOCK_PROGRESS) {
      // Recheck from the top of the climb, while the unit is still over its
      // takeoff point. Enemies may have moved since Energy filled.
      const cluster = densestFoeCluster(b, unit.side);
      if (cluster) {
        dive.toX = cluster.x;
        dive.toY = cluster.y;
      }
      dive.targetLocked = true;
    }
    const pose = sampleAirstrikeDive(dive, b.t, divePose);
    unit.x = pose.x;
    unit.y = pose.y;
    const landsAt = dive.startAt + dive.duration;
    if (!dive.landed && b.t + 1e-9 >= landsAt) {
      dive.landed = true;
      unit.x = dive.toX;
      unit.y = dive.toY;
      unit.cast = 0;
      unit.cd = unit.atkCd;
      const combinedAtk = combinedTeamAtk(b, unit.side);
      b.zones.push({
        id: dive.id,
        owner: unit.side,
        srcUid: unit.uid,
        x: unit.x,
        y: unit.y,
        radius: AIRSTRIKE_RADIUS,
        dps: airstrikeTickDamage(combinedAtk),
        combinedAtk,
        remaining: AIRSTRIKE_SECONDS,
        tickIn: 0,
        ticks: 0,
        createdAt: b.t,
        expiresAt: b.t + AIRSTRIKE_SECONDS,
      });
      pop(b, unit, "TOUCHDOWN", "skill");
    }
    if (dive.landed && b.t >= landsAt + AIRSTRIKE_RECOVERY) unit.dive = null;
  }
}

/**
 * Landing tick, another tick at +1s, expiry exactly +2s after touchdown.
 * Every tick is priced from the owner's team ATK *right now*: kill the
 * dragonfly's allies before a tick and that tick lands softer.
 */
function stepZones(b: BattleState) {
  if (!b.zones.length) return;
  for (const z of b.zones) {
    z.remaining = Math.max(0, z.expiresAt - b.t);
    while (z.ticks < AIRSTRIKE_SECONDS && b.t + 1e-9 >= z.createdAt + z.ticks) {
      z.ticks++;
      const combined = combinedTeamAtk(b, z.owner);
      if (combined > 0) {
        z.combinedAtk = combined;
        z.dps = airstrikeTickDamage(combined);
      }
      const src = b.units.find((u) => u.uid === z.srcUid);
      for (const foe of b.units) {
        if (foe.dead || foe.side === z.owner || (foe.dive && !foe.dive.landed)) continue;
        if (Math.hypot(foe.x - z.x, foe.y - z.y) <= z.radius) {
          damage(b, src ?? foe, foe, z.dps);
        }
      }
    }
    z.tickIn = Math.max(0, z.createdAt + z.ticks - b.t);
  }
  if (b.zones.some((z) => z.remaining <= 1e-9)) b.zones = b.zones.filter((z) => z.remaining > 1e-9);
}

export function stepBattle(b: BattleState, dt: number): BattleState {
  if (b.over) return b;
  b.t += dt;

  for (const u of b.units) {
    if (u.dead) {
      u.fade -= dt;
      continue;
    }
    u.cd = Math.max(0, u.cd - dt);
    u.stun = Math.max(0, u.stun - dt);
    u.vuln = Math.max(0, u.vuln - dt);
    u.flash = Math.max(0, u.flash - dt);
    u.cast = Math.max(0, u.cast - dt);
    u.enrageIn = Math.max(0, u.enrageIn - dt);
    if (u.poisonLeft > 0 && !u.dead) {
      u.poisonIn -= dt;
      if (u.poisonIn <= 0) {
        u.poisonIn = 1;
        u.poisonLeft -= 1;
        damage(b, u, u, u.poisonDmg);
      }
    }
  }

  resolveShells(b);
  stepAirstrikeDives(b);
  stepZones(b);
  stepWebs(b, dt);

  b.glowA -= dt;
  if (b.glowA <= 0) {
    b.glowA = 5;
    if (b.cmdA === "lampyris") glow(b, "ally");
  }
  b.glowB -= dt;
  if (b.glowB <= 0) {
    b.glowB = 5;
    if (b.cmdB === "lampyris") glow(b, "foe");
  }

  const liveAlly: BUnit[] = [];
  const liveFoe: BUnit[] = [];
  const live: BUnit[] = [];
  for (let i = 0; i < b.units.length; i++) {
    const u = b.units[i];
    if (!u.dead) {
      live.push(u);
      if (u.side === "ally") liveAlly.push(u);
      else liveFoe.push(u);
    }
  }

  for (let li = 0; li < live.length; li++) {
    const u = live[li];
    if (u.dead || u.stun > 0 || u.dive) continue;
    const foes = u.side === "ally" ? liveFoe : liveAlly;
    if (!foes.length) continue;
    let t: BUnit | null = null;
    let best = Infinity;
    for (let i = 0; i < foes.length; i++) {
      if (foes[i].dead) continue;
      if (foes[i].dive && !foes[i].dive!.landed) continue; // airborne — cannot be targeted
      const d = dist(u, foes[i]);
      if (!t || d < best - 0.001 || (Math.abs(d - best) < 0.001 && foes[i].hp < t.hp)) {
        best = d;
        t = foes[i];
      }
    }
    if (!t) continue;
    // A charged 3-star Dragonfly can take off before reaching melee range.
    if (u.bugId === "dragonfly" && canCastSkill(u.bugId, u.star) && u.energy >= u.maxEnergy && u.cd <= 0) {
      attack(b, u, t);
    } else if (best <= u.range) {
      if (u.cd <= 0) attack(b, u, t);
    } else {
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const len = Math.hypot(dx, dy) || 1;
      const step = u.spd * webSlowMul(b, u) * dt;
      u.x = Math.max(0.3, Math.min(COLS - 0.3, u.x + (dx / len) * step));
      u.y = Math.max(0.3, Math.min(ROWS - 0.3, u.y + (dy / len) * step));
    }
  }

  // soft separation so bodies do not stack
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const c = live[j];
      if (a.dead || c.dead || a.dive || c.dive || a.side !== c.side) continue;
      let dx = c.x - a.x;
      let dy = c.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d < 0.62) {
        if (d < 0.001) {
          dx = 0.05;
          dy = 0.05;
          d = 0.07;
        }
        const push = (0.62 - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x = Math.max(0.3, Math.min(COLS - 0.3, a.x - ux * push));
        a.y = Math.max(0.3, Math.min(ROWS - 0.3, a.y - uy * push));
        c.x = Math.max(0.3, Math.min(COLS - 0.3, c.x + ux * push));
        c.y = Math.max(0.3, Math.min(ROWS - 0.3, c.y + uy * push));
      }
    }
  }

  stepHoles(b, dt);

  // retire spent shells
  if (b.shots.some((sh) => b.t > sh.t0 + sh.dur + 0.2))
    b.shots = b.shots.filter((sh) => b.t <= sh.t0 + sh.dur + 0.2);

  for (const p of b.pops) p.life -= dt;
  if (b.pops.some((p) => p.life <= 0)) b.pops = b.pops.filter((p) => p.life > 0);

  const allyAlive = b.units.some((u) => !u.dead && u.side === "ally");
  const foeAlive = b.units.some((u) => !u.dead && u.side === "foe");
  if (!foeAlive) b.over = "ally";
  else if (!allyAlive) b.over = "foe";
  else if (b.t > 40) {
    const frac = (s: "ally" | "foe") => {
      const a = b.units.filter((u) => u.side === s);
      return a.reduce((n, u) => n + u.hp / u.maxHp, 0) / Math.max(1, a.length);
    };
    b.over = frac("ally") >= frac("foe") ? "ally" : "foe";
  }

  return { ...b };
}

// ── bot teams ────────────────────────────────────────────────
const FRONT = [3, 4, 2, 5, 1, 6, 0];
const MID = [2, 4, 1, 5, 3, 6, 0];
const BACK = [3, 2, 4, 1, 5, 6, 0];

export function makeFoeTeam(botIdx: number, round: number): PrepUnit[] {
  const bot = BOTS[botIdx];
  const count = Math.max(2, Math.min(MAX_FIELD_SIZE, Math.round((2 + Math.floor(round / 2)) * bot.power)));
  const used = new Set<number>();
  const out: PrepUnit[] = [];
  for (let i = 0; i < count; i++) {
    const bugId = bot.lean[i % bot.lean.length];
    const row = bugId === "stag" ? FRONT : bugId === "mantis" || bugId === "dragonfly" || bugId === "spider" ? MID : BACK;
    let slot = -1;
    for (const c of row) {
      const base = bugId === "stag" ? 14 : bugId === "mantis" || bugId === "dragonfly" || bugId === "spider" ? 7 : 0;
      const s = base + c;
      if (!used.has(s)) {
        slot = s;
        break;
      }
    }
    if (slot < 0) {
      for (let s = 0; s < BOARD_SLOTS; s++)
        if (!used.has(s)) {
          slot = s;
          break;
        }
    }
    if (slot < 0) break;
    used.add(slot);
    let star = 1;
    if (round >= 2 && i === 0) star = 2;
    if (round >= 4 && i < 3) star = 2;
    if (round >= 6) star = 2;
    if (round >= 9 && i < Math.min(count, 1 + Math.floor((round - 9) / 3))) star = 3;
    out.push({ uid: nextUid(), bugId, star, zone: "board", slot });
  }
  return out;
}

/** Picks the ideal tactical slot on the ally board based on bug role */
export function smartSlotFor(bugId: BugId, units: PrepUnit[]): number {
  const used = new Set<number>();
  for (const u of units) if (u.zone === "board") used.add(u.slot);
  // Stag -> front, assassins -> midfield, artillery -> rear.
  const prefCols = bugId === "stag" ? FRONT : bugId === "mantis" || bugId === "dragonfly" || bugId === "spider" ? MID : BACK;
  const prefRows =
    bugId === "stag" ? [0, 7, 14] : bugId === "mantis" || bugId === "dragonfly" || bugId === "spider" ? [7, 0, 14] : [14, 7, 0];
  for (const rowBase of prefRows) {
    for (const c of prefCols) {
      const s = rowBase + c;
      if (!used.has(s)) return s;
    }
  }
  return -1;
}

/* ── Streak economy ──────────────────────────────────────────
   A continuing run pays out; a broken run flips to ±1.        */
export const streakBonus = (s: number): number => {
  const a = Math.abs(s);
  return a >= 5 ? 4 : a >= 4 ? 3 : a >= 3 ? 2 : a >= 2 ? 1 : 0;
};

export const advanceStreak = (streak: number, win: boolean): number =>
  win ? (streak >= 0 ? streak + 1 : 1) : streak <= 0 ? streak - 1 : -1;
