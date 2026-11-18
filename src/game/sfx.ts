// ─────────────────────────────────────────────────────────────
// SMART BUGS — sound (v0.8)
//
// The game shipped silent. Everything here is synthesised with WebAudio at
// play time: no audio files, so the single-file build stays single-file and
// nothing is fetched.
//
// Rules:
//  · No AudioContext exists until the player's first tap/keypress (browser
//    autoplay policy), and nothing plays while the tab is hidden.
//  · Every cue is rate-limited by name and the whole mix is voice-capped, so
//    a 6v6 at 3× speed cannot turn into a wall of noise.
//  · The on/off switch and volume persist in localStorage.
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from "react";

export type SfxName =
  | "click" | "select" | "buy" | "sell" | "reroll" | "lock" | "levelup" | "merge"
  | "deny" | "deploy" | "bond" | "engage"
  | "hit" | "shell" | "skill" | "heavy" | "ko" | "heal"
  | "win" | "lose" | "champion" | "eliminated";

export interface SfxSettings {
  enabled: boolean;
  /** 0..1 */
  volume: number;
}

const KEY = "smartbugs.sfx";
const DEFAULTS: SfxSettings = { enabled: true, volume: 0.6 };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function load(): SfxSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw.enabled === "boolean" && typeof raw.volume === "number" && Number.isFinite(raw.volume)) {
      return { enabled: raw.enabled, volume: clamp01(raw.volume) };
    }
  } catch { /* storage blocked or corrupt — use defaults */ }
  return DEFAULTS;
}

let settings: SfxSettings = typeof localStorage === "undefined" ? DEFAULTS : load();
const listeners = new Set<() => void>();

/** Headroom so stacked voices never clip before the compressor. */
const MASTER = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let unlocked = false;
let voices = 0;
let lastAny = -1e9;
const lastByName: Partial<Record<SfxName, number>> = {};

const MAX_VOICES = 22;

function commit(next: SfxSettings) {
  settings = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  if (ctx && master) master.gain.setTargetAtTime(next.enabled ? next.volume * MASTER : 0, ctx.currentTime, 0.02);
  listeners.forEach((l) => l());
}

export const getSfxSettings = (): SfxSettings => settings;
export const setSfxEnabled = (enabled: boolean) => commit({ ...settings, enabled });
export const setSfxVolume = (volume: number) => commit({ ...settings, volume: clamp01(volume) });
export function subscribeSfx(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React binding for the Settings sheet. */
export function useSfxSettings(): SfxSettings {
  return useSyncExternalStore(subscribeSfx, getSfxSettings, getSfxSettings);
}

// The first real gesture is what lets a browser start audio.
if (typeof window !== "undefined") {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function audio(): AudioContext | null {
  if (!settings.enabled || !unlocked || typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = settings.volume * MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => { /* still locked */ });
  return ctx;
}

function getNoise(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface ToneOpts {
  type: OscillatorType;
  f: number;
  /** glide target frequency */
  to?: number;
  /** start offset, seconds */
  t?: number;
  dur: number;
  gain: number;
  attack?: number;
}

function tone(ac: AudioContext, o: ToneOpts) {
  if (!master) return;
  const t0 = ac.currentTime + (o.t ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(master);
  voices++;
  osc.onended = () => { voices = Math.max(0, voices - 1); osc.disconnect(); g.disconnect(); };
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

interface NoiseOpts {
  t?: number;
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  attack?: number;
}

function noise(ac: AudioContext, o: NoiseOpts) {
  if (!master) return;
  const t0 = ac.currentTime + (o.t ?? 0);
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.setValueAtTime(o.f, t0);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + o.dur);
  filter.Q.value = o.q ?? 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  voices++;
  src.onended = () => { voices = Math.max(0, voices - 1); src.disconnect(); filter.disconnect(); g.disconnect(); };
  // a random offset keeps repeated hits from sounding like one sample
  src.start(t0, Math.random() * 0.6, o.dur + 0.03);
}

/** Small random detune so repeated cues do not sound machine-stamped. */
const vary = (f: number, spread = 0.06) => f * (1 + (Math.random() * 2 - 1) * spread);

/** A run of notes, `step` seconds apart. */
function arp(ac: AudioContext, notes: number[], step: number, type: OscillatorType, gain: number, dur = 0.16) {
  notes.forEach((f, i) => tone(ac, { type, f, t: i * step, dur, gain }));
}

const RECIPES: Record<SfxName, (ac: AudioContext) => void> = {
  click: (ac) => tone(ac, { type: "square", f: 620, to: 480, dur: 0.035, gain: 0.035 }),
  select: (ac) => tone(ac, { type: "triangle", f: 520, to: 700, dur: 0.06, gain: 0.07 }),
  buy: (ac) => {
    tone(ac, { type: "triangle", f: 880, dur: 0.07, gain: 0.11 });
    tone(ac, { type: "triangle", f: 1318, t: 0.055, dur: 0.14, gain: 0.11 });
  },
  sell: (ac) => {
    tone(ac, { type: "triangle", f: 1175, dur: 0.07, gain: 0.1 });
    tone(ac, { type: "triangle", f: 784, t: 0.055, dur: 0.14, gain: 0.1 });
  },
  reroll: (ac) => {
    noise(ac, { dur: 0.16, gain: 0.07, filter: "bandpass", f: 900, to: 3200, q: 1.4 });
    for (let i = 0; i < 4; i++) tone(ac, { type: "square", f: vary(700 + i * 90), t: i * 0.035, dur: 0.03, gain: 0.03 });
  },
  lock: (ac) => {
    tone(ac, { type: "square", f: 950, dur: 0.03, gain: 0.05 });
    tone(ac, { type: "square", f: 560, t: 0.05, dur: 0.05, gain: 0.06 });
  },
  levelup: (ac) => arp(ac, [392, 523, 659], 0.06, "triangle", 0.1),
  merge: (ac) => {
    arp(ac, [523, 659, 784, 1047], 0.065, "triangle", 0.12, 0.2);
    tone(ac, { type: "sine", f: 2093, t: 0.26, dur: 0.32, gain: 0.06 });
    noise(ac, { t: 0.24, dur: 0.3, gain: 0.03, filter: "highpass", f: 5200 });
  },
  deny: (ac) => {
    tone(ac, { type: "square", f: 190, to: 150, dur: 0.09, gain: 0.07 });
    tone(ac, { type: "square", f: 150, to: 120, t: 0.1, dur: 0.11, gain: 0.07 });
  },
  deploy: (ac) => {
    tone(ac, { type: "sine", f: 260, to: 130, dur: 0.11, gain: 0.16 });
    noise(ac, { dur: 0.07, gain: 0.06, filter: "lowpass", f: 900 });
  },
  bond: (ac) => {
    arp(ac, [440, 554, 659], 0.05, "sine", 0.1, 0.22);
    tone(ac, { type: "triangle", f: 880, t: 0.16, dur: 0.3, gain: 0.08 });
  },
  engage: (ac) => {
    tone(ac, { type: "sawtooth", f: 98, to: 147, dur: 0.5, gain: 0.1, attack: 0.05 });
    tone(ac, { type: "sawtooth", f: 147, to: 196, t: 0.02, dur: 0.5, gain: 0.07, attack: 0.05 });
    noise(ac, { dur: 0.5, gain: 0.05, filter: "lowpass", f: 300, to: 1800, attack: 0.2 });
  },
  hit: (ac) => {
    noise(ac, { dur: 0.05, gain: 0.07, filter: "bandpass", f: vary(1700, 0.25), q: 1.1 });
    tone(ac, { type: "triangle", f: vary(210, 0.15), to: 95, dur: 0.06, gain: 0.07 });
  },
  shell: (ac) => {
    noise(ac, { dur: 0.2, gain: 0.12, filter: "lowpass", f: 1400, to: 220 });
    tone(ac, { type: "sine", f: vary(120, 0.1), to: 50, dur: 0.2, gain: 0.14 });
  },
  skill: (ac) => {
    tone(ac, { type: "sawtooth", f: vary(330, 0.1), to: 990, dur: 0.16, gain: 0.05 });
    noise(ac, { dur: 0.14, gain: 0.05, filter: "bandpass", f: 1200, to: 4200, q: 2 });
  },
  heavy: (ac) => {
    tone(ac, { type: "sawtooth", f: 82, to: 38, dur: 0.55, gain: 0.16, attack: 0.02 });
    tone(ac, { type: "square", f: 61, to: 33, dur: 0.5, gain: 0.07, attack: 0.02 });
    noise(ac, { dur: 0.45, gain: 0.11, filter: "lowpass", f: 900, to: 140 });
  },
  ko: (ac) => {
    tone(ac, { type: "triangle", f: vary(330, 0.08), to: 62, dur: 0.26, gain: 0.12 });
    noise(ac, { dur: 0.12, gain: 0.05, filter: "lowpass", f: 700 });
  },
  heal: (ac) => {
    tone(ac, { type: "sine", f: 660, dur: 0.12, gain: 0.07 });
    tone(ac, { type: "sine", f: 990, t: 0.08, dur: 0.18, gain: 0.06 });
  },
  win: (ac) => {
    arp(ac, [523, 659, 784], 0.09, "triangle", 0.12, 0.2);
    tone(ac, { type: "triangle", f: 1047, t: 0.27, dur: 0.42, gain: 0.13 });
    tone(ac, { type: "sine", f: 523, t: 0.27, dur: 0.42, gain: 0.07 });
  },
  lose: (ac) => {
    arp(ac, [392, 330, 262], 0.13, "triangle", 0.11, 0.24);
    tone(ac, { type: "sawtooth", f: 196, to: 98, t: 0.39, dur: 0.5, gain: 0.07, attack: 0.03 });
  },
  champion: (ac) => {
    arp(ac, [523, 659, 784, 1047, 784, 1047], 0.11, "triangle", 0.12, 0.22);
    tone(ac, { type: "triangle", f: 1319, t: 0.66, dur: 0.8, gain: 0.13 });
    tone(ac, { type: "sine", f: 659, t: 0.66, dur: 0.8, gain: 0.08 });
    tone(ac, { type: "sine", f: 523, t: 0.66, dur: 0.8, gain: 0.07 });
    noise(ac, { t: 0.66, dur: 0.7, gain: 0.03, filter: "highpass", f: 5000 });
  },
  eliminated: (ac) => {
    arp(ac, [294, 262, 220, 165], 0.16, "triangle", 0.11, 0.3);
    tone(ac, { type: "sawtooth", f: 110, to: 49, t: 0.6, dur: 0.8, gain: 0.08, attack: 0.04 });
  },
};

/** Minimum milliseconds between two plays of the same cue. */
const GAP: Partial<Record<SfxName, number>> = {
  hit: 70, shell: 90, skill: 110, heavy: 220, ko: 100, heal: 160, click: 40, select: 40, deploy: 50,
};
/** Cues that must be heard even when the mix is full. */
const PRIORITY = new Set<SfxName>(["win", "lose", "champion", "eliminated", "heavy", "merge", "engage"]);

export function playSfx(name: SfxName): void {
  if (typeof document !== "undefined" && document.hidden) return;
  const ac = audio();
  if (!ac || !master) return;
  const now = performance.now();
  if (now - (lastByName[name] ?? -1e9) < (GAP[name] ?? 25)) return;
  if (voices >= MAX_VOICES && !PRIORITY.has(name)) return;
  lastByName[name] = now;
  lastAny = now;
  try { RECIPES[name](ac); } catch { /* a failed cue must never break the game */ }
}

/** Lets the generic button tick stay quiet when an action already made a sound. */
export const msSinceLastSfx = (): number => performance.now() - lastAny;

/** Battle pop-up → cue. Kept here so the engine stays free of audio. */
export function sfxForPop(kind: "dmg" | "heal" | "skill" | "ko", text: string): SfxName {
  if (kind === "ko") return "ko";
  if (kind === "heal") return "heal";
  if (kind === "skill") {
    if (text === "ROAR!" || text === "TOUCHDOWN" || text === "AIRSTRIKE") return "heavy";
    if (text === "BURST" || text === "TRAP!" || text === "SNARED!") return "shell";
    return "skill";
  }
  return "hit";
}
