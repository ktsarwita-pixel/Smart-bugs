import { BENCH_SIZE, BUG_ORDER, type BugId } from "./data";
import { nextUid, type PrepUnit } from "./engine";

export function combine(list: PrepUnit[]): { out: PrepUnit[]; moulted: PrepUnit | null } {
  let out = list;
  let moulted: PrepUnit | null = null;
  for (;;) {
    const group = BUG_ORDER.flatMap((id) => [1, 2].map((star) => out.filter((u) => u.bugId === id && u.star === star)))
      .find((g) => g.length >= 3);
    if (!group) return { out, moulted };
    const keep = group.find((u) => u.zone === "board") ?? group[0];
    const drop = group.filter((u) => u !== keep).slice(0, 2);
    moulted = { ...keep, star: keep.star + 1 };
    out = [...out.filter((u) => u !== keep && !drop.includes(u)), moulted];
  }
}

/** Recruits enter at 1★. A full bench still accepts an instant moult. */
export function addRecruit(list: PrepUnit[], bugId: BugId) {
  const occupied = new Set(list.filter((u) => u.zone === "bench").map((u) => u.slot));
  let slot = 0;
  while (occupied.has(slot)) slot++;
  if (slot >= BENCH_SIZE && list.filter((u) => u.bugId === bugId && u.star === 1).length < 2) return null;
  const recruit: PrepUnit = { uid: nextUid(), bugId, star: 1, zone: "bench", slot };
  return { ...combine([...list, recruit]), recruit };
}

/** Commander rewards land immediately. Anything that doesn't fit waits in reserve. */
export function deliverRecruits(list: PrepUnit[], rewards: readonly BugId[]) {
  let out = list;
  let reserve = [...rewards];
  // Later recruits can create a moult and open room for an earlier reward.
  for (;;) {
    const deferred: BugId[] = [];
    for (const id of reserve) {
      const received = addRecruit(out, id);
      if (received) out = received.out;
      else deferred.push(id);
    }
    if (!deferred.length || deferred.length === reserve.length) return { out, reserve: deferred };
    reserve = deferred;
  }
}
