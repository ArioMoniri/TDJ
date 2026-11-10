import { BPM_DELTA_MAX, tandaCohesion } from "./audio/compat";
import { normTitle } from "./energy";
import type {
  ComposeOptions,
  DanceRhythm,
  Era,
  OrchestraProfile,
  PreferredFamily,
  Rng,
  Slot,
  Song,
  Tanda,
} from "./index";
import { familyBand, goldenClassOf, isColour } from "./knowledge";
import { heatOfSides, orderCost, strictOrder } from "./order";
import {
  CORPUS_CAPS,
  DEFAULT_CAP,
  MILONGA_BANK,
  matchFamily,
  NEVER_OPEN,
  OPENERS,
  PLACEMENT_MEDIAN,
  VALS_BANK,
  WARMUP_VALS_BANK,
} from "./rules";
import { pairScore, sideOf, styleClass, type TransitionSide } from "./transitions";

export interface TandaCandidate {
  orchestraId: string;
  orchestra: string;
  singer: string | null;
  vocal: boolean;
  songs: Song[];
  singerShare: number;
  /** every row carries a decade placeholder year ("c. 1940"): never anchors a year window */
  undated?: boolean;
  /** round 13: the smallest spread any tanda of this family reaches (cohesion §4.1, pool-aware era grading) */
  spreadFloor?: number;
  /** round 13 (cohesion R7): a vals window widened by one year because the pool is small */
  poolSmall?: boolean;
}

const dated = (s: Song) => (s.year && !s.yearApprox ? s.year : null);

/**
 * A row a tanda may be built from (round 8): dated (no decade placeholder, no missing year) and a studio side,
 * never a radio/live transcription or an "inéditos" bootleg. `allowUndated` (rules.allowUndated) lets a DJ opt in.
 */
export const isTandaEligible = (
  s: Pick<Song, "year" | "yearApprox" | "transcription" | "undatedCompilation">,
  allowUndated = false,
) => allowUndated || (!!s.year && !s.yearApprox && !s.transcription && !s.undatedCompilation);

/**
 * A suspect side (round 9): a golden-era (≤ 1955) dance side longer than 3:20 is most likely a reissue /
 * compilation edit or a wrong streaming match, unless the reference corpus knows the recording.
 */
export const SUSPECT_SIDE_SEC = 200;
export const isSuspectSide = (s: Pick<Song, "era" | "durationSec" | "rhythm" | "fame" | "streamSuspect">) =>
  !!s.streamSuspect ||
  ((s.rhythm === "tango" || s.rhythm === "vals" || s.rhythm === "milonga") &&
    (s.era === "guardia-vieja" ||
      s.era === "guardia-nueva" ||
      s.era === "golden-early" ||
      s.era === "golden-peak" ||
      s.era === "golden-late") &&
    (s.durationSec ?? 0) > SUSPECT_SIDE_SEC);

/** the song's rhythm as a DJ hears it: the index field first, the title ("Milonga …") as a last resort */
export function songRhythm(s: Pick<Song, "title" | "rhythm">): string {
  const t = normTitle(s.title);
  if (t.startsWith("milonga ") || t === "milonga") return "milonga";
  if (t.startsWith("vals ")) return "vals";
  return s.rhythm;
}

/** cohesion review R1: year-spread caps by tanda type (vocal tango 2, instrumental tango 3, vals 2, milonga 2) */
export const SPREAD_CAPS = { vocalTango: 2, instrumentalTango: 3, vals: 2, milonga: 2 } as const;
/** the hard spread cap of a tanda; the night's maxYearSpread is an upper bound on it */
export function spreadCap(rhythm: string, vocal: boolean, maxYearSpread = 99): number {
  const cap =
    rhythm === "tango"
      ? vocal
        ? SPREAD_CAPS.vocalTango
        : SPREAD_CAPS.instrumentalTango
      : rhythm === "vals"
        ? SPREAD_CAPS.vals
        : SPREAD_CAPS.milonga;
  return Math.max(0, Math.min(maxYearSpread, cap));
}
/** cohesion R3(b): a recording gap of this many months in a family's dated sides is a break */
export const GAP_BREAK_MONTHS = 18;
/** the month indexes where a new recording period starts in a sorted list of months (gaps ≥ 18 months) */
export function gapBreaks(months: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < months.length; i++)
    if (months[i]! - months[i - 1]! >= GAP_BREAK_MONTHS) out.push(months[i]!);
  return out;
}

export interface FamilyOpts {
  /** the pool's rhythm (the spread cap is per tanda type) */
  rhythm?: string;
  /** the tanda size (cohesion R7: a vals pool too small for the cap gets one more year) */
  need?: number;
  /**
   * month indexes where a new period starts for an orchestra + singer (null = instrumental): singer stints, line-up
   * breaks and ≥ 18-month recording gaps over the whole catalogue (cohesion R3); the pool's own gaps when absent
   */
  breaks?: (orchestraId: string, singer: string | null, vocal: boolean) => number[];
  /** how much a side counts when a window is ranked (default: fame + 1, a stream, the heatmap grade) */
  sideWeight?: (s: Song) => number;
}
const monthOf = (s: Song) => {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(s.date ?? "");
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 6) : (dated(s) ?? 0) * 12 + 6;
};
/** cohesion R4: the default window weight — Σ(fame + 1) over resolvable sides, the user's heatmap grade on top */
export const defaultSideWeight = (s: Song) =>
  ((s.fame ?? 0) + 1) *
  (s.resolved || s.spotify ? 1 : 0.5) *
  (s.heat === 4 ? 1.2 : s.heat === 3 || s.heat === undefined ? 1 : s.heat === 2 ? 0.6 : 0.2);

/**
 * Group songs into coherent families: same orchestra + same singer (or instrumental) + tight year window.
 * Rows whose year is a decade placeholder (`yearApprox`) cannot define a window: they form a separate
 * "undated" family per orchestra/singer that the track scorer weights at 0.6.
 *
 * Round 13 (docs/reviews/round13-cohesion.md R1, R3, R4, R7): with `opts`, a family is first cut at its breaks (a
 * singer stint, a curated line-up break, a recording gap of 18 months or more), then each period is covered by
 * windows of the type's cap (vocal tango 2 years, instrumental 3, vals and milonga 2) anchored on the densest years:
 * the best window by Σ side weight is taken first, and the years left on either side are windowed again. A vals
 * period that cannot fill a tanda inside the cap gets one more year (`poolSmall`).
 */
export function families(
  pool: Song[],
  maxYearSpread: number,
  mixVocal: boolean,
  orchTotals?: Map<string, number>,
  opts?: FamilyOpts,
): TandaCandidate[] {
  const groups = new Map<string, Song[]>();
  const perOrch = new Map<string, number>();
  for (const s of pool) {
    const k = mixVocal ? s.orchestraId : `${s.orchestraId}|${s.singerId ?? "instr"}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
    perOrch.set(s.orchestraId, (perOrch.get(s.orchestraId) ?? 0) + 1);
  }
  const out: TandaCandidate[] = [];
  for (const songs of groups.values()) {
    const first = songs[0]!;
    const share =
      songs.length / Math.max(1, orchTotals?.get(first.orchestraId) ?? perOrch.get(first.orchestraId) ?? 1);
    const push = (bucket: Song[], undated: boolean, extra: Partial<TandaCandidate> = {}) => {
      if (!bucket.length) return;
      out.push({
        orchestraId: first.orchestraId,
        orchestra: first.orchestra,
        singer: mixVocal ? null : first.singer,
        vocal: mixVocal ? bucket.some((b) => b.vocal) : first.vocal,
        songs: bucket,
        singerShare: share,
        undated: undated || undefined,
        ...extra,
      });
    };
    const approx = songs.filter((s) => !dated(s));
    const sorted = songs
      .filter((s) => dated(s))
      .sort((a, b) => monthOf(a) - monthOf(b) || (dated(a) ?? 0) - (dated(b) ?? 0));
    if (!opts) {
      let bucket: Song[] = [];
      for (const s of sorted) {
        const y0 = bucket.length ? dated(bucket[0]!)! : null;
        if (y0 !== null && dated(s)! - y0 > maxYearSpread) {
          push(bucket, false);
          bucket = [];
        }
        bucket.push(s);
      }
      push(bucket, false);
      push(approx, true);
      continue;
    }
    const vocal = mixVocal ? sorted.some((s) => s.vocal) : first.vocal;
    const rhythm = opts.rhythm ?? first.rhythm;
    const cap = spreadCap(rhythm, vocal, maxYearSpread);
    const need = opts.need ?? 0;
    const weightOf = opts.sideWeight ?? defaultSideWeight;
    const bps = (
      opts.breaks?.(first.orchestraId, mixVocal ? null : first.singer, vocal) ??
      gapBreaks(sorted.map(monthOf))
    )
      .slice()
      .sort((a, b) => a - b);
    // the periods: a new one wherever a break falls between two consecutive sides
    const periods: Song[][] = [];
    let cur: Song[] = [];
    for (const s of sorted) {
      const prev = cur[cur.length - 1];
      if (prev && bps.some((bp) => monthOf(prev) < bp && bp <= monthOf(s))) {
        periods.push(cur);
        cur = [];
      }
      cur.push(s);
    }
    if (cur.length) periods.push(cur);
    // the smallest spread any `need` distinct sides of this family reach inside one period (cohesion §4.1)
    let floor = 99;
    for (const per of periods) {
      const ys = per.map((s) => dated(s)!);
      for (const y of new Set(ys)) {
        for (let sp = 0; sp <= 6; sp++) {
          const titles = new Set(
            per.filter((s) => dated(s)! >= y && dated(s)! <= y + sp).map((s) => normTitle(s.title)),
          );
          if (titles.size >= Math.max(1, need)) {
            floor = Math.min(floor, sp);
            break;
          }
        }
      }
    }
    const spreadFloor = floor === 99 ? undefined : floor;
    const windows = (per: Song[]) => {
      if (!per.length) return;
      const years = [...new Set(per.map((s) => dated(s)!))].sort((a, b) => a - b);
      const best = (c: number) => {
        let pick: { y: number; w: number; n: number } | null = null;
        for (const y of years) {
          const inside = per.filter((s) => dated(s)! >= y && dated(s)! <= y + c);
          const w = inside.reduce((a, s) => a + weightOf(s), 0);
          if (!pick || w > pick.w + 1e-9 || (Math.abs(w - pick.w) <= 1e-9 && inside.length > pick.n))
            pick = { y, w, n: inside.length };
        }
        return pick!;
      };
      let c = cap;
      let small = false;
      let b = best(c);
      const titles = (y: number, cc: number) =>
        new Set(per.filter((s) => dated(s)! >= y && dated(s)! <= y + cc).map((s) => normTitle(s.title))).size;
      if (rhythm === "vals" && need && c + 1 <= maxYearSpread && titles(b.y, c) < need) {
        const b2 = best(c + 1);
        if (titles(b2.y, c + 1) >= need) {
          c += 1;
          b = b2;
          small = true;
        }
      }
      push(
        per.filter((s) => dated(s)! >= b.y && dated(s)! <= b.y + c),
        false,
        { spreadFloor, ...(small ? { poolSmall: true } : {}) },
      );
      windows(per.filter((s) => dated(s)! < b.y));
      windows(per.filter((s) => dated(s)! > b.y + c));
    };
    for (const per of periods) windows(per);
    push(approx, true);
  }
  return out;
}

/**
 * Order the chosen songs inside the tanda: first the requested energy shape, then the corpus roles
 * (an opener opens, a closer closes) and, when roles are known, the least-known track as the third "test" track.
 */
export function shapeTanda(songs: Song[], shape: ComposeOptions["tandaShape"], rhythm?: string): Song[] {
  const s = songs
    .slice()
    .sort(
      (a, b) =>
        (a.energy ?? 50) - (b.energy ?? 50) ||
        (a.audio?.bpm ?? a.bpm ?? 0) - (b.audio?.bpm ?? b.bpm ?? 0) ||
        (a.year ?? 0) - (b.year ?? 0),
    ); // ascending
  const n = s.length;
  let out: Song[];
  if (n <= 2 || shape === "flat") out = s;
  else
    switch (shape) {
      case "rise":
        out = s;
        break;
      case "hammock": {
        out = n === 3 ? [s[1]!, s[0]!, s[2]!] : [s[n - 2]!, s[0]!, s[1]!, s[n - 1]!, ...s.slice(2, n - 2)];
        break;
      }
      case "peak-middle": {
        out = [s[0]!];
        const rest = s.slice(1);
        const top = rest.pop()!;
        const second = rest.pop();
        if (second) out.push(second);
        out.push(top);
        out.push(...rest.reverse());
        break;
      }
      default: {
        out = n === 3 ? s : [s[0]!, s[1]!, s[n - 1]!, ...s.slice(2, n - 1)];
      } // rise-settle
    }
  return enforceOrder(applyRoles(out), rhythm ?? songs[0]?.rhythm);
}

/**
 * Round 9, the rule behind the reviewer's reorders: in a 4-track tanda the most famous side goes 3rd or 4th (the
 * floor gets the hit once it is warm), and the slowest side never closes a tanda (a falling shape). Corpus roles win:
 * an opener stays first and a closer stays last whatever their fame or energy.
 */
export function enforceOrder(songs: Song[], rhythm?: string): Song[] {
  const n = songs.length;
  if (n < 3) return songs;
  const lift = rhythm === "vals" || rhythm === "milonga"; // round 10: a vals / milonga never ends on its lowest side, closer or not
  const out = songs.slice();
  const e = (s: Song) => s.energy ?? 50;
  const swap = (i: number, j: number) => {
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  };
  if (n >= 4) {
    const top = Math.max(...out.map((s) => s.fame ?? 0));
    const hits = out.map((s, i) => ({ s, i })).filter((x) => (x.s.fame ?? 0) === top);
    const hit = hits[0]!;
    // the third chair, or the fourth when the third holds a corpus closer; a corpus closer never moves to the front
    if (top > 0 && hits.length === 1 && hit.i < 2 && hit.s.role !== "opener") {
      const to =
        hit.i === 0 && out[2]!.role === "closer"
          ? out[3]!.role === "closer" || out[3]!.role === "opener"
            ? -1
            : 3
          : 2;
      if (to > 0) swap(hit.i, to);
    }
  }
  // round 11 (R4): the last side is a corpus closer, else one of the two hottest sides, and never a fame-0 side
  // when a fame ≥ 2 side is in the tanda (Maleza closing Pugliese with Hoy al recordarla third)
  const closerIdx = out.findIndex((s) => s.role === "closer");
  if (closerIdx >= 0 && closerIdx !== n - 1 && !lift) swap(closerIdx, n - 1);
  const lastNow = out[n - 1]!;
  const top2 = out
    .map(e)
    .sort((a, b) => b - a)
    .slice(0, 2);
  const minE = Math.min(...out.map(e));
  const uniqueMin = (s: Song) => e(s) === minE && out.filter((x) => e(x) === minE).length === 1;
  // a known side that is not the opener and not the tanda's one lowest side (that one never closes a vals/milonga)
  const hasFamous =
    out.some((s) => (s.fame ?? 0) >= 2) &&
    out.some((s) => (s.fame ?? 0) > 0 && s.role !== "opener" && !uniqueMin(s));
  const closerOk = (s: Song) => top2.includes(e(s)) && (!hasFamous || (s.fame ?? 0) > 0);
  if (!(lastNow.role === "closer" && !lift) && !closerOk(lastNow)) {
    // the hottest known side that is not the opener's chair takes the close
    const cands = out
      .map((s, i) => ({ s, i }))
      .filter(
        (x) => x.i < n - 1 && x.s.role !== "opener" && (!hasFamous || (x.s.fame ?? 0) > 0) && !uniqueMin(x.s),
      )
      .sort((a, b) => e(b.s) - e(a.s) || (b.s.fame ?? 0) - (a.s.fame ?? 0));
    const pick = cands.find((x) => top2.includes(e(x.s))) ?? cands[0];
    if (pick) swap(pick.i, n - 1);
  }
  // the hit stays in the third chair when the close moved it forward
  if (n >= 4) {
    const top = Math.max(...out.map((s) => s.fame ?? 0));
    const hits = out.map((s, i) => ({ s, i })).filter((x) => (x.s.fame ?? 0) === top);
    const closers = out.filter((s) => s.role === "closer").length;
    if (
      top > 0 &&
      hits.length === 1 &&
      hits[0]!.i < 2 &&
      hits[0]!.s.role !== "opener" &&
      (out[2]!.role !== "closer" || closers >= 2)
    ) {
      // a corpus closer never opens: when the third chair holds one, the hit rotates in behind it
      if (hits[0]!.i === 0 && out[2]!.role === "closer") {
        if (out[1]!.role !== "closer") {
          const [h, a, c] = [out[0]!, out[1]!, out[2]!];
          out[0] = a;
          out[1] = c;
          out[2] = h;
        }
      } else swap(hits[0]!.i, 2);
    }
  }
  const min = Math.min(...out.map(e));
  const last2 = out[n - 1]!;
  if (e(last2) === min && out.filter((s) => e(s) === min).length === 1 && last2.role !== "closer") {
    let j = n - 2;
    while (j >= 0 && (out[j]!.role === "opener" || (hasFamous && (out[j]!.fame ?? 0) === 0))) j--;
    if (j >= 0) swap(n - 1, j);
  }
  return out;
}

/** corpus roles: opener first, closer last; with known roles the least famous track becomes the third */
export function applyRoles(songs: Song[]): Song[] {
  const n = songs.length;
  if (n < 2 || !songs.some((s) => s.role === "opener" || s.role === "closer")) return songs;
  const byFame = (a: Song, b: Song) => (b.fame ?? 0) - (a.fame ?? 0);
  const openers = songs.filter((s) => s.role === "opener").sort(byFame);
  const closers = songs.filter((s) => s.role === "closer" && !openers.includes(s)).sort(byFame);
  const opener = openers[0] ?? null;
  const closer = closers[0] ?? null;
  const middle = songs.filter((s) => s !== opener && s !== closer);
  // without a corpus opener/closer the edge comes from the shape order, never from a track with the opposite role
  const head = opener ?? middle.find((s) => s.role !== "closer") ?? middle[0]!;
  const rest1 = middle.filter((s) => s !== head);
  const tail =
    closer ??
    rest1
      .slice()
      .reverse()
      .find((s) => s.role !== "opener") ??
    rest1[rest1.length - 1];
  const body = rest1.filter((s) => s !== tail);
  if (n >= 4 && body.length >= 2) {
    // least-known track in the third slot (Lavocah's "test track"), keep the others in shape order
    const low = body.slice().sort((a, b) => (a.fame ?? 0) - (b.fame ?? 0))[0]!;
    const others = body.filter((s) => s !== low);
    others.splice(1, 0, low);
    return [head, ...others, ...(tail ? [tail] : [])];
  }
  return [head, ...body, ...(tail ? [tail] : [])];
}

export interface BuildContext {
  recentOrchestras: string[];
  recentSingers: string[];
  usedTitles: Set<string>;
  usedSongIds: Set<string>;
  guardiaCount?: number;
  /** slots in the night, for shareOfNightMax */
  totalSlots?: number;
  /** per-night orchestra mood (0.6–1.4 per orchestra, drawn from the seed): a DJ has favourites on a given night */
  nightBias?: Map<string, number>;
  /** the slot compose() drew for the first D'Arienzo (the weight floor applies there only) */
  earlyDASlot?: number;
  /** energy and target of the previous tanda (gradual steps, corpus rule 15) */
  prevEnergy?: number;
  prevTarget?: number;
  /** families already played tonight (orchestra, singer, year window, rhythm): never the identical family twice */
  usedFamilies?: Array<{
    orchestraId: string;
    singer: string | null;
    rhythm: string;
    years: [number, number];
    /** round 13 (cohesion R9): the years the family's sides came from */
    yearSet?: number[];
  }>;
  /** round 9: preferred (canon) families still unplayed → an orchestra's second tango tanda steps back */
  canonPending?: boolean;
  /** round 13: the night so far, in play order (colour cap, edge cap, transitions, style runs) */
  history?: Tanda[];
  /** round 13: what the composer already knows the next slot holds (the drawn early D'Arienzo, the Pugliese slot) */
  next?: TransitionSide | null;
}
export interface CanonicalTanda {
  rhythm: string;
  orchestraId: string;
  singer?: string | null;
  years?: [number, number];
  titles?: string[];
  phase?: string;
  popularity?: number;
}
export interface Scoring {
  energy: (id: string) => number;
  phase: (id: string) => string[] | undefined;
  tier: (id: string) => number;
  notBefore: (id: string) => number;
  style: (id: string) => string | undefined;
  preferStyles?: string[];
  avoidStyles?: string[];
  isDanceable: (s: Song) => boolean;
  canonical?: CanonicalTanda[];
  guardiaOnly?: boolean;
  /** extra per-orchestra limits from profiles (already resolved to a number for tonight's hours) */
  maxPerNight?: (id: string) => number | undefined;
  notAfter?: (id: string) => number | undefined;
  neverClose?: (id: string) => boolean;
  nonDance?: (id: string, title: string, year?: number | null) => boolean;
  /** the whole curated profile, for subPeriods / bestYears / singerShift / followWith / shareOfNightMax / warmupOnly */
  profile?: (id: string) => OrchestraProfile | undefined;
  singerOk?: (id: string, singer: string | null) => boolean;
  /** families above this profile difficulty are avoided (beginner floors) */
  maxDifficulty?: number;
  /** −1..1 vocal bias, bpm-ish tempo shift (context, feedback) */
  vocalBias?: number;
  tempoShift?: number;
  /** round 11: a per-family weight factor from the composer (closer-class families held for the shoulder) */
  weightOf?: (c: TandaCandidate) => number;
  /** era preset preference (weight ×3) */
  preferOrchestras?: string[];
  /** families the night should carry (weight ×3 while unused): the golden canon (round 9) */
  preferFamilies?: PreferredFamily[];
  /** profile "do not place at the main peak" (round 9): excluded from planned peak slots */
  avoidMainPeak?: (id: string) => boolean;
  /** a relaxed scoring (caps and phases lifted): a played family may return rather than leave a hole (round 10) */
  relaxed?: boolean;
  /** round 13: a golden-purist night (core bands, colour cap, other-era sides out; golden-age review) */
  golden?: boolean;
  /** round 13: the reviewer's band overrides (off unless the night opts in) */
  bandOverrides?: boolean;
  /** round 13: the night's hours (colour and edge caps scale with them) */
  hours?: number;
  /** round 13: a preference layer (the hourly instrumental, …): return null rather than break more than this weight of rules */
  strict?: number;
}

const PHASE_STYLE: Record<string, Record<string, number>> = {
  warmup: {
    lyrical: 1.5,
    guardia: 1.3,
    balanced: 1.1,
    rhythmic: 0.7,
    dramatic: 0.3,
    nuevo: 0.4,
    contemporary: 0.5,
  },
  build: {
    lyrical: 1.1,
    guardia: 1.0,
    balanced: 1.2,
    rhythmic: 1.2,
    dramatic: 0.6,
    nuevo: 0.6,
    contemporary: 0.8,
  },
  peak: {
    lyrical: 0.6,
    guardia: 0.6,
    balanced: 1.0,
    rhythmic: 1.7,
    dramatic: 1.3,
    nuevo: 0.7,
    contemporary: 1.0,
  },
  cooldown: {
    lyrical: 1.5,
    guardia: 0.9,
    balanced: 1.1,
    rhythmic: 0.7,
    dramatic: 1.0,
    nuevo: 0.7,
    contemporary: 0.6,
  },
  close: {
    lyrical: 1.0,
    guardia: 0.8,
    balanced: 1.2,
    rhythmic: 1.4,
    dramatic: 1.2,
    nuevo: 0.4,
    contemporary: 0.5,
  },
};
const BPM_PIVOT: Record<DanceRhythm, number> = { tango: 124, vals: 180, milonga: 112 };

const meanYear = (songs: Song[]): number | null => {
  const ys = songs.map(dated).filter((y): y is number => !!y);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
};
/** the profile sub-period a family falls in (curated per-year-window phase/difficulty) */
export function subPeriodOf(p: OrchestraProfile | undefined, songs: Song[]) {
  const y = meanYear(songs);
  if (!p?.subPeriods?.length || y === null) return undefined;
  return p.subPeriods.find((sp) => y >= sp.years[0] - 0.5 && y <= sp.years[1] + 0.5);
}
export const isEarlyDArienzo = (c: TandaCandidate) => {
  const ys = c.songs.map(dated).filter((y): y is number => !!y);
  return (
    c.orchestraId === "juan-d-arienzo" &&
    !c.vocal &&
    ys.length > 0 &&
    Math.min(...ys) >= 1935 &&
    Math.max(...ys) <= 1939
  );
};

/** the phases a family is programmed for: its profile sub-period first, then the orchestra profile */
export function phasesFor(sc: Pick<Scoring, "profile" | "phase">, c: TandaCandidate): string[] | undefined {
  const sp = subPeriodOf(sc.profile?.(c.orchestraId), c.songs);
  return sp?.phase ?? sc.phase(c.orchestraId);
}
/** a family that may fill a planned peak slot (round 9): peak-phase material, never a "not at the main peak" profile */
export function peakOk(sc: Pick<Scoring, "profile" | "phase" | "avoidMainPeak">, c: TandaCandidate): boolean {
  if (sc.avoidMainPeak?.(c.orchestraId)) return false;
  const ph = phasesFor(sc, c);
  return !!ph && (ph.includes("peak") || ph.includes("any"));
}

/** round 13: the heatmap and best-years factor of one side (grade 4 ×1.3 … 0 ×0.2; best ×1.25, outside ×0.45) */
export function sideKnowledge(
  s: Song,
  p: OrchestraProfile | undefined,
  singer: string | null,
  overrides?: boolean,
): number {
  const h = s.heat;
  const heat = h === 4 ? 1.3 : h === 3 || h === undefined ? 1 : h === 2 ? 0.6 : h === 1 ? 0.5 : 0.2;
  const b = familyBand(p, singer, dated(s), overrides);
  return heat * (b === "best" ? 1.25 : b === "outside" ? 0.45 : 1);
}

/**
 * Round 13 (cohesion R2, R5, R8): the k sides of one year window (span ≤ 1 year, or a date span ≤ 18 months) that
 * keep at least 70 % of the best k sides' weight; the ranked list itself when no such window exists.
 */
export function tightWindow<T extends { s: Song; w: number }>(ranked: T[], need: number): T[] {
  const top = (xs: T[]) => {
    const seen = new Set<string>();
    let sum = 0;
    for (const r of xs) {
      const k = normTitle(r.s.title);
      if (seen.has(k)) continue;
      seen.add(k);
      sum += r.w;
      if (seen.size >= need) return sum;
    }
    return -1;
  };
  const full = top(ranked);
  if (full <= 0) return ranked;
  const ys = [...new Set(ranked.map((r) => dated(r.s)).filter((y): y is number => !!y))];
  if (ys.length <= 1) return ranked;
  let best: { sub: T[]; v: number } | null = null;
  for (const y of ys) {
    const sub = ranked.filter((r) => {
      const ry = dated(r.s);
      return !!ry && ry >= y && ry <= y + 1;
    });
    const v = top(sub);
    if (v > 0 && (!best || v > best.v)) best = { sub, v };
  }
  return best && best.v >= 0.7 * full ? best.sub : ranked;
}

/** cohesion R6: a reading folded into the profile's bpm band (×½ … ×2 and the tracker's candidates), or undefined */
export function foldedBpm(s: Song, band: [number, number] | undefined): number | undefined {
  const a = s.audio;
  if (!band || !a?.bpm || (a.pulseClarity ?? 0) < 0.7) return undefined;
  const mid = (band[0] + band[1]) / 2;
  const opts = [a.bpm, ...(a.bpmCandidates ?? [])].flatMap((b) =>
    [0.5, 2 / 3, 0.75, 0.8, 1, 1.25, 4 / 3, 1.5, 2].map((f) => b * f),
  );
  const inside = opts.filter((b) => b >= band[0] - 4 && b <= band[1] + 4);
  return inside.length ? inside.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0] : undefined;
}

export function buildTanda(
  slot: Slot,
  cands: TandaCandidate[],
  o: ComposeOptions,
  rng: Rng,
  ctx: BuildContext,
  sc: Scoring,
): Tanda | null {
  const need = slot.size;
  const allowUndated = !!o.rules?.allowUndated;
  const enough = (xs: Song[]) => new Set(xs.map((s) => normTitle(s.title))).size >= need;
  const keepIf = (xs: Song[], pred: (s: Song) => boolean) => {
    const f = xs.filter(pred);
    return f.length === xs.length || !enough(f) ? xs : f;
  };
  const availMemo = new Map<TandaCandidate, Song[]>();
  /** families that can only fill the tanda with a collection-reissue row (round 13: windows are smaller now) */
  const needsReissue = new Set<TandaCandidate>();
  const availOf = (c: TandaCandidate): Song[] => {
    let v = availMemo.get(c);
    if (!v) {
      v = availOf0(c);
      availMemo.set(c, v);
    }
    return v;
  };
  const availOf0 = (c: TandaCandidate) => {
    const all = c.songs.filter(
      (s) =>
        sc.isDanceable(s) &&
        isTandaEligible(s, allowUndated) &&
        songRhythm(s) === slot.rhythm &&
        !sc.nonDance?.(c.orchestraId, s.title, s.year) &&
        !ctx.usedSongIds.has(s.id) &&
        (!o.avoidTitleRepeats || !ctx.usedTitles.has(normTitle(s.title))),
    );
    // round 10: a suspect side (> 3:20 or an over-length stream, whatever its fame) is dropped while the family has
    // another side; a collection-reissue row while the family has one more than it needs
    const sound = all.filter((s) => !isSuspectSide(s));
    const clean = sound.filter((s) => !s.reissue);
    let out = clean.length >= need ? clean : sound;
    if (clean.length < need && sound.some((s) => s.reissue)) needsReissue.add(c);
    // round 13 — the user's heatmap: a grade-0 year ("avoid") never enters while the family has alternatives, a
    // grade-1 year ("single tracks only") only with its known singles (fame ≥ 2)
    out = keepIf(out, (s) => s.heat !== 0);
    out = keepIf(out, (s) => s.heat !== 1 || (s.fame ?? 0) >= 2);
    const p = sc.profile?.(c.orchestraId);
    if (sc.golden) {
      // best-years bands: a side outside its family's bands leaves a golden night while the family has enough in band
      out = keepIf(out, (s) => familyBand(p, c.singer, dated(s), sc.bandOverrides) !== "outside");
      // golden core (golden-age review §2): the family's core years first, then core + edge, never another era
      if (p?.goldenBands) {
        const cls = (s: Song) => goldenClassOf(p, [dated(s) ?? 0]);
        const core = out.filter((s) => cls(s) === "core");
        const edge = out.filter((s) => cls(s) !== "other");
        out = enough(core) ? core : enough(edge) ? edge : out;
      }
    }
    // cohesion R9: an orchestra + singer that played this rhythm tonight comes back from other years
    const played = new Set(
      (ctx.usedFamilies ?? [])
        .filter(
          (f) =>
            f.orchestraId === c.orchestraId &&
            (f.singer ?? "") === (c.singer ?? "") &&
            f.rhythm === slot.rhythm,
        )
        .flatMap((f) => f.yearSet ?? []),
    );
    if (played.size) out = keepIf(out, (s) => !played.has(dated(s) ?? 0));
    return out;
  };
  const count = (id: string) => ctx.recentOrchestras.filter((x) => x === id).length;
  const cap = (id: string) => {
    const m = sc.maxPerNight?.(id);
    let base = m ?? (CORPUS_CAPS[id] ?? DEFAULT_CAP) + (o.hours > 5 ? 2 : 0); // a marathon needs its regulars thrice
    const share = sc.profile?.(id)?.shareOfNightMax;
    if (share && ctx.totalSlots) base = Math.min(base, Math.max(1, Math.ceil(share * ctx.totalSlots)));
    return base;
  };
  const isGuardia = (c: TandaCandidate) =>
    c.songs.every((s) => s.era === "guardia-vieja" || s.era === "guardia-nueva");
  const isLast = slot.phase === "close";
  const phasesOf = (c: TandaCandidate): string[] | undefined => phasesFor(sc, c);
  const viableAll = cands.filter((c) => {
    if (slot.peak && !peakOk(sc, c)) return false; // a planned summit takes peak material only (round 9)
    if (slot.position < sc.notBefore(c.orchestraId)) return false;
    const na = sc.notAfter?.(c.orchestraId);
    if (na !== undefined && slot.position > na && !isLast) return false;
    if (isLast && sc.neverClose?.(c.orchestraId)) return false;
    if (count(c.orchestraId) >= cap(c.orchestraId)) return false;
    if (slot.index === 0 && NEVER_OPEN.has(c.orchestraId)) return false;
    if (sc.singerOk && !sc.singerOk(c.orchestraId, c.singer)) return false;
    if (phasesOf(c)?.length === 0) return false; // sub-period marked "not for dancing" (Troilo 1950s …)
    // a second Pugliese only in the last quarter (6 h+ nights: instrumentals ~45 %, vocal ~85 %)
    if (c.orchestraId === "osvaldo-pugliese" && count(c.orchestraId) >= 1 && slot.position < 0.75)
      return false;
    if (!sc.guardiaOnly && isGuardia(c) && ((ctx.guardiaCount ?? 0) >= 1 || slot.position > 0.4))
      return false; // ≤1 Guardia Vieja tanda, first 40 %
    return new Set(availOf(c).map((s) => normTitle(s.title))).size >= need;
  });
  // hard phase filter: an orchestra programmed for other phases only enters when nothing else fits;
  // the close slot accepts peak and cool-down orchestras alike (a night ends strong, it does not fade)
  const phaseOk = (c: TandaCandidate) => {
    const ph = phasesOf(c);
    return (
      !ph ||
      ph.includes(slot.phase) ||
      ph.includes("any") ||
      (slot.phase === "close" && (ph.includes("cooldown") || ph.includes("peak")))
    );
  };
  // context: avoided styles and too-difficult families are excluded outright while three alternatives remain
  const prof = (c: TandaCandidate) => sc.profile?.(c.orchestraId);
  const contextOk = (c: TandaCandidate) => {
    const st = sc.style(c.orchestraId) ?? "balanced";
    if (sc.avoidStyles?.includes(st)) return false;
    const diff = subPeriodOf(prof(c), c.songs)?.difficulty ?? prof(c)?.difficulty;
    return !(sc.maxDifficulty !== undefined && diff !== undefined && diff > sc.maxDifficulty);
  };
  // after Pugliese (profile followWith): a vals, a milonga or a rhythmic / balanced tango — a filter while three
  // such families remain (round 9: the weight alone let Demare follow him)
  const prevFollow = ctx.recentOrchestras[0] ? sc.profile?.(ctx.recentOrchestras[0])?.followWith : undefined;
  const followOk = (c: TandaCandidate) => {
    if (!prevFollow?.length || slot.rhythm !== "tango") return true;
    const st = sc.style(c.orchestraId) ?? "balanced";
    return prevFollow.includes(st) || st === "balanced";
  };
  const viableF0 = viableAll.filter(followOk).length >= 1 ? viableAll.filter(followOk) : viableAll;
  // round 10 (corpus rule 15): never two dramatic tandas back to back (Gobbi straight into Pugliese)
  const prevDramatic = ctx.recentOrchestras[0] ? sc.style(ctx.recentOrchestras[0]) === "dramatic" : false;
  const notDramatic = (c: TandaCandidate) => !prevDramatic || sc.style(c.orchestraId) !== "dramatic";
  // round 13: "three alternatives" are three orchestras (a family now comes as several year windows)
  const orchs = (xs: TandaCandidate[]) => new Set(xs.map((c) => c.orchestraId)).size;
  const viableF = orchs(viableF0.filter(notDramatic)) >= 3 ? viableF0.filter(notDramatic) : viableF0;
  const viable0 = orchs(viableF.filter(contextOk)) >= 3 ? viableF.filter(contextOk) : viableF;
  // round 13: the three alternatives are counted among the families the repeat gaps allow here (a phase filter that
  // leaves only gap-blocked orchestras turned a peak milonga into a tango fallback)
  const gapFree0 = (c: TandaCandidate) => {
    const io = ctx.recentOrchestras.indexOf(c.orchestraId);
    return io === -1 || io >= o.orchestraRepeatGap - 1;
  };
  const viable1 =
    orchs(viable0.filter((c) => phaseOk(c) && gapFree0(c))) >= 3 ? viable0.filter(phaseOk) : viable0;
  // the first vals/milonga of the night (≤ 20 %) is a warm-up tanda: a family more than 10 points above the slot's
  // target (Rodríguez–Moreno, Biagi valses at e72 for t51) is out while three cooler alternatives remain (≤ +8)
  // judged on what the tanda would deliver: the `need` coolest sides of the family (Canaro–Maida has 16 valses)
  const meanE = (c: TandaCandidate) => {
    const es = availOf(c)
      .map((s) => s.energy ?? 50)
      .sort((a, b) => a - b)
      .slice(0, need);
    return es.reduce((a, e) => a + e, 0) / Math.max(1, es.length);
  };
  const cool = (c: TandaCandidate) => meanE(c) <= slot.targetEnergy + 8;
  const warm = slot.rhythm !== "tango" && slot.position <= 0.2;
  // the identical family (orchestra, singer, overlapping years, rhythm) never plays twice in a night (round 9 makes
  // the round-8 ×0.08 a filter: a narrow vocal layer let Tanturi–Castillo 1941–42 back at 4 and 18)
  const yearsOf = (c: TandaCandidate): [number, number] | null => {
    const ys = availOf(c)
      .map(dated)
      .filter((y): y is number => !!y);
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  };
  // round 10: the same orchestra + singer never plays two tango tandas whatever the years (Rodríguez–Moreno 1941 and
  // 1945 is "Rodríguez again" to the floor); the D'Arienzo instrumentals are the exception (early slot and summit),
  // and a night of 5 h and more keeps the round-9 reading (overlapping years) so its regulars can return
  // round 11: the floor hears "Láurenz milonga again", "Tanturi again" whatever the singer — one tanda per
  // (orchestra, rhythm) in a night under 5 h, D'Arienzo's tango tandas excepted (his cap of three); a marathon keeps
  // the round-9 reading (the identical family, overlapping years)
  const playedFamily = (c: TandaCandidate) => {
    const yr = yearsOf(c);
    const daTango = c.orchestraId === "juan-d-arienzo" && slot.rhythm === "tango";
    // the planned summit may bring back the instrumental family the early slot opened (El flete, El internado …)
    if (daTango && !c.vocal && slot.peak) return false;
    // round 14 (DJ review S5): on a golden night an orchestra may play two tango tandas in different modes or with
    // different singers (Di Sarli instrumental and Di Sarli–Rufino); vals and milonga stay one each
    if (o.hours < 5 && !daTango && sc.golden && slot.rhythm === "tango") {
      const mine = (ctx.usedFamilies ?? []).filter(
        (f) => f.orchestraId === c.orchestraId && f.rhythm === "tango",
      );
      return mine.length >= 2 || mine.some((f) => (f.singer ?? "") === (c.singer ?? ""));
    }
    if (o.hours < 5 && !daTango)
      return !!ctx.usedFamilies?.some((f) => f.orchestraId === c.orchestraId && f.rhythm === slot.rhythm);
    return (
      !!yr &&
      !!ctx.usedFamilies?.some(
        (f) =>
          f.orchestraId === c.orchestraId &&
          (f.singer ?? "") === (c.singer ?? "") &&
          f.rhythm === slot.rhythm &&
          f.years[0] <= yr[1] + 1 &&
          yr[0] <= f.years[1] + 1,
      )
    );
  };
  // a tango slot with only played families left returns null: the caller's wider layer or pool takes over (a rule
  // that names the closer, "D'Arienzo instrumental", may bring his family back for the última)
  const namedCloser =
    isLast && (o.rules?.ultimaRule === "d-arienzo-rhythmic" || o.rules?.ultimaRule === "pugliese");
  const unplayed = viable1.filter((c) => !playedFamily(c));
  if (!unplayed.length && slot.rhythm === "tango" && !namedCloser && !sc.relaxed) return null;
  const viable1p = unplayed.length ? unplayed : viable1;
  // the gap as the scorer and the invariants read it: an orchestra at i may return at i + gap (gap − 1 tandas
  // between); round 10 aligned the builder with that reading (it used to demand one more)
  const gapOk = (c: TandaCandidate) => {
    const io = ctx.recentOrchestras.indexOf(c.orchestraId);
    if (io !== -1 && io < o.orchestraRepeatGap - 1) return false;
    if (c.singer) {
      const is = ctx.recentSingers.indexOf(c.singer);
      if (is !== -1 && is < o.singerRepeatGap) return false;
    }
    return true;
  };
  // round 10 — the fame floor: after 20 % a vocal tango family must hold three sides the corpus knows (fame ≥ 2) and
  // the opener family at least one known side, while three such families remain
  const strongEnough = (c: TandaCandidate) =>
    !c.vocal || slot.rhythm !== "tango" || slot.position < 0.2
      ? true
      : availOf(c).filter((s) => (s.fame ?? 0) >= 2).length >= Math.min(3, need - 1);
  const knownOpener = (c: TandaCandidate) =>
    slot.index !== 0 || meanE(c) > slot.targetEnergy + 10 || availOf(c).some((s) => (s.fame ?? 0) > 0);
  // the opener itself is a warm-up tanda: a family more than 10 over its target steps back while three cooler remain
  const coolOpener = (c: TandaCandidate) => slot.index !== 0 || meanE(c) <= slot.targetEnergy + 10;
  // counted among the vocal families only, so the floor keeps its voices and loses the deep-cut sets
  // a weak vocal family (fewer than three known sides) plays only when nothing strong, vocal or instrumental, is
  // gap-free; a vocal-only layer (the night owes the floor a voice) keeps the weak ones when no strong voice is left
  const strongAny = viable1p.filter((c) => strongEnough(c) && gapOk(c)).length;
  const viable1s = strongAny >= 1 ? viable1p.filter(strongEnough) : viable1p;
  const viable1k = orchs(viable1s.filter(knownOpener)) >= 3 ? viable1s.filter(knownOpener) : viable1s;
  const viable1f = orchs(viable1k.filter(coolOpener)) >= 3 ? viable1k.filter(coolOpener) : viable1k;
  // round 14 (dancer R14-2): on a golden night the families that can fill the slot with known sides come first, and
  // the warm-up's cool-family filter works inside them (it used to leave only the obscure valses)
  const famePre = (c: TandaCandidate) => {
    const top = availOf(c)
      .map((x) => x.fame ?? 0)
      .sort((a, b) => b - a)
      .slice(0, need);
    const hot = !!slot.peak || slot.phase === "peak" || slot.targetEnergy >= 78 || slot.position >= 0.76;
    return (
      top.length >= need &&
      top.filter((f) => f === 0).length <= 1 &&
      top.reduce((a, b) => a + b, 0) / need >= (hot ? 3 : 2.5)
    );
  };
  const strict14 = !!sc.golden && (sc.hours ?? o.hours) < 5;
  const viable1g = strict14 && viable1f.some(famePre) ? viable1f.filter(famePre) : viable1f;
  const viable2 =
    warm && viable1g.filter((c) => cool(c) && (!strict14 || gapOk(c))).length >= (strict14 ? 1 : 3)
      ? viable1g.filter((c) => cool(c) && (!strict14 || gapOk(c)))
      : viable1g;
  // round 14 (DJ S4): on a golden night a voice sings one tango tanda (a second time only in a vals or a milonga,
  // never a third), whenever another family can take the slot
  const sur14v = (x: string | null | undefined) =>
    normTitle(x ?? "")
      .split(" ")
      .pop() ?? "";
  const sung = (c: TandaCandidate) => {
    if (!c.vocal || !c.singer) return false;
    const mine = (ctx.history ?? []).filter((t) => t.vocal && sur14v(t.singer) === sur14v(c.singer));
    return mine.length >= 2 || (slot.rhythm === "tango" && mine.some((t) => t.rhythm === "tango"));
  };
  const viable = strict14 && viable2.some((c) => !sung(c)) ? viable2.filter((c) => !sung(c)) : viable2;
  if (!viable.length) return null;
  let gapPool = viable.filter(gapOk);
  // a pool of one or two families (an "only X" night) or a rule that names the closer may break the gap; a real pool
  // never does (round 10)
  // (round 14: judged on the pool before the panel's filters, which may leave one or two families on any night)
  if (!gapPool.length && ((viable1p.length <= 2 && !isLast) || namedCloser))
    gapPool = viable.filter(
      (c) => ctx.recentOrchestras[0] !== c.orchestraId && (!c.singer || ctx.recentSingers[0] !== c.singer),
    );
  if (!gapPool.length) return null; // never the same orchestra twice in a row; the caller falls back to a tango tanda
  // obscure one-off singers (fame 0, small singer share) do not open a night: a filter for the first vals / milonga
  // whenever the gaps leave a known family (round 9: the weight alone let Canaro–Roldán through)
  const known = (c: TandaCandidate) =>
    !c.singer || c.singerShare >= 0.12 || availOf(c).some((s) => (s.fame ?? 0) > 0);
  // round 13 — golden-purist caps (golden-age review R1, R2) and the transition hard rules (transitions review §2.3),
  // each a filter while it leaves a family to choose from
  const hist = ctx.history ?? [];
  const prevT = hist[hist.length - 1];
  const prevPrevT = hist[hist.length - 2];
  const hours = sc.hours ?? o.hours;
  const yearsAv = (c: TandaCandidate) =>
    availOf(c)
      .map(dated)
      .filter((y): y is number => !!y);
  const colourOk = (c: TandaCandidate) => {
    if (!isColour(prof(c))) return true;
    const colourT = hist.filter((t) => isColour(sc.profile?.(t.orchestraId)));
    // round 14 (DJ S11): no colour tanda on the profile → at most 2 per 4 h, at least 4 slots apart
    const noColour = o.rules?.colourTanda === false && hours < 5;
    const capC = noColour ? Math.max(1, Math.round(hours / 2)) : Math.max(1, Math.floor(0.75 * hours));
    if (colourT.length >= capC) return false;
    if (noColour && colourT.length && slot.index - colourT[colourT.length - 1]!.index < 4) return false;
    // the warm-up spends at most all but one of them: the late night keeps a colour chair for its thin pools
    if (slot.position < 0.5 && colourT.length >= capC - 1) return false;
    const same = colourT.filter((t) => t.orchestraId === c.orchestraId);
    const vmPair = slot.rhythm !== "tango" || same.some((t) => t.rhythm !== "tango");
    if (same.length >= (c.orchestraId === "francisco-canaro" && vmPair && !noColour ? 2 : 1)) return false;
    if (prevT && isColour(sc.profile?.(prevT.orchestraId))) return false;
    if (nonCore() >= nonCoreMax) return false;
    return !(slot.peak || slot.phase === "peak" || slot.targetEnergy >= 78);
  };
  // golden-age review §5: at most a fifth of the night outside the family cores (colour, edge, no band)
  const nonCoreMax = Math.max(1, Math.floor(0.2 * (ctx.totalSlots ?? Math.round(hours * 5.5))));
  const nonCore = () =>
    hist.filter((t) => isColour(sc.profile?.(t.orchestraId)) || (t.golden ?? "none") !== "core").length;
  const edgeOk = (c: TandaCandidate) => {
    const p0 = prof(c);
    const cls = p0?.goldenBands ? goldenClassOf(p0, yearsAv(c)) : "edge";
    if (cls === undefined || cls === "core") return true;
    if (cls === "other") return false;
    if (!isColour(p0) && nonCore() >= nonCoreMax) return false;
    const edgeT = hist.filter(
      (t) => !isColour(sc.profile?.(t.orchestraId)) && (t.golden ?? "none") !== "core",
    );
    if (edgeT.length >= Math.max(1, Math.round(hours / 2))) return false;
    if (edgeT.some((t) => t.orchestraId === c.orchestraId)) return false;
    return !(slot.peak || slot.phase === "peak" || slot.targetEnergy >= 78);
  };
  // another era altogether (Di Sarli 1951+, D'Arienzo 1950s on a golden night): the last resort
  const otherOk = (c: TandaCandidate) => goldenClassOf(prof(c), yearsAv(c)) !== "other";
  const bandOk = (c: TandaCandidate) =>
    availOf(c).some((s) => familyBand(prof(c), c.singer, dated(s), sc.bandOverrides) !== "outside");
  const estE = (c: TandaCandidate) => {
    const es = availOf(c)
      .map((s) => s.energy ?? 50)
      .sort((a, b) => Math.abs(a - slot.targetEnergy) - Math.abs(b - slot.targetEnergy))
      .slice(0, need);
    return es.reduce((a, e) => a + e, 0) / Math.max(1, es.length);
  };
  const tangoVocals = hist.filter((t) => t.rhythm === "tango").map((t) => t.vocal);
  const pairMemo = new Map<TandaCandidate, ReturnType<typeof pairScore> | null>();
  const candSide = (c: TandaCandidate): TransitionSide => ({
    orchestraId: c.orchestraId,
    style: sc.style(c.orchestraId),
    rhythm: slot.rhythm,
    vocal: c.vocal,
    energy: estE(c),
    targetEnergy: slot.targetEnergy,
    phase: slot.phase,
    peak: slot.peak,
    meanYear: meanYear(availOf(c)),
  });
  const pairOf = (c: TandaCandidate) => {
    if (!prevT) return null;
    if (!pairMemo.has(c))
      pairMemo.set(
        c,
        pairScore(sideOf(prevT), candSide(c), {
          before: prevPrevT ? sideOf(prevPrevT) : null,
          tangoVocals,
          profileOf: (id) => sc.profile?.(id),
        }),
      );
    return pairMemo.get(c)!;
  };
  const tripleTonight = hist.some((t, i) => {
    if (i < 2) return false;
    const pf = (id: string) => sc.profile?.(id);
    const k = styleClass(t, pf);
    return styleClass(hist[i - 1]!, pf) === k && styleClass(hist[i - 2]!, pf) === k;
  });
  // the planned next tanda (early D'Arienzo, Pugliese): the handover into it is weighed too
  const fwdMemo = new Map<TandaCandidate, ReturnType<typeof pairScore> | null>();
  const fwdOf = (c: TandaCandidate) => {
    if (!ctx.next) return null;
    if (!fwdMemo.has(c))
      fwdMemo.set(
        c,
        pairScore(candSide(c), ctx.next, {
          before: prevT ? sideOf(prevT) : null,
          tangoVocals: slot.rhythm === "tango" ? [...tangoVocals, c.vocal] : tangoVocals,
          profileOf: (id) => sc.profile?.(id),
        }),
      );
    return fwdMemo.get(c)!;
  };
  const fwdOk = (c: TandaCandidate) => {
    const ps = fwdOf(c);
    if (!ps) return true;
    if (ps.hard.some((h) => h !== "H5")) return false;
    const ya = meanYear(availOf(c));
    return !(
      slot.rhythm === "tango" &&
      ctx.next!.rhythm === "tango" &&
      ya !== null &&
      ctx.next!.meanYear !== null &&
      Math.abs(ya - ctx.next!.meanYear) > 6
    );
  };
  const transOk = (c: TandaCandidate) => {
    const ps = pairOf(c);
    if (!ps) return true;
    if (ps.hard.length) return false;
    // H4 before the cue is chosen: a tango → tango step of more than 6 years is avoided (a bridge cue is not promised)
    const ya = meanYear(prevT!.songs);
    const yb = meanYear(availOf(c));
    // (the main summit's D'Arienzo instrumental may take the step: the bridge fixer pairs a cue for it)
    if (
      !(slot.peak && c.orchestraId === "juan-d-arienzo" && !c.vocal) &&
      slot.rhythm === "tango" &&
      prevT!.rhythm === "tango" &&
      ya !== null &&
      yb !== null &&
      Math.abs(ya - yb) > 6
    )
      return false;
    // H2: one same-class triple a night, never touching a peak
    if (prevPrevT) {
      const pf = (id: string) => sc.profile?.(id);
      const k = styleClass(candSide(c), pf);
      if (styleClass(prevT!, pf) === k && styleClass(prevPrevT, pf) === k)
        return (
          !tripleTonight &&
          !slot.peak &&
          slot.phase !== "peak" &&
          prevT!.phase !== "peak" &&
          prevPrevT.phase !== "peak"
        );
    }
    return true;
  };
  // the user's heatmap at family level: a family whose every side comes from grade-0 years
  const heatOk = (c: TandaCandidate) => availOf(c).some((s) => s.heat !== 0);
  // round 14 — the strict panel's per-slot rules (docs/specs/round14-engine.md), weighed with the others
  const H14 = Math.max(1, Math.round(hours));
  const hourStart = Math.floor(slot.position * H14) / H14;
  const posOf14 = (t: Tanda) => t.index / Math.max(1, (ctx.totalSlots ?? hist.length + 1) - 1);
  const hourInstrNeed =
    slot.rhythm === "tango" &&
    slot.position >= hourStart + 0.55 / H14 &&
    !hist.some((t) => t.rhythm === "tango" && !t.vocal && posOf14(t) >= hourStart - 1e-9);
  const pf14 = (id: string) => sc.profile?.(id);
  const hotSlot14 = !!slot.peak || slot.phase === "peak" || slot.targetEnergy >= 78;
  const lateSlot14 = slot.position >= 0.76;
  /** dancer R14-2, R14-11: the family can fill the tanda with known, streamable sides */
  const fameOk = (c: TandaCandidate) => {
    const av = availOf(c);
    const top = av
      .map((x) => x.fame ?? 0)
      .sort((a, b) => b - a)
      .slice(0, need);
    if (top.length < need) return false;
    const mean = top.reduce((a, b) => a + b, 0) / need;
    return top.filter((f) => f === 0).length <= 1 && mean >= (hotSlot14 || lateSlot14 ? 3 : 2.5);
  };
  const streamOk = (c: TandaCandidate) =>
    availOf(c).filter((x) => (x.fame ?? 0) >= 2 && (x.spotify || x.resolved)).length >=
    (slot.index === 0 || slot.peak || isLast ? need : need - 1);
  /** DJ S1, S6: no third rhythmic tango tanda in a row, R+ instrumentals ≥ 2 tango tandas apart, ≤ 3 vocal in a row */
  const tangoHist = hist.filter((t) => t.rhythm === "tango");
  const rhythmicK = (k: string) => k === "R" || k === "R+";
  const runOk = (c: TandaCandidate) => {
    if (slot.rhythm !== "tango") return true;
    const k = styleClass(candSide(c), pf14);
    const l2 = tangoHist.slice(-2).map((t) => styleClass(t, pf14));
    if (rhythmicK(k) && l2.length === 2 && l2.every(rhythmicK)) return false;
    if (k === "R+" && !c.vocal && tangoHist.slice(-2).some((t) => styleClass(t, pf14) === "R+" && !t.vocal))
      return false;
    // the planned next tanda (the early D'Arienzo) closes a run too
    const nx = ctx.next && ctx.next.rhythm === "tango" ? styleClass(ctx.next, pf14) : null;
    if (nx && rhythmicK(k) && rhythmicK(nx) && l2.length >= 1 && rhythmicK(l2[l2.length - 1]!)) return false;
    const l3 = tangoHist.slice(-3);
    return !(c.vocal && (sc.vocalBias ?? 0) < 0.2 && l3.length === 3 && l3.every((t) => t.vocal));
  };
  /** DJ S4: one tango tanda per singer, never three appearances */
  const sur14 = (x: string | null | undefined) =>
    normTitle(x ?? "")
      .split(" ")
      .pop() ?? "";
  const singerOnceOk = (c: TandaCandidate) => {
    if (!c.vocal || !c.singer) return true;
    const mine = hist.filter((t) => t.vocal && sur14(t.singer) === sur14(c.singer));
    return mine.length < 2 && !(slot.rhythm === "tango" && mine.some((t) => t.rhythm === "tango"));
  };
  /** DJ B3: a dramatic tanda never straight after a hard-drive summit or a ≤ 1940 R+ tanda */
  const dramaticOk = (c: TandaCandidate) => {
    if (!prevT || sc.style(c.orchestraId) !== "dramatic") return true;
    if (styleClass(prevT, pf14) !== "R+") return true;
    const my = meanYear(prevT.songs);
    return !(prevT.peak || (my !== null && my <= 1940));
  };
  /** dancer R14-5, R14-17: the family's best sides can open on a known side and end on one of the best */
  const orderOk = (c: TandaCandidate) => {
    const picks = availOf(c)
      .slice()
      .sort(
        (a, b) =>
          (b.fame ?? 0) - (a.fame ?? 0) ||
          Number(!!(b.spotify || b.resolved)) - Number(!!(a.spotify || a.resolved)),
      )
      .slice(0, need);
    if (picks.length < need) return false;
    // every rule of the order (the strict panel's and the older corpus-role rules) holds for some order
    return orderCost(picks, hotSlot14) < 9;
  };
  /** DJ S6: late in a clock hour with no instrumental tango tanda yet, the slot goes instrumental */
  const hourInstrOk = (c: TandaCandidate) => !hourInstrNeed || !c.vocal || (sc.vocalBias ?? 0) >= 0.2;
  /** dancer R14-7a: a planned peak holds two hits of fame ≥ 4 */
  const hitsOk = (c: TandaCandidate) =>
    !slot.peak || availOf(c).filter((x) => (x.fame ?? 0) >= 4).length >= 2;
  /** DJ S7, dancer R14-9: the tanda before the última carries the floor into it (≥ e66, every side streams) */
  const wedgeOk = (c: TandaCandidate) => {
    if (
      !sc.golden ||
      ctx.totalSlots === undefined ||
      slot.index !== ctx.totalSlots - 2 ||
      slot.rhythm !== "tango"
    )
      return true;
    const top = availOf(c)
      .filter((x) => (x.fame ?? 0) >= 2)
      .sort((a, b) => (b.energy ?? 50) - (a.energy ?? 50));
    return estE(c) >= 66 && top.filter((x) => x.spotify || x.resolved).length >= need;
  };
  /** dancer R14-6a: a slot planned at 78 and more gets a tanda within 8 of it */
  const hotEnergyOk = (c: TandaCandidate) =>
    slot.targetEnergy < 78 || isLast || estE(c) >= slot.targetEnergy - 8;
  /** dancer R14-6, DJ S12: a slot planned at 78 and more takes a first-tier orchestra */
  const tierOk = (c: TandaCandidate) =>
    slot.targetEnergy < 78 ||
    isLast ||
    ((pf14(c.orchestraId)?.tier ?? 3) <= 1 && !isColour(pf14(c.orchestraId)));
  // the rules are weighed together: the families breaking the fewest of them stay (one broken rule never wins over
  // another by the order they are checked in)
  const preds: Array<[(c: TandaCandidate) => boolean, number]> = [
    [heatOk, 3],
    [(c) => (availOf(c), !needsReissue.has(c)), 2],
    [transOk, 2],
    // a step of more than nine years on any boundary (H4's absolute limit) weighs one more
    [(c) => !(pairOf(c)?.hard.includes("H4") ?? false), 1],
    [fwdOk, 2],
    ...(sc.golden
      ? ([
          [colourOk, strict14 ? 5 : 4],
          [edgeOk, 2],
          [otherOk, 5],
          [bandOk, 1],
        ] as Array<[(c: TandaCandidate) => boolean, number]>)
      : []),
    ...(strict14
      ? ([
          [fameOk, 6],
          [streamOk, 2],
          [runOk, 2],
          [singerOnceOk, 2],
          [dramaticOk, 6],
          [tierOk, 2],
          [hotEnergyOk, 2],
          [wedgeOk, 2],
          [orderOk, 4],
          [hitsOk, 2],
          [hourInstrOk, 2],
        ] as Array<[(c: TandaCandidate) => boolean, number]>)
      : []),
  ];
  const misses = new Map(gapPool.map((c) => [c, preds.reduce((a, [f, w]) => a + (f(c) ? 0 : w), 0)]));
  const fewest = Math.min(...misses.values());
  if (sc.strict !== undefined && fewest > sc.strict) return null;
  const gapPool2 = gapPool.filter((c) => misses.get(c) === fewest);
  let pool = gapPool2;
  if (warm) {
    // a known cool family first; a known one a little hotter before an obscure cool one
    // cool first (round 8), known among the cool ones; a cool obscure family carries its famous side (below)
    pool = gapPool2.some(known) ? gapPool2.filter(known) : gapPool2;
  }

  const prevProfile = ctx.recentOrchestras[0] ? sc.profile?.(ctx.recentOrchestras[0]) : undefined;
  const weight = (c: TandaCandidate) => {
    const av = availOf(c);
    const prof = sc.profile?.(c.orchestraId);
    const e = av.reduce((a, s) => a + (s.energy ?? 50), 0) / av.length;
    // the first D'Arienzo (1935–39 instrumental) is corpus-normal at 20 % of the night although it sits at e82–90:
    // it is judged as an e70 tanda for slot selection; the arc readout keeps its real energy
    const earlyDA =
      slot.rhythm === "tango" && isEarlyDArienzo(c) && count("juan-d-arienzo") === 0 && slot.position < 0.35;
    const d = Math.abs((earlyDA ? Math.min(e, 70) : e) - slot.targetEnergy);
    let w = Math.max(0.02, 1 - d / 28) ** 3;
    const ph = phasesOf(c);
    if (ph && (ph.includes(slot.phase) || ph.includes("any"))) w *= 1.5;
    else if (ph) w *= 0.5;
    // round 10: the orchestra's best sub-period (Troilo 1938–42, Biagi 1938–42) ×1.5 in the phases it names
    const spp = subPeriodOf(sc.profile?.(c.orchestraId), c.songs);
    if (spp?.preferred && spp.phase?.includes(slot.phase)) w *= 1.5;
    if (sc.weightOf) w *= sc.weightOf(c);
    const st = sc.style(c.orchestraId) ?? "balanced";
    w *= PHASE_STYLE[slot.phase]?.[st] ?? 1;
    if (sc.preferStyles?.includes(st)) w *= 1.4;
    if (sc.avoidStyles?.includes(st)) w *= 0.3;
    const t = sc.tier(c.orchestraId);
    w *= t === 1 ? 2.2 : t === 2 ? 1.0 : 0.12;
    w *= ctx.nightBias?.get(c.orchestraId) ?? 1;
    w *= Math.min(2, 0.6 + av.length / 10);
    // canonical singers (a large share of the orchestra's vocal catalogue) beat one-off collaborations
    if (c.singer) w *= c.singerShare >= 0.12 ? 1.3 : c.singerShare >= 0.05 ? 1 : 0.35;
    const fame = av.reduce((a, s) => a + (s.fame ?? 0), 0) / av.length;
    w *= 1 + fame * 0.4;
    if (fame === 0 && c.vocal && slot.position >= 0.2 && slot.position <= 0.9) w *= 0.5; // unknown vocal material stays out of prime slots
    // gradual steps (corpus rule 15): a family more than 14 points from the previous tanda needs a reason
    if (ctx.prevEnergy !== undefined && !earlyDA) {
      const planned = slot.targetEnergy - (ctx.prevTarget ?? slot.targetEnergy);
      // a tanda that undershot its target by more than 8 is not the anchor: the night climbs back (round 10)
      const anchor = Math.max(ctx.prevEnergy, (ctx.prevTarget ?? ctx.prevEnergy) - 4);
      const d2 = Math.abs(e - anchor - planned);
      if (d2 > 10) w *= Math.max(0.15, 1 - (d2 - 10) / 20); // round 10: the reviewer's "shoulders" are these steps
    }
    if (av.some((s) => s.selection)) w *= 1.2;
    if (needsReissue.has(c)) w *= 0.1;
    if (c.undated) w *= 0.25;
    const times = count(c.orchestraId);
    // a second appearance in a different rhythm is corpus-normal (D'Arienzo: 2–3 tango tandas plus a vals or milonga)
    w /= 1 + (slot.rhythm === "tango" ? 1.8 : 0.8) * times;
    if (t === 1 && times === 0) w *= 1.8;
    // corpus placement: orchestras cluster around a typical position of the night
    const med = PLACEMENT_MEDIAN[c.orchestraId];
    if (med !== undefined) w *= 0.55 + Math.exp(-(((slot.position - med) / 0.35) ** 2)) * 0.9;
    if (slot.index === 0) w *= OPENERS[c.orchestraId] ?? 0.5;
    // Pugliese: the corpus median is 0.87 and he often closes; the first eligible peak slot must not be a certainty
    if (c.orchestraId === "osvaldo-pugliese" && times === 0)
      w *= Math.max(0.2, Math.min(1, (slot.position - 0.55) / 0.35));
    const my = meanYear(av);
    if (slot.phase === "warmup" && c.orchestraId !== "carlos-di-sarli" && my !== null)
      w *= my <= 1943 ? 1.5 : my >= 1950 ? 0.55 : 1; // reference openers are 1935–43 material (dated rows only)
    // curated knowledge: best years, singer preference, warm-up-only material, difficulty
    // round 13: the per-family bands and the user's heatmap replace the orchestra-wide bestYears where they exist
    if (!prof?.bands && prof?.bestYears && my !== null && (my < prof.bestYears[0] || my > prof.bestYears[1]))
      w *= 0.5;
    w *=
      av.reduce((a, s) => a + sideKnowledge(s, prof, c.singer, sc.bandOverrides), 0) / Math.max(1, av.length);
    if (sc.golden) {
      const cls = goldenClassOf(
        prof,
        av.map(dated).filter((y): y is number => !!y),
      );
      w *= cls === "core" ? 1.2 : cls === "edge" ? 0.6 : cls === "other" ? 0.3 : 1;
    }
    // round 13 — transitions: the pairwise score into this family (exp((S − 100) / 15), transitions review §2.2)
    const ps = pairOf(c);
    if (ps) w *= Math.exp((ps.score - 100) / 15);
    const fw = fwdOf(c);
    if (fw) w *= Math.exp((fw.score - 100) / 15);
    if (prof?.singerShift && c.singer && prof.singerShift[c.singer] !== undefined)
      w *= Math.max(0.2, 1 + prof.singerShift[c.singer]! * 0.08);
    if (slot.phase === "warmup" && prof?.warmupOnly) {
      const wo = prof.warmupOnly;
      const ok =
        (wo.vocal === undefined || wo.vocal === c.vocal) &&
        (!wo.years || (my !== null && my >= wo.years[0] - 0.5 && my <= wo.years[1] + 0.5));
      if (!ok) w *= 0.1;
    }
    const sp = subPeriodOf(prof, c.songs);
    const difficulty = sp?.difficulty ?? prof?.difficulty;
    if (sc.maxDifficulty !== undefined && difficulty !== undefined && difficulty > sc.maxDifficulty)
      w *= 0.15;
    if (sp?.danceable === "limited") w *= 0.3;
    // after Pugliese: vals, milonga or a rhythmic tango (profile followWith)
    if (prevProfile?.followWith?.length && slot.rhythm === "tango")
      w *= prevProfile.followWith.includes(st) || st === "balanced" ? 2.5 : 0.2;
    if (slot.rhythm !== "tango" && prof?.tangoOnly) w *= 0.15; // Demare valses before the última (round 9)
    if (slot.rhythm === "vals") {
      const bank = slot.position < 0.2 ? WARMUP_VALS_BANK : VALS_BANK;
      w *= 0.5 + (bank[c.orchestraId] ?? 0) / 6;
    }
    if (slot.rhythm === "milonga") {
      w *= 0.5 + (MILONGA_BANK[c.orchestraId] ?? 0) / 6;
      if (c.orchestraId === "francisco-canaro" && my !== null && my <= 1941) w *= 2; // Canaro–Maida/Famá milongas, BA bank #1
      if (c.orchestraId === "juan-d-arienzo" && my !== null && my >= 1937 && my <= 1941) w *= 1.5;
    }
    if (c.orchestraId === "juan-d-arienzo" && slot.rhythm === "tango") {
      if (times === 0 && slot.position < 0.35) w *= earlyDA ? 3 : 1.2;
      else if (times === 0 && slot.position > 0.5)
        w *= 2; // D'Arienzo always appears
      else if (times === 1 && slot.position > 0.55) w *= 2.5; // and comes back in the second half (2–3 per 4 h)
    }
    const canon = sc.canonical?.find(
      (k) =>
        k.rhythm === slot.rhythm &&
        k.orchestraId === c.orchestraId &&
        (k.singer ?? null) === (c.singer ?? null) &&
        (!k.years ||
          !av[0]?.year ||
          av.some((s) => s.year && s.year >= k.years![0] - 1 && s.year <= k.years![1] + 1)),
    );
    if (canon) w *= 1.4 + (canon.popularity ?? 3) * 0.15 * (canon.phase === slot.phase ? 1.5 : 1);
    // context: vocal ratio and tempo
    if (sc.vocalBias) w *= Math.max(0.2, 1 + 3 * sc.vocalBias * (c.vocal ? 1 : -1));
    if (sc.tempoShift && prof?.bpm?.[slot.rhythm]) {
      const [lo, hi] = prof.bpm[slot.rhythm]!;
      w *= Math.max(0.3, 1 + (sc.tempoShift * ((lo + hi) / 2 - BPM_PIVOT[slot.rhythm])) / 60);
    }
    if (sc.preferOrchestras?.includes(c.orchestraId)) w *= 3;
    // round 9: the canon families of the era (Canaro–Maida, Di Sarli–Rufino, D'Arienzo–Echagüe …) ×3 while unplayed,
    // and no orchestra comes back for a second tango tanda while a canon family is still waiting
    if (sc.preferFamilies?.length && slot.rhythm === "tango") {
      const ys = av.map(dated).filter((y): y is number => !!y);
      const fam = matchFamily(sc.preferFamilies, {
        orchestraId: c.orchestraId,
        singer: c.singer,
        years: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
      });
      const played = fam && ctx.usedFamilies?.some((f) => matchFamily([fam], f)?.id === fam.id);
      // the boost is for a family that can carry the slot: a soft canon family in a hot slot only gets half of it
      if (fam && !played) w *= slot.index === 0 ? 1.4 : e >= slot.targetEnergy - 10 ? 2.2 : 1.4;
      else if (ctx.canonPending && times >= 1) w *= 0.3;
    }
    // obscure one-off singers (fame 0, small singer share) do not open a night (OTV/del Moral, Lomuto/Díaz valses)
    if (slot.position <= 0.2 && c.singer && fame === 0 && c.singerShare < 0.12)
      w *= slot.rhythm === "tango" ? 0.25 : 0.02;
    // variety across nights: a family that played in the last sets steps back (never excluded, a floor has favourites)
    if (o.recent?.tandaKeys?.includes(`${c.orchestraId}|${c.singer ?? ""}|${slot.rhythm}`)) w *= 0.4;
    // variety inside the night: the same family (orchestra, singer, overlapping years) a second time is a tell
    // (Di Sarli instr 1940 at 7 and 14, D'Arienzo–Echagüe 38–39 at 19 and 26)
    if (ctx.usedFamilies?.length && my !== null) {
      const ys = av.map(dated).filter((y): y is number => !!y);
      const lo = Math.min(...ys),
        hi = Math.max(...ys);
      if (
        ctx.usedFamilies.some(
          (f) =>
            f.orchestraId === c.orchestraId &&
            (f.singer ?? "") === (c.singer ?? "") &&
            f.rhythm === slot.rhythm &&
            f.years[0] <= hi + 1 &&
            lo <= f.years[1] + 1,
        )
      )
        w *= 0.08;
    }
    return w;
  };
  let scoredFams = pool.map((c) => ({ c, w: weight(c) }));
  // the first D'Arienzo bonus must survive the energy term: floor it at 90 % of the best weight in the slot
  if (
    slot.rhythm === "tango" &&
    count("juan-d-arienzo") === 0 &&
    slot.position < 0.35 &&
    (ctx.earlyDASlot === undefined || ctx.earlyDASlot === slot.index)
  ) {
    const best = Math.max(...scoredFams.map((r) => r.w));
    scoredFams = scoredFams.map((r) => (isEarlyDArienzo(r.c) ? { c: r.c, w: Math.max(r.w, best * 0.9) } : r));
  }
  // sample among the best few, not the whole long tail (a 0.3 % candidate at the peak is a tell);
  // flattened so the runner-up families get a real chance and two nights with the same options differ —
  // flatter still in the warm-up slots and the vals/milonga slots, where corpus sets vary the most
  const loose = (slot.index >= 1 && slot.index <= 4) || slot.rhythm !== "tango";
  const sortedFams = scoredFams.sort((a, b) => b.w - a.w);
  const bestW = sortedFams[0]?.w ?? 0;
  // the long tail never enters the window: a family 10× below the best is out (round 10), however flat the sampling
  const ranked = sortedFams
    .filter((r) => r.w >= bestW / 10)
    .slice(0, loose ? 10 : 8)
    .map((r) => ({ c: r.c, w: r.w ** (loose ? 0.55 : 0.7) }));
  const chosen = rng.weighted(ranked, (r) => r.w)?.c;
  if (!chosen) return null;
  const avail = availOf(chosen);
  // stochastic pick: score by fit + fame + curator flag, then sample `need` from the top window so seeds differ
  const target = slot.targetEnergy + (rng.next() - 0.5) * 6;
  const canonTitles = new Set(
    (sc.canonical ?? [])
      .filter((k) => k.orchestraId === chosen.orchestraId && k.rhythm === slot.rhythm)
      .flatMap((k) => (k.titles ?? []).map(normTitle)),
  );
  const recentTitles = new Set(o.recent?.titles ?? []);
  const chosenProf = sc.profile?.(chosen.orchestraId);
  const scored = avail
    .map((s) => ({
      s,
      w:
        Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - target) / 30) *
        (1 + (s.fame ?? 0) * (sc.golden ? 0.9 : 0.5)) *
        (sc.golden ? (s.spotify || s.resolved ? 1.25 : 0.6) * (s.suspectCredit ? 0.3 : 1) : 1) *
        (canonTitles.has(normTitle(s.title)) ? 2 : 1) *
        (s.selection ? 1.3 : 1) *
        (s.yearApprox ? 0.6 : 1) *
        (isSuspectSide(s) ? 0.35 : 1) *
        (s.reissue ? 0.5 : 1) *
        (recentTitles.has(normTitle(s.title)) ? 0.55 : 1) *
        sideKnowledge(s, chosenProf, chosen.singer, sc.bandOverrides) *
        (0.6 + rng.next() * 0.8),
    }))
    .sort((a, b) => b.w - a.w);
  // round 13 (cohesion R2, R8): the user's "same year" — the sides come from the tightest window (one year, or a
  // date span within 18 months) that keeps most of the family's weight; the fame lifts below may still reach out
  const tight = tightWindow(scored, need);
  const seen = new Set<string>();
  const picked: Song[] = [];
  // the first D'Arienzo (72 instrumental sides from 1935–39): a seeded draw among the top window instead of the
  // same four famous titles every night (round 8: Rawson/Ataniche/Joaquina/Jueves in 7 of 8 seeds). The weights
  // (fit, fame, canon, recent-memory penalty) still rank; the draw is flattened so runners-up get real chances.
  const firstDA = slot.rhythm === "tango" && isEarlyDArienzo(chosen) && count("juan-d-arienzo") === 0;
  // the summit sides (El flete, El internado, Hotel Victoria: fame ≥ 4 at e85+) are kept for the peak chair; the
  // first D'Arienzo instrumental is judged as an e70 tanda and draws from the sides near that, so it glides
  const firstDAinstr =
    slot.rhythm === "tango" &&
    chosen.orchestraId === "juan-d-arienzo" &&
    !chosen.vocal &&
    slot.position < 0.35;
  const summit = (s: Song) => (s.fame ?? 0) >= 4 && (s.energy ?? 50) >= 85;
  const kept0 = firstDAinstr ? tight.filter((r) => !summit(r.s)) : tight;
  const draw0 = kept0.length >= need * 2 || (tight !== scored && kept0.length >= need) ? kept0 : tight;
  if (firstDA) {
    const near = draw0.filter((r) => {
      const d = (r.s.energy ?? 50) - target;
      return d >= -14 && d <= 12;
    });
    const window = (near.length >= need ? near : draw0)
      .slice(0, Math.max(need * 3, 12))
      .map((r) => ({ s: r.s, w: r.w ** 0.75 }));
    while (picked.length < need && window.length) {
      const draw = rng.weighted(window, (r) => r.w);
      if (!draw) break;
      window.splice(window.indexOf(draw), 1);
      const k = normTitle(draw.s.title);
      if (seen.has(k)) continue;
      seen.add(k);
      picked.push(draw.s);
    }
  }
  // greedy: first pick by weight, then prefer tracks whose analysed tempo/key/loudness sit with the tanda so far
  const rest = firstDA ? [] : draw0.slice(0, Math.max(need * 6, 24));
  while (picked.length < need && rest.length) {
    const anchor = picked.filter((x) => x.audio);
    let bi = 0;
    if (anchor.length) {
      let bw = -1;
      rest.forEach((r, i) => {
        const c = r.s.audio
          ? tandaCohesion(
              [...anchor, r.s].map((x) => x.audio),
              slot.rhythm,
            ).score
          : 50;
        const w = r.w * (0.6 + 0.4 * (c / 100));
        if (w > bw) {
          bw = w;
          bi = i;
        }
      });
    }
    const [{ s: cand }] = rest.splice(bi, 1) as [{ s: Song; w: number }];
    const k = normTitle(cand.title);
    if (seen.has(k)) continue;
    // cohesion R6: with three trustworthy tempo readings the folded drift stays under the rhythm's cap
    const band = chosenProf?.bpm?.[slot.rhythm];
    const bpms = [...picked, cand].map((x) => foldedBpm(x, band)).filter((b): b is number => b !== undefined);
    if (
      bpms.length >= 3 &&
      Math.max(...bpms) - Math.min(...bpms) > (BPM_DELTA_MAX[slot.rhythm] ?? 8) &&
      rest.length >= need - picked.length
    )
      continue;
    seen.add(k);
    picked.push(cand);
  }
  if (picked.length < need) return null;
  // a warm-up vals / milonga family known only through a famous side carries that side (round 9: Canaro–Roldán
  // with three deep cuts is the obscure one-off the floor hears, whatever the family's catalogue holds)
  if (warm && chosen.singer && chosen.singerShare < 0.12 && !picked.some((s) => (s.fame ?? 0) > 0)) {
    const famousSide = scored.find((r) => (r.s.fame ?? 0) > 0 && !picked.includes(r.s))?.s;
    if (famousSide) picked[picked.length - 1] = famousSide;
  }
  // round 10 — the fame floor on the picks: the opener carries a known side; a vocal tango tanda after 20 % carries
  // three sides of fame ≥ 2 when the family has them (the weakest picks give way, the first D'Arienzo draw is kept)
  const lift = (minFame: number, want: number) => {
    const have = () => picked.filter((s) => (s.fame ?? 0) >= minFame).length;
    const spare = scored.filter(
      (r) => (r.s.fame ?? 0) >= minFame && !picked.includes(r.s) && !seen.has(normTitle(r.s.title)),
    );
    while (have() < want && spare.length) {
      const weak = picked
        .map((s, i) => ({ s, i }))
        .filter((x) => (x.s.fame ?? 0) < minFame)
        .sort((a, b) => (a.s.fame ?? 0) - (b.s.fame ?? 0))[0];
      if (!weak) break;
      const next = spare.shift()!.s;
      // a famous side cooler than the one it replaces and under the target would pull the tanda down (the última's
      // strength comes first: Madame Ivonne at e68 is not the side to close a Tanturi–Castillo tanda with)
      if ((next.energy ?? 50) < (weak.s.energy ?? 50) && (next.energy ?? 50) < target - 4) continue;
      seen.add(normTitle(next.title));
      picked[weak.i] = next;
    }
  };
  if (slot.index === 0) lift(1, 1);
  if (!firstDA && chosen.vocal && slot.rhythm === "tango" && slot.position >= 0.2)
    lift(2, Math.min(3, need - 1));
  // round 14 (dancer R14-2): on a golden night every tanda carries at most one side nobody knows
  if (strict14) lift(2, need - 1);
  // round 11 (R1): the planned summit's D'Arienzo instrumental carries the reserved sides (El flete, El internado,
  // Hotel Victoria, El cencerro …): three sides of fame ≥ 3 when the family holds them
  if (slot.peak && chosen.orchestraId === "juan-d-arienzo" && !chosen.vocal) lift(3, 3);
  // a tanda of nothing but corpus closers (the famous Di Sarli instrumentals are all tagged so) would open on one:
  // the least famous closer gives way to a non-closer side when the family has one
  if (picked.length >= 3 && picked.every((s) => s.role === "closer")) {
    const other = scored.find(
      (r) => r.s.role !== "closer" && !picked.includes(r.s) && !seen.has(normTitle(r.s.title)),
    )?.s;
    if (other) {
      const weakest = picked.slice().sort((a, b) => (a.fame ?? 0) - (b.fame ?? 0))[0]!;
      seen.add(normTitle(other.title));
      picked[picked.indexOf(weakest)] = other;
    }
  }
  const shaped = shapeTanda(picked, o.tandaShape, slot.rhythm);
  // round 14 (dancer R14-5, R14-17): a golden night's tanda opens on a known side and ends on one of its best
  // (the first D'Arienzo keeps the composer's own order: its seeded draw is the night's variety, round 8)
  const songs =
    strict14 && !firstDA
      ? strictOrder(shaped, !!slot.peak || slot.phase === "peak" || slot.targetEnergy >= 78)
      : shaped;
  const years = songs.map(dated).filter((y): y is number => !!y);
  const curve = songs.map((s) => s.energy ?? 50);
  const energy = Math.round(curve.reduce((a, b) => a + b, 0) / curve.length);
  const durationSec = o.avgTrackSec
    ? songs.length * o.avgTrackSec
    : songs.reduce((a, s) => a + (s.durationSec ?? 170), 0);
  const eraCount = new Map<Era, number>();
  for (const s of songs) eraCount.set(s.era, (eraCount.get(s.era) ?? 0) + 1);
  const era = [...eraCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const st = sc.style(chosen.orchestraId);
  const yearLabel = years.length
    ? ` ${Math.min(...years)}–${Math.max(...years)}`
    : chosen.undated
      ? ` c. ${songs[0]?.year ?? ""}`
      : "";
  // round 13: what the user's heatmap and the family bands say about these sides (shown in the UI)
  // (round 14, dancer R14-2c: the "fantastic" label needs a mean side fame of 3)
  const heat = heatOfSides(songs);
  const bands = songs.map((x) => familyBand(chosenProf, chosen.singer, dated(x), sc.bandOverrides));
  const band = bands.includes("outside")
    ? "outside"
    : bands.includes("ok")
      ? "ok"
      : bands.length && bands.every((b) => b === "best")
        ? "best"
        : undefined;
  const golden = goldenClassOf(chosenProf, years);
  const heatNote = heat
    ? heat.min >= 4
      ? " · heatmap: fantastic year"
      : heat.min >= 3
        ? " · heatmap: good year"
        : ` · heatmap: ${heat.label} year`
    : "";
  const reason = `${slot.phase}: ${st ?? "balanced"} ${chosen.orchestra}${chosen.singer ? ` with ${chosen.singer}` : " instrumental"}${yearLabel}, energy ${energy} for target ${slot.targetEnergy}${heatNote}${band === "best" ? " · the family's best years" : ""}`;
  return {
    index: slot.index,
    rhythm: slot.rhythm as DanceRhythm,
    orchestra: chosen.orchestra,
    orchestraId: chosen.orchestraId,
    singer: chosen.singer,
    vocal: chosen.vocal,
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null,
    era,
    songs,
    energy,
    energyCurve: curve,
    targetEnergy: slot.targetEnergy,
    phase: slot.phase,
    style: st as Tanda["style"],
    durationSec,
    cortina: null,
    reason,
    ...(slot.peak ? { peak: true } : {}),
    ...(heat ? { heat } : {}),
    ...(band ? { band } : {}),
    ...(golden ? { golden } : {}),
    crossesBreak: false,
    ...(chosen.spreadFloor !== undefined ? { spreadFloor: chosen.spreadFloor } : {}),
    ...(chosen.poolSmall ? { poolSmall: true, note: "pool-small" } : {}),
    cohesion: (() => {
      const c = tandaCohesion(
        songs.map((x) => x.audio),
        slot.rhythm,
      );
      return c.known > 0 ? c.score : undefined;
    })(),
  };
}
