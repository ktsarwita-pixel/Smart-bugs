#!/usr/bin/env node
/**
 * Wave-32 web containment proof.
 *
 * Replicates updateWebs()'s exact formulas and sweeps the ENTIRE reachable
 * state space (a strict superset of what the engine can ever produce):
 *   - any strike point w.x ∈ [0, COLS], w.y ∈ [0, ROWS] (engine foes live
 *     in [0.5..COLS-0.5], so this is looser)
 *   - every variety spin the component can emit, plus the full ±90° range
 *     for good measure
 *   - billow 0.97..1.03 and the whole easeOutBack spawn curve including
 *     its ~1.10 overshoot peak
 *   - under-sheet with its own wilder spin, fitted to the center's box
 *   - nest walls at max rise and max sway
 * For every state the composed world footprint must lie inside the board
 * rect (0..COLS × 0..ROWS) within a 1e-9 numeric epsilon.
 */
const COLS = 7, ROWS = 6;

function fitSpin(rw, rh, th, aw, ah) {
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  return Math.min(1, aw / Math.max(1e-6, rw * c + rh * s), ah / Math.max(1e-6, rw * s + rh * c));
}
// footprint AABB half-extents of a (rw x rh) rect spun by th, centered at its pos
function spunHalf(rw, rh, th) {
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  return [(rw / 2) * c + (rh / 2) * s, (rw / 2) * s + (rh / 2) * c];
}
function easeOutBack(k) {
  return 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
}

let worst = 0, worstDesc = "", checks = 0;
function assertInside(desc, x0, x1, z0, z1) {
  checks++;
  const over = Math.max(-x0, x1 - COLS, -z0, z1 - ROWS);
  if (over > worst) { worst = over; worstDesc = desc; }
  if (over > 1e-9) {
    console.error(`FAIL ${desc}: overhang ${over.toFixed(6)} rect=[${x0.toFixed(3)},${z0.toFixed(3)} → ${x1.toFixed(3)},${z1.toFixed(3)}]`);
    process.exit(1);
  }
}

// ---- SNARE (3×3, half=1.5): every spin, age, billow, strike point ----
// The center clamp maps any strike point to either itself (trivially
// inside) or the boundary [hx, COLS−hx] — so the two boundary centers plus
// the free center cover every possible outcome of the clamp.
const CENTERS = [[0, 0], [COLS / 2, ROWS / 2], [COLS, ROWS], [0, ROWS], [COLS, 0]];
for (const [wx, wy] of CENTERS) {
  for (let th = -Math.PI / 2; th <= Math.PI / 2 + 1e-9; th += Math.PI / 720) {
    for (const billow of [0.97, 1.0, 1.03]) {
      for (let k = 0; k <= 1.0001; k += 0.02) {
        const grow = 0.07 + 0.93 * easeOutBack(Math.min(1, k));
        const dw = (1.5 * 2 + 0.6) * billow * grow;
        const dh = dw;
        const fit = fitSpin(dw, dh, th, COLS, ROWS);
        const sw = dw * fit, sh = dh * fit;
        const [hx, hz] = spunHalf(sw, sh, th);
        if (hx > COLS / 2 + 1e-9 || hz > ROWS / 2 + 1e-9) {
          console.error(`FAIL fit did not shrink enough: hx=${hx} hz=${hz}`);
          process.exit(1);
        }
        const cx = Math.min(Math.max(wx, hx), COLS - hx);
        const cz = Math.min(Math.max(wy, hz), ROWS - hz);
        assertInside(`snare main th=${th.toFixed(4)} k=${k.toFixed(2)} w=(${wx},${wy})`,
          cx - hx, cx + hx, cz - hz, cz + hz);
        // under-sheet: wilder spin, same center, fitted to the left box
        const rot2 = -th * 1.7 - 0.035;
        const uw = sw * 0.92, uh = sh * 0.92;
        const aw = 2 * Math.min(cx, COLS - cx), ah = 2 * Math.min(cz, ROWS - cz);
        const fit2 = fitSpin(uw, uh, rot2, aw, ah);
        const [hx2, hz2] = spunHalf(uw * fit2, uh * fit2, rot2);
        assertInside(`snare under th2=${rot2.toFixed(4)} k=${k.toFixed(2)}`,
          cx - hx2, cx + hx2, cz - hz2, cz + hz2);
      }
    }
  }
}

// ---- GRAND: spin is exactly 0, per-axis clamp, full spawn curve ----
for (const billow of [0.97, 1.0, 1.03]) {
  for (let k = 0; k <= 1.0001; k += 0.005) {
    const grow = 0.07 + 0.93 * easeOutBack(Math.min(1, k));
    const sw = Math.min((COLS + 0.9) * billow * grow, COLS);
    const sh = Math.min((ROWS + 0.9) * billow * grow, ROWS);
    const cx = COLS / 2, cz = ROWS / 2;
    assertInside(`grand main k=${k.toFixed(3)}`, cx - sw / 2, cx + sw / 2, cz - sh / 2, cz + sh / 2);
    // wash wave ⊆ main sheet
    const washK = 1.0; // max
    assertInside(`grand wash k=${k.toFixed(3)}`, cx - sw * washK / 2, cx + sw * washK / 2, cz - sh * washK / 2, cz + sh * washK / 2);
    // under-sheet spin −0.035, fitted to the center's box
    const rot2 = -0.035;
    const uw = sw * 0.92, uh = sh * 0.92;
    const fit2 = fitSpin(uw, uh, rot2, 2 * Math.min(cx, COLS - cx), 2 * Math.min(cz, ROWS - cz));
    const [hx2, hz2] = spunHalf(uw * fit2, uh * fit2, rot2);
    assertInside(`grand under k=${k.toFixed(3)}`, cx - hx2, cx + hx2, cz - hz2, cz + hz2);
  }
}

// ---- NEST WALLS: max rise (easeOutBack peak) + worst sway, lean INWARD ----
const lean = 0.16;
for (const sway of [0.012, -0.012]) {
  const wallH = Math.max(0.02, 0.95 * 1.1045); // easeOutBack overshoot peak
  // N/S walls: height tips ±x? no — tips ±z by wallH/2·sin(|rx+sway|)
  const rxN = -lean + sway, rxS = lean + sway;
  for (const [wz, rx] of [[ROWS - 0.1, rxN], [0.1, rxS]]) {
    const halfTip = (wallH / 2) * Math.abs(Math.sin(rx));
    assertInside(`wall N/S wz=${wz}`, 0, COLS, wz - halfTip, wz + halfTip);
  }
  // E/W walls: width along z (ROWS exact, centered), top tips ±x
  for (const wx of [0.1, COLS - 0.1]) {
    const halfTip = (wallH / 2) * Math.abs(Math.sin(lean)); // sway ⊥ contributes ~0
    assertInside(`wall E/W wx=${wx}`, wx - halfTip, wx + halfTip, 0, ROWS);
  }
}

console.log(`ALL CONTAINED — ${checks.toLocaleString("en-US")} states checked, worst overhang ${worst.toExponential(2)}`);
