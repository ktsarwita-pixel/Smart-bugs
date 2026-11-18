// ─────────────────────────────────────────────────────────────
// COLONY BONDS — role synergies (v0.8)
//
// Every bug already carried a role (Frontline / Artillery / Assassin) that
// did nothing mechanically. Bonds turn the role into a line-building
// decision: field 2 bugs of one role for its first tier, 4 for the second.
//
// Design rules this module keeps:
//  · Bonds only change numbers the stat sheet already shows (max HP, ATK,
//    attack delay). There is still no hidden damage modifier — a hit deals
//    exactly the ATK on the card.
//  · Both sides are counted by the same function, so rival colonies get the
//    same bonds from their line-ups. Nothing here is player-only.
//  · Counting is per fielded bug, not per species: two Stag Beetles are two
//    Frontline bugs.
// ─────────────────────────────────────────────────────────────
import { BUGS, type BugDef, type BugId } from "./data";

export type Role = BugDef["role"];
export type BondLevel = 0 | 1 | 2;
export type BondLevels = Record<Role, BondLevel>;
export type BondCounts = Record<Role, number>;

export const ROLE_ORDER: Role[] = ["Frontline", "Artillery", "Assassin"];

/** Fielded bugs of one role needed for tier 1 and tier 2. */
export const BOND_TIERS = [2, 4] as const;

export interface BondDef {
  role: Role;
  name: string;
  accent: string;
  /** Which stat-sheet number the bond moves. */
  stat: "hp" | "atk" | "haste";
  /** Bonus at tier 1 and tier 2, as a fraction. */
  pct: readonly [number, number];
  /** English template for the effect; {n} is the percentage. */
  effect: string;
  /** Compact form of `effect` for the chip on narrow screens. */
  short: string;
  desc: string;
}

export const BONDS: Record<Role, BondDef> = {
  Frontline: {
    role: "Frontline",
    name: "Shield Wall",
    accent: "#4FD3A0",
    stat: "hp",
    pct: [0.12, 0.25],
    effect: "+{n}% max HP",
    short: "+{n}% HP",
    desc: "Field 2 Frontline bugs and each of them gains +12% max HP. Field 4 for +25%.",
  },
  Artillery: {
    role: "Artillery",
    name: "Battery",
    accent: "#7FA8DC",
    stat: "atk",
    pct: [0.15, 0.3],
    effect: "+{n}% ATK",
    short: "+{n}% ATK",
    desc: "Field 2 Artillery bugs and each of them gains +15% ATK. Field 4 for +30%.",
  },
  Assassin: {
    role: "Assassin",
    name: "Ambush",
    accent: "#88E899",
    stat: "haste",
    pct: [0.1, 0.2],
    effect: "-{n}% attack delay",
    short: "-{n}% delay",
    desc: "Field 2 Assassin bugs and each of them attacks with a 10% shorter delay. Field 4 for 20%.",
  },
};

export const NO_BONDS: BondLevels = Object.freeze({ Frontline: 0, Artillery: 0, Assassin: 0 }) as BondLevels;

export const roleOf = (bugId: BugId): Role => BUGS[bugId].role;

/** How many fielded bugs share each role. */
export function bondCounts(bugIds: readonly BugId[]): BondCounts {
  const counts: BondCounts = { Frontline: 0, Artillery: 0, Assassin: 0 };
  for (const id of bugIds) counts[roleOf(id)] += 1;
  return counts;
}

export const levelForCount = (count: number): BondLevel =>
  count >= BOND_TIERS[1] ? 2 : count >= BOND_TIERS[0] ? 1 : 0;

/** Active bond tier per role for a fielded line. */
export function bondLevels(bugIds: readonly BugId[]): BondLevels {
  const counts = bondCounts(bugIds);
  return {
    Frontline: levelForCount(counts.Frontline),
    Artillery: levelForCount(counts.Artillery),
    Assassin: levelForCount(counts.Assassin),
  };
}

/** The bonus fraction a bond grants at a tier (0 when inactive). */
export const bondPct = (role: Role, level: BondLevel): number =>
  level === 0 ? 0 : BONDS[role].pct[level - 1];

/** Whole-number percentage for labels (12, 25, …). */
export const bondPercent = (role: Role, level: BondLevel): number =>
  Math.round(bondPct(role, level) * 100);

/**
 * Stat multipliers one bug receives from its own role's bond.
 * A bond never buffs bugs of another role.
 */
export function bondMods(bugId: BugId, levels: BondLevels = NO_BONDS) {
  const role = roleOf(bugId);
  const pct = bondPct(role, levels[role] ?? 0);
  const stat = BONDS[role].stat;
  return {
    hpMul: stat === "hp" ? 1 + pct : 1,
    atkMul: stat === "atk" ? 1 + pct : 1,
    cdMul: stat === "haste" ? 1 - pct : 1,
  };
}

/** Bugs still needed to reach the next tier, or 0 at the top tier. */
export function bondNeed(count: number): number {
  if (count < BOND_TIERS[0]) return BOND_TIERS[0] - count;
  if (count < BOND_TIERS[1]) return BOND_TIERS[1] - count;
  return 0;
}

export const anyBondActive = (levels: BondLevels): boolean =>
  ROLE_ORDER.some((r) => levels[r] > 0);
