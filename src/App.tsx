import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scene3D } from "./components/Scene3D";
import { SpecimenIcon, RankBadge } from "./components/SpecimenIcon";
import { CodexModal } from "./components/CodexModal";
import { RoundResults } from "./components/RoundResults";
import { AdminPanel } from "./components/AdminPanel";
import { SettingsModal } from "./components/SettingsModal";
import { fill, useSettings } from "./i18n";
import {
  IconPlay,
  IconArrowRight,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconHeart,
  IconCoin,
  IconClash,
  IconStar,
  StarRating,
  IconClose,
  IconHelp,
  IconLock,
  IconUnlock,
  IconScout,
  IconReroll,
  IconUpgrade,
  IconAutoDeploy,
  IconSpeed,
  IconBurrow,
  IconVulnerable,
  IconAdmin,
  IconSettings,
  IconTrendUp,
  IconTrendDown,
  IconTrophy,
  IconSkull,
} from "./components/CustomIcons";
import {
  BENCH_SIZE,
  BUGS,
  BUG_ORDER,
  BOTS,
  COMMANDERS,
  GAME_INFO,
  MAX_FIELD_SIZE,
  SPECIMEN_IDS,
  SHOP_WEIGHTS,
  cmdById,
  type BugId,
  type CmdId,
} from "./game/data";
import {
  createBattle,
  makeFoeTeam,
  nextUid,
  smartSlotFor,
  stepBattle,
  streakBonus,
  advanceStreak,
  statsFor,
  battleStats,
  combinedTeamAtk,
  airstrikeTickDamage,
  AIRSTRIKE_TEAM_ATK_MULT,
  type BattleState,
  type PrepUnit,
} from "./game/engine";
import {
  PLAYER_ID,
  advanceMatchRound,
  colonyName,
  createMatch,
  opposingColony,
  playerFixture,
  rankedColonies,
  resolveMatchRound,
  survivingColonies,
} from "./game/match";

type Phase = "title" | "cmd" | "prep" | "battle" | "result" | "spectate" | "final";

const SHOWCASE_IDS = SPECIMEN_IDS;

const MOTES = Array.from({ length: 16 }, (_, i) => ({
  i,
  x: ((i * 41) % 94) + 3,
  b: (i * 29) % 74,
  d: 12 + ((i * 7) % 9),
  delay: -(i * 1.9),
  o: 0.3 + ((i * 13) % 5) / 10,
}));

/** Lamp haze + drifting dust motes — keeps the still screens breathing */
function Ambience() {
  return (
    <div className="ambient-layer">
      <div
        className="lampflicker absolute inset-x-0 top-0 h-[58vh]"
        style={{
          background:
            "radial-gradient(74% 100% at 50% 0%, rgba(255,214,150,.13), transparent 72%)",
        }}
      />
      {MOTES.map((m) => (
        <span
          key={m.i}
          className="mote"
          style={{
            left: `${m.x}%`,
            bottom: `${m.b}%`,
            animationDuration: `${m.d}s`,
            animationDelay: `${m.delay}s`,
            opacity: m.o,
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(128% 88% at 50% 44%, transparent 50%, rgba(6,4,3,.62))",
        }}
      />
    </div>
  );
}

const rollShop = (): (BugId | null)[] =>
  Array.from({ length: 5 }, () => {
    const total = SHOP_WEIGHTS.reduce((n, s) => n + s.w, 0);
    let r = Math.random() * total;
    for (const s of SHOP_WEIGHTS) {
      r -= s.w;
      if (r <= 0) return s.id;
    }
    return "stag";
  });

interface Report {
  win: boolean;
  foeIdx: number;
  dealt: number;
  taken: number;
  base: number;
  interest: number;
  bonus: number;
  streak: number;
  streakGold: number;
  echo: boolean;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("title");
  const [focusId, setFocusId] = useState<string>("stag");
  const [guideOpen, setGuideOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { t } = useSettings();
  /** Translate a template with {placeholders} and fill them in. */
  const tf = (en: string, vars: Record<string, string | number>) => fill(t(en), vars);

  const [cmd, setCmd] = useState<CmdId | null>(null);
  const [pick, setPick] = useState<CmdId>("matriarch");

  const [gold, setGold] = useState(10);
  const [level, setLevel] = useState(3);
  const [units, setUnits] = useState<PrepUnit[]>([]);
  const [shop, setShop] = useState<(BugId | null)[]>(rollShop);
  const [match, setMatch] = useState(createMatch);
  const [selected, setSelected] = useState<number | null>(null);
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  const [toast, setToast] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [shopLocked, setShopLocked] = useState(false);
  const [streak, setStreak] = useState(0); // + = win streak, − = loss streak
  const [scouting, setScouting] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  // Mutable battle ref for 60/120fps WebGL rendering; throttled state snapshot for HUD
  const battleRef = useRef<BattleState | null>(null);
  const settledBattleRef = useRef<BattleState | null>(null);
  const settledSpectatorRoundRef = useRef<typeof match | null>(null);
  const [battleSnap, setBattleSnap] = useState<BattleState | null>(null);

  const round = match.round;
  const playerColony = match.colonies.find((c) => c.id === PLAYER_ID)!;
  const hp = playerColony.hp;
  const activeCount = survivingColonies(match).length;
  const roundFixture = useMemo(() => playerFixture(match), [match]);
  const nextOpponent = useMemo(() => opposingColony(match), [match]);
  const foeIdx = phase === "result" && report ? report.foeIdx : nextOpponent?.botIdx ?? 0;
  const bots = useMemo(() => match.colonies.filter((c) => c.botIdx !== null).map((c) => ({
    idx: c.botIdx!, hp: c.hp, alive: c.hp > 0, place: c.place,
  })), [match.colonies]);

  const boardUnits = useMemo(() => units.filter((u) => u.zone === "board"), [units]);
  const benchUnits = useMemo(() => units.filter((u) => u.zone === "bench"), [units]);
  const levelCost = 4 + (level - 3) * 3;

  // Count owned copies by bugId & star so Shop cards can highlight pairs & instant moults
  const ownedCounts = useMemo(() => {
    const map: Record<BugId, { s1: number; s2: number; s3: number }> = {
      stag: { s1: 0, s2: 0, s3: 0 },
      bomb: { s1: 0, s2: 0, s3: 0 },
      mantis: { s1: 0, s2: 0, s3: 0 },
      dragonfly: { s1: 0, s2: 0, s3: 0 },
    };
    for (const u of units) {
      if (u.star === 1) map[u.bugId].s1++;
      else if (u.star === 2) map[u.bugId].s2++;
      else map[u.bugId].s3++;
    }
    return map;
  }, [units]);

  const toastTimer = useRef<number>(0);
  const [toastTone, setToastTone] = useState<"info" | "good" | "warn">("info");
  const say = useCallback((message: string, tone: "info" | "good" | "warn" = "info") => {
    setToast(t(message));
    setToastTone(tone);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }, [t]);

  /** Flash the gold counter whenever the balance moves. */
  const [goldFlash, setGoldFlash] = useState(0);
  const lastGold = useRef(gold);
  useEffect(() => {
    if (gold !== lastGold.current) {
      lastGold.current = gold;
      setGoldFlash((n) => n + 1);
    }
  }, [gold]);

  const combine = useCallback(
    (list: PrepUnit[]): { out: PrepUnit[]; moulted: PrepUnit | null } => {
      let out = list;
      let moulted: PrepUnit | null = null;
      let changed = true;
      while (changed) {
        changed = false;
        for (const bugId of BUG_ORDER) {
          for (const star of [1, 2]) {
            const group = out.filter((u) => u.bugId === bugId && u.star === star);
            if (group.length >= 3) {
              const keep = group.find((u) => u.zone === "board") ?? group[0];
              const drop = group.filter((u) => u.uid !== keep.uid).slice(0, 2);
              const rest = out.filter((u) => u.uid !== keep.uid && !drop.some((d) => d.uid === u.uid));
              const upgraded: PrepUnit = { ...keep, star: star + 1 };
              out = [...rest, upgraded];
              moulted = upgraded;
              changed = true;
              break;
            }
          }
          if (changed) break;
        }
      }
      return { out, moulted };
    },
    []
  );

  const buy = (idx: number) => {
    const id = shop[idx];
    if (!id) return;
    const cost = BUGS[id].cost;
    if (gold < cost) return say("NOT ENOUGH GOLD");

    // Allow buying even when bench is full IF buying immediately moults 2 bench copies!
    const used = new Set(units.filter((u) => u.zone === "bench").map((u) => u.slot));
    let free = -1;
    for (let i = 0; i < BENCH_SIZE; i++) {
      if (!used.has(i)) {
        free = i;
        break;
      }
    }
    const willMoult = ownedCounts[id].s1 >= 2;
    if (free < 0 && !willMoult) return say("BENCH IS FULL");

    const nu: PrepUnit = { uid: nextUid(), bugId: id, star: 1, zone: "bench", slot: Math.max(0, free) };
    const { out, moulted } = combine([...units, nu]);
    setUnits(out);
    setGold((g) => g - cost);
    setShop((s) => s.map((v, i) => (i === idx ? null : v)));
    if (moulted) {
      setSelected(moulted.uid);
      say(tf("MOULTED! {name} ({star}-STAR)", { name: BUGS[moulted.bugId].short, star: moulted.star }), "good");
    } else {
      setSelected(nu.uid);
    }
  };

  const reroll = () => {
    if (gold < 2) return say("NOT ENOUGH GOLD");
    setGold((g) => g - 2);
    setShop(rollShop());
    if (shopLocked) setShopLocked(false); // rerolling obviously releases the lock
  };

  const toggleLock = () => {
    if (!shopLocked && !shop.some((x) => x !== null)) return say("NOTHING LEFT TO HOLD");
    setShopLocked((v) => {
      say(v ? "SHOP UNLOCKED" : "SHOP HELD FOR NEXT DRAWER");
      return !v;
    });
  };


  const levelUp = () => {
    if (level >= MAX_FIELD_SIZE) return say("MAX LINE SIZE");
    if (gold < levelCost) return say("NOT ENOUGH GOLD", "warn");
    setGold((g) => g - levelCost);
    setLevel((l) => l + 1);
    say(tf("LINE SIZE {n}", { n: level + 1 }), "good");
  };

  const sellValue = (u: PrepUnit) => BUGS[u.bugId].cost * (u.star === 3 ? 9 : u.star === 2 ? 3 : 1);

  const sell = (uid = selected) => {
    if (uid == null) return;
    const u = units.find((x) => x.uid === uid);
    if (!u) return;
    setGold((g) => g + sellValue(u));
    setUnits((l) => l.filter((x) => x.uid !== u.uid));
    if (selected === u.uid) setSelected(null);
  };

  const onCell = (slot: number) => {
    if (phase !== "prep") return;
    const occupant = units.find((x) => x.zone === "board" && x.slot === slot);

    // Touch forgiveness: if nothing selected and user taps an occupied tile, select that bug!
    if (selected == null) {
      if (occupant) setSelected(occupant.uid);
      else say("SELECT A BUG BELOW FIRST");
      return;
    }

    const u = units.find((x) => x.uid === selected);
    if (!u) return;
    if (occupant && occupant.uid === u.uid) {
      setSelected(null);
      return;
    }
    if (u.zone === "bench" && !occupant && boardUnits.length >= level) {
      return say(tf("LINE FULL ({a}/{b}) — TAP A BUG TO SWAP", { a: level, b: level }));
    }
    setUnits((l) =>
      l.map((x) => {
        if (x.uid === u.uid) return { ...x, zone: "board" as const, slot };
        if (occupant && x.uid === occupant.uid) return { ...x, zone: u.zone, slot: u.slot };
        return x;
      })
    );
  };

  const onUnit = (uid: number) => {
    if (phase !== "prep") return;
    setSelected((s) => (s === uid ? null : uid));
  };

  const quickDeploySelected = () => {
    if (phase !== "prep" || selected == null) return;
    const u = units.find((x) => x.uid === selected);
    if (!u || u.zone !== "bench") return;
    if (boardUnits.length >= level) return say(tf("LINE SIZE IS {n}", { n: level }));
    const slot = smartSlotFor(u.bugId, units);
    if (slot < 0) return;
    setUnits((l) => l.map((x) => (x.uid === u.uid ? { ...x, zone: "board", slot } : x)));
  };

  const autoFillLine = () => {
    if (phase !== "prep") return;
    const open = level - boardUnits.length;
    if (open <= 0 || benchUnits.length === 0) return;
    const sorted = [...benchUnits].sort((a, b) => b.star - a.star || BUGS[b.bugId].cost - BUGS[a.bugId].cost);
    let nextUnits = [...units];
    let placed = 0;
    for (const cand of sorted) {
      if (placed >= open) break;
      const slot = smartSlotFor(cand.bugId, nextUnits);
      if (slot < 0) break;
      nextUnits = nextUnits.map((x) => (x.uid === cand.uid ? { ...x, zone: "board", slot } : x));
      placed++;
    }
    if (placed > 0) {
      setUnits(nextUnits);
      say(tf("DEPLOYED {n} SPECIMENS", { n: placed }), "good");
    }
  };

  const toBench = () => {
    const u = units.find((x) => x.uid === selected);
    if (!u || u.zone !== "board") return;
    const used = new Set(units.filter((x) => x.zone === "bench").map((x) => x.slot));
    let free = -1;
    for (let i = 0; i < BENCH_SIZE; i++) {
      if (!used.has(i)) {
        free = i;
        break;
      }
    }
    if (free < 0) return say("BENCH IS FULL");
    setUnits((l) => l.map((x) => (x.uid === u.uid ? { ...x, zone: "bench", slot: free } : x)));
  };

  const onBench = (slotIdx: number) => {
    if (phase !== "prep") return;
    const occupant = units.find((u) => u.zone === "bench" && u.slot === slotIdx);
    const su = units.find((u) => u.uid === selected);
    if (su && su.zone === "board") {
      setUnits((l) =>
        l.map((x) => {
          if (x.uid === su.uid) return { ...x, zone: "bench" as const, slot: slotIdx };
          if (occupant && x.uid === occupant.uid) return { ...x, zone: "board" as const, slot: su.slot };
          return x;
        })
      );
      return;
    }
    if (occupant) {
      // Double-tap bench bug shortcut: if already selected and room on board, deploy!
      if (selected === occupant.uid && boardUnits.length < level) {
        quickDeploySelected();
      } else {
        setSelected((s) => (s === occupant.uid ? null : occupant.uid));
      }
    } else if (su) {
      setSelected(null);
    }
  };

  /* ── High-FPS Decoupled Combat Loop ──────────────────────── */
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const engage = () => {
    if (phase !== "prep" || hp <= 0 || !roundFixture || match.winnerId) return;
    let activeBoard = boardUnits;
    if (!activeBoard.length) {
      if (benchUnits.length > 0) {
        // Helpful mobile assist: auto-deploy if user hits ENGAGE with bugs on bench
        const sorted = [...benchUnits]
          .sort((a, b) => b.star - a.star || BUGS[b.bugId].cost - BUGS[a.bugId].cost)
          .slice(0, level);
        let nextUnits = [...units];
        for (const cand of sorted) {
          const slot = smartSlotFor(cand.bugId, nextUnits);
          if (slot >= 0) {
            nextUnits = nextUnits.map((x) => (x.uid === cand.uid ? { ...x, zone: "board", slot } : x));
          }
        }
        setUnits(nextUnits);
        activeBoard = nextUnits.filter((u) => u.zone === "board");
      } else {
        return say("RECRUIT & DEPLOY A BUG FIRST");
      }
    }
    const foe = makeFoeTeam(foeIdx, round);
    const initial = createBattle(activeBoard, foe, cmd ?? "matriarch", BOTS[foeIdx].cmd);
    battleRef.current = initial;
    settledBattleRef.current = null;
    setBattleSnap({ ...initial });
    setSelected(null);
    setPhase("battle");
  };

  useEffect(() => {
    if (phase !== "battle") return;
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let lastHudBucket = -1;

    const loop = (now: number) => {
      const dt = Math.min(350, now - last);
      last = now;
      acc += dt;
      const stepMs = 100 / speedRef.current;
      let guard = 0;
      const cur = battleRef.current;
      if (cur && !cur.over) {
        while (acc >= stepMs && guard++ < 14 && !cur.over) {
          acc -= stepMs;
          stepBattle(cur, 0.1);
        }
        const bucket = Math.floor(cur.t * 4);
        if (cur.over || bucket !== lastHudBucket) {
          lastHudBucket = bucket;
          setBattleSnap({ ...cur, units: cur.units.map((u) => ({ ...u })) });
        }
      }
      if (cur && !cur.over) {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const over = battleSnap?.over ?? null;

  const finish = (result: "ally" | "foe") => {
    const b = battleRef.current ?? battleSnap;
    if (!b || !b.over || settledBattleRef.current === b) return;
    const updated = resolveMatchRound(match, b, boardUnits);
    if (updated === match || !updated.lastRound) return;
    const duel = updated.lastRound.duels.find((d) => d.aId === PLAYER_ID || (!d.echo && d.bId === PLAYER_ID))!;
    settledBattleRef.current = b;
    const win = result === "ally";
    const surv = (s: "ally" | "foe") => b.units.filter((u) => u.side === s && !u.dead).length;
    const base = duel.damage;
    const interest = Math.min(5, Math.floor(gold / 10));
    // continuing a run pays out; a broken run resets to ±1
    const nextStreak = advanceStreak(streak, win);
    const streakGold = streakBonus(nextStreak);
    const bonus = (win ? 2 : 0) + streakGold;
    const dealt = win ? base : 0;
    const taken = win ? 0 : base;
    setStreak(nextStreak);
    setLog((l) =>
      [
        tf(win ? (duel.echo ? "WON vs {foe} (ECHO) — {a} of yours left, {b} of theirs" : "WON vs {foe} — {a} of yours left, {b} of theirs") : duel.echo ? "LOST vs {foe} (ECHO) — {a} of yours left, {b} of theirs" : "LOST vs {foe} — {a} of yours left, {b} of theirs", { foe: BOTS[foeIdx].short, a: surv("ally"), b: surv("foe") }),
        ...l,
      ].slice(0, 6)
    );

    setMatch(updated);
    setGold((g) => g + 5 + interest + bonus);
    setReport({ win, foeIdx, dealt, taken, base, interest, bonus, streak: nextStreak, streakGold, echo: duel.echo });
    setPhase("result");
  };

  useEffect(() => {
    if (phase !== "battle" || !over) return;
    const t = window.setTimeout(() => finish(over), 850);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, over]);

  const next = () => {
    if (match.winnerId) {
      setPhase("final");
      return;
    }
    setMatch(advanceMatchRound(match));
    if (hp <= 0) {
      setPhase("spectate");
      return;
    }
    // A lock holds the shop across exactly one drawer — but never hand the
    // player an empty rack if they bought the whole row out.
    if (shopLocked && shop.some((x) => x !== null)) setShopLocked(false);
    else {
      setShopLocked(false);
      setShop(rollShop());
    }
    setScouting(false);
    battleRef.current = null;
    setBattleSnap(null);
    setReport(null);
    setSelected(null);
    setPhase("prep");
  };

  const restart = () => {
    setPhase("title");
    setCmd(null);
    setGold(10);
    setMatch(createMatch());
    setLevel(3);
    setUnits([]);
    setShop(rollShop());
    setShopLocked(false);
    setStreak(0);
    setScouting(false);
    setLog([]);
    battleRef.current = null;
    settledBattleRef.current = null;
    settledSpectatorRoundRef.current = null;
    setBattleSnap(null);
    setReport(null);
    setSelected(null);
    setSpeed(1);
  };

  const resolveSpectatorRound = useCallback(() => {
    if (phase !== "spectate" || match.winnerId || settledSpectatorRoundRef.current === match) return;
    settledSpectatorRoundRef.current = match;
    const updated = resolveMatchRound(match);
    setMatch(updated.winnerId ? updated : advanceMatchRound(updated));
    if (updated.winnerId) setPhase("final");
  }, [phase, match]);

  useEffect(() => {
    if (phase !== "spectate") return;
    const timer = window.setTimeout(resolveSpectatorRound, 1800);
    return () => window.clearTimeout(timer);
  }, [phase, resolveSpectatorRound]);

  /* ── Admin console ──────────────────────────────────────────
     Deliberately usable from touch: every quick action is a 44px button in
     AdminPanel, and the same verbs are available as typed commands. */
  const adminGiveUnit = (bugId: BugId, star: number): string => {
    if (phase !== "prep") return "Enter a match drawer first — admin units can only be added during prep.";
    const clampedStar = Math.max(1, Math.min(3, Math.round(star) || 1));
    const usedBench = new Set(units.filter((u) => u.zone === "bench").map((u) => u.slot));
    let freeBench = -1;
    for (let i = 0; i < BENCH_SIZE; i++) {
      if (!usedBench.has(i)) {
        freeBench = i;
        break;
      }
    }
    const boardSlot = boardUnits.length < level ? smartSlotFor(bugId, units) : -1;
    if (freeBench < 0 && boardSlot < 0) return "No bench or board space. Remove a unit or raise LINE first.";
    const nu: PrepUnit = {
      uid: nextUid(),
      bugId,
      star: clampedStar,
      zone: freeBench >= 0 ? "bench" : "board",
      slot: freeBench >= 0 ? freeBench : boardSlot,
    };
    const { out, moulted } = combine([...units, nu]);
    setUnits(out);
    setSelected(moulted?.uid ?? nu.uid);
    return tf("Added {name} {star}-star to the {zone}{extra}.", { name: t(BUGS[bugId].name), star: clampedStar, zone: t(nu.zone), extra: moulted ? tf(" — it moulted to {star}-star", { star: moulted.star }) : "" });
  };

  const adminForceBattle = (win: boolean): string => {
    const cur = battleRef.current;
    if (phase !== "battle" || !cur) return "No live battle to force. Use win/lose during combat, or next to continue.";
    if (cur.over) return "That battle is already finished.";
    cur.units.forEach((u) => {
      const loser = win ? u.side === "foe" : u.side === "ally";
      if (loser) {
        u.dead = true;
        u.hp = 0;
        u.fade = 0;
      } else if (u.dead) {
        u.dead = false;
        u.hp = Math.max(1, u.hp);
      }
    });
    cur.over = win ? "ally" : "foe";
    setBattleSnap({ ...cur, units: cur.units.map((u) => ({ ...u })) });
    return win ? "Victory forced — resolving the round…" : "Defeat forced — resolving the round…";
  };

  const runAdminCommand = (rawInput: string): string => {
    const raw = rawInput.trim().replace(/^\//, "");
    if (!raw) return "Type a command, or tap one of the quick actions above.";
    const parts = raw.toLowerCase().split(/\s+/);
    const [command, arg1, arg2, arg3] = parts;
    const asNumber = (v: string | undefined, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

    switch (command) {
      case "help":
        return "Commands: gold, heal, hurt, level, give, starup, remove, shop, lock, win, lose, next, speed, reset.";
      case "status":
        return tf("{phase} · Round {round} · {gold} gold · {hp} HP · line {line} · {alive} colonies alive.", { phase: phase.toUpperCase(), round: round + 1, gold, hp, line: `${boardUnits.length}/${level}`, alive: activeCount });
      case "gold":
      case "cash": {
        if (arg1 === "set") {
          const value = clamp(asNumber(arg2, gold), 0, 9999);
          setGold(value);
          return tf("Gold set to {v}.", { v: value });
        }
        const amount = clamp(asNumber(arg1, 25), -9999, 9999);
        setGold((g) => Math.max(0, g + amount));
        return tf(amount >= 0 ? "Added {v} gold." : "Removed {v} gold.", { v: Math.abs(amount) });
      }
      case "heal":
      case "revive": {
        if (match.winnerId) return "This match already has a champion. Use reset for a new match.";
        if (hp > 0) {
          setMatch((prev) => ({
            ...prev,
            colonies: prev.colonies.map((c) => (c.id === PLAYER_ID ? { ...c, hp: 100 } : c)),
          }));
          return "Colony restored to 100 HP.";
        }
        setMatch((prev) => ({
          ...prev,
          colonies: prev.colonies.map((c) =>
            c.id === PLAYER_ID ? { ...c, hp: 100, place: null, eliminatedRound: null } : c,
          ),
        }));
        if (phase === "spectate") setPhase("prep");
        return "Colony revived at 100 HP. Your elimination place has been cleared.";
      }
      case "hurt": {
        if (hp <= 0) return "Your colony is already eliminated. Use heal to revive it.";
        const amount = clamp(asNumber(arg1, 10), 1, 99);
        setMatch((prev) => ({
          ...prev,
          colonies: prev.colonies.map((c) => (c.id === PLAYER_ID ? { ...c, hp: Math.max(1, c.hp - amount) } : c)),
        }));
        return tf("Colony HP reduced by {v} (cannot fall below 1 with hurt).", { v: amount });
      }
      case "hp": {
        // hp set <1-100> — absolute setter for the Admin v2 slider.
        if (match.winnerId) return "This match already has a champion. Use reset for a new match.";
        const value = clamp(asNumber(arg1 === "set" ? arg2 : arg1, hp), 1, 100);
        setMatch((prev) => ({
          ...prev,
          colonies: prev.colonies.map((c) =>
            c.id === PLAYER_ID
              ? { ...c, hp: value, ...(c.hp <= 0 ? { place: null, eliminatedRound: null } : {}) }
              : c,
          ),
        }));
        if (phase === "spectate" && hp <= 0) setPhase("prep");
        return tf("Colony HP set to {v}.", { v: value });
      }
      case "foehp": {
        // foehp set <1-100> — set the next opponent's colony HP.
        if (!nextOpponent) return "No living opponent.";
        const value = clamp(asNumber(arg1 === "set" ? arg2 : arg1, nextOpponent.hp), 1, 100);
        setMatch((prev) => ({
          ...prev,
          colonies: prev.colonies.map((c) => (c.id === nextOpponent.id ? { ...c, hp: value } : c)),
        }));
        return tf("{name} HP set to {v}.", { name: t(colonyName(nextOpponent.id)), v: value });
      }
      case "level":
      case "line": {
        const value = clamp(asNumber(arg1, MAX_FIELD_SIZE), 1, MAX_FIELD_SIZE);
        setLevel(value);
        return tf("Line size set to {v}.", { v: value });
      }
      case "give": {
        let bugId: BugId | null = null;
        let star = 1;
        if (arg1 === "random") {
          bugId = BUG_ORDER[Math.floor(Math.random() * BUG_ORDER.length)];
          star = clamp(asNumber(arg2, 1), 1, 3);
        } else if (arg1 === "dragon" && arg2 === "fly") {
          bugId = "dragonfly";
          star = clamp(asNumber(arg3, 1), 1, 3);
        } else if (arg1 && (BUG_ORDER as string[]).includes(arg1)) {
          bugId = arg1 as BugId;
          star = clamp(asNumber(arg2, 1), 1, 3);
        } else if (arg1 === "fly" || arg1 === "dragonfly") {
          bugId = "dragonfly";
          star = clamp(asNumber(arg2, 1), 1, 3);
        }
        if (!bugId) return "Usage: give <stag|bomb|mantis|dragonfly|random> [1-3].";
        return adminGiveUnit(bugId, star);
      }
      case "starup": {
        if (!sel) return "Select a unit first, then run starup.";
        if (sel.star >= 3) return tf("{name} is already 3-star.", { name: t(BUGS[sel.bugId].name) });
        setUnits((list) => list.map((u) => (u.uid === sel.uid ? { ...u, star: u.star + 1 } : u)));
        return tf("{name} raised to {v}-star.", { name: t(BUGS[sel.bugId].name), v: sel.star + 1 });
      }
      case "remove":
      case "delete": {
        if (!sel) return "Select a unit first, then run remove.";
        setUnits((list) => list.filter((u) => u.uid !== sel.uid));
        setSelected(null);
        return tf("{name} removed without a refund.", { name: t(BUGS[sel.bugId].name) });
      }
      case "shop": {
        const shopBug =
          arg1 === "fly" ? "dragonfly" : arg1 && (BUG_ORDER as string[]).includes(arg1) ? (arg1 as BugId) : null;
        if (shopBug) {
          setShop((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((v) => v === null);
            copy[idx >= 0 ? idx : 0] = shopBug;
            return copy;
          });
          setShopLocked(false);
          return tf("{name} placed in Pipkin Supply.", { name: t(BUGS[shopBug].name) });
        }
        setShop(rollShop());
        setShopLocked(false);
        return "Shop refreshed for free.";
      }
      case "lock": {
        if (!shopLocked && !shop.some((x) => x !== null)) return "The shop is empty — nothing to lock.";
        setShopLocked((v) => !v);
        return shopLocked ? "Shop unlocked." : "Shop locked for the next round.";
      }
      case "win":
      case "lose": {
        const win = command === "win";
        if (phase === "battle") return adminForceBattle(win);
        if (phase === "spectate") {
          resolveSpectatorRound();
          return "Advanced the spectator match by one round.";
        }
        if (phase !== "prep") return "Start a battle first, then force a result.";
        if (win) {
          if (!nextOpponent) return "No living opponent to weaken.";
          setMatch((prev) => ({
            ...prev,
            colonies: prev.colonies.map((c) => (c.id === nextOpponent.id ? { ...c, hp: 1 } : c)),
          }));
          return tf("{name} set to 1 HP. Win this battle to eliminate them.", { name: t(colonyName(nextOpponent.id)) });
        }
        setMatch((prev) => ({
          ...prev,
          colonies: prev.colonies.map((c) => (c.id === PLAYER_ID ? { ...c, hp: 1 } : c)),
        }));
        return "Your colony set to 1 HP. Losing this battle will eliminate you.";
      }
      case "next":
      case "continue": {
        if (phase === "result") {
          next();
          return "Continuing…";
        }
        if (phase === "spectate") {
          resolveSpectatorRound();
          return "Advanced the spectator match by one round.";
        }
        if (phase === "final") {
          restart();
          return "Returned to the main menu.";
        }
        if (phase === "prep") {
          engage();
          return boardUnits.length || benchUnits.length ? "Engaging…" : "Recruit a unit first.";
        }
        return "Nothing to advance right now. During battle, use win or lose.";
      }
      case "mana":
      case "charge": {
        const cur = battleRef.current;
        if (phase !== "battle" || !cur) return "Mana can only be charged during a live battle.";
        let charged = 0;
        for (const u of cur.units) {
          if (!u.dead && u.side === "ally" && u.bugId === "dragonfly") {
            u.mana = u.maxMana;
            charged++;
          }
        }
        if (!charged) return "No living ally Dragonfly on the board.";
        setBattleSnap({ ...cur, units: cur.units.map((u) => ({ ...u })) });
        return tf("Charged {n} Dragonflies. At 3 stars, the Dragonfly itself will climb and dive onto the enemy cluster.", { n: charged });
      }
      case "manaall": {
        const cur = battleRef.current;
        if (phase !== "battle" || !cur) return "Mana can only be charged during a live battle.";
        let charged = 0;
        for (const u of cur.units) {
          if (!u.dead && u.side === "ally") {
            u.mana = u.maxMana;
            charged++;
          }
        }
        if (!charged) return "No living ally units on the board.";
        setBattleSnap({ ...cur, units: cur.units.map((u) => ({ ...u })) });
        return tf("Charged all {v} ally units to full mana.", { v: charged });
      }
      case "speed": {
        const value = clamp(asNumber(arg1, speed === 1 ? 2 : 1), 1, 3) as 1 | 2 | 3;
        setSpeed(value);
        return tf("Battle speed set to {v}×.", { v: value });
      }
      case "reset": {
        setAdminOpen(false);
        restart();
        return "Match reset.";
      }
      default:
        return tf("Unknown command “{cmd}”. Type help for the command list.", { cmd: command });
    }
  };

  const foe = BOTS[foeIdx];
  const sel = units.find((u) => u.uid === selected) ?? null;
  const selSkillUnlocked = sel ? sel.star >= (BUGS[sel.bugId].skillMinStar ?? 1) : false;

  const adminSnapshot = {
    phase,
    gold,
    hp,
    level,
    round,
    selected: sel ? `${BUGS[sel.bugId].short} ${sel.star}★` : "NONE",
    winner: match.winnerId ? colonyName(match.winnerId) : null,
    activeCount,
    commander: cmd ? cmdById(cmd).name : "NOT SELECTED",
    speed,
    foeName: foe.short,
    foeHp: nextOpponent?.hp ?? 0,
  };

  const adminPanel = (
    <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} snapshot={adminSnapshot} onCommand={runAdminCommand} />
  );

  const adminButton = (className = "") => (
    <button
      type="button"
      onClick={() => setAdminOpen(true)}
      aria-label={t("Open admin panel")}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 border border-[#6B4B24] bg-[#241708] px-2.5 text-[#F0A93B] transition-transform active:translate-y-[1px] ${className}`}
    >
      <IconAdmin size={18} />
      <span className="label hidden text-[8px] min-[480px]:inline">{t("ADMIN")}</span>
    </button>
  );


  /** Composition the next opponent will field — lets you plan before committing */
  const scoutTeam = useMemo(() => {
    if (phase !== "prep") return [];
    const team = makeFoeTeam(foeIdx, round);
    const tally = new Map<string, { bugId: BugId; star: number; n: number }>();
    for (const u of team) {
      const k = `${u.bugId}:${u.star}`;
      const hit = tally.get(k);
      if (hit) hit.n++;
      else tally.set(k, { bugId: u.bugId, star: u.star, n: 1 });
    }
    return [...tally.values()].sort((a, b) => b.star - a.star || b.n - a.n);
  }, [phase, foeIdx, round]);

  /* ── Keyboard shortcuts (desktop) ─────────────────────────── */
  useEffect(() => {
    if (phase !== "prep" && phase !== "battle") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (k === "escape") { setSelected(null); setScouting(false); setGuideOpen(false); return; }
      if (k === "?" ) { setGuideOpen((v) => !v); e.preventDefault(); return; }
      if (phase === "battle") {
        if (k === " " || k === "s") { setSpeed((v) => (v === 1 ? 2 : v === 2 ? 3 : 1)); e.preventDefault(); }
        return;
      }
      // prep-only
      if (k === "d" || k === "r") { reroll(); e.preventDefault(); }
      else if (k === "f") { levelUp(); e.preventDefault(); }
      else if (k === "l") { toggleLock(); e.preventDefault(); }
      else if (k === "v") { setScouting((v) => !v); e.preventDefault(); }
      else if (k === "a") { autoFillLine(); e.preventDefault(); }
      else if (k === " " || k === "enter") { engage(); e.preventDefault(); }
      else if (k >= "1" && k <= "5") { buy(Number(k) - 1); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gold, shop, units, level, boardUnits.length, benchUnits.length, shopLocked, cmd, round, foeIdx]);
  const canDeployMore = useMemo(() => {
    if (!sel) return boardUnits.length < level;
    if (sel.zone === "board") return true;
    return boardUnits.length < level;
  }, [sel, boardUnits.length, level]);

  /* ── Focused Specimen Info for Main Menu ─────────────────── */
  const focusInfo = useMemo(() => {
    if (focusId in BUGS) {
      const b = BUGS[focusId as BugId];
      return {
        kind: "SPECIMEN" as const,
        name: t(b.name),
        latin: b.latin,
        badge: `${t(b.role).toUpperCase()} · ${b.cost}G`,
        accent: b.accent,
        abilityTitle: b.skillMinStar ? `${t(b.skill.name)} · ${t("ULTIMATE")} ${b.skillMinStar}★` : t(b.skill.name),
        abilityDesc: b.skillMinStar ? `${t(b.skill.desc)} ${t("1-star and 2-star have no active skill.")}` : t(b.skill.desc),
        stats: `HP ${b.hp} · ATK ${b.atk}`,
      };
    }
    const c = COMMANDERS.find((x) => x.id === focusId) ?? COMMANDERS[0];
    return {
      kind: "COMMANDER" as const,
      name: t(c.name),
      latin: c.latin,
      badge: t(c.title).toUpperCase(),
      accent: c.accent,
      abilityTitle: t(c.perk),
      abilityDesc: t(c.desc),
      stats: t("GENERAL OF THE COLONY"),
    };
  }, [focusId, t]);

  const stepFocus = (dir: -1 | 1) => {
    const idx = SHOWCASE_IDS.indexOf(focusId as (typeof SHOWCASE_IDS)[number]);
    const nextIdx = (idx + dir + SHOWCASE_IDS.length) % SHOWCASE_IDS.length;
    setFocusId(SHOWCASE_IDS[nextIdx]);
  };

  /* ════════════════════════════════════════════════════════════
     SCREEN 1 — MAIN MENU (Interactive 3D Specimen Cabinet)
     ════════════════════════════════════════════════════════════ */
  if (phase === "title") {
    return (
      <div className="cabinet-bg safe-t relative min-h-[100dvh] w-full overflow-x-hidden text-[#EDE2CB]">
        <Ambience />
        <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1080px] flex-col justify-between px-3.5 py-3 sm:px-6 sm:py-5">
          {/* Top Cabinet Bar */}
          <header className="flex items-center justify-between border-b border-[#3B322A] pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center border border-[#4A3828] bg-[#16110D]">
                <SpecimenIcon id="stag" size={26} badge="none" />
              </div>
              <div>
                <div className="label text-[8px] text-[#F0A93B]">{t("CABINET NO. IV · VOXEL EDITION")}</div>
                <div className="latin text-[12px] text-[#9C8F7E]">{t("Entomological Auto-Chess")}</div>
              </div>
            </div>
            <button
              onClick={() => setGuideOpen(true)}
              className="lift flex items-center gap-1.5 border border-[#4A3828] bg-[#18120E] px-3 py-1.5 label text-[8.5px] text-[#EDE2CB] hover:border-[#F0A93B]"
            >
              <IconHelp size={13} className="text-[#F0A93B]" /> <span>{t("FIELD GUIDE")}</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("SETTINGS")}
              className="lift flex min-h-[44px] items-center justify-center gap-1.5 border border-[#4A3828] bg-[#18120E] px-3 py-1.5 label text-[8.5px] text-[#EDE2CB] hover:border-[#F0A93B]"
            >
              <IconSettings size={14} />
              <span className="hidden min-[420px]:inline">{t("SETTINGS")}</span>
            </button>
            {adminButton()}
          </header>

          {/* Main Split Grid: Hero Brand + 3D Interactive Specimen Turntable */}
          <main className="my-auto grid grid-cols-1 items-center gap-4 py-3 lg:grid-cols-[1.02fr_1.15fr] lg:gap-8 lg:py-6">
            {/* Right on Desktop / Top on Mobile: 3D Turntable Stage */}
            <div className="order-1 lg:order-2">
              <div className="relative border-2 border-[#3B322A] bg-[#120D09] shadow-[0_12px_36px_rgba(0,0,0,.75)]">
                {/* Brass corner rivets */}
                <span className="pointer-events-none absolute left-1.5 top-1.5 z-20 h-1.5 w-1.5 bg-[#F0A93B]" />
                <span className="pointer-events-none absolute right-1.5 top-1.5 z-20 h-1.5 w-1.5 bg-[#F0A93B]" />
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-20 h-1.5 w-1.5 bg-[#F0A93B]" />
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 h-1.5 w-1.5 bg-[#F0A93B]" />

                <div className="pointer-events-none absolute left-3 top-2.5 z-20">
                  <span className="label bg-[#0D0907]/85 px-1.5 py-0.5 text-[7.5px] text-[#F0A93B]">
                    {t("3D TURNTABLE · DRAG TO SPIN")}
                  </span>
                </div>

                {/* Prev / Next navigation */}
                <button
                  onClick={() => stepFocus(-1)}
                  aria-label={t("Previous specimen")}
                  className="lift absolute left-2 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center border border-[#4A3828] bg-[#14100C]/90 text-[#EDE2CB] hover:border-[#F0A93B]"
                >
                  <IconChevronLeft size={16} />
                </button>
                <button
                  onClick={() => stepFocus(1)}
                  aria-label={t("Next specimen")}
                  className="lift absolute right-2 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center border border-[#4A3828] bg-[#14100C]/90 text-[#EDE2CB] hover:border-[#F0A93B]"
                >
                  <IconChevronRight size={16} />
                </button>

                <Scene3D
                  mode="showcase"
                  focusId={focusId}
                  onFocusChange={setFocusId}
                  className="w-full"
                  style={{ height: "clamp(200px, 31dvh, 330px)" }}
                />

                {/* The selector follows the live unit and commander roster. */}
                <div className="grid border-t border-[#3B322A] bg-[#16110D]" style={{ gridTemplateColumns: `repeat(${SHOWCASE_IDS.length}, minmax(0, 1fr))` }}>
                  {SHOWCASE_IDS.map((id) => {
                    const active = focusId === id;
                    const isBug = id in BUGS;
                    const label = isBug
                      ? BUGS[id as BugId].short
                      : id === "matriarch"
                        ? "QUEEN"
                        : id === "worm"
                          ? "WORM"
                          : "ORACLE";
                    return (
                      <button
                        key={id}
                        onClick={() => setFocusId(id)}
                        className={`flex flex-col items-center gap-0.5 py-1.5 transition-colors ${
                          active
                            ? "border-t-2 border-[#F0A93B] bg-[#241B14] text-[#F0A93B]"
                            : "border-t-2 border-transparent text-[#8C7E6E] hover:text-[#EDE2CB]"
                        }`}
                      >
                        <SpecimenIcon id={id} size={27} selected={active} badge="none" />
                        <span className="label text-[6.5px]">{t(label)}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Focused Specimen Dossier Strip */}
                <div className="paper-card border-t-2 border-[#3B322A] px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-pixel text-[10px] text-[#241B14]">{focusInfo.name}</span>
                      <span className="latin text-[12.5px] text-[#5C4A38]">{focusInfo.latin}</span>
                    </div>
                    <span className="bg-[#241B14] px-1.5 py-0.5 font-pixel text-[7px] text-[#F0A93B]">
                      {focusInfo.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[#241B14]">
                    <b className="label mr-1.5 text-[7.5px] text-[#8E2A16]">{focusInfo.abilityTitle}:</b>
                    {focusInfo.abilityDesc}
                  </p>
                  {/* Per-star stat strip (stats were computed but never rendered) */}
                  {focusId in BUGS ? (
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {([1, 2, 3] as const).map((star) => {
                        const st = statsFor(focusId as BugId, star);
                        return (
                          <div key={star} className="border border-[#241B14]/25 bg-[#241B14]/5 px-1.5 py-1 text-center">
                            <div className="label text-[6.5px] text-[#8E2A16]">{star}★</div>
                            <div className="font-mono text-[9.5px] font-bold tabular-nums text-[#241B14]">
                              {st.hp} HP · {st.atk} ATK
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="label mt-2 text-[7px] text-[#5C4A38]">{focusInfo.stats}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Left on Desktop / Bottom on Mobile: Title & Primary Actions */}
            <div className="order-2 flex flex-col items-start lg:order-1">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="h-[3px] w-10 bg-[#E0522F]" />
                <span className="label text-[8.5px] text-[#56DCA8]">{t("3D TACTICAL SPECIMEN BATTLER")}</span>
              </div>

              <h1 className="font-pixel leading-[1.14] text-[#EDE2CB] drop-shadow-[3px_3px_0_#090604]">
                <span className="block text-[clamp(28px,8.5vw,54px)]">SMART</span>
                <span className="block text-[clamp(28px,8.5vw,54px)] text-[#56DCA8]">BUGS</span>
              </h1>

              <p className="latin mt-2.5 max-w-[38ch] text-[14.5px] leading-snug text-[#C9BCA6] sm:text-[16px]">
                {tf("Choose from {c} commanders, build your voxel bug army, and outlast {r} rival colonies. Rounds continue until just one colony survives.", { c: GAME_INFO.commanders, r: GAME_INFO.rivals })}
              </p>

              {/* Feature Pills */}
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {[
                  `${GAME_INFO.units} ${t("SCULPTED BUGS")}`,
                  `${GAME_INFO.commanders} ${t("COMMANDERS")}`,
                  `${GAME_INFO.rivals} ${t("RIVAL BOTS")}`,
                  t("1 SURVIVOR WINS"),
                ].map((tag) => (
                  <span
                    key={tag}
                    className="label border border-[#3B322A] bg-[#16110D] px-2 py-1 text-[7.5px] text-[#B3A594]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Primary CTA Row */}
              <div className="safe-b mt-5 flex w-full flex-col gap-2.5 sm:flex-row sm:w-auto">
                <button
                  onClick={() => setPhase("cmd")}
                  className="btn-sheen lift flex items-center justify-center gap-3 border-2 border-[#56DCA8] bg-gradient-to-b from-[#2a9c74] to-[#1F7A5A] px-7 py-3.5 font-pixel text-[12px] text-[#04130d] shadow-[0_5px_0_#0D3B2A,0_10px_30px_-10px_rgba(86,220,168,.6)]"
                >
                  <span className="blink"><IconPlay size={13} /></span> <span>{t("PLAY MATCH")}</span>
                </button>
                <button
                  onClick={() => setGuideOpen(true)}
                  className="btn-sheen lift flex items-center justify-center gap-2 border-2 border-[#4A3828] bg-[#18120E] px-5 py-3 font-pixel text-[10px] text-[#F0A93B] shadow-[0_5px_0_#0C0906] hover:border-[#F0A93B]"
                >
                  {t("HOW TO PLAY")}
                </button>
              </div>
            </div>
          </main>

          <footer className="hidden items-center justify-between border-t border-[#2A2018] pt-2 text-[10px] text-[#7B6E5F] sm:flex">
            <span className="label text-[7.5px]">{t("COLEOPTERA MACHINA · PURE PROCEDURAL 3D")}</span>
            <span className="latin">{t("Touch or click any tile to command your colony")}</span>
          </footer>
        </div>

        <CodexModal open={guideOpen} onClose={() => setGuideOpen(false)} />
        {adminPanel}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     SCREEN 2 — COMMANDER SELECTION
     ════════════════════════════════════════════════════════════ */
  if (phase === "cmd") {
    return (
      <div className="cabinet-bg safe-t safe-b relative min-h-[100dvh] w-full overflow-x-hidden">
        <Ambience />
        <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[780px] flex-col justify-between px-4 py-4 sm:px-6 sm:py-7">
          <div>
            <div className="flex items-center justify-between border-b border-[#3B322A] pb-3">
              <button
                onClick={() => setPhase("title")}
                className="lift flex items-center gap-1.5 border border-[#3B322A] bg-[#16110D] px-2.5 py-1.5 label text-[8px] text-[#B3A594] hover:border-[#F0A93B] hover:text-[#EDE2CB]"
              >
                <IconArrowLeft size={11} />
                <span>{t("MENU")}</span>
              </button>
              <span className="label text-[8.5px] text-[#F0A93B]">{t("SELECT 1 OF")} {GAME_INFO.commanders} {t("COMMANDERS")}</span>
              <button
                onClick={() => setGuideOpen(true)}
                className="lift flex items-center gap-1.5 border border-[#3B322A] bg-[#16110D] px-2.5 py-1.5 label text-[8px] text-[#F0A93B]"
              >
                <IconHelp size={11} />
                <span>{t("GUIDE")}</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label={t("SETTINGS")}
                className="grid h-11 w-11 place-items-center border border-[#32291F] bg-[#16110D] text-[#EDE2CB] active:translate-y-[1px]"
              >
                <IconSettings size={15} />
              </button>
              {adminButton()}
            </div>

            <h2 className="mt-4 font-pixel text-[15px] leading-relaxed text-[#EDE2CB] sm:text-[18px]">
              {t("CHOOSE YOUR")} <span className="text-[#56DCA8]">{t("COLONY GENERAL")}</span>
            </h2>
            <p className="latin mt-1 text-[14px] text-[#B3A594]">
              {GAME_INFO.colonies} {t("colonies enter. One survives. Your general grants a unique passive for the entire match.")}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {COMMANDERS.map((c) => {
                const on = pick === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setPick(c.id)}
                    className={`paper-card lift relative flex flex-col justify-between border-2 p-4 text-left ${
                      on ? "border-[#F0A93B]" : "border-[#3B322A] opacity-85 hover:opacity-100"
                    }`}
                    style={{
                      boxShadow: on
                        ? "0 0 0 2px #F0A93B, 0 8px 0 rgba(0,0,0,.5)"
                        : "0 6px 0 rgba(0,0,0,.45)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 border border-[#241B14]/30 bg-[#16110D] p-2">
                        <SpecimenIcon id={c.id} size={64} selected={on} badge="none" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <RankBadge id={c.id} size={16} />
                            <span className="truncate font-pixel text-[11px] text-[#241B14]">{t(c.name)}</span>
                          </span>
                          {on && (
                            <span className="bg-[#1F7A5A] px-1.5 py-0.5 font-pixel text-[7px] text-[#FFF3DC]">
                              {t("SELECTED")}
                            </span>
                          )}
                        </div>
                        <div className="latin text-[13px] text-[#5C4A38]">{c.latin}</div>
                        <div className="label mt-1 text-[7.5px] text-[#7A5318]">{t(c.title)}</div>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-[#241B14]/20 pt-2.5">
                      <span className="label inline-block bg-[#8E2A16] px-1.5 py-0.5 text-[7.5px] text-[#FFF3DC]">
                        {t("PERK")} · {t(c.perk)}
                      </span>
                      <p className="mt-1.5 text-[12px] leading-snug text-[#241B14]">{t(c.desc)}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Rival Colonies Preview */}
            <div className="mt-4 border border-[#3B322A] bg-[#16110D] p-3">
              <div className="label text-[8px] text-[#9C8F7E]">{t("RIVAL COLONIES IN THIS CASE")}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {BOTS.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 border border-[#2B221B] bg-[#100C09] p-2">
                    <SpecimenIcon id={b.cmd} size={28} badge="none" />
                    <RankBadge id={b.cmd} size={13} />
                    <div className="min-w-0">
                      <div className="label truncate text-[8px] text-[#EDE2CB]">{b.short}</div>
                      <div className="latin truncate text-[11px] text-[#56DCA8]">{b.latin}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setCmd(pick);
              setMatch(createMatch(pick));
              setPhase("prep");
            }}
            className="lift mt-5 w-full border-2 border-[#56DCA8] bg-[#1F7A5A] py-3.5 font-pixel text-[12px] text-[#090604] shadow-[0_5px_0_#0D3B2A]"
          >
            <span className="flex items-center justify-center gap-2">
              <span>{t("BEGIN ROUND 1")}</span>
              <IconArrowRight size={14} />
            </span>
          </button>
        </div>

        <CodexModal open={guideOpen} onClose={() => setGuideOpen(false)} />
        {adminPanel}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  if (phase === "spectate") {
    return (
      <div className="cabinet-bg safe-t safe-b relative min-h-[100dvh] w-full overflow-x-hidden">
        <Ambience />
        <main className="screen relative z-10 mx-auto flex min-h-[100dvh] max-w-[560px] flex-col justify-center px-4 py-6">
          <div className="label text-[9px] text-[#F0A93B]">{tf("Your place is locked: #{place}", { place: playerColony.place ?? "—" })}</div>
          <h1 className="mt-3 font-pixel text-[18px] leading-relaxed text-[#EDE2CB]">{t("THE MATCH CONTINUES")}</h1>
          <p className="latin mt-2 text-[16px] leading-snug text-[#B3A594]">
            {tf("Your colony was eliminated in Round {r}. The {n} surviving colonies keep battling until one champion remains.", { r: (playerColony.eliminatedRound ?? 0) + 1, n: activeCount })}
          </p>
          <div className="my-5 flex items-center justify-between border-y border-[#3B322A] py-3">
            <span className="label text-[9px] text-[#56DCA8]">{tf("Round {r} / Auto-playing", { r: round + 1 })}</span>
            <span className="label text-[8px] text-[#B3A594]">{activeCount} {t("colonies alive")}</span>
          </div>
          <ol aria-label={t("Live colony standings")} className="mb-5 space-y-2">
            {rankedColonies(match).map((colony) => (
              <li key={colony.id} className="paper-card flex items-center gap-3 border border-[#3B322A] p-3" style={{ opacity: colony.hp > 0 ? 1 : 0.65 }}>
                <SpecimenIcon id={colony.commander} size={34} dim={colony.hp === 0} />
                <div className="min-w-0 flex-1">
                  <div className="label text-[10px]">{t(colonyName(colony.id))}</div>
                  <div className="mt-1 text-[10px] text-[#5C4A38]">
                    {colony.hp > 0 ? t("Still in the fight") : tf("Eliminated / place #{n}", { n: colony.place ?? "—" })}
                  </div>
                </div>
                <span className="font-pixel text-[10px] text-[#241B14]">{colony.hp > 0 ? `${colony.hp} HP` : t("OUT")}</span>
              </li>
            ))}
          </ol>
          <RoundResults summary={match.lastRound} />
          <button onClick={resolveSpectatorRound} className="lift flex items-center justify-center gap-2 mt-5 border-2 border-[#56DCA8] bg-[#1F7A5A] px-4 py-3 font-pixel text-[10px] text-[#FFF3DC]">
            <span>{t("PLAY NEXT ROUND NOW")}</span>
            <IconArrowRight size={13} />
          </button>
          <button onClick={restart} className="mt-4 self-center px-4 py-2 label text-[8px] text-[#B3A594] hover:text-[#F0A93B]">
            {t("Leave spectator mode / Main menu")}
          </button>
          {adminButton("mt-3 w-full")}
          {adminPanel}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </main>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     SCREEN 3 — FINAL STANDINGS
     ════════════════════════════════════════════════════════════ */
  if (phase === "final") {
    const table = rankedColonies(match).map((colony) => ({
      ...colony,
      name: t(colonyName(colony.id)),
      latin: colony.botIdx === null ? cmdById(colony.commander).latin : BOTS[colony.botIdx].latin,
      you: colony.id === PLAYER_ID,
    }));
    const place = playerColony.place ?? table.findIndex((t) => t.you) + 1;

    return (
      <div className="cabinet-bg safe-t safe-b relative min-h-[100dvh] w-full overflow-x-hidden">
        <Ambience />
        <div className="screen relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[540px] flex-col justify-center px-4 py-8">
          <div className="border-2 border-[#4A3828] bg-[#16110D] p-5 shadow-[0_14px_40px_rgba(0,0,0,.85)]">
            <div className="label text-[8.5px] text-[#F0A93B]">{t("ONE SURVIVOR")} / {round + 1} {t("ROUNDS PLAYED")}</div>
            <h2 className="mt-2 font-pixel text-[clamp(15px,5vw,25px)] leading-tight text-[#EDE2CB]">
              {place === 1 ? t("CASE CHAMPION") : place === 2 ? t("SECOND PLACE") : t("COLONY PINNED")}
            </h2>
            <p className="latin mt-1 text-[14.5px] text-[#56DCA8]">
              {place === 1
                ? t("Your colony outlasted every rival. You are the last colony standing.")
                : tf("{winner} is the last colony standing. You finished #{place} of {total}.", { winner: t(colonyName(match.winnerId!)), place, total: GAME_INFO.colonies })}
            </p>

            <ol className="mt-5 space-y-2">
              {table.map((t, i) => (
                <li
                  key={t.name}
                  className="paper-card rise flex items-center gap-3 border-2 p-3"
                  style={{
                    borderColor: t.you ? "#F0A93B" : "#3B322A",
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  <span className="flex items-center gap-1 font-pixel text-[13px] text-[#8E2A16]">
                    {t.place === 1 ? <IconTrophy size={16} className="text-[#F0A93B]" /> : `#${t.place ?? i + 1}`}
                  </span>
                  <SpecimenIcon id={t.commander} size={32} dim={t.hp === 0} />
                  <div className="min-w-0 flex-1">
                    <div className="label truncate text-[10px] text-[#241B14]">{t.name}</div>
                    <div className="latin truncate text-[12px] text-[#5C4A38]">{t.latin}</div>
                  </div>
                  <span className="flex items-center gap-1 shrink-0 text-right font-mono text-[11px] font-semibold text-[#241B14]">
                    {t.hp > 0 ? (
                      `${t.hp} HP`
                    ) : (
                      <span className="flex items-center gap-1 text-[#8E2A16]">
                        <IconSkull size={11} />
                        <span>{`OUT R${(t.eliminatedRound ?? 0) + 1}`}</span>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>

            <button
              onClick={restart}
              className="lift mt-6 w-full border-2 border-[#56DCA8] bg-[#1F7A5A] py-3.5 font-pixel text-[12px] text-[#090604] shadow-[0_5px_0_#0D3B2A]"
            >
              <span className="flex items-center justify-center gap-2">
                <span>{t("NEW CABINET MATCH")}</span>
                <IconArrowRight size={14} />
              </span>
            </button>
            {adminButton("mt-3 w-full")}
            {adminPanel}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     SCREEN 4 — IN-GAME TACTICAL VIEW (Mobile 100dvh + Desktop Split)
     ════════════════════════════════════════════════════════════ */
  const interestNext = Math.min(5, Math.floor(gold / 10));
  const inCombat = phase === "battle" || phase === "result";
  const allyLiveHp = battleSnap
    ? battleSnap.units.filter((u) => u.side === "ally").reduce((n, u) => n + Math.max(0, u.hp), 0)
    : 1;
  const foeLiveHp = battleSnap
    ? battleSnap.units.filter((u) => u.side === "foe").reduce((n, u) => n + Math.max(0, u.hp), 0)
    : 1;
  const allyShare = Math.round((allyLiveHp / Math.max(1, allyLiveHp + foeLiveHp)) * 100);

  /* Team-ATK telemetry — the exact numbers Airstrike is priced from. */
  const allyTeamAtk = battleSnap ? combinedTeamAtk(battleSnap, "ally") : 0;
  const foeTeamAtk = battleSnap ? combinedTeamAtk(battleSnap, "foe") : 0;
  const allyDragonfly3 = battleSnap?.units.find(
    (u) => u.side === "ally" && u.bugId === "dragonfly" && u.star >= 3 && !u.dead
  );
  const foeDragonfly3 = battleSnap?.units.find(
    (u) => u.side === "foe" && u.bugId === "dragonfly" && u.star >= 3 && !u.dead
  );

  const armedHoles = battleSnap?.holes.filter((h) => h.armed).length ?? 0;
  const liveZones = battleSnap?.zones ?? [];
  const zoneSeconds = liveZones.length
    ? Math.max(1, Math.ceil(Math.max(...liveZones.map((z) => z.remaining))))
    : 0;
  const vulnerableCount = battleSnap?.units.filter((u) => !u.dead && u.vuln > 0).length ?? 0;

  return (
    <div className="cabinet-bg safe-t h-[100dvh] w-full overflow-hidden">
      <div className="game-grid mx-auto max-w-[1160px]">
        {/* ── LEFT / TOP STAGE: Header + Standings + 3D Drawer ── */}
        <div className="flex min-h-0 flex-1 flex-col lg:border lg:border-[#3B322A] lg:bg-[#130E0A]">
          {/* ── FIELD LAB COMMAND DECK (v2): vitals · VS · resources · ladder ── */}
          <div className="deck shrink-0">
            <div className="flex flex-wrap items-stretch gap-1.5 px-2 pt-2 sm:px-3">
              {/* Colony vitals */}
              <div className="deck-stat" title={t("Your colony HP — reach zero and you're out")}>
                <IconHeart size={15} />
                <span className="deck-num" style={{ color: hp > 30 ? "#56DCA8" : "#F05A36" }}>{hp}</span>
                <span className="deck-cap">{t("Colony HP")}</span>
              </div>
              <div className="deck-stat">
                <span className="deck-num text-[#EDE2CB]">{round + 1}</span>
                <span className="deck-cap">{t("Round")}<br />{activeCount} {t("alive")}{activeCount === 2 ? " · final" : ""}</span>
              </div>

              {/* Matchup plaque */}
              <div className={`vs-plaque min-w-[150px] flex-1 ${inCombat ? "vs-plaque--combat" : ""}`} aria-label={tf("You versus {name}", { name: foe.name })}>
                <SpecimenIcon id={cmd ?? "matriarch"} size={24} badge="none" />
                <span className="label hidden text-[7px] text-[#56DCA8] min-[420px]:inline">{t("YOU")}</span>
                <span className="vs-word">VS</span>
                <span className="label max-w-[16ch] truncate text-[7px] text-[#F05A36]">{foe.short}</span>
                <SpecimenIcon id={foe.cmd} size={24} badge="none" />
              </div>

              {/* Resources */}
              <div className="deck-stat" title={tf("Gold — +{n} interest next round", { n: interestNext })}>
                <IconCoin size={15} />
                <span key={goldFlash} className="gold-flash deck-num text-[#F0A93B]">{gold}</span>
                <span className="deck-cap">{t("Gold")}<br />+{interestNext} {t("int.")}</span>
              </div>
              <div className="deck-stat" title={t("Bugs fielded / line capacity")}>
                <span className="deck-num" style={{ color: boardUnits.length > 0 ? "#56DCA8" : "#F0A93B" }}>
                  {boardUnits.length}/{level}
                </span>
                <span className="deck-cap">{t("Line")}</span>
              </div>
              {streak !== 0 && (
                <div
                  className="deck-stat"
                  title={tf("{n} in a row — +{g} gold next payout", { n: Math.abs(streak), g: streakBonus(streak) })}
                  style={{
                    borderColor: streak > 0 ? "#1F7A5A" : "#8E2A16",
                    background: streak > 0 ? "#10231C" : "#24110D",
                  }}
                >
                  {streak > 0 ? (
                    <IconTrendUp size={11} className="text-[#56DCA8]" />
                  ) : (
                    <IconTrendDown size={11} className="text-[#F05A36]" />
                  )}
                  <span className="deck-num" style={{ color: streak > 0 ? "#56DCA8" : "#F05A36" }}>
                    {streak > 0 ? `W${streak}` : `L${-streak}`}
                  </span>
                  {streakBonus(streak) > 0 && <span className="deck-cap" style={{ color: "#F0A93B" }}>+{streakBonus(streak)}g</span>}
                </div>
              )}
              <button
                onClick={() => setGuideOpen(true)}
                aria-label={t("Open Field Guide")}
                className="lift grid min-h-[34px] w-[38px] place-items-center border border-[#3B322A] bg-[#100C09] text-[#F0A93B] hover:border-[#F0A93B]"
              >
                <IconHelp size={15} />
              </button>
            </div>

            {/* Colony ladder — ranked rail, current foe ringed in red (hidden on phones in combat to save the stage) */}
            <div className={`px-2 pb-2 pt-1.5 sm:px-3 ${inCombat ? "hidden min-[720px]:block" : ""}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className="label text-[6.5px] text-[#8C7E6E]">{t("Colony ladder")}</span>
                <span className="label text-[6.5px] text-[#8C7E6E]">{t("1 survivor wins")}</span>
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GAME_INFO.colonies}, minmax(0, 1fr))` }}>
                {[
                  { key: "you", you: true, isFoe: false, name: "YOU", hp, alive: hp > 0, place: playerColony.place },
                  ...bots.map((b) => ({
                    key: BOTS[b.idx].id,
                    you: false,
                    isFoe: b.idx === foeIdx,
                    name: BOTS[b.idx].short,
                    hp: b.hp,
                    alive: b.alive,
                    place: b.place,
                  })),
                ].map((s, i) => (
                  <div
                    key={s.key}
                    className="ladder-cell"
                    data-you={s.you ? 1 : 0}
                    data-foe={s.isFoe && s.alive ? 1 : 0}
                    data-alive={s.alive ? 1 : 0}
                    title={s.alive ? tf("{name}: {hp} HP", { name: t(s.name), hp: s.hp }) : tf("{name}: eliminated, place #{n}", { name: t(s.name), n: s.place ?? "—" })}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="ladder-rank">{i + 1}</span>
                        {s.isFoe && s.alive && (
                          <span className="clash-seal grid h-[13px] w-[13px] shrink-0 place-items-center rounded-full" aria-hidden="true">
                            <IconClash size={9} className="text-[#FFE2D6]" />
                          </span>
                        )}
                        <span className="label truncate text-[7px]" style={{ color: s.you ? "#F0A93B" : "#EDE2CB" }}>{t(s.name)}</span>
                      </span>
                      <span className="font-mono text-[9px] font-bold tabular-nums text-[#EDE2CB]">
                        {s.alive ? s.hp : `#${s.place}`}
                      </span>
                    </div>
                    <div className="bar-shell mt-1">
                      <i
                        style={{
                          width: `${Math.max(0, Math.min(100, s.hp))}%`,
                          background: s.you ? "#56DCA8" : s.isFoe ? "#F05A36" : "#7B6E5F",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3D Specimen Drawer Viewport (Fills Flexible Height!) */}
          <div className="relative min-h-[150px] flex-1 bg-[#0D0907] min-[720px]:min-h-[175px]">
            <Scene3D
              mode={phase === "prep" ? "prep" : "battle"}
              prep={units}
              battle={phase === "prep" ? null : battleSnap}
              battleRef={phase === "prep" ? undefined : battleRef}
              battleSpeed={speed}
              selectedUid={selected}
              canDeployMore={canDeployMore}
              interactive={phase === "prep"}
              cmdA={cmd ?? "matriarch"}
              cmdB={foe.cmd}
              onCell={onCell}
              onUnit={onUnit}
              className="h-full w-full"
            />

            {/* Compact Opponent Corner Tag */}
            {!sel && (
              <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 border border-[#3B322A]/90 bg-[#120D09]/90 px-2 py-1">
                <SpecimenIcon id={foe.cmd} size={30} badge="none" />
                <RankBadge id={foe.cmd} size={14} />
                <div className="leading-tight">
                  <div className="label text-[7px] text-[#F0A93B]">
                    {inCombat ? t("FIGHTING") : "VS"} {foe.name}{(phase === "result" ? report?.echo : roundFixture?.echo) ? " / ECHO" : ""}
                  </div>
                  <div className="latin text-[10.5px] text-[#56DCA8]">{t(cmdById(foe.cmd).perk)}</div>
                </div>
              </div>
            )}

            {/* Mobile Floating Selected-Bug Action Bar (0 permanent vertical height!) */}
            {phase === "prep" && sel && (
              <div className="rise absolute inset-x-2 top-2 z-20 flex items-center gap-2 border-2 border-[#F0A93B] bg-[#16110D]/96 p-2 shadow-[0_8px_20px_rgba(0,0,0,.8)] lg:hidden">
                <SpecimenIcon id={sel.bugId} size={40} star={sel.star} selected />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-pixel text-[8.5px] text-[#EDE2CB]">
                      {t(BUGS[sel.bugId].name)}
                    </span>
                    <span className="font-pixel text-[8px] text-[#F0A93B]">
                      <StarRating star={sel.star} size={9} />
                    </span>
                  </div>
                  <div className="label truncate text-[7px] text-[#56DCA8]">
                    HP {battleStats(sel.bugId, sel.star, cmd ?? "matriarch").hp} · ATK {battleStats(sel.bugId, sel.star, cmd ?? "matriarch").atk} ·{" "}
                    {selSkillUnlocked ? t(BUGS[sel.bugId].skill.name) : t("NO SKILL")}
                  </div>
                  {BUGS[sel.bugId].passive && (
                    <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-[9px] text-[#F0A93B]">
                      <IconVulnerable size={10} />
                      <span className="truncate">{t(BUGS[sel.bugId].passive!.name)} / {t(BUGS[sel.bugId].passive!.desc)}</span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {sel.zone === "bench" ? (
                    <button
                      onClick={quickDeploySelected}
                      disabled={boardUnits.length >= level}
                      className="lift border border-[#56DCA8] bg-[#1F7A5A] px-2 py-1.5 font-pixel text-[7.5px] text-[#090604] disabled:opacity-40"
                    >
                      {t("DEPLOY")}
                    </button>
                  ) : (
                    <button
                      onClick={toBench}
                      className="lift border border-[#4A3828] bg-[#221A14] px-2 py-1.5 label text-[7.5px] text-[#EDE2CB]"
                    >
                      {t("BENCH")}
                    </button>
                  )}
                  <button
                    onClick={() => sell(sel.uid)}
                    className="lift border border-[#962B16] bg-[#26120E] px-2 py-1.5 label text-[7.5px] text-[#F05A36]"
                  >
                    +{sellValue(sel)}G
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    aria-label={t("Deselect")}
                    className="p-1 text-[#8C7E6E] hover:text-[#EDE2CB]"
                  >
                    <IconClose size={10} />
                  </button>
                </div>
              </div>
            )}

            {/* Subtle Onboarding Prompt when Drawer is Empty */}
            {phase === "prep" && boardUnits.length === 0 && !sel && (
              <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-[#3B322A] bg-[#120D09]/92 px-2.5 py-1 label text-[7.5px] text-[#EDE2CB]">
                {(cmd ?? "matriarch") === "worm"
                  ? t("THE WORM DIGS A HOLE BENEATH THE STRONGEST FOE — STEPPING IN STUNS & EXPOSES")
                  : benchUnits.length > 0
                    ? t("TAP YOUR BENCH BUG BELOW OR HIT ENGAGE TO AUTO-DEPLOY")
                    : t("RECRUIT SPECIMENS FROM PIPKIN SUPPLY BELOW")}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT / BOTTOM COMMAND DOCK ──────────────────────── */}
        <aside className="panel-wood game-dock safe-b flex min-h-0 flex-col border-t-2 border-[#3B322A] lg:border lg:border-t">
          {/* Desktop Specimen Inspector — prep only; in combat the telemetry dock gets the room */}
          {!inCombat && (
          <div className="hidden border-b border-[#3B322A] p-3 lg:block">
            <div className="label mb-1.5 text-[7.5px] text-[#8C7E6E]">{t("SPECIMEN INSPECTOR")}</div>
            {sel ? (
              <div className="flex items-start gap-3">
                <div className="shrink-0 border border-[#3B322A] bg-[#100C09] p-1.5">
                  <SpecimenIcon id={sel.bugId} size={56} star={sel.star} selected />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] text-[#EDE2CB]">{t(BUGS[sel.bugId].name)}</span>
                    <StarRating star={sel.star} size={11} />
                  </div>
                  <div className="latin text-[12.5px] text-[#56DCA8]">{BUGS[sel.bugId].latin}</div>
                  <div className="label mt-1 text-[7.5px] text-[#B3A594]">
                    {t(BUGS[sel.bugId].role)} · HP {battleStats(sel.bugId, sel.star, cmd ?? "matriarch").hp} · ATK{" "}
                    {battleStats(sel.bugId, sel.star, cmd ?? "matriarch").atk}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[#9C8F7E]">
                    <span className="label mr-1 text-[7.5px] text-[#F0A93B]">
                      {selSkillUnlocked ? `${t(BUGS[sel.bugId].skill.name)}:` : `${t("NO SKILL")}:`}
                    </span>
                    {selSkillUnlocked
                      ? t(BUGS[sel.bugId].skill.desc)
                      : tf("Ultimate locked until {n}-star. This tier fights with its passive only.", { n: BUGS[sel.bugId].skillMinStar ?? 1 })}
                  </p>
                  {BUGS[sel.bugId].passive && (
                    <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-[#75D9E8]">
                      <span className="mt-px"><IconVulnerable size={12} /></span>
                      <span><span className="label mr-1 text-[7.5px] text-[#75D9E8]">{t(BUGS[sel.bugId].passive!.name)}:</span>{t(BUGS[sel.bugId].passive!.desc)}</span>
                    </p>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    {sel.zone === "bench" ? (
                      <button
                        onClick={quickDeploySelected}
                        disabled={boardUnits.length >= level}
                        className="lift border border-[#56DCA8] bg-[#1F7A5A] px-2.5 py-1 font-pixel text-[8px] text-[#090604] disabled:opacity-40"
                      >
                        {t("DEPLOY")}
                      </button>
                    ) : (
                      <button
                        onClick={toBench}
                        className="lift border border-[#4A3828] bg-[#100C09] px-2.5 py-1 label text-[8px] text-[#EDE2CB]"
                      >
                        {t("TO BENCH")}
                      </button>
                    )}
                    <button
                      onClick={() => sell(sel.uid)}
                      className="lift border border-[#962B16] bg-[#24110D] px-2.5 py-1 label text-[8px] text-[#F05A36]"
                    >
                      {t("SELL")} +{sellValue(sel)}G
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2 text-[11.5px] text-[#8C7E6E]">
                <div className="grid h-12 w-12 shrink-0 place-items-center border border-dashed border-[#3B322A] font-pixel text-[10px]">
                  3D
                </div>
                <p className="leading-snug">
                  {t("Click any bug on the 3D drawer or bench to inspect, reposition, or sell. Three identical bugs moult into a crowned higher star!")}
                </p>
              </div>
            )}
          </div>
          )}

          {inCombat && battleSnap ? (
            /* ── BATTLE TELEMETRY DOCK ────────────────────────── */
            <div className="dock-in flex flex-1 flex-col justify-between p-2.5 sm:p-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="label text-[8px] text-[#56DCA8]">{t("COMBAT TELEMETRY")}</span>
                  {armedHoles > 0 && (
                    <span
                      className="label flex items-center gap-1 border border-[#E8A0A8]/60 bg-[#2A151A] px-1.5 py-0.5 text-[7px] text-[#E8A0A8]"
                      title={t("Dig Hole traps waiting underfoot")}
                    >
                      <IconBurrow size={10} />
                      <span>{armedHoles} {t("HOLE")}</span>
                    </span>
                  )}
                  {liveZones.length > 0 && (
                    <span
                      className="label flex items-center gap-1 border border-[#75D9E8]/70 bg-[#0B2A31] px-1.5 py-0.5 text-[7px] text-[#BDF8FF]"
                      title={tf("Airstrike field — {d} raw damage per tick (ΣATK {s} × {m}, split over 2 ticks)", { d: liveZones[0]?.dps ?? 0, s: liveZones[0]?.combinedAtk ?? 0, m: AIRSTRIKE_TEAM_ATK_MULT })}
                    >
                      <IconSpeed size={10} />
                      <span>AIRSTRIKE {liveZones[0]?.dps ?? 0}{t("/tick").toUpperCase()} · {zoneSeconds}s{liveZones.length > 1 ? ` ×${liveZones.length}` : ""}</span>
                    </span>
                  )}
                  {vulnerableCount > 0 && (
                    <span
                      className="label flex items-center gap-1 border border-[#F0A93B]/60 bg-[#241B10] px-1.5 py-0.5 text-[7px] text-[#F0A93B]"
                      title={t("Vulnerable units take 1.5× damage")}
                    >
                      <IconVulnerable size={10} />
                      <span>VULN ×{vulnerableCount}</span>
                    </span>
                  )}
                  <span className="font-pixel text-[10px] text-[#F0A93B]">
                    {Math.max(0, 40 - Math.floor(battleSnap.t))}s
                  </span>
                  <button
                    onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 3 : 1))}
                    className="lift flex items-center gap-1 border border-[#4A3828] bg-[#120D09] px-2.5 py-1 font-pixel text-[8px] text-[#F0A93B] hover:border-[#F0A93B]"
                  >
                    <IconSpeed size={11} />
                    <span>{speed}× {t("SPEED")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label={t("SETTINGS")}
                    className="grid h-11 w-11 place-items-center border border-[#3B322A] bg-[#100C09] text-[#EDE2CB] active:translate-y-[1px]"
                  >
                    <IconSettings size={16} />
                  </button>
                  {adminButton("h-11 w-11 px-0")}
                </div>

                {/* ── LINE POWER: total HP tug-of-war + combined ATK (ΣATK) ── */}
                <div className="mt-2">
                  <div className="flex items-end justify-between gap-2 font-mono text-[9px]">
                    <span className="text-[#56DCA8]">
                      {t("YOUR LINE")} · {allyLiveHp} HP · <span className="text-[#BDF8FF]">ΣATK {allyTeamAtk}</span>
                    </span>
                    <span className="text-[#F05A36]">
                      <span className="text-[#FFB1A0]">ΣATK {foeTeamAtk}</span> · {foeLiveHp} HP · {foe.short}
                    </span>
                  </div>
                  <div className="relative mt-1 flex h-3 w-full overflow-hidden border border-[#3B322A] bg-[#962B16]">
                    <div
                      className="h-full bg-gradient-to-r from-[#15543d] to-[#1F7A5A]"
                      style={{ width: `${allyShare}%`, transition: "width 180ms steps(5)" }}
                    />
                    <span className="vital-notches" aria-hidden="true" />
                  </div>
                </div>

                {/* ── AIRSTRIKE FORECAST: the live math behind the dragonfly ult ── */}
                {allyDragonfly3 && (
                  <div className="forecast mt-2" role="status">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="label flex items-center gap-1.5 text-[7.5px] text-[#75D9E8]">
                        <IconSpeed size={11} /> {t("AIRSTRIKE FORECAST — YOURS")}
                      </span>
                      <span className="font-pixel text-[9px] text-[#BDF8FF]">
                        {allyDragonfly3.dive && !allyDragonfly3.dive.landed
                          ? t("AIRBORNE")
                          : allyDragonfly3.mana >= allyDragonfly3.maxMana
                            ? t("ULT READY")
                            : `MANA ${Math.floor(allyDragonfly3.mana)}/${allyDragonfly3.maxMana}`}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] leading-snug text-[#C9E8D8]">
                      ΣATK <b className="text-[#FFF3DC]">{allyTeamAtk}</b> × {AIRSTRIKE_TEAM_ATK_MULT} ={" "}
                      <b className="text-[#FFF3DC]">{airstrikeTickDamage(allyTeamAtk) * 2}</b> {t("total")} ·{" "}
                      <b className="text-[#BDF8FF]">{airstrikeTickDamage(allyTeamAtk)}{t("/tick")}</b> × 2 {t("ticks")}
                      <span className="hidden text-[#8C7E6E] min-[560px]:inline">{t("— falls as allies die")}</span>
                    </div>
                  </div>
                )}
                {foeDragonfly3 && (
                  <div className="forecast mt-2" role="status" style={{ borderColor: "rgba(240,90,54,.6)", background: "#1B0B07" }}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="label flex items-center gap-1.5 text-[7.5px] text-[#F05A36]">
                        <IconSpeed size={11} /> {t("ENEMY AIRSTRIKE WARNING")}
                      </span>
                      <span className="font-pixel text-[9px] text-[#FFB1A0]">
                        {foeDragonfly3.dive && !foeDragonfly3.dive.landed
                          ? t("AIRBORNE — INCOMING")
                          : foeDragonfly3.mana >= foeDragonfly3.maxMana
                            ? t("ULT READY")
                            : `MANA ${Math.floor(foeDragonfly3.mana)}/${foeDragonfly3.maxMana}`}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] leading-snug text-[#E8C9C0]">
                      {t("Their ΣATK")} <b>{foeTeamAtk}</b> → <b>{airstrikeTickDamage(foeTeamAtk)}{t("/tick")}</b> × 2.{" "}
                      <span className="hidden text-[#9C8F7E] min-[560px]:inline">{t("Thin their line to weaken it.")}</span>
                    </div>
                  </div>
                )}

                {/* ── LINE vs LINE: phones get fixed-height swipe strips (never crushes the stage, even at 6v6); desktop keeps 2-column stacks ── */}
                <div className="mt-2 flex flex-col gap-1.5 border-t border-[#2D231B] pt-2 lg:grid lg:grid-cols-2 lg:gap-2">
                  {([("ally"), ("foe")] as const).map((side) => (
                    <div key={side} className="min-w-0">
                      <div className={`label mb-1 text-[6.5px] ${side === "foe" ? "text-right text-[#F05A36]" : "text-[#56DCA8]"}`}>
                        {side === "ally" ? t("YOUR LINE") : foe.short}
                      </div>
                      <div className="unit-strip">
                      {battleSnap.units
                        .filter((u) => u.side === side)
                        .map((u) => {
                          const hpPct = Math.max(0, Math.min(100, (u.hp / Math.max(1, u.maxHp)) * 100));
                          const manaPct = Math.max(0, Math.min(100, (u.mana / Math.max(1, u.maxMana)) * 100));
                          const ultReady =
                            !u.dead && u.mana >= u.maxMana && u.star >= (BUGS[u.bugId].skillMinStar ?? 1);
                          const airborne = !!u.dive && !u.dive.landed;
                          return (
                            <div
                              key={u.uid}
                              className={`unit-card ${ultReady ? "ult-ready" : ""}`}
                              data-side={side}
                              data-dead={u.dead ? 1 : 0}
                              title={tf("{name} {star}-star — ATK {atk} · HP {hp}/{max}", { name: t(BUGS[u.bugId].name), star: u.star, atk: u.atk, hp: Math.max(0, u.hp), max: u.maxHp })}
                            >
                              <SpecimenIcon id={u.bugId} size={28} star={u.star} dim={u.dead} badge="none" />
                              <div className="min-w-0 flex-1">
                                <div className={`flex items-center gap-1.5 ${side === "foe" ? "flex-row-reverse" : ""}`}>
                                  <span className="label truncate text-[7px] text-[#EDE2CB]">{BUGS[u.bugId].short}</span>
                                  <StarRating star={u.star} size={8} />
                                  {u.dead ? (
                                    <span className="font-pixel text-[7px] text-[#F05A36]">KO</span>
                                  ) : airborne ? (
                                    <span className="font-pixel text-[7px] text-[#75D9E8]">AIR</span>
                                  ) : ultReady ? (
                                    <span className="font-pixel text-[7px] text-[#75D9E8]">ULT</span>
                                  ) : null}
                                </div>
                                <div className={`flex gap-2 font-mono text-[9px] font-semibold tabular-nums ${side === "foe" ? "flex-row-reverse" : ""}`}>
                                  <span style={{ color: side === "ally" ? "#56DCA8" : "#F05A36" }}>
                                    {Math.max(0, u.hp)}<span className="text-[#6B5F52]">/{u.maxHp}</span>
                                  </span>
                                  <span className="text-[#F0A93B]">ATK {u.atk}</span>
                                </div>
                                <div className="bar-shell mt-0.5">
                                  <i style={{ width: `${hpPct}%`, background: side === "ally" ? "#56DCA8" : "#F05A36" }} />
                                </div>
                                <div className="bar-shell mana mt-0.5" title={`Mana ${Math.floor(u.mana)}/${u.maxMana}`}>
                                  <i style={{ width: `${manaPct}%`, background: ultReady ? "#BDF8FF" : "#C9812A" }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-2 hidden border-t border-[#2D231B] pt-1.5 min-[720px]:block">
                <div className="label mb-1 text-[7px] text-[#8C7E6E]">{t("ENGAGEMENT RECORD")}</div>
                {log.length === 0 ? (
                  <div className="latin text-[11.5px] text-[#6B5F52]">
                    {t("First clash of the cabinet — no record yet.")}
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {log.slice(0, 3).map((line, i) => (
                      <li
                        key={`${i}-${line}`}
                        className="flex items-center gap-1.5 truncate font-mono text-[9.5px]"
                        style={{ color: i === 0 ? "#B3A594" : "#6B5F52" }}
                      >
                        {line.startsWith("WON") || line.startsWith("MENANG") ? (
                          <IconTrendUp size={9} className="shrink-0 text-[#56DCA8]" />
                        ) : (
                          <IconTrendDown size={9} className="shrink-0 text-[#F05A36]" />
                        )}
                        <span className="truncate">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            /* ── PREP COMMAND DOCK: Bench + Shop + Actions ─────── */
            <div className="dock-in flex flex-1 flex-col justify-end">
              {/* Bench Row (6 Slots) */}
              <div className="px-2 pt-1.5 pb-1.5 sm:px-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="label text-[7.5px] text-[#9C8F7E]">
                    {t("BENCH")} ({benchUnits.length}/{BENCH_SIZE})
                  </span>
                  {benchUnits.length > 0 && boardUnits.length < level && (
                    <button
                      onClick={autoFillLine}
                      className="label flex items-center gap-1 text-[7.5px] text-[#56DCA8] hover:text-[#FFF0C0]"
                    >
                      <IconAutoDeploy size={10} />
                      <span>{tf("AUTO-DEPLOY ({n} OPEN)", { n: level - boardUnits.length })}</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: BENCH_SIZE }).map((_, i) => {
                    const u = benchUnits.find((b) => b.slot === i);
                    const isSel = !!u && selected === u.uid;
                    return (
                      <button
                        key={i}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          onBench(i);
                        }}
                        title={u ? tf("{name} (Tap again to deploy)", { name: t(BUGS[u.bugId].name) }) : t("Empty bench slot")}
                        className={`lift bench-slot relative grid h-11 place-items-center border sm:h-12 ${
                          isSel ? "border-[#F0A93B] bg-[#241B14]" : "border-[#3B322A] bg-[#120D09]"
                        } ${!u && benchUnits.length >= BENCH_SIZE ? "bench-slot--over" : ""}`}
                        style={{
                          boxShadow: isSel
                            ? "0 0 10px rgba(240,169,59,.45)"
                            : "inset 0 1px 3px rgba(0,0,0,.6)",
                        }}
                      >
                        {u ? (
                          <>
                            <span
                              className="absolute left-0 top-0 h-full w-[2px]"
                              style={{ background: BUGS[u.bugId].accent }}
                            />
                            <SpecimenIcon id={u.bugId} size={33} star={u.star} selected={isSel} badge="none" />
                            <span className="pointer-events-none absolute left-0.5 top-0.5">
                              <RankBadge id={u.bugId} size={11} />
                            </span>
                          </>
                        ) : (
                          <span className="bench-slot__index">{i + 1}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shop Row (5 Pipkin Supply Cards with Moult/Pair Highlights!) */}
              <div className="border-t border-[#2D231B] px-2 pt-1.5 pb-1.5 sm:px-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="label text-[7.5px] text-[#9C8F7E]">{t("PIPKIN SUPPLY")}</span>
                    {shopLocked && (
                      <span className="label bg-[#F0A93B] px-1 py-px text-[6.5px] text-[#090604]">{t("HELD")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setScouting((v) => !v)}
                      title={t("Scout the next opponent (V)")}
                      className={`label flex items-center gap-1 border px-2 py-0.5 text-[7px] ${
                        scouting
                          ? "border-[#E0522F] bg-[#2A1512] text-[#F05A36]"
                          : "border-[#3B322A] text-[#9C8F7E] hover:border-[#E0522F] hover:text-[#F05A36]"
                      }`}
                    >
                      <IconScout size={11} />
                      <span>{t("SCOUT")}</span>
                    </button>
                    <button
                      onClick={toggleLock}
                      title={t("Lock the shop so it carries into the next drawer (L)")}
                      className={`label flex items-center gap-1 border px-2 py-0.5 text-[7px] ${
                        shopLocked
                          ? "border-[#F0A93B] bg-[#241B14] text-[#F0A93B]"
                          : "border-[#3B322A] text-[#9C8F7E] hover:border-[#F0A93B] hover:text-[#F0A93B]"
                      }`}
                    >
                      {shopLocked ? <IconLock size={10} /> : <IconUnlock size={10} />}
                      <span>{shopLocked ? t("LOCKED") : t("LOCK")}</span>
                    </button>
                    {adminButton("h-11 w-11 px-0")}
                  </div>
                </div>
                {scouting && (
                  <div className="rise mb-1.5 border border-[#8E2A16] bg-[#1A100D] p-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="label text-[7px] text-[#F05A36]">
                        <IconScout size={10} /><span>{foe.short} {t("WILL FIELD")}</span>
                      </span>
                      <span className="latin text-[10.5px] text-[#8C7E6E]">{t(cmdById(foe.cmd).perk)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scoutTeam.map((e) => (
                        <div
                          key={`${e.bugId}${e.star}`}
                          className="flex items-center gap-1 border border-[#3B322A] bg-[#120D09] px-1 py-0.5"
                        >
                          <SpecimenIcon id={e.bugId} size={20} star={e.star} badge="none" />
                          <span className="font-mono text-[9px] font-bold text-[#EDE2CB]">×{e.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1">
                  {shop.map((id, i) => {
                    const owned1 = id ? ownedCounts[id].s1 : 0;
                    const willMoult = !!id && owned1 >= 2;
                    const isPair = !!id && owned1 === 1;
                    const affordable = !!id && gold >= BUGS[id].cost;

                    return (
                      <button
                        key={i}
                        onClick={() => buy(i)}
                        disabled={!id || !affordable}
                        className={`lift relative flex flex-col items-center justify-between border bg-[#120D09] px-1 pt-2 pb-1 ${
                          !id
                            ? "sold border-[#241C16]"
                            : !affordable
                              ? "border-[#2D231B] opacity-45"
                              : willMoult
                                ? "moult-glow border-[#F0A93B] bg-[#1F170E]"
                                : isPair
                                  ? "border-[#56DCA8]/75 hover:border-[#F0A93B]"
                                  : "border-[#3B322A] hover:border-[#F0A93B]"
                        }`}
                      >
                        {id ? (
                          <>
                            {/* Moult / Pair ribbon */}
                            {willMoult && (
                              <span className="absolute left-0 top-0 flex items-center gap-0.5 bg-[#56DCA8] px-1 font-pixel text-[6px] leading-[1.4] text-[#090604]">
                                <IconStar size={6} />
                                <span>{t("UP")}</span>
                              </span>
                            )}
                            {!willMoult && isPair && (
                              <span className="absolute left-0 top-0 bg-[#28473B] px-1 font-mono text-[6.5px] font-bold leading-[1.3] text-[#56DCA8]">
                                2/3
                              </span>
                            )}
                            <span className="absolute right-0 top-0 bg-[#F0A93B] px-1 font-pixel text-[7px] leading-[1.4] text-[#090604]">
                              {BUGS[id].cost}
                            </span>

                            <SpecimenIcon id={id} size={35} badge="none" />
                            <span className="mt-0.5 flex w-full items-center justify-center gap-1">
                              <RankBadge id={id} size={12} />
                              <span className="label truncate text-[7px] text-[#EDE2CB]">{BUGS[id].short}</span>
                            </span>
                            <span
                              className="mt-0.5 block h-[2px] w-full"
                              style={{ background: BUGS[id].accent }}
                            />
                          </>
                        ) : (
                          <span className="grid h-[48px] place-items-center text-[9px] text-[#3B322A]">·</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Controls Bar */}
              <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-1.5 border-t border-[#2D231B] px-2 pt-1.5 pb-1 sm:px-3 sm:pt-2">
                <button
                  onClick={reroll}
                  disabled={gold < 2}
                  className="lift flex min-h-[40px] flex-col items-center justify-center border border-[#4A3828] bg-[#14100C] px-2 py-1 disabled:opacity-35"
                >
                  <div className="flex items-center gap-1">
                    <IconReroll size={10} className="text-[#EDE2CB]" />
                    <span className="label text-[8px] text-[#EDE2CB]">{t("REROLL")}</span>
                  </div>
                  <span className="font-pixel text-[7.5px] text-[#F0A93B]">{t("2 GOLD")}</span>
                </button>

                <button
                  onClick={levelUp}
                  disabled={gold < levelCost || level >= MAX_FIELD_SIZE}
                  className="lift flex min-h-[40px] flex-col items-center justify-center border border-[#4A3828] bg-[#14100C] px-2 py-1 disabled:opacity-35"
                >
                  <div className="flex items-center gap-1">
                    <IconUpgrade size={10} className="text-[#EDE2CB]" />
                    <span className="label text-[8px] text-[#EDE2CB]">
                      {level >= MAX_FIELD_SIZE ? t("MAX LINE") : `${t("LINE")} +1`}
                    </span>
                  </div>
                  <span className="font-pixel text-[7.5px] text-[#56DCA8]">
                    {level >= MAX_FIELD_SIZE ? `${MAX_FIELD_SIZE}/${MAX_FIELD_SIZE}` : tf("{n} GOLD", { n: levelCost })}
                  </span>
                </button>

                <button
                  onClick={engage}
                  aria-label={boardUnits.length ? tf("Engage battle — {n} deployed", { n: boardUnits.length }) : t("Engage battle — auto-deploys from bench")}
                  className={`lift flex min-h-[40px] items-center justify-center gap-1.5 border-2 border-[#56DCA8] bg-[#1F7A5A] px-3 py-1 font-pixel text-[10px] text-[#090604] shadow-[0_3px_0_#0D3B2A] ${
                    phase === "prep" && (boardUnits.length > 0 || benchUnits.length > 0) ? "ready-pulse" : ""
                  }`}
                >
                  <span>{t("ENGAGE")}</span>
                  <IconArrowRight size={13} />
                </button>
              </div>

              {/* keyboard map — desktop only */}
              <div className="hidden flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-1.5 lg:flex">
                {[
                  ["1-5", "BUY"],
                  ["D", "REROLL"],
                  ["F", "LEVEL"],
                  ["L", "LOCK"],
                  ["V", "SCOUT"],
                  ["A", "AUTO-FILL"],
                  ["SPACE", "ENGAGE"],
                ].map(([key, act]) => (
                  <span key={key} className="flex items-center gap-1">
                    <kbd className="border border-[#4A3828] bg-[#120D09] px-1 py-px font-mono text-[8px] text-[#F0A93B]">
                      {key}
                    </kbd>
                    <span className="label text-[6.5px] text-[#6B5F52]">{t(act)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Toast Feedback */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-14 z-50 -translate-x-1/2">
          <div
            className="toast rise border-2 border-[#4A3828] bg-[#14100C] px-4 py-2.5 font-pixel text-[8.5px] shadow-[0_6px_16px_rgba(0,0,0,.8)]"
            style={{ "--toast-accent": toastTone === "good" ? "#56DCA8" : toastTone === "warn" ? "#F05A36" : "#F0A93B", color: "#F0A93B" } as React.CSSProperties}
            role="status"
          >
            {toast}
          </div>
        </div>
      )}

      {/* Drawer Result Modal */}
      {phase === "result" && report && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 px-4 py-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="round-result-title">
          <div className="paper-card rise max-h-[92dvh] w-full max-w-[420px] overflow-y-auto border-2 border-[#241B14] p-4 shadow-[0_12px_0_rgba(0,0,0,.55)]">
            <div className="flex items-center justify-between">
              <span className="label text-[8px] text-[#8E2A16]">{tf("ROUND {n} REPORT", { n: round + 1 })}</span>
              <span
                className="px-2 py-0.5 font-pixel text-[8px] text-[#FFF3DC]"
                style={{ background: report.win ? "#1F7A5A" : "#8E2A16" }}
              >
                {report.win ? t("SPECIMEN WIN") : t("COLONY BREACH")}
              </span>
            </div>

            <h2 id="round-result-title" className="mt-2 font-pixel text-[20px] text-[#241B14]">
              {match.winnerId === PLAYER_ID ? t("LAST COLONY!") : hp <= 0 ? t("ELIMINATED") : report.win ? t("VICTORY") : t("DEFEAT")}
            </h2>
            <div className="latin text-[13.5px] text-[#5C4A38]">
              vs {BOTS[report.foeIdx].name} — <i>{BOTS[report.foeIdx].latin}</i>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-[#5C4A38]">
              {match.winnerId
                ? tf("{winner} is the only surviving colony.", { winner: t(colonyName(match.winnerId)) })
                : hp <= 0
                  ? tf("Your place: #{place}. The {n} survivors will keep fighting for the championship.", { place: playerColony.place ?? "—", n: activeCount })
                  : activeCount === 2
                    ? tf("{n} colonies remain. The next rounds are a direct final duel.", { n: activeCount })
                    : tf("{n} colonies remain. The match continues until one survives.", { n: activeCount })}
            </p>
            {report.echo && (
              <p className="mt-1 text-[10px] text-[#7A5318]">{t("Echo match: only your colony can lose HP; the rival's real colony is not damaged here.")}</p>
            )}

            <div className="mt-3 space-y-1 border-y border-[#241B14]/25 py-2.5">
              {[
                {
                  l: report.win ? t("FOE COLONY DAMAGE") : t("COLONY DAMAGE TAKEN"),
                  v: report.win ? `-${report.dealt} HP` : `-${report.taken} HP`,
                  c: report.win ? "#165C43" : "#8E2A16",
                },
                {
                  l: t("TOTAL GOLD EARNED"),
                  v: `+${5 + report.interest + report.bonus}G`,
                  c: "#241B14",
                },
                { l: t("  · ROUND STIPEND"), v: "+5G", c: "#5C4A38" },
                { l: t("  · INTEREST (10G/PT)"), v: `+${report.interest}G`, c: "#5C4A38" },
                { l: t("  · VICTORY BOUNTY"), v: `+${report.win ? 2 : 0}G`, c: "#5C4A38" },
                {
                  l: tf(report.streak > 0 ? "  · WIN STREAK ×{n}" : "  · LOSS STREAK ×{n}", { n: Math.abs(report.streak) }),
                  v: `+${report.streakGold}G`,
                  c: report.streakGold > 0 ? "#7A5318" : "#8C7E6E",
                },
              ].map((r) => (
                <div key={r.l} className="flex items-baseline justify-between">
                  <span className="label text-[8.5px]" style={{ color: r.c }}>
                    {r.l}
                  </span>
                  <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: r.c }}>
                    {r.v}
                  </span>
                </div>
              ))}
            </div>

            <RoundResults summary={match.lastRound} paper />
            {adminButton("mt-3 w-full")}

            <button
              onClick={next}
              className="lift flex items-center justify-center gap-2 mt-4 w-full border-2 border-[#241B14] bg-[#1F7A5A] py-3 font-pixel text-[11px] text-[#FFF3DC] shadow-[0_4px_0_#0D3B2A]"
            >
              <span>
                {match.winnerId
                  ? t("VIEW FINAL STANDINGS")
                  : hp <= 0
                    ? t("WATCH THE SURVIVORS")
                    : tf("NEXT ROUND ({n})", { n: round + 2 })}
              </span>
              <IconArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      <CodexModal open={guideOpen} onClose={() => setGuideOpen(false)} />
        {adminPanel}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
