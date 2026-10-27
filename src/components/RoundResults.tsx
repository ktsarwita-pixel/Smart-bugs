import { colonyName, type RoundSummary } from "../game/match";
import { IconClash, IconSkull } from "./CustomIcons";
import { fill, useSettings } from "../i18n";

export function RoundResults({ summary, paper = false }: { summary: RoundSummary | null; paper?: boolean }) {
  const { t } = useSettings();
  if (!summary) return null;
  return (
    <section
      aria-label={fill(t("Round {n} results"), { n: summary.round + 1 })}
      className={`border-t pt-2.5 ${paper ? "border-[#241B14]/20" : "border-[#3B322A]"}`}
    >
      <h3 className={`label mb-2 flex items-center gap-1.5 text-[8px] ${paper ? "text-[#5C4A38]" : "text-[#B3A594]"}`}>
        <IconClash size={11} className={paper ? "text-[#8E2A16]" : "text-[#F0A93B]"} />
        <span>{t("Around the cabinet / Round")} {summary.round + 1}</span>
      </h3>
      <ul className="space-y-1.5">
        {summary.duels.map((duel) => (
          <li key={`${duel.aId}-${duel.bId}`} className="flex items-start justify-between gap-3 text-[10px] leading-snug">
            <span className={paper ? "text-[#241B14]" : "text-[#EDE2CB]"}>
              <strong className="font-semibold">{t(colonyName(duel.winnerId))}</strong>
              <span className={paper ? "text-[#5C4A38]" : "text-[#9C8F7E]"}>
                {" "}{t("beat")} {t(colonyName(duel.loserId))}{duel.echo ? ` ${t("(echo match)")}` : ""}
              </span>
            </span>
            <span className={`shrink-0 font-semibold tabular-nums ${paper ? "text-[#8E2A16]" : "text-[#F0A93B]"}`}>
              {duel.damage > 0 ? `-${duel.damage} HP` : t("NO HP LOSS")}
            </span>
          </li>
        ))}
      </ul>
      {summary.eliminatedIds.length > 0 && (
        <div className={`mt-2.5 flex items-center gap-1.5 text-[10px] leading-relaxed ${paper ? "text-[#8E2A16]" : "text-[#F29B88]"}`}>
          <IconSkull size={12} className="shrink-0" />
          <span>{t("Eliminated:")} {summary.eliminatedIds.map((id) => t(colonyName(id))).join(", ")}.</span>
        </div>
      )}
    </section>
  );
}
