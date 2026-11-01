import { spiderRoarFacing } from "./spider-roar-visual";

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
// Compare to the opponent's board side, not to a moving/diagonal target or
// the recorded aim itself; this catches even an incorrectly recorded aim.
const spiderFacingError = (el: HTMLElement) => {
  const facing = Number(el.dataset.roarFacing), side = el.dataset.side;
  const aim = side === "ally" || side === "foe" ? spiderRoarFacing(side) : NaN;
  return Math.abs(Math.atan2(Math.sin(facing - aim), Math.cos(facing - aim))) * 180 / Math.PI;
};

/** Inspect chest components, front-facing transforms, hinge points, WebGL
 * health and broken images in the current screen or active dialog. */
export function auditVisuals(scope: ParentNode): VisualAudit {
  const findings: VisualFinding[] = [];
  let checked = 0;
  const add = (kind: VisualKind, severity: VisualFinding["severity"], label: string, detail: string, el: HTMLElement) => findings.push({ kind, severity, label, detail, el });
  // Vital labels are not buttons, so tap-target audits alone cannot detect
  // the round timeline covering health (or another piece of the HUD).
  for (const row of scope.querySelectorAll<HTMLElement>(".advanced-ui .deck-row")) {
    if (!visible(row)) continue;
    const parts: Array<readonly [string, HTMLElement | null]> = [
      ["Colony health", row.querySelector<HTMLElement>(".deck-health")],
      ["Round map", row.querySelector<HTMLElement>(".round-track--compact")],
      ["Matchup", row.querySelector<HTMLElement>(".vs-plaque")],
      ["Resources", row.querySelector<HTMLElement>(".deck-resources")],
      ["Field guide", row.querySelector<HTMLElement>(".help-btn")],
    ];
    const present = parts.filter((part): part is readonly [string, HTMLElement] => !!part[1] && visible(part[1]));
    checked += present.length;
    for (let i = 0; i < present.length; i++) {
      const [name, el] = present[i], a = el.getBoundingClientRect(), boundary = row.getBoundingClientRect();
      if (a.left < boundary.left - 1 || a.right > boundary.right + 1 || a.top < boundary.top - 1 || a.bottom > boundary.bottom + 1) {
        add("VISUAL", "high", "HUD element outside its deck", `${name} extends beyond the command deck and may be clipped.`, el);
      }
      for (const [otherName, other] of present.slice(i + 1)) {
        const b = other.getBoundingClientRect();
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
          add("VISUAL", "high", "HUD elements overlap", `${name} overlaps ${otherName}; one may cover the other.`, el);
        }
      }
    }
  }
  // A responsive seal can be centered while its intrinsically sized SVG is
  // offset and clipped inside the plate. Measure the actual artwork box too.
  for (const icon of scope.querySelectorAll<SVGSVGElement>(".advanced-ui .spec-icon__plate > svg")) {
    const plate = icon.parentElement;
    if (!plate || !visible(icon) || !visible(plate)) continue;
    checked++;
    const a = icon.getBoundingClientRect(), b = plate.getBoundingClientRect();
    const dx = Math.abs((a.left + a.right - b.left - b.right) / 2);
    const dy = Math.abs((a.top + a.bottom - b.top - b.bottom) / 2);
    const outside = a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1;
    if (dx > 1 || dy > 1 || outside) {
      add("VISUAL", "warning", "Specimen portrait misaligned", `The artwork is ${dx.toFixed(1)}px horizontally and ${dy.toFixed(1)}px vertically off-center${outside ? " and extends beyond its plate" : ""}.`, plate);
    }
  }
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
    const bodyFaces = ["body-back", "body-side--left", "body-side--right", "floor", "cavity"];
    const lidFaces = ["lid-back", "lid-side--left", "lid-side--right", "lid-top", "lid-bottom", "lid-front",
      "lid-ridge-front", "lid-ridge-back", "lid-ridge-side--left", "lid-ridge-side--right", "lid-ridge-top",
      "lid-crown-front", "lid-crown-back", "lid-crown-side--left", "lid-crown-side--right", "lid-crown-top"];
    const missingFaces = [...bodyFaces.filter(face => !world.querySelector(`.treasure-chest-3d__${face}`)),
      ...lidFaces.filter(face => !lid.querySelector(`.treasure-chest-3d__${face}`))];
    if (missingFaces.length) add("VISUAL", "high", "Chest 3D face missing", `Missing ${missingFaces.join(", ")}; the model may look disconnected or hollow.`, chest);
    if (!front.querySelector("[data-chest-emblem]") || !front.querySelector("[data-chest-planks]") ||
        !lid.querySelector("[data-chest-ridge]") || !lid.querySelector("[data-chest-crown]") || !world.querySelector("[data-chest-treasure]")) {
      add("VISUAL", "warning", "Chest pixel detailing missing", "The integrated wood, lid or treasure artwork is missing from the 3D model.", chest);
    }
    // Each side plane must be centered between its front and back. A missing
    // depth offset made the lid's sides project beyond the chest as spikes.
    const sideGroups = ["lid", "lid-ridge", "lid-crown"];
    const misaligned = sideGroups.some(group => {
      const face = (name: string) => lid.querySelector<HTMLElement>(`.treasure-chest-3d__${group}-${name}`);
      const front = face("front"), back = face("back"), left = face("side--left"), right = face("side--right");
      if (!front || !back || !left || !right) return false; // already reported as a missing face
      const fm = matrix(front), bm = matrix(back), lm = matrix(left), rm = matrix(right);
      if (!fm || !bm || !lm || !rm) return true;
      const center = (fm.m43 + bm.m43) / 2;
      return Math.abs(lm.m43 - center) > .5 || Math.abs(rm.m43 - center) > .5;
    });
    if (misaligned) add("VISUAL", "high", "Chest lid side misaligned", "A lid side is not centered between the front and back planes and may stick out or look detached.", chest);
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
    if (!icon.querySelector("[data-chest-emblem]") || !icon.querySelector("[data-chest-corners]") || !icon.querySelector("[data-chest-dome]")) {
      add("VISUAL", "warning", "VS chest detailing missing", "The icon's domed lid, front emblem or corner guards are missing.", icon.parentElement as HTMLElement);
    }
    try {
      if (!lock) throw new Error("missing lock");
      const box = lock.getBBox(), view = icon.viewBox.baseVal;
      if (Math.abs(box.x + box.width / 2 - (view.x + view.width / 2)) > .75) {
        add("VISUAL", "warning", "VS chest icon off-center", "The lock is not centered in the front-facing icon.", icon.parentElement as HTMLElement);
      }
    } catch { add("VISUAL", "warning", "VS chest icon incomplete", "The icon is missing its centered lock or cannot be measured.", icon.parentElement as HTMLElement); }
  }
  for (const spider of scope.querySelectorAll<HTMLElement>('.ov-unit[data-roaring="true"]')) {
    if (!visible(spider)) continue;
    checked++;
    const body = spider.dataset.roarBody?.split(",").map(Number);
    if (!body || body.length !== 9 || body.some(value => !Number.isFinite(value))) {
      add("RENDER", "warning", "Spider roar pose unavailable", "Body rotation cannot be checked because its rendered pose is missing or invalid.", spider);
    }
    const facing = spiderFacingError(spider), head = spider.dataset.roarHeadYaw === undefined ? NaN : Math.abs(Number(spider.dataset.roarHeadYaw)) * 180 / Math.PI;
    if (!Number.isFinite(facing) || !Number.isFinite(head) || facing > 2 || head > 2) {
      add("VISUAL", "warning", "Spider not facing the enemy side", `During Battle Roar the body is ${Number.isFinite(facing) ? facing.toFixed(1) : "an unknown number of"}° away from the opposing side and the head is ${Number.isFinite(head) ? head.toFixed(1) : "unknown"}° off-center.`, spider);
    }
    // This badge is decorative rather than clickable, so the generic target
    // scan cannot tell when it has been placed over the unit's HP/energy.
    const layer = spider.closest(".ov-layer");
    const cue = Array.from(layer?.querySelectorAll<HTMLElement>(".roar-cue") ?? []).find(el => el.dataset.roarUnit === spider.dataset.unitId);
    const badge = cue?.querySelector<HTMLElement>(".roar-cue__badge"), bars = spider.querySelector<HTMLElement>(".ov-bars");
    if (layer && cue && badge && bars && visible(cue) && visible(bars)) {
      checked++;
      const a = badge.getBoundingClientRect(), b = bars.getBoundingClientRect(), boundary = layer.getBoundingClientRect();
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
        add("VISUAL", "high", "Spider roar label covers health", "The Battle Roar label overlaps the Spider's HP or energy bar.", badge);
      }
      if (a.left < boundary.left - 1 || a.right > boundary.right + 1 || a.top < boundary.top - 1 || a.bottom > boundary.bottom + 1) {
        add("VISUAL", "warning", "Spider roar label clipped", "The Battle Roar label extends beyond the battlefield's visible edge.", badge);
      }
    }
  }
  for (const canvas of scope.querySelectorAll<HTMLCanvasElement>("canvas[data-commander-bounds]")) {
    if (!visible(canvas)) continue;
    try {
      const bounds: Record<string, unknown> = JSON.parse(canvas.dataset.commanderBounds || "{}");
      for (const [side, value] of Object.entries(bounds)) {
        if (!Array.isArray(value) || value.length !== 4 || value.some(v => typeof v !== "number" || !Number.isFinite(v))) continue;
        checked++;
        const [left, top, right, bottom] = value as number[];
        if (left < -.01 || top < -.01 || right > 1.01 || bottom > 1.01) {
          add("VISUAL", "warning", "Commander model clipped", `The ${side} commander's projected 3D artwork extends beyond the battlefield edge.`, canvas);
        }
      }
    } catch { /* Missing or stale diagnostic data is not a clipping finding. */ }
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
  const spiders = Array.from(scope.querySelectorAll<HTMLElement>('.ov-unit[data-roaring="true"][data-roar-facing][data-roar-body]')).filter(visible);
  if (!chests.length && !spiders.length) return [];
  const spiderPoses = new Map(spiders.map(spider => [spider, { facing: spider.dataset.roarFacing, body: spider.dataset.roarBody, head: spider.dataset.roarHeadYaw, moved: false }]));
  const histories = new Map(chests.map(chest => [chest, new Set([chest.dataset.renderer || "missing"])]));
  const oldSpriteSeen = new Set(chests.filter(spriteVisible));
  const animations = chests.flatMap(chest => chest.getAnimations({ subtree: true }).map(animation => ({ chest, animation, at: Number(animation.currentTime ?? 0), state: animation.playState })));
  const observer = new MutationObserver(() => {
    for (const [chest, history] of histories) {
      history.add(chest.dataset.renderer || "missing");
      if (spriteVisible(chest)) oldSpriteSeen.add(chest);
    }
    for (const [spider, pose] of spiderPoses) {
      if (spider.dataset.roaring === "true" && spider.dataset.roarBody !== undefined &&
          (spider.dataset.roarFacing !== pose.facing || spider.dataset.roarBody !== pose.body || spider.dataset.roarHeadYaw !== pose.head)) pose.moved = true;
    }
  });
  chests.forEach(chest => observer.observe(chest, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-renderer", "class", "style"] }));
  spiders.forEach(spider => observer.observe(spider, { attributes: true, attributeFilter: ["data-roar-facing", "data-roar-body", "data-roar-head-yaw"] }));
  await new Promise<void>(resolve => window.setTimeout(resolve, duration));
  observer.disconnect();
  const findings: VisualFinding[] = [];
  const reduced = document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const [spider, pose] of spiderPoses) {
    if (spider.isConnected && pose.moved) findings.push({ kind: "ANIMATION", severity: "warning", label: "Spider body rotated during roar", detail: "Its rendered body, facing or head yaw changed while Battle Roar was active.", el: spider });
  }
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
  const spiderPrevious = new WeakMap<HTMLElement, { facing: string; body: string; head: string; turned: boolean; offFront: boolean }>();
  const log = (message: string) => {
    visualEvents.push({ time: new Date().toLocaleTimeString(), message });
    if (visualEvents.length > 12) visualEvents.shift();
    onChange(visualHistory());
  };
  const checkSpider = (spider: HTMLElement) => {
    if (!spider.isConnected || spider.dataset.roaring !== "true" || spider.dataset.roarFacing === undefined || spider.dataset.roarBody === undefined) {
      spiderPrevious.delete(spider); return;
    }
    const facing = spider.dataset.roarFacing, body = spider.dataset.roarBody, head = spider.dataset.roarHeadYaw ?? "0";
    const previous = spiderPrevious.get(spider) ?? { facing, body, head, turned: false, offFront: false };
    const facingError = spiderFacingError(spider), headAngle = Math.abs(Number(head)) * 180 / Math.PI;
    const offFront = !Number.isFinite(facingError) || !Number.isFinite(headAngle) || facingError > 2 || headAngle > 2;
    if (offFront && !previous.offFront) { log("Spider faced away from the enemy side during Battle Roar."); previous.offFront = true; }
    if ((facing !== previous.facing || body !== previous.body || head !== previous.head) && !previous.turned) {
      log("Spider body rotated during Battle Roar."); previous.turned = true;
    }
    spiderPrevious.set(spider, previous);
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
      const spider = target?.closest<HTMLElement>('.ov-unit[data-unit-id]');
      if (spider) checkSpider(spider);
      for (const node of record.addedNodes) if (node instanceof Element) {
        if (node.matches(".treasure-chest-3d")) register(node as HTMLElement);
        node.querySelectorAll<HTMLElement>(".treasure-chest-3d").forEach(register);
        if (node.matches('.ov-unit[data-unit-id]')) checkSpider(node as HTMLElement);
        node.querySelectorAll<HTMLElement>('.ov-unit[data-unit-id][data-roaring="true"]').forEach(checkSpider);
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
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-renderer", "data-roar-facing", "data-roar-body", "data-roar-head-yaw", "data-roar-aim", "data-side", "data-roaring"] });
  document.querySelectorAll<HTMLElement>(".treasure-chest-3d").forEach(register);
  document.querySelectorAll<HTMLElement>('.ov-unit[data-unit-id][data-roaring="true"]').forEach(checkSpider);
  onChange(visualHistory());
  return () => observer.disconnect();
}
