// ─────────────────────────────────────────────────────────────
// SMART BUGS — career record (v0.8)
//
// Finished matches used to vanish the moment you pressed NEW MATCH. This
// keeps a small lifetime record in localStorage: matches, championships,
// podiums, best finish, longest win streak and a per-commander tally.
//
// A match is recorded once, when the player's final place is known (pinned
// or crowned). Abandoned matches are not counted.
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from "react";
import type { CmdId } from "./data";

export interface CommanderTally {
  matches: number;
  wins: number;
}

export interface Career {
  matches: number;
  /** Matches finished as the last colony standing. */
  wins: number;
  /** Top-three finishes, championships included. */
  podiums: number;
  bestPlace: number | null;
  lastPlace: number | null;
  /** Longest run of round wins inside a single match. */
  bestStreak: number;
  roundsPlayed: number;
  roundsWon: number;
  byCmd: Partial<Record<CmdId, CommanderTally>>;
}

export interface MatchRecord {
  place: number;
  commander: CmdId;
  roundsPlayed: number;
  roundsWon: number;
  bestStreak: number;
}

export interface RecordOutcome {
  career: Career;
  /** A strictly better finish than any earlier match (never true on the first). */
  newBestPlace: boolean;
  /** A longer win streak than any earlier match (never true on the first). */
  newBestStreak: boolean;
  firstChampionship: boolean;
}

const KEY = "smartbugs.career";

export const EMPTY_CAREER: Career = Object.freeze({
  matches: 0,
  wins: 0,
  podiums: 0,
  bestPlace: null,
  lastPlace: null,
  bestStreak: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  byCmd: {},
}) as Career;

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const place = (v: unknown): number | null => (count(v) >= 1 ? count(v) : null);

/** Accepts anything from storage and returns a well-formed record. */
export function sanitizeCareer(raw: unknown): Career {
  if (!raw || typeof raw !== "object") return EMPTY_CAREER;
  const r = raw as Record<string, unknown>;
  const byCmd: Career["byCmd"] = {};
  if (r.byCmd && typeof r.byCmd === "object") {
    for (const [id, tally] of Object.entries(r.byCmd as Record<string, unknown>)) {
      if (!tally || typeof tally !== "object") continue;
      const tt = tally as Record<string, unknown>;
      const matches = count(tt.matches);
      if (matches > 0) byCmd[id as CmdId] = { matches, wins: Math.min(matches, count(tt.wins)) };
    }
  }
  const matches = count(r.matches);
  const roundsPlayed = count(r.roundsPlayed);
  return {
    matches,
    wins: Math.min(matches, count(r.wins)),
    podiums: Math.min(matches, count(r.podiums)),
    bestPlace: matches > 0 ? place(r.bestPlace) : null,
    lastPlace: matches > 0 ? place(r.lastPlace) : null,
    bestStreak: count(r.bestStreak),
    roundsPlayed,
    roundsWon: Math.min(roundsPlayed, count(r.roundsWon)),
    byCmd,
  };
}

/** Pure: fold one finished match into the record. */
export function recordMatch(prev: Career, m: MatchRecord): RecordOutcome {
  const finish = Math.max(1, Math.floor(m.place));
  const won = finish === 1;
  const tally = prev.byCmd[m.commander] ?? { matches: 0, wins: 0 };
  const streak = Math.max(0, Math.floor(m.bestStreak));
  const career: Career = {
    matches: prev.matches + 1,
    wins: prev.wins + (won ? 1 : 0),
    podiums: prev.podiums + (finish <= 3 ? 1 : 0),
    bestPlace: prev.bestPlace === null ? finish : Math.min(prev.bestPlace, finish),
    lastPlace: finish,
    bestStreak: Math.max(prev.bestStreak, streak),
    roundsPlayed: prev.roundsPlayed + Math.max(0, Math.floor(m.roundsPlayed)),
    roundsWon: prev.roundsWon + Math.max(0, Math.floor(m.roundsWon)),
    byCmd: { ...prev.byCmd, [m.commander]: { matches: tally.matches + 1, wins: tally.wins + (won ? 1 : 0) } },
  };
  return {
    career,
    newBestPlace: prev.bestPlace !== null && finish < prev.bestPlace,
    newBestStreak: prev.matches > 0 && streak > prev.bestStreak,
    firstChampionship: won && prev.wins === 0,
  };
}

/** Share of round fights won, as a whole percentage (0 with no rounds). */
export const roundWinRate = (c: Career): number =>
  c.roundsPlayed > 0 ? Math.round((c.roundsWon / c.roundsPlayed) * 100) : 0;

/** The commander with the most championships, then most matches. */
export function favouriteCommander(c: Career): CmdId | null {
  let best: CmdId | null = null;
  let bestTally: CommanderTally | null = null;
  for (const [id, tally] of Object.entries(c.byCmd) as [CmdId, CommanderTally][]) {
    if (!bestTally || tally.wins > bestTally.wins || (tally.wins === bestTally.wins && tally.matches > bestTally.matches)) {
      best = id;
      bestTally = tally;
    }
  }
  return best;
}

// ── storage-backed store ─────────────────────────────────────
function load(): Career {
  try {
    return sanitizeCareer(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return EMPTY_CAREER;
  }
}

let current: Career = typeof localStorage === "undefined" ? EMPTY_CAREER : load();
const listeners = new Set<() => void>();

function commit(next: Career) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode — keep it in memory */ }
  listeners.forEach((l) => l());
}

export const getCareer = (): Career => current;

export function saveMatch(m: MatchRecord): RecordOutcome {
  const outcome = recordMatch(current, m);
  commit(outcome.career);
  return outcome;
}

export function clearCareer(): void {
  current = EMPTY_CAREER;
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useCareer(): Career {
  return useSyncExternalStore(subscribe, getCareer, getCareer);
}
