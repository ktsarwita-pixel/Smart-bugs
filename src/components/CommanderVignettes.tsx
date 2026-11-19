import { useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { artFor, BENCH_SIZE, BUGS, type BugId } from "../game/data";
import { SCAVANGER_INK as brass, SCAVANGER_STAMP, WORM_INK as chitin, WORM_MAW, WORM_MAW_ROWS, WORM_FLIGHT_MS } from "../game/commander-motifs";
import { fill, useSettings } from "../i18n";
import { IconCoin } from "./CustomIcons";
import type { PrepUnit } from "../game/engine";
import { PixelArt } from "./PixelArt";
import { SpecimenIcon } from "./SpecimenIcon";

type ScreenPoint = { x: number; y: number };
export type IncomeCast = {
  kind: "incomes"; serial: number; targetUid: number; bugId: BugId; at: ScreenPoint; bank: ScreenPoint | null; gold: number;
};
export type WormArrival = { star: number; slot: number; delay: number };
export type WormCast = {
  kind: "eat-spit";
  serial: number;
  slot: number;
  eaten: BugId;
  /** Real bench arrivals (including bench moults), not floating reward copies. */
  arrivals: Map<number, WormArrival>;
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

function AssayCoin({ stamped }: { stamped: boolean }) {
  return <svg viewBox="0 0 24 24" shapeRendering="crispEdges">
    <path d="M7 1h10v2h4v4h2v10h-2v4h-4v2H7v-2H3v-4H1V7h2V3h4Z" fill="#2c1c15" />
    <path d="M7 3h10v2h4v12h-2v3h-3v1H7v-2H4v-3H3V7h2V5h2Z" fill={brass.g} />
    <path d="M5 7h2V5h9v2h3v10h-3v2H7v-2H5Z" fill={brass.d} />
    <path d="M7 7h10v2h2v6h-2v2H7v-2H5V9h2Z" fill="#d38a2a" />
    {stamped ? <ScavangerStamp x={8} y={8} /> : <path d="M10 8h4v2h2v4h-2v2h-4v-2H8v-4h2Zm1 3v2h2v-2Z" fill="#fff0b8" fillRule="evenodd" />}
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
const MINT_CHIPS = [[-24, -14], [-34, 1], [-15, 16], [19, -17], [33, 1], [20, 15]] as const;
const WORM_CHIPS = [[-21, -11], [-15, -17], [14, -15], [22, -8], [-20, 11], [21, 11], [1, 16]] as const;
const VAULT_CHIPS = [[-29, -17], [28, -23], [31, 9], [-19, 18], [1, -22]] as const;

const BULLION = ["#8b4416", "#aa5515", "#c06a18", "#d88724", "#e99f31", "#f5b740", "#ffd568", "#ffe68d", "#fff2b9"];

function gildSpecimen(pal: Record<string, string>) {
  const luminance = (hex: string) => {
    const rgb = Number.parseInt(hex.slice(1), 16);
    return 0.21 * (rgb >> 16) + 0.72 * (rgb >> 8 & 255) + 0.07 * (rgb & 255);
  };
  // Keep the ink's light/dark ordering, including dark bodies such as Spider.
  const inks = Object.entries(pal).sort((a, b) => luminance(a[1]) - luminance(b[1]));
  return Object.fromEntries(inks.map(([ink], i) => [ink, BULLION[Math.round(i * (BULLION.length - 1) / Math.max(1, inks.length - 1))]]));
}

function bullionFragments(art: string[], pal: Record<string, string>) {
  const pixels = art.flatMap((row, y) => [...row].flatMap((ink, x) => pal[ink] ? [{ x, y, color: pal[ink] }] : []));
  // Use pieces of the actual relief instead of a stock confetti pattern.
  return Array.from({ length: 16 }, (_, i) => {
    const { x, y, color } = pixels[Math.floor((i + 0.5) * pixels.length / 16)];
    // PixelArt adds 1.5 units of outline padding per edge on its 16×16 art.
    const sx = (x - 7.5) * 60 / 19, sy = (y - 7.5) * 60 / 19;
    const angle = Math.atan2(sy, sx) + (i % 3 - 1) * 0.25;
    const spread = 25 + i % 4 * 7;
    return {
      "--sx": `${sx}px`, "--sy": `${sy}px`, "--dx": `${sx + Math.cos(angle) * spread}px`,
      "--dy": `${sy + Math.sin(angle) * spread - 9}px`, "--ink": color, "--lag": `${i % 4 * 11}ms`,
    } as CSSProperties;
  });
}

function coinRoute(at: ScreenPoint, bank: ScreenPoint | null, index: number) {
  const fit = (x: number, y: number) => `${Math.max(11, Math.min(window.innerWidth - 11, x))} ${Math.max(11, Math.min(window.innerHeight - 11, y))}`;
  const end = bank ?? at;
  const dx = end.x - at.x, dy = end.y - at.y;
  const span = Math.hypot(dx, dy);
  const fan = [0.12, -1, 0.93, -0.58, 0.56, -0.26][index];
  const nx = span > 1 ? -dy / span : 1, ny = span > 1 ? dx / span : 0;
  const bend = fan * (bank ? 47 + Math.min(24, span * 0.05) : 51);
  const x = at.x + dx * 0.18, y = at.y + dy * 0.18;
  const crest = fit(x + nx * bend, y + ny * bend - 28 - index % 2 * 9);
  const p1 = fit(at.x + nx * bend * 0.55 - 10, at.y + ny * bend * 0.55 - 43);
  const p2 = fit(at.x + dx * 0.41 + nx * bend * 1.19, at.y + dy * 0.46 + ny * bend * 1.12 - 26);
  const p3 = fit(end.x - dx * 0.24 + nx * bend * 0.44, end.y - dy * 0.20 + ny * bend * 0.44 + 7);
  return `M ${at.x} ${at.y} Q ${p1} ${crest} C ${p2} ${p3} ${end.x} ${end.y}`;
}

/** Incomes mints a gold impression of the selected bug, not the bug itself. */
export function IncomeAssay({ cast }: { cast: IncomeCast }) {
  const { at, bank, bugId } = cast;
  const { potato } = useSettings();
  const { art, pal } = artFor(bugId);
  const gold = useMemo(() => gildSpecimen(pal), [pal]);
  const fragments = useMemo(() => bullionFragments(art, gold), [art, gold]);
  const paths = Array.from({ length: Math.min(cast.gold, potato ? 2 : 6) }, (_, i) => coinRoute(at, bank, i));
  const end = bank ?? at;
  return createPortal(
    <div className="commander-cast" data-skill-fx="incomes" data-specimen={bugId} data-local-credit={!bank || undefined} aria-hidden="true">
      {bank && <svg className="income-route" width="100%" height="100%" fill="none">
        <path className="income-route__line" d={paths[0]} pathLength="100" stroke="#ffd07a" strokeWidth="1.5" />
      </svg>}
      <div className="income-assay" style={{ left: at.x, top: at.y }}>
        <svg className="income-die" viewBox="0 0 80 80" fill="none" shapeRendering="crispEdges">
          <path d="M24 5h32l19 19v32L56 75H24L5 56V24Z" fill="#23160e" fillOpacity=".81" stroke="#75522b" strokeWidth="2" />
          <path d="M27 11h26l16 16v26L53 69H27L11 53V27Z" stroke={brass.g} strokeWidth="1.6" />
          <path d="M8 35h8v10H8zm56 0h8v10h-8zM35 8h10v5H35zm0 59h10v5H35z" fill="#ae7537" />
          <path d="M10 38h4v4h-4zm56 0h4v4h-4zM38 9h4v2h-4zm0 60h4v2h-4z" fill="#fff0ac" />
          <path d="M24 5h32l9 9m9 41L56 74H33M7 55V26" stroke="#ffdda2" />
        </svg>
        <div className="income-portrait">
          <PixelArt art={art} pal={pal} size={60} className="income-portrait__ink" />
          <PixelArt art={art} pal={gold} size={60} className="income-portrait__gold" />
          <i className="income-portrait__bar" />
        </div>
        <svg className="income-ignition" viewBox="0 0 80 80" fill="none" shapeRendering="crispEdges">
          <path d="M40 0v16m0 48v16M0 40h16m48 0h16M12 12l9 9m38 38 9 9m0-56-9 9M21 59l-9 9" stroke="#ffe195" strokeWidth="2.5" />
          <path d="M23 2h34l21 21v34L57 78H23L2 57V23Z" stroke="#e7a347" />
        </svg>
        {!potato && <span className="income-fragments">
          {fragments.map((style, i) => <i key={i} style={style} />)}
        </span>}
      </div>
      <span className="income-stream">
        {paths.map((route, i) => <span key={i} className="income-carrier" style={{
          offsetPath: `path("${route}")`, "--coin-lag": `${i * 41}ms`, "--coin-size": `${i === 0 ? 24 : 14 + i % 3 * 3}px`,
        } as CSSProperties}><AssayCoin stamped={i === 0} /></span>)}
      </span>
      <div className="income-bank" style={{ left: end.x, top: end.y }}>
        <i className="income-bank__strike" />
        <Flecks className="income-bank-chips" scatter={MINT_CHIPS} />
      </div>
      <b className="income-credit" data-below={end.y < 55 || undefined}
        style={{ left: Math.max(35, Math.min(window.innerWidth - 35, end.x)), top: end.y }}><IconCoin size={12} />+{cast.gold}G</b>
    </div>, document.body,
  );
}

/** A wide, two-stage maw: swallow the morsel, then kick the recruits back up. */
export function WormBenchCue({ eaten }: { eaten: BugId }) {
  return (
    <span className="worm-etch" data-skill-fx="eat-spit" aria-hidden="true">
      <svg className="worm-etch__mouth" viewBox="0 0 42 34" shapeRendering="crispEdges">
        <path d="M10 4h22v3h5v5h4v10h-4v5h-5v3H10v-3H5v-5H1V12h4V7h5Z" fill={chitin.d} stroke={chitin.p} />
        <path d="M11 7h20v3h6v14h-6v3H11v-3H5V10h6Z" fill={chitin.s} />
        <path className="worm-etch__cut" d="M11 9h20v3h6v10h-6v3H11v-3H5V12h6Z" fill="#160d15" />
        <path d="M6 10h5v1H6zm24-3h4v2h-4zm-20 18h8v2h-8zm23-2h4v2h-4z" fill={chitin.r} />
        {[0, 1].map(half => <g className="worm-etch__lip" key={half} style={{ "--part": half ? "4.4px" : "-4.4px" } as CSSProperties}>
          <g transform="translate(5.6 8.6) scale(2.8)">
            {WORM_MAW.filter(p => p.ink !== "b" && Number(p.y >= WORM_MAW_ROWS / 2) === half).map(({ x, y, ink }) =>
              <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={chitin[ink]} />)}
          </g>
        </g>)}
        <path className="worm-etch__flash" d="M2 16h8v2H2zm30 0h8v2h-8zm-12-12h2v6h-2zm0 20h2v6h-2z" fill={chitin.e} />
      </svg>
      <SpecimenIcon id={eaten} size={31} bare className="worm-etch__shed" />
      <Flecks className="worm-bite-chips" scatter={WORM_CHIPS} />
    </span>
  );
}

// A six-column grid with gutters. Use its responsive gap so the packet
// finishes at the actual socket centre even if the window is resized.
function socketCenter(slot: number) {
  const share = (slot + 0.5) / BENCH_SIZE;
  return `calc(${share * 100}% + var(--bench-gap) * ${slot - share * (BENCH_SIZE - 1)})`;
}

/** Only real arrivals get a packet. Reserve recruits and instant merges don't create fake bench slots. */
export function WormBenchFlights({ cast, bench }: { cast: WormCast; bench: readonly PrepUnit[] }) {
  return <span className="worm-flights" aria-hidden="true" style={{ "--flight-time": `${WORM_FLIGHT_MS}ms` } as CSSProperties}>
    {bench.map(({ uid, bugId, slot, star }) => {
      const a = cast.arrivals.get(uid);
      if (!a || a.star !== star || a.slot !== slot) return null;
      const backwards = slot < cast.slot;
      return <span key={uid} className="worm-flight" data-from-slot={cast.slot} data-to-slot={slot}
        data-backwards={backwards || undefined} style={{
          "--left": socketCenter(Math.min(cast.slot, slot)), "--right": socketCenter(Math.max(cast.slot, slot)),
          "--launch-at": `${a.delay - WORM_FLIGHT_MS}ms`, "--husk": BUGS[bugId].accent,
        } as CSSProperties}>
        <svg className="worm-flight__pod" viewBox="0 0 18 16" shapeRendering="crispEdges">
          <path d="M6 1h6v2h3v3h2v6h-2v2H3v-2H1V6h2V3h3Z" fill={chitin.d} />
          <path d="M6 3h6v2h3v7H3V6h3Z" fill={chitin.e} />
          <path d="M4 6h10v4H4z" fill="var(--husk)" />
          <path d="M6 4h5v2H6zm-2 6h2v2H4z" fill={chitin.t} />
          <path d="M7 7h4v2H7Z" fill={chitin.b} />
        </svg>
      </span>;
    })}
  </span>;
}

export function WormBenchArrival({ id, star, selected, delay }: { id: BugId; star: number; selected: boolean; delay: number }) {
  return <span className="worm-arrival" data-skill-arrival="true" style={{ "--arrival-delay": `${delay}ms`, "--husk": BUGS[id].accent } as CSSProperties}>
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
