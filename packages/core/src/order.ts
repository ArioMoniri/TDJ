import { HEAT_LABEL, type HeatGrade, staticProfile } from "./knowledge";
import type { Song, Tanda } from "./types";

/**
 * Round 14 — the strict order of a tanda's sides and its heat label (dancer R14-2c, R14-5, R14-17). Dependency-free so
 * the tanda builder, the strict panel and the repair can all use it.
 */
const isCump = (s: Song) => /cumparsita/i.test(s.title);
const fame = (s: Song) => s.fame ?? 0;
/** round 19: a rhythmic orchestra's tanda (its profile style): the drive carries it, so a hole in it is a fault */
const rhythmicSides = (songs: Song[]) => staticProfile(songs[0]?.orchestraId ?? "")?.style === "rhythmic";
/** round 19 (review O1–O3): the verdict items that weigh 3 in the order cost (a hole, a fall after the opener, a fade) */
const R19_ITEM =
  /falls \d+ after the opener|ends \d+ below|a dip mid-tanda \([^)]*\) in a rhythmic tanda|while the cooler corpus opener/;
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
export function strictOrder(songs0: Song[], peak = false, ctx: OrderCtx = {}): Song[] {
  return orderWithCost(songs0, peak, ctx).songs;
}
/** the best order and what it still breaks (≥ 10 per broken rule: such a set of sides is not one to play) */
export function orderCost(songs: Song[], peak = false, ctx: OrderCtx = {}): number {
  return orderWithCost(songs, peak, ctx).cost;
}
function orderWithCost(songs0: Song[], peak: boolean, ctx: OrderCtx = {}): { songs: Song[]; cost: number } {
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
  // round 17 (DJ §2, the energyStep fixer): with the next tanda's first side in view, a last side more than 16 above it
  // is a release cliff; a top-fame side that cuts it may close even when it is not one of the two hottest or is the one
  // slowest side (Biagi / Ibáñez ending on Lejos de Ti e77 before Caló / Berón opening e61)
  const nf = ctx.nextFirst;
  const relCliff = (s: Song) => nf !== null && nf !== undefined && e(s) - nf > 16;
  const cuts = songs.some(relCliff);
  const cutter = (s: Song) => cuts && !relCliff(s) && fame(s) === max;
  // (and the boundary fixer's release cut sets aside the corpus-role and two-hottest preferences of rounds 4–11 — never a
  // panel order rule: the fame of the first and last side, the one hit, the order verdict and the cliff stay)
  const relax = !!ctx.releaseCut;
  const rhythmic = rhythmicSides(songs);
  let best: { first: Song; last: Song; mid: Song[]; cost: number } | null = null;
  for (const last of songs)
    for (const first of songs) {
      if (first === last) continue;
      if (ctx.first && first.id !== ctx.first) continue;
      let cost = 0;
      if (fame(first) < need) cost += 10 + (need - fame(first));
      if (fame(last) < max - 1) cost += 10 + (max - 1 - fame(last));
      // (an opener-role side never closes: an older rule too, so it weighs as one)
      if (!relax && last.role === "opener" && songs.some((x) => x !== first && x.role !== "opener"))
        cost += 20;
      if (!relax && first.role === "closer" && songs.some((x) => x !== last && x.role !== "closer"))
        cost += 20;
      // (round 19, review R2: "one of the two hottest" reads within 2 of the second hottest — No Mientas e82 closes a
      // summit of e84s, so its corpus opener Pensalo Bien need not)
      const hotEnough = top2.includes(e(last)) || e(last) >= (top2[1] ?? top2[0]!) - 2;
      if (!(last.role === "closer" || hotEnough || cutter(last) || relax)) cost += 20;
      if (hasKnown && fame(last) === 0) cost += 20;
      // the one slowest side never closes (a vals / milonga not even as a corpus closer), unless it cuts a release cliff
      if (uniqueMin(last) && (vm || last.role !== "closer") && !cutter(last)) cost += 20;
      // (round 17: a release cliff into the next tanda weighs as the cliff into this one, when a top-fame side cuts it)
      if (relCliff(last) && songs.some(cutter)) cost += 12;
      // in a tanda of four the one hit is not spent first (round 9), unless it is the corpus opener — or (round 19, O1)
      // the one slowest side of a rhythmic tanda 8 or more under the rest: in the middle it is a hole in the drive
      // (Ataniche e73 among D'Arienzo's e84s), so it opens and the tanda rises from it
      const slowHit = rhythmic && uniqueMin(first) && Math.max(...songs.map(e)) - e(first) >= 8;
      if (songs.length >= 4 && fame(first) === max && hits === 1 && first.role !== "opener" && !slowHit)
        cost += 20;
      // preferences: a corpus opener first, a corpus closer last, a cooler opener, a famous closer
      cost -= (first.role === "opener" ? 0.5 : 0) + (last.role === "closer" ? 0.5 : 0);
      cost += e(first) / 1000 - fame(last) / 100;
      // round 15 (the song-order rule, strict `sideOrder`): among the orders that break no rule above, the order's own
      // verdict weighs 0.3 per item — under the corpus-role preferences (a closer last, −0.5)
      // round 16: a fade, an última or summit that does not end on its strongest side weigh 2; the side-level cliff
      // into the tanda (DJ R16-4) weighs 12 — over the round-9 "one hit not first" and under the corpus roles (20)
      const verdictCost = (mid: Song[]) => {
        const v = orderVerdictOf([first, ...mid, last], ctx);
        // round 19 (review O1–O3): a hole in a rhythmic tanda, a fall after the opener, a fade below a side that could
        // close weigh 3 — over the round-16 fade (2), under the side-level cliff (12) and the corpus roles (20) — and
        // also among orders that already break an older rule (a summit of four fame-5 sides with two corpus openers)
        const r19 = v.filter((x) => R19_ITEM.test(x)).length;
        let c = 3 * r19;
        if (cost < 10 || ctx.prevLast != null) {
          const heavy = v.filter((x) => /fades out|strongest/.test(x)).length;
          const cliff = v.filter((x) => /below the previous/.test(x)).length;
          c += 0.3 * (v.length - heavy - cliff - r19) + 2 * heavy + 12 * cliff;
        }
        return { c, r19 };
      };
      // the middle sides rise (rounds 4–11); round 19 (review F4): when that puts a fame-5 side of a lyrical or balanced
      // tanda straight after the opener, 9 or more under it, the other middle order is weighed too — the loved slow side
      // third, "the classic emotional peak" (De Puro Guapo, Desconsuelo, Como Dos Extraños, No Me Extraña)
      let mid = midOf(first, last);
      let vc = verdictCost(mid);
      if (vc.r19 && mid.length === 2) {
        const alt = [mid[1]!, mid[0]!];
        // (round 9: the one hit is never second)
        const hitSecond = songs.length >= 4 && hits === 1 && fame(alt[0]!) === max;
        const ac = verdictCost(alt);
        if (!hitSecond && ac.c + 0.05 < vc.c) {
          mid = alt;
          vc = ac;
        }
      }
      cost += vc.c;
      if (!best || cost < best.cost - 1e-9) best = { first, last, mid, cost };
    }
  if (!best) return { songs: songs0, cost: 99 };
  const { first, last, mid, cost } = best;
  return { songs: [first, ...mid, last, ...cump], cost: Math.max(0, cost) };
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

/** round 16: where a tanda stands in the night (the order verdict reads it) */
export interface OrderCtx {
  /** the energy of the previous tanda's last side (the side-level step into this tanda) */
  prevLast?: number | null;
  /** a planned summit */
  summit?: boolean;
  /** the última */
  ultima?: boolean;
  /** round 17: the energy of the next tanda's first side (the release step out of this tanda) */
  nextFirst?: number | null;
  /** round 17: the side that must open (its id) — the boundary fixer pins it */
  first?: string;
  /** round 17: the boundary fixer's release cut (the corpus-role and two-hottest preferences yield to it) */
  releaseCut?: boolean;
}
/**
 * Round 16 (DJ R16-4, dancer §4): a tanda whose first side sits more than 15 below the previous tanda's last side
 * opens on a cliff when one of its fame-≥3 sides lies nearer that side (Láurenz / Casas opening on Como Dos Extraños
 * e56 straight after La Payanca e84). Null: no cliff.
 */
export function cliffOf(songs0: Song[], prevLast: number | null | undefined): string | null {
  const ss = songs0.filter((s) => !isCump(s));
  if (prevLast === null || prevLast === undefined || ss.length < 2) return null;
  const e = (s: Song) => s.energy ?? 50;
  const first = ss[0]!;
  if (prevLast - e(first) <= 15) return null;
  const nearer = ss.some(
    (s) => s !== first && fame(s) >= 3 && Math.abs(e(s) - prevLast) < prevLast - e(first) - 4,
  );
  return nearer
    ? `opens ${prevLast - e(first)} below the previous tanda's last side (${first.title} e${e(first)} after e${prevLast})`
    : null;
}

/**
 * Round 15 — the song-order verdict of a tanda (the strict panel's `sideOrder`), retuned in round 16 as the panel
 * specified (dancer §4, DJ §6): the slowest side may open (Como Dos Extraños, Malena, Silueta Porteña are the
 * invitations) — only the side-level cliff from the previous tanda is a fault (`cliffOf`, its own rule); the best-loved
 * side sits first, third or last; a mid-tanda dip counts only when the side is less loved than both neighbours (or the
 * dip is ≥ 15 on a side of fame ≤ 2); the tanda never fades out (the last side ≥ the tanda's mean − 8, unless it is the
 * single best-loved side) and ends within 1 of its top fame; in a summit and in the última the last side is the
 * strongest (within 3 of the hottest); no title twice in a row, no back-and-forth across the years. Empty: right.
 */
export function orderVerdictOf(songs0: Song[], ctx: OrderCtx = {}): string[] {
  const ss = songs0.filter((s) => !isCump(s));
  if (ss.length < 3) return [];
  const e = (s: Song) => s.energy ?? 50;
  const why: string[] = [];
  if (fame(ss[0]!) < 3 && ss.some((s) => fame(s) >= 3))
    why.push(`opens on ${ss[0]!.title} (fame ${fame(ss[0]!)})`);
  const cliff = cliffOf(ss, ctx.prevLast);
  if (cliff) why.push(cliff);
  // round 19 (review O1): in a rhythmic tanda a side 8 or more under both neighbours is a hole whatever its fame
  const rhythmic = rhythmicSides(ss);
  for (let k = 1; k < ss.length - 1; k++) {
    const dip = Math.min(e(ss[k - 1]!), e(ss[k + 1]!)) - e(ss[k]!);
    const hole = rhythmic && dip >= 8;
    if (dip < 10 && !hole) continue;
    const lessLoved = fame(ss[k]!) < fame(ss[k - 1]!) && fame(ss[k]!) < fame(ss[k + 1]!);
    if (lessLoved || (dip >= 15 && fame(ss[k]!) <= 2) || hole)
      why.push(
        `a dip mid-tanda (${ss[k]!.title} e${e(ss[k]!)}, fame ${fame(ss[k]!)})${hole ? " in a rhythmic tanda" : ""}`,
      );
  }
  // round 19 (review O2): the second side never falls more than 8 under the opener — 12 when it is a fame-5 side of a
  // lyrical or balanced tanda (Como Dos Extraños may follow De Puro Guapo a little lower, not 15 lower)
  {
    const drop = e(ss[0]!) - e(ss[1]!);
    const allow = !rhythmic && fame(ss[1]!) >= 5 ? 12 : 8;
    if (drop > allow)
      why.push(
        `${ss[1]!.title} falls ${drop} after the opener (e${e(ss[1]!)} after ${ss[0]!.title} e${e(ss[0]!)})`,
      );
  }
  const maxF = Math.max(...ss.map(fame));
  const bestAt = ss.map((s, k) => (fame(s) === maxF ? k : -1)).filter((k) => k >= 0);
  if (maxF >= 3 && !bestAt.some((k) => k === 0 || k === 2 || k === ss.length - 1))
    why.push(`the best-loved side (${ss[bestAt[0]!]!.title}) is not first, third or last`);
  const lastS = ss[ss.length - 1]!;
  const mean = ss.reduce((a, s) => a + e(s), 0) / ss.length;
  const singleBest = fame(lastS) === maxF && bestAt.length === 1;
  if (e(lastS) < mean - 8 - 1e-9 && !singleBest)
    why.push(`fades out on ${lastS.title} (e${e(lastS)}, the tanda's mean ${Math.round(mean)})`);
  if (fame(lastS) < maxF - 1) why.push(`ends on ${lastS.title} (fame ${fame(lastS)}, top ${maxF})`);
  // round 19 (review O4): of two corpus openers the cooler one opens (Zorzal e62 before La Mulateada e70)
  {
    const f0 = ss[0]!;
    const cooler = ss.find(
      (s) => s !== f0 && s.role === "opener" && e(s) <= e(f0) - 4 && fame(s) >= fame(f0),
    );
    if (f0.role === "opener" && cooler)
      why.push(
        `opens on ${f0.title} e${e(f0)} while the cooler corpus opener ${cooler.title} e${e(cooler)} waits`,
      );
  }
  // round 19 (review O3): the last side is not more than 4 under the hottest of the others when that side could close
  // itself (a fame within 1 of the top, no corpus opener) — D'Agostino / Vargas ending on Adiós, Arrabal e56 after
  // El Yacaré e62
  {
    const hot = ss.slice(0, -1).reduce((a, b) => (e(b) > e(a) ? b : a));
    if (
      e(lastS) < e(hot) - 4 &&
      fame(hot) >= maxF - 1 &&
      fame(hot) >= fame(lastS) - 1 &&
      hot.role !== "opener"
    )
      why.push(
        `ends ${e(hot) - e(lastS)} below ${hot.title} (${lastS.title} e${e(lastS)}, ${hot.title} e${e(hot)})`,
      );
  }
  if (ctx.summit || ctx.ultima) {
    const top = Math.max(...ss.map(e));
    if (e(lastS) < top - 3)
      why.push(
        `the ${ctx.ultima ? "última" : "summit"} does not end on its strongest side (${lastS.title} e${e(lastS)}, top e${top})`,
      );
  }
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

/**
 * Round 17: a tanda whose order is a release cut at a boundary (the energyStep fixer) — it closes on the side that
 * (a vals or milonga before a tango) steps ≤ 16 down to the next tanda's first side where another of its sides would step more, or it opens on the side
 * within 16 of the previous tanda's last side where another would open more than 16 below it. The older corpus-role
 * and two-hottest order rules yield to such a tanda (`OrderCtx.releaseCut`).
 */
export function isReleaseCut(tandas: Pick<Tanda, "songs" | "rhythm">[], i: number): boolean {
  const e = (s: Song) => s.energy ?? 50;
  const ss = (tandas[i]?.songs ?? []).filter((s) => !isCump(s));
  if (ss.length < 2) return false;
  const next = tandas[i + 1]?.songs.filter((s) => !isCump(s))[0];
  const prev = i > 0 ? tandas[i - 1]?.songs.filter((s) => !isCump(s)).at(-1) : undefined;
  const last = ss.at(-1)!,
    first = ss[0]!;
  // (the energyStep release: a vals or milonga into a tango)
  const out =
    !!next &&
    tandas[i]!.rhythm !== "tango" &&
    tandas[i + 1]!.rhythm === "tango" &&
    e(last) - e(next) <= 16 &&
    ss.some((s) => s !== last && e(s) - e(next) > 16);
  const into =
    !!prev &&
    tandas[i - 1]!.rhythm !== "tango" &&
    tandas[i]!.rhythm === "tango" &&
    e(prev) - e(first) <= 16 &&
    ss.some((s) => s !== first && e(prev) - e(s) > 16);
  return out || into;
}
