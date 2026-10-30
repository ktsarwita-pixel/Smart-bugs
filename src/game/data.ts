// ─────────────────────────────────────────────────────────────
// SMART BUGS — specimen data
// Hand-plotted 16x16 pixel matrices + tactical stats & lore.
// ─────────────────────────────────────────────────────────────

export type BugId = "stag" | "bomb" | "mantis" | "dragonfly" | "spider";
export type CmdId = "matriarch" | "lampyris" | "worm";

export interface BugDef {
  id: BugId;
  name: string;
  short: string;
  latin: string;
  role: "Frontline" | "Artillery" | "Assassin";
  accent: string;
  cost: number;
  hp: number;
  atk: number;
  def: number;
  range: number;
  spd: number; // cells / second
  atkCd: number; // seconds
  skill: { name: string; desc: string };
  /** Lowest star tier that may cast this skill (defaults to 1). */
  skillMinStar?: 1 | 2 | 3;
  passive?: { name: string; desc: string };
  starStats?: Partial<Record<1 | 2 | 3, { hp: number; atk: number; def?: number }>>;
  art: string[];
  pal: Record<string, string>;
}

export const BUGS: Record<BugId, BugDef> = {
  stag: {
    id: "stag",
    name: "Stag Beetle",
    short: "STAG",
    latin: "Lucanus cervus",
    role: "Frontline",
    accent: "#4FD3A0",
    cost: 2,
    hp: 300,
    atk: 34,
    def: 30,
    range: 0.95,
    spd: 2.1,
    atkCd: 1.2,
    skill: { name: "Pincer Lock", desc: "2.1× damage and stuns the target for 1.4s." },
    pal: {
      A: "#FFD566",
      a: "#DA9630",
      d: "#2B1E14",
      D: "#4A3525",
      g: "#1F7A5A",
      G: "#124734",
      h: "#68E8B7",
      e: "#FF4D2D",
      l: "#3A291C",
    },
    art: [
      // v2 icon: glowing-tipped pincers, attached legs, shaded elytra
      // with a bright dorsal stripe and dark center seam.
      "..Ae........eA..",
      ".aA..........Aa.",
      ".aaA........Aaa.",
      "..adDDDDDDDDda..",
      "..edDDDDDDDDde..",
      ".lldDDDDDDDDdll.",
      ".llddddddddddll.",
      "...dDDDDDDDDd...",
      "...gghhGGhhgg...",
      ".llgghhGGhhggll.",
      "...gghhGGhhgg...",
      ".llgghhGGhhggll.",
      "....gghGGhgg....",
      "....ggGGGGgg....",
      ".....gGGGGg.....",
      "......GGGG......",
    ],
  },
  bomb: {
    id: "bomb",
    name: "Bombardier",
    short: "BOMB",
    latin: "Brachinus tarsatus",
    role: "Artillery",
    accent: "#7FA8DC",
    cost: 3,
    hp: 190,
    atk: 44,
    def: 14,
    range: 3.1,
    spd: 1.85,
    atkCd: 1.35,
    skill: { name: "Caustic Burst", desc: "Boiling spray: 1.5× damage to target and adjacent foes." },
    pal: {
      a: "#E0944F",
      O: "#FFA052",
      o: "#D96823",
      r: "#FF4828",
      y: "#A8D1FF",
      b: "#2D5994",
      B: "#1B3457",
      w: "#FFE7A3",
      l: "#422E1E",
    },
    art: [
      // v2 icon: attached legs, sleek cobalt shell with pale seams and a
      // twin-vent, white-hot glowing tail.
      "..aa........aa..",
      "...aa......aa...",
      "....aa....aa....",
      "....aOOOOOOa....",
      "..loOrrrrrrOol..",
      ".lloOOOOOOOOoll.",
      "..yybbBBBBbbyy..",
      ".yybbbBBBBbbbyy.",
      "llybboBBBBobbyll",
      "llybbBBBBBBbbyll",
      "..ybbbBBBBbbby..",
      "..lbbBBBBBBbbl..",
      "...bbBBwwBBbb...",
      "...BbwwwwwwbB...",
      "...BrwwwwwwrB...",
      "....rwwwwwwr....",
    ],
  },
  mantis: {
    id: "mantis",
    name: "Praying Mantis",
    short: "MANTIS",
    latin: "Mantis religiosa",
    role: "Assassin",
    accent: "#88E899",
    cost: 3,
    hp: 205,
    atk: 50,
    def: 11,
    spd: 2.75,
    range: 1.0,
    atkCd: 1.0,
    skill: { name: "Raking Slash", desc: "Three cuts at 0.95× on the three most wounded foes in reach." },
    pal: {
      s: "#EAFFF0",
      l: "#8BF09D",
      e: "#33A350",
      E: "#1A5C2A",
      n: "#A6FFDE",
      t: "#236B34",
    },
    art: [
      // v2 icon: raptorial arms hugging the head, glowing eye band, folded-
      // wing diamond with dark segment rings, attached legs.
      "..ll........ll..",
      "...ll......ll...",
      "..snneeeeeenns..",
      "..sneeeeeeeens..",
      ".ssseeeeeeeesss.",
      ".lsseeeeeeeessl.",
      "..tseeeeeeeest..",
      "...teeEEEEeet...",
      ".tteEEeEEeEEett.",
      "..teEEeEEeEEet..",
      ".tteEEEeeEEEett.",
      "...eeEEEEEEee...",
      "..teEEEeeEEEet..",
      "...eEEEeeEEEe...",
      "....eEEEEEEe....",
      ".....EEEEEE.....",
    ],
  },
  dragonfly: {
    id: "dragonfly",
    name: "Azure Dragonfly",
    short: "DRAGONFLY",
    latin: "Anax junius",
    role: "Assassin",
    accent: "#75D9E8",
    cost: 4,
    hp: 400,
    atk: 60,
    def: 12,
    range: 0.95,
    spd: 3.35,
    atkCd: 0.92,
    skill: {
      name: "Airstrike",
      desc: "3-star ultimate. The Dragonfly climbs (untouchable while airborne), dives onto the densest enemy cluster, and leaves a 2s field (2 ticks). Each tick deals 110% of your whole living team's combined ATK — 220% (2.2×) total — to enemies inside. More and stronger allies alive = bigger ticks; as allies fall, ticks weaken.",
    },
    skillMinStar: 3,
    passive: {
      name: "Slipstream",
      desc: "Takes only 20% damage from non-projectile attacks. Bombardier shells still deal full damage.",
    },
    starStats: {
      1: { hp: 400, atk: 60, def: 12 },
      // DEF scales on the same 1.2× / 1.5× steps as every other bug
      // (it was pinned to 12 at all stars, so star-ups looked broken).
      2: { hp: 750, atk: 140, def: 14 },
      3: { hp: 1100, atk: 235, def: 18 },
    },
    pal: {
      w: "#C7F9FF",
      W: "#8EEAF2",
      c: "#45BFD0",
      C: "#207E9C",
      d: "#17506F",
      D: "#102F4C",
      a: "#E9A352",
      e: "#A9FFF4",
      l: "#273843",
    },
    // Top-down sprite. Every row is authored as a mirrored LEFT half, so
    // left/right are exact reflections by construction — the old hand-typed
    // rows had ragged lengths (14/15 chars) that shifted the padding and
    // left the whole abdomen jogging off the thorax axis, which read as
    // mismatched arrows with a detached tail on the menu tab strip.
    // Wings: one clean horizontal sail pair rooted into the thorax — no
    // free-floating strokes. pal keys: w/W wing, c/C teal, d/D deep navy,
    // a amber stigma, e glow (eyes + tail tip).
    // Top-down sprite, authored as a mirrored LEFT half (8 cols) so
    // left/right are exact reflections by construction — hand-typed full
    // rows caused the old ragged-length drift. v7 matches the Dartwing
    // sculpt: fore wings swept up-out past the eyes, hind wings swept
    // down-out (the odonate X), roots touching the thorax columns, long
    // banded tail, glowing eyes + tail tip. pal keys: w/W wing, c/C teal,
    // d/D deep navy, a amber stigma, e glow (eyes + tail tip).
    art: [
      // v9: bold 2px odonate X — fore wings sweep up-out, hind wings
      // down-out, each with an amber stigma; 4-wide head with a 3-tall
      // glowing aqua compound eye, banded tail tapering to a glowing
      // tip. Mirrored half.
      "........",
      ".W......",
      ".aW...eC",
      "..Ww..eC",
      "...Ww.eC",
      "....WwcC",
      ".....ccC",
      "....wWcC",
      "...wW.cC",
      "..aW..dD",
      ".wW....c",
      ".W.....d",
      ".......c",
      ".......d",
      ".......c",
      ".......e",
    ].map((half) => half + [...half].reverse().join("")),
  },

  spider: {
    id: "spider",
    name: "Spider",
    short: "SPIDER",
    latin: "Latrodectus mactans",
    role: "Frontline",
    accent: "#FF5147",
    cost: 5,
    hp: 550,
    atk: 100,
    def: 18,
    range: 0.95,
    spd: 2.6,
    atkCd: 1.05,
    skill: {
      name: "Sticky Webs",
      desc:
        "3-star ultimate. Battle start: the Spider spits one giant web over the whole board — enemies on it are slowed 50% and take 500 damage per second for the entire battle. When Energy is full it spits a second ball at the densest enemy group: one big 3×3 web deals 750 damage to and slows 30% any enemy that steps on it. The 3×3 web dissolves after 5 seconds.",
    },
    skillMinStar: 3,
    passive: {
      name: "Enraged",
      desc:
        "Every 6s the Spider's next bite is enraged: 2× damage and it poisons the target — 3 poison ticks, 1s apart, each dealing 50% of the Spider's ATK (every 5s at 2-star; every 3s at 3-star, with 80% ATK poison ticks).",
    },
    starStats: {
      1: { hp: 550, atk: 100, def: 18 },
      2: { hp: 950, atk: 170, def: 21 },
      3: { hp: 1560, atk: 275, def: 26 },
    },
    pal: {
      d: "#140D1C",
      D: "#221730",
      m: "#3E2C50",
      l: "#0A0710",
      L: "#33243F",
      e: "#FF3B30",
      h: "#FF9A8C",
      w: "#E9E4F2",
    },
    art: [
      // v2 icon: top-down BLACK WIDOW — glossy black carapace, slim long
      // legs, and the signature red hourglass on the big abdomen.
      // Mirrored half.
      "........",
      ".....dh.",
      "....dDh.",
      "..l..dD.",
      "..l.DDD.",
      ".lL.DDee",
      ".l.DDDDe",
      "lL.DDDDe",
      "l..DDDee",
      "l.mDDDDm",
      ".l.mDDD.",
      ".l..DDD.",
      "..l.DDd.",
      "...l.Dd.",
      "....ldd.",
      ".....dw.",
    ].map((half) => half + [...half].reverse().join("")),
  },
};

export const BUG_ORDER: BugId[] = ["stag", "bomb", "mantis", "dragonfly", "spider"];

export const STAR_MULT = [1, 1.8, 3.2];

export interface CmdDef {
  id: CmdId;
  name: string;
  short: string;
  title: string;
  latin: string;
  accent: string;
  desc: string;
  perk: string;
  art: string[];
  pal: Record<string, string>;
}

export const COMMANDERS: CmdDef[] = [
  {
    id: "matriarch",
    name: "The Termite Queen",
    short: "QUEEN",
    title: "Queen of the Mound",
    latin: "Macrotermes bellicosus",
    accent: "#F0A93B",
    perk: "Brood Hymn",
    desc: "Every bug you field enters the drawer with +18% max HP and +8% attack.",
    pal: {
      c: "#FFF4CC",
      g: "#F0A93B",
      t: "#8C6642",
      T: "#543C25",
      i: "#EAD7B8",
      e: "#FF4D2D",
      l: "#422E1D",
    },
    art: [
      // v2 icon: clean three-point glowing crown, gold rim, glowing eyes,
      // pale wing-case inlay, attached legs.
      ".c...c....c...c.",
      ".cccccccccccccc.",
      ".ccggggggggggcc.",
      "..cgttttttttgc..",
      ".egttttttttttge.",
      ".lgtiiittiiitgl.",
      ".egtiiiiiiiitge.",
      ".lgtiiiiiiiitgl.",
      "..gtiiiiiiiitg..",
      ".lggiiiiiiiiggl.",
      "..gtiiiiiiiitg..",
      "..gttttttttttg..",
      "...gttttttttg...",
      "....gTTTTTTg....",
      ".....TTTTTT.....",
      "......TTTT......",
    ],
  },
  {
    id: "lampyris",
    name: "The Lantern Oracle",
    short: "ORACLE",
    title: "Oracle of the Lantern",
    latin: "Photinus pyralis",
    accent: "#7FE0C0",
    perk: "Night Signal",
    desc: "Every 5s your most wounded bug heals 12% max HP and gains +25 energy.",
    pal: {
      a: "#A69470",
      k: "#1C241A",
      K: "#2E3B2B",
      g: "#F0A93B",
      w: "#FFF8D1",
      e: "#96FFE5",
      l: "#273023",
    },
    art: [
      // v2 icon: dark elytra rimmed gold over one big white-hot lantern
      // with a mint core, glowing eyes, attached antennae.
      "..a..........a..",
      "..aa........aa..",
      ".ggkkkkkkkkkkgg.",
      ".gkkkkeeeekkkkg.",
      ".gkkkkkkkkkkkkg.",
      ".kkkkkkkkkkkkkk.",
      "..kkKKKKKKKKkk..",
      "..gKwwwwwwwwKg..",
      "..gwwwwwwwwwwg..",
      ".ggwwwwwwwwwwgg.",
      "..gwwweeeewwwg..",
      "..gwwwwwwwwwwg..",
      "..gwwwwwwwwwwg..",
      "..gKwwwwwwwwKg..",
      "...gwwwwwwwwg...",
      "....gggggggg....",
    ],
  },

  {
    id: "worm",
    name: "The Worm",
    short: "WORM",
    title: "Gardener of the Deep",
    latin: "Lumbricus terrestris",
    accent: "#E8A0A8",
    perk: "Dig Hole",
    desc: "At battle start, digs a one-tile hole beneath the enemy's strongest bug. Any enemy stepping in is stunned 2s and made Vulnerable 2s, taking 1.5× damage.",
    // REWORK v4 sprite — the armored grub from the new 3D sculpt: hooked
    // mandibles (m), pale shovel head plate (P) with glowing eyes (e),
    // chitin-plated segments (p) with dark rims (n), a pale saddle (h/H),
    // flank setae (B) and a glowing tail tip. h/H are new pal keys so the
    // saddle matches the 3D sculpt exactly.
    pal: {
      p: "#D98A96",
      P: "#F6C2C8",
      s: "#B06A78",
      n: "#9C5566",
      e: "#FFE08C",
      m: "#3D1B23",
      B: "#4A3324",
      h: "#EFD0C6",
      H: "#D9A99C",
    },
    art: [
      "................",
      "...m........m...",
      "...mmPPPPPPmm...",
      "....nePPPPen....",
      "....nPPnnPPn....",
      "...pppppppppp...",
      ".BnppppppppppnB.",
      "..nhhhhhhhhhhn..",
      "..nHHHhhhhHHHn..",
      ".BnppppppppppnB.",
      "...pppppppppp...",
      "....pppppppp....",
      "....pppppppp....",
      ".....pppppp.....",
      "......pppp......",
      ".......ee.......",
    ],
  },
];

export const cmdById = (id: CmdId) => COMMANDERS.find((c) => c.id === id)!;

export interface BotDef {
  id: string;
  name: string;
  short: string;
  latin: string;
  cmd: CmdId;
  power: number;
  lean: BugId[];
}

export const BOTS: BotDef[] = [
  {
    id: "vespa",
    name: "Vespa Syndicate",
    short: "VESPA",
    latin: "Vespa crabro",
    cmd: "matriarch",
    power: 1.0,
    lean: ["stag", "dragonfly", "mantis"],
  },
  {
    id: "aphid",
    name: "Aphid Union",
    short: "APHID",
    latin: "Aphis fabae",
    cmd: "lampyris",
    power: 0.92,
    lean: ["bomb", "spider", "stag"],
  },
  {
    id: "moth",
    name: "Moth League",
    short: "MOTH",
    latin: "Biston betularia",
    cmd: "worm",
    power: 1.06,
    lean: ["mantis", "dragonfly", "spider"],
  },
];

export const SHOP_WEIGHTS: { id: BugId; w: number }[] = [
  { id: "stag", w: 34 },
  { id: "bomb", w: 26 },
  { id: "mantis", w: 26 },
  { id: "dragonfly", w: 14 },
  { id: "spider", w: 10 },
];

export const GAME_INFO = {
  version: "0.4",
  units: BUG_ORDER.length,
  commanders: COMMANDERS.length,
  rivals: BOTS.length,
  colonies: BOTS.length + 1,
  victoryRule: "Rounds continue until only one colony remains. No round limit, no highest-HP shortcut.",
};

export const SPECIMEN_IDS = [...BUG_ORDER, ...COMMANDERS.map((c) => c.id)];
export const STARTING_COLONY_HP = 100;
export const MAX_FIELD_SIZE = 6;
export const BENCH_SIZE = 6;
export const BOARD_SLOTS = 21; // 3 rows x 7 cols per side

export interface VoxSpec {
  glow: string[];
  glowColor: string;
}

export const VOX: Record<string, VoxSpec> = {
  stag: { glow: ["e"], glowColor: "#FF4D2D" },
  bomb: { glow: ["r", "w"], glowColor: "#FF8038" },
  mantis: { glow: ["n"], glowColor: "#A6FFDE" },
  dragonfly: { glow: ["e", "w"], glowColor: "#B8F9FF" },
  spider: { glow: ["e", "h"], glowColor: "#FF4A3C" },
  matriarch: { glow: ["e", "c"], glowColor: "#FFC252" },
  lampyris: { glow: ["w", "e"], glowColor: "#FFF8D1" },
  worm: { glow: ["e"], glowColor: "#FFE08C" },
};

export const voxFor = (id: string): VoxSpec =>
  VOX[id] ?? { glow: [], glowColor: "#F0A93B" };

export const artFor = (id: string) => {
  const b = (BUGS as unknown as Record<string, BugDef>)[id];
  if (b) return { art: b.art, pal: b.pal };
  const c = COMMANDERS.find((k) => k.id === id) ?? COMMANDERS[0];
  return { art: c.art, pal: c.pal };
};
