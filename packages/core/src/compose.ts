import { arcShapeFor, capPeakRuns, planSlots, sanitizeOptions } from "./arc";
import { attachBooth } from "./booth";
import type { Catalog } from "./catalog";
import { applyContextToOptions, BUILTIN_CONTEXT, resolveContext } from "./context";
import { cortinaPool, pickCortina, planCortinas } from "./cortinas";
import { isDanceableSong, normTitle } from "./energy";
import { familyBand, goldenClassOf, isColour, isGoldenNight } from "./knowledge";
import { isPeakSlot, meanFameOf } from "./order";
import { ERA_PRESETS, ERA_SETTINGS } from "./profiles";
import { cueFamilies, pickStrictCloser, recue, recueBetter, strictRepair } from "./repair";
import { makeRng } from "./rng";
import {
  CANON_FAMILIES_MIN,
  CORPUS_CAPS,
  CUMPARSITA_CLOSING_YEARS,
  DEFAULT_CAP,
  matchFamily,
  OPENERS,
} from "./rules";
import { scorePlaylist } from "./score";
import {
  cycleCountOk,
  isClassicCycle,
  lineupPeriod,
  type StrictResult,
  streamable,
  strictChecks,
} from "./strict";
import {
  type BuildContext,
  buildTanda,
  type FamilyOpts,
  families,
  gapBreaks,
  isEarlyDArienzo,
  isSuspectSide,
  isTandaEligible,
  peakOk,
  type Scoring,
  type TandaCandidate,
} from "./tanda";
import { nightTransitions, pairScore, sideOf } from "./transitions";
import type {
  ComposeOptions,
  ContextModel,
  Cortina,
  DanceRhythm,
  NightRules,
  Playlist,
  PlaylistStats,
  PreferredFamily,
  Slot,
  Song,
  Tanda,
} from "./types";

export const DEFAULT_OPTIONS: ComposeOptions = {
  hours: 4,
  eras: ["golden"],
  pattern: "classic",
  tangoTandaSize: 4,
  valsTandaSize: 3,
  milongaTandaSize: 3,
  tandaShape: "rise-settle",
  arc: "classic-two-peaks",
  cortinaStyle: "family",
  cortinaCultures: ["global"],
  cortinaTrend: "mixed",
  cortinaLengthSec: 45,
  closeWithCumparsita: true,
  orchestraRepeatGap: 6,
  singerRepeatGap: 4,
  avoidTitleRepeats: true,
  maxYearSpread: 4,
  mixVocalInstrumental: false,
  floorMood: "balanced",
  locale: "en",
};

export interface ComposeDeps {
  catalog: Catalog;
  cortinas?: Cortina[];
  contextModel?: ContextModel;
}
export interface ComposeExtras {
  /** tandas to keep in place (locked by the user); matched by index */ locked?: Tanda[];
}

const CUMPARSITA_PREF = [
  "juan-d-arienzo",
  "osvaldo-pugliese",
  "carlos-di-sarli",
  "anibal-troilo",
  "rodolfo-biagi",
  "francisco-canaro",
  "alfredo-de-angelis",
];
/** corpus rule 15: the última is Pugliese, D'Arienzo, D'Agostino–Vargas, Di Sarli, De Angelis instr., Troilo–Fiorentino … */
export const ULTIMA_POOL = [
  "osvaldo-pugliese",
  "juan-d-arienzo",
  "angel-d-agostino",
  "carlos-di-sarli",
  "alfredo-de-angelis",
  "anibal-troilo",
  "ricardo-tanturi",
  "rodolfo-biagi",
  "miguel-calo",
  "enrique-rodriguez",
];
const ULTIMA_INSTRUMENTAL_OK = new Set([
  "osvaldo-pugliese",
  "juan-d-arienzo",
  "carlos-di-sarli",
  "alfredo-de-angelis",
  "anibal-troilo",
]);
/** a "colour" tanda: one softer, elegant tanda in the breather after the first peak */
const COLOUR_ORCHESTRAS = [
  "miguel-calo",
  "osvaldo-fresedo",
  "lucio-demare",
  "alfredo-de-angelis",
  "quinteto-pirincho",
  "francisco-canaro",
];
const TANDA_POOL_EXCLUDES = ["guitarras-solo-singer", "orquesta-unspecified"];
/** the regulars a night can do without: one of them steps back per seed (never the canon-carrying orchestras) */
const NIGHT_ABSENTEES = [
  "miguel-calo",
  "pedro-laurenz",
  "enrique-rodriguez",
  "edgardo-donato",
  "alfredo-de-angelis",
  "osvaldo-fresedo",
  "francisco-lomuto",
  "angel-d-agostino",
];

/** closing-version years for an orchestra: profile `cumparsitaVersions` ∪ corpus `role:"cumparsita"` years */
export function cumparsitaYears(cat: Catalog, orchestraId: string): Set<number> {
  const years = new Set<number>([
    ...(cat.profile(orchestraId)?.cumparsitaVersions ?? []),
    ...(CUMPARSITA_CLOSING_YEARS[orchestraId] ?? []),
  ]);
  for (const f of cat.corpus.famousRecordings ?? [])
    if (f.role === "cumparsita" && f.orchestraId === orchestraId && f.year) years.add(f.year);
  return years;
}

/** La Cumparsita rows a DJ closes with: a corpus/profile year when the orchestra has them, never a placeholder, instrumental unless the corpus says otherwise */
function cumparsitaCandidates(cat: Catalog, o: ComposeOptions): Song[] {
  // a standalone closing Cumparsita is a dated studio instrumental (round 8: never Canaro/Alonso 1951 singing it)
  const all = cat.songs.filter(
    (s) =>
      normTitle(s.title) === "la cumparsita" &&
      s.rhythm === "tango" &&
      isTandaEligible(s) &&
      !s.vocal &&
      (o.eras.includes("all") || s.era.startsWith("golden") || s.era === "post-golden"),
  );
  // orchestras with documented closing versions first; others only when none of those exist in this era
  const known = all.filter((s) => cumparsitaYears(cat, s.orchestraId).has(s.year!));
  const filtered = known.length
    ? known
    : all.filter((s) => !s.vocal && !cumparsitaYears(cat, s.orchestraId).size);
  const bounds = o.eras.map((e) => ERA_PRESETS[e]?.years).filter((y): y is [number, number] => !!y);
  const lo = bounds.length ? Math.min(...bounds.map((b) => b[0])) : 1900;
  const hi = bounds.length ? Math.max(...bounds.map((b) => b[1])) : 2100;
  // a night outside the golden age (post-golden, nuevo …) closes with a version of its own era when one exists
  if (lo > 1955) {
    const own = filtered.filter((s) => s.year! >= lo && s.year! <= hi);
    if (own.length) return own;
  }
  return filtered.length ? filtered : all.filter((s) => !s.vocal);
}
/**
 * Round 9: the closing Cumparsita follows the última's character. A rhythmic última (D'Arienzo, Biagi, Tanturi–Castillo,
 * Rodríguez …) wants the D'Arienzo 1951 "the party is over" version (or another corpus rhythmic version when the última
 * is D'Arienzo himself); a lyrical / dramatic / balanced one (Di Sarli, Troilo, Pugliese, Demare) wants Di Sarli.
 */
export function cumparsitaStyle(cat: Catalog, ultimaOrchestraId: string): "rhythmic" | "lyrical" {
  const st = cat.profile(ultimaOrchestraId)?.style;
  return st === "rhythmic" || st === "guardia" ? "rhythmic" : "lyrical";
}
function cumparsitaStyleWeight(cat: Catalog, style: "rhythmic" | "lyrical", s: Song): number {
  const st = cat.profile(s.orchestraId)?.style;
  const rhythmic = st === "rhythmic" || st === "guardia";
  if (style === "rhythmic") return rhythmic ? 2.5 : 0.15;
  return s.orchestraId === "carlos-di-sarli" ? 8 : rhythmic ? 0.15 : 2;
}
function cumparsitaWeight(cat: Catalog, o: ComposeOptions, s: Song): number {
  const i = CUMPARSITA_PREF.indexOf(s.orchestraId);
  const corpus = cat.fame.get(`la cumparsita|${s.orchestraId}`);
  const years = cumparsitaYears(cat, s.orchestraId);
  const bounds = o.eras.map((e) => ERA_PRESETS[e]?.years).filter((y): y is [number, number] => !!y);
  // round 13 (golden-age review R7): the night's own year range, when set, is the era the closer must come from
  const inEra = o.yearRange
    ? s.year! >= o.yearRange[0] && s.year! <= o.yearRange[1]
    : bounds.some((b) => s.year! >= b[0] && s.year! <= b[1]);
  return (
    (i === -1 ? 0.05 : 1.6 - i * 0.2) *
    (s.selection ? 1.3 : 1) *
    (corpus?.role === "cumparsita" ? 1 + (corpus.fame ?? 0) : 0.4) *
    (years.has(s.year!) ? 2.5 : 1) *
    (inEra ? 4 : 1)
  );
}

/**
 * Round 13 (cohesion R3): where a family's periods start — the catalogue's ≥ 18-month recording gaps for that orchestra
 * and singer, the singer's later stints (profile singerStints) and the curated line-up breaks (profile lineupBreaks).
 */
export function familyBreaks(cat: Catalog): NonNullable<FamilyOpts["breaks"]> {
  const memo = new Map<string, number[]>();
  return (orchestraId, singer, vocal) => {
    const k = `${orchestraId}|${singer ?? ""}|${vocal}`;
    const hit = memo.get(k);
    if (hit) return hit;
    const p = cat.profile(orchestraId);
    const out = gapBreaks(cat.recordingMonths(orchestraId, vocal ? singer : null));
    if (singer && p?.singerStints) {
      const key = Object.keys(p.singerStints).find((x) => normTitle(x) === normTitle(singer));
      for (const st of (key ? p.singerStints[key] : undefined)?.slice(1) ?? []) out.push(st[0] * 12);
    }
    for (const b of p?.lineupBreaks ?? []) {
      if (b.vocal !== undefined && b.vocal !== vocal) continue;
      const m = /^(\d{4})-(\d{2})/.exec(b.at);
      if (m) out.push(Number(m[1]) * 12 + Number(m[2]) - 1);
    }
    memo.set(k, out);
    return out;
  };
}
const sizeOf = (o: ComposeOptions, r: DanceRhythm) =>
  r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;

/** The scoring hooks the tanda builder reads: one construction for compose() and swapTanda() (wiring audit fix 6). */
export function makeScoring(cat: Catalog, o: ComposeOptions, contextModel?: ContextModel): Scoring {
  const rules: NightRules = o.rules ?? {};
  const rc = resolveContext(o.context, contextModel ?? BUILTIN_CONTEXT);
  const extraBl = new Set([...cat.blacklist]);
  const puglieseOnce = rules.puglieseOnce ?? o.hours < 6;
  return {
    energy: (id) => cat.profile(id)?.energy ?? 50,
    phase: (id) => cat.profile(id)?.phase,
    tier: (id) => cat.profile(id)?.tier ?? 3,
    notBefore: (id) => {
      const nb = o.overrides?.rules?.notBefore?.[id] ?? cat.profile(id)?.notBefore ?? 0;
      // long nights get two Pugliese slots, both in the last 40 % (round 8: a marathon spent him at 48–61 %)
      return id === "osvaldo-pugliese" && o.hours >= 6 && !puglieseOnce ? Math.max(nb, 0.6) : nb;
    },
    style: (id) => cat.profile(id)?.style,
    preferStyles: rc.preferStyles,
    avoidStyles: rc.avoidStyles,
    isDanceable: (s) => isDanceableSong(s, extraBl),
    canonical: cat.corpus.canonicalTandas as Scoring["canonical"],
    guardiaOnly: o.eras.every((e) => e === "guardia-vieja"),
    maxPerNight: (id) => {
      const m = cat.profile(id)?.maxPerNight;
      const v =
        m === undefined
          ? undefined
          : typeof m === "object"
            ? o.hours >= 6
              ? (m["6"] ?? m["4"])
              : (m["4"] ?? m["6"])
            : m;
      if (id === "osvaldo-pugliese") return puglieseOnce ? 1 : Math.max(2, v ?? 2);
      // round 14 (DJ review S5): a golden night's cap counts two tango tandas plus one vals or milonga
      if (isGoldenNight(o) && id !== "juan-d-arienzo" && o.hours < 5)
        return Math.max(v ?? CORPUS_CAPS[id] ?? DEFAULT_CAP, 3);
      return v;
    },
    notAfter: (id) => cat.profile(id)?.notAfter,
    neverClose: (id) => !!cat.profile(id)?.neverClose,
    nonDance: (id, title, year) => cat.nonDance(id, title, year),
    profile: (id) => cat.profile(id),
    singerOk: (id, singer) => cat.singerOk(id, singer),
    maxDifficulty: o.maxDifficulty,
    vocalBias: o.vocalBias,
    tempoShift: o.tempoShift,
    preferOrchestras: o.preferOrchestras,
    preferFamilies: o.preferFamilies,
    avoidMainPeak: (id) => !!cat.profile(id)?.avoidMainPeak,
    golden: isGoldenNight(o),
    bandOverrides: !!o.bandOverrides,
    hours: o.hours,
  };
}

/** dance-rhythm rows per orchestra over the whole catalogue: singer shares are judged against the orchestra's full output */
function orchTotals(cat: Catalog): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, songs] of cat.byOrchestra)
    m.set(
      id,
      songs.filter((s) => s.rhythm === "tango" || s.rhythm === "vals" || s.rhythm === "milonga").length,
    );
  return m;
}

const yearSetOf = (t: Tanda) => [
  ...new Set(t.songs.map((s) => (s.year && !s.yearApprox ? s.year : 0)).filter(Boolean)),
];
const famKey = (t: { orchestraId: string; singer: string | null; vocal: boolean }) =>
  `${t.orchestraId}|${t.singer ?? ""}|${t.vocal}`;

/**
 * Compose a night. Round 14: a golden night is composed and repaired under the strict panel; when the panel still
 * finds a rule broken, more draws (seeds derived from the night's own seed, so the result is reproducible
 * from `options.seed`) are tried — three while a blocker remains, one for should-fix items — and the cleanest night
 * is kept (fewest blockers, then the panel penalty with more than three energy jumps counted in, then the engine
 * score).
 */
export function compose(
  partial: Partial<ComposeOptions>,
  deps: ComposeDeps,
  extras: ComposeExtras = {},
): Playlist {
  const seed = partial.seed ?? Math.floor(Math.random() * 1e9);
  const first = composeOnce({ ...partial, seed }, deps, extras, seed);
  if (!isGoldenNight(first.options) || first.options.hours >= 5 || extras.locked?.some((t) => t.locked))
    return first;
  let best = first;
  let bestR = strictChecks(first);
  // (a draw with more than three energy jumps (H3) counts them as panel items)
  // (and a draw under the 85 the golden set must hold never wins over one above it)
  const pen = (q: Playlist, x: StrictResult) =>
    x.penalty + Math.max(0, nightTransitions(q.tandas).hard.H3 - 3) * 2 + (q.score.total < 85 ? 40 : 0);
  // (a blocker earns every extra draw; should-fix items only the first)
  for (let k = 1; k <= (bestR.blockers ? STRICT_REDRAWS : 2) && pen(best, bestR) > 0; k++) {
    const p = composeOnce({ ...partial, seed }, deps, extras, (seed ^ Math.imul(k, 0x9e3779b1)) >>> 0);
    const r = strictChecks(p);
    const pr = pen(p, r),
      pb = pen(best, bestR);
    if (
      r.blockers < bestR.blockers ||
      (r.blockers === bestR.blockers && (pr < pb || (pr === pb && p.score.total > best.score.total)))
    ) {
      best = p;
      bestR = r;
    }
  }
  return best;
}
/** how many extra draws a golden night gets when the strict panel still finds a rule broken */
export const STRICT_REDRAWS = 3;

function composeOnce(
  partial: Partial<ComposeOptions>,
  deps: ComposeDeps,
  extras: ComposeExtras,
  drawSeed: number,
): Playlist {
  // precedence (wiring audit fix 1): defaults → era settings → DB rules → tonight's explicit request → context (unset keys only)
  const req = Object.fromEntries(
    Object.entries(partial).filter(([k, v]) => v !== undefined && k !== "explicit"),
  ) as Partial<ComposeOptions>;
  const explicitKeys = new Set(partial.explicit ?? Object.keys(req));
  const era = req.eras?.[0] ?? "golden";
  const { notes: _n, rules: eraRules, ...eraDefaults } = ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!;
  let o: ComposeOptions = sanitizeOptions({
    ...DEFAULT_OPTIONS,
    ...eraDefaults,
    ...(req.overrides?.rules ?? {}),
    ...req,
    rules: { ...eraRules, ...(req.rules ?? {}) },
  });
  const rules = o.rules ?? {};
  if (o.arcShape) o.arcShape = arcShapeFor(o);
  const rc = resolveContext(o.context, deps.contextModel ?? BUILTIN_CONTEXT);
  o = sanitizeOptions(applyContextToOptions(o, rc, explicitKeys));
  // marathons and other long nights live on instrumentals after 02:00 (round 8: 29 vocal of 33 in a 6 h block)
  if (o.hours >= 5 && !explicitKeys.has("vocalBias")) o.vocalBias = (o.vocalBias ?? 0) - 0.12;
  // the night keeps its own seed; the draws use `drawSeed` (the seed itself, or a derived one on a re-draw)
  o.seed = o.seed ?? drawSeed;
  const seed = drawSeed;
  const rng = makeRng(seed);
  // plan with the real mean track length of the active pool so the night lands on the requested hours
  if (!o.avgTrackSec && !o.trackSecByRhythm) {
    const tsr: Partial<Record<DanceRhythm, number>> = {};
    for (const r of ["tango", "vals", "milonga"] as DanceRhythm[]) {
      // the sides a tanda can take (round 10: over-length streams and reissues never do, so they do not plan the hour)
      const pool = deps.catalog
        .filter({ eras: o.eras, rhythms: [r], yearRange: o.yearRange })
        .filter((s) => !isSuspectSide(s) && !s.reissue);
      // the sides the engine actually picks (corpus-known or stream-matched) run ~5 s shorter than the pool's mean,
      // which the estimated rows inflate: plan on them when there are enough (round 10: 4 h nights ran 3 min short)
      const known = pool.filter((s) => (s.fame ?? 0) > 0 || s.resolved || s.spotify);
      const planPool = known.length >= 50 ? known : pool;
      // the energy and fame weights favour the shorter sides again: a 4 h night's picks run ~2.5 % under the known
      // sides' mean; a long night spends the known sides and drifts back to the pool's mean by 8 h
      const mean = (xs: Song[]) =>
        xs.reduce((a, s) => a + (s.durationSec ?? 170), 0) / Math.max(1, xs.length);
      const long = Math.max(0, Math.min(1, (o.hours - 4) / 4));
      if (pool.length > 20) tsr[r] = Math.round((1 - long) * 0.975 * mean(planPool) + long * mean(pool));
    }
    o.trackSecByRhythm = tsr;
  }
  const breakMin = rules.showBreakAt != null ? (rules.showBreakMinutes ?? 20) : 0;
  const playHours = Math.max(0.5, o.hours - breakMin / 60);
  const slots = planSlots(breakMin ? { ...o, hours: playHours } : o);
  const breakAfter =
    rules.showBreakAt != null
      ? Math.max(1, Math.min(slots.length - 2, Math.round(rules.showBreakAt * (slots.length - 1))))
      : -1;
  for (const s of slots) {
    s.targetEnergy = Math.max(
      25,
      Math.min(100, s.targetEnergy + rc.energyShift + (rc.arcShift[s.phase] ?? 0)),
    );
    if (breakAfter >= 0 && s.index === breakAfter + 1) s.targetEnergy -= 8; // re-ramp after the show
    if (breakAfter >= 0 && s.index === breakAfter + 2) s.targetEnergy -= 4;
  }
  // round 14 (DJ S12): the context shifts may lift a fourth slot over 80; the plan never holds four peak slots in a row
  capPeakRuns(slots);
  // round 15 — the night-shape settings (rules.warmupTandas, rules.cooldown): the first N slots are warm-up slots of a
  // gentle ramp; a gentle cool-down plans its slots 6 points softer (the última keeps its own lift)
  const fallbacks: string[] = [];
  if (rules.warmupTandas !== undefined && slots.length > 3) {
    const w = Math.max(0, Math.min(Math.floor(slots.length / 3), Math.round(rules.warmupTandas)));
    slots.forEach((s, i) => {
      if (i < w) {
        s.phase = "warmup";
        s.targetEnergy = Math.min(s.targetEnergy, 48 + 4 * i);
        s.peak = false;
      } else if (s.phase === "warmup") s.phase = "build";
    });
  }
  if (rules.cooldown === "gentle")
    slots.forEach((s, i) => {
      if (s.phase === "cooldown" && i < slots.length - 1 && !s.peak)
        s.targetEnergy = Math.max(30, s.targetEnergy - 6);
    });
  const cat = deps.catalog;
  const sc = makeScoring(cat, o, deps.contextModel);
  const byRhythm: Record<DanceRhythm, TandaCandidate[]> = { tango: [], vals: [], milonga: [] };
  const breaksOf = familyBreaks(cat);
  for (const r of ["tango", "vals", "milonga"] as DanceRhythm[]) {
    const pool = cat
      .filter({
        eras: o.eras,
        rhythms: [r],
        includeOrchestras: o.includeOrchestras,
        excludeOrchestras: [...(o.excludeOrchestras ?? []), ...TANDA_POOL_EXCLUDES],
        onlySelection: o.onlySelection,
        requireSpotify: o.requireSpotify,
        yearRange: o.yearRange,
        minTier:
          o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
      })
      // La Cumparsita only ever opens or closes a night (rules), never inside an ordinary tanda;
      // undated and transcription rows never build a tanda (rules.allowUndated opts in)
      .filter((s) => normTitle(s.title) !== "la cumparsita" && isTandaEligible(s, !!rules.allowUndated));
    byRhythm[r] = families(
      pool,
      o.maxYearSpread,
      o.mixVocalInstrumental || (r !== "tango" && !!rules.mixedMilongaVals),
      orchTotals(cat),
      { rhythm: r, need: sizeOf(o, r), breaks: breaksOf },
    );
  }
  // a night's mood for orchestras: every orchestra gets a seed-drawn 0.5–1.6 factor so twelve nights are twelve nights (round 9 widened it)
  const nightBias = new Map<string, number>();
  for (const id of [...cat.profiles.keys()].sort()) nightBias.set(id, 0.5 + rng.next() * 1.1);
  // tonight's canon (round 9): the night must carry ≥ 3 of the preferred families, but which ones it leans on is
  // drawn per seed (four of the seven), so twelve golden nights do not all open with Canaro–Maida
  // a DJ also leaves someone out: one of the second-rank regulars steps back tonight (×0.25), drawn per seed, so
  // twelve nights are not the same fifteen orchestras in a different order (round 9)
  // (a marathon needs everyone: nights of 5 h and more keep the full bench)
  const absentee = o.hours < 5 ? makeRng((seed ^ 0x27d4eb2f) >>> 0).pick(NIGHT_ABSENTEES) : undefined;
  if (absentee && nightBias.has(absentee)) nightBias.set(absentee, (nightBias.get(absentee) ?? 1) * 0.25);
  const canonAll = o.preferFamilies ?? [];
  if (o.preferFamilies?.length) {
    const crng = makeRng((seed ^ 0x9e3779b9) >>> 0); // its own stream: the tanda draws of a seed stay what they were
    const ids = [...new Set(o.preferFamilies.map((f) => f.id))];
    const keep = new Set<string>();
    const pool = ids.slice();
    while (keep.size < Math.min(4, ids.length) && pool.length) {
      const pick = crng.pick(pool)!;
      keep.add(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    o = { ...o, preferFamilies: o.preferFamilies.filter((f) => keep.has(f.id)) };
  }
  const ctx: BuildContext = {
    recentOrchestras: [],
    recentSingers: [],
    usedTitles: new Set(),
    usedSongIds: new Set(),
    totalSlots: slots.length,
    nightBias,
    usedFamilies: [],
  };
  const tandas: Tanda[] = [];
  ctx.history = tandas;
  const lockedByIndex = new Map((extras.locked ?? []).filter((t) => t.locked).map((t) => [t.index, t]));
  for (const t of lockedByIndex.values()) {
    for (const s of t.songs) {
      ctx.usedSongIds.add(s.id);
      ctx.usedTitles.add(normTitle(s.title));
    }
    if (t.yearRange)
      ctx.usedFamilies!.push({
        orchestraId: t.orchestraId,
        singer: t.singer,
        rhythm: t.rhythm,
        years: t.yearRange,
        yearSet: yearSetOf(t),
      });
  }
  const last = slots.length - 1;
  const ultimaRule = rules.ultimaRule ?? "emotional-vocal";
  // ultimaRule "pugliese": Pugliese is reserved for the última, so the body never spends him
  const bodySc: Scoring =
    ultimaRule === "pugliese"
      ? { ...sc, maxPerNight: (id) => (id === "osvaldo-pugliese" ? 0 : sc.maxPerNight?.(id)) }
      : sc;
  let colourDone = false;
  // the first D'Arienzo (corpus median 19 % of the night, before 35 %): one early tango slot per seed is his
  // round 9: with a planned first summit ahead, the early slot sits a full repeat gap before it so he can take the
  // peak chair (22 slots: slot 3, 14 % of the night; the corpus median is 19 %)
  const firstPeak = slots.find((s) => s.peak)?.index ?? -1;
  const earlySlots0 = slots.filter(
    (s) => s.rhythm === "tango" && s.index > 0 && s.position >= 0.08 && s.position <= 0.33,
  );
  const earlySlots1 =
    firstPeak >= 0 ? earlySlots0.filter((s) => s.index <= firstPeak - o.orchestraRepeatGap) : earlySlots0;
  const earlySlots = earlySlots1.length ? earlySlots1 : earlySlots0;
  const earlyDASlot = earlySlots.length && !lockedByIndex.size ? rng.pick(earlySlots)!.index : -1;
  ctx.earlyDASlot = earlyDASlot;
  ctx.lastSummit = slots.filter((s) => s.peak).at(-1)?.index;
  // Pugliese once: his slot is drawn around the corpus median (0.87) instead of the first eligible peak slot;
  // the última itself is a candidate (he is the most common final tanda before La Cumparsita)
  const puglieseOnce = (sc.maxPerNight?.("osvaldo-pugliese") ?? 2) <= 1;
  // never on a planned peak slot (round 9): the peaks are rhythmic summits, Pugliese is the emotional one beside them
  // round 14 (DJ B3): never straight after a planned summit; on a double-peak night 2–4 slots before the last summit
  // (D, a vals / milonga / balanced tango, …, the R+ summit), never after it
  const lastSummit = slots.filter((s) => s.peak).at(-1)?.index ?? -1;
  const afterSummit = new Set(slots.filter((s) => s.peak).map((s) => s.index + 1));
  const pugSlots0 = slots.filter(
    (s) => s.rhythm === "tango" && s.position >= 0.62 && !s.peak && !afterSummit.has(s.index),
  );
  const pugDouble =
    o.arcShape === "double" && lastSummit >= 0
      ? slots.filter(
          (s) =>
            s.rhythm === "tango" &&
            !s.peak &&
            s.position >= 0.5 &&
            s.index >= lastSummit - 4 &&
            s.index <= lastSummit - 2,
        )
      : [];
  // (a build slot of the window first: Pugliese is the emotional one beside the peak, not a peak-phase chair)
  const pugCalm = pugDouble.filter((s) => s.phase !== "peak");
  const pugSlots = pugCalm.length ? pugCalm : pugDouble.length ? pugDouble : pugSlots0;
  const pugProfile = cat.profile("osvaldo-pugliese");
  const pugAllowed =
    !sc.avoidStyles?.includes(pugProfile?.style ?? "dramatic") &&
    (o.maxDifficulty === undefined || (pugProfile?.difficulty ?? 0) <= o.maxDifficulty);
  const pugSlot =
    puglieseOnce && pugAllowed && pugSlots.length && !lockedByIndex.size && ultimaRule !== "pugliese"
      ? (rng.weighted(pugSlots, (s) =>
          pugDouble.length ? 1 : Math.exp(-(((s.position - 0.87) / 0.14) ** 2)),
        )?.index ?? -1)
      : -1;
  const daTangoCount = () =>
    tandas.filter((t) => t.orchestraId === "juan-d-arienzo" && t.rhythm === "tango").length;
  /** D'Arienzo's tango tandas: 3 per 4 h, a fourth in a night of 5 h and more (round 10) */
  const daTangoMax = o.hours >= 5 ? 4 : 3;
  // round 10 — the última is reserved: one vocal closer family (Biagi–Ortiz, Tanturi–Castillo, Troilo–Fiorentino,
  // Di Sarli–Rufino, D'Agostino–Vargas …) is drawn per seed and held back from the body (its orchestra once at most,
  // the family itself never), so the night still has a strong ending once the caps and the family rule have spoken
  const ultimaWorthy = (c: TandaCandidate) => {
    const p = cat.profile(c.orchestraId);
    const top = c.songs
      .filter(
        (s) =>
          (s.fame ?? 0) >= 3 &&
          streamable(s) &&
          !isSuspectSide(s) &&
          (!p?.goldenBands || goldenClassOf(p, [s.year ?? 0]) === "core"),
      )
      .map((s) => s.fame ?? 0)
      .sort((a, b) => b - a)
      .slice(0, o.tangoTandaSize);
    return top.length >= o.tangoTandaSize && top.reduce((a, b) => a + b, 0) / top.length >= 4;
  };
  const ultimaPick = (c: TandaCandidate) =>
    !!rules.ultimaOrchestra &&
    c.orchestraId === rules.ultimaOrchestra &&
    (rules.ultimaSinger === undefined ||
      (rules.ultimaSinger === null
        ? !c.vocal
        : c.vocal && normTitle(c.singer ?? "") === normTitle(rules.ultimaSinger)));
  const ultimaReserve: TandaCandidate | null = (() => {
    // round 15: an última the DJ named is reserved like the drawn one (its strongest family)
    if (rules.ultimaOrchestra && !lockedByIndex.size) {
      const fams = byRhythm.tango.filter(ultimaPick);
      return (
        fams.sort(
          (a, b) =>
            b.songs.reduce((x, y) => x + (y.fame ?? 0), 0) - a.songs.reduce((x, y) => x + (y.fame ?? 0), 0),
        )[0] ?? null
      );
    }
    if (ultimaRule !== "emotional-vocal" || lockedByIndex.size || o.hours < 2) return null;
    if (explicitKeys.has("vocalBias") && (o.vocalBias ?? 0) < 0) return null; // "more instrumental" means it
    const closers = byRhythm.tango.filter(
      (c) =>
        c.vocal &&
        ULTIMA_POOL.includes(c.orchestraId) &&
        c.orchestraId !== "juan-d-arienzo" &&
        c.orchestraId !== "alfredo-de-angelis" &&
        c.orchestraId !== "osvaldo-pugliese" &&
        c.songs.filter((s) => (s.fame ?? 0) >= 2).length >= o.tangoTandaSize &&
        // round 15 (dancer N7, DJ N4): a golden última is a core family with a tanda of beloved sides (every side
        // fame ≥ 3, mean ≥ 4) that streams
        (!isGoldenNight(o) || ultimaWorthy(c)) &&
        // the family must be able to end the night: its hottest sides average at least e72
        c.songs
          .map((s) => s.energy ?? 50)
          .sort((a, b) => b - a)
          .slice(0, o.tangoTandaSize)
          .reduce((a, b, _, arr) => a + b / arr.length, 0) >= 78,
    );
    const rrng = makeRng((seed ^ 0x165667b1) >>> 0);
    return (
      rrng.weighted(closers, (c) => {
        const es = c.songs
          .map((s) => s.energy ?? 50)
          .sort((a, b) => b - a)
          .slice(0, o.tangoTandaSize);
        const e = es.reduce((a, b) => a + b, 0) / Math.max(1, es.length);
        const fame = c.songs.reduce((a, s) => a + (s.fame ?? 0), 0);
        const rhythmic = cat.profile(c.orchestraId)?.style === "rhythmic" ? 2 : 1;
        // the profile's singer preference (Biagi: Falgás +2, Ortiz 0, Amor −4) weighs the closer too
        const shift = c.singer ? (cat.profile(c.orchestraId)?.singerShift?.[c.singer] ?? 0) : 0;
        return (
          Math.max(0.05, 1 - Math.abs(e - 76) / 25) *
          (1 + fame / 10) *
          rhythmic *
          Math.max(0.3, 1 + shift / 8)
        );
      }) ?? null
    );
  })();
  const sameFamily = (r: TandaCandidate | null, c: { orchestraId: string; singer: string | null }) =>
    !!r && c.orchestraId === r.orchestraId && (c.singer ?? "") === (r.singer ?? "");
  // round 11 (R2): a second closer-class family is reserved for the pre-summit shoulder (the two tango slots before
  // the main peak), so that stretch is not left to the two-hit families once the caps have spoken
  const mainPeak = slots.filter((s) => s.peak).at(-1)?.index ?? -1;
  const shoulderSlots = new Set(
    slots
      .filter((s) => s.rhythm === "tango" && s.index < mainPeak && s.index >= mainPeak - 3)
      .map((s) => s.index),
  );
  const shoulderReserve: TandaCandidate | null = (() => {
    if (!ultimaReserve || mainPeak < 0 || !shoulderSlots.size) return null;
    const closers = byRhythm.tango.filter(
      (c) =>
        c.vocal &&
        c.orchestraId !== ultimaReserve.orchestraId &&
        c.orchestraId !== "juan-d-arienzo" &&
        c.orchestraId !== "osvaldo-pugliese" &&
        c.orchestraId !== "alfredo-de-angelis" &&
        c.songs.filter((s) => (s.fame ?? 0) >= 2).length >= o.tangoTandaSize &&
        !cat.profile(c.orchestraId)?.avoidMainPeak &&
        (sc.phase(c.orchestraId)?.includes("peak") ?? true),
    );
    const srng = makeRng((seed ^ 0x7f4a7c15) >>> 0);
    return (
      srng.weighted(closers, (c) => {
        const es = c.songs
          .map((s) => s.energy ?? 50)
          .sort((a, b) => b - a)
          .slice(0, o.tangoTandaSize);
        const e = es.reduce((a, b) => a + b, 0) / Math.max(1, es.length);
        const fame = c.songs.reduce((a, s) => a + (s.fame ?? 0), 0);
        const shift = c.singer ? (cat.profile(c.orchestraId)?.singerShift?.[c.singer] ?? 0) : 0;
        // a canon family (Tanturi–Castillo over Tanturi–Campos) is the shoulder's first choice
        const canon = matchFamily(canonAll, { orchestraId: c.orchestraId, singer: c.singer }) ? 3 : 1;
        return (
          canon * Math.max(0.05, 1 - Math.abs(e - 78) / 25) * (1 + fame / 10) * Math.max(0.3, 1 + shift / 8)
        );
      }) ?? null
    );
  })();
  /** closer-class families (round 11): vocal, a tanda of known sides, hot enough for the shoulder or the última */
  const closerClassList = byRhythm.tango.filter((c) => {
    if (!c.vocal || c.songs.filter((s) => (s.fame ?? 0) >= 2).length < o.tangoTandaSize) return false;
    const es = c.songs
      .map((s) => s.energy ?? 50)
      .sort((a, b) => b - a)
      .slice(0, o.tangoTandaSize);
    const ph = sc.phase(c.orchestraId);
    return (
      es.reduce((a, b) => a + b, 0) / Math.max(1, es.length) >= 72 &&
      (!ph || ph.includes("peak") || ph.includes("build"))
    );
  });
  const closerClass = new Set(closerClassList.map(famKey));
  // round 11 (R3): under one tango chair per orchestra, a night of under 5 h draws two canon families beyond the two
  // reserves and protects their orchestras (no instrumental, no other singer) until the canon family has played, so
  // the three canon families the rule asks for are still there once the caps have spoken
  const canonDraws: PreferredFamily[] = (() => {
    if (o.hours >= 5 || o.hours < 3.5 || !canonAll.length) return [];
    const taken = new Set([ultimaReserve?.orchestraId, shoulderReserve?.orchestraId]);
    const pool = canonAll.filter((f) => f.orchestraId !== "juan-d-arienzo" && !taken.has(f.orchestraId));
    const drng = makeRng((seed ^ 0x3c6ef372) >>> 0);
    const out: PreferredFamily[] = [];
    for (let i = 0; i < 2 && pool.length; i++) {
      const f = drng.pick(pool.filter((x) => !out.includes(x)));
      if (f) out.push(f);
    }
    return out;
  })();
  const protectedOrch = (c: TandaCandidate) =>
    canonDraws.some(
      (f) =>
        f.orchestraId === c.orchestraId &&
        !(c.vocal && (c.singer ?? "") === (f.singer ?? "")) &&
        !tandas.some((t) => t.rhythm === "tango" && matchFamily([f], t)?.id === f.id),
    );
  const reservedFamily = (c: { orchestraId: string; singer: string | null }, slot?: Slot) =>
    sameFamily(ultimaReserve, c) ||
    (sameFamily(shoulderReserve, c) && !(slot && shoulderSlots.has(slot.index)));
  /** two-hit families (De Angelis–Dante, Rodríguez–Flores, Láurenz–Casas …): fewer than three known sides */
  const twoHit = (c: TandaCandidate) => c.vocal && c.songs.filter((s) => (s.fame ?? 0) >= 2).length < 3;
  const strongUnused = (c: TandaCandidate, min: number) =>
    c.songs.filter(
      (s) => (s.fame ?? 0) >= 2 && !ctx.usedSongIds.has(s.id) && !ctx.usedTitles.has(normTitle(s.title)),
    ).length >= min;
  let prevWeakVocal = false;
  /** a forced orchestra still respects the repeat gap: the force waits for the next slot otherwise */
  const gapFree = (id: string) => {
    const i = ctx.recentOrchestras.indexOf(id);
    return i === -1 || i >= o.orchestraRepeatGap - 1;
  };
  /** before the drawn Pugliese slot, Pugliese stays out of the body; before the drawn D'Arienzo slot, no D'Arienzo vals/milonga */
  const scFor = (slot: Slot): Scoring => {
    const holdPug = pugSlot >= 0 && slot.index < pugSlot && slot.index !== last;
    // D'Arienzo's vals/milonga never steal a slot before his first tango tanda nor the late slots his second one needs
    // D'Arienzo's first tango tanda is the drawn early slot itself (a planned peak with a glide after it), never an
    // unplanned e84 at a t51 warm-up slot before it
    // (round 9) nor a slot within the repeat gap before a planned peak while he is still due there
    const peakSoon = slots.some(
      (x) => x.peak && x.index > slot.index && x.index - slot.index <= o.orchestraRepeatGap,
    );
    const holdDA =
      (slot.rhythm !== "tango" &&
        ((earlyDASlot >= 0 && slot.index < earlyDASlot) ||
          (peakSoon && daTangoCount() < daTangoMax) ||
          (slot.position >= 0.6 && (daTangoCount() < 2 || ultimaRule === "d-arienzo-rhythmic")))) ||
      (slot.rhythm === "tango" && earlyDASlot >= 0 && slot.index < earlyDASlot && daTangoCount() === 0);
    const holdRes = !!ultimaReserve && slot.index !== last;
    const holdSh = !!shoulderReserve && !shoulderSlots.has(slot.index) && slot.index < mainPeak;
    // round 11 (R2): the closer-class families are the shoulder's: ×2 on 60–85 %
    const weightOf =
      o.hours < 5 && slot.rhythm === "tango" && slot.index !== last
        ? (c: TandaCandidate) =>
            closerClass.has(famKey(c)) && slot.position >= 0.6 && slot.position <= 0.85 ? 2 : 1
        : undefined;
    if (!holdPug && !holdDA && !holdRes && !holdSh) return { ...bodySc, weightOf };
    return {
      ...bodySc,
      weightOf,
      maxPerNight: (id) =>
        (holdPug && id === "osvaldo-pugliese") || (holdDA && id === "juan-d-arienzo")
          ? 0
          : holdRes && id === ultimaReserve.orchestraId
            ? slot.rhythm === "tango" || slot.index > last - o.orchestraRepeatGap
              ? 0
              : Math.min(1, bodySc.maxPerNight?.(id) ?? 1)
            : holdSh && id === shoulderReserve.orchestraId
              ? slot.rhythm === "tango" || slot.index > Math.min(...shoulderSlots) - o.orchestraRepeatGap
                ? 0
                : Math.min(1, bodySc.maxPerNight?.(id) ?? 1)
              : bodySc.maxPerNight?.(id),
    };
  };
  // round 9 — the vocal governor: at most `maxInstrumentalBeforeVocal` instrumental tango tandas before the first
  // vocal one (the planned early D'Arienzo counts as one), and the vocal share of the tango tandas steered inside
  // `vocalShare` (golden: 0.55–0.75); the canon rule: a golden night of ≥ 3.5 h carries ≥ 3 canon vocal families
  const tangoTotal = slots.filter((s) => s.rhythm === "tango").length;
  const maxInstr = rules.maxInstrumentalBeforeVocal;
  const band: [number, number] | undefined =
    rules.vocalShare ??
    (o.eras.includes("golden") || o.eras.includes("golden-extended") ? [0.55, 0.75] : undefined);
  const hardBand: [number, number] | undefined =
    band && !explicitKeys.has("vocalBias") ? (o.hours >= 5 ? [0.35, band[1]] : band) : undefined;
  const canonRule = o.hours >= 3.5 && canonAll.length > 0;
  let tangoDone = 0,
    vocalDone = 0,
    instrBeforeVocal = 0,
    firstVocalDone = false;
  const canonDone = () =>
    new Set(
      tandas
        .filter((t) => t.rhythm === "tango" && t.vocal)
        .map((t) => matchFamily(canonAll, t)?.id)
        .filter((x): x is string => !!x),
    ).size;
  const isVocal = (c: TandaCandidate) => c.vocal;
  /** what this tango slot must be: vocal / instrumental / a canon family (hard), plus a soft vocal lean */
  const constraints = (slot: Slot) => {
    const remaining = tangoTotal - tangoDone; // this slot included
    const daPending = earlyDASlot > slot.index && daTangoCount() === 0;
    const budget = (maxInstr ?? 99) - (daPending ? 1 : 0);
    // slots still to come that will not sing (planned peaks, the early D'Arienzo) and the última, which usually does
    // (round 14: on a golden night the main summit is D'Arienzo–Echagüe first, a vocal chair)
    const instrAhead =
      slots.filter((x) => x.peak && x.index > slot.index && !(isGoldenNight(o) && x.index === mainPeak))
        .length + (daPending ? 1 : 0);
    const vocalAhead = slot.index < last ? 1 : 0;
    const earlyVoice =
      !firstVocalDone &&
      maxInstr !== undefined &&
      instrBeforeVocal >= budget &&
      !(explicitKeys.has("vocalBias") && (o.vocalBias ?? 0) < 0);
    const mustInstr = !earlyVoice && !!hardBand && (vocalDone + 1 + vocalAhead) / tangoTotal > hardBand[1];
    // the projection keeps a 5 % margin: the remaining slots never all sing (round 10: four instrumentals in a row)
    const mustVocal =
      earlyVoice ||
      (!mustInstr &&
        !!hardBand &&
        (vocalDone + remaining - 1 - instrAhead) / tangoTotal < hardBand[0] + 0.05);
    const reserved =
      1 + (pugSlot > slot.index ? 1 : 0) + (earlyDASlot > slot.index && daTangoCount() === 0 ? 1 : 0);
    const cd = canonRule ? canonDone() : CANON_FAMILIES_MIN;
    const canonPending = cd < CANON_FAMILIES_MIN;
    const mustCanon = canonPending && remaining - reserved <= CANON_FAMILIES_MIN - cd + 1;
    const share = tangoDone ? vocalDone / tangoDone : 0.65;
    // a marathon's plateau is instrumental territory: its lean starts at the band's floor, a 4 h night's at the middle
    const mid = hardBand ? (o.hours >= 5 ? hardBand[0] : (hardBand[0] + hardBand[1]) / 2) : 0.65;
    const lean = !hardBand || tangoDone < 2 ? 0 : share < mid ? 0.25 : share > hardBand[1] ? -0.25 : 0;
    return { mustVocal, mustInstr, mustCanon, canonPending, lean };
  };
  const canonFilter = (c: TandaCandidate) => {
    const ys = c.songs.map((x) => x.year).filter((y): y is number => !!y);
    const fam = matchFamily(canonAll, {
      orchestraId: c.orchestraId,
      singer: c.singer,
      years: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
    });
    return !!fam && !tandas.some((t) => t.rhythm === "tango" && matchFamily([fam], t)?.id === fam.id);
  };
  /** candidate layers for a tango slot, most constrained first; the scoring carries the soft vocal lean */
  /** a family the repeat gaps allow here: a narrow layer must never trigger buildTanda's no-gap fallback */
  const gapFreeCand = (c: TandaCandidate) =>
    gapFree(c.orchestraId) &&
    (!c.singer ||
      ctx.recentSingers.indexOf(c.singer) === -1 ||
      ctx.recentSingers.indexOf(c.singer) >= o.singerRepeatGap);
  const tangoLayers = (
    slot: Slot,
    base: TandaCandidate[],
  ): { layers: TandaCandidate[][]; sc: Scoring; soft: Set<TandaCandidate[]> } => {
    const k = constraints(slot);
    ctx.canonPending = k.canonPending;
    // round 13 (transitions H1): the slot before the drawn Pugliese slot never holds another dramatic orchestra
    const beforePug = pugSlot >= 0 && slot.index === pugSlot - 1;
    const base0 = base.filter(
      (c) => !reservedFamily(c, slot) && !(beforePug && cat.profile(c.orchestraId)?.style === "dramatic"),
    );
    const base1 = base0.length ? base0 : base;
    // round 11 (R2): two-hit families only in the first 20 % or the cool-down, never two of them adjacent, and in
    // 60–85 % a vocal family must still hold two known sides
    const midNight = o.hours < 5 && slot.position >= 0.2 && slot.phase !== "cooldown";
    const weakOk = (c: TandaCandidate) => (!twoHit(c) ? true : !midNight && !prevWeakVocal);
    const strongMid = (c: TandaCandidate) =>
      o.hours >= 5 || !c.vocal || !(slot.position >= 0.6 && slot.position <= 0.85) || strongUnused(c, 2);
    const base2 = base1.filter((c) => weakOk(c) && strongMid(c));
    const base3 = base2.length ? base2 : base1.filter(strongMid).length ? base1.filter(strongMid) : base1;
    const v0 = k.mustVocal ? base3.filter(isVocal) : k.mustInstr ? base3.filter((c) => !c.vocal) : base3;
    // the protected canon orchestras are a trailing layer in their other modes (round 11, R3)
    const guard = canonDraws.length > 0 && slot.index !== last;
    const early = guard ? v0.filter((c) => !protectedOrch(c)) : v0;
    const v = early !== v0 && early.length >= 2 ? early : v0;
    const layers: TandaCandidate[][] = [];
    const soft = new Set<TandaCandidate[]>();
    // the shoulder's reserved family first in its own slots
    if (shoulderReserve && shoulderSlots.has(slot.index)) {
      const sh = base.filter((c) => sameFamily(shoulderReserve, c)).filter(gapFreeCand);
      if (sh.length) layers.push(sh);
    }
    if (k.mustCanon) layers.push(v.filter(canonFilter).filter(gapFreeCand));
    // round 13: an hour without an instrumental tanda is the benchmark's worst miss (Victor Tran: ≥ 1/3 each hour);
    // after four voices in a row the instrumental families come first unless the vocal band says otherwise
    const last4 = tandas.slice(-4);
    if (!k.mustVocal && last4.length >= 3 && last4.slice(-3).every((t) => t.vocal)) {
      const instr = v.filter((c) => !c.vocal).filter(gapFreeCand);
      if (instr.length) {
        layers.push(instr);
        soft.add(instr);
      }
    }
    layers.push(v === base ? v : v.filter(gapFreeCand));
    if (v !== v0) layers.push(v0.filter(gapFreeCand));
    if (v0 !== base3) layers.push(base3);
    const sc0 = scFor(slot);
    const sc = k.lean ? { ...sc0, vocalBias: (sc0.vocalBias ?? 0) + k.lean } : sc0;
    return { layers: layers.filter((l) => l.length), sc, soft };
  };
  const tryLayers = (
    slot: Slot,
    layers: TandaCandidate[][],
    sc: Scoring,
    soft?: Set<TandaCandidate[]>,
  ): Tanda | null => {
    for (const [li, l] of layers.entries()) {
      // a preference layer never forces a family that breaks a round-13 rule: the next layer is tried instead; a
      // narrower layer (canon, vocal band …) gives way when all it holds breaks a heavy rule (colour, another era)
      const strict = soft?.has(l) ? 1 : li < layers.length - 1 ? 3 : undefined;
      const t = buildTanda(slot, l, o, rng, ctx, strict !== undefined ? { ...sc, strict } : sc);
      if (!t) continue;
      // round 12 (R6): in the last third of a long night a tanda more than 10 under its target gets up to three more
      // families from the same layer and the closest holds the chair (a soft De Angelis–Dante at e63 for t80 sank
      // the marathon's last third once a few more sides carried their stream length)
      if (o.hours >= 5 && slot.position >= 0.66 && t.energy < slot.targetEnergy - 10) {
        let best = t;
        const tried = new Set([famKey(t)]);
        for (let k = 0; k < 3; k++) {
          const pool = l.filter((c) => !tried.has(famKey(c)));
          if (!pool.length) break;
          const u = buildTanda(slot, pool, o, rng, ctx, sc);
          if (!u) break;
          tried.add(famKey(u));
          if (Math.abs(u.energy - slot.targetEnergy) < Math.abs(best.energy - slot.targetEnergy)) best = u;
          if (best.energy >= slot.targetEnergy - 10) break;
        }
        return best;
      }
      return t;
    }
    return null;
  };
  /** a planned peak (round 9): peak material only, up to six tries for energy ≥ target − 4, the best try otherwise */
  // round 14: the strict panel's peak filters first; when they leave the chair empty, the round-13 peak rules alone
  // (a planned summit stays a summit: the panel then reports what it could not get)
  // (and when the panel's choice cannot deliver target − 4, the round-13 choice that can takes the chair)
  const buildPeak = (slot: Slot, layers0: TandaCandidate[][], sc: Scoring): Tanda | null => {
    const a = buildPeak0(slot, layers0, sc, true);
    if (a && a.energy >= slot.targetEnergy - 4) return a;
    const b = buildPeak0(slot, layers0, sc, false);
    // (only a chair the panel accepts: not a colour orchestra, known sides, no D'Arienzo outside DJ S2/S3)
    const panelOk = (t: Tanda) =>
      !isGoldenNight(o) ||
      (!isColour(cat.profile(t.orchestraId)) &&
        t.songs.reduce((x, s0) => x + (s0.fame ?? 0), 0) / Math.max(1, t.songs.length) >= 3 &&
        t.orchestraId !== "juan-d-arienzo");
    if (b && b.energy >= slot.targetEnergy - 4 && (!a || panelOk(b))) return b;
    // round 15: the first summit keeps Echagüe for the last one only while someone else can still lift it
    const best0 = a ?? b;
    // (a first summit within 8 of its target keeps Echagüe for the last one: the hot-slot rule is a should-fix, the
    // anthem-less last summit too, and the floor remembers the last)
    if (isGoldenNight(o) && o.hours < 5 && (!best0 || best0.energy < slot.targetEnergy - 8)) {
      // the D'Arienzo instrumental summit family next, Echagüe himself only when nothing else lifts it
      const c1 = buildPeak0(slot, layers0, sc, true, 1);
      if (c1 && c1.energy >= slot.targetEnergy - 4) return c1;
      // (the best of what does not spend Echagüe; Echagüe only when nothing else fills the chair at all)
      const pick = [best0, c1].filter((x): x is Tanda => !!x).sort((x, y) => y.energy - x.energy)[0];
      if (pick && pick.energy >= slot.targetEnergy - 4) return pick;
      // (a summit still delivers its energy, round 9: Echagüe takes it when nobody else can)
      const c2 = buildPeak0(slot, layers0, sc, true, 2);
      return c2 && (!pick || c2.energy > pick.energy) ? c2 : (pick ?? null);
    }
    return best0;
  };
  const buildPeak0 = (
    slot: Slot,
    layers0: TandaCandidate[][],
    sc: Scoring,
    strict14: boolean,
    /** round 15 (first summit): 0 — no D'Arienzo; 1 — his instrumentals; 2 — Echagüe too */
    daLevel = 0,
  ): Tanda | null => {
    const tried = new Set<string>();
    let best: Tanda | null = null;
    // the peak chair is D'Arienzo's while he has played at most once (Echagüe 1938–39 or the instrumentals); a third
    // D'Arienzo is the last resort when nobody else reaches the summit (the review's own layout: 5, 11, 16)
    // round 11 (R1): at the main peak the instrumental family holding three unused sides of fame ≥ 3 (1935–39:
    // El flete, El internado, Hotel Victoria, El cencerro) comes before the 1945 set
    // round 13 (cohesion R9): the years an earlier D'Arienzo instrumental tango tanda used are not the summit's
    const daYears = new Set(
      tandas
        .filter((t) => t.orchestraId === "juan-d-arienzo" && !t.vocal && t.rhythm === "tango")
        .flatMap((t) => t.songs.map((s) => s.year)),
    );
    const summitFamily = (c: TandaCandidate) =>
      c.songs.filter(
        (s) =>
          (s.fame ?? 0) >= 3 &&
          !isSuspectSide(s) &&
          !ctx.usedSongIds.has(s.id) &&
          !ctx.usedTitles.has(normTitle(s.title)) &&
          !(c.orchestraId === "juan-d-arienzo" && !c.vocal && daYears.has(s.year)),
      ).length >= 3;
    const isMain = slot.index === mainPeak;
    // R1: a D'Arienzo instrumental at a planned peak is the summit family or nothing (never the 1945 set with two
    // fame-0 sides); before the main peak the summit family itself is held for it
    // round 15 (dancer N5): on a golden night of under 5 h the last summit is D'Arienzo–Echagüe 1938–39 (Pensalo bien,
    // No mientas, Ansiedad: the anthems of fame 5), so the instrumental summit family takes the first summit
    const golden15 = isGoldenNight(o) && o.hours < 5;
    const holdSummit = (c: TandaCandidate) =>
      c.orchestraId === "juan-d-arienzo" &&
      !c.vocal &&
      (!summitFamily(c) || (!golden15 && !isMain && slot.index < mainPeak));
    // round 14 (DJ S2): the D'Arienzo peak chair is Echagüe 1938–39 or an instrumental 1937–40, never a Mauré set
    // (DJ S3: and never the line-up period of an earlier D'Arienzo instrumental tango tanda)
    const daPeriods = new Set(
      tandas
        .filter((t) => t.orchestraId === "juan-d-arienzo" && !t.vocal && t.rhythm === "tango")
        .map((t) => lineupPeriod(t.orchestraId, false, t.songs)),
    );
    const daPeakOk = (c: TandaCandidate) => {
      if (c.orchestraId !== "juan-d-arienzo") return true;
      const ys = c.songs.map((x) => x.year ?? 0).filter(Boolean);
      const lo = Math.min(...ys),
        hi = Math.max(...ys);
      if (
        !c.vocal &&
        daPeriods.has(
          lineupPeriod(
            c.orchestraId,
            false,
            c.songs.filter((x) => (x.year ?? 0) >= 1937),
          ),
        )
      )
        return false;
      const [ylo, yhi] = c.vocal ? [1938, 1939] : [1937, 1940];
      // (dancer R14-7a: and two hits of fame ≥ 4 to carry it)
      const hits = c.songs.filter(
        (x) =>
          (x.fame ?? 0) >= 4 &&
          (x.year ?? 0) >= ylo &&
          (x.year ?? 0) <= yhi &&
          !ctx.usedTitles.has(normTitle(x.title)),
      ).length;
      if (isGoldenNight(o) && hits < 2) return false;
      return c.vocal
        ? normTitle(c.singer ?? "").endsWith("echague") && hi >= ylo && lo <= yhi
        : hi >= ylo && lo <= yhi;
    };
    // (the family's sides narrowed to those years, so the tanda itself sits inside them)
    const daPeakSides = (c: TandaCandidate): TandaCandidate => {
      if (c.orchestraId !== "juan-d-arienzo") return c;
      const [lo, hi] = c.vocal ? [1938, 1939] : [1937, 1940];
      return { ...c, songs: c.songs.filter((x) => !!x.year && x.year >= lo && x.year <= hi) };
    };
    const layers = layers0
      .map((l) =>
        strict14
          ? l.filter((c) => !holdSummit(c) && daPeakOk(c)).map(daPeakSides)
          : // (never a Mauré or other non-Echagüe vocal D'Arienzo at a planned peak, DJ S2)
            l.filter(
              (c) =>
                !holdSummit(c) &&
                !(
                  isGoldenNight(o) &&
                  c.orchestraId === "juan-d-arienzo" &&
                  c.vocal &&
                  !normTitle(c.singer ?? "").endsWith("echague")
                ),
            ),
      )
      .filter((l) => l.length);
    const daLayers = (vocal?: boolean) =>
      layers
        .map((l) =>
          l
            .filter((c) => c.orchestraId === "juan-d-arienzo" && (vocal === undefined || c.vocal === vocal))
            // the summit family is held for the main peak: last at the first summit, first at the main one
            .filter((c) => golden15 || isMain || slot.index > mainPeak || !summitFamily(c) || c.vocal)
            .sort((a, b) => (isMain ? 1 : -1) * (Number(summitFamily(b)) - Number(summitFamily(a)))),
        )
        .filter((l) => l.length)
        .flatMap((l) => (isMain && l.some(summitFamily) ? [l.filter(summitFamily), l] : [l]));
    // round 13: of the summit families, the one with the most famous unused sides in the family's best years (the
    // 1935–39 Biagi-piano sessions) holds the chair; the smaller windows are no longer summit-sized look-alikes
    const summitWeight = (c: TandaCandidate) =>
      c.songs.filter(
        (s) =>
          (s.fame ?? 0) >= 3 &&
          !isSuspectSide(s) &&
          !ctx.usedSongIds.has(s.id) &&
          !ctx.usedTitles.has(normTitle(s.title)) &&
          !daYears.has(s.year) &&
          familyBand(cat.profile(c.orchestraId), c.singer, s.year) === "best",
      ).length;
    const summitFirst = isMain
      ? daLayers(false)
          .filter((l) => l.every(summitFamily))
          .map((l) => {
            const top = Math.max(...l.map(summitWeight));
            return top >= 3 ? l.filter((c) => summitWeight(c) === top) : l;
          })
      : [];
    const n = daTangoCount();
    // the sampled layers first (D'Arienzo is in them with his own weight: Echagüe 1938–39, the instrumentals);
    // a D'Arienzo-only pass is the last resort for a summit nobody else can lift, up to his third tango tanda
    // (his second when the última rule reserves the third for the close)
    const daMax = ultimaRule === "d-arienzo-rhythmic" ? daTangoMax - 1 : daTangoMax;
    // Echagüe 1938–39 (the canon vocal D'Arienzo) takes the peak chair first on half the nights while he is under
    // his cap (the reviewer's chair for him); the other half samples the floor's other peak families first
    const daCanon =
      n < daMax && rng.next() < 0.34
        ? daLayers(true)
            .map((l) => l.filter(canonFilter))
            .filter((l) => l.length)
        : [];
    // D'Arienzo's own summit is the night's main peak: at the first summit the other peak families come first and
    // a tanda within 6 of the target holds the chair (round 10: twelve nights no longer all put Echagüe at 10)
    const firstSummit = slot.index === firstPeak;
    const within = firstSummit ? 6 : 4;
    // round 14: on a golden night the main summit takes D'Arienzo–Echagüe 1938–39 first (all hits; the instrumental
    // summit families share a line-up period with the early D'Arienzo); the first summit leaves Echagüe to it
    const echague = (vocalOnly: boolean) =>
      daLayers(true)
        .map((l) => l.filter((c) => normTitle(c.singer ?? "").endsWith("echague")))
        .filter((l) => l.length && vocalOnly);
    const golden14 = isGoldenNight(o);
    const order0 =
      n === 0
        ? [...daCanon, ...daLayers(), ...layers]
        : n < daMax
          ? [...summitFirst, ...(firstSummit ? [] : daCanon), ...layers, ...daLayers()]
          : layers;
    const noEchague = (l: TandaCandidate[]) =>
      l.filter((c) => !(c.orchestraId === "juan-d-arienzo" && normTitle(c.singer ?? "").endsWith("echague")));
    const order =
      golden15 && daLevel < 2 && firstSummit && slots.some((x) => x.peak && x.index > slot.index)
        ? // (round 15: Biagi, Tanturi or another rhythmic family lifts the first summit, DJ T1; D'Arienzo has the
          // early tanda and the Echagüe last summit, so his instrumental summit family comes only when they cannot)
          order0
            .map((l) => (daLevel === 0 ? l.filter((c) => c.orchestraId !== "juan-d-arienzo") : noEchague(l)))
            .filter((l) => l.length)
        : golden15 && isMain && n < daMax
          ? [...echague(true), ...order0]
          : !golden14 || !strict14
            ? order0
            : isMain && n < daMax
              ? [...echague(true), ...order0]
              : daLevel < 2 && firstSummit && slots.some((x) => x.peak && x.index > slot.index)
                ? order0.map(noEchague).filter((l) => l.length)
                : daLevel === 2
                  ? [...echague(true), ...order0]
                  : order0;
    // round 14 (dancer R14-7b): on a golden night a planned peak is a rhythmic orchestra while one can take it
    const rhythmicPeak = (c: TandaCandidate) =>
      !strict14 || !isGoldenNight(o) || cat.profile(c.orchestraId)?.style === "rhythmic";
    for (const l of order) {
      const pool0 = l.filter((c) => peakOk(sc, c));
      const pool = pool0.some(rhythmicPeak) ? pool0.filter(rhythmicPeak) : pool0;
      for (let attempt = 0; attempt < 4; attempt++) {
        const cands = pool.filter((c) => !tried.has(famKey(c)));
        if (!cands.length) break;
        const t = buildTanda(slot, cands, o, rng, ctx, sc);
        if (!t) break;
        if (t.energy >= slot.targetEnergy - within) return t;
        tried.add(famKey(t));
        if (!best || t.energy > best.energy) best = t;
      }
    }
    // the sampled picks fell short: the families whose hottest unused sides average the summit, aimed a little above
    const hot = (c: TandaCandidate) => {
      const es = c.songs
        .filter((x) => !ctx.usedSongIds.has(x.id) && !ctx.usedTitles.has(normTitle(x.title)))
        .map((x) => x.energy ?? 50)
        .sort((a, b) => b - a)
        .slice(0, slot.size);
      return es.length >= slot.size && es.reduce((a, b) => a + b, 0) / es.length >= slot.targetEnergy - 2;
    };
    const hotPool0 = [...new Set(order.flat())].filter((c) => peakOk(sc, c) && hot(c));
    const hotPool = hotPool0.some(rhythmicPeak) ? hotPool0.filter(rhythmicPeak) : hotPool0;
    const hotSlot = { ...slot, targetEnergy: slot.targetEnergy + 4 };
    for (let attempt = 0; attempt < 4 && hotPool.length; attempt++) {
      const t = buildTanda(hotSlot, hotPool, o, rng, ctx, sc);
      if (!t) break;
      if (t.energy >= slot.targetEnergy - within) return { ...t, targetEnergy: slot.targetEnergy };
      hotPool.splice(
        hotPool.findIndex((c) => famKey(c) === famKey(t)),
        1,
      );
      if (!best || t.energy > best.energy) best = { ...t, targetEnergy: slot.targetEnergy };
    }
    return best;
  };
  for (const slot of slots) {
    // round 13 (transitions): the next slot's planned tanda, when the composer already knows it, is weighed too
    const nx = slots[slot.index + 1];
    ctx.next =
      nx && nx.index === earlyDASlot && daTangoCount() === 0
        ? {
            orchestraId: "juan-d-arienzo",
            style: "rhythmic",
            rhythm: "tango",
            vocal: false,
            energy: Math.max(nx.targetEnergy, 72) + 6,
            targetEnergy: Math.max(nx.targetEnergy, 72),
            phase: nx.phase,
            peak: nx.peak,
            meanYear: 1937,
          }
        : nx && nx.index === pugSlot && nx.index !== last
          ? {
              orchestraId: "osvaldo-pugliese",
              style: "dramatic",
              rhythm: "tango",
              vocal: true,
              energy: Math.max(nx.targetEnergy, 74),
              targetEnergy: Math.max(nx.targetEnergy, 74),
              phase: nx.phase,
              peak: nx.peak,
              meanYear: 1945,
            }
          : null;
    let tanda: Tanda | null = lockedByIndex.get(slot.index) ?? null;
    if (tanda) tanda = { ...tanda, targetEnergy: slot.targetEnergy, phase: slot.phase };
    if (!tanda && slot.index === 0 && rules.openerOrchestra) {
      // round 15: the orchestra the DJ named opens the night
      const named = byRhythm.tango.filter((c) => c.orchestraId === rules.openerOrchestra);
      if (named.length) {
        const { layers, sc: lsc } = tangoLayers(slot, named);
        tanda =
          tryLayers(slot, layers.length ? layers : [named], lsc) ?? buildTanda(slot, named, o, rng, ctx, lsc);
      }
      if (!tanda)
        fallbacks.push(
          `opener: ${cat.profile(rules.openerOrchestra)?.name ?? rules.openerOrchestra} has no tango tanda in the night's years; the opener rule decides`,
        );
    }
    if (!tanda && slot.index === 0 && rules.openerRule && rules.openerRule !== "any") {
      const style = (id: string) => cat.profile(id)?.style;
      const want =
        rules.openerRule === "canon"
          ? (c: TandaCandidate) => !!OPENERS[c.orchestraId]
          : rules.openerRule === "lyrical"
            ? (c: TandaCandidate) => ["lyrical", "guardia"].includes(style(c.orchestraId) ?? "")
            : (c: TandaCandidate) => style(c.orchestraId) === "rhythmic";
      const prefO = byRhythm.tango.filter(want);
      if (prefO.length) {
        const { layers, sc: lsc } = tangoLayers(slot, prefO);
        tanda = tryLayers(slot, layers, lsc);
      }
    }
    if (!tanda && slot.index === last) {
      // última tanda: always tango; the night rule decides who closes; the phase filter is bypassed and the
      // delivered energy must reach target−4 (a night ends, it does not fade out)
      const ult = {
        ...slot,
        rhythm: "tango" as DanceRhythm,
        size: o.tangoTandaSize,
        targetEnergy:
          ultimaRule === "d-arienzo-rhythmic"
            ? Math.max(76, slot.targetEnergy + 10)
            : Math.max(62, slot.targetEnergy + 8),
      };
      // round 10: the última may bring D'Arienzo back a third time, nobody else (the cap is two tandas across rhythms)
      const ultSc: Scoring = {
        ...sc,
        notBefore: () => 0,
        phase: () => ["any"],
        maxPerNight: (id) => {
          const m = sc.maxPerNight?.(id);
          return id === "juan-d-arienzo" ? (m ?? CORPUS_CAPS[id] ?? DEFAULT_CAP) + 1 : m;
        },
      };
      let pref =
        ultimaRule === "any"
          ? byRhythm.tango
          : ultimaRule === "pugliese"
            ? byRhythm.tango.filter((c) => c.orchestraId === "osvaldo-pugliese")
            : ultimaRule === "d-arienzo-rhythmic"
              ? byRhythm.tango.filter((c) => c.orchestraId === "juan-d-arienzo" && !c.vocal)
              : byRhythm.tango.filter(
                  (c) =>
                    ULTIMA_POOL.includes(c.orchestraId) &&
                    (c.vocal
                      ? c.orchestraId !== "alfredo-de-angelis"
                      : ULTIMA_INSTRUMENTAL_OK.has(c.orchestraId)),
                ); // De Angelis closes instrumental (corpus); the lyrical orchestras close vocal
      // D'Arienzo's cap (3 tango tandas per 4 h) holds at the última too (round 9) unless the rule asks for him
      if (daTangoCount() >= daTangoMax && ultimaRule !== "d-arienzo-rhythmic")
        pref = pref.filter((c) => c.orchestraId !== "juan-d-arienzo");
      // after Pugliese (profile followWith): a rhythmic or balanced última when the pool has them
      const prevFollow = cat.profile(ctx.recentOrchestras[0] ?? "")?.followWith;
      if (prevFollow?.length) {
        const f = pref.filter((c) => {
          const st = cat.profile(c.orchestraId)?.style ?? "balanced";
          return prevFollow.includes(st) || st === "balanced";
        });
        if (f.length >= 2) pref = f;
      }
      // round 10: never an orchestra + mode already played as a tango tanda in the second half (Biagi–Ortiz at 15 and
      // Biagi–Amor as the última is "Biagi again")
      const half = Math.floor(tandas.length / 2);
      const fresh = pref.filter(
        (c) =>
          !tandas
            .slice(half)
            .some((t) => t.rhythm === "tango" && t.orchestraId === c.orchestraId && t.vocal === c.vocal),
      );
      if (fresh.length >= 2) pref = fresh;
      // known material closes a night: families the corpus knows, when enough of them exist
      const famous = pref.filter((c) => c.songs.some((s) => (s.fame ?? 0) > 0));
      if (famous.length >= 3) pref = famous;
      // the vocal band (round 9): a night at its vocal ceiling closes instrumental when such an última reaches the
      // energy; the strength of the ending comes first, so the full closer pool is tried after the banded one
      const k = constraints(ult);
      const banded = k.mustInstr
        ? pref.filter((c) => !c.vocal)
        : k.mustVocal
          ? pref.filter((c) => c.vocal)
          : pref;
      // families whose `size` hottest sides average the energy the ending needs: tried when the sampled ones fail
      const hot = (c: TandaCandidate) => {
        const es = c.songs
          .map((x) => x.energy ?? 50)
          .sort((a, b) => b - a)
          .slice(0, ult.size);
        return es.length >= ult.size && es.reduce((a, b) => a + b, 0) / es.length >= ult.targetEnergy - 2;
      };
      const lists = [
        // round 15: the DJ's named última first, whatever the última rule's pool
        ...(rules.ultimaOrchestra ? [byRhythm.tango.filter(ultimaPick)] : []),
        ...(ultimaReserve ? [pref.filter((c) => sameFamily(ultimaReserve, c))] : []),
        ...(banded.length >= 2 && banded.length < pref.length ? [banded, banded.filter(hot)] : []),
        pref,
        pref.filter(hot),
      ];
      const tried = new Set<string>();
      let best: Tanda | null = null;
      let bestVocal: Tanda | null = null;
      for (const list of lists) {
        if (!list.length) continue;
        for (let attempt = 0; attempt < 6 && !tanda; attempt++) {
          const cands = list.filter((c) => !tried.has(famKey(c)));
          if (!cands.length) break;
          // the hot list is aimed 6 above the target so the sampled picks land on the family's strongest sides
          const slotFor =
            list === lists[lists.length - 1] ? { ...ult, targetEnergy: ult.targetEnergy + 6 } : ult;
          const t0 = buildTanda(slotFor, cands, o, rng, ctx, ultSc);
          const t = t0 && slotFor !== ult ? { ...t0, targetEnergy: ult.targetEnergy } : t0;
          if (!t) break;
          if (t.energy >= ult.targetEnergy - 4) tanda = t;
          else {
            tried.add(famKey(t));
            if (!best || t.energy > best.energy) best = t;
            if (t.vocal && (!bestVocal || t.energy > bestVocal.energy)) bestVocal = t;
          }
        }
        if (tanda) break;
        // round 10: when the night still owes the floor a voice, a vocal closer within 8 of the target ends it
        // rather than an instrumental one
        if (k.mustVocal && bestVocal && bestVocal.energy >= ult.targetEnergy - 8) {
          tanda = bestVocal;
          break;
        }
      }
      if (rules.ultimaOrchestra && !tanda) {
        // the named família could not reach the energy: it still closes when it can fill the tanda at all
        const named = byRhythm.tango.filter(ultimaPick);
        if (named.length) tanda = buildTanda(ult, named, o, rng, ctx, ultSc);
      }
      tanda = tanda ?? best ?? buildTanda(ult, byRhythm.tango, o, rng, ctx, ultSc);
      if (rules.ultimaOrchestra && tanda && tanda.orchestraId !== rules.ultimaOrchestra)
        fallbacks.push(
          `ultima: ${cat.profile(rules.ultimaOrchestra)?.name ?? rules.ultimaOrchestra} has no tanda the night's years and gaps allow; ${tanda.orchestra} closes instead`,
        );
    }
    if (!tanda && slot.index === pugSlot && slot.index !== last && gapFree("osvaldo-pugliese")) {
      // Pugliese is the emotional summit of the last third: his slot is planned at ≥74 whatever the cool-down says
      const pug0 = byRhythm.tango.filter((c) => c.orchestraId === "osvaldo-pugliese");
      const kp = constraints(slot);
      const pugBand = kp.mustInstr
        ? pug0.filter((c) => !c.vocal)
        : kp.mustVocal
          ? pug0.filter((c) => c.vocal)
          : pug0;
      const pug = pugBand.length ? pugBand : pug0;
      const summit = { ...slot, targetEnergy: Math.max(slot.targetEnergy, 74) };
      if (pug.length) tanda = buildTanda(summit, pug, o, rng, ctx, { ...bodySc, phase: () => ["any"] });
      if (tanda) slot.targetEnergy = summit.targetEnergy;
    }
    // D'Arienzo (corpus rule 5): first tanda early and instrumental 1935–39, a tango tanda by 40 % at the latest,
    // a second one by 80 % — 2–3 per 4 h
    if (!tanda && slot.rhythm === "tango" && slot.index !== last && gapFree("juan-d-arienzo")) {
      const n = daTangoCount();
      const da = byRhythm.tango.filter((c) => c.orchestraId === "juan-d-arienzo");
      if (n === 0 && slot.index === earlyDASlot) {
        // the first D'Arienzo is a planned early peak (corpus: "the universal rhythmic opener/first peak tanda")
        const earlyInstr = da.filter(isEarlyDArienzo);
        const peak = { ...slot, targetEnergy: Math.max(slot.targetEnergy, 72) };
        tanda = buildTanda(peak, earlyInstr.length ? earlyInstr : da, o, rng, ctx, {
          ...scFor(slot),
          phase: () => ["any"],
        });
        if (tanda) {
          slot.targetEnergy = peak.targetEnergy;
          // the planned early peak is followed by a glide, not a drop (round 8: e74 → e50 → e73 at 20–27 % of every
          // night): the next two slots come down by ~9 and ~15 from the delivered energy, never below their own target
          const a = slots[slot.index + 1],
            b = slots[slot.index + 2];
          if (a && !lockedByIndex.has(a.index)) a.targetEnergy = Math.max(a.targetEnergy, tanda.energy - 9);
          if (b && !lockedByIndex.has(b.index)) b.targetEnergy = Math.max(b.targetEnergy, tanda.energy - 15);
        }
      } else if (
        ((n === 0 && slot.position >= 0.38 && slot.phase !== "cooldown") ||
          (n === 1 && slot.position >= 0.7 && ultimaRule !== "d-arienzo-rhythmic")) &&
        da.length &&
        // round 9: a planned peak still ahead is his chair, not the slot before it; the peak chair itself is built
        // by the peak loop (Echagüe or the hot instrumentals, never a soft Mauré set)
        !slot.peak &&
        !slots.some((x) => x.peak && x.index > slot.index && !lockedByIndex.has(x.index))
      )
        tanda = buildTanda(slot, da, o, rng, ctx, scFor(slot));
    }
    // round 15 (DJ N8): the warm-up vals of a golden night is the coolest family that can still fill it with known,
    // streamable sides (Caló–Iriarte 1943–45 at e62 before Rodríguez–Flores at e79), whatever the phase tables say
    if (
      !tanda &&
      slot.rhythm === "vals" &&
      isGoldenNight(o) &&
      o.hours < 5 &&
      !lockedByIndex.size &&
      !tandas.some((t) => t.rhythm === "vals")
    ) {
      const need = slot.size;
      const coolOf = (c: TandaCandidate) => {
        const av = c.songs.filter(
          (x) =>
            streamable(x) &&
            !isSuspectSide(x) &&
            !x.reissue &&
            !ctx.usedTitles.has(normTitle(x.title)) &&
            (x.fame ?? 0) > 0,
        );
        const fs = av.map((x) => x.fame ?? 0).sort((a, b) => b - a);
        if (fs.length < need || fs.slice(0, need).reduce((a, b) => a + b, 0) / need < 2.5) return null;
        const es = av.map((x) => x.energy ?? 50).sort((a, b) => a - b);
        return es.slice(0, need).reduce((a, b) => a + b, 0) / need;
      };
      const fams = byRhythm.vals
        .filter(gapFreeCand)
        .map((c) => ({ c, e: coolOf(c) }))
        .filter((x): x is { c: TandaCandidate; e: number } => x.e !== null);
      if (fams.length) {
        const coolest = Math.min(...fams.map((x) => x.e));
        // (within 14 of the coolest, so the warm-up vals still varies between seeds)
        const lim = Math.max(slot.targetEnergy + 10, coolest + 14);
        const sc1 = scFor(slot);
        tanda = buildTanda(
          slot,
          fams.filter((x) => x.e <= lim).map((x) => x.c),
          o,
          rng,
          ctx,
          { ...sc1, phase: () => ["any"] },
        );
      }
    }
    // colour tanda (rules.colourTanda): one softer, elegant tanda in the breather after the first peak
    if (
      !tanda &&
      rules.colourTanda &&
      !colourDone &&
      slot.rhythm === "tango" &&
      slot.index !== last &&
      slot.position > 0.5 &&
      slot.position < 0.66 &&
      slot.phase === "build"
    ) {
      const pref = byRhythm.tango.filter((c) => COLOUR_ORCHESTRAS.includes(c.orchestraId));
      const t = pref.length
        ? buildTanda(
            { ...slot, targetEnergy: Math.max(30, slot.targetEnergy - 6) },
            pref,
            o,
            rng,
            ctx,
            scFor(slot),
          )
        : null;
      if (t) {
        t.note = "colour tanda";
        t.reason = `${t.reason} · the colour tanda after the first peak`;
        tanda = t;
        colourDone = true;
      }
    }
    if (!tanda) {
      // tango-only cap for D'Arienzo: 3 tango tandas per night (plus a vals or milonga)
      // round 11 (R3): the body cap leaves room for the rhythmic última (three tango tandas in all)
      const daBodyMax = ultimaRule === "d-arienzo-rhythmic" ? daTangoMax - 1 : daTangoMax;
      const cands =
        slot.rhythm === "tango" && daTangoCount() >= daBodyMax
          ? byRhythm.tango.filter((c) => c.orchestraId !== "juan-d-arienzo")
          : byRhythm[slot.rhythm];
      if (slot.rhythm === "tango" && slot.index !== last) {
        // D'Arienzo is held for a planned peak within the repeat gap ahead (round 9: his second tanda in the slot
        // before the summit left Láurenz in the peak chair)
        const peakAhead = slots.some(
          (x) => x.peak && x.index > slot.index && x.index - slot.index <= o.orchestraRepeatGap,
        );
        const held =
          !slot.peak && peakAhead && daTangoCount() >= 1
            ? cands.filter((c) => c.orchestraId !== "juan-d-arienzo")
            : cands;
        const { layers, sc: lsc, soft } = tangoLayers(slot, held.length ? held : cands);
        tanda = slot.peak
          ? buildPeak(
              slot,
              layers.filter((l) => !soft.has(l)),
              lsc,
            )
          : tryLayers(slot, layers, lsc, soft);
        // a peak slot nobody could fill as a peak: an ordinary slot (never a hole in the set)
        if (!tanda && slot.peak) tanda = tryLayers({ ...slot, peak: false }, layers, lsc, soft);
      } else tanda = buildTanda(slot, cands, o, rng, ctx, scFor(slot));
    }
    // round 15 (dancer N1, DJ N1): on the classic cycle a vals or milonga slot never turns into a tango: when the first
    // choice is gap- or cap-blocked, a second-choice family of the same rhythm (any phase, the night caps relaxed,
    // the repeat gaps and the D'Arienzo / Pugliese holds kept) takes it
    const vmNeed =
      isGoldenNight(o) && slot.rhythm !== "tango" ? (isPeakSlot(slot) || slot.position >= 0.76 ? 3 : 2.5) : 0;
    const mf = (t: Tanda | null) => (t ? meanFameOf(t.songs) : -1);
    if (slot.rhythm !== "tango" && isClassicCycle(o) && (!tanda || (vmNeed && mf(tanda) < vmNeed))) {
      const sc1 = scFor(slot);
      // (judged among the families the repeat gaps allow: the builder's preference filters never leave only blocked ones)
      const second = buildTanda(slot, byRhythm[slot.rhythm].filter(gapFreeCand), o, rng, ctx, {
        ...sc1,
        maxPerNight: (id) => (sc1.maxPerNight?.(id) === 0 ? 0 : 99),
        notAfter: () => undefined,
        phase: () => ["any"],
        relaxed: true,
      });
      if (!tanda || mf(second) > mf(tanda)) tanda = second ?? tanda;
      // a golden night's late or hot vals / milonga that can only take an unknown family (mean fame under the
      // panel's floor, a blocker) takes a known one that streams, a second family of a played orchestra allowed
      const need = vmNeed;
      // (the families that can deliver the floor's fame with unused, streamable sides: a second family of an
      // orchestra that already played this rhythm is allowed when no other is left — Biagi–Ibáñez after Biagi–Falgás)
      const famous = (c: TandaCandidate) => {
        const fs = c.songs
          .filter((x) => streamable(x) && !isSuspectSide(x) && !ctx.usedTitles.has(normTitle(x.title)))
          .map((x) => x.fame ?? 0)
          .sort((a, b) => b - a)
          .slice(0, slot.size);
        return (
          fs.length >= slot.size &&
          fs.filter((f) => f === 0).length <= 1 &&
          fs.reduce((a, b) => a + b, 0) / slot.size >= need
        );
      };
      if (need && mf(tanda) < need) {
        const strong = byRhythm[slot.rhythm].filter((c) => gapFreeCand(c) && famous(c));
        const s2 = strong.length
          ? buildTanda(slot, strong, o, rng, ctx, {
              ...sc1,
              maxPerNight: (id) => (sc1.maxPerNight?.(id) === 0 ? 0 : 99),
              notAfter: () => undefined,
              phase: () => ["any"],
              relaxed: true,
            })
          : null;
        if (mf(s2) > mf(tanda)) tanda = s2;
      }
      // still under the floor (a blocker): a known family four chairs from its orchestra's last tanda (the gap a
      // should-fix) rather than an unknown one
      if (need && mf(tanda) < need) {
        const near = buildTanda(
          slot,
          byRhythm[slot.rhythm].filter(
            (c) => !ctx.recentOrchestras.slice(0, 3).includes(c.orchestraId) && famous(c),
          ),
          { ...o, orchestraRepeatGap: 4 },
          rng,
          ctx,
          { ...sc1, maxPerNight: (id) => (sc1.maxPerNight?.(id) === 0 ? 0 : 99), relaxed: true },
        );
        if (near && mf(near) >= need) {
          tanda = near;
          tanda.note = `${tanda.note ? `${tanda.note} · ` : ""}a known family inside the repeat gap (fame floor)`;
        }
      }
    }
    if (!tanda && slot.rhythm !== "tango")
      tanda = buildTanda(
        { ...slot, rhythm: "tango", size: o.tangoTandaSize },
        byRhythm.tango,
        o,
        rng,
        ctx,
        scFor(slot),
      );
    if (!tanda) {
      // long nights exhaust the caps: relax per-night limits and phase filters rather than leave a hole in the set
      const peakAhead = slots.some(
        (x) => x.peak && x.index > slot.index && x.index - slot.index <= o.orchestraRepeatGap,
      );
      const reservedIds = new Set([
        ultimaReserve?.orchestraId,
        shoulderReserve?.orchestraId,
        ...(peakAhead && daTangoCount() >= 1 ? ["juan-d-arienzo"] : []),
      ]);
      const relaxed: Scoring = {
        ...bodySc,
        // round 11: the reserved families stay reserved even here (a Biagi instrumental at 15 cost the última)
        maxPerNight: (id) =>
          id === "osvaldo-pugliese" || (reservedIds.has(id) && slot.index !== last)
            ? id === "juan-d-arienzo"
              ? daTangoCount()
              : scFor(slot).maxPerNight?.(id)
            : 99,
        notAfter: () => undefined,
        phase: () => ["any"],
        relaxed: true,
      };
      tanda =
        buildTanda(slot, byRhythm[slot.rhythm], o, rng, ctx, relaxed) ??
        buildTanda(
          { ...slot, rhythm: "tango", size: o.tangoTandaSize },
          byRhythm.tango,
          o,
          rng,
          ctx,
          relaxed,
        );
    }
    if (!tanda) continue;
    tandas.push(tanda);
    if (tanda.rhythm === "tango") {
      prevWeakVocal = tanda.vocal && tanda.songs.filter((s) => (s.fame ?? 0) >= 2).length < 2;
      tangoDone++;
      if (tanda.vocal) {
        vocalDone++;
        firstVocalDone = true;
      } else if (!firstVocalDone) instrBeforeVocal++;
    }
    ctx.prevEnergy = tanda.energy;
    ctx.prevTarget = tanda.targetEnergy;
    ctx.recentOrchestras.unshift(tanda.orchestraId);
    if (tanda.singer) ctx.recentSingers.unshift(tanda.singer);
    if (tanda.songs.every((s) => s.era === "guardia-vieja" || s.era === "guardia-nueva"))
      ctx.guardiaCount = (ctx.guardiaCount ?? 0) + 1;
    for (const s of tanda.songs) {
      ctx.usedSongIds.add(s.id);
      ctx.usedTitles.add(normTitle(s.title));
    }
    if (tanda.yearRange)
      ctx.usedFamilies!.push({
        orchestraId: tanda.orchestraId,
        singer: tanda.singer,
        rhythm: tanda.rhythm,
        years: tanda.yearRange,
        yearSet: yearSetOf(tanda),
      });
  }
  // Buenos Aires style: the última tanda ends with its own orchestra's Cumparsita (same singer / instrumental,
  // a closing-version year) — appended before the length fit so the night still lands on time
  if (o.closeWithCumparsita && rules.cumparsitaCount === 2) {
    const ult = tandas[tandas.length - 1];
    if (ult) {
      const years = cumparsitaYears(cat, ult.orchestraId);
      const own = cat.songs
        .filter(
          (s) =>
            normTitle(s.title) === "la cumparsita" &&
            s.orchestraId === ult.orchestraId &&
            s.rhythm === "tango" &&
            isTandaEligible(s) &&
            s.vocal === ult.vocal &&
            (s.singerId ?? null) === (ult.songs[0]?.singerId ?? null) &&
            (!years.size || years.has(s.year ?? 0)),
        )
        .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))[0];
      if (own && !ult.songs.some((s) => s.id === own.id)) {
        ult.songs = [...ult.songs, own];
        ult.energyCurve = ult.songs.map((s) => s.energy ?? 50);
        ult.durationSec += own.durationSec ?? 180;
        ult.note = `${ult.note ? `${ult.note} · ` : ""}ends with its own La Cumparsita`;
      }
    }
  }
  // cortinas: one family (or a compatible pair) per night, least-recently-used cycling, each cue ~8 points under the NEXT tanda
  const pool = cortinaPool(deps.cortinas, o.overrides?.cortinas);
  const used = new Set<string>();
  const plan = planCortinas(
    pool,
    o,
    rng,
    tandas[1]?.energy ?? 60,
    tandas.length,
    // the hot gaps, plus the two cues each dramatic tanda reserves (round 10: the set-up and the lift)
    tandas.filter((t, i) => i > 0 && t.energy >= 75).length +
      2 * tandas.filter((t) => t.style === "dramatic").length,
  );
  // round 9: cortina lengths are jittered ±7 s around the DJ's setting (all 53 s is "the machine look"); the jitter
  // comes from its own stream so the tanda draws of a seed stay what they were
  const jrng = makeRng((seed ^ 0x5bd1e995) >>> 0);
  // round 15 (dancer N4, DJ N6): ±4 s, and the fit stretches at most 5 s: the clock is met with tandas
  const jitter0: number[] = tandas.map(() => Math.round((jrng.next() - 0.5) * 8));
  // round 11 (R6): the jitter is centred, so the mean cue length is the fitted base itself
  const jMean = Math.round(jitter0.reduce((a, b) => a + b, 0) / Math.max(1, jitter0.length));
  const jitter = jitter0.map((j) => j - jMean);
  // a cue's length: the fitted base (the setting, stretched ±8/±15 s by the fit) plus its jitter, never more than
  // 15 s from the setting (the fit's own bound) and inside the booth's 10–120 s
  // round 15: never outside the setting ± 5 s, never over 50 s unless the setting itself asks for more
  const cueHi = Math.min(o.cortinaLengthSec + 5, Math.max(50, o.cortinaLengthSec));
  const cortinaLen = (i: number, base = o.cortinaLengthSec) =>
    Math.max(10, Math.min(120, Math.max(o.cortinaLengthSec - 5, Math.min(cueHi, base + (jitter[i] ?? 0)))));
  if (rules.birthdayValsAt != null) {
    const n1 = Math.max(1, tandas.length - 1);
    const vals = tandas
      .map((t, i) => ({ t, i }))
      .filter((x) => x.t.rhythm === "vals")
      .sort(
        (a, b) => Math.abs(a.i / n1 - rules.birthdayValsAt!) - Math.abs(b.i / n1 - rules.birthdayValsAt!),
      );
    const pick = vals[0];
    if (pick) {
      pick.t.birthday = true;
      pick.t.note = "Vals de cumpleaños";
      pick.t.reason = `${pick.t.reason ?? ""} · reserved for the birthday vals`.trim();
    }
  }
  const remember = (c: Cortina) => {
    used.delete(c.id);
    used.add(c.id);
  };
  // the gaps after a dramatic tanda (Pugliese) reserve their upbeat cue first so a fresh one is still there for them
  // (round 9: by tanda 19 every upbeat cue of the family had been spent and the one after Pugliese was a repeat)
  const reserved = new Map<number, Cortina>();
  const reserveGap = (i: number) => {
    const t = tandas[i];
    const next = tandas[i + 1];
    if (!t || !next || reserved.has(i)) return;
    const c = pickCortina(
      pool,
      next.energy,
      o,
      rng,
      new Set(),
      plan,
      t.style,
      new Set([...reserved.values()].map((x) => x.id)),
      next,
    );
    if (c) reserved.set(i, c);
  };
  tandas.forEach((t, i) => {
    if (t.style !== "dramatic") return;
    reserveGap(i); // the lift after Pugliese
    if (i > 0) reserveGap(i - 1); // the set-up before him (round 10: medium or slow, ≤ e70, and still a fresh cue)
  });
  const reservedIds = new Set([...reserved.values()].map((c) => c.id));
  // round 11 (R5): the up-tempo cues are kept for the hot gaps still ahead (the warm gaps used to spend them, and
  // the summit was left a lament or a cue from another family)
  const hotAhead = (i: number) =>
    tandas.filter(
      (_, j) => j > i && j + 1 < tandas.length && (tandas[j + 1]?.energy ?? 0) >= 75 && !reserved.has(j),
    ).length;
  // the gaps are served in play order (round 10: an extreme-first order broke the four-tanda window of small pools)
  const gapOrder = tandas.map((_, i) => i);
  for (const i of gapOrder) {
    const t = tandas[i]!;
    const next = tandas[i + 1];
    if (!next) {
      const c =
        rules.cortinaBeforeCumparsita && o.closeWithCumparsita
          ? pickCortina(pool, t.energy, o, rng, used, plan, t.style, reservedIds)
          : null;
      t.cortina = c ? { ...c, lengthSec: cortinaLen(i) } : null;
      continue;
    }
    const c =
      reserved.get(i) ??
      pickCortina(
        pool,
        next.energy,
        o,
        rng,
        used,
        { ...plan, hotAhead: hotAhead(i) },
        t.style,
        reservedIds,
        next,
      );
    t.cortina = c ? { ...c, lengthSec: cortinaLen(i) } : null;
    if (c) remember(c);
  }
  // land on the requested length: a night more than a tanda too long drops a late tanda first, then cortina lengths
  // absorb the rest (±8 s around the DJ's length; ±15 s only when the hour would still be missed by >4 min — the
  // score sheet shows it). The target is the playing time: a show break is added on top, never paid for by cortinas.
  const cycle15 = isClassicCycle(o);
  const fitLength = () => {
    const target = playHours * 3600 - (closing ? (closing.durationSec ?? 180) : 0);
    const total = () => tandas.reduce((a, t) => a + t.durationSec + (t.cortina?.lengthSec ?? 0), 0);
    const setCortinas = (len: number) => {
      tandas.forEach((t, i) => {
        if (t.cortina) t.cortina = { ...t.cortina, lengthSec: cortinaLen(i, len) };
      });
    };
    // the late tanda to drop: never one whose removal puts the same orchestra (or two vals/milongas) side by side
    // the tanda to drop (round 11): the softest cool-down tango tanda whose removal keeps the cycle (never the
    // última, never a V/M onto the last two chairs), else the latest tanda that keeps it
    const dropIndex = () => {
      const strict = (i: number) => {
        const a = tandas[i - 1],
          b = tandas[i + 1];
        // round 13: the two tandas that become neighbours break no transition hard rule (Gobbi into Pugliese)
        return (
          !!a &&
          !!b &&
          !pairScore(sideOf(a), sideOf(b), { profileOf: (id) => cat.profile(id) }).hard.some(
            (h) => h !== "H5",
          )
        );
      };
      const ok0 = (i: number, dramaticOk = false) => {
        const a = tandas[i - 1],
          b = tandas[i + 1],
          t = tandas[i];
        return (
          !!a &&
          !!b &&
          !!t &&
          (dramaticOk || t.style !== "dramatic") && // Pugliese is never the tanda dropped (round 11)
          t.orchestraId !== "osvaldo-pugliese" &&
          a.orchestraId !== b.orchestraId &&
          (a.rhythm === "tango" || b.rhythm === "tango")
        );
      };
      const pick = (ok: (i: number) => boolean, from = 1) => {
        const soft = tandas
          .map((t, i) => ({ t, i }))
          .filter(
            (x) =>
              x.i > 0 &&
              x.i < tandas.length - 1 &&
              x.t.rhythm === "tango" &&
              x.t.phase === "cooldown" &&
              !x.t.peak &&
              ok(x.i),
          )
          .sort((a, b) => a.t.energy - b.t.energy)[0];
        if (soft) return soft.i;
        // else the latest chair whose removal keeps the cycle; none → no drop (-1)
        for (let k = tandas.length - 2; k >= from; k--) if (ok(k)) return k;
        return -1;
      };
      // round 15 (the classic cycle is hard): only the chair before the última may go, and only when the count
      // that leaves keeps the última off a third tango in a row
      if (cycle15)
        return cycleCountOk(tandas.length - 1) && ok0(tandas.length - 2, true) ? tandas.length - 2 : -1;
      // a drop that leaves no hard-rule neighbours first (among the last chairs only, so the cycle holds)
      const best = pick((i) => ok0(i, true) && strict(i), tandas.length - 4);
      return best >= 0 ? best : pick(ok0);
    };
    setCortinas(o.cortinaLengthSec);
    let diff = target - total();
    const withC = tandas.filter((t) => t.cortina).length;
    // a late tanda is dropped only when that lands closer to the hour than stretching every cortina by 15 s could
    // (round 10: judged against the first ±8 s flex, the ±15 s one is for the hour that would still be missed)
    const dropAt = withC ? withC * 5 : 240;
    // round 15: on the classic cycle, when one chair alone would leave an illegal count, the two chairs before the
    // última go together if that lands nearer the hour
    if (
      cycle15 &&
      diff < 0 &&
      Math.abs(diff) > dropAt &&
      tandas.length > 6 &&
      !cycleCountOk(tandas.length - 1)
    ) {
      const L = tandas.length;
      const a = tandas[L - 3]!,
        b = tandas[L - 2]!;
      const removedSec =
        a.durationSec + b.durationSec + (a.cortina?.lengthSec ?? 0) + (b.cortina?.lengthSec ?? 0);
      if (
        cycleCountOk(L - 2) &&
        Math.abs(diff + removedSec) < Math.abs(diff) &&
        a.orchestraId !== "osvaldo-pugliese" &&
        b.orchestraId !== "osvaldo-pugliese" &&
        tandas[L - 4]!.orchestraId !== tandas[L - 1]!.orchestraId
      ) {
        const before = tandas[L - 4]!;
        if (before.cortina && b.cortina) {
          used.delete(before.cortina.id);
          reservedIds.delete(before.cortina.id);
          before.cortina = { ...b.cortina, lengthSec: before.cortina.lengthSec ?? b.cortina.lengthSec };
        }
        tandas.splice(L - 3, 2);
        tandas.forEach((t, i) => {
          t.index = i;
        });
        diff = target - total();
      }
    }
    for (let drops = 0; drops < 2 && diff < 0 && tandas.length > 4 && Math.abs(diff) > dropAt; drops++) {
      const i = dropIndex();
      if (i < 0) break;
      const removedSec = tandas[i]!.durationSec + (tandas[i]!.cortina?.lengthSec ?? 0);
      if (Math.abs(diff + removedSec) >= Math.abs(diff)) break;
      const removed = tandas.splice(i, 1)[0]!;
      const before = tandas[i - 1];
      const after = tandas[i];
      if (before && after && removed.cortina) {
        // round 11 (R5): the dropped tanda's cue was picked for the tanda that now follows, so it moves to the chair
        // before; the cue that led into the dropped tanda is free again
        if (before.cortina) {
          used.delete(before.cortina.id);
          reservedIds.delete(before.cortina.id);
        }
        before.cortina = {
          ...removed.cortina,
          lengthSec: before.cortina?.lengthSec ?? removed.cortina.lengthSec,
        };
      }
      // the chairs are numbered again: a dropped tanda leaves no hole in the set
      tandas.forEach((t, i) => {
        t.index = i;
      });
      diff = target - total();
    }
    const n = tandas.filter((t) => t.cortina).length;
    // round 15: the cues flex by 5 s at most either way (round 11 shrank by 5, stretched by 15)
    const flexCues = () => {
      setCortinas(o.cortinaLengthSec);
      diff = target - total();
      const k = tandas.filter((t) => t.cortina).length;
      if (!k || Math.abs(diff) <= 60) return;
      const per = Math.max(-5, Math.min(5, Math.round(diff / k)));
      setCortinas(Math.max(10, Math.min(120, o.cortinaLengthSec + per)));
      diff = target - total();
    };
    flexCues();
    // still short by more than half a tanda (no cortinas to stretch, or a long night): one more tango tanda
    // before the última, built like any other, so the night lands on the hour instead of ending early
    const addExtra = (pairOk: boolean) => {
      if (
        !(
          diff > 240 &&
          tandas.length >= 3 &&
          (!cycle15 || cycleCountOk(tandas.length + 1) || (pairOk && cycleCountOk(tandas.length + 2)))
        )
      )
        return;
      const prev = tandas[tandas.length - 2]!;
      const extra: Slot = {
        index: tandas.length - 1,
        rhythm: "tango",
        size: o.tangoTandaSize,
        targetEnergy: Math.round((prev.targetEnergy + tandas[tandas.length - 1]!.targetEnergy) / 2),
        phase: prev.phase,
        position: 0.92,
      };
      // the whole night, newest first: the repeat gaps read the head, the orchestra cap counts all of it (round 10)
      ctx.recentOrchestras = tandas
        .slice()
        .reverse()
        .map((t) => t.orchestraId);
      ctx.recentSingers = tandas
        .slice()
        .reverse()
        .map((t) => t.singer)
        .filter((x): x is string => !!x);
      const relaxedExtra = (sl: Slot): Scoring => ({
        ...scFor(sl),
        maxPerNight: (id) => (id === "osvaldo-pugliese" ? bodySc.maxPerNight?.(id) : 99),
        notAfter: () => undefined,
        phase: () => ["any"],
        relaxed: true,
      });
      const tryExtra = (r: DanceRhythm) => {
        const sl: Slot = {
          ...extra,
          rhythm: r,
          size: r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize,
        };
        // the extra chair sits between the last body tanda and the última: neither neighbour's orchestra (round 13:
        // a narrow pool's gap fallback only looked at the última)
        // (round 14: and none inside the repeat gap)
        const nb = new Set([
          ...tandas.slice(Math.max(0, tandas.length - o.orchestraRepeatGap)).map((t) => t.orchestraId),
          prev.orchestraId,
          tandas[tandas.length - 1]!.orchestraId,
        ]);
        // (round 14: D'Arienzo's tango cap holds for the extra chair too)
        const pool = byRhythm[r].filter(
          (c) =>
            !nb.has(c.orchestraId) &&
            !(r === "tango" && c.orchestraId === "juan-d-arienzo" && daTangoCount() >= daTangoMax),
        );
        ctx.history = tandas.slice(0, -1);
        ctx.next = sideOf(tandas[tandas.length - 1]!);
        const t =
          buildTanda(sl, pool, o, rng, ctx, scFor(sl)) ?? buildTanda(sl, pool, o, rng, ctx, relaxedExtra(sl));
        ctx.history = tandas;
        ctx.next = null;
        return t;
      };
      // a full tango tanda, or — when that overshoots by more than 5 min and the previous tanda is a tango — a vals
      // or a milonga before the última (round 10: never a short tango tanda, never two V/M side by side)
      // (round 15: on the classic cycle the new chair takes the cycle's rhythm at its index, always a tango for a
      // legal count)
      const cycleR: DanceRhythm | null = cycle15
        ? (({ V: "vals", M: "milonga" } as Record<string, DanceRhythm>)["TTVTTM"[(tandas.length - 1) % 6]!] ??
          "tango")
        : null;
      let t = tryExtra(cycleR ?? "tango");
      let addSec = (t?.durationSec ?? 0) + (t && n ? o.cortinaLengthSec : 0);
      if (!cycle15 && (!t || Math.abs(diff - addSec) > 300) && prev.rhythm === "tango")
        for (const r of ["vals", "milonga"] as DanceRhythm[]) {
          const alt = tryExtra(r);
          const altSec = (alt?.durationSec ?? 0) + (alt && n ? o.cortinaLengthSec : 0);
          if (alt && (!t || Math.abs(diff - altSec) < Math.abs(diff - addSec))) {
            t = alt;
            addSec = altSec;
          }
        }
      if (t && Math.abs(diff - addSec) < Math.abs(diff)) {
        const ult = tandas[tandas.length - 1]!;
        // its own cue (never a copy of the previous tanda's: that is the back-to-back repeat a room notices)
        if (n) {
          const c = pickCortina(pool, ult.energy, o, rng, used, plan, t.style, reservedIds, ult);
          jitter.splice(tandas.length - 1, 0, Math.round((jrng.next() - 0.5) * 8));
          t.cortina = c ? { ...c, lengthSec: cortinaLen(tandas.length - 1) } : null;
          if (c) remember(c);
        }
        tandas.splice(tandas.length - 1, 0, t);
        ult.index = tandas.length - 1;
        diff = target - total();
      }
    };
    // (round 15: on the classic cycle two chairs may come in together when one alone would leave an illegal count)
    const len0 = tandas.length;
    addExtra(true);
    // (the cues flex 5 s at most now: a long night may need a second chair)
    if (!cycle15) addExtra(false);
    else if (!cycleCountOk(tandas.length)) {
      addExtra(false);
      if (!cycleCountOk(tandas.length) && tandas.length > len0) {
        tandas.splice(tandas.length - 2, 1);
        tandas[tandas.length - 1]!.index = tandas.length - 1;
        diff = target - total();
      }
    }
    // the cues fit again around the chairs that stay
    flexCues();
  };
  const pickClosing = (): Song | null => {
    if (!o.closeWithCumparsita || rules.closer === "none") return null;
    // round 15 (rules.closer): Felicia instead of La Cumparsita — a known, streaming side in the night's years first
    if (rules.closer === "felicia") {
      const yr0 = o.yearRange;
      const fel = cat.songs
        .filter(
          (s) =>
            normTitle(s.title) === "felicia" &&
            s.rhythm === "tango" &&
            isTandaEligible(s) &&
            !s.streamSuspect &&
            s.orchestraId !== (tandas[tandas.length - 1]?.orchestraId ?? ""),
        )
        .sort(
          (a, b) =>
            Number(!!yr0 && !!b.year && b.year >= yr0[0] && b.year <= yr0[1]) -
              Number(!!yr0 && !!a.year && a.year >= yr0[0] && a.year <= yr0[1]) ||
            Number(streamable(b)) - Number(streamable(a)) ||
            (b.fame ?? 0) - (a.fame ?? 0) ||
            a.id.localeCompare(b.id),
        );
      if (fel[0]) return fel[0];
      fallbacks.push("closer: no Felicia recording in the index; La Cumparsita closes instead");
    }
    const lastOrch = tandas[tandas.length - 1]?.orchestraId ?? "";
    let cands = cumparsitaCandidates(cat, o).filter((s) => s.orchestraId !== lastOrch);
    // round 13 (golden-age review R7): the closer comes from the night's own year range, from a stream that is the
    // recording (never the 1951 take behind a 1937 row); a strict golden range (to ≤ 1946) takes the closest year
    // outside it only when no in-range version exists
    const yr = o.yearRange;
    if (yr) {
      const inRange = (s: Song) => s.year! >= yr[0] && s.year! <= yr[1] && !s.streamSuspect;
      const any = cat.songs.filter(
        (s) =>
          normTitle(s.title) === "la cumparsita" &&
          s.rhythm === "tango" &&
          !s.vocal &&
          isTandaEligible(s) &&
          s.orchestraId !== lastOrch,
      );
      const inR = cands.filter(inRange).length ? cands.filter(inRange) : any.filter(inRange);
      if (inR.length) cands = inR;
      else if (yr[1] <= 1946) {
        const dist = (s: Song) => Math.max(0, yr[0] - s.year!, s.year! - yr[1]);
        const sound = any.filter((s) => !s.streamSuspect);
        const near = Math.min(...sound.map(dist));
        if (sound.length) cands = sound.filter((s) => dist(s) === near);
      }
    }
    // round 14 (dancer R14-1): a golden night closes on a version the floor knows and the DJ can stream
    if (isGoldenNight(o)) {
      const good = cands.filter((s) => streamable(s) && (s.fame ?? 0) >= 2);
      if (good.length) cands = good;
      else {
        const strictC = pickStrictCloser(cat, o, lastOrch);
        if (strictC) cands = [strictC];
      }
    }
    // round 9: the version follows the última's character — rhythmic → D'Arienzo 1951 outright (another rhythmic
    // closing version when the última is D'Arienzo), lyrical → Di Sarli
    const style = cumparsitaStyle(cat, lastOrch);
    const da51 = cands.find((s) => s.orchestraId === "juan-d-arienzo" && s.year === 1951);
    const styled = cands.filter((s) => cumparsitaStyleWeight(cat, style, s) >= 1);
    const diSarli = styled.filter((s) => s.orchestraId === "carlos-di-sarli");
    const from = style === "lyrical" && diSarli.length ? diSarli : styled.length ? styled : cands;
    return (
      (style === "rhythmic" ? da51 : undefined) ??
      rng.weighted(from, (s) => cumparsitaWeight(cat, o, s) * cumparsitaStyleWeight(cat, style, s)) ??
      from[0] ??
      null
    );
  };
  let closing = pickClosing();
  fitLength();
  // round 14 — the strict panel (docs/specs/round14-engine.md): the cortinas are re-picked under the panel's cue rules,
  // then a golden night is repaired until no rule is broken that a local edit can fix
  const recued = recue(tandas, deps, o);
  const cueNight = (ts: Tanda[]) => strictChecks({ tandas: ts, closing, options: o });
  if (
    recued &&
    recueBetter(cueNight(recued), cueNight(tandas)) &&
    cueFamilies({ tandas: recued }) <= cueFamilies({ tandas })
  )
    recued.forEach((t, i) => {
      tandas[i] = t;
    });
  // (the panel judged 4 h nights: marathons of 5 h and more keep the round-13 composer and are reported, not repaired)
  if (isGoldenNight(o) && !lockedByIndex.size && o.hours < 5) {
    const draft: Playlist = {
      id: "draft",
      name: "",
      createdAt: "",
      options: o,
      tandas,
      closing,
      stats: {
        ...computeStats(tandas, closing, o),
        ...(fallbacks.length ? { settingFallbacks: fallbacks } : {}),
      },
      score: { total: 0, factors: [], verdict: "" },
    };
    draft.score = scorePlaylist(draft);
    const r = strictRepair(draft, deps, { fams: byRhythm });
    tandas.splice(0, tandas.length, ...r.playlist.tandas);
    closing = r.playlist.closing;
  }
  // La Cumparsita: closing versions only (corpus/profile years), preferred orchestras, varied by seed, never the última's orchestra
  let opening: Song | null = null;
  if (rules.openWithCumparsita) {
    const cands = cumparsitaCandidates(cat, o).filter(
      (s) => s.id !== closing?.id && s.orchestraId !== tandas[0]?.orchestraId,
    );
    opening = rng.weighted(cands, (s) => cumparsitaWeight(cat, o, s)) ?? null;
  }
  const breaks =
    breakAfter >= 0 && tandas[breakAfter]
      ? [{ afterTanda: breakAfter, minutes: breakMin, label: "Show / break" }]
      : undefined;
  const stats = computeStats(tandas, closing, o);
  if (plan.fallback) stats.cortinaFallback = plan.fallback;
  if (
    rules.closer === "in-range" &&
    closing &&
    o.yearRange &&
    closing.year &&
    (closing.year < o.yearRange[0] || closing.year > o.yearRange[1])
  )
    fallbacks.push(
      `closer: no La Cumparsita in ${o.yearRange[0]}–${o.yearRange[1]}; ${closing.orchestra} ${closing.year} closes`,
    );
  if (fallbacks.length) stats.settingFallbacks = [...new Set(fallbacks)];
  if (opening) {
    stats.durationSec += opening.durationSec ?? 180;
    stats.tracks += 1;
  }
  if (breaks) stats.durationSec += breakMin * 60;
  const playlist: Playlist = {
    id: `tdj-${(o.seed ?? seed).toString(36)}`,
    name: o.name ?? `${o.hours}h ${o.eras.join("+")} ${o.context?.event ?? "milonga"}`,
    createdAt: new Date().toISOString(),
    options: o,
    tandas,
    closing,
    opening,
    breaks,
    stats,
    score: { total: 0, factors: [], verdict: "" },
  };
  playlist.score = scorePlaylist(playlist);
  return attachBooth(playlist);
}

export function computeStats(tandas: Tanda[], closing: Song | null, o: ComposeOptions): PlaylistStats {
  const byRhythm: Record<DanceRhythm, number> = { tango: 0, vals: 0, milonga: 0 };
  const orchestras: Record<string, number> = {};
  let dur = 0,
    tracks = 0,
    vocal = 0,
    cort = 0,
    cortN = 0;
  for (const t of tandas) {
    byRhythm[t.rhythm]++;
    orchestras[t.orchestra] = (orchestras[t.orchestra] ?? 0) + 1;
    dur += t.durationSec + (t.cortina ? (t.cortina.lengthSec ?? o.cortinaLengthSec) : 0);
    if (t.cortina) {
      cort += t.cortina.lengthSec ?? o.cortinaLengthSec;
      cortN++;
    }
    tracks += t.songs.length;
    if (t.vocal) vocal++;
  }
  if (closing) {
    dur += closing.durationSec ?? 180;
    tracks++;
  }
  const energyArc = tandas.map((t) => t.energy);
  const targetArc = tandas.map((t) => t.targetEnergy);
  const rmse = Math.sqrt(
    tandas.reduce((a, t) => a + (t.energy - t.targetEnergy) ** 2, 0) / Math.max(1, tandas.length),
  );
  const tangoT = tandas.filter((t) => t.rhythm === "tango");
  const graded = tandas.flatMap((t) => t.songs).filter((s) => s.heat !== undefined);
  const heatBestShare = graded.length
    ? Math.round((graded.filter((s) => (s.heat ?? 0) >= 3).length / graded.length) * 100) / 100
    : undefined;
  const peaks = tandas
    .filter((t) => t.peak)
    .map((t) => ({ index: t.index, energy: t.energy, target: t.targetEnergy, orchestra: t.orchestra }));
  return {
    tandas: tandas.length,
    tracks,
    durationSec: dur,
    byRhythm,
    orchestras,
    vocalRatio: tandas.length ? vocal / tandas.length : 0,
    energyArc,
    targetArc,
    arcFit: Math.max(0, 1 - rmse / 30),
    arcRmse: Math.round(rmse * 10) / 10,
    vocalTangoShare: tangoT.length ? tangoT.filter((t) => t.vocal).length / tangoT.length : 0,
    ...(peaks.length ? { peaks } : {}),
    ...(heatBestShare !== undefined ? { heatBestShare } : {}),
    cortinaSec: cortN ? Math.round(cort / cortN) : undefined,
  };
}

/** Re-roll one tanda (keeps everything else). Uses the same scoring and pool rules as compose(). */
export function swapTanda(
  p: Playlist,
  index: number,
  deps: ComposeDeps,
  seed = Date.now(),
  /** round 13: only these families may take the chair (improveNight's golden-core fixer) */
  only?: (c: TandaCandidate) => boolean,
): Playlist {
  const o = p.options;
  const rng = makeRng(seed);
  const cat = deps.catalog;
  const t = p.tandas[index];
  if (!t) return p;
  const rules = o.rules ?? {};
  const pool = cat
    .filter({
      eras: o.eras,
      rhythms: [t.rhythm],
      includeOrchestras: o.includeOrchestras,
      excludeOrchestras: [...(o.excludeOrchestras ?? []), ...TANDA_POOL_EXCLUDES],
      onlySelection: o.onlySelection,
      requireSpotify: o.requireSpotify,
      yearRange: o.yearRange,
      minTier: o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
    })
    .filter((s) => normTitle(s.title) !== "la cumparsita" && isTandaEligible(s, !!rules.allowUndated));
  const neighbours = p.tandas
    .map((x, i) => ({ x, d: Math.abs(i - index) }))
    .filter((n) => n.d > 0 && n.d <= Math.max(o.orchestraRepeatGap, o.singerRepeatGap))
    .sort((a, b) => a.d - b.d);
  const ctx: BuildContext = {
    recentOrchestras: p.tandas
      .slice(0, index)
      .reverse()
      .map((x) => x.orchestraId),
    recentSingers: neighbours.map((n) => n.x.singer).filter((x): x is string => !!x),
    usedTitles: new Set(
      p.tandas.flatMap((x, i) => (i === index ? [] : x.songs.map((s) => normTitle(s.title)))),
    ),
    usedSongIds: new Set(p.tandas.flatMap((x, i) => (i === index ? [] : x.songs.map((s) => s.id)))),
    totalSlots: p.tandas.length,
    usedFamilies: p.tandas
      .filter((x, i) => i !== index && x.yearRange)
      .map((x) => ({
        orchestraId: x.orchestraId,
        singer: x.singer,
        rhythm: x.rhythm,
        years: x.yearRange!,
        yearSet: yearSetOf(x),
      })),
    history: p.tandas.slice(0, index),
    next: p.tandas[index + 1] ? sideOf(p.tandas[index + 1]!) : null,
  };
  const slot = {
    index,
    rhythm: t.rhythm,
    size: t.songs.length,
    targetEnergy: t.targetEnergy,
    phase: t.phase,
    position: index / Math.max(1, p.tandas.length - 1),
  };
  const sc = makeScoring(cat, o, deps.contextModel);
  const fams = families(
    pool,
    o.maxYearSpread,
    o.mixVocalInstrumental || (t.rhythm !== "tango" && !!rules.mixedMilongaVals),
    orchTotals(cat),
    { rhythm: t.rhythm, need: t.songs.length, breaks: familyBreaks(cat) },
  ).filter((c) => c.orchestraId !== t.orchestraId && (!only || only(c)));
  const gapOk = (id: string) => !neighbours.some((n) => n.d < o.orchestraRepeatGap && n.x.orchestraId === id);
  let nt: Tanda | null = null;
  for (let attempt = 0; attempt < 6 && !nt; attempt++) {
    const cand = buildTanda(
      slot,
      fams.filter((c) => gapOk(c.orchestraId)),
      o,
      rng,
      ctx,
      sc,
    );
    if (cand) nt = cand;
  }
  if (!nt) return p;
  nt.cortina = t.cortina;
  nt.locked = t.locked;
  const tandas = p.tandas.map((x, i) => (i === index ? nt : x));
  const np = attachBooth({ ...p, tandas, stats: computeStats(tandas, p.closing, o) });
  np.score = scorePlaylist(np);
  return np;
}

/** Replace one track inside a tanda with another from the same family (same orchestra/singer/year window). */
export function swapTrack(
  p: Playlist,
  tandaIndex: number,
  trackIndex: number,
  deps: ComposeDeps,
  seed = Date.now(),
): Playlist {
  const t = p.tandas[tandaIndex];
  const cur = t?.songs[trackIndex];
  if (!t || !cur) return p;
  const rng = makeRng(seed);
  const cat = deps.catalog;
  const used = new Set(p.tandas.flatMap((x) => x.songs.map((s) => normTitle(s.title))));
  const cands = (cat.byOrchestra.get(t.orchestraId) ?? []).filter(
    (s) =>
      s.rhythm === t.rhythm &&
      (s.singerId ?? null) === (cur.singerId ?? null) &&
      s.year &&
      t.yearRange &&
      s.year >= t.yearRange[0] - 1 &&
      s.year <= t.yearRange[1] + 1 &&
      !used.has(normTitle(s.title)) &&
      normTitle(s.title) !== "la cumparsita" &&
      isTandaEligible(s, !!p.options.rules?.allowUndated) &&
      isDanceableSong(s, cat.blacklist) &&
      !cat.nonDance(s.orchestraId, s.title, s.year),
  );
  const pick = rng.weighted(
    cands,
    (s) =>
      Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - (cur.energy ?? 50)) / 25) * (1 + (s.fame ?? 0) * 0.4),
  );
  if (!pick) return p;
  const songs = t.songs.map((s, i) => (i === trackIndex ? pick : s));
  const years = songs.map((s) => (s.year && !s.yearApprox ? s.year : null)).filter((y): y is number => !!y);
  const curve = songs.map((s) => s.energy ?? 50);
  const nt: Tanda = {
    ...t,
    songs,
    energyCurve: curve,
    energy: Math.round(curve.reduce((a, b) => a + b, 0) / curve.length),
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : t.yearRange,
    durationSec: songs.reduce((a, s) => a + (s.durationSec ?? 170), 0),
  };
  const tandas = p.tandas.map((x, i) => (i === tandaIndex ? nt : x));
  const np = attachBooth({ ...p, tandas, stats: computeStats(tandas, p.closing, p.options) });
  np.score = scorePlaylist(np);
  return np;
}

/** Natural-language-ish feedback → option changes ("more energetic", "calmer start", "more vals", "fewer repeats", "shorter cortinas"…). */
export type Feedback =
  | "more-energetic"
  | "calmer"
  | "more-vals"
  | "more-milongas"
  | "fewer-milongas"
  | "earlier-peak"
  | "later-peak"
  | "more-vocal"
  | "more-instrumental"
  | "warmer-start"
  | "stronger-finish"
  | "fewer-repeats"
  | "more-variety"
  | "shorter-cortinas"
  | "longer-cortinas"
  | "more-romantic"
  | "more-playful"
  | "more-dramatic";
export function applyFeedback(o: Partial<ComposeOptions>, fb: Feedback[]): Partial<ComposeOptions> {
  const out: Partial<ComposeOptions> = { ...o, context: { ...(o.context ?? {}) } };
  const mood = (m: NonNullable<ComposeOptions["context"]>["mood"]) => {
    out.context = { ...out.context, mood: m };
  };
  for (const f of fb) {
    switch (f) {
      case "more-energetic":
        out.floorMood = "energetic";
        mood("energetic");
        break;
      case "calmer":
        out.floorMood = o.floorMood === "energetic" ? "balanced" : "romantic";
        out.context = { ...out.context, mood: undefined };
        break;
      case "more-vals":
        out.pattern = "custom";
        out.customPattern = "TTVTTMTTV";
        break;
      case "more-milongas":
        out.pattern = "custom";
        out.customPattern = "TTMTTVTTM";
        break;
      case "fewer-milongas":
        out.pattern = "custom";
        out.customPattern = "TTVTTVTTM";
        break;
      case "earlier-peak":
        out.arc = "single-peak";
        break;
      case "later-peak":
        out.arc = "classic-two-peaks";
        break;
      case "more-vocal":
        out.mixVocalInstrumental = false;
        out.vocalBias = Math.min(0.6, (o.vocalBias ?? 0) + 0.2);
        break;
      case "more-instrumental":
        out.mixVocalInstrumental = false;
        out.vocalBias = Math.max(-0.6, (o.vocalBias ?? 0) - 0.2);
        break;
      case "warmer-start":
        out.arc = "gentle";
        break;
      case "stronger-finish":
        out.floorMood = "energetic";
        break;
      case "fewer-repeats":
        out.orchestraRepeatGap = Math.min(12, (o.orchestraRepeatGap ?? 6) + 3);
        break;
      case "more-variety":
        out.orchestraRepeatGap = Math.min(12, (o.orchestraRepeatGap ?? 6) + 2);
        out.singerRepeatGap = (o.singerRepeatGap ?? 4) + 2;
        break;
      case "shorter-cortinas":
        out.cortinaLengthSec = Math.max(20, (o.cortinaLengthSec ?? 45) - 15);
        break;
      case "longer-cortinas":
        out.cortinaLengthSec = Math.min(90, (o.cortinaLengthSec ?? 45) + 15);
        break;
      case "more-romantic":
        mood("romantic");
        break;
      case "more-playful":
        mood("playful");
        break;
      case "more-dramatic":
        mood("dramatic");
        break;
    }
  }
  return out;
}
