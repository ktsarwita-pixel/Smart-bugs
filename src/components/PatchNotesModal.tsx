import { useEffect, useLayoutEffect } from "react";
import { GAME_INFO } from "../game/data";
import { useSettings } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface VersionEntry {
  v: string;
  title: string;
  items: string[];
}

const VERSIONS: VersionEntry[] = [
  {
    v: "0.61",
    title: "THE FALLEN REST",
    items: [
      "FIXED — fallen bugs no longer blink out mid-death-fall. Corpses now play the full death pose, REST on the tile, then sink into the soil and fade — each kill lands with a dust puff, a soft ring and a grounded shadow.",
      "The VS plaque is a real control now: tap it to scout the next foe's lineup — the panel opens right under the plaque, the INTIP/SCOUT button and the V key share the same state, and the plaque lights red while scouting.",
      "Responsive pass: the command deck scales UP on big phones, tablets and desktop (bigger numbers, taller plaque, roomier slab) and squeezes down cleanly on 320px phones — nothing wraps, clips or shrinks to an untappable sliver.",
      "QOL: your battle speed (1×/2×/3×) is remembered between rounds, matches and restarts; Enter or N advances the round-result screen; its button comes pre-focused.",
    ],
  },
  {
    v: "0.6",
    title: "THE COLONY WARS",
    items: [
      "THE WAR GROWS: 3 rival colonies are now 7 — Beetle Bastion, Fire Ant Union, Cricket Choir and Roach Cartel join the ladder. 8 colonies enter, one survivor wins.",
      "Match UI overhaul: the colony ladder is a 4-wide battle grid with live HP and places, plus a fixture strip showing every duel happening elsewhere this round.",
      "Pipkin Supply now shows RARITY — Common, Uncommon, Rare and Epic — on every card and in the shop header.",
      "Drawer overhaul: your commander and the enemy commander stand on brass plinths with banners at the table ends, arriving with a ceremony each time the opponent changes; richer tiles, brass corner caps, brighter deploy rims.",
      "Spiderwebs round four: silk fluff at strand crossings, wrapped prey bundles in the larder, mid-edge guy threads and a two-plane silk tent for real depth.",
      "Smarter web renderer: graceful silk-sharing — many webs now coexist without stealing each other's strands.",
    ],
  },
  {
    v: "0.5",
    title: "REAL SILK",
    items: [
      "FIXED — the Enraged passive never fired: its arming time (6/5/3s) was longer than entire battles. Now 5/4/2.5s with the first cycle pre-charged — it procs in every fight (proven by simulation).",
      "Every Enraged bite pops on the Spider; poisoned foes seep venom green; enemies stuck in the After Web sheen sticky violet.",
      "Realistic silk: webs redrawn as true orb webs — hub, radial spokes, sagging capture spiral, dew sitting ON the strands, broken outer strands instead of punched holes.",
      "After Web is now FLUNG: the net drops from above, settles with a spin, then blooms across its rect.",
      "Grand opener unchanged: whole-board web (50% slow, 500 dmg/s all battle).",
    ],
  },
  {
    v: "0.4",
    title: "THE SILK FLOOD",
    items: [
      "Webs SPREAD: every web blooms from its strike point and floods across its full rect — nest walls race up the drawer sides right after, then the egg sacs pop in.",
      "Containment law (advanced math): webs are spun sheets fitted with exact rotated-footprint math — silk physically cannot leave the drawer anymore, at any angle, on any edge.",
      "Nest walls now line the INSIDE of the frame (tops tip inward) — no silk crosses the board edge.",
      "New cloth details: radial spread streaks, curled drag hooks, softer rim, more dew.",
      "Bigger silk splats when a web detonates — extra strands and dew motes.",
      "HOW TO PLAY gains THE BATTLE DESK: one-tap deploy, swap mode, inspector and the HUD explained.",
      "Fixed a stale 'Widow' mention left in the tactics tab.",
    ],
  },
  {
    v: "0.3",
    title: "THE SPIDER ARRIVES",
    items: [
      "NEW BUG — Spider (5G): 550/950/1560 HP tiers, Enraged venom bite (2× damage + 3 poison ticks).",
      "3★ Ultimate — Sticky Webs: one giant tattered web pins the WHOLE board (50% slow, 500 dmg/s all battle).",
      "3★ After Web: full Energy spits a 3×3 snare web — 750 damage + 30% slow, dissolves after 5s.",
      "Nest visuals: corner-pinned cobweb cloth, egg sacs, nest walls, billowing silk.",
      "Dragonfly wings beat harder and wider — zero-noclip audit still ALL CLEAN.",
      "Placement rework: ONE tap on a bench bug deploys it instantly; tap-tile still moves; line-full arms swap mode.",
      "Battle HUD: round counter with alive pips, chunky timer, ROUND + FIGHT flare.",
      "Patch Notes section added (you are reading it).",
    ],
  },
  {
    v: "0.2",
    title: "THE CABINET GETS SHARP",
    items: [
      "Menu rework: turntable nav arrows, star-tier buttons, mobile-first hero.",
      "Dragonfly compound eyes v2 + wing detail (icon v9).",
      "In-game HUD polish: segmented 1×/2×/3× speed, specimen inspector, chunky shop buttons.",
      "Commander names localized (Ratu Rayap, Peramal Lentera…).",
      "Indonesian copy rewritten to sound natural — no more word-for-word translations.",
      "Zero-noclip roster audit: mantis neck/hips and worm leg fixes.",
    ],
  },
  {
    v: "0.1",
    title: "FIRST MOULT",
    items: [
      "5 sculpted voxel bugs (Stag, Bombardier, Mantis, Dragonfly, Worm) with full battle kits.",
      "3 commanders, 3 rival bot colonies, ladder survival match.",
      "Full auto-chess loop: shop, bench, 3× merge moults, gold interest, win/loss streaks.",
      "Round pre-roll, 1×/2×/3× battle speed, Potato mode, EN/ID language.",
      "RUN-DIRECTLY offline build (fonts embedded, boots with no server).",
    ],
  },
];

export function PatchNotesModal({ open, onClose }: Props) {
  const { t } = useSettings();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/78 backdrop-blur-[3px] sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col border-2 border-[#4A3828] bg-[#14100C] shadow-[0_16px_60px_rgba(0,0,0,.85)] sm:max-w-[560px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("PATCH NOTES")}
      >
        <div className="flex items-center justify-between border-b-2 border-[#3B322A] p-3 sm:p-4">
          <div>
            <div className="label text-[8px] text-[#F0A93B]">{t("UPDATE LOG")}</div>
            <h3 className="mt-0.5 font-pixel text-[12px] text-[#EDE2CB]">
              {t("PATCH NOTES")} <span className="text-[#56DCA8]">v{GAME_INFO.version}</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="label border border-[#3B322A] bg-[#100C09] px-1.5 py-1 text-[7.5px] text-[#56DCA8]">
              v{GAME_INFO.version} {t("LATEST")}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("CLOSE")}
              className="lift grid h-9 w-9 place-items-center border border-[#3B322A] bg-[#100C09] text-[#EDE2CB]"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {VERSIONS.map((ver, vi) => (
            <div key={ver.v} className="relative mb-3 last:mb-0">
              <div className="border border-[#3B322A] bg-[#18120E] p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-pixel text-[11px] ${vi === 0 ? "text-[#56DCA8]" : "text-[#9C8F7E]"}`}
                  >
                    v{ver.v}
                  </span>
                  {vi === 0 && (
                    <span className="label border border-[#2a6e52] bg-[#0E241A] px-1.5 py-0.5 text-[6.5px] text-[#56DCA8]">
                      {t("CURRENT")}
                    </span>
                  )}
                  <span className="label ml-auto text-[7px] text-[#F0A93B]">{t(ver.title)}</span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {ver.items.map((it) => (
                    <li key={it} className="flex gap-1.5 text-[11.5px] leading-snug text-[#B3A594]">
                      <span className="mt-[3px] shrink-0 font-pixel text-[7px] text-[#F0A93B]">▸</span>
                      <span>{t(it)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
