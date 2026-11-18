import { cmdById } from "./data";

/** Draw effects with the same inks as the specimen seals, not a separate FX palette. */
export const SCAVANGER_INK = cmdById("matriarch").pal;
export const LANTERN_INK = cmdById("lampyris").pal;
const worm = cmdById("worm");
export const WORM_INK = worm.pal;

// Crop the maw from the actual World Worm portrait. The bench SVG and the
// inlaid 3D trap share these pixels, including the recessed black throat.
export const WORM_MAW_COLS = 11;
export const WORM_MAW_ROWS = 6;
export const WORM_MAW = worm.art.slice(1, 1 + WORM_MAW_ROWS).flatMap((row, y) =>
  [...row.slice(2, 2 + WORM_MAW_COLS)].flatMap((ink, x) => ink === "." ? [] : [{ x, y, ink }]),
);
