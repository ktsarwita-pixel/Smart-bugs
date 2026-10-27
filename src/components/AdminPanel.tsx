import { useEffect, useRef, useState } from "react";
import { IconAdmin, IconClose, IconHelp, IconLock, IconPlay } from "./CustomIcons";
import { SpecimenIcon } from "./SpecimenIcon";
import { BUGS, BUG_ORDER, MAX_FIELD_SIZE, type BugId } from "../game/data";
import { statsFor } from "../game/engine";
import { useSettings } from "../i18n";

/**
 * The gate stores only a non-reversible digest, so the passphrase is not a
 * greppable string in the bundle. This is convenience gating for a
 * single-player debug console, not a security boundary.
 */
const ADMIN_DIGEST = 0x81023413; // FNV-1a of the curator passphrase

function digest(input: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SESSION_KEY = "smartbugs.admin.unlocked";

/** The curator passphrase. Keep in sync with the digest above. */
export const PANEL_PASSCODE = "Wira67";

/** Verifies a passphrase without mutating session state. */
export function tryUnlockAdmin(input: string): boolean {
  const ok = digest(input) === ADMIN_DIGEST;
  if (ok) persistUnlocked(true);
  return ok;
}

/** Cleared when the tab closes, so the panel re-locks next session. */
function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function persistUnlocked(value: boolean) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — the panel simply re-locks each render */
  }
}

export interface AdminSnapshot {
  phase: string;
  gold: number;
  hp: number;
  level: number;
  round: number;
  selected: string;
  winner: string | null;
  activeCount: number;
  commander: string;
  /** battle speed multiplier (1-3) */
  speed?: number;
  /** next opponent short name, for the foe-HP slider label */
  foeName?: string;
  /** next opponent colony HP */
  foeHp?: number;
}

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
  snapshot: AdminSnapshot;
  onCommand: (command: string) => string;
  /**
   * Overrides the session flag. Browsers omit it and read sessionStorage;
   * tests pass it explicitly so they never depend on storage or test order.
   */
  initiallyUnlocked?: boolean;
}

interface Entry {
  command: string;
  result: string;
}

type PanelTab = "units" | "economy" | "match";

const COMMAND_HELP = [
  "gold [amount] · gold set <n> · hp set <1-100> · foehp set <1-100>",
  "heal · hurt [amount] · level <1-6>",
  "give <stag|bomb|mantis|dragonfly|random> [1-3] · shop [bug] · lock",
  "starup · remove · mana · manaall · win · lose · next · speed <1|2|3> · reset · help",
];

const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Admin Panel v2 — tap-first. Everything important is a picker, slider
 * or button; typed commands remain available under "Advanced".
 * All controls funnel through the same onCommand strings the game
 * already understands, so there is exactly one cheat implementation.
 */
export function AdminPanel({ open, onClose, snapshot, onCommand, initiallyUnlocked }: AdminPanelProps) {
  const { t } = useSettings();
  const [unlocked, setUnlocked] = useState(() => initiallyUnlocked ?? readUnlocked());
  const [passcode, setPasscode] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [input, setInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([
    { command: "status", result: "Admin ready — pick a bug & star, then tap GIVE. No typing needed." },
  ]);

  /* ── v2 picker state ── */
  const [tab, setTab] = useState<PanelTab>("units");
  const [pickBug, setPickBug] = useState<BugId | "random">("dragonfly");
  const [pickStar, setPickStar] = useState(3);
  const [goldVal, setGoldVal] = useState(snapshot.gold);
  const [hpVal, setHpVal] = useState(snapshot.hp);
  const [foeHpVal, setFoeHpVal] = useState(snapshot.foeHp ?? 100);
  const [confirmReset, setConfirmReset] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (!unlocked) passRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, unlocked]);

  /* Re-sync sliders to the live game every time the panel opens. */
  useEffect(() => {
    if (!open) return;
    setGoldVal(snapshot.gold);
    setHpVal(clampN(snapshot.hp, 1, 100));
    setFoeHpVal(clampN(snapshot.foeHp ?? 100, 1, 100));
    setConfirmReset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries, open]);

  // Escape backs out of the panel whether it is locked or unlocked.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const unlockNow = () => {
    persistUnlocked(true);
    setUnlocked(true);
    setError("");
    setPasscode("");
  };

  const submitPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (tryUnlockAdmin(passcode)) {
      unlockNow();
      return;
    }
    setError(t("Incorrect passphrase. Access denied."));
    setShake((n) => n + 1);
    setPasscode("");
  };

  const run = (raw: string) => {
    const command = raw.trim();
    if (!command) return;
    const result = onCommand(command);
    setEntries((prev) => [...prev.slice(-9), { command, result }]);
    setInput("");
  };

  const lastResult = entries[entries.length - 1]?.result ?? "";

  if (!unlocked) {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 px-4 backdrop-blur-[3px]"
        role="presentation"
        onClick={onClose}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-gate-title"
          aria-describedby="admin-gate-hint"
          className="rise w-full max-w-[380px] overflow-hidden border-2 border-[#6B4B24] bg-[#120D09] shadow-[0_18px_60px_rgba(0,0,0,.9)]"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center gap-3 border-b border-[#4A3828] bg-[#1D150F] px-4 py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center border border-[#F0A93B] bg-[#241708] text-[#F0A93B]">
              <IconLock size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="admin-gate-title" className="font-pixel text-[11px] text-[#FFF3DC]">{t('RESTRICTED')}</h2>
              <p className="latin text-[12px] text-[#9C8F7E]">{t('Curator access only')}</p>
            </div>
          </header>

          <form className="p-4" onSubmit={submitPasscode}>
            <label className="label mb-1.5 block text-[7.5px] text-[#B3A594]" htmlFor="admin-passcode">
              Passphrase
            </label>
            <div className="flex gap-2">
              <input
                id="admin-passcode"
                ref={passRef}
                type={reveal ? "text" : "password"}
                value={passcode}
                onChange={(e) => {
                  const v = e.target.value;
                  setPasscode(v);
                  if (error) setError("");
                  // Auto-unlock the moment the right passphrase is typed.
                  if (tryUnlockAdmin(v)) unlockNow();
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={!!error}
                placeholder="••••••"
                className={`min-h-[48px] min-w-0 flex-1 border bg-black/55 px-3 font-mono text-[13px] tracking-[0.18em] text-[#FFF3DC] outline-none placeholder:text-[#5C4A38] transition-colors ${
                  error ? "border-[#E0522F]" : "border-[#4A3828] focus:border-[#F0A93B]"
                } ${shake ? "gate-shake" : ""}`}
                key={shake}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? t("Hide passphrase") : t("Show passphrase")}
                aria-pressed={reveal}
                className="grid min-h-[48px] w-12 shrink-0 place-items-center border border-[#4A3828] bg-[#17110C] text-[#B3A594] active:translate-y-[1px]"
              >
                <IconHelp size={16} />
              </button>
            </div>

            <p id="admin-gate-hint" aria-live="assertive" className="min-h-[18px] mt-2 font-mono text-[10px] text-[#F05A36]">
              {error}
            </p>

            <button
              type="submit"
              className="lift mt-1 flex min-h-[48px] w-full items-center justify-center gap-2 border-2 border-[#F0A93B] bg-[#241708] font-pixel text-[10px] text-[#F0A93B]"
            >
              <IconAdmin size={14} />
              <span>{t('UNLOCK CONSOLE')}</span>
            </button>
            <p className="mt-2 text-center font-mono text-[9px] text-[#6B5F52]">
              Tip: it unlocks automatically when the passphrase is complete.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 min-h-[44px] w-full border border-[#3B322A] bg-[#16110D] label text-[8px] text-[#8C7E6E] active:translate-y-[1px]"
            >
              BACK TO GAME
            </button>
          </form>
        </section>
      </div>
    );
  }

  const pickStats = pickBug !== "random" ? statsFor(pickBug, pickStar) : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/78 backdrop-blur-[3px] sm:items-center sm:p-4" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-panel-title"
        className="rise flex max-h-[94dvh] w-full max-w-[640px] flex-col overflow-hidden border-2 border-[#6B4B24] bg-[#120D09] shadow-[0_18px_60px_rgba(0,0,0,.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#4A3828] bg-[#1D150F] px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center border border-[#F0A93B] bg-[#241708] text-[#F0A93B]">
              <IconAdmin size={21} />
            </span>
            <div className="min-w-0">
              <h2 id="admin-panel-title" className="font-pixel text-[11px] text-[#FFF3DC]">{t('ADMIN — TAP MODE')}</h2>
              <p className="truncate font-mono text-[9px] text-[#9C8F7E]">
                {snapshot.phase.toUpperCase()} · {t("Round")} {snapshot.round + 1} · {snapshot.activeCount} {t("colonies alive")}
                {snapshot.winner ? ` · ${t("WINNER")}: ${t(snapshot.winner)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                persistUnlocked(false);
                setUnlocked(false);
                setPasscode("");
              }}
              aria-label={t("Lock admin console")}
              title={t("Lock admin console")}
              className="grid h-11 w-11 place-items-center border border-[#4A3828] bg-[#120D09] text-[#B3A594] active:translate-y-[1px]"
            >
              <IconLock size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close admin panel")}
              className="grid h-11 w-11 place-items-center border border-[#4A3828] bg-[#120D09] text-[#EDE2CB] active:translate-y-[1px]"
            >
              <IconClose size={13} />
            </button>
          </div>
        </header>

        {/* Live snapshot strip */}
        <div className="grid grid-cols-4 divide-x divide-[#3B322A] border-b border-[#3B322A] bg-[#0D0907] text-center">
          {[
            ["GOLD", snapshot.gold],
            ["HP", snapshot.hp],
            ["LINE", snapshot.level],
            ["SELECTED", snapshot.selected],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 px-1 py-2">
              <div className="label text-[6.5px] text-[#7B6E5F]">{t(String(label))}</div>
              <div className="truncate font-pixel text-[9px] text-[#F0A93B]">{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-[#3B322A] bg-[#0D0907]" role="tablist" aria-label={t("Admin sections")}>
          {(
            [
              ["units", "UNITS"],
              ["economy", "ECONOMY"],
              ["match", "MATCH"],
            ] as [PanelTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-[44px] font-pixel text-[9px] ${
                tab === id
                  ? "border-b-2 border-[#F0A93B] bg-[#1D150F] text-[#F0A93B]"
                  : "border-b-2 border-transparent text-[#8C7E6E]"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {tab === "units" && (
            <div className="space-y-4">
              {/* Bug picker */}
              <section aria-label={t("Choose a bug")}>
                <h3 className="label mb-1.5 text-[7.5px] text-[#56DCA8]">{t('1 · Choose a bug')}</h3>
                <div className="seg" role="group" aria-label={t("Bug")}>
                  {BUG_ORDER.map((id) => (
                    <button
                      key={id}
                      type="button"
                      data-on={pickBug === id ? 1 : 0}
                      onClick={() => setPickBug(id)}
                      className="seg-btn"
                      aria-pressed={pickBug === id}
                    >
                      <SpecimenIcon id={id} size={30} badge="none" />
                      <span>{BUGS[id].short}</span>
                      <span style={{ color: "#F0A93B" }}>{BUGS[id].cost}G</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    data-on={pickBug === "random" ? 1 : 0}
                    onClick={() => setPickBug("random")}
                    className="seg-btn"
                    aria-pressed={pickBug === "random"}
                  >
                    <span className="font-pixel text-[16px]">?</span>
                    <span>{t('RANDOM')}</span>
                    <span style={{ color: "#F0A93B" }}>—</span>
                  </button>
                </div>
              </section>

              {/* Star picker with live stat preview */}
              <section aria-label={t("Choose star level")}>
                <h3 className="label mb-1.5 text-[7.5px] text-[#56DCA8]">{t('2 · Star level')}</h3>
                <div className="seg" role="group" aria-label={t("Stars")}>
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-on={pickStar === s ? 1 : 0}
                      onClick={() => setPickStar(s)}
                      className="seg-btn"
                      aria-pressed={pickStar === s}
                    >
                      <span className="font-pixel text-[11px]">{"★".repeat(s)}</span>
                      <span>{s}★</span>
                    </button>
                  ))}
                </div>
                {pickStats && (
                  <p className="mt-1.5 text-center font-mono text-[10.5px] text-[#C9E8D8]">
                    {t(BUGS[pickBug as BugId].name)} {pickStar}★ →{" "}
                    <b className="text-[#FFF3DC]">{pickStats.hp} HP · {pickStats.atk} ATK</b>
                    {pickBug === "dragonfly" &&
                      (pickStar >= 3 ? (
                        <span className="text-[#75D9E8]">{t("· Airstrike UNLOCKED (2.2× team ΣATK)")}</span>
                      ) : (
                        <span className="text-[#8C7E6E]">{t("· passive only — ultimate needs 3-star")}</span>
                      ))}
                  </p>
                )}
              </section>

              <button type="button" className="big-action" onClick={() => run(`give ${pickBug} ${pickStar}`)}>
                <IconPlay size={12} />
                {t("GIVE")} {pickBug === "random" ? t("RANDOM BUG") : BUGS[pickBug as BugId].short} · {pickStar}★
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className="seg-btn"
                  onClick={() => run(pickBug === "random" ? "shop" : `shop ${pickBug}`)}
                >
                  {t('PUT IN SHOP')}
                </button>
                <button type="button" className="seg-btn" onClick={() => run("shop")}>
                  {t('REFRESH SHOP')}
                </button>
              </div>

              {/* Selected unit */}
              <section aria-label={t("Selected unit")}>
                <h3 className="label mb-1.5 text-[7.5px] text-[#56DCA8]">{t("Selected unit")} — {t(snapshot.selected)}</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" className="seg-btn" onClick={() => run("starup")}>
                    ★ {t('STAR UP')}
                  </button>
                  <button type="button" className="seg-btn" onClick={() => run("remove")}>
                    ✕ {t('REMOVE')}
                  </button>
                </div>
                {snapshot.selected === "NONE" && (
                  <p className="mt-1 font-mono text-[9.5px] text-[#6B5F52]">{t('Select a bug on the bench/board first.')}</p>
                )}
              </section>

              {/* Battle mana */}
              <section aria-label={t("Battle mana")}>
                <h3 className="label mb-1.5 text-[7.5px] text-[#56DCA8]">{t('During battle — mana')}</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" className="seg-btn" onClick={() => run("mana")}>
                    {t('CHARGE DRAGONFLY')}
                  </button>
                  <button type="button" className="seg-btn" onClick={() => run("manaall")}>
                    {t('CHARGE ALL ALLIES')}
                  </button>
                </div>
              </section>
            </div>
          )}

          {tab === "economy" && (
            <div className="space-y-4">
              {/* Gold */}
              <section aria-label={t("Gold")}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="label text-[7.5px] text-[#56DCA8]">{t('Gold — set to')}</h3>
                  <span className="font-pixel text-[11px] text-[#F0A93B]">{goldVal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="stepper-btn" aria-label={t("Minus 10 gold")} onClick={() => setGoldVal((v) => clampN(v - 10, 0, 999))}>−</button>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={5}
                    value={Math.min(goldVal, 300)}
                    onChange={(e) => setGoldVal(Number(e.target.value))}
                    className="admin-range flex-1"
                    aria-label={t("Gold amount")}
                  />
                  <button type="button" className="stepper-btn" aria-label={t("Plus 10 gold")} onClick={() => setGoldVal((v) => clampN(v + 10, 0, 999))}>+</button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" className="seg-btn" onClick={() => run("gold 25")}>{t('+25 NOW')}</button>
                  <button type="button" className="seg-btn" onClick={() => run("gold 100")}>{t('+100 NOW')}</button>
                  <button type="button" className="seg-btn" data-on={1} onClick={() => run(`gold set ${goldVal}`)}>{t("SET TO")} {goldVal}</button>
                </div>
              </section>

              {/* Your HP */}
              <section aria-label={t("Your colony HP")}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="label text-[7.5px] text-[#56DCA8]">{t('Your colony HP')}</h3>
                  <span className="font-pixel text-[11px] text-[#56DCA8]">{hpVal}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={hpVal}
                  onChange={(e) => setHpVal(Number(e.target.value))}
                  className="admin-range"
                  aria-label={t("Your HP")}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" className="seg-btn" data-on={1} onClick={() => run(`hp set ${hpVal}`)}>{t("SET HP")} {hpVal}</button>
                  <button type="button" className="seg-btn" onClick={() => run("heal")}>{t('HEAL TO 100')}</button>
                  <button type="button" className="seg-btn" onClick={() => run("hurt 10")}>{t('HURT −10')}</button>
                </div>
              </section>

              {/* Foe HP */}
              <section aria-label={t("Opponent HP")}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="label text-[7.5px] text-[#F05A36]">{t("Next opponent")}{snapshot.foeName ? ` — ${snapshot.foeName}` : ""} HP</h3>
                  <span className="font-pixel text-[11px] text-[#F05A36]">{foeHpVal}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={foeHpVal}
                  onChange={(e) => setFoeHpVal(Number(e.target.value))}
                  className="admin-range"
                  aria-label={t("Opponent HP")}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" className="seg-btn" data-on={1} onClick={() => run(`foehp set ${foeHpVal}`)}>{t("SET FOE HP")} {foeHpVal}</button>
                  <button type="button" className="seg-btn" onClick={() => run("foehp set 1")}>{t('FOE TO 1 HP')}</button>
                </div>
              </section>

              {/* Line size */}
              <section aria-label={t("Line size")}>
                <h3 className="label mb-1.5 text-[7.5px] text-[#56DCA8]">{t('Line size (tap = apply now)')}</h3>
                <div className="seg" role="group" aria-label={t("Line size")}>
                  {Array.from({ length: MAX_FIELD_SIZE }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-on={snapshot.level === n ? 1 : 0}
                      onClick={() => run(`level ${n}`)}
                      className="seg-btn"
                      aria-pressed={snapshot.level === n}
                    >
                      <span className="font-pixel text-[11px]">{n}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className="seg-btn" onClick={() => run("shop")}>{t('REFRESH SHOP')}</button>
                <button type="button" className="seg-btn" onClick={() => run("lock")}>{t('LOCK / UNLOCK SHOP')}</button>
              </div>
            </div>
          )}

          {tab === "match" && (
            <div className="space-y-4">
              <section aria-label={t("Battle speed")}>
                <h3 className="label mb-1.5 text-[7.5px] text-[#56DCA8]">{t('Battle speed (tap = apply now)')}</h3>
                <div className="seg" role="group" aria-label={t("SPEED")}>
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-on={(snapshot.speed ?? 1) === s ? 1 : 0}
                      onClick={() => run(`speed ${s}`)}
                      className="seg-btn"
                      aria-pressed={(snapshot.speed ?? 1) === s}
                    >
                      <span className="font-pixel text-[11px]">{s}×</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className="seg-btn" onClick={() => run("win")}>{t('FORCE WIN')}</button>
                <button type="button" className="seg-btn" onClick={() => run("lose")}>{t('FORCE LOSE')}</button>
              </div>

              <button type="button" className="big-action" onClick={() => run("next")}>
                <IconPlay size={12} />
                {snapshot.phase === "prep" ? t("ENGAGE / START BATTLE") : t("NEXT / CONTINUE")}
              </button>

              <button
                type="button"
                className="big-action warn"
                onClick={() => {
                  if (!confirmReset) {
                    setConfirmReset(true);
                    return;
                  }
                  setConfirmReset(false);
                  run("reset");
                }}
              >
                {confirmReset ? t("TAP AGAIN TO RESET THE MATCH") : t("RESET MATCH")}
              </button>

              <button type="button" className="seg-btn w-full" onClick={() => run("status")}>
                {t('PRINT MATCH STATUS')}
              </button>
            </div>
          )}

          {/* Result toast + log */}
          <div className="mt-4 border border-[#1F7A5A]/60 bg-[#0A1A13] px-2.5 py-2 font-mono text-[10.5px] leading-snug text-[#C9E8D8]" aria-live="polite">
            {t(lastResult)}
          </div>
          <div ref={logRef} className="mt-2 max-h-32 overflow-y-auto border border-[#3B322A] bg-black/45 p-2.5">
            <div className="label mb-1.5 text-[7px] text-[#7B6E5F]">{t('History')}</div>
            <div className="space-y-1.5">
              {entries.map((entry, i) => (
                <div key={`${i}-${entry.command}`} className="font-mono text-[9.5px] leading-snug">
                  <span className="text-[#F0A93B]">&gt; {entry.command}</span>{" "}
                  <span className="text-[#9C8F7E]">{t(entry.result)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Advanced: typed commands */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="mt-3 min-h-[44px] w-full border border-[#2D231B] bg-[#0D0907] label text-[7.5px] text-[#8C7E6E]"
          >
            {showAdvanced ? t("▾ HIDE ADVANCED (TYPED COMMANDS)") : t("▸ ADVANCED — TYPE COMMANDS")}
          </button>
          {showAdvanced && (
            <div className="border border-t-0 border-[#2D231B] bg-[#0D0907] p-2.5">
              <ul className="space-y-0.5 font-mono text-[9.5px] leading-snug text-[#9C8F7E]">
                {COMMAND_HELP.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          )}
        </div>

        {showAdvanced && (
          <form
            className="safe-b flex gap-2 border-t border-[#4A3828] bg-[#17110C] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(input);
            }}
          >
            <label className="sr-only" htmlFor="admin-command-input">{t("Admin command")}</label>
            <input
              id="admin-command-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("Type a command — e.g. give dragonfly 3")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-h-[48px] min-w-0 flex-1 border border-[#4A3828] bg-black/55 px-3 font-mono text-[12px] text-[#FFF3DC] outline-none placeholder:text-[#6B5F52] focus:border-[#F0A93B]"
            />
            <button
              type="submit"
              className="flex min-h-[48px] shrink-0 items-center gap-2 border-2 border-[#56DCA8] bg-[#1F7A5A] px-4 font-pixel text-[9px] text-[#04130D] active:translate-y-[1px]"
            >
              <IconPlay size={11} />
              <span>{t('RUN')}</span>
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
