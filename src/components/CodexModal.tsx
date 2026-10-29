import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SpecimenIcon, RankBadge } from "./SpecimenIcon";
import { BOTS, BUGS, BUG_ORDER, COMMANDERS, GAME_INFO, MAX_FIELD_SIZE } from "../game/data";
import { statsFor } from "../game/engine";
import { IconClose, IconStar, StarRating, IconHelp, IconVulnerable } from "./CustomIcons";
import { fill, useSettings } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CodexModal({ open, onClose }: Props) {
  const { t } = useSettings();
  const [tab, setTab] = useState<"bugs" | "cmds" | "rules">("bugs");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // Escape closes the guide. Without this the page keeps running but the
  // full-screen backdrop still intercepts every click — the menu reads as
  // "unresponsive" until the user finds the CLOSE button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The active underline slides between tabs instead of snapping.
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-[3px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="rise flex max-h-[88dvh] w-full max-w-[560px] flex-col border-2 border-[#4A3828] bg-[#16110D] shadow-[0_16px_48px_rgba(0,0,0,.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3B322A] bg-[#1F1711] px-4 py-3">
          <div className="flex items-center gap-2">
            <IconHelp size={16} className="text-[#F0A93B]" />
            <div>
              <div className="label text-[8px] text-[#F0A93B]">{t("ENTOMOLOGICAL ARCHIVE")}</div>
              <h3 className="mt-0.5 font-pixel text-[12px] text-[#EDE2CB]">{t("SPECIMEN FIELD GUIDE")}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lift flex items-center gap-1.5 border border-[#4A3828] bg-[#120D09] px-2.5 py-1.5 font-pixel text-[9px] text-[#EDE2CB] hover:border-[#F0A93B]"
          >
            <IconClose size={10} />
            <span>{t("CLOSE")}</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="relative grid grid-cols-3 border-b border-[#3B322A] bg-[#120D09]">
          {(
            [
              ["bugs", `${GAME_INFO.units} ${t("SPECIMENS")}`],
              ["cmds", `${GAME_INFO.commanders} ${t("COMMANDERS")}`],
              ["rules", t("TACTICS")],
            ] as const
          ).map(([id, title]) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`label py-2.5 text-[9px] transition-colors ${
                tab === id ? "bg-[#1F1711] text-[#F0A93B]" : "text-[#8C7E6E] hover:text-[#EDE2CB]"
              }`}
            >
              {title}
            </button>
          ))}
          <span
            className="tab-underline"
            style={{ transform: `translateX(${underline.left}px)`, width: underline.width }}
            aria-hidden="true"
          />
        </div>

        {/* Scrollable Content */}
        <div className="safe-b overflow-y-auto p-3.5 space-y-3">
          {tab === "bugs" &&
            BUG_ORDER.map((id) => {
              const b = BUGS[id];
              const s1 = statsFor(id, 1);
              const s2 = statsFor(id, 2);
              const s3 = statsFor(id, 3);
              return (
                <div
                  key={id}
                  className="paper-card relative border border-[#3B322A] p-3 shadow-[0_4px_0_rgba(0,0,0,.4)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 border border-[#241B14]/25 bg-[#16110D] p-1.5">
                      <SpecimenIcon id={id} size={58} badge="none" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <RankBadge id={id} size={15} />
                          <span className="truncate font-pixel text-[10px] text-[#241B14]">{t(b.name)}</span>
                        </span>
                        <span className="bg-[#241B14] px-1.5 py-0.5 font-pixel text-[8px] text-[#F0A93B]">
                          {b.cost}G · {t(b.role).toUpperCase()}
                        </span>
                      </div>
                      <div className="latin text-[13px] text-[#5C4A38]">{b.latin}</div>
                      <p className="mt-1.5 text-[11px] leading-snug text-[#241B14]">
                        <span className="label mr-1 bg-[#8E2A16] px-1 py-0.5 text-[7px] text-[#FFF3DC]">
                          {b.skillMinStar ? `${t(b.skill.name)} · ${t("ULTIMATE")} ${b.skillMinStar}★` : t(b.skill.name)}
                        </span>
                        {t(b.skill.desc)}
                        {b.skillMinStar ? ` ${t("Lower stars have no active skill.")}` : ""}
                      </p>
                      {b.passive && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-[#315B67]">
                          <IconVulnerable size={12} className="mt-0.5 shrink-0 text-[#207E9C]" />
                          <span>
                            <span className="label mr-1 text-[7px] text-[#207E9C]">{t("PASSIVE")} / {t(b.passive.name)}:</span>
                            {t(b.passive.desc)}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 1-Star / 2-Star / 3-Star Stat Table */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-[#241B14]/20 pt-2 text-center font-mono text-[10px]">
                    <div className="bg-[#241B14]/8 px-1.5 py-1">
                      <div className="flex items-center justify-center gap-1 text-[8px] font-bold text-[#7A5318]">
                        <IconStar size={9} />
                        <span>{t("INSTAR I")}</span>
                      </div>
                      <div className="font-semibold text-[#241B14]">
                        {s1.hp} HP · {s1.atk} ATK
                      </div>
                    </div>
                    <div className="bg-[#241B14]/12 px-1.5 py-1">
                      <div className="flex items-center justify-center gap-1 text-[8px] font-bold text-[#7A5318]">
                        <StarRating star={2} size={8} />
                        <span>{t("INSTAR II")}</span>
                      </div>
                      <div className="font-semibold text-[#241B14]">
                        {s2.hp} HP · {s2.atk} ATK
                      </div>
                    </div>
                    <div className="bg-[#241B14]/18 px-1.5 py-1">
                      <div className="flex items-center justify-center gap-1 text-[8px] font-bold text-[#7A5318]">
                        <StarRating star={3} size={8} />
                        <span>{t("ROYAL")}</span>
                      </div>
                      <div className="font-semibold text-[#241B14]">
                        {s3.hp} HP · {s3.atk} ATK
                      </div>
                    </div>
                  </div>
                  {b.skillMinStar && (
                    <div className="label mt-1.5 border border-[#207E9C]/40 bg-[#DFF8FF]/60 px-2 py-1 text-center text-[7px] text-[#17506F]">
                      {t("1-STAR NO SKILL · 2-STAR NO SKILL · 3-STAR")} {t(b.skill.name).toUpperCase()} {t("ULTIMATE")}
                    </div>
                  )}
                </div>
              );
            })}

          {tab === "cmds" &&
            COMMANDERS.map((c) => (
              <div
                key={c.id}
                className="paper-card flex items-start gap-3 border border-[#3B322A] p-3.5 shadow-[0_4px_0_rgba(0,0,0,.4)]"
              >
                <div className="shrink-0 border border-[#241B14]/25 bg-[#16110D] p-1.5">
                  <SpecimenIcon id={c.id} size={62} badge="none" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <RankBadge id={c.id} size={16} />
                    <span className="truncate font-pixel text-[11px] text-[#241B14]">{t(c.name)}</span>
                  </div>
                  <div className="latin text-[13px] text-[#5C4A38]">
                    {c.latin} — {t(c.title)}
                  </div>
                  <div className="label mt-2 inline-block bg-[#1F7A5A] px-1.5 py-0.5 text-[8px] text-[#FFF3DC]">
                    {t("PERK")} · {t(c.perk)}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-[#241B14]">{t(c.desc)}</p>
                </div>
              </div>
            ))}

          {tab === "rules" && (
            <div className="space-y-2.5 text-[12px] leading-relaxed text-[#D5C8B4]">
              {[
                {
                  n: "01",
                  t: "RECRUIT & MOULT (3× MERGE)",
                  d: "Spend Gold in Pipkin Supply to recruit bugs onto your Bench. Collecting 3 identical 1-star bugs automatically moults them into a stronger 2-star bug (and three 2-star into a crowned 3-star Royal!).",
                },
                {
                  n: "02",
                  t: "DEPLOY ON THE 3D DRAWER",
                  d: "Tap a bug, then tap any green 3D tile on your side—or hit the 1-tap DEPLOY button for smart row placement (Stag in front, Mantis and Widow on the flanks, Bombardier in rear).",
                },
                {
                  n: "03",
                  t: "ECONOMY & INTEREST",
                  d: fill(t("Each round grants +5 base Gold, +2 for a win, and +1 Interest per 10 Gold saved (up to +5G). Win or loss streaks add up to +4G. Upgrade LINE SIZE to field up to {max} bugs. Lock the shop to hold its remaining recruits for the next round."), { max: MAX_FIELD_SIZE }),
                },
                {
                  n: "04",
                  t: "LAST COLONY STANDING",
                  d: fill(t("{colonies} colonies enter: you and {bots}. {rule} Losing a battle costs colony HP; reaching zero means permanent elimination. A winner is declared only when all rivals are eliminated."), { colonies: GAME_INFO.colonies, bots: BOTS.map((b) => b.name).join(", "), rule: t(GAME_INFO.victoryRule) }),
                },
                {
                  n: "05",
                  t: "REAL BATTLES, FAIR ROUNDS",
                  d: "Opponents rotate and the bots fight each other too. Only losing colonies take damage, increasing with each round. With an odd number of survivors, one colony fights a rival echo: only that colony can lose HP. The final two fight directly. If you are eliminated, the remaining battles auto-play until one champion survives.",
                },
                {
                  n: "06",
                  t: "CHOOSE YOUR COMMANDER",
                  d: fill(t("{cmds}. The Worm digs once at the start of each battle, not on a repeating cooldown. Each commander and its current passive are listed in the Commanders tab."), { cmds: COMMANDERS.map((c) => `${t(c.name)}: ${t(c.perk)}`).join(". ") }),
                },
                {
                  n: "07",
                  t: "WEBS & VENOM",
                  d: "The Black Widow (5G) webs the WHOLE board at battle start: enemies are slowed 50% and take 500 damage per second for the entire fight. At full Energy it spits a big 3×3 web onto the densest enemy pack — stepping on it deals 750 damage and slows 30%, and that web dissolves after 5 seconds. Its Enraged bite hits for 2× damage and adds 3 poison ticks 1s apart.",
                },
              ].map((item) => (
                <div key={item.n} className="border border-[#3B322A] bg-[#1C1611] p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] text-[#F0A93B]">{item.n}</span>
                    <span className="label text-[9px] text-[#56DCA8]">{t(item.t)}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-[#B3A594]">{t(item.d)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
