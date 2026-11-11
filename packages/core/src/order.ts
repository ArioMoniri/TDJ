import { HEAT_LABEL, type HeatGrade } from "./knowledge";
import type { Song, Tanda } from "./types";

/**
 * Round 14 — the strict order of a tanda's sides and its heat label (dancer R14-2c, R14-5, R14-17). Dependency-free so
 * the tanda builder, the strict panel and the repair can all use it.
 */
const isCump = (s: Song) => /cumparsita/i.test(s.title);
const fame = (s: Song) => s.fame ?? 0;
export const meanFameOf = (songs: Song[]) => {
  const xs = songs.filter((s) => !isCump(s));
  return xs.length ? xs.reduce((a, s) => a + fame(s), 0) / xs.length : 0;
};
/** a peak slot for the fame and colour rules: the planned summit, the arc's peak phase, or a target of 78 and more */
export const isPeakSlot = (t: Pick<Tanda, "peak" | "phase" | "targetEnergy">) =>
  !!t.peak || t.phase === "peak" || t.targetEnergy >= 78;

/** the heat readout of a set of sides, its "fantastic" label capped by the sides' mean fame (dancer R14-2c) */
export function heatOfSides(songs: Song[]): Tanda["heat"] | undefined {
  const grades = songs
    .filter((s) => !isCump(s))
    .map((x) => x.heat)
    .filter((g): g is HeatGrade => g !== undefined);
  if (!grades.length) return undefined;
  const min = Math.min(...grades) as HeatGrade;
  const mf = meanFameOf(songs);
  const capped = (min >= 4 && mf < 3 ? 3 : min) as HeatGrade;
  return {
    min,
    mean: Math.round((grades.reduce((a: number, g) => a + g, 0) / grades.length) * 10) / 10,
    label: HEAT_LABEL[capped],
  };
}

/**
 * The strict order of a tanda's sides (dancer R14-5, R14-17) under the older order rules (rounds 4, 9–11): every
 * (first, last) pair is scored and the best one wins. Strict panel: the first side has fame ≥ 3 (≥ 4 at a peak slot),
 * the last has fame ≥ max − 1 and is never an opener-role side. Older rules: a corpus closer never opens, a corpus
 * opener never closes, the last side is a corpus closer or one of the two hottest, never fame 0 when a fame ≥ 2 side
 * is there, and a vals or milonga never ends on its one lowest-energy side. The rest rise in energy between them.
 */
export function strictOrder(songs0: Song[], peak = false): Song[] {
  return orderWithCost(songs0, peak).songs;
}
/** the best order and what it still breaks (≥ 10 per broken rule: such a set of sides is not one to play) */
export function orderCost(songs: Song[], peak = false): number {
  return orderWithCost(songs, peak).cost;
}
function orderWithCost(songs0: Song[], peak: boolean): { songs: Song[]; cost: number } {
  const cump = songs0.filter(isCump);
  const songs = songs0.filter((s) => !isCump(s));
  if (songs.length < 2) return { songs: songs0, cost: 0 };
  const e = (s: Song) => s.energy ?? 50;
  const max = Math.max(...songs.map(fame));
  const need = peak ? 4 : 3;
  const top2 = songs
    .map(e)
    .sort((a, b) => b - a)
    .slice(0, 2);
  const minE = Math.min(...songs.map(e));
  const uniqueMin = (s: Song) => e(s) === minE && songs.filter((x) => e(x) === minE).length === 1;
  const vm = songs[0]!.rhythm === "vals" || songs[0]!.rhythm === "milonga";
  const hasKnown = songs.some((s) => fame(s) >= 2);
  const hits = songs.filter((s) => fame(s) === max).length;
  let best: { first: Song; last: Song; cost: number } | null = null;
  for (const last of songs)
    for (const first of songs) {
      if (first === last) continue;
      let cost = 0;
      if (fame(first) < need) cost += 10 + (need - fame(first));
      if (fame(last) < max - 1) cost += 10 + (max - 1 - fame(last));
      // (an opener-role side never closes: an older rule too, so it weighs as one)
      if (last.role === "opener" && songs.some((x) => x !== first && x.role !== "opener")) cost += 20;
      if (first.role === "closer" && songs.some((x) => x !== last && x.role !== "closer")) cost += 20;
      if (!(last.role === "closer" || top2.includes(e(last)))) cost += 20;
      if (hasKnown && fame(last) === 0) cost += 20;
      // the one slowest side never closes (a vals / milonga not even as a corpus closer)
      if (uniqueMin(last) && (vm || last.role !== "closer")) cost += 20;
      // in a tanda of four the one hit is not spent first (round 9), unless it is the corpus opener
      if (songs.length >= 4 && fame(first) === max && hits === 1 && first.role !== "opener") cost += 20;
      // preferences: a corpus opener first, a corpus closer last, a cooler opener, a famous closer
      cost -= (first.role === "opener" ? 0.5 : 0) + (last.role === "closer" ? 0.5 : 0);
      cost += e(first) / 1000 - fame(last) / 100;
      // round 15 (the song-order rule, strict `sideOrder`): among the orders that break no rule above, the order's own
      // verdict weighs 0.3 per item — under the corpus-role preferences (a closer last, −0.5)
      if (cost < 10) cost += 0.3 * orderVerdictOf([first, ...midOf(first, last), last]).length;
      if (!best || cost < best.cost - 1e-9) best = { first, last, cost };
    }
  const { first, last, cost } = best!;
  return { songs: [first, ...midOf(first, last), last, ...cump], cost: Math.max(0, cost) };
  function midOf(first: Song, last: Song): Song[] {
    const mid = songs
      .filter((s) => s !== first && s !== last)
      .sort((a, b) => e(a) - e(b) || a.id.localeCompare(b.id));
    // the one hit sits third or later (round 9)
    const h = mid.findIndex((s) => fame(s) === max);
    if (songs.length >= 4 && hits === 1 && h === 0 && mid.length >= 2) mid.push(...mid.splice(0, 1));
    return mid;
  }
}

/**
 * Round 15 — the song-order verdict of a tanda (the strict panel's `sideOrder`): an inviting opener (fame ≥ 3 when the
 * tanda has such a side, never the one slowest side), no dip mid-tanda, the best-loved side last or third, no title
 * twice in a row, no back-and-forth across the years. Empty: the order is right.
 */
export function orderVerdictOf(songs0: Song[]): string[] {
  const ss = songs0.filter((s) => !isCump(s));
  if (ss.length < 3) return [];
  const e = (s: Song) => s.energy ?? 50;
  const why: string[] = [];
  const minE = Math.min(...ss.map(e));
  const spread = Math.max(...ss.map(e)) - minE;
  if (fame(ss[0]!) < 3 && ss.some((s) => fame(s) >= 3))
    why.push(`opens on ${ss[0]!.title} (fame ${fame(ss[0]!)})`);
  if (e(ss[0]!) === minE && spread >= 6 && ss.filter((s) => e(s) === minE).length === 1)
    why.push(`opens on the slowest side (${ss[0]!.title} e${e(ss[0]!)})`);
  for (let k = 1; k < ss.length - 1; k++)
    if (e(ss[k]!) <= e(ss[k - 1]!) - 10 && e(ss[k]!) <= e(ss[k + 1]!) - 10)
      why.push(`a dip mid-tanda (${ss[k]!.title} e${e(ss[k]!)})`);
  const maxF = Math.max(...ss.map(fame));
  const bestAt = ss.map((s, k) => (fame(s) === maxF ? k : -1)).filter((k) => k >= 0);
  if (maxF >= 3 && !bestAt.some((k) => k >= ss.length - 2))
    why.push(`the best-loved side (${ss[bestAt[0]!]!.title}) is not last or third`);
  for (let k = 1; k < ss.length; k++)
    if (ss[k]!.title.toLowerCase() === ss[k - 1]!.title.toLowerCase())
      why.push(`${ss[k]!.title} twice in a row`);
  const ys = ss.map((s) => s.year ?? 0);
  if (ys.every(Boolean) && Math.max(...ys) - Math.min(...ys) >= 3) {
    let turns = 0;
    for (let k = 2; k < ys.length; k++) {
      const a = ys[k - 1]! - ys[k - 2]!,
        b = ys[k]! - ys[k - 1]!;
      if (a * b < 0 && Math.abs(a) >= 2 && Math.abs(b) >= 2) turns++;
    }
    if (turns) why.push(`back and forth across the years (${ys.join(", ")})`);
  }
  return why;
}
