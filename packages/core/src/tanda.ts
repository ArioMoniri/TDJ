import { tandaCohesion } from "./audio/compat";
import { normTitle } from "./energy";
import type { ComposeOptions, DanceRhythm, Era, OrchestraProfile, Rng, Slot, Song, Tanda } from "./index";
import {
  CORPUS_CAPS,
  DEFAULT_CAP,
  MILONGA_BANK,
  NEVER_OPEN,
  OPENERS,
  PLACEMENT_MEDIAN,
  VALS_BANK,
  WARMUP_VALS_BANK,
} from "./rules";

export interface TandaCandidate {
  orchestraId: string;
  orchestra: string;
  singer: string | null;
  vocal: boolean;
  songs: Song[];
  singerShare: number;
  /** every row carries a decade placeholder year ("c. 1940"): never anchors a year window */
  undated?: boolean;
}

const dated = (s: Song) => (s.year && !s.yearApprox ? s.year : null);

/**
 * Group songs into coherent families: same orchestra + same singer (or instrumental) + tight year window.
 * Rows whose year is a decade placeholder (`yearApprox`) cannot define a window: they form a separate
 * "undated" family per orchestra/singer that the track scorer weights at 0.6.
 */
export function families(
  pool: Song[],
  maxYearSpread: number,
  mixVocal: boolean,
  orchTotals?: Map<string, number>,
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
    const push = (bucket: Song[], undated: boolean) => {
      if (!bucket.length) return;
      out.push({
        orchestraId: first.orchestraId,
        orchestra: first.orchestra,
        singer: mixVocal ? null : first.singer,
        vocal: mixVocal ? bucket.some((b) => b.vocal) : first.vocal,
        songs: bucket,
        singerShare: share,
        undated: undated || undefined,
      });
    };
    const approx = songs.filter((s) => !dated(s));
    const sorted = songs.filter((s) => dated(s)).sort((a, b) => (dated(a) ?? 0) - (dated(b) ?? 0));
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
  }
  return out;
}

/**
 * Order the chosen songs inside the tanda: first the requested energy shape, then the corpus roles
 * (an opener opens, a closer closes) and, when roles are known, the least-known track as the third "test" track.
 */
export function shapeTanda(songs: Song[], shape: ComposeOptions["tandaShape"]): Song[] {
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
  return applyRoles(out);
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
  /** era preset preference (weight ×3) */
  preferOrchestras?: string[];
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

export function buildTanda(
  slot: Slot,
  cands: TandaCandidate[],
  o: ComposeOptions,
  rng: Rng,
  ctx: BuildContext,
  sc: Scoring,
): Tanda | null {
  const need = slot.size;
  const availOf = (c: TandaCandidate) =>
    c.songs.filter(
      (s) =>
        sc.isDanceable(s) &&
        !sc.nonDance?.(c.orchestraId, s.title, s.year) &&
        !ctx.usedSongIds.has(s.id) &&
        (!o.avoidTitleRepeats || !ctx.usedTitles.has(normTitle(s.title))),
    );
  const count = (id: string) => ctx.recentOrchestras.filter((x) => x === id).length;
  const cap = (id: string) => {
    const m = sc.maxPerNight?.(id);
    let base = m ?? (CORPUS_CAPS[id] ?? DEFAULT_CAP) + (o.hours > 8 ? 2 : o.hours > 5 ? 1 : 0);
    const share = sc.profile?.(id)?.shareOfNightMax;
    if (share && ctx.totalSlots) base = Math.min(base, Math.max(1, Math.ceil(share * ctx.totalSlots)));
    return base;
  };
  const isGuardia = (c: TandaCandidate) =>
    c.songs.every((s) => s.era === "guardia-vieja" || s.era === "guardia-nueva");
  const isLast = slot.phase === "close";
  const phasesOf = (c: TandaCandidate): string[] | undefined => {
    const sp = subPeriodOf(sc.profile?.(c.orchestraId), c.songs);
    return sp?.phase ?? sc.phase(c.orchestraId);
  };
  const viableAll = cands.filter((c) => {
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
  const viable0 = viableAll.filter(contextOk).length >= 3 ? viableAll.filter(contextOk) : viableAll;
  const viable = viable0.filter(phaseOk).length >= 3 ? viable0.filter(phaseOk) : viable0;
  if (!viable.length) return null;
  const gapOk = (c: TandaCandidate) => {
    const io = ctx.recentOrchestras.indexOf(c.orchestraId);
    if (io !== -1 && io < o.orchestraRepeatGap) return false;
    if (c.singer) {
      const is = ctx.recentSingers.indexOf(c.singer);
      if (is !== -1 && is < o.singerRepeatGap) return false;
    }
    return true;
  };
  let pool = viable.filter(gapOk);
  if (!pool.length)
    pool = viable.filter(
      (c) => ctx.recentOrchestras[0] !== c.orchestraId && (!c.singer || ctx.recentSingers[0] !== c.singer),
    );
  if (!pool.length) return null; // never the same orchestra twice in a row; the caller falls back to a tango tanda

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
      const d2 = Math.abs(e - ctx.prevEnergy - planned);
      if (d2 > 14) w *= Math.max(0.2, 1 - (d2 - 14) / 25);
    }
    if (av.some((s) => s.selection)) w *= 1.2;
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
    if (prof?.bestYears && my !== null && (my < prof.bestYears[0] || my > prof.bestYears[1])) w *= 0.5;
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
    // obscure one-off singers (fame 0, small singer share) do not open a night (OTV/del Moral, Lomuto/Díaz valses)
    if (slot.position <= 0.2 && c.singer && fame === 0 && c.singerShare < 0.12)
      w *= slot.rhythm === "tango" ? 0.25 : 0.02;
    // variety across nights: a family that played in the last sets steps back (never excluded, a floor has favourites)
    if (o.recent?.tandaKeys?.includes(`${c.orchestraId}|${c.singer ?? ""}|${slot.rhythm}`)) w *= 0.4;
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
  // the long tail never enters the window: a family 20× below the best is out, however flat the sampling
  const ranked = sortedFams
    .filter((r) => r.w >= bestW / 20)
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
  const scored = avail
    .map((s) => ({
      s,
      w:
        Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - target) / 30) *
        (1 + (s.fame ?? 0) * 0.5) *
        (canonTitles.has(normTitle(s.title)) ? 2 : 1) *
        (s.selection ? 1.3 : 1) *
        (s.yearApprox ? 0.6 : 1) *
        (recentTitles.has(normTitle(s.title)) ? 0.55 : 1) *
        (0.6 + rng.next() * 0.8),
    }))
    .sort((a, b) => b.w - a.w);
  const seen = new Set<string>();
  const picked: Song[] = [];
  // greedy: first pick by weight, then prefer tracks whose analysed tempo/key/loudness sit with the tanda so far
  const rest = scored.slice(0, Math.max(need * 6, 24));
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
    seen.add(k);
    picked.push(cand);
  }
  if (picked.length < need) return null;
  const songs = shapeTanda(picked, o.tandaShape);
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
  const reason = `${slot.phase}: ${st ?? "balanced"} ${chosen.orchestra}${chosen.singer ? ` with ${chosen.singer}` : " instrumental"}${yearLabel}, energy ${energy} for target ${slot.targetEnergy}`;
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
    cohesion: (() => {
      const c = tandaCohesion(
        songs.map((x) => x.audio),
        slot.rhythm,
      );
      return c.known > 0 ? c.score : undefined;
    })(),
  };
}
