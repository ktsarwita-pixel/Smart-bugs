import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BUGS, type BugId } from "../game/data";
import { fill, useSettings } from "../i18n";
import { SpecimenIcon } from "./SpecimenIcon";

type ScreenPoint = { x: number; y: number };
export type PrepCast = { serial: number; at: ScreenPoint } & (
  | { kind: "incomes"; bank: ScreenPoint; gold: number }
  | { kind: "eat-spit"; eaten: BugId; star: number; recruits: readonly BugId[] }
);

/** Take the rendered target position before a recruit moves or moults. */
export function screenPoint(el: Element | null): ScreenPoint | null {
  if (!el) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  const cx = x + width / 2, cy = y + height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return null;
  return { x: cx, y: cy };
}

const COINS = [0, 1, 2, 3, 4];

/** Decorative, non-blocking confirmation. The roster and gold update normally. */
export function CommanderPrepVignette({ cast }: { cast: PrepCast }) {
  const { at } = cast;
  const style = {
    left: at.x, top: at.y,
    ...(cast.kind === "incomes" ? { "--dx": `${cast.bank.x - at.x}px`, "--dy": `${cast.bank.y - at.y}px` } : {}),
  } as CSSProperties;
  return createPortal(
    <div className="commander-cast" data-skill-fx={cast.kind} aria-hidden="true">
      <div className="commander-cast__origin" style={style}>
        {cast.kind === "incomes" ? <>
          <i className="income-sigil" />
          {COINS.map((i) => <i className="income-coin" data-extra={i >= 3 ? "1" : undefined} style={{ "--i": i, "--spread": `${(i - 2) * 13}px` } as CSSProperties} key={i} />)}
          <b className="income-credit">+{cast.gold}G</b>
        </> : <>
          <i className="belch-sigil" />
          <div className="chomp-prey"><SpecimenIcon id={cast.eaten} size={32} star={cast.star} badge="none" /></div>
          <svg className="chomp-frame" viewBox="0 0 70 64" fill="none">
            <g className="chomp-frame__upper">
              <path d="M6 27 8 16 18 8 35 5 52 8 62 16 64 27 53 24H17Z" fill="#a14f48" stroke="#ffd4ad" strokeWidth="1.5" />
              <path d="M15 24h10l-4 10Zm14 0h12l-6 12Zm16 0h10l-6 10Z" fill="#fff0c8" />
              <path d="m18 15 17-5 17 5" stroke="#f79379" strokeWidth="2" />
            </g>
            <g className="chomp-frame__lower">
              <path d="M6 37 8 48 18 56 35 59 52 56 62 48 64 37 53 40H17Z" fill="#79504a" stroke="#ffd4ad" strokeWidth="1.5" />
              <path d="M14 40h11l-4-8Zm16 0h10l-5-9Zm15 0h11l-7-8Z" fill="#ffe1ad" />
              <path d="m18 49 17 5 17-5" stroke="#b57263" strokeWidth="2" />
            </g>
          </svg>
          {cast.recruits.map((id, i) => <span className="spit-recruit" data-wing={i} key={i}>
            <SpecimenIcon id={id} size={29} badge="none" /><b>1★</b>
          </span>)}
        </>}
      </div>
    </div>, document.body,
  );
}

/** A seal on round three, then the reliquary opens on the actual payout. */
export function PressurePresent({ award }: { award?: { gold: number; bugId: BugId | null } }) {
  const { t } = useSettings();
  return (
    <div className="pressure-result" data-skill-fx="pressure-present" data-gift={award ? "open" : "sealed"} role="status">
      <div className="pressure-relic" aria-hidden="true">
        <svg viewBox="0 0 44 44" fill="none">
          <path className="pressure-halo" d="M22 1 37 7 43 22 37 37 22 43 7 37 1 22 7 7Z" stroke="#ffd581" strokeWidth="2" />
          <path d="M6 20h32v13l-4 6H10l-4-6Z" fill="#9b542d" stroke="#754725" strokeWidth="2" />
          <path d="M10 27h24v7H10z" fill="#c48545" />
          <g className="pressure-lid">
            <path d="m4 22 3-8 6-6h18l6 6 3 8Z" fill="#eab865" stroke="#754725" strokeWidth="2" />
            <path d="M9 17h26l-4-5H13Z" fill="#ffdf9e" />
            <path d="m22 17 5 6-5 6-5-6Z" fill="#8cd1a7" stroke="#56351d" strokeWidth="1.5" />
          </g>
          <path className="pressure-glint" d="m22 5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff9df" />
        </svg>
      </div>
      {award ? <>
        <div className="pressure-result__copy"><strong>{t("Pressure present")}</strong>
          <div>+{award.gold}G{award.bugId && ` · ${fill(t("2 × {name} (1★)"), { name: t(BUGS[award.bugId].name) })}`}</div>
        </div>
        {award.bugId && <div className="pressure-specimens" aria-hidden="true">
          <span><SpecimenIcon id={award.bugId} size={21} badge="none" /></span>
          <span><SpecimenIcon id={award.bugId} size={21} badge="none" /></span>
        </div>}
      </> : <span className="pressure-result__copy">{t("Pressure present arrives after the next round.")}</span>}
    </div>
  );
}
