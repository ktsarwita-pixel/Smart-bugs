/**
 * Monochrome pixel art for the encounter timeline.
 *
 * The chest is deliberately wide (20×16) and the stag beetle deliberately
 * tall (16×20). Letting each silhouette keep its natural proportions makes
 * both readable in an 18px medallion; forcing both into one square was what
 * made the old chest resemble a handbag and the beetle resemble a deer head.
 */
export const CHEST_PIXELS = [
  '00000011111111000000',
  '00001111111111110000',
  '00011111111111111000',
  '00111111111111111100',
  '01111111111111111110',
  '01111111111111111110',
  '01100000111100000110',
  '01111111111111111110',
  '01111111100111111110',
  '01111111100111111110',
  '01111111111111111110',
  '01111111111111111110',
  '01111111111111111110',
  '01111111111111111110',
  '00111111111111111100',
  '00111000000000011100',
] as const;

export const STAG_PIXELS = [
  '0110000000000110',
  '0110000000000110',
  '0111000000001110',
  '0011000000001100',
  '0001100000011000',
  '0000111111110000',
  '0001111111111000',
  '0000111111110000',
  '1100111111110011',
  '0111111111111110',
  '1101111111111011',
  '0011111111111100',
  '0110111111110110',
  '1100111111110011',
  '0011111111111100',
  '0110011111100110',
  '0001111111111000',
  '0000011111100000',
  '0000001111000000',
  '0000000110000000',
] as const;

export function pixelPath(rows: readonly string[]): string {
  return rows.flatMap((row, y) => [...row].flatMap((bit, x) => bit === '1' ? [`M${x} ${y}h1v1h-1z`] : [])).join('');
}

export const CHEST_PATH = pixelPath(CHEST_PIXELS);
export const STAG_PATH = pixelPath(STAG_PIXELS);
export const CHEST_VIEWBOX = '0 0 20 16';
export const STAG_VIEWBOX = '0 0 16 20';
