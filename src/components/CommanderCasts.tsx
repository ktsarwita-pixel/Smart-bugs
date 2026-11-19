import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { artFor, BENCH_SIZE, BUGS, type BugId } from "../game/data";
import { INCOME_BURST_MS, WORM_FLIGHT_MS, WORM_SPIT_MS } from "../game/commander-motifs";
import type { PrepUnit } from "../game/engine";
import { useSettings } from "../i18n";
import { IconCoin } from "./CustomIcons";
import { PixelArt } from "./PixelArt";
import { SpecimenIcon } from "./SpecimenIcon";
import "./commander-casts.css";

export type ScreenPoint = { x: number; y: number };
export type IncomeCast = { kind: "incomes"; serial: number; targetUid: number; bugId: BugId; at: ScreenPoint; bank: ScreenPoint | null; gold: number };
export type WormArrival = { star: number; slot: number; delay: number };
export type WormCast = {
  kind: "eat-spit"; serial: number; slot: number; eaten: BugId; at: ScreenPoint;
  /** Real bench changes, including moults. Nothing is animated into an empty slot. */
  arrivals: Map<number, WormArrival>;
};
export type PrepCast = IncomeCast | WormCast;

type Vars = CSSProperties & Partial<Record<`--${string}`, string | number>>;
const reduceQuery = "(prefers-reduced-motion: reduce)";
const watchMotion = (notify: () => void) => {
  const mq = window.matchMedia(reduceQuery);
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
};
const osReduced = () => window.matchMedia(reduceQuery).matches;
function useCastSettings() {
  const { motion, potato } = useSettings();
  const prefersReduced = useSyncExternalStore(watchMotion, osReduced, () => false);
  return { quiet: motion === "reduced" || prefersReduced, potato };
}

const fit = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const place = ({ x, y }: ScreenPoint) => ({ left: x, top: y });
const px = (n: number) => `${n.toFixed(2)}px`;

/** Read a visible screen point, relative to an optional Three.js projection. */
export function screenPoint(el: Element | null, local?: [number, number]): ScreenPoint | null {
  if (!el || el.getClientRects().length === 0) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  const cx = x + (local?.[0] ?? width / 2), cy = y + (local?.[1] ?? height / 2);
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return null;
  return { x: cx, y: cy };
}

// CSS transforms rather than motion-path: flight destinations also work on
// browsers that don't implement `offset-path`, and can be updated on resize.
function flight(from: ScreenPoint, to: ScreenPoint, arc: number, side = 0): Vars {
  const dx = to.x - from.x, dy = to.y - from.y;
  const mx = fit(from.x + .26 * dx + side, 15, window.innerWidth - 15) - from.x;
  const my = fit(from.y + .20 * dy - arc, 15, window.innerHeight - 15) - from.y;
  return {
    ...place(from), "--dx": px(dx), "--dy": px(dy), "--mx": px(mx), "--my": px(my),
    "--nx": px(dx * .77 + side * .30), "--ny": px(dy * .77 - arc * .52),
  };
}

const METAL = ["#91501c", "#b76b19", "#d58b27", "#eab040", "#f7c357", "#ffd977", "#ffe79b", "#fff3c7"];
const facets = [[2.1, 2.4], [8.6, 1.9], [13.7, 4.4], [4.1, 7.7], [9.4, 7.1], [13.2, 12.9], [3.3, 13.5], [8.2, 14.9]];

/** Clip each contiguous face against the other seeds' perpendicular bisectors. */
function fractureFaces() {
  return facets.map(([x, y], j) => {
    let polygon = [[-1, -1], [17, -1], [17, 17], [-1, 17]];
    facets.forEach(([qx, qy], i) => {
      if (i === j) return;
      const nx = qx - x, ny = qy - y, b = (qx * qx + qy * qy - x * x - y * y) / 2;
      polygon = polygon.flatMap((v, k) => {
        const w = polygon[(k + 1) % polygon.length];
        const a = v[0] * nx + v[1] * ny - b, d = w[0] * nx + w[1] * ny - b;
        const out = a <= 0 ? [v] : [];
        if ((a < 0 && d > 0) || (a > 0 && d < 0)) {
          const t = a / (a - d);
          out.push([v[0] + (w[0] - v[0]) * t, v[1] + (w[1] - v[1]) * t]);
        }
        return out;
      });
    });
    return polygon.map(v => v.map(n => n.toFixed(3)).join(",")).join(" ");
  });
}
const FACES = fractureFaces();

function metalArt(art: string[], pal: Record<string, string>) {
  const lum = (hex: string) => {
    const rgb = Number.parseInt(hex.slice(1), 16);
    return .2126 * (rgb >> 16) + .7152 * (rgb >> 8 & 255) + .0722 * (rgb & 255);
  };
  const keys = Object.keys(pal).sort((a, b) => lum(pal[a]) - lum(pal[b]));
  const paths = new Map(keys.map(key => [key, ""]));
  art.forEach((row, y) => [...row].forEach((ink, x) => {
    if (paths.has(ink)) paths.set(ink, `${paths.get(ink)}M${x} ${y}h1v1h-1Z`);
  }));
  return keys.map((key, i) => ({ d: paths.get(key), fill: METAL[Math.round(i * (METAL.length - 1) / Math.max(1, keys.length - 1))] }));
}

/** One original silhouette, clipped into real pieces only after it gilds. */
function GoldSpecimen({ id, art, pal, quiet }: { id: string; art: string[]; pal: Record<string, string>; quiet: boolean }) {
  const shapes = useMemo(() => metalArt(art, pal), [art, pal]);
  const sprite = `#${id}-gold`, silhouette = `#${id}-shape`, mask = `url(#${id}-mask)`;
  return <svg className="mint-metal" viewBox="-1.5 -1.5 19 19" width="100%" height="100%">
    <defs>
      <path id={`${id}-shape`} d={shapes.map(s => s.d).join("")} />
      <g id={`${id}-gold`} shapeRendering="crispEdges">
        <use href={silhouette} transform="translate(.35 .52)" fill="#62300e" />
        {shapes.map(({d,fill}, i) => <path key={i} d={d} fill={fill} />)}
      </g>
      <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
        <use href={silhouette} fill="white" />
      </mask>
      <linearGradient id={`${id}-tint`} x1=".16" y1="0" x2=".82" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#fff7d4" stopOpacity=".64" />
        <stop offset=".43" stopColor="#ffeac2" stopOpacity=".08" />
        <stop offset=".6" stopColor="#9e4914" stopOpacity=".31" />
        <stop offset=".74" stopColor="#ffe5a0" stopOpacity=".28" />
        <stop offset="1" stopColor="#83400f" stopOpacity=".58" />
      </linearGradient>
      {!quiet && FACES.map((points, j) => <clipPath key={j} id={`${id}-chip-${j}`}><polygon points={points} /></clipPath>)}
    </defs>
    <g className="mint-metal__whole">
      <use href={sprite} />
      <g mask={mask}>
        <rect width="16" height="16" fill={`url(#${id}-tint)`} />
        {!quiet && <>
          <path className="mint-metal__shine" d="M-13 16 2 0h3L-10 16Z" fill="#fffadc" />
          <g className="mint-cracks" fill="none" stroke="#4d260c" strokeWidth=".15">
            {FACES.map((points, i) => <polygon key={i} points={points} />)}
          </g>
        </>}
      </g>
    </g>
    {!quiet && <g className="mint-pieces">
      {facets.map(([x,y], j) => <g className="mint-piece" key={j} style={{
        "--jx": px((x - 8) * (1.25 + (j % 3) * .37)), "--jy": px((y - 8) * 1.38 - 1.0),
        "--twist": `${(j % 2 ? -1 : 1) * (42 + j * 11)}deg`, "--lag": `${j % 3 * 22}ms`,
      } as Vars}>
        <g clipPath={`url(#${id}-chip-${j})`}>
          <use href={sprite} />
          <polygon points={FACES[j]} fill="none" stroke="#fff0b4" strokeOpacity=".36" strokeWidth=".12" mask={mask} />
        </g>
      </g>)}
    </g>}
  </svg>;
}

function MintCoin() {
  return <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none">
    <ellipse cx="16" cy="17" rx="12.2" ry="12.4" fill="#98511d" stroke="#4e2612" strokeWidth="1.6" />
    <circle cx="16" cy="14.8" r="11.7" fill="#f5b74d" stroke="#fff0ae" strokeWidth="1.8" />
    <circle cx="16" cy="14.8" r="8.9" fill="#d98a26" stroke="#9a551b" strokeWidth="1.05" />
    <path d="M7.5 8.1A10.5 10.5 0 0 1 19 4.8M21.5 23.8a10.6 10.6 0 0 0 4-5.3" stroke="#fff7c7" strokeWidth="1.3" strokeLinecap="round" />
    <path d="m12 13 4-4.5 4 4.5v4.3l-4 4.4-4-4.4Z" fill="#ffe8a1" stroke="#a65e20" strokeWidth="1.2" />
    <path d="m16 8.6 1.1 5.2 2.9 3.5-4 4.4-4-4.4 3-3.5Z" fill="#f9c75f" />
  </svg>;
}

function Sparks({ className, n }: { className: string; n: number }) {
  return <span className={className}>
    {Array.from({ length: n }, (_, i) => <i key={i} style={{
      "--theta": `${i * 137.508}deg`, "--reach": `${29 + i % 7 * 9}px`, "--lag": `${(i % 5) * 19}ms`,
    } as Vars} />)}
  </span>;
}

export function IncomesCast({ cast }: { cast: IncomeCast }) {
  const { quiet, potato } = useCastSettings();
  const { at, bank, bugId, serial } = cast;
  const { art, pal } = artFor(bugId);
  const end = bank ?? at;
  const rise = at.y > 170 ? -103 : 103;
  const hero = { x: fit(at.x, 68, window.innerWidth - 68), y: fit(at.y + rise, 74, window.innerHeight - 74) };
  const coins = Math.min(cast.gold, potato ? 3 : 6);
  const travel = bank ? 820 : 580;
  return createPortal(<div className="spell-fx mint-fx" data-skill-fx="incomes" data-specimen={bugId}
    data-local-credit={bank ? undefined : "true"} data-quiet={quiet || undefined} aria-hidden="true"
    style={{ "--burst-at": `${INCOME_BURST_MS}ms`, "--credit-at": `${INCOME_BURST_MS + travel + 55}ms` } as Vars}>
    <span className="mint-origin" style={place(at)} data-cast-origin />
    {!quiet && <span className="mint-column" style={{ ...place(at), "--length": px(Math.hypot(hero.x - at.x, hero.y - at.y)), "--angle": `${Math.atan2(hero.y - at.y, hero.x - at.x)}rad` } as Vars} />}
    <div className="mint-sun" style={place(hero)}>{!quiet && <i />}</div>
    <div className="mint-avatar" style={{ ...place(hero), "--from-x": px(at.x - hero.x), "--from-y": px(at.y - hero.y) } as Vars}>
      {!quiet && <PixelArt art={art} pal={pal} size={116} className="mint-ink" />}
      <GoldSpecimen id={`mint-${serial}`} art={art} pal={pal} quiet={quiet} />
    </div>
    {!quiet && <>
      <div className="mint-break" style={place(hero)}>
        <i className="mint-break__wave" /><Sparks className="mint-break__sparks" n={potato ? 5 : 17} />
      </div>
      {Array.from({ length: coins }, (_, i) => <span key={i} className="mint-coin" data-destination={`${end.x},${end.y}`}
        style={{ ...flight(hero, end, 24 + i % 3 * 9, (i % 2 ? -1 : 1) * (14 + i * 8)),
          "--jump-at": `${INCOME_BURST_MS + 20 + i * 38}ms`, "--travel": `${travel}ms`, "--coin-w": `${i === 0 ? 30 : 22 + i % 3 * 2}px`,
        } as Vars}><MintCoin /></span>)}
      <i className="mint-kiss" style={place(end)} />
    </>}
    <b className="mint-credit" data-below={end.y < 57 || undefined} style={place({ x: fit(end.x, 40, window.innerWidth - 40), y: end.y })}>
      <IconCoin size={13} />+{cast.gold}G
    </b>
  </div>, document.body);
}

function WormSculpt({ serial }: { serial: number }) {
  const id = `feed-${serial}`;
  return <svg className="feed-worm" viewBox="0 0 200 192" aria-hidden="true" overflow="visible">
    <defs>
      <linearGradient id={`${id}-hide`} x1=".1" y1=".16" x2=".78" y2=".87">
        <stop stopColor="#eb9b75"/><stop offset=".25" stopColor="#b96858"/><stop offset=".61" stopColor="#683139"/><stop offset="1" stopColor="#351921"/>
      </linearGradient>
      <linearGradient id={`${id}-crest`} x1=".25" y1="0" x2=".65" y2="1">
        <stop stopColor="#ffe0a8"/><stop offset=".19" stopColor="#d88b69"/><stop offset=".56" stopColor="#a6504b"/><stop offset="1" stopColor="#502632"/>
      </linearGradient>
      <linearGradient id={`${id}-tooth`} x1=".48" y1=".04" x2=".53" y2="1">
        <stop stopColor="#fff4d3"/><stop offset=".57" stopColor="#f8d7a4"/><stop offset="1" stopColor="#a46b47" />
      </linearGradient>
      <radialGradient id={`${id}-throat`} cx=".46" cy=".42" r=".55">
        <stop stopColor="#160b14"/><stop offset=".65" stopColor="#291322"/><stop offset=".89" stopColor="#612630"/><stop offset="1" stopColor="#9f5347"/>
      </radialGradient>
    </defs>
    <g className="feed-worm__coil">
      <path d="M44 171C60 160 64 149 62 132C59 104 79 93 105 83C116 78 120 69 118 61l24-19c29 21 30 47 10 70-16 18-27 36-8 55 4 4 12 7 17 9-41 18-77 18-117-5Z"
        fill={`url(#${id}-hide)`} stroke="#351925" strokeWidth="3.5" />
      <path d="M64 121c7 10 33 20 70 16M62 139c16 13 40 17 67 15M57 155c18 15 49 21 85 12M78 102c12 11 39 13 70 7M101 87c12 9 34 11 59 4"
        fill="none" stroke="#4f2931" strokeWidth="4.3" strokeLinecap="round" />
      <path d="M66 122c12 12 39 20 64 17m-65 2c12 12 39 17 63 16m-66 1c14 11 39 18 74 14M80 104c14 11 41 14 63 8"
        fill="none" stroke="#e29871" strokeOpacity=".53" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M80 108c-7 7-6 12-4 17m1 18 4 7m3 15 6 3" fill="none" stroke="#f4b485" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g className="feed-worm__head">
      <path d="M34 52C43 30 65 24 88 25c37-1 62 13 72 40 10 26-12 42-33 46-18 3-52 3-73-7C30 93 24 71 34 52Z" fill={`url(#${id}-hide)`} stroke="#3a1a26" strokeWidth="3.7" />
      <path className="feed-worm__throat" d="M38 62C42 47 66 38 90 38s52 7 59 24c7 16-12 35-29 40-21 7-51 5-68-6-13-8-21-21-14-34Z"
        fill={`url(#${id}-throat)`} />
      <g className="feed-worm__upper">
        <path d="M34 66C31 48 45 31 63 25 82 18 111 21 132 30c15 6 26 20 25 35-19-14-38-17-61-16C71 47 50 54 34 66Z"
          fill={`url(#${id}-crest)`} stroke="#6a3238" strokeWidth="2.4" />
        <path d="M43 49c23-16 61-19 90-4M53 36c21-12 49-10 67-5" fill="none" stroke="#ffcf9a" strokeOpacity=".64" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M44 58q5 12 11 15l2-19m8-3q2 17 11 22l4-23m8-1q1 17 10 25l6-25m9 1q2 17 9 22l5-19m6 2q1 14 7 17l5-12"
          fill={`url(#${id}-tooth)`} stroke="#984e39" strokeWidth="1.1" strokeLinejoin="round" />
      </g>
      <g className="feed-worm__lower">
        <path d="M32 75C40 88 59 98 88 99c28 2 51-6 68-24 2 17-11 32-29 39-25 10-61 7-81-8C35 97 29 87 32 75Z"
          fill={`url(#${id}-crest)`} stroke="#642d36" strokeWidth="2.4" />
        <path d="M47 95q-3-10-3-14 9 6 12 17m4 2q-3-15-1-18 9 4 15 20m7 1q-3-16 0-21 10 6 14 21m6-1q2-17 7-20 5 6 5 18m6-2q3-14 11-19 3 6 0 13m5-4q5-11 11-13l-1 8"
          fill={`url(#${id}-tooth)`} stroke="#8d493a" strokeWidth="1" strokeLinejoin="round" />
        <path d="M48 104c13 8 41 13 66 8" fill="none" stroke="#f2a379" strokeOpacity=".68" strokeWidth="2.1" strokeLinecap="round" />
      </g>
    </g>
  </svg>;
}

function benchPoint(slot: number) {
  return screenPoint(document.querySelector(`.bench-slot[data-bench-slot="${slot}"]`));
}

export function WormFeedCast({ cast, bench }: { cast: WormCast; bench: readonly PrepUnit[] }) {
  const { quiet, potato } = useCastSettings();
  const [sockets, setSockets] = useState<(ScreenPoint | null)[]>([]);
  useLayoutEffect(() => {
    const measure = () => setSockets(Array.from({ length: BENCH_SIZE }, (_, i) => benchPoint(i)));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);
  const at = sockets[cast.slot] ?? cast.at;
  const width = fit(window.innerWidth * .47, 150, 203);
  const centre = fit(at.x, width * .50, window.innerWidth - width * .50);
  const top = fit(at.y - width * .88, 12, window.innerHeight - width);
  const mouth = { x: centre - .025 * width, y: top + .36 * width };
  return createPortal(<div className="spell-fx feed-fx" data-skill-fx="eat-spit" data-quiet={quiet || undefined}
    aria-hidden="true" style={{ "--spit-at": `${WORM_SPIT_MS}ms` } as Vars}>
    <span className="feed-origin" style={place(at)} data-cast-origin />
    <div className="feed-stage" style={{ left: centre, top, width }}>
      <i className="feed-seam" />
      <WormSculpt serial={cast.serial} />
    </div>
    {!quiet && <>
      <div className="feed-meal" style={flight(at, mouth, 12, -12)}><SpecimenIcon id={cast.eaten} size={50} bare /></div>
      <span className="feed-bite" style={place(mouth)}><Sparks className="feed-bite__grit" n={potato ? 4 : 11} /></span>
      <span className="feed-kick" style={place(mouth)}><Sparks className="feed-kick__grit" n={potato ? 4 : 12} /></span>
      {bench.map(u => {
        const a = cast.arrivals.get(u.uid), end = sockets[u.slot];
        if (!a || a.slot !== u.slot || a.star !== u.star || !end) return null;
        const style: Vars = { ...flight(mouth, end, 57 + Math.min(27, Math.abs(end.x - mouth.x) * .15), u.slot < cast.slot ? -15 : 14),
          "--depart": `${a.delay - WORM_FLIGHT_MS}ms`, "--travel": `${WORM_FLIGHT_MS}ms`, "--recruit": BUGS[u.bugId].accent };
        return <div className="feed-recruit" key={u.uid} data-to-slot={u.slot} data-unit={u.uid} style={style}>
          <i /><SpecimenIcon id={u.bugId} size={47} bare />
        </div>;
      })}
    </>}
  </div>, document.body);
}

export function WormBenchArrival({ id, star, selected, delay }: { id: BugId; star: number; selected: boolean; delay: number }) {
  return <span className="worm-arrival" data-skill-arrival="true" style={{ "--arrive": `${delay}ms`, "--recruit": BUGS[id].accent } as Vars}>
    <i aria-hidden="true" />
    <SpecimenIcon id={id} size={33} star={star} selected={selected} badge="none" />
  </span>;
}
