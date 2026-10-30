import { useCallback, useEffect, useRef, useState } from "react";

/* ── UI DOCTOR — mobile interface diagnostic overlay ──────────────
   Finds the four classic causes of an "unresponsive" phone UI:
   1. TAP     — controls smaller than a fingertip (<40px, hard-fail <32px)
   2. COVERED — buttons whose center point is stolen by another element,
                so the tap lands somewhere else entirely
   3. CLIPPED — visible controls hanging past the viewport edge
   4. JANK    — dropped frames / frozen main thread (the other "lag")
   Plus a live FPS + worst-frame meter while the doctor is open.

   Toggle from SETTINGS → UI DOCTOR, or open any screen with ?doctor=1.
   The AUDIT scan is plain DOM — it measures what actually rendered,
   so it works identically on title, prep, battle, and modals. */

const LS_KEY = "sb-doctor";

interface Issue {
  n: number;
  kind: "TAP" | "COVERED" | "CLIPPED";
  hard: boolean;
  el: HTMLElement;
  label: string;
  detail: string;
  mx: number; // marker chip position (viewport px, clamped)
  my: number;
}

const readEnabled = () =>
  new URLSearchParams(window.location.search).get("doctor") === "1" ||
  localStorage.getItem(LS_KEY) === "1";

export function UiDoctor() {
  const [on, setOn] = useState(readEnabled);
  const [pos0] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem("sb-doctor-xy");
      return raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [perf, setPerf] = useState({ fps: 0, worst: 0, janks: 0 });
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState("");
  const [flash, setFlash] = useState<{ x: number; y: number; w: number; h: number; k: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(pos0);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const seq = useRef(0);
  const raf = useRef(0);
  const lastT = useRef(0);
  const worstMs = useRef(0);
  const janks = useRef(0);
  const frames = useRef(0);
  const fpsWin = useRef(0);

  /* settings-modal toggle (custom event, same pattern as sb-potato) */
  useEffect(() => {
    const h = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener("sb-doctor", h);
    return () => window.removeEventListener("sb-doctor", h);
  }, []);

  /* FPS / jank meter — plain rAF deltas, works on every mobile browser */
  useEffect(() => {
    if (!on) return;
    lastT.current = performance.now();
    const loop = (now: number) => {
      const dt = now - lastT.current;
      lastT.current = now;
      frames.current += 1;
      fpsWin.current += dt;
      if (dt > worstMs.current && dt < 5000) worstMs.current = dt;
      if (dt > 100) janks.current += 1;
      if (fpsWin.current >= 1000) {
        setPerf({ fps: Math.round((frames.current * 1000) / fpsWin.current), worst: Math.round(worstMs.current), janks: janks.current });
        frames.current = 0;
        fpsWin.current = 0;
        if (worstMs.current > 400) worstMs.current = 0; // decay: one tab-switch shouldn't stick forever
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [on]);

  const runAudit = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const found: Issue[] = [];
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input, select, textarea"),
    );
    seq.current += 1;
    let n = 1;
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      if (el.closest("[data-ui-doctor]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const name =
        (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34) ||
        el.tagName.toLowerCase();
      const cls = `.${String(el.className).trim().split(/\s+/).slice(0, 2).join(".")}`;
      const at = ` @ (${Math.round(Math.max(0, r.left))},${Math.round(Math.max(0, r.top))})`;
      const mx = Math.min(vw - 30, Math.max(2, r.left));
      const my = Math.min(vh - 30, Math.max(2, r.top));

      // 1) COVERED — the tap point is captured by a different element.
      //    Full-width coverers are annotated as sticky bars (intentional
      //    overlays like the bottom CTA still get reported, just softer).
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !hit.closest("[data-ui-doctor]")) {
        const hr = hit.getBoundingClientRect();
        const sticky = hr.width >= vw * 0.9 && hr.height < vh * 0.3;
        const hc = `.${String(hit.className).trim().split(/\s+/)[0] ?? ""}`;
        found.push({
          n: n++,
          kind: "COVERED",
          hard: !sticky,
          el,
          label: name,
          detail: `${cls} — center stolen by ${hit.tagName.toLowerCase()}${hc}${sticky ? " (full-width bar — sticky CTA?)" : ""}${at}`,
          mx,
          my,
        });
        continue;
      }
      // 2) TAP — smaller than a comfortable fingertip. Controls wearing the
      //    hit-expansion classes (.hit-y / .hit-24) get their invisible
      //    ::after padding credited — their TOUCH zone is what matters.
      const ex = el.classList.contains("hit-24") ? 16 : el.classList.contains("hit-y") ? 14 : 0;
      const m = Math.min(r.width, r.height) + ex;
      if (m < 40) {
        found.push({ n: n++, kind: "TAP", hard: m < 32, el, label: name, detail: `${cls} — ${Math.round(r.width)}×${Math.round(r.height)}${ex ? ` (+${ex} hit)` : ""}${at}`, mx, my });
        continue;
      }
      // 3) CLIPPED — hangs past the viewport edge. Vertical overhang on a
      //    normally-scrolling page is NOT a cut (the title screen scrolls);
      //    only flag it when the page is locked (100dvh game screens).
      const hOver = r.right > vw + 1 || r.left < -1;
      const vOver = r.bottom > vh + 1 || r.top < -1;
      // a vertical overhang is only a real cut when NO ancestor can scroll
      // the element into view (scrollable panels make bottom-overhang normal)
      const rootScrolls = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > vh + 2;
      const revealable = rootScrolls || (() => {
        let node: HTMLElement | null = el.parentElement;
        for (let i = 0; node && i < 14; i++) {
          const oy = getComputedStyle(node).overflowY;
          if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 2) return true;
          node = node.parentElement;
        }
        return false;
      })();
      if (hOver || (vOver && !revealable)) {
        found.push({ n: n++, kind: "CLIPPED", hard: false, el, label: name, detail: `${cls} — ${Math.round(r.width)}×${Math.round(r.height)} past edge${at}`, mx, my });
      }
    }
    found.sort((a, b) => Number(b.hard) - Number(a.hard) || a.kind.localeCompare(b.kind));
    setIssues(found);
    setCopied(false);
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    const pageOver = document.documentElement.scrollWidth > vw + 1;
    const head = `UI DOCTOR ${vw}×${vh} @dpr${dpr} · ${perf.fps}fps · worst frame ${perf.worst}ms · ${janks.current} janks · ${found.length} issues${pageOver ? " · PAGE OVERFLOW (sideways scroll!)" : ""}`;
    const body = found
      .map((f) => `[${f.hard ? "RED" : "AMBER"}] ${f.kind} ${f.label} — ${f.detail}`)
      .join("\n");
    setReport(`${head}\n${body || "no issues"}`);
  }, [perf.fps, perf.worst]);

  /* drag handler for the HUD pill — it floats over the game, so the player
     must be able to move it off any control it covers (position persists) */
  useEffect(() => {
    if (!on) return;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const x = Math.min(window.innerWidth - 60, Math.max(2, e.clientX - drag.current.dx));
      const y = Math.min(window.innerHeight - 30, Math.max(2, e.clientY - drag.current.dy));
      setPos({ x, y });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setPos((p) => {
        if (p) { try { localStorage.setItem("sb-doctor-xy", JSON.stringify(p)); } catch { /* ignore */ } }
        return p;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [on]);

  const flashEl = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setFlash({ x: r.left, y: r.top, w: r.width, h: r.height, k: seq.current * 1000 + Math.floor(Math.random() * 999) });
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, []);

  const copyReport = useCallback(() => {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(report).then(done).catch(done);
    } else {
      const ta = document.createElement("textarea");
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* clipboard blocked */ }
      ta.remove();
      done();
    }
  }, [report]);

  if (!on) return null;

  const reds = issues.filter((f) => f.hard).length;
  const ambers = issues.length - reds;

  return (
    <div data-ui-doctor className="pointer-events-none fixed inset-0 z-[300]">
      {/* element markers */}
      {issues.map((f) => (
        <button
          key={f.n}
          onPointerDown={(e) => {
            e.preventDefault();
            flashEl(f.el);
          }}
          className="pointer-events-auto absolute grid h-[22px] w-[22px] place-items-center rounded-full border font-mono text-[10px] font-bold shadow-[0_2px_6px_rgba(0,0,0,.7)]"
          style={{
            left: f.mx,
            top: f.my,
            background: f.hard ? "#C2271A" : "#C9812A",
            borderColor: "#FFE2D6",
            color: "#FFF3DC",
          }}
          aria-label={`Issue ${f.n}: ${f.kind} ${f.label}`}
        >
          {f.n}
        </button>
      ))}
      {flash && (
        <span
          key={flash.k}
          className="pointer-events-none absolute border-2 border-[#75D9E8] bg-[#75D9E8]/20"
          style={{ left: flash.x, top: flash.y, width: flash.w, height: flash.h, animation: "uiDocFlash 1.2ms 3 alternate" }}
        />
      )}

      {/* Collapsed badge: a tiny draggable dot parked mid-left where it can
          never cover a full-width CTA. Tap to expand the full HUD. */}
      {!expanded && (
        <button
          aria-label="UI Doctor — tap to open"
          className="pointer-events-auto absolute grid h-[34px] w-[34px] touch-none place-items-center rounded-full border-2 font-mono text-[10px] font-bold shadow-[0_4px_14px_rgba(0,0,0,.8)]"
          style={{
            left: pos ? pos.x : 4,
            top: pos ? pos.y : "46%",
            background: reds ? "#C2271A" : ambers ? "#C9812A" : "#124D38",
            borderColor: "#FFE2D6",
            color: "#FFF3DC",
          }}
          onPointerDown={(e) => {
            const badgeEl = e.currentTarget as HTMLElement;
            const startY = typeof pos?.y === "number" ? pos.y : badgeEl.getBoundingClientRect().top;
            drag.current = { dx: e.clientX - (pos ? pos.x : 4), dy: e.clientY - startY };
            const startX = e.clientX;
            let moved = false;
            const move = (ev: PointerEvent) => {
              if (Math.abs(ev.clientX - startX) > 6 || Math.abs(ev.clientY - startY) > 6) moved = true;
              if (!drag.current) return;
              const x = Math.min(window.innerWidth - 38, Math.max(2, ev.clientX - drag.current.dx));
              const y = Math.min(window.innerHeight - 38, Math.max(2, ev.clientY - drag.current.dy));
              setPos({ x, y });
            };
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
              if (!moved) setExpanded(true);
              setPos((p) => {
                if (p) { try { localStorage.setItem("sb-doctor-xy", JSON.stringify(p)); } catch { /* ignore */ } }
                return p;
              });
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          {issues.length}
        </button>
      )}

      {/* HUD pill + panel (draggable — grab the pill bar and move it) */}
      <div
        hidden={!expanded}
        className="pointer-events-auto absolute left-2 max-w-[min(94vw,360px)]"
        style={pos ? { left: pos.x, top: pos.y, bottom: "auto" } : { bottom: "max(88px, calc(env(safe-area-inset-bottom) + 84px))" }}
      >
        {open && (
          <div className="mb-1.5 max-h-[42dvh] overflow-y-auto border-2 border-[#4A3828] bg-[#0D0A08]/97 p-2 font-mono text-[9.5px] leading-snug text-[#EDE2CB] shadow-[0_10px_30px_rgba(0,0,0,.85)] backdrop-blur-[2px]">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="label text-[7.5px] text-[#75D9E8]">UI DOCTOR REPORT</span>
              <span className="flex gap-1">
                <button onClick={copyReport} className="border border-[#4A3828] bg-[#17110C] px-1.5 py-0.5 label text-[7px] text-[#F0A93B] min-h-[26px]">
                  {copied ? "COPIED" : "COPY"}
                </button>
                <button onClick={() => setOpen(false)} className="border border-[#4A3828] bg-[#17110C] px-1.5 py-0.5 label text-[7px] min-h-[26px]">
                  ✕
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  title="Minimize to the corner badge"
                  className="border border-[#4A3828] bg-[#17110C] px-1.5 py-0.5 label text-[7px] min-h-[26px]"
                >
                  —
                </button>
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-[9px] text-[#C9BCA6]">{report || "tap SCAN to audit this screen"}</pre>
          </div>
        )}
        <div
          className="flex touch-none items-center gap-1 border border-[#4A3828] bg-[#0D0A08]/95 px-1.5 py-1 shadow-[0_6px_18px_rgba(0,0,0,.8)] backdrop-blur-[2px]"
          onPointerDown={(e) => {
            const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
            drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
          }}
          title="Drag to move the doctor HUD"
        >
          <span className="font-mono text-[10px] font-bold" style={{ color: perf.fps >= 50 ? "#56DCA8" : perf.fps >= 30 ? "#F0A93B" : "#F05A36" }}>
            {perf.fps}
            <span className="text-[7px] text-[#8C7E6E]">fps</span>
          </span>
          <span className="font-mono text-[9px] text-[#8C7E6E]" title="worst frame this second / total jank frames">
            {perf.worst}ms · {perf.janks}🌀
          </span>
          <span
            className="rounded-full px-1.5 font-mono text-[9.5px] font-bold"
            style={{ background: reds ? "#C2271A" : ambers ? "#C9812A" : "#1F7A5A", color: "#FFF3DC" }}
          >
            {issues.length}
          </span>
          <button onClick={runAudit} className="border border-[#F0A93B] bg-[#241B14] px-2 py-1 label text-[7.5px] text-[#F0A93B] min-h-[30px]" title="Scan every tappable control on this screen">
            SCAN
          </button>
          <button
            onClick={() => {
              setOpen((v) => !v);
              if (!open && !issues.length) runAudit();
            }}
            className="border border-[#4A3828] bg-[#17110C] px-1.5 py-1 label text-[7.5px] text-[#EDE2CB] min-h-[30px]"
            title="Issue list + report"
          >
            ≡
          </button>
        </div>
      </div>
      <style>{`@keyframes uiDocFlash { from { opacity: 1; } to { opacity: .1; } }`}</style>
    </div>
  );
}
