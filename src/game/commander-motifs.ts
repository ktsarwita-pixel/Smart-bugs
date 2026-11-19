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

export const INCOME_CUE_MS = 3210;
export const INCOME_BURST_MS = 1210;
export const WORM_BENCH_CUE_MS = 3050;
export const WORM_SPIT_MS = 1210;
export const WORM_FLIGHT_MS = 480;
export const WORM_REVEAL_MS = WORM_SPIT_MS + WORM_FLIGHT_MS;
export const WORM_STAGGER_MS = 130;
