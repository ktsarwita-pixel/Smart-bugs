import { useCallback, useEffect, useRef, useState } from "react";
import { isAdvancedGameLocation } from "../game/build-mode";
import { auditVisuals, watchVisuals, monitorVisuals, visualHistory, clearVisualHistory, type VisualFinding } from "../game/ui-visual-audit";

/* Opt-in, non-destructive diagnostics: never click the game's controls.
   Scroll findings describe navigation, not necessarily a defect. */
type Kind = "TAP" | "COVERED" | "INTERACTION" | "CLIPPED" | "OVERFLOW" | "BORDER" | "SCROLL" | VisualFinding["kind"];
type Issue = { id: number; kind: Kind; severity: "high" | "warning"; label: string; detail: string; el: HTMLElement | null; x: number; y: number };
type Scan = { issues: Issue[]; width: number; height: number; checked: number; visualChecked: number; deep: boolean; time: string; render: string | null };
const KEY = "sb-doctor";
const initiallyEnabled = () => {
  try { const stored = localStorage.getItem(KEY); return stored === "1" || (stored !== "0" && new URLSearchParams(location.search).get("doctor") === "1"); }
  catch { return new URLSearchParams(location.search).get("doctor") === "1"; }
};
const labelFor = (el: HTMLElement) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.tagName)
  .trim().replace(/\s+/g, " ").slice(0, 60);
const selectorFor = (el: Element) => {
  const classes = Array.from(el.classList).slice(0, 2).map(c => `.${c}`).join("");
  return `${el.tagName.toLowerCase()}${classes}`;
};

const activeDialog = () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
  .filter(el => !el.closest('[data-ui-doctor]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible").at(-1);
const visualScope = () => activeDialog() ?? document.body;

function audit(): Scan {
  const width = window.innerWidth, height = window.innerHeight;
  const issues: Issue[] = [];
  let checked = 0;
  const add = (kind: Kind, severity: Issue["severity"], label: string, detail: string, el: HTMLElement | null, x = 4, y = 4) => {
    issues.push({ id: issues.length + 1, kind, severity, label, detail, el, x: Math.min(width - 24, Math.max(2, x)), y: Math.min(height - 24, Math.max(2, y)) });
  };
  const docWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
  if (docWidth > width + 1) add("OVERFLOW", "high", "Page extends horizontally", `${docWidth}px content in a ${width}px viewport`, document.documentElement);
  const activeModal = activeDialog();
  const elements = document.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input:not([type='hidden']), select, textarea, summary");
  const activeElements = Array.from(elements).filter(el => (!activeModal || activeModal.contains(el)) && !el.closest("[data-ui-doctor], [inert], [aria-hidden='true']") && !el.matches(":disabled, [aria-disabled='true']"));
  // Report real scroll ranges separately from faults. Many small screens
  // intentionally scroll; the report says how far, rather than calling every
  // off-screen button broken. Respect active dialogs and exclude the Doctor.
  const root = document.scrollingElement as HTMLElement | null;
  const docHeight = Math.max(root?.scrollHeight || 0, document.body?.scrollHeight || 0);
  if (!activeModal && docHeight > height + 2) {
    const outside = activeElements.reduce((counts, el) => {
      const style = getComputedStyle(el), r = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0 || r.width < 2 || r.height < 2) return counts;
      if (r.top >= height) counts.below++;
      else if (r.top < height && r.bottom > height + 1) counts.partial++;
      return counts;
    }, { below: 0, partial: 0 });
    add("SCROLL", "warning", "Page requires vertical scrolling", `${Math.round(docHeight - height)}px scroll range; ${outside.below} enabled controls fully below and ${outside.partial} partly below the viewport. Scrolling may be intentional.`, root);
  }
  const scope = activeModal ?? document.body;
  const scrollables = [scope, ...Array.from(scope.querySelectorAll<HTMLElement>("*"))];
  let scrollCount = 0;
  for (const el of scrollables) {
    if (el === root || el === document.body || el.closest("[data-ui-doctor], [inert], [aria-hidden='true']")) continue;
    const style = getComputedStyle(el), r = el.getBoundingClientRect();
    if (style.display === "none" || style.visibility !== "visible" || r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= height || r.left >= width) continue;
    const x = /(auto|scroll)/.test(style.overflowX) ? Math.max(0, el.scrollWidth - el.clientWidth) : 0;
    const y = /(auto|scroll)/.test(style.overflowY) ? Math.max(0, el.scrollHeight - el.clientHeight) : 0;
    if (x <= 2 && y <= 2) continue;
    if (++scrollCount > 12) continue;
    const directions = [x > 2 ? `horizontal ${Math.round(x)}px` : "", y > 2 ? `vertical ${Math.round(y)}px` : ""].filter(Boolean).join(" · ");
    const controls = activeElements.filter(control => el.contains(control)).length;
    add("SCROLL", "warning", `${el.getAttribute("aria-label") || el.getAttribute("title") || selectorFor(el)} scroll area`, `${selectorFor(el)}: ${directions} scroll range; ${controls} enabled controls inside. Scrolling may be intentional.`, el, r.left, r.top);
  }
  if (scrollCount > 12) add("SCROLL", "warning", "Additional scroll areas", `${scrollCount - 12} more visible scroll areas omitted.`, null);
  // Inspect layout containers as well as controls. A clipped panel can keep
  // every button tappable while its frame or heading is visibly cut off.
  const boundarySelector = '[data-ui-boundary], [role="dialog"], main, header, footer, nav, .battle-main, .game-dock, .deck, .deck-row, .action-bar, .selected-actions, .bench-section, .shop-section, .round-track, .shop-grid, .ladder-strip, .result-card, .fight-banner';
  const boundaries = [scope, ...Array.from(scope.querySelectorAll<HTMLElement>(boundarySelector))];
  const edgeReported = new Set<HTMLElement>();
  const inHorizontalScroller = (el: HTMLElement) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (/(auto|scroll)/.test(ps.overflowX) && p.scrollWidth > p.clientWidth + 2) return true;
    }
    return false;
  };
  for (const el of boundaries) {
    if (!(el instanceof HTMLElement) || el.closest('[data-ui-doctor], [inert], [aria-hidden="true"]')) continue;
    const st = getComputedStyle(el), r = el.getBoundingClientRect();
    if (st.display === "none" || st.visibility !== "visible" || r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= height || r.right <= 0 || r.left >= width) continue;
    if (!inHorizontalScroller(el) && (r.left < -1 || r.right > width + 1)) {
      add("OVERFLOW", "warning", el.getAttribute('aria-label') || selectorFor(el), `${selectorFor(el)}: panel extends ${Math.round(Math.max(0,-r.left))}px left and ${Math.round(Math.max(0,r.right-width))}px right of the viewport`, el, r.left, r.top);
      edgeReported.add(el);
    }
    const hiddenX = /(hidden|clip)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 2;
    if (hiddenX && el.hasAttribute('data-ui-boundary')) {
      add("OVERFLOW", "warning", el.getAttribute('aria-label') || selectorFor(el), `${selectorFor(el)}: ${Math.round(el.scrollWidth-el.clientWidth)}px of content clipped horizontally by the panel`, el, r.left, r.top);
      edgeReported.add(el);
    }
  }
  // Border audit is deliberately independent of controls. It catches the
  // failure class the original Doctor missed: a card can be interactive and
  // have no document overflow while its actual border sits beyond the screen.
  let borderFindings = 0;
  for (const node of [scope, ...Array.from(scope.querySelectorAll<HTMLElement>("*"))]) {
    if (!(node instanceof HTMLElement) || edgeReported.has(node) || node.closest('[data-ui-doctor], [inert], [aria-hidden="true"]')) continue;
    const st = getComputedStyle(node), r = node.getBoundingClientRect();
    if (st.display === "none" || st.visibility !== "visible" || Number(st.opacity) === 0 || r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= height || r.right <= 0 || r.left >= width) continue;
    const widths = [st.borderTopWidth, st.borderRightWidth, st.borderBottomWidth, st.borderLeftWidth].map(v => Number.parseFloat(v) || 0);
    const outline = st.outlineStyle !== "none" ? Number.parseFloat(st.outlineWidth) || 0 : 0;
    const thick = Math.max(...widths, outline);
    if (thick <= 0) continue;
    const visualLeft = r.left - outline, visualRight = r.right + outline;
    const visualTop = r.top - outline, visualBottom = r.bottom + outline;
    let clippedBy: HTMLElement | null = null;
    for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p), pr = p.getBoundingClientRect();
      const clipsX = /(hidden|clip)/.test(ps.overflowX) && (visualLeft < pr.left - 1 || visualRight > pr.right + 1);
      const clipsY = /(hidden|clip)/.test(ps.overflowY) && (visualTop < pr.top - 1 || visualBottom > pr.bottom + 1);
      if (clipsX || clipsY) { clippedBy = p; break; }
    }
    const fixedVerticalMiss = (st.position === "fixed" || node.getAttribute("role") === "dialog") && (visualTop < -1 || visualBottom > height + 1);
    if (clippedBy) {
      if (borderFindings++ < 12) add("BORDER", "warning", node.getAttribute("aria-label") || labelFor(node) || selectorFor(node), `${selectorFor(node)}: border is clipped by ${selectorFor(clippedBy)}`, node, r.left, r.top);
      edgeReported.add(node);
    } else if ((!inHorizontalScroller(node) && (visualLeft < -1 || visualRight > width + 1)) || fixedVerticalMiss) {
      if (borderFindings++ < 12) add("BORDER", "warning", node.getAttribute("aria-label") || labelFor(node) || selectorFor(node), `${selectorFor(node)}: visible border extends outside the viewport`, node, r.left, r.top);
      edgeReported.add(node);
    } else if (thick >= 8 && Math.min(r.width, r.height) >= 20) {
      if (borderFindings++ < 12) add("BORDER", "warning", node.getAttribute("aria-label") || labelFor(node) || selectorFor(node), `${selectorFor(node)}: ${Math.round(thick)}px border/outline is unusually heavy`, node, r.left, r.top);
    }
  }
  for (const el of activeElements) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === "none" || cs.visibility !== "visible" || Number(cs.opacity) === 0 || r.width < 2 || r.height < 2) continue;
    // Report partially or fully cut-off controls even when their center lies
    // outside the viewport; vertical off-screen items can be normal scrolling.
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (r.bottom > 0 && r.top < height && (r.left < -1 || r.right > width + 1)) {
      let scrollable = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 2) { scrollable = true; break; }
      }
      if (!scrollable) add("CLIPPED", "warning", labelFor(el), `${selectorFor(el)}: extends beyond the horizontal viewport`, el, r.left, r.top);
    }
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    // Scrollable off-screen controls are covered by SCROLL findings. Controls
    // cut off by a non-scrollable ancestor cannot be reached that way.
    let clipped = false;
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const p = getComputedStyle(parent), pr = parent.getBoundingClientRect();
      const clipX = /(auto|scroll|hidden|clip)/.test(p.overflowX) && (cx < pr.left || cx >= pr.right);
      const clipY = /(auto|scroll|hidden|clip)/.test(p.overflowY) && (cy < pr.top || cy >= pr.bottom);
      if (clipX || clipY) {
        const canScrollX = clipX && /(auto|scroll)/.test(p.overflowX) && parent.scrollWidth > parent.clientWidth + 2;
        const canScrollY = clipY && /(auto|scroll)/.test(p.overflowY) && parent.scrollHeight > parent.clientHeight + 2;
        if ((clipX && !canScrollX) || (clipY && !canScrollY)) {
          add("CLIPPED", "high", labelFor(el), `${selectorFor(el)}: center clipped by ${selectorFor(parent)}; the clipping axis is not user-scrollable`, el, r.left, r.top);
        }
        clipped = true;
        break;
      }
    }
    if (clipped) continue;
    checked++;
    const label = labelFor(el), selector = selectorFor(el);
    if (cs.pointerEvents === "none") {
      add("INTERACTION", "high", label, `${selector}: pointer-events is none; pointer taps cannot reach this control`, el, r.left, r.top);
      continue;
    }
    // Probe center and four inset points without triggering any actions.
    const probes = [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]] as const;
    const hits = probes.map(([x,y]) => {
      const px = r.left + r.width*x, py = r.top + r.height*y;
      if (px < 0 || py < 0 || px >= width || py >= height) return null;
      return document.elementsFromPoint(px, py).find(node => !node.closest("[data-ui-doctor]")) ?? null;
    });
    const reachable = hits.filter(hit => hit === el || (hit && el.contains(hit))).length;
    const center = hits[0];
    if (!reachable) {
      add("COVERED", "high", label, `${selector}: no sampled point receives a tap${center ? ` (center receives ${selectorFor(center)})` : ""}`, el, r.left, r.top);
      continue;
    }
    if (center && center !== el && !el.contains(center)) add("COVERED", "warning", label, `${selector}: center receives ${selectorFor(center)}; ${reachable}/5 sampled points reachable`, el, r.left, r.top);
    // Credit actual visible ::after hit expansion only, not class names alone.
    const pseudo = getComputedStyle(el, "::after");
    let extraX = 0, extraY = 0;
    if (pseudo.content !== "none" && pseudo.content !== "normal" && pseudo.display !== "none" && pseudo.position === "absolute" && pseudo.pointerEvents !== "none") {
      extraX = Math.max(0, -parseFloat(pseudo.left) || 0) + Math.max(0, -parseFloat(pseudo.right) || 0);
      extraY = Math.max(0, -parseFloat(pseudo.top) || 0) + Math.max(0, -parseFloat(pseudo.bottom) || 0);
    }
    const touchW = r.width + extraX, touchH = r.height + extraY;
    if (Math.min(touchW, touchH) < 40) add("TAP", Math.min(touchW, touchH) < 32 ? "high" : "warning", label, `${selector}: ${Math.round(touchW)}×${Math.round(touchH)}px touch target (recommended 40×40)`, el, r.left, r.top);
  }
  let visualChecked = 0;
  if (isAdvancedGameLocation(window.location)) {
    const visual = auditVisuals(scope);
    visualChecked = visual.checked;
    for (const finding of visual.findings) {
      const r = finding.el.getBoundingClientRect();
      add(finding.kind, finding.severity, finding.label, finding.detail, finding.el, r.left, r.top);
    }
  }
  const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-render-resolution]");
  const render = canvas ? `3D render ${canvas.width}×${canvas.height} · ${canvas.dataset.renderDpr}× · ${canvas.dataset.renderResolution}${canvas.dataset.renderPotato === "1" ? " · Potato" : ""}` : null;
  return { issues, width, height, checked, visualChecked, deep: false, time: new Date().toLocaleTimeString(), render };
}

export function UiDoctor() {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [showMarkers, setShowMarkers] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [deepBusy, setDeepBusy] = useState(false);
  const [history, setHistory] = useState(visualHistory);
  const deepRun = useRef(0);
  const enhanced = isAdvancedGameLocation(window.location);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [perf, setPerf] = useState({ fps: 0, worst: 0, janks: 0 });
  const [position, setPosition] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem("sb-doctor-xy") || "null"); return typeof p?.x === "number" && typeof p?.y === "number" ? p as { x: number; y: number } : null; } catch { return null; }
  });
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const perfRef = useRef({ last: 0, elapsed: 0, frames: 0, worst: 0, janks: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const toggle = (e: Event) => { deepRun.current++; setDeepBusy(false); setEnabled((e as CustomEvent<boolean>).detail); setOpen(false); setScan(null); setShowMarkers(false); };
    window.addEventListener("sb-doctor", toggle);
    return () => window.removeEventListener("sb-doctor", toggle);
  }, []);
  useEffect(() => {
    if (!enabled || !enhanced) return;
    return monitorVisuals(setHistory);
  }, [enabled, enhanced]);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const stats = perfRef.current;
    stats.last = 0; stats.elapsed = 0; stats.frames = 0;
    const loop = (now: number) => {
      if (document.hidden) { stats.last = 0; }
      else if (!stats.last) stats.last = now;
      else {
        const dt = now - stats.last; stats.last = now; stats.elapsed += dt; stats.frames++;
        stats.worst = Math.max(stats.worst, dt); if (dt > 100) stats.janks++;
        if (stats.elapsed >= 1000) {
          setPerf({ fps: Math.round(stats.frames * 1000 / stats.elapsed), worst: Math.round(stats.worst), janks: stats.janks });
          stats.elapsed = 0; stats.frames = 0; stats.worst = 0;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const visibility = () => { stats.last = 0; stats.elapsed = 0; stats.frames = 0; };
    document.addEventListener("visibilitychange", visibility);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled]);
  useEffect(() => () => { deepRun.current++; if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!enabled) return;
    const resize = () => { setPosition(p => p ? { x: Math.max(2, Math.min(p.x, innerWidth - 46)), y: Math.max(2, Math.min(p.y, innerHeight - 46)) } : null); setShowMarkers(false); };
    const scroll = () => setShowMarkers(false); // snapshot markers no longer match after scrolling
    window.addEventListener("resize", resize); window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", resize); window.removeEventListener("scroll", scroll, true); };
  }, [enabled]);
  const run = useCallback(() => { setScan(audit()); setShowMarkers(true); setCopyStatus(""); }, []);
  const runDeep = useCallback(async () => {
    const token = ++deepRun.current;
    const scope = visualScope();
    const snapshot = audit();
    setDeepBusy(true); setCopyStatus("");
    try {
      const findings = await watchVisuals(scope);
      if (token !== deepRun.current) return;
      if (visualScope() !== scope || !scope.isConnected) {
        setCopyStatus("Screen changed during the scan — please scan again.");
      } else {
        for (const f of findings) {
          const r = f.el.getBoundingClientRect();
          snapshot.issues.push({ ...f, id: snapshot.issues.length + 1, x: Math.min(snapshot.width - 24, Math.max(2, r.left)), y: Math.min(snapshot.height - 24, Math.max(2, r.top)) });
        }
        snapshot.deep = true;
        setScan(snapshot); setShowMarkers(true);
      }
    } catch {
      if (token === deepRun.current) setCopyStatus("Visual observation failed — try scanning again.");
    } finally { if (token === deepRun.current) setDeepBusy(false); }
  }, []);
  const report = scan ? [`UI Doctor · ${scan.width}×${scan.height} · DPR ${devicePixelRatio || 1} · ${scan.time}`,
    `${scan.checked} visible controls · ${scan.visualChecked} visual targets checked · ${scan.issues.length} findings${scan.deep ? " · deep observation" : ""}`,
    `FPS ${perf.fps} · worst frame (last second) ${perf.worst}ms · frames over 100ms ${perf.janks}`,
    ...(scan.render ? [scan.render] : []),
    "Non-destructive checks: touch/layout, chest alignment and hinge, Spider roar facing, rendering and (in deep scan) animation/visual swaps. Actions and subjective artwork are not tested; scrolling can be intentional.",
    ...scan.issues.map(i => `[${i.severity.toUpperCase()}] ${i.kind} ${i.label}: ${i.detail}`),
    ...(history.length ? ["Visual history (while Doctor was enabled):", ...history.map(e => `${e.time}: ${e.message}`)] : [])].join("\n") : "";
  const copy = async () => {
    try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(report); setCopyStatus("Copied"); }
    catch { setCopyStatus("Copy unavailable — select the report below"); }
  };
  const locate = (issue: Issue) => {
    if (!issue.el?.isConnected) { setCopyStatus("This control is no longer on screen. Scan again."); return; }
    setOpen(false); setShowMarkers(false);
    issue.el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    setSelected(issue);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSelected(null), 2000);
  };
  if (!enabled) return null;
  const high = scan?.issues.filter(i => i.severity === "high").length || 0;
  const scrollAreas = scan?.issues.filter(i => i.kind === "SCROLL").length || 0;
  const selectedRect = selected?.el?.isConnected ? selected.el.getBoundingClientRect() : null;
  return <div data-ui-doctor className="ui-doctor">
    {showMarkers && !open && scan?.issues.filter(i => i.kind !== "OVERFLOW" && i.kind !== "SCROLL" && i.el?.isConnected).map(i => <span key={i.id} className="ui-doctor__marker" data-severity={i.severity} style={{ left: i.x, top: i.y }}>{i.id}</span>)}
    {selectedRect && <span className="ui-doctor__highlight" style={{ left: selectedRect.left, top: selectedRect.top, width: selectedRect.width, height: selectedRect.height }} />}
    {!open && <button className="ui-doctor__badge" aria-label="Open UI Doctor" style={position ? { left: position.x, top: position.y } : undefined}
      onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const d = drag.current; if (!d) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true; if (d.moved) setPosition({ x: Math.max(2, Math.min(innerWidth - 46, d.left + e.clientX - d.x)), y: Math.max(2, Math.min(innerHeight - 46, d.top + e.clientY - d.y)) }); }}
      onPointerUp={e => { const d = drag.current; drag.current = null; if (!d) return; if (!d.moved) setOpen(true); else { const r = e.currentTarget.getBoundingClientRect(); try { localStorage.setItem("sb-doctor-xy", JSON.stringify({ x: r.left, y: r.top })); } catch { /* storage blocked */ } } }}
      onPointerCancel={() => { drag.current = null; }} onClick={e => { if (e.detail === 0) setOpen(true); }}>
      <span>UI</span><b>{scan ? scan.issues.length : "•"}</b>
    </button>}
    {open && <section className="ui-doctor__panel" role="dialog" aria-label="UI Doctor" aria-modal="false">
      <header className="ui-doctor__header"><div><strong>UI DOCTOR{enhanced ? " · ADVANCED" : ""}</strong><small>{enhanced ? "Touch, visual & animation diagnostics" : "Touch & scroll diagnostics"}</small></div><button onClick={() => setOpen(false)} aria-label="Minimize UI Doctor">×</button></header>
      <div className="ui-doctor__metrics"><span><b>{perf.fps || "—"}</b> FPS</span><span><b>{perf.worst || "—"}</b> ms worst / sec</span><span><b>{perf.janks}</b> slow frames</span><button onClick={() => { perfRef.current.janks = 0; setPerf(p => ({ ...p, janks: 0 })); }}>RESET</button></div>
      <div className="ui-doctor__actions"><button onClick={run} disabled={deepBusy}>SCAN SCREEN</button>{enhanced && <button onClick={runDeep} disabled={deepBusy}>{deepBusy ? "WATCHING…" : "DEEP SCAN"}</button>}<button onClick={copy} disabled={!scan || deepBusy}>COPY REPORT</button></div>
      <div className="ui-doctor__body">
        {!scan ? <p>{enhanced ? "Scan touch, layout, chest facing, connections and rendering. Deep scan also watches for artwork swaps and stalled animations. It never presses controls or judges art quality." : "Scan for blocked or small touch targets, overflow and scrollable areas. The scan never presses game controls and cannot verify button actions."} Drag the badge to move it.</p> : <>
          <div className="ui-doctor__summary"><strong>{scan.issues.length} findings</strong><span>{high} high · {scan.issues.length - high} warnings · {scrollAreas} scroll</span></div>
          <p>{scan.checked} controls{enhanced ? ` · ${scan.visualChecked} visual targets` : ""} checked at {scan.width}×{scan.height} · {scan.time}{scan.deep ? " · deep observation" : ""}. Scroll areas may be intentional. Rescan after changing screens.</p>
          {scan.render && <p>{scan.render}</p>}
          {scan.issues.length === 0 ? <p>No issues found in the visible area.</p> : <ol className="ui-doctor__list">{scan.issues.map(i => <li key={i.id}><button onClick={() => locate(i)}><span data-severity={i.severity} data-kind={i.kind}>{i.id} · {i.kind}</span><strong>{i.label}</strong><small>{i.detail}</small></button></li>)}</ol>}
          {enhanced && <details className="ui-doctor__history"><summary>Visual history · {history.length} events</summary><p>Records brief chest renderer swaps while the Doctor is enabled, even before a scan.</p>{history.length > 0 && <><ol>{history.map((event, i) => <li key={i}><small>{event.time} · {event.message}</small></li>)}</ol><button onClick={() => { clearVisualHistory(); setHistory([]); }}>CLEAR HISTORY</button></>}</details>}
          <details><summary>Full report</summary><pre>{report}</pre></details>
        </>}
        {copyStatus && <p role="status">{copyStatus}</p>}
      </div>
    </section>}
  </div>;
}
