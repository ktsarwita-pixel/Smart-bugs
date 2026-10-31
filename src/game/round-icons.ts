/** Monochrome, horizontally symmetric 16×16 pixel encounter glyphs.
 * Transparent rows/columns are included so each glyph's ink is centered. */
// Designed on an 8×8 grid so their silhouettes survive the small mobile
// round track; doubling pixels keeps the shared 16×16 SVG coordinate system.
function doublePixels(rows: readonly string[]): string[] {
  return rows.flatMap(row => {
    const enlarged = [...row].map(pixel => pixel.repeat(2)).join('');
    return [enlarged, enlarged];
  });
}
export const CHEST_PIXELS = doublePixels([
  '00111100',
  '01100110',
  '11000011',
  '11111111',
  '11011011',
  '11011011',
  '11000011',
  '01111110',
]);
export const STAG_PIXELS = doublePixels([
  '11000011',
  '01100110',
  '00111100',
  '11011011',
  '01111110',
  '11011011',
  '01011010',
  '00111100',
]);
export function pixelPath(rows: readonly string[]): string {
  return rows.flatMap((row,y) => [...row].flatMap((bit,x) => bit === '1' ? [`M${x} ${y}h1v1h-1z`] : [])).join('');
}
export const CHEST_PATH = pixelPath(CHEST_PIXELS);
export const STAG_PATH = pixelPath(STAG_PIXELS);
