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

/** Localises a diagnostic string. The Doctor passes the app's translator in;
 *  every other caller gets the English fallback below, so harnesses and any
 *  non-UI consumer keep seeing exactly the strings they assert on. */
export type DoctorTf = (en: string, vars?: Record<string, string | number>) => string;
const plainTf: DoctorTf = (en, vars) => {
  if (!vars) return en;
  let out = en;
  for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(String(value));
  return out;
};

/** Inspect chest components, front-facing transforms, hinge points, WebGL
 * health and broken images in the current screen or active dialog. */
export function auditVisuals(scope: ParentNode, tf: DoctorTf = plainTf): VisualAudit {
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
        add("VISUAL", "high", tf("HUD element outside its deck"), tf("{name} extends beyond the command deck and may be clipped.", { name }), el);
      }
      for (const [otherName, other] of present.slice(i + 1)) {
        const b = other.getBoundingClientRect();
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
          add("VISUAL", "high", tf("HUD elements overlap"), tf("{name} overlaps {other}; one may cover the other.", { name, other: otherName }), el);
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
      add("VISUAL", "warning", tf("Specimen portrait misaligned"), outside
      ? tf("The artwork is {x}px horizontally and {y}px vertically off-center and extends beyond its plate.", { x: dx.toFixed(1), y: dy.toFixed(1) })
      : tf("The artwork is {x}px horizontally and {y}px vertically off-center.", { x: dx.toFixed(1), y: dy.toFixed(1) }), plate);
    }
  }
  // ── Damage Shower: a chart whose numbers must never leave the frame ──
  // The chart's middle column is `minmax(0, 1fr)`, so this cannot overflow by
  // design; measuring it keeps a future change (or a longer translation) from
  // silently pushing the "taken"/KO figures out of their border.
  const insideBox = (el: Element, box: DOMRect, tol = 1) => {
    const r = el.getBoundingClientRect();
    return r.left >= box.left - tol && r.right <= box.right + tol && r.top >= box.top - tol && r.bottom <= box.bottom + tol;
  };
  for (const shower of scope.querySelectorAll<HTMLElement>(".game-dock .damage-shower")) {
    if (!visible(shower)) continue;
    checked++;
    for (const control of shower.querySelectorAll<HTMLElement>(".damage-shower__head, .damage-shower__enemy")) {
      if (!visible(control)) continue;
      checked++;
      const box = control.getBoundingClientRect();
      const spilled = Array.from(control.children).filter((child) => visible(child) && !insideBox(child, box));
      if (spilled.length) {
        add("VISUAL", "high", tf("Damage chart label outside its frame"),
          tf("{n} part(s) of \"{text}\" are painted outside its border; long labels must truncate instead.",
            { n: spilled.length, text: (control.textContent ?? "").trim().slice(0, 22) }), control);
      }
    }
    for (const row of shower.querySelectorAll<HTMLElement>(".damage-row")) {
      if (!visible(row)) continue;
      checked++;
      const box = row.getBoundingClientRect();
      const spilled = Array.from(row.children).filter((child) => visible(child) && !insideBox(child, box));
      if (spilled.length) {
        add("VISUAL", "high", tf("Damage row spills out of its frame"),
          tf("{n} cell(s) of this row extend beyond the row border and may overlap the dock edge.", { n: spilled.length }), row);
      }
      const track = row.querySelector<HTMLElement>(".damage-row__track");
      const bar = track?.firstElementChild as HTMLElement | null | undefined;
      if (track && visible(track)) {
        checked++;
        const t = track.getBoundingClientRect(), b = bar?.getBoundingClientRect();
        if (!bar || t.width < 8) {
          add("VISUAL", "warning", tf("Damage share bar missing"), tf("The damage bar is missing or collapsed to nothing, so the row reads as an empty slot."), row);
        } else if (b && b.right > t.right + 1) {
          add("VISUAL", "warning", tf("Damage share bar overshoots"), tf("The bar is {px}px wider than its track.", { px: (b.right - t.right).toFixed(1) }), row);
        }
      }
      const name = row.querySelector<HTMLElement>(".damage-row__name");
      const val = row.querySelector<HTMLElement>(".damage-row__val");
      if (name && val && visible(name) && visible(val)) {
        checked++;
        const a = name.getBoundingClientRect(), c = val.getBoundingClientRect();
        if (a.right > c.left + 1 && a.left < c.right - 1) {
          add("VISUAL", "high", tf("Damage name overlaps the number"), tf("The bug label collides with its damage figure; the row cannot be read at this width."), row);
        }
      }
    }
  }
  // ── Long translated labels ────────────────────────────────────────────
  // Indonesian runs ~25-35% longer than English, so the dock is where a label
  // used to push past its own border. Clipped elements (`.truncate`, ellipsis)
  // are deliberate and skipped: only text that visibly escapes is reported.
  const clipsItsText = (node: Element) => {
    const s = getComputedStyle(node);
    return !/visible/.test(s.overflowX) || s.textOverflow === "ellipsis";
  };
  for (const el of scope.querySelectorAll<HTMLElement>(".game-dock .label, .game-dock button, .game-dock .latin")) {
    if (!visible(el) || !(el.textContent ?? "").trim()) continue;
    const st = getComputedStyle(el);
    if (!/visible/.test(st.overflowX) || st.textOverflow === "ellipsis") continue;
    // A child that ellipsises on purpose (`.truncate` inside a button, the
    // damage-row name) hides its own overflow, but the Range below would still
    // measure the unclipped text and report a phantom overflow.
    if (Array.from(el.children).some(clipsItsText)) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 8) continue;
    let ink: DOMRect;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      ink = range.getBoundingClientRect();
    } catch { continue; }
    checked++;
    if (ink.width < 1) continue;
    const over = Math.max(ink.left - box.left, ink.right - box.right);
    if (over > 2) {
      add("VISUAL", "warning", tf("Dock label overflows its frame"),
        tf("\"{text}\" runs {px}px past its border (overflow is visible, so nothing truncates it).",
          { text: (el.textContent ?? "").trim().slice(0, 28), px: over.toFixed(0) }), el);
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
    if (spriteVisible(chest)) add("RENDER", "warning", tf("Old chest artwork visible"), tf("The previous pixel sprite is visible in the 3D chest area; it may flash before the new model."), chest);
    if (chest.dataset.renderer !== "css3d") {
      add("RENDER", "warning", tf("Chest renderer changed or loading"), tf("Renderer is {renderer}; a late fallback-to-model swap can cause a visible flash.", { renderer: chest.dataset.renderer || tf("missing") }), chest);
      continue;
    }
    if (!world || !front || !lid || !bodyAnchor || !lidAnchor || !world.contains(lid)) {
      add("VISUAL", "high", tf("Chest part missing"), tf("The body, lid or shared hinge anchor is missing or detached from the model."), chest);
      continue;
    }
    const bodyFaces = ["body-back", "body-side--left", "body-side--right", "floor", "cavity"];
    const lidFaces = ["lid-back", "lid-side--left", "lid-side--right", "lid-top", "lid-bottom", "lid-front",
      "lid-ridge-front", "lid-ridge-back", "lid-ridge-side--left", "lid-ridge-side--right", "lid-ridge-top",
      "lid-crown-front", "lid-crown-back", "lid-crown-side--left", "lid-crown-side--right", "lid-crown-top"];
    const missingFaces = [...bodyFaces.filter(face => !world.querySelector(`.treasure-chest-3d__${face}`)),
      ...lidFaces.filter(face => !lid.querySelector(`.treasure-chest-3d__${face}`))];
    if (missingFaces.length) add("VISUAL", "high", tf("Chest 3D face missing"), tf("Missing {faces}; the model may look disconnected or hollow.", { faces: missingFaces.join(", ") }), chest);
    if (!front.querySelector("[data-chest-emblem]") || !front.querySelector("[data-chest-planks]") ||
        !lid.querySelector("[data-chest-ridge]") || !lid.querySelector("[data-chest-crown]") || !world.querySelector("[data-chest-treasure]")) {
      add("VISUAL", "warning", tf("Chest pixel detailing missing"), tf("The integrated wood, lid or treasure artwork is missing from the 3D model."), chest);
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
    if (misaligned) add("VISUAL", "high", tf("Chest lid side misaligned"), tf("A lid side is not centered between the front and back planes and may stick out or look detached."), chest);
    if (getComputedStyle(world).transformStyle !== "preserve-3d" || getComputedStyle(lid).transformStyle !== "preserve-3d") {
      add("RENDER", "warning", tf("Chest depth flattened"), tf("The browser is not preserving the 3D transforms of the body and lid."), chest);
    }
    const yaw = yawDegrees(world) + yawDegrees(front);
    if (!Number.isFinite(yaw) || Math.abs(yaw) > 2) add("VISUAL", "warning", tf("Chest not facing the player"), tf("The front is turned approximately {deg}°; expected a centered front view.", { deg: Number.isFinite(yaw) ? Math.round(yaw) : tf("unknown") }), chest);
    const a = bodyAnchor.getBoundingClientRect(), b = lidAnchor.getBoundingClientRect();
    const gap = Math.hypot(a.left - b.left, a.top - b.top);
    if (gap > 1.5) add("VISUAL", "high", tf("Chest lid disconnected"), tf("The body and lid hinge anchors are {px}px apart.", { px: gap.toFixed(1) }), chest);
    const fr = front.getBoundingClientRect();
    for (let parent = chest.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const st = getComputedStyle(parent), r = parent.getBoundingClientRect();
      const clippedX = /(hidden|clip)/.test(st.overflowX) && (fr.left < r.left - 1 || fr.right > r.right + 1);
      const clippedY = /(hidden|clip)/.test(st.overflowY) && (fr.top < r.top - 1 || fr.bottom > r.bottom + 1);
      if (clippedX || clippedY) { add("VISUAL", "warning", tf("Chest is clipped"), tf("The chest front extends beyond a non-scrollable clipping container."), chest); break; }
    }
  }
  for (const icon of scope.querySelectorAll<SVGSVGElement>("svg.chest-icon--advanced")) {
    if (!visible(icon)) continue;
    checked++;
    const lock = icon.querySelector<SVGGraphicsElement>("[data-chest-lock]");
    if (!icon.querySelector("[data-chest-emblem]") || !icon.querySelector("[data-chest-corners]") || !icon.querySelector("[data-chest-dome]")) {
      add("VISUAL", "warning", tf("VS chest detailing missing"), tf("The icon's domed lid, front emblem or corner guards are missing."), icon.parentElement as HTMLElement);
    }
    try {
      if (!lock) throw new Error("missing lock");
      const box = lock.getBBox(), view = icon.viewBox.baseVal;
      if (Math.abs(box.x + box.width / 2 - (view.x + view.width / 2)) > .75) {
        add("VISUAL", "warning", tf("VS chest icon off-center"), tf("The lock is not centered in the front-facing icon."), icon.parentElement as HTMLElement);
      }
    } catch { add("VISUAL", "warning", tf("VS chest icon incomplete"), tf("The icon is missing its centered lock or cannot be measured."), icon.parentElement as HTMLElement); }
  }
  for (const spider of scope.querySelectorAll<HTMLElement>('.ov-unit[data-roaring="true"]')) {
    if (!visible(spider)) continue;
    checked++;
    const body = spider.dataset.roarBody?.split(",").map(Number);
    if (!body || body.length !== 9 || body.some(value => !Number.isFinite(value))) {
      add("RENDER", "warning", tf("Spider roar pose unavailable"), tf("Body rotation cannot be checked because its rendered pose is missing or invalid."), spider);
    }
    const facing = spiderFacingError(spider), head = spider.dataset.roarHeadYaw === undefined ? NaN : Math.abs(Number(spider.dataset.roarHeadYaw)) * 180 / Math.PI;
    if (!Number.isFinite(facing) || !Number.isFinite(head) || facing > 2 || head > 2) {
      add("VISUAL", "warning", tf("Spider not facing the enemy side"), tf("During Battle Roar the body is {body}° away from the opposing side and the head is {head}° off-center.", { body: Number.isFinite(facing) ? facing.toFixed(1) : tf("an unknown number of"), head: Number.isFinite(head) ? head.toFixed(1) : tf("unknown") }), spider);
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
        add("VISUAL", "high", tf("Spider roar label covers health"), tf("The Battle Roar label overlaps the Spider's HP or energy bar."), badge);
      }
      if (a.left < boundary.left - 1 || a.right > boundary.right + 1 || a.top < boundary.top - 1 || a.bottom > boundary.bottom + 1) {
        add("VISUAL", "warning", tf("Spider roar label clipped"), tf("The Battle Roar label extends beyond the battlefield's visible edge."), badge);
      }
    }
  }
  for (const canvas of scope.querySelectorAll<HTMLCanvasElement>("canvas[data-commander-bounds]")) {
    if (!visible(canvas)) continue;
    // Above 100% the drawer toolbar deliberately magnifies the board, so the
    // plinths and commander totems are expected to leave the frame. Only audit
    // clipping at the fitted framing (≤100%), where it is a real regression.
    const zoom = Number(canvas.dataset.drawerZoom || "1");
    const magnified = Number.isFinite(zoom) && zoom > 1.02;
    try {
      const bounds: Record<string, unknown> = JSON.parse(canvas.dataset.commanderBounds || "{}");
      for (const [side, value] of Object.entries(bounds)) {
        if (!Array.isArray(value) || value.length !== 4 || value.some(v => typeof v !== "number" || !Number.isFinite(v))) continue;
        checked++;
        const [left, top, right, bottom] = value as number[];
        // The board may grow past the frame, but commanders must remain
        // visible at every zoom level, including during camera transitions.
        if (!magnified && (left < -.01 || top < -.01 || right > 1.01 || bottom > 1.01)) {
          add("VISUAL", "warning", tf("Commander model clipped"), tf("The {side} commander's projected 3D artwork extends beyond the battlefield edge.", { side: tf(side) }), canvas);
        }
      }
    } catch { /* Missing or stale diagnostic data is not a clipping finding. */ }
    try {
      const drawer: unknown = JSON.parse(canvas.dataset.drawerBounds || "null");
      if (Array.isArray(drawer) && drawer.length === 4 && drawer.every(v => typeof v === "number" && Number.isFinite(v))) {
        checked++;
        const [left, top, right, bottom] = drawer as number[];
        if (!magnified && (left < -.01 || top < -.01 || right > 1.01 || bottom > 1.01)) {
          add("VISUAL", "high", tf("Drawer frame clipped"), tf("The cabinet, plinths or commander envelope extends beyond the battlefield edge. Use FIT or zoom out."), canvas);
        }
      }
    } catch { /* Missing or stale diagnostic data is not a clipping finding. */ }
  }
  for (const canvas of scope.querySelectorAll<HTMLCanvasElement>("canvas[data-render-resolution]")) {
    if (!visible(canvas)) continue;
    checked++;
    const ratio = Number(canvas.dataset.renderDpr);
    if (!Number.isFinite(ratio) || ratio <= 0 || canvas.width < 1 || canvas.height < 1) {
      add("RENDER", "high", tf("3D resolution unavailable"), tf("The WebGL drawing buffer or its resolution is missing."), canvas);
    } else if (Math.abs(canvas.width - canvas.clientWidth * ratio) > 3 || Math.abs(canvas.height - canvas.clientHeight * ratio) > 3) {
      add("RENDER", "warning", tf("3D resolution mismatch"), tf("The {w}×{h} drawing buffer does not match its displayed size and {ratio}× render scale.", { w: canvas.width, h: canvas.height, ratio }), canvas);
    }
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl || gl.isContextLost()) add("RENDER", "high", tf("3D board unavailable"), tf("The scene's WebGL context was lost or is unavailable."), canvas);
  }
  for (const canvas of scope.querySelectorAll<HTMLCanvasElement>("canvas[data-chest-facing-error]")) {
    if (!visible(canvas)) continue;
    checked++;
    const yaw = Number(canvas.dataset.chestFacingError) * 180 / Math.PI;
    const gap = Number(canvas.dataset.chestHingeGap);
    if (!Number.isFinite(yaw) || Math.abs(yaw) > 2) add("VISUAL", "warning", tf("Board chest not facing the player"), tf("3D model is {deg}° away from the camera.", { deg: Number.isFinite(yaw) ? Math.abs(yaw).toFixed(1) : tf("unknown") }), canvas);
    if (!Number.isFinite(gap) || gap > .002) add("VISUAL", "high", tf("Board chest hinge disconnected"), tf("The lid pivot and body back differ by {gap} world units.", { gap: Number.isFinite(gap) ? gap.toFixed(3) : tf("an unknown distance") }), canvas);
    if (!canvas.hasAttribute("data-render-resolution")) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl || gl.isContextLost()) add("RENDER", "high", tf("3D board unavailable"), tf("The board's WebGL context was lost or is unavailable."), canvas);
    }
  }
  for (const img of scope.querySelectorAll<HTMLImageElement>("img[src]")) {
    if (!visible(img)) continue;
    checked++;
    if (img.complete && img.naturalWidth === 0) add("RENDER", "warning", tf("Image failed to load"), tf("{alt} did not load.", { alt: img.alt || tf("Decorative image") }), img);
  }
  return { checked, findings };
}

/** Watch a short interval for late renderer swaps and stalled lid animations.
 * Does not click controls, force frames, or alter the game. */
export async function watchVisuals(scope: ParentNode, duration = 1300, tf: DoctorTf = plainTf): Promise<VisualFinding[]> {
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
    if (spider.isConnected && pose.moved) findings.push({ kind: "ANIMATION", severity: "warning", label: tf("Spider body rotated during roar"), detail: tf("Its rendered body, facing or head yaw changed while Battle Roar was active."), el: spider });
  }
  for (const [chest, history] of histories) {
    if (!chest.isConnected || !visible(chest)) continue;
    if (history.size > 1 || oldSpriteSeen.has(chest)) {
      findings.push({ kind: "RENDER", severity: "warning", label: tf("Chest artwork changed during scan"), detail: tf("Observed {seen}{old}; this can appear as a flash or swap.", { seen: [...history].join(" → "), old: oldSpriteSeen.has(chest) ? tf(" and the old pixel sprite") : "" }), el: chest });
    }
    if (chest.dataset.chestState === "open") {
      const lid = chest.querySelector<HTMLElement>(".treasure-chest-3d__lid");
      const anim = animations.find(a => lid && (a.animation.effect as KeyframeEffect | null)?.target === lid);
      const current = anim ? Number(anim.animation.currentTime ?? 0) : 0;
      if (!document.hidden && !reduced && anim && (anim.state === "paused" || (anim.state === "running" && anim.animation.playState === "running" && current - anim.at < 35))) {
        findings.push({ kind: "ANIMATION", severity: "warning", label: tf("Chest opening is stalled"), detail: tf("The lid animation did not advance during the observation period."), el: chest });
      } else if (lid && (!anim || anim.animation.playState === "finished") && Math.abs(pitchDegrees(lid)) < 20) {
        findings.push({ kind: "ANIMATION", severity: "warning", label: tf("Open chest lid is still closed"), detail: tf("The reward is marked open, but the lid did not reach its open position."), el: chest });
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
export function monitorVisuals(onChange: (events: VisualEvent[]) => void, tf: DoctorTf = plainTf) {
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
    if (offFront && !previous.offFront) { log(tf("Spider faced away from the enemy side during Battle Roar.")); previous.offFront = true; }
    if ((facing !== previous.facing || body !== previous.body || head !== previous.head) && !previous.turned) {
      log(tf("Spider body rotated during Battle Roar.")); previous.turned = true;
    }
    spiderPrevious.set(spider, previous);
  };
  const check = (chest: HTMLElement) => {
    if (!chest.isConnected || !visible(chest)) return;
    const current = { renderer: chest.dataset.renderer || "missing", old: spriteVisible(chest) };
    const last = previous.get(chest);
    if (last && last.renderer !== current.renderer) log(tf("Chest renderer switched: {from} → {to}.", { from: last.renderer, to: current.renderer }));
    if (current.old && !last?.old) log(tf("Old pixel chest appeared in the 3D chest area."));
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
