import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BUGS, type BugId } from "../game/data";
import { SCAVANGER_INK as brass, SCAVANGER_STAMP, WORM_INK as chitin, WORM_MAW, WORM_MAW_COLS, WORM_MAW_ROWS } from "../game/commander-motifs";
import { fill, useSettings } from "../i18n";
import { IconCoin } from "./CustomIcons";
import { SpecimenIcon } from "./SpecimenIcon";

type ScreenPoint = { x: number; y: number };
export type IncomeCast = { kind: "incomes"; serial: number; at: ScreenPoint; bank: ScreenPoint | null; gold: number };
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
export function screenPoint(el: Element | null, local?: [number, number]): ScreenPoint | null {
  if (!el || el.getClientRects().length === 0) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  const cx = x + (local?.[0] ?? width / 2), cy = y + (local?.[1] ?? height / 2);
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return null;
  return { x: cx, y: cy };
}

function ScavangerStamp({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
    {SCAVANGER_STAMP.map(({ x, y, ink }) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={brass[ink]} />)}
  </g>;
}

function AssayCoin() {
  return <svg viewBox="0 0 24 24" shapeRendering="crispEdges">
    <path d="M7 1h10v2h4v4h2v10h-2v4h-4v2H7v-2H3v-4H1V7h2V3h4Z" fill="#2c1c15" />
    <path d="M7 3h10v2h4v12h-2v3h-3v1H7v-2H4v-3H3V7h2V5h2Z" fill={brass.g} />
    <path d="M5 7h2V5h9v2h3v10h-3v2H7v-2H5Z" fill={brass.d} />
    <path d="M7 7h10v2h2v6h-2v2H7v-2H5V9h2Z" fill={brass.j} />
    <ScavangerStamp x={8} y={8} />
    <path d="M7 3h8v1H7zM3 7h1v6H3zM17 18h3v1h-3z" fill="#fff0bf" />
    <path d="M6 19h11v2H7v-1H6z" fill={brass.b} />
  </svg>;
}

/** A bounded spray of palette chips, attached to a specific point or socket. */
function Flecks({ className, scatter }: { className: string; scatter: readonly (readonly [number, number])[] }) {
  return <span className={`commander-flecks ${className}`}>
    {scatter.map(([x, y], i) => <i key={i} style={{ "--dx": `${x}px`, "--dy": `${y}px`, "--lag": `${i % 3 * 28}ms` } as CSSProperties} />)}
  </span>;
}
const MINT_CHIPS = [[-26, -19], [-32, 7], [-16, 26], [20, -25], [32, -4], [23, 20]] as const;
const WORM_CHIPS = [[-16, -10], [14, -14], [-18, 7], [17, 10], [-3, 13]] as const;
const VAULT_CHIPS = [[-29, -17], [28, -23], [31, 9], [-19, 18], [1, -22]] as const;

/** Incomes: catch the specimen in a brass die, mint its imprint, and credit the real counter. */
export function IncomeAssay({ cast }: { cast: IncomeCast }) {
  const { at, bank } = cast;
  const end = bank ?? at;
  const dx = end.x - at.x, dy = end.y - at.y;
  const width = window.innerWidth;
  // Keep the swing inside the viewport even when a cast starts at an edge.
  const bend = Math.min(88, Math.hypot(dx, dy) * .23) * (at.x + end.x < width ? 1 : -1);
  const routeX = (x: number) => Math.max(8, Math.min(width - 8, x));
  const route = `M ${at.x} ${at.y} C ${routeX(at.x + dx * .12 + bend)} ${at.y + dy * .19}, ${routeX(end.x - dx * .10 + bend)} ${end.y - dy * .23}, ${end.x} ${end.y}`;
  return createPortal(
    <div className="commander-cast" data-skill-fx="incomes" data-local-credit={!bank || undefined} aria-hidden="true">
      {bank && <svg className="income-route" width="100%" height="100%" fill="none">
        <path className="income-route__base" d={route} pathLength="100" stroke="#48311d" strokeWidth="5" />
        <path className="income-route__line" d={route} pathLength="100" stroke={brass.g} strokeWidth="2" />
        <path className="income-route__chase" d={route} pathLength="100" stroke={brass.c} strokeWidth="2.8" />
      </svg>}
      <div className="income-assay" style={{ left: at.x, top: at.y }}>
        <svg viewBox="0 0 64 64" fill="none">
          <path className="income-assay__dial" d="M20 5h24l15 15v24L44 59H20L5 44V20Z" stroke={brass.j} strokeWidth="3" />
          {[0, 1].map(half => <g key={half} transform={half ? "rotate(180 32 32)" : undefined}>
            <g className="income-assay__caliper">
              <path d="M23 7H16L7 16v12h5v-9l8-7h3ZM7 36v12l9 9h7v-5h-4l-7-7v-9Z" fill={brass.d} stroke={brass.g} />
              <path d="M15 16h3v3h-3zM9 30h6v4H9zM15 45h3v3h-3z" fill={brass.c} />
              <path d="M8 24v-8l8-8h6M7 44v4l9 9h6" stroke={brass.i} />
            </g>
          </g>)}
          <g className="income-assay__sweep">
            <path d="M10 19h44v9H10Z" fill={brass.c} opacity=".18" />
            <path d="M10 27h44m-29 4h14" stroke={brass.c} strokeWidth="1.6" />
            <path d="M9 24h5v5H9zM50 24h5v5h-5z" fill={brass.g} />
          </g>
        </svg>
        <i className="income-assay__stamp" />
        <Flecks className="income-mint-chips" scatter={MINT_CHIPS} />
      </div>
      <span className="income-carrier" style={bank ? { offsetPath: `path("${route}")` } : { left: at.x, top: at.y }}><AssayCoin /></span>
      <div className="income-bank" style={{ left: end.x, top: end.y }}>
        <i className="income-bank__strike" />
        <Flecks className="income-bank-chips" scatter={MINT_CHIPS} />
      </div>
      <b className="income-credit" data-below={end.y < 55 || undefined}
        style={{ left: Math.max(35, Math.min(width - 35, end.x)), top: end.y }}><IconCoin size={11} />+{cast.gold}G</b>
    </div>, document.body,
  );
}

/** The original maw folds over the consumed silhouette inside its own slot. */
export function WormBenchCue({ eaten }: { eaten: BugId }) {
  return (
    <span className="worm-etch" data-skill-fx="eat-spit" aria-hidden="true">
      <i className="worm-etch__rift" />
      <SpecimenIcon id={eaten} size={28} bare className="worm-etch__shed" />
      <svg className="worm-etch__mouth" viewBox={`-1 -2 ${WORM_MAW_COLS + 2} ${WORM_MAW_ROWS + 4}`} shapeRendering="crispEdges">
        <path className="worm-etch__cut" d="M2 1h7v1h2v3H9v1H2V5H0V2h2Z" fill={chitin.b} />
        {[0, 1].map((half) => <g className="worm-etch__lip" key={half} style={{ "--part": half ? "2.3px" : "-2.3px" } as CSSProperties}>
          {WORM_MAW.filter(p => p.ink !== "b" && Number(p.y >= WORM_MAW_ROWS / 2) === half).map(({ x, y, ink }) =>
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={chitin[ink]} />)}
        </g>)}
      </svg>
      <Flecks className="worm-bite-chips" scatter={WORM_CHIPS} />
    </span>
  );
}

export function WormBenchArrival({ id, star, selected, delay }: { id: BugId; star: number; selected: boolean; delay: number }) {
  return <span className="worm-arrival" data-skill-arrival="true" style={{ "--arrival-delay": `${delay}ms` } as CSSProperties}>
    <i className="worm-arrival__seam" aria-hidden="true" />
    <SpecimenIcon id={id} size={33} star={star} selected={selected} badge="none" />
    <span className="worm-arrival__chips" aria-hidden="true"><Flecks className="worm-spit-chips" scatter={WORM_CHIPS} /></span>
  </span>;
}

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
