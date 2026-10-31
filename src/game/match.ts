import { BOTS, STARTING_COLONY_HP, type CmdId } from "./data";
import { createBattle, makeFoeTeam, stepBattle, type BattleState, type PrepUnit } from "./engine";

import { createTreasureBattle, treasureRound } from "./treasure";

export const TREASURE_ID = "treasure-guards";
export const PLAYER_ID = "you";

export interface Colony {
  id: string;
  botIdx: number | null;
  commander: CmdId;
  hp: number;
  place: number | null;
  eliminatedRound: number | null;
}

export interface RoundFixture {
  aId: string;
  bId: string;
  /** The B colony is an echo: its real HP cannot change in this fixture. */
  echo: boolean;
}

export interface DuelResult extends RoundFixture {
  winnerId: string;
  loserId: string;
  damage: number;
  survivors: number;
}

export interface RoundSummary {
  round: number;
  duels: DuelResult[];
  eliminatedIds: string[];
}

export interface MatchState {
  /** Zero-based, without a fixed final round. */
  round: number;
  colonies: Colony[];
  winnerId: string | null;
  lastRound: RoundSummary | null;
}

export function createMatch(commander: CmdId = "matriarch"): MatchState {
  return {
    round: 0,
    colonies: [
      { id: PLAYER_ID, botIdx: null, commander, hp: STARTING_COLONY_HP, place: null, eliminatedRound: null },
      ...BOTS.map((b, botIdx) => ({
        id: b.id,
        botIdx,
        commander: b.cmd,
        hp: STARTING_COLONY_HP,
        place: null,
        eliminatedRound: null,
      })),
    ],
    winnerId: null,
    lastRound: null,
  };
}

export function colonyName(id: string): string {
  return id === TREASURE_ID ? "Treasure Guards" : id === PLAYER_ID ? "Your Colony" : BOTS.find((b) => b.id === id)?.name ?? id;
}

export function survivingColonies(match: MatchState): Colony[] {
  return match.colonies.filter((c) => c.hp > 0);
}

/** Rotation covers every opponent; an odd survivor fights a harmless rival echo. */
export function getRoundFixtures(match: MatchState): RoundFixture[] {
  const active = survivingColonies(match);
  if (match.winnerId || active.length < 2) return [];
  if (treasureRound(match.round)) return active.map((c) => ({ aId: c.id, bId: TREASURE_ID, echo: false }));
  const echoPlayer = active.length % 2 ? active[match.round % active.length] : null;
  const paired = active.filter((c) => c !== echoPlayer);
  const rotating = paired.slice(1);
  const offset = match.round % Math.max(1, rotating.length);
  const order = [paired[0], ...rotating.slice(offset), ...rotating.slice(0, offset)];
  const fixtures: RoundFixture[] = [];
  for (let i = 0; i < order.length; i += 2) {
    fixtures.push({ aId: order[i].id, bId: order[i + 1].id, echo: false });
  }
  if (echoPlayer) {
    const echoes = active.filter((c) => c !== echoPlayer);
    fixtures.push({
      aId: echoPlayer.id,
      bId: echoes[match.round % echoes.length].id,
      echo: true,
    });
  }
  return fixtures;
}

export function playerFixture(match: MatchState): RoundFixture | null {
  return getRoundFixtures(match).find((f) => f.aId === PLAYER_ID || (!f.echo && f.bId === PLAYER_ID)) ?? null;
}

export function opposingColony(match: MatchState): Colony | null {
  const fixture = playerFixture(match);
  if (!fixture) return null;
  const id = fixture.aId === PLAYER_ID ? fixture.bId : fixture.aId;
  return match.colonies.find((c) => c.id === id) ?? null;
}

export function colonyDamage(round: number, survivors: number): number {
  return 6 + Math.max(0, round) * 2 + Math.max(0, survivors) * 2;
}

const mirroredSlot = (slot: number) => (2 - Math.floor(slot / 7)) * 7 + slot % 7;

function teamFor(colony: Colony, round: number, side: "ally" | "foe", playerTeam: PrepUnit[]): PrepUnit[] {
  const isPlayer = colony.id === PLAYER_ID;
  const team = isPlayer ? playerTeam.filter((u) => u.zone === "board") : makeFoeTeam(colony.botIdx!, round);
  // Bot layouts are authored on the enemy half; player layouts are on the ally half.
  const mirror = isPlayer ? side === "foe" : side === "ally";
  return team.map((u) => ({ ...u, slot: mirror ? mirroredSlot(u.slot) : u.slot }));
}

function simulateDuel(match: MatchState, fixture: RoundFixture, playerTeam: PrepUnit[]): BattleState {
  const a = match.colonies.find((c) => c.id === fixture.aId)!;
  const b = match.colonies.find((c) => c.id === fixture.bId)!;
  let battle = createBattle(
    teamFor(a, match.round, "ally", playerTeam),
    teamFor(b, match.round, "foe", playerTeam),
    a.commander,
    b.commander,
  );
  for (let tick = 0; !battle.over && tick < 420; tick++) battle = stepBattle(battle, 0.1);
  return battle;
}

/** Settle a whole round atomically. Only losers lose HP; dead colonies never return. */
export function resolveMatchRound(
  match: MatchState,
  playerBattle: BattleState | null = null,
  playerTeam: PrepUnit[] = [],
): MatchState {
  if (match.winnerId || match.lastRound?.round === match.round) return match;
  const survivors = survivingColonies(match);
  if (survivors.length === 1) {
    return {
      ...match,
      winnerId: survivors[0].id,
      colonies: match.colonies.map((c) => c.id === survivors[0].id ? { ...c, place: 1 } : c),
    };
  }
  const fixtures = getRoundFixtures(match);
  if (treasureRound(match.round)) {
    if (survivors.some(c => c.id === PLAYER_ID) && !playerBattle?.over) return match;
    const duels: DuelResult[] = fixtures.map(fixture => {
      const colony = survivors.find(c => c.id === fixture.aId)!;
      let battle = colony.id === PLAYER_ID ? playerBattle! : createTreasureBattle(teamFor(colony, match.round, "ally", playerTeam), colony.commander, match.round);
      if (colony.id !== PLAYER_ID) for (let tick = 0; !battle.over && tick < 420; tick++) battle = stepBattle(battle, 0.1);
      const won = battle.over === "ally";
      return { ...fixture, winnerId: won ? colony.id : TREASURE_ID, loserId: won ? TREASURE_ID : colony.id, damage: 0, survivors: battle.units.filter(u => !u.dead && u.side === (won ? "ally" : "foe")).length };
    });
    return { ...match, lastRound: { round: match.round, duels, eliminatedIds: [] } };
  }
  const playerRound = playerFixture(match);
  // The human's live battle must be finished before the round can settle.
  if (playerRound && !playerBattle?.over) return match;

  const colonies = match.colonies.map((c) => ({ ...c }));
  const duels: DuelResult[] = [];
  for (const fixture of fixtures) {
    const isLiveBattle = fixture.aId === PLAYER_ID || (!fixture.echo && fixture.bId === PLAYER_ID);
    const battle = isLiveBattle ? playerBattle! : simulateDuel(match, fixture, playerTeam);
    const playerWon = isLiveBattle && battle.over === "ally";
    const winnerId = isLiveBattle
      ? playerWon ? PLAYER_ID : (fixture.aId === PLAYER_ID ? fixture.bId : fixture.aId)
      : battle.over === "ally" ? fixture.aId : fixture.bId;
    const loserId = winnerId === fixture.aId ? fixture.bId : fixture.aId;
    const winningSide = isLiveBattle ? (playerWon ? "ally" : "foe") : (battle.over === "ally" ? "ally" : "foe");
    const remaining = battle.units.filter((u) => !u.dead && u.side === winningSide).length;
    const damage = fixture.echo && loserId === fixture.bId ? 0 : colonyDamage(match.round, remaining);
    const loser = colonies.find((c) => c.id === loserId)!;
    loser.hp = Math.max(0, loser.hp - damage);
    duels.push({ ...fixture, winnerId, loserId, damage, survivors: remaining });
  }

  // Same-round knockouts rank by HP entering the round, then less overkill, then ID.
  const eliminated = colonies.filter((c) => c.hp === 0 && c.place === null).sort((a, b) => {
    const beforeA = match.colonies.find((c) => c.id === a.id)!.hp;
    const beforeB = match.colonies.find((c) => c.id === b.id)!.hp;
    const damageA = duels.find((d) => d.loserId === a.id && d.damage > 0)!.damage;
    const damageB = duels.find((d) => d.loserId === b.id && d.damage > 0)!.damage;
    return beforeA - beforeB || damageB - damageA || a.id.localeCompare(b.id);
  });
  let place = survivors.length;
  for (const colony of eliminated) {
    colony.place = place--;
    colony.eliminatedRound = match.round;
  }
  const active = colonies.filter((c) => c.hp > 0);
  const winnerId = active.length === 1 ? active[0].id : null;
  if (winnerId) active[0].place = 1;
  return {
    ...match,
    colonies,
    winnerId,
    lastRound: { round: match.round, duels, eliminatedIds: eliminated.map((c) => c.id) },
  };
}

export function advanceMatchRound(match: MatchState): MatchState {
  if (match.winnerId || match.lastRound?.round !== match.round) return match;
  return { ...match, round: match.round + 1 };
}

export function rankedColonies(match: MatchState): Colony[] {
  return [...match.colonies].sort((a, b) => {
    if (a.hp > 0 && b.hp === 0) return -1;
    if (b.hp > 0 && a.hp === 0) return 1;
    return (a.place ?? Infinity) - (b.place ?? Infinity) || b.hp - a.hp || a.id.localeCompare(b.id);
  });
}
