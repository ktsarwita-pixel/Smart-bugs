import { BUGS, BUG_ORDER, type BugId, type CmdId } from "./data";
import { compareStrength, statsFor, type PrepUnit } from "./engine";

export const PRESSURE_GOLD = 25;
export const INCOMES_COOLDOWN = 2;
export const WORM_INTERVAL = 3;
export const WORM_CAP = 5;

export interface CommanderProgress {
  charges: number;
  readyRound: number;
  pressure: "waiting" | "paid" | { dueRound: number };
}

export const freshCommander = (): CommanderProgress => ({ charges: 0, readyRound: 0, pressure: "waiting" });

/** Called once per settled round. Streak is the new (signed) match streak. */
export function settleCommander(progress: CommanderProgress, cmd: CmdId, round: number, streak: number) {
  let { charges, pressure } = progress;
  const payout = cmd === "matriarch" && typeof pressure === "object" && round >= pressure.dueRound;
  if (cmd === "matriarch") {
    if (streak > 0 && streak % 2 === 0) charges++;
    if (payout) pressure = "paid";
    else if (pressure === "waiting" && streak === -3) pressure = { dueRound: round + 1 };
  } else if (cmd === "worm" && (round + 1) % WORM_INTERVAL === 0) {
    charges = Math.min(WORM_CAP, charges + 1);
  }
  return { progress: { ...progress, charges, pressure }, payout };
}

export function incomeFrom(progress: CommanderProgress, round: number, target: PrepUnit) {
  if (progress.charges === 0 || round < progress.readyRound) return null;
  return {
    gold: BUGS[target.bugId].cost + 1,
    progress: { ...progress, charges: progress.charges - 1, readyRound: round + INCOMES_COOLDOWN },
  };
}

/** Both board and bench compete by the same strength ranking as Trap holes. */
export function strongestOwned(units: readonly PrepUnit[]): BugId | null {
  const ranked = units.map((u) => {
    const { hp: maxHp, atk } = statsFor(u.bugId, u.star);
    return { ...u, maxHp, atk };
  }).sort(compareStrength);
  return ranked[0]?.bugId ?? null;
}

export function eatAndSpit(progress: CommanderProgress, target: PrepUnit, random = Math.random) {
  if (progress.charges === 0 || target.zone !== "bench") return null;
  const role = BUGS[target.bugId].role;
  const sameRole = BUG_ORDER.filter((id) => BUGS[id].role === role);
  const pick = (ids: BugId[]) => ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
  return {
    rewards: [pick(sameRole), pick(BUG_ORDER)],
    progress: { ...progress, charges: progress.charges - 1 },
  };
}
