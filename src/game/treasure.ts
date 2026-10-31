import { createBattle, nextUid, statsFor, type BattleState, type PrepUnit } from './engine';
import type { CmdId } from './data';

/** Only the first and fourth global rounds are treasure encounters. */
export function treasureRound(round: number): 1 | 4 | null {
  return round === 0 ? 1 : round === 3 ? 4 : null;
}
export function treasureGuardTeam(round: number): PrepUnit[] {
  const specs = treasureRound(round) === 1
    ? [['stag', 1, 9], ['stag', 1, 11]] as const
    : [['bomb', 1, 8], ['dragonfly', 2, 10], ['bomb', 1, 12]] as const;
  return specs.map(([bugId, star, slot]) => ({ uid: nextUid(), bugId, star, slot, zone: 'board' }));
}
export function createTreasureBattle(allies: PrepUnit[], cmd: CmdId, round: number): BattleState {
  // Matriarch has no periodic ability; replace its stat bonuses with the
  // specified neutral-guard multiplier, so these are not commander buffs.
  const b = createBattle(allies, treasureGuardTeam(round), cmd, 'matriarch');
  const multiplier = treasureRound(round) === 1 ? 1.15 : 1.10;
  for (const u of b.units) if (u.side === 'foe') {
    const base = statsFor(u.bugId, u.star);
    u.maxHp = u.hp = Math.round(base.hp * multiplier);
    u.atk = Math.round(base.atk * multiplier);
    u.def = Math.round(base.def * multiplier);
    u.treasureGuard = true;
  }
  return b;
}
