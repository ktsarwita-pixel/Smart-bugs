import { fill, useSettings } from "../i18n";
import {
  BONDS, BOND_TIERS, ROLE_ORDER, bondNeed, bondPercent, levelForCount,
  type BondCounts, type BondLevels, type Role,
} from "../game/bonds";

/** Tiny role glyphs: shield / mortar burst / blade. */
export function RoleGlyph({ role, size = 11 }: { role: Role; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 12 12", "aria-hidden": true, focusable: false } as const;
  if (role === "Frontline") {
    return (
      <svg {...common}>
        <path d="M6 1 10.5 2.6v3.2c0 2.6-1.9 4.4-4.5 5.2C3.4 10.2 1.5 8.4 1.5 5.8V2.6Z" fill="currentColor" opacity=".28" />
        <path d="M6 1 10.5 2.6v3.2c0 2.6-1.9 4.4-4.5 5.2C3.4 10.2 1.5 8.4 1.5 5.8V2.6Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    );
  }
  if (role === "Artillery") {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.1" fill="currentColor" />
        <path d="M6 .8v2M6 9.2v2M.8 6h2M9.2 6h2M2.4 2.4l1.3 1.3M8.3 8.3l1.3 1.3M9.6 2.4 8.3 3.7M3.7 8.3 2.4 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M10.6 1.4 4.6 6.2l1.2 1.2Z" fill="currentColor" />
      <path d="M10.6 1.4 9.8 5.9 5.8 7.4Z" fill="currentColor" opacity=".55" />
      <path d="M3.2 6.6 5.4 8.8M4.3 7.7 1.6 10.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const TIER_MARK = ["", "I", "II"] as const;

interface Props {
  /** Fielded bugs per role on your line. */
  counts: BondCounts;
  /** Bond tiers of the line you are about to fight (or are fighting). */
  rival?: BondLevels | null;
  onInfo?: () => void;
  className?: string;
}

/**
 * Colony Bonds strip. One chip per role with pips up to the top tier, the
 * live effect when a tier is active, and how many more bugs the next tier
 * needs when it is not. The rival's active bonds sit on the right.
 */
export function BondsBar({ counts, rival, onInfo, className = "" }: Props) {
  const { t } = useSettings();
  const tf = (en: string, vars: Record<string, string | number>) => fill(t(en), vars);
  const top = BOND_TIERS[1];
  const rivalActive = rival ? ROLE_ORDER.filter((r) => rival[r] > 0) : [];

  return (
    <div className={`bonds-bar ${className}`} role="group" aria-label={t("Colony Bonds")}>
      <span className="bonds-bar__cap label">{t("BONDS")}</span>
      <div className="bonds-bar__chips">
        {ROLE_ORDER.map((role) => {
          const def = BONDS[role];
          const count = counts[role];
          const level = levelForCount(count);
          const need = bondNeed(count);
          const effect = level > 0 ? tf(def.effect, { n: bondPercent(role, level) }) : "";
          const status = level > 0
            ? `${t(def.name)} ${TIER_MARK[level]} — ${effect}`
            : tf("{name}: {n} more {role} to activate", { name: t(def.name), n: need, role: t(role) });
          return (
            <button
              key={role}
              type="button"
              className="bond-chip"
              data-level={level}
              style={{ ["--bond" as string]: def.accent }}
              onClick={onInfo}
              title={`${status}. ${t(def.desc)}`}
              aria-label={`${status}. ${t(def.desc)}`}
            >
              <span className="bond-chip__glyph"><RoleGlyph role={role} /></span>
              <span className="bond-chip__name label">{t(def.name)}{level > 0 ? ` ${TIER_MARK[level]}` : ""}</span>
              <span className="bond-chip__pips" aria-hidden="true">
                {Array.from({ length: top }, (_, i) => (
                  <i key={i} data-on={i < count ? "1" : undefined} data-tier={i + 1 === BOND_TIERS[0] || i + 1 === top ? "1" : undefined} />
                ))}
              </span>
              <span className="bond-chip__fx">
                {level > 0
                  ? tf(def.short, { n: bondPercent(role, level) })
                  : `${Math.min(count, top)}/${count >= BOND_TIERS[0] ? top : BOND_TIERS[0]}`}
              </span>
            </button>
          );
        })}
      </div>
      {rival && (
        <div
          className="bonds-bar__rival"
          title={rivalActive.length
            ? rivalActive.map((r) => `${t(BONDS[r].name)} ${TIER_MARK[rival[r]]} — ${tf(BONDS[r].effect, { n: bondPercent(r, rival[r]) })}`).join(" · ")
            : t("The rival line has no active bond")}
        >
          <span className="label bonds-bar__rival-cap">{t("RIVAL")}</span>
          {rivalActive.length === 0 ? (
            <span className="bonds-bar__none">—</span>
          ) : (
            rivalActive.map((r) => (
              <span key={r} className="bond-mini" style={{ ["--bond" as string]: BONDS[r].accent }}>
                <RoleGlyph role={r} size={10} />
                <b>{TIER_MARK[rival[r]]}</b>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}
