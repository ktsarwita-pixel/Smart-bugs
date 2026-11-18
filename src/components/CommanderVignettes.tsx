import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BUGS, type BugId } from "../game/data";
import { SCAVANGER_INK as brass, WORM_INK as chitin, WORM_MAW, WORM_MAW_COLS, WORM_MAW_ROWS } from "../game/commander-motifs";
import { fill, useSettings } from "../i18n";
import { IconCoin } from "./CustomIcons";
import { SpecimenIcon } from "./SpecimenIcon";

type ScreenPoint = { x: number; y: number };
export type IncomeCast = { kind: "incomes"; serial: number; at: ScreenPoint; bank: ScreenPoint; gold: number };
export type WormCast = {
  kind: "eat-spit";
  serial: number;
  slot: number;
  eaten: BugId;
  /** Real bench arrivals (including bench moults), not floating reward copies. */
  arrivals: Map<number, { star: number; delay: number }>;
};
export type PrepCast = IncomeCast | WormCast;

/** Take the rendered target position before a recruit moves or moults. */
export function screenPoint(el: Element | null): ScreenPoint | null {
  if (!el || el.getClientRects().length === 0) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  const cx = x + width / 2, cy = y + height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return null;
  return { x: cx, y: cy };
}

/** Incomes reads as an appraisal followed by one deliberate transfer. */
export function IncomeAssay({ cast }: { cast: IncomeCast }) {
  const { at, bank } = cast;
  const dx = bank.x - at.x, dy = bank.y - at.y;
  // Bend to the inside of the viewport instead of fanning several coins
  // across unrelated controls. Both ends are exactly on the live UI.
  const bend = Math.min(62, Math.hypot(dx, dy) * .18) * (at.x <= bank.x ? 1 : -1);
  const route = `M ${at.x} ${at.y} C ${at.x + bend} ${at.y + dy * .27}, ${bank.x + bend} ${bank.y - dy * .22}, ${bank.x} ${bank.y}`;
  return createPortal(
    <div className="commander-cast" data-skill-fx="incomes" aria-hidden="true">
      <svg className="income-route" width="100%" height="100%" fill="none">
        <path className="income-route__line" d={route} pathLength="100" stroke={brass.g} strokeWidth="1" />
      </svg>
      <div className="income-assay" style={{ left: at.x, top: at.y }}>
        <svg viewBox="0 0 44 44" fill="none">
          <g className="income-assay__caliper" style={{ "--separate": "-5px" } as CSSProperties}>
            <path d="M16 5H10L5 10v8m0 8v8l5 5h6" stroke={brass.b} strokeWidth="2.5" />
            <path d="M16 5H10L5 10v8m0 8v8l5 5h6" stroke={brass.i} strokeWidth=".8" />
            <path d="M4 21h5v2H4z" fill={brass.g} />
          </g>
          <g className="income-assay__caliper" style={{ "--separate": "5px" } as CSSProperties}>
            <path d="M28 5h6l5 5v8m0 8v8l-5 5h-6" stroke={brass.b} strokeWidth="2.5" />
            <path d="M28 5h6l5 5v8m0 8v8l-5 5h-6" stroke={brass.i} strokeWidth=".8" />
            <path d="M35 21h5v2h-5z" fill={brass.g} />
          </g>
          <path className="income-assay__sweep" d="M7 13h30m-19 3h8" stroke={brass.c} strokeWidth="1" />
        </svg>
      </div>
      <span className="income-carrier" style={{ offsetPath: `path("${route}")` }}><IconCoin size={14} /></span>
      <div className="income-bank" style={{ left: bank.x, top: bank.y }}>
        <i className="income-bank__strike" />
        <b className="income-credit">+{cast.gold}G</b>
      </div>
    </div>, document.body,
  );
}

/** A low, pixel-cut split in the actual consumed slot. No popup jaws or duplicate recruits. */
export function WormBenchCue({ eaten }: { eaten: BugId }) {
  return (
    <span className="worm-etch" data-skill-fx="eat-spit" aria-hidden="true">
      <svg className="worm-etch__mouth" viewBox={`-1 -2 ${WORM_MAW_COLS + 2} ${WORM_MAW_ROWS + 4}`} shapeRendering="crispEdges">
        <path className="worm-etch__cut" d="M1 2h9v2H1z" fill={chitin.b} />
        {[0, 1].map((half) => <g className="worm-etch__lip" key={half} style={{ "--part": half ? "2px" : "-2px" } as CSSProperties}>
          {WORM_MAW.filter(p => p.ink !== "b" && Number(p.y >= WORM_MAW_ROWS / 2) === half).map(({ x, y, ink }) =>
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={chitin[ink]} />)}
        </g>)}
      </svg>
      <SpecimenIcon id={eaten} size={21} bare className="worm-etch__shed" />
    </span>
  );
}

/** Stamped brass and jade shutters, built like the Scavanger's carapace. */
function PressureVault() {
  return (
    <svg className="pressure-vault" viewBox="0 0 58 40" aria-hidden="true">
      <path d="M2 12 10 3h38l8 9v20l-7 6H9l-7-6Z" fill="#30241b" stroke={brass.d} strokeWidth="2" />
      <path d="M4 12 11 5h36l7 7v19l-6 5H10l-6-5Z" fill={brass.b} stroke={brass.g} />
      <path d="M10 14 15 8h28l5 6v15l-4 4H14l-4-4Z" fill="#261e18" stroke="#69412c" />
      <path className="pressure-inlay" d="M19 12h20l4 5v9l-5 4H20l-5-4v-9Z" fill={brass.j} stroke={brass.c} strokeWidth=".9" />
      <path d="M22 22h5l2-5 2 5h5l-7 5Z" fill={brass.g} />
      <g className="pressure-shutter" style={{ "--slide": "-9px" } as CSSProperties}>
        <path d="M14 12h15v18H14l-3-3V15Z" fill={brass.b} stroke={brass.d} />
        <path d="M14 14h13v4H12v-2Zm0 10h13v2H13z" fill={brass.g} opacity=".63" />
        <path d="M14 20h13m-9 9V19" fill="none" stroke="#795331" />
      </g>
      <g className="pressure-shutter" style={{ "--slide": "9px" } as CSSProperties}>
        <path d="M29 12h15l3 3v12l-3 3H29Z" fill={brass.b} stroke={brass.d} />
        <path d="M31 14h13l2 2v2H31Zm0 10h13v2H31z" fill={brass.g} opacity=".63" />
        <path d="M31 20h13m-4 9V19" fill="none" stroke="#795331" />
      </g>
      <g className="pressure-key">
        <path d="m29 14 6 4v6l-6 4-6-4v-6Z" fill={brass.d} stroke={brass.g} />
        <path d="M26 18h1.5v2h3v-2H32v5h-6Z" fill={brass.j} stroke={brass.c} strokeWidth=".75" />
        <path d="M28 22h2v2h-2Z" fill={brass.g} />
      </g>
      <path d="M10 5h38l5 6m-1 19-5 4H12" fill="none" stroke={brass.i} opacity=".48" />
      {[8, 50].map(x => <path key={x} d={`M${x} 14h2v2h-2z m0 13h2v2h-2z`} fill={brass.i} opacity=".78" />)}
    </svg>
  );
}

export function PressurePresent({ award }: { award?: { gold: number; bugId: BugId | null } }) {
  const { t } = useSettings();
  return (
    <div className="pressure-result" data-skill-fx="pressure-present" data-gift={award ? "open" : "sealed"} role="status">
      <PressureVault />
      <div className="pressure-result__copy">
        <strong>{t("Pressure present")}</strong>
        {award ? <div className="pressure-payout">+{award.gold}G{award.bugId && ` · ${fill(t("2 × {name} (1★)"), { name: t(BUGS[award.bugId].name) })}`}</div>
          : <div>{t("Pressure present arrives after the next round.")}</div>}
      </div>
      {award?.bugId && <div className="pressure-specimens" aria-hidden="true">
        <span><SpecimenIcon id={award.bugId} size={20} badge="none" /></span>
        <span><SpecimenIcon id={award.bugId} size={20} badge="none" /></span>
      </div>}
    </div>
  );
}
