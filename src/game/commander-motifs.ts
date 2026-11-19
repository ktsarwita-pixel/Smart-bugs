import { cmdById } from "./data";

/** Shared cutouts from the actual illustrated commander seals. */
function pixels(art: string[], x0: number, y0: number, cols: number, rows: number) {
  return art.slice(y0, y0 + rows).flatMap((row, y) =>
    [...row.slice(x0, x0 + cols)].flatMap((ink, x) => ink === "." ? [] : [{ x, y, ink }]),
  );
}

const scavanger = cmdById("matriarch");
export const SCAVANGER_INK = scavanger.pal;
// The stepped jade carapace, struck into both the coin and the archive case.
export const SCAVANGER_STAMP = pixels(scavanger.art, 4, 4, 8, 8);

const lantern = cmdById("lampyris");
export const LANTERN_INK = lantern.pal;
export const LANTERN_LENS_COLS = 8;
export const LANTERN_LENS_ROWS = 8;
export const LANTERN_LENS = pixels(lantern.art, 4, 7, LANTERN_LENS_COLS, LANTERN_LENS_ROWS)
  .filter(({ ink }) => "gewc".includes(ink));

const worm = cmdById("worm");
export const WORM_INK = worm.pal;
export const WORM_MAW_COLS = 11;
export const WORM_MAW_ROWS = 6;
export const WORM_MAW = pixels(worm.art, 2, 1, WORM_MAW_COLS, WORM_MAW_ROWS);

export const INCOME_CUE_MS = 2650;
export const WORM_BENCH_CUE_MS = 2180;
export const WORM_REVEAL_MS = 1000;
export const WORM_FLIGHT_MS = 340;
export const WORM_STAGGER_MS = 110;
