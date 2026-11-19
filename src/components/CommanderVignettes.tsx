import type { CSSProperties } from "react";
import { BUGS, type BugId } from "../game/data";
import { SCAVANGER_INK as brass, SCAVANGER_STAMP } from "../game/commander-motifs";
import { fill, useSettings } from "../i18n";
import { SpecimenIcon } from "./SpecimenIcon";

function ScavangerStamp({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
    {SCAVANGER_STAMP.map(({ x, y, ink }) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={brass[ink]} />)}
  </g>;
}

/** A bounded spray of palette chips, attached to a specific point or socket. */
function Flecks({ className, scatter }: { className: string; scatter: readonly (readonly [number, number])[] }) {
  return <span className={`commander-flecks ${className}`}>
    {scatter.map(([x, y], i) => <i key={i} style={{ "--dx": `${x}px`, "--dy": `${y}px`, "--lag": `${i % 3 * 28}ms` } as CSSProperties} />)}
  </span>;
}
const VAULT_CHIPS = [[-29, -17], [28, -23], [31, 9], [-19, 18], [1, -22]] as const;

/** A carapace reliquary: sliding plates, a counterweighted lock, and a jade reserve within. */
function PressureVault() {
  return <svg className="pressure-vault" viewBox="0 0 78 53" aria-hidden="true">
    <path d="M2 16 12 5h54l10 11v26L66 51H12L2 42Z" fill="#271c14" />
    <path d="M4 15 14 3h50l10 12v25l-10 9H14L4 40Z" fill={brass.d} stroke="#32251a" strokeWidth="2" />
    <path d="M6 16 15 5h48l9 11v22l-9 9H15l-9-9Z" fill={brass.b} stroke={brass.g} />
    <path d="M13 17 20 8h38l7 9v19l-7 8H20l-7-8Z" fill="#162d28" stroke="#523325" strokeWidth="2" />
    <path d="M16 18 22 11h34l6 7v17l-6 6H22l-6-6Z" fill="#244438" stroke={brass.j} />
    <g className="pressure-inlay">
      <path d="m39 13 16 8v11l-16 8-16-8V21Z" fill="#16352d" stroke={brass.c} />
      <path d="m39 16 12 7v7l-12 7-12-7v-7Z" fill={brass.j} stroke="#6ac59c" />
      <g transform="translate(-19.5 -13.5) scale(1.5)"><ScavangerStamp x={35} y={23} /></g>
      <path d="M24 25h4v2h-4zM50 25h4v2h-4z" fill={brass.i} />
    </g>
    {[0, 1].map(half => <g key={half} transform={half ? "translate(78 0) scale(-1 1)" : undefined}>
      <g className="pressure-shutter">
        <path d="M15 18 22 11h17v30H22l-7-6Z" fill={brass.d} stroke="#281f19" strokeWidth="1.3" />
        <path d="M17 18 23 13h15v25H23l-6-5Z" fill={brass.b} />
        <path d="M19 19 24 15h14v3H23l-4 4Zm0 12 4 3h15v3H24l-5-4Z" fill={brass.g} />
        <path d="M23 21h15v10H23Z" fill="#53382a" />
        <path d="M25 22h3v8h-3zM31 22h2v8h-2z" fill="#af7650" />
        <path d="M19 26h3v2h-3zM35 14h3v2h-3zM35 35h3v2h-3z" fill={brass.i} />
      </g>
    </g>)}
    {/* Fixed guides cover the outer edges of the two travelling plates. */}
    <path d="M7 17 16 6h9v3h-7l-7 9v18l7 8h7v3h-9l-9-10ZM71 17 62 6h-9v3h7l7 9v18l-7 8h-7v3h9l9-10Z" fill={brass.b} stroke={brass.g} strokeWidth=".8" />
    <path d="M13 41h16v3H16zm52 0H49v3h13zM25 6h28v2H25z" fill={brass.i} />
    <g className="pressure-key">
      <path d="m39 16 9 5v10l-9 6-9-6V21Z" fill="#3a2820" stroke={brass.g} strokeWidth="1.3" />
      <path d="m39 19 6 4v7l-6 4-6-4v-7Z" fill={brass.j} stroke={brass.i} />
      <path d="M37 22h4v3h2v3h-2v3h-4v-3h-2v-3h2Z" fill={brass.c} />
      <path d="M38 25h2v3h-2Z" fill={brass.d} />
    </g>
    <path d="M9 20h2v2H9zm0 12h2v2H9zm58-12h2v2h-2zm0 12h2v2h-2zM33 44h12v2H33z" fill={brass.i} />
    <path className="pressure-latch-light" d="M34 44h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2z" fill={brass.c} />
  </svg>;
}

export function PressurePresent({ award }: { award?: { gold: number; bugId: BugId | null } }) {
  const { t } = useSettings();
  return (
    <div className="pressure-result" data-skill-fx="pressure-present" data-gift={award ? "open" : "sealed"} role="status">
      <div className="pressure-stage" aria-hidden="true">
        <i className="pressure-stage__seal" />
        <PressureVault />
        <Flecks className="pressure-chips" scatter={VAULT_CHIPS} />
      </div>
      <div className="pressure-result__copy">
        <strong>{t("Pressure present")}</strong>
        {award ? <div className="pressure-payout"><b>+{award.gold}G</b>{award.bugId && ` · ${fill(t("2 × {name} (1★)"), { name: t(BUGS[award.bugId].name) })}`}</div>
          : <div>{t("Pressure present arrives after the next round.")}</div>}
      </div>
      {award?.bugId && <div className="pressure-specimens" aria-hidden="true">
        <span><SpecimenIcon id={award.bugId} size={22} badge="none" /></span>
        <span><SpecimenIcon id={award.bugId} size={22} badge="none" /></span>
      </div>}
    </div>
  );
}
