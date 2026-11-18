import { fill, useSettings } from "../i18n";
import { cmdById } from "../game/data";
import { favouriteCommander, roundWinRate, useCareer, type RecordOutcome } from "../game/career";
import { IconTrophy } from "./CustomIcons";

interface Props {
  /** "strip": one quiet line for the main menu. "card": the full record. */
  variant: "strip" | "card";
  /** What the match that just ended changed, for the NEW RECORD tags. */
  note?: RecordOutcome | null;
}

/**
 * Lifetime record (v0.8). Reads the localStorage-backed career store, so it
 * updates the moment a match is written or the record is cleared.
 * Renders nothing until at least one match has been finished.
 */
export function CareerPanel({ variant, note = null }: Props) {
  const { t } = useSettings();
  const tf = (en: string, vars: Record<string, string | number>) => fill(t(en), vars);
  const career = useCareer();
  if (career.matches === 0) return null;

  const best = career.bestPlace ?? 0;

  if (variant === "strip") {
    return (
      <div
        className="career-strip mt-4 flex w-full max-w-full flex-wrap items-center gap-x-3 gap-y-1 border border-[#3B322A] bg-[#130E0A]/90 px-2.5 py-1.5 sm:w-auto"
        aria-label={t("CAREER RECORD")}
      >
        <span className="label flex items-center gap-1.5 text-[7px] text-[#F0A93B]">
          <IconTrophy size={11} /> {t("CAREER")}
        </span>
        <span className="font-mono text-[10.5px] text-[#B3A594]">
          <b className="text-[#EDE2CB]">{career.matches}</b> {t("MATCHES")}
        </span>
        <span className="font-mono text-[10.5px] text-[#B3A594]">
          <b className="text-[#56DCA8]">{career.wins}</b> {t("TITLES")}
        </span>
        <span className="font-mono text-[10.5px] text-[#B3A594]">
          {t("BEST FINISH")} <b className="text-[#EDE2CB]">#{best}</b>
        </span>
        {career.bestStreak > 1 && (
          <span className="font-mono text-[10.5px] text-[#B3A594]">
            {t("WIN STREAK")} <b className="text-[#56DCA8]">×{career.bestStreak}</b>
          </span>
        )}
      </div>
    );
  }

  const fav = favouriteCommander(career);
  const favTally = fav ? career.byCmd[fav] : null;
  const tags = [
    note?.firstChampionship ? t("FIRST CHAMPIONSHIP") : null,
    note?.newBestPlace ? t("NEW BEST FINISH") : null,
    note?.newBestStreak ? t("NEW STREAK RECORD") : null,
  ].filter((x): x is string => !!x);
  const cells: { label: string; value: string; tone: string }[] = [
    { label: t("MATCHES"), value: String(career.matches), tone: "#EDE2CB" },
    { label: t("TITLES"), value: String(career.wins), tone: "#56DCA8" },
    { label: t("PODIUMS"), value: String(career.podiums), tone: "#F0A93B" },
    { label: t("BEST FINISH"), value: `#${best}`, tone: "#EDE2CB" },
    { label: t("WIN STREAK"), value: `×${career.bestStreak}`, tone: "#56DCA8" },
    { label: t("ROUNDS WON"), value: `${roundWinRate(career)}%`, tone: "#F0A93B" },
  ];

  return (
    <section className="career-card mt-5 border border-[#3B322A] bg-[#100C09] p-3" aria-label={t("CAREER RECORD")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="label flex items-center gap-1.5 text-[8px] text-[#F0A93B]">
          <IconTrophy size={12} /> {t("CAREER RECORD")}
        </span>
        {tags.map((tag) => (
          <span key={tag} className="label rise border border-[#2a6e52] bg-[#0E241A] px-1.5 py-0.5 text-[6.5px] text-[#56DCA8]">
            {tag}
          </span>
        ))}
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-1.5">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 border border-[#2A2018] bg-[#16110D] px-2 py-1.5">
            <dd className="font-mono text-[15px] font-bold leading-none tabular-nums" style={{ color: c.tone }}>{c.value}</dd>
            <dt className="label mt-1 truncate text-[6px] text-[#8C7E6E]">{c.label}</dt>
          </div>
        ))}
      </dl>
      {fav && favTally && (
        <p className="mt-2 text-[11px] leading-snug text-[#9C8F7E]">
          {tf("Best commander: {name} — {m} matches, {w} titles", { name: t(cmdById(fav).name), m: favTally.matches, w: favTally.wins })}
        </p>
      )}
      <p className="latin mt-1 text-[11px] text-[#6E6252]">{t("Saved on this device only.")}</p>
    </section>
  );
}
