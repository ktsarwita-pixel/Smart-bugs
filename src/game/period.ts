/** Translate the zero-based match round into an ever-growing period schedule.
 * Periods start at four rounds and grow by one until they reach seven. */
export function periodForRound(round: number): { period: number; round: number; length: number } {
  let remaining = Math.max(0, Math.floor(round));
  let period = 1;
  let length = 4;
  while (remaining >= length && length < 7) {
    remaining -= length;
    period++;
    length++;
  }
  if (length === 7) {
    period += Math.floor(remaining / 7);
    remaining %= 7;
  }
  return { period, round: remaining + 1, length };
}
