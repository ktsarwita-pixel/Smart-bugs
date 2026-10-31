/** Non-destructive, opt-in checks for visible presentation. These inspect
 * measurable structure and timing, not subjective artwork quality. */
export type VisualKind = "VISUAL" | "RENDER" | "ANIMATION";
export interface VisualFinding {
  kind: VisualKind;
  severity: "high" | "warning";
  label: string;
  detail: string;
  el: HTMLElement;
}
export interface VisualAudit { checked: number; findings: VisualFinding[] }

const visible = (el: Element) => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return !el.closest("[data-ui-doctor], [inert]") && s.display !== "none" && s.visibility === "visible" && Number(s.opacity) !== 0 &&
    r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
};
const matrix = (el: Element) => {
  try { return new DOMMatrixReadOnly(getComputedStyle(el).transform); }
  catch { return null; }
};
const yawDegrees = (el: Element) => {
  const m = matrix(el);
  return m ? Math.atan2(m.m31, m.m33) * 180 / Math.PI : NaN;
};
const pitchDegrees = (el: Element) => {
  const m = matrix(el);
  return m ? Math.atan2(m.m23, m.m22) * 180 / Math.PI : NaN;
};
const spriteVisible = (root: Element) => Array.from(root.querySelectorAll(".pixel-treasure")).some(visible);

/** Inspect chest components, front-facing transforms, hinge points, WebGL
 * health and broken images in the current screen or active dialog. */
export function auditVisuals(scope: ParentNode): VisualAudit {
  const findings: VisualFinding[] = [];
  let checked = 0;
  const add = (kind: VisualKind, severity: VisualFinding["severity"], label: string, detail: string, el: HTMLElement) => findings.push({ kind, severity, label, detail, el });
  for (const chest of scope.querySelectorAll<HTMLElement>(".treasure-chest-3d")) {
    if (!visible(chest)) continue;
    checked++;
    const world = chest.querySelector<HTMLElement>(".treasure-chest-3d__world");
    const front = chest.querySelector<HTMLElement>(".treasure-chest-3d__body-front");
    const lid = chest.querySelector<HTMLElement>(".treasure-chest-3d__lid");
    const bodyAnchor = chest.querySelector<HTMLElement>(".treasure-chest-3d__body-anchor");
    const lidAnchor = chest.querySelector<HTMLElement>(".treasure-chest-3d__lid-anchor");
    if (spriteVisible(chest)) add("RENDER", "warning", "Old chest artwork visible", "The previous pixel sprite is visible in the 3D chest area; it may flash before the new model.", chest);
    if (chest.dataset.renderer !== "css3d") {
      add("RENDER", "warning", "Chest renderer changed or loading", `Renderer is ${chest.dataset.renderer || "missing"}; a late fallback-to-model swap can cause a visible flash.`, chest);
      continue;
    }
    if (!world || !front || !lid || !bodyAnchor || !lidAnchor || !world.contains(lid)) {
      add("VISUAL", "high", "Chest part missing", "The body, lid or shared hinge anchor is missing or detached from the model.", chest);
      continue;
    }
    if (getComputedStyle(world).transformStyle !== "preserve-3d" || getComputedStyle(lid).transformStyle !== "preserve-3d") {
      add("RENDER", "warning", "Chest depth flattened", "The browser is not preserving the 3D transforms of the body and lid.", chest);
    }
    const yaw = yawDegrees(world) + yawDegrees(front);
    if (!Number.isFinite(yaw) || Math.abs(yaw) > 2) add("VISUAL", "warning", "Chest not facing the player", `The front is turned approximately ${Number.isFinite(yaw) ? Math.round(yaw) : "unknown"}°; expected a centered front view.`, chest);
    const a = bodyAnchor.getBoundingClientRect(), b = lidAnchor.getBoundingClientRect();
    const gap = Math.hypot(a.left - b.left, a.top - b.top);
    if (gap > 1.5) add("VISUAL", "high", "Chest lid disconnected", `The body and lid hinge anchors are ${gap.toFixed(1)}px apart.`, chest);
    const fr = front.getBoundingClientRect();
    for (let parent = chest.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const st = getComputedStyle(parent), r = parent.getBoundingClientRect();
      const clippedX = /(hidden|clip)/.test(st.overflowX) && (fr.left < r.left - 1 || fr.right > r.right + 1);
      const clippedY = /(hidden|clip)/.test(st.overflowY) && (fr.top < r.top - 1 || fr.bottom > r.bottom + 1);
      if (clippedX || clippedY) { add("VISUAL", "warning", "Chest is clipped", "The chest front extends beyond a non-scrollable clipping container.", chest); break; }
    }
  }
  for (const icon of scope.querySelectorAll<SVGSVGElement>("svg.chest-icon--advanced")) {
    if (!visible(icon)) continue;
    checked++;
    const lock = icon.querySelector<SVGGraphicsElement>("[data-chest-lock]");
    try {
      if (!lock) throw new Error("missing lock");
      const box = lock.getBBox(), view = icon.viewBox.baseVal;
      if (Math.abs(box.x + box.width / 2 - (view.x + view.width / 2)) > .75) {
        add("VISUAL", "warning", "VS chest icon off-center", "The lock is not centered in the front-facing icon.", icon.parentElement as HTMLElement);
      }
    } catch { add("VISUAL", "warning", "VS chest icon incomplete", "The icon is missing its centered lock or cannot be measured.", icon.parentElement as HTMLElement); }
  }
  for (const canvas of scope.querySelectorAll<HTMLCanvasElement>("canvas[data-chest-facing-error]")) {
    if (!visible(canvas)) continue;
    checked++;
    const yaw = Number(canvas.dataset.chestFacingError) * 180 / Math.PI;
    const gap = Number(canvas.dataset.chestHingeGap);
    if (!Number.isFinite(yaw) || Math.abs(yaw) > 2) add("VISUAL", "warning", "Board chest not facing the player", `3D model is ${Number.isFinite(yaw) ? Math.abs(yaw).toFixed(1) : "unknown"}° away from the camera.`, canvas);
    if (!Number.isFinite(gap) || gap > .002) add("VISUAL", "high", "Board chest hinge disconnected", `The lid pivot and body back differ by ${Number.isFinite(gap) ? gap.toFixed(3) : "an unknown distance"} world units.`, canvas);
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl || gl.isContextLost()) add("RENDER", "high", "3D board unavailable", "The board's WebGL context was lost or is unavailable.", canvas);
  }
  for (const img of scope.querySelectorAll<HTMLImageElement>("img[src]")) {
    if (!visible(img)) continue;
    checked++;
    if (img.complete && img.naturalWidth === 0) add("RENDER", "warning", "Image failed to load", `${img.alt || "Decorative image"} did not load.`, img);
  }
  return { checked, findings };
}

/** Watch a short interval for late renderer swaps and stalled lid animations.
 * Does not click controls, force frames, or alter the game. */
export async function watchVisuals(scope: ParentNode, duration = 1300): Promise<VisualFinding[]> {
  const chests = Array.from(scope.querySelectorAll<HTMLElement>(".treasure-chest-3d")).filter(visible);
  if (!chests.length) return [];
  const histories = new Map(chests.map(chest => [chest, new Set([chest.dataset.renderer || "missing"])]));
  const oldSpriteSeen = new Set(chests.filter(spriteVisible));
  const animations = chests.flatMap(chest => chest.getAnimations({ subtree: true }).map(animation => ({ chest, animation, at: Number(animation.currentTime ?? 0), state: animation.playState })));
  const observer = new MutationObserver(() => {
    for (const [chest, history] of histories) {
      history.add(chest.dataset.renderer || "missing");
      if (spriteVisible(chest)) oldSpriteSeen.add(chest);
    }
  });
  chests.forEach(chest => observer.observe(chest, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-renderer", "class", "style"] }));
  await new Promise<void>(resolve => window.setTimeout(resolve, duration));
  observer.disconnect();
  const findings: VisualFinding[] = [];
  const reduced = document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const [chest, history] of histories) {
    if (!chest.isConnected || !visible(chest)) continue;
    if (history.size > 1 || oldSpriteSeen.has(chest)) {
      findings.push({ kind: "RENDER", severity: "warning", label: "Chest artwork changed during scan", detail: `Observed ${[...history].join(" → ")}${oldSpriteSeen.has(chest) ? " and the old pixel sprite" : ""}; this can appear as a flash or swap.`, el: chest });
    }
    if (chest.dataset.chestState === "open") {
      const lid = chest.querySelector<HTMLElement>(".treasure-chest-3d__lid");
      const anim = animations.find(a => lid && (a.animation.effect as KeyframeEffect | null)?.target === lid);
      const current = anim ? Number(anim.animation.currentTime ?? 0) : 0;
      if (!document.hidden && !reduced && anim && (anim.state === "paused" || (anim.state === "running" && anim.animation.playState === "running" && current - anim.at < 35))) {
        findings.push({ kind: "ANIMATION", severity: "warning", label: "Chest opening is stalled", detail: "The lid animation did not advance during the observation period.", el: chest });
      } else if (lid && (!anim || anim.animation.playState === "finished") && Math.abs(pitchDegrees(lid)) < 20) {
        findings.push({ kind: "ANIMATION", severity: "warning", label: "Open chest lid is still closed", detail: "The reward is marked open, but the lid did not reach its open position.", el: chest });
      }
    }
  }
  return findings;
}

/** A small opt-in history catches brief fallback flashes even if the player
 * opens the Doctor after the transition. Only presentation metadata is kept. */
export type VisualEvent = { time: string; message: string };
const visualEvents: VisualEvent[] = [];
export function visualHistory() { return visualEvents.slice(); }
export function clearVisualHistory() { visualEvents.length = 0; }
export function monitorVisuals(onChange: (events: VisualEvent[]) => void) {
  const previous = new WeakMap<HTMLElement, { renderer: string; old: boolean }>();
  const registered = new WeakSet<HTMLElement>();
  const log = (message: string) => {
    visualEvents.push({ time: new Date().toLocaleTimeString(), message });
    if (visualEvents.length > 12) visualEvents.shift();
    onChange(visualHistory());
  };
  const check = (chest: HTMLElement) => {
    if (!chest.isConnected || !visible(chest)) return;
    const current = { renderer: chest.dataset.renderer || "missing", old: spriteVisible(chest) };
    const last = previous.get(chest);
    if (last && last.renderer !== current.renderer) log(`Chest renderer switched: ${last.renderer} → ${current.renderer}.`);
    if (current.old && !last?.old) log("Old pixel chest appeared in the 3D chest area.");
    previous.set(chest, current);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const chest = target?.closest<HTMLElement>(".treasure-chest-3d");
      if (chest) check(chest);
      for (const node of record.addedNodes) if (node instanceof Element) {
        if (node.matches(".treasure-chest-3d")) register(node as HTMLElement);
        node.querySelectorAll<HTMLElement>(".treasure-chest-3d").forEach(register);
      }
    }
  });
  const register = (chest: HTMLElement) => {
    if (!registered.has(chest)) {
      registered.add(chest);
      observer.observe(chest, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-renderer", "class", "style"] });
    }
    check(chest);
  };
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-renderer"] });
  document.querySelectorAll<HTMLElement>(".treasure-chest-3d").forEach(register);
  onChange(visualHistory());
  return () => observer.disconnect();
}
