import { useMemo, useState } from "react";
import { BUGS, BOTS, COMMANDERS, GAME_INFO, STARTING_COLONY_HP, MAX_FIELD_SIZE, BENCH_SIZE, BOARD_SLOTS, type BugId, type CmdId } from "../game/data";
import { battleStats } from "../game/engine";
import { useSettings } from "../i18n";
import { SpecimenIcon } from "./SpecimenIcon";
import { IconClose } from "./CustomIcons";

/* ── /advanced — PRIVATE test-range page ────────────────────────
   Ships compiled into the bundle but is ROUTE-LOCKED: App() renders it
   only while DEV_BUILD is true (flip that one constant to false to
   lock the route for the public release — the page then 404s to the
   title screen). Purpose: inspect every unit's exact per-star stats
   and every bot's power curve on a real phone before a release, plus
   quick links into the admin test tools. */

/** Flip to false when the game ships COMPLETELY — /advanced then locks. */
export const DEV_BUILD = true;

const ALL_IDS: BugId[] = ["stag", "bomb", "mantis", "dragonfly", "spider"];

export function AdvancedView({ onExit }: { onExit: () => void }) {
  const { t } = useSettings();
  const [cmd, setCmd] = useState<CmdId>("matriarch");
  const [tab, setTab] = useState<"units" | "bots" | "sys">("units");

  const rows = useMemo(
    () =>
      ALL_IDS.map((id) => ({
        id,
        def: BUGS[id],
        s: ([1, 2, 3] as const).map((star) => battleStats(id, star, cmd)),
      })),
    [cmd],
  );

  return (
    <div className="cabinet-bg safe-t safe-b min-h-[100dvh] w-full overflow-x-hidden text-[#EDE2CB]">
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col px-3.5 py-4">
        <header className="flex items-center justify-between border-b border-[#3B322A] pb-2.5">
          <div>
            <div className="label text-[8px] text-[#75D9E8]">TEST RANGE · {t("PRIVATE")}</div>
            <h1 className="mt-1 font-pixel text-[14px] text-[#EDE2CB]">ADVANCED</h1>
          </div>
          <button
            onClick={onExit}
            aria-label={t("CLOSE")}
            className="lift grid h-11 w-11 place-items-center border border-[#4A3828] bg-[#18120E] text-[#EDE2CB]"
          >
            <IconClose size={13} />
          </button>
        </header>

        <p className="mt-2 text-[11px] leading-snug text-[#9C8F7E]">
          {t("Internal test page — balance tables, bot curve, build info. Not part of the public game.")}
        </p>

        <div className="mt-3 flex gap-1.5" role="tablist" aria-label={t("Test sections")}>
          {(["units", "bots", "sys"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`lift min-h-[40px] flex-1 border-2 px-2 label text-[8px] ${
                tab === k ? "border-[#75D9E8] bg-[#0B2A31] text-[#BDF8FF]" : "border-[#3B322A] bg-[#16110D] text-[#9C8F7E]"
              }`}
            >
              {k === "units" ? t("UNITS") : k === "bots" ? t("BOTS") : t("SYSTEM")}
            </button>
          ))}
        </div>

        {tab === "units" && (
          <section className="mt-3 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="label text-[7.5px] text-[#8C7E6E]">{t("Commander perk")}:</span>
              {COMMANDERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCmd(c.id)}
                  aria-pressed={cmd === c.id}
                  className={`lift min-h-[34px] border px-2 label text-[7.5px] ${
                    cmd === c.id ? "border-[#F0A93B] bg-[#241B14] text-[#F0A93B]" : "border-[#3B322A] bg-[#16110D] text-[#9C8F7E]"
                  }`}
                >
                  {t(c.short)}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-[10px] tabular-nums">
                <thead>
                  <tr className="label text-[6.5px] text-[#8C7E6E]">
                    <th className="border border-[#2D231B] bg-[#14100C] px-1 py-1 text-left">{t("BUG")}</th>
                    <th className="border border-[#2D231B] bg-[#14100C] px-1 py-1">{t("COST")}</th>
                    {[1, 2, 3].map((s) => (
                      <th key={s} className="border border-[#2D231B] bg-[#14100C] px-1 py-1">{s}★</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ id, def, s }) => (
                    <tr key={id}>
                      <td className="border border-[#2D231B] px-1 py-1">
                        <span className="flex items-center gap-1.5">
                          <SpecimenIcon id={id} size={22} badge="none" />
                          <span className="label text-[7px] text-[#EDE2CB]">{t(def.short)}</span>
                        </span>
                      </td>
                      <td className="border border-[#2D231B] px-1 text-center text-[#F0A93B]">{def.cost}</td>
                      {s.map((st, i) => (
                        <td key={i} className="border border-[#2D231B] px-1 text-center">
                          <span className="text-[#56DCA8]">{st.hp}</span>
                          <span className="text-[#6B5F52]"> / </span>
                          <span className="text-[#F05A36]">{st.atk}</span>
                          <span className="text-[#6B5F52]"> / </span>
                          <span className="text-[#BDF8FF]">{st.def}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[9.5px] leading-snug text-[#6B5F52]">
              {t("HP green · ATK red · DEF blue. Stats include the chosen commander perk.")}
            </p>
          </section>
        )}

        {tab === "bots" && (
          <section className="mt-3 flex-1 space-y-1.5">
            {BOTS.map((b, i) => (
              <div key={b.id} className="flex items-center gap-2.5 border border-[#2D231B] bg-[#14100C] p-2">
                <span className="ladder-rank">{i + 1}</span>
                <SpecimenIcon id={b.cmd} size={26} badge="none" />
                <div className="min-w-0 flex-1">
                  <div className="label text-[8px] text-[#EDE2CB]">{t(b.name)}</div>
                  <div className="latin text-[11px] text-[#5C4A38]">{b.latin}</div>
                </div>
                <span className="font-mono text-[10px] text-[#F0A93B]">×{b.power.toFixed(2)}</span>
                <span className="flex min-w-0 gap-0.5">
                  {b.lean.map((l, k) => (
                    <SpecimenIcon key={k} id={l} size={18} badge="none" />
                  ))}
                </span>
              </div>
            ))}
            <p className="pt-1 text-[9.5px] leading-snug text-[#6B5F52]">
              {t("Foe power multiplies the round curve; lean weights the shop it buys from.")}
            </p>
          </section>
        )}

        {tab === "sys" && (
          <section className="mt-3 flex-1 space-y-2 font-mono text-[10.5px] text-[#B3A594]">
            <div className="border border-[#2D231B] bg-[#14100C] p-3 leading-relaxed">
              <div>{t("version")}: <b className="text-[#F0A93B]">{GAME_INFO.version}</b></div>
              <div>{t("built")}: <b className="text-[#F0A93B]">{__BUILD_TIME__}</b></div>
              <div className="mt-1.5">
                {t("board")}: {BOARD_SLOTS} ({MAX_FIELD_SIZE} {t("max line")}) · {t("bench")}: {BENCH_SIZE} · {t("start HP")}: {STARTING_COLONY_HP}
              </div>
              <div>
                {t("colonies")}: {GAME_INFO.colonies} ({GAME_INFO.rivals} {t("bots").toLowerCase()} + {t("you").toLowerCase()})
              </div>
              <div>{t("units sculpted")}: {GAME_INFO.units}</div>
            </div>
            <p className="text-[9.5px] leading-snug text-[#6B5F52]">
              {t("Release lock: DEV_BUILD in src/components/AdvancedView.tsx — flip to false and the route disappears for everyone.")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
