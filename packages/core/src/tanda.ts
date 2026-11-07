import { tandaCohesion } from "./audio/compat";
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
 * A row a tanda may be built from (round 8): dated (no decade placeholder, no missing year) and a studio side,
 * never a radio/live transcription or an "inéditos" bootleg. `allowUndated` (rules.allowUndated) lets a DJ opt in.
 */
export const isTandaEligible = (
  s: Pick<Song, "year" | "yearApprox" | "transcription">,
  allowUndated = false,
) => allowUndated || (!!s.year && !s.yearApprox && !s.transcription);

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
  const last = out[n - 1]!;
  const min = Math.min(...out.map(e));
  if (e(last) === min && out.filter((s) => e(s) === min).length === 1 && (lift || last.role !== "closer")) {
    // the nearest earlier chair that is not a corpus opener takes the close
    let j = n - 2;
    while (j >= 0 && out[j]!.role === "opener") j--;
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
  }>;
  /** round 9: preferred (canon) families still unplayed → an orchestra's second tango tanda steps back */
  canonPending?: boolean;
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
  /** families the night should carry (weight ×3 while unused): the golden canon (round 9) */
  preferFamilies?: PreferredFamily[];
  /** profile "do not place at the main peak" (round 9): excluded from planned peak slots */
  avoidMainPeak?: (id: string) => boolean;
  /** a relaxed scoring (caps and phases lifted): a played family may return rather than leave a hole (round 10) */
  relaxed?: boolean;
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
  const availOf = (c: TandaCandidate) => {
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
    return clean.length >= need ? clean : sound;
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
  const viableF = viableF0.filter(notDramatic).length >= 3 ? viableF0.filter(notDramatic) : viableF0;
  const viable0 = viableF.filter(contextOk).length >= 3 ? viableF.filter(contextOk) : viableF;
  const viable1 = viable0.filter(phaseOk).length >= 3 ? viable0.filter(phaseOk) : viable0;
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
  const playedFamily = (c: TandaCandidate) => {
    const yr = yearsOf(c);
    const daInstr = c.orchestraId === "juan-d-arienzo" && !c.vocal;
    return (
      !!yr &&
      !!ctx.usedFamilies?.some(
        (f) =>
          f.orchestraId === c.orchestraId &&
          (f.singer ?? "") === (c.singer ?? "") &&
          f.rhythm === slot.rhythm &&
          ((slot.rhythm === "tango" && !daInstr && o.hours < 5) ||
            (f.years[0] <= yr[1] + 1 && yr[0] <= f.years[1] + 1)),
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
  const viable1k = viable1s.filter(knownOpener).length >= 3 ? viable1s.filter(knownOpener) : viable1s;
  const viable1f = viable1k.filter(coolOpener).length >= 3 ? viable1k.filter(coolOpener) : viable1k;
  const viable = warm && viable1f.filter(cool).length >= 3 ? viable1f.filter(cool) : viable1f;
  if (!viable.length) return null;
  let gapPool = viable.filter(gapOk);
  // a pool of one or two families (an "only X" night) or a rule that names the closer may break the gap; a real pool
  // never does (round 10)
  if (!gapPool.length && ((viable.length <= 2 && !isLast) || namedCloser))
    gapPool = viable.filter(
      (c) => ctx.recentOrchestras[0] !== c.orchestraId && (!c.singer || ctx.recentSingers[0] !== c.singer),
    );
  if (!gapPool.length) return null; // never the same orchestra twice in a row; the caller falls back to a tango tanda
  // obscure one-off singers (fame 0, small singer share) do not open a night: a filter for the first vals / milonga
  // whenever the gaps leave a known family (round 9: the weight alone let Canaro–Roldán through)
  const known = (c: TandaCandidate) =>
    !c.singer || c.singerShare >= 0.12 || availOf(c).some((s) => (s.fame ?? 0) > 0);
  let pool = gapPool;
  if (warm) {
    // a known cool family first; a known one a little hotter before an obscure cool one
    // cool first (round 8), known among the cool ones; a cool obscure family carries its famous side (below)
    pool = gapPool.some(known) ? gapPool.filter(known) : gapPool;
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
  const scored = avail
    .map((s) => ({
      s,
      w:
        Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - target) / 30) *
        (1 + (s.fame ?? 0) * 0.5) *
        (canonTitles.has(normTitle(s.title)) ? 2 : 1) *
        (s.selection ? 1.3 : 1) *
        (s.yearApprox ? 0.6 : 1) *
        (isSuspectSide(s) ? 0.35 : 1) *
        (s.reissue ? 0.5 : 1) *
        (recentTitles.has(normTitle(s.title)) ? 0.55 : 1) *
        (0.6 + rng.next() * 0.8),
    }))
    .sort((a, b) => b.w - a.w);
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
  const kept0 = firstDAinstr ? scored.filter((r) => !summit(r.s)) : scored;
  const draw0 = kept0.length >= need * 2 ? kept0 : scored;
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
  const songs = shapeTanda(picked, o.tandaShape, slot.rhythm);
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
    ...(slot.peak ? { peak: true } : {}),
    cohesion: (() => {
      const c = tandaCohesion(
        songs.map((x) => x.audio),
        slot.rhythm,
      );
      return c.known > 0 ? c.score : undefined;
    })(),
  };
}
