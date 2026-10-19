import { planSlots, sanitizeOptions } from "./arc";
import { attachBooth } from "./booth";
import type { Catalog } from "./catalog";
import { applyContextToOptions, BUILTIN_CONTEXT, resolveContext } from "./context";
import { cortinaPool, pickCortina, planCortinas } from "./cortinas";
import { isDanceableSong, normTitle } from "./energy";
import { ERA_PRESETS, ERA_SETTINGS } from "./profiles";
import { makeRng } from "./rng";
import { CORPUS_CAPS, CUMPARSITA_CLOSING_YEARS, DEFAULT_CAP, OPENERS } from "./rules";
import { scorePlaylist } from "./score";
import {
  type BuildContext,
  buildTanda,
  families,
  isEarlyDArienzo,
  type Scoring,
  type TandaCandidate,
} from "./tanda";
import type {
  ComposeOptions,
  ContextModel,
  Cortina,
  DanceRhythm,
  NightRules,
  Playlist,
  PlaylistStats,
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
  const all = cat.songs.filter(
    (s) =>
      normTitle(s.title) === "la cumparsita" &&
      s.rhythm === "tango" &&
      !s.yearApprox &&
      !!s.year &&
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
function cumparsitaWeight(cat: Catalog, o: ComposeOptions, s: Song): number {
  const i = CUMPARSITA_PREF.indexOf(s.orchestraId);
  const corpus = cat.fame.get(`la cumparsita|${s.orchestraId}`);
  const years = cumparsitaYears(cat, s.orchestraId);
  const bounds = o.eras.map((e) => ERA_PRESETS[e]?.years).filter((y): y is [number, number] => !!y);
  const inEra = bounds.some((b) => s.year! >= b[0] && s.year! <= b[1]);
  return (
    (i === -1 ? 0.05 : 1.6 - i * 0.2) *
    (s.selection ? 1.3 : 1) *
    (corpus?.role === "cumparsita" ? 1 + (corpus.fame ?? 0) : 0.4) *
    (years.has(s.year!) ? 2.5 : 1) *
    (inEra ? 4 : 1)
  );
}

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
      // long nights get two Pugliese slots: instrumentals from ~45 %, the vocal one late
      return id === "osvaldo-pugliese" && o.hours >= 6 && !puglieseOnce ? Math.min(nb, 0.42) : nb;
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

const famKey = (t: { orchestraId: string; singer: string | null; vocal: boolean }) =>
  `${t.orchestraId}|${t.singer ?? ""}|${t.vocal}`;

export function compose(
  partial: Partial<ComposeOptions>,
  deps: ComposeDeps,
  extras: ComposeExtras = {},
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
  const rc = resolveContext(o.context, deps.contextModel ?? BUILTIN_CONTEXT);
  o = sanitizeOptions(applyContextToOptions(o, rc, explicitKeys));
  const seed = o.seed ?? Math.floor(Math.random() * 1e9);
  o.seed = seed;
  const rng = makeRng(seed);
  // plan with the real mean track length of the active pool so the night lands on the requested hours
  if (!o.avgTrackSec && !o.trackSecByRhythm) {
    const tsr: Partial<Record<DanceRhythm, number>> = {};
    for (const r of ["tango", "vals", "milonga"] as DanceRhythm[]) {
      const pool = deps.catalog.filter({ eras: o.eras, rhythms: [r] });
      if (pool.length > 20)
        tsr[r] = Math.round(pool.reduce((a, s) => a + (s.durationSec ?? 170), 0) / pool.length);
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
  const cat = deps.catalog;
  const sc = makeScoring(cat, o, deps.contextModel);
  const byRhythm: Record<DanceRhythm, TandaCandidate[]> = { tango: [], vals: [], milonga: [] };
  for (const r of ["tango", "vals", "milonga"] as DanceRhythm[]) {
    const pool = cat
      .filter({
        eras: o.eras,
        rhythms: [r],
        includeOrchestras: o.includeOrchestras,
        excludeOrchestras: [...(o.excludeOrchestras ?? []), ...TANDA_POOL_EXCLUDES],
        onlySelection: o.onlySelection,
        requireSpotify: o.requireSpotify,
        minTier:
          o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
      })
      // La Cumparsita only ever opens or closes a night (rules), never inside an ordinary tanda
      .filter((s) => normTitle(s.title) !== "la cumparsita");
    byRhythm[r] = families(
      pool,
      o.maxYearSpread,
      o.mixVocalInstrumental || (r !== "tango" && !!rules.mixedMilongaVals),
      orchTotals(cat),
    );
  }
  // a night's mood for orchestras: every orchestra gets a seed-drawn 0.6–1.4 factor so twelve nights are twelve nights
  const nightBias = new Map<string, number>();
  for (const id of [...cat.profiles.keys()].sort()) nightBias.set(id, 0.6 + rng.next() * 0.8);
  const ctx: BuildContext = {
    recentOrchestras: [],
    recentSingers: [],
    usedTitles: new Set(),
    usedSongIds: new Set(),
    totalSlots: slots.length,
    nightBias,
  };
  const lockedByIndex = new Map((extras.locked ?? []).filter((t) => t.locked).map((t) => [t.index, t]));
  for (const t of lockedByIndex.values())
    for (const s of t.songs) {
      ctx.usedSongIds.add(s.id);
      ctx.usedTitles.add(normTitle(s.title));
    }
  const tandas: Tanda[] = [];
  const last = slots.length - 1;
  const ultimaRule = rules.ultimaRule ?? "emotional-vocal";
  // ultimaRule "pugliese": Pugliese is reserved for the última, so the body never spends him
  const bodySc: Scoring =
    ultimaRule === "pugliese"
      ? { ...sc, maxPerNight: (id) => (id === "osvaldo-pugliese" ? 0 : sc.maxPerNight?.(id)) }
      : sc;
  let colourDone = false;
  // the first D'Arienzo (corpus median 19 % of the night, before 35 %): one early tango slot per seed is his
  const earlySlots = slots.filter(
    (s) => s.rhythm === "tango" && s.index > 0 && s.position >= 0.08 && s.position <= 0.33,
  );
  const earlyDASlot = earlySlots.length && !lockedByIndex.size ? rng.pick(earlySlots)!.index : -1;
  ctx.earlyDASlot = earlyDASlot;
  // Pugliese once: his slot is drawn around the corpus median (0.87) instead of the first eligible peak slot;
  // the última itself is a candidate (he is the most common final tanda before La Cumparsita)
  const puglieseOnce = (sc.maxPerNight?.("osvaldo-pugliese") ?? 2) <= 1;
  const pugSlots = slots.filter((s) => s.rhythm === "tango" && s.position >= 0.62);
  const pugProfile = cat.profile("osvaldo-pugliese");
  const pugAllowed =
    !sc.avoidStyles?.includes(pugProfile?.style ?? "dramatic") &&
    (o.maxDifficulty === undefined || (pugProfile?.difficulty ?? 0) <= o.maxDifficulty);
  const pugSlot =
    puglieseOnce && pugAllowed && pugSlots.length && !lockedByIndex.size && ultimaRule !== "pugliese"
      ? (rng.weighted(pugSlots, (s) => Math.exp(-(((s.position - 0.87) / 0.14) ** 2)))?.index ?? -1)
      : -1;
  const daTangoCount = () =>
    tandas.filter((t) => t.orchestraId === "juan-d-arienzo" && t.rhythm === "tango").length;
  /** a forced orchestra still respects the repeat gap: the force waits for the next slot otherwise */
  const gapFree = (id: string) => {
    const i = ctx.recentOrchestras.indexOf(id);
    return i === -1 || i >= o.orchestraRepeatGap;
  };
  /** before the drawn Pugliese slot, Pugliese stays out of the body; before the drawn D'Arienzo slot, no D'Arienzo vals/milonga */
  const scFor = (slot: Slot): Scoring => {
    const holdPug = pugSlot >= 0 && slot.index < pugSlot && slot.index !== last;
    // D'Arienzo's vals/milonga never steal a slot before his first tango tanda nor the late slots his second one needs
    const holdDA =
      slot.rhythm !== "tango" &&
      ((earlyDASlot >= 0 && slot.index < earlyDASlot) || (slot.position >= 0.6 && daTangoCount() < 2));
    if (!holdPug && !holdDA) return bodySc;
    return {
      ...bodySc,
      maxPerNight: (id) =>
        (holdPug && id === "osvaldo-pugliese") || (holdDA && id === "juan-d-arienzo")
          ? 0
          : bodySc.maxPerNight?.(id),
    };
  };
  for (const slot of slots) {
    let tanda: Tanda | null = lockedByIndex.get(slot.index) ?? null;
    if (tanda) tanda = { ...tanda, targetEnergy: slot.targetEnergy, phase: slot.phase };
    if (!tanda && slot.index === 0 && rules.openerRule && rules.openerRule !== "any") {
      const style = (id: string) => cat.profile(id)?.style;
      const want =
        rules.openerRule === "canon"
          ? (c: TandaCandidate) => !!OPENERS[c.orchestraId]
          : rules.openerRule === "lyrical"
            ? (c: TandaCandidate) => ["lyrical", "guardia"].includes(style(c.orchestraId) ?? "")
            : (c: TandaCandidate) => style(c.orchestraId) === "rhythmic";
      const prefO = byRhythm.tango.filter(want);
      if (prefO.length) tanda = buildTanda(slot, prefO, o, rng, ctx, scFor(slot));
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
      // the última may bring an orchestra back a third time (corpus: Tanturi, D'Arienzo, Di Sarli close after two tandas)
      const ultSc: Scoring = {
        ...sc,
        notBefore: () => 0,
        phase: () => ["any"],
        maxPerNight: (id) => {
          const m = sc.maxPerNight?.(id);
          return id === "osvaldo-pugliese" ? m : (m ?? CORPUS_CAPS[id] ?? DEFAULT_CAP) + 1;
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
      // known material closes a night: families the corpus knows, when enough of them exist
      const famous = pref.filter((c) => c.songs.some((s) => (s.fame ?? 0) > 0));
      if (famous.length >= 3) pref = famous;
      const tried = new Set<string>();
      let best: Tanda | null = null;
      for (let attempt = 0; attempt < 6 && !tanda; attempt++) {
        const cands = (pref.length ? pref : byRhythm.tango).filter((c) => !tried.has(famKey(c)));
        const t = buildTanda(ult, cands, o, rng, ctx, ultSc);
        if (!t) break;
        if (t.energy >= ult.targetEnergy - 4) tanda = t;
        else {
          tried.add(famKey(t));
          if (!best || t.energy > best.energy) best = t;
        }
      }
      tanda = tanda ?? best ?? buildTanda(ult, byRhythm.tango, o, rng, ctx, ultSc);
    }
    if (!tanda && slot.index === pugSlot && slot.index !== last && gapFree("osvaldo-pugliese")) {
      // Pugliese is the emotional summit of the last third: his slot is planned at ≥74 whatever the cool-down says
      const pug = byRhythm.tango.filter((c) => c.orchestraId === "osvaldo-pugliese");
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
        if (tanda) slot.targetEnergy = peak.targetEnergy;
      } else if (
        ((n === 0 && slot.position >= 0.38 && slot.phase !== "cooldown") ||
          (n === 1 && slot.position >= 0.7 && ultimaRule !== "d-arienzo-rhythmic")) &&
        da.length
      )
        tanda = buildTanda(slot, da, o, rng, ctx, scFor(slot));
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
      const cands =
        slot.rhythm === "tango" && daTangoCount() >= 3
          ? byRhythm.tango.filter((c) => c.orchestraId !== "juan-d-arienzo")
          : byRhythm[slot.rhythm];
      tanda = buildTanda(slot, cands, o, rng, ctx, scFor(slot));
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
      const relaxed: Scoring = {
        ...bodySc,
        maxPerNight: (id) => (id === "osvaldo-pugliese" ? bodySc.maxPerNight?.(id) : 99),
        notAfter: () => undefined,
        phase: () => ["any"],
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
            !s.yearApprox &&
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
  const plan = planCortinas(pool, o, rng, tandas[1]?.energy ?? 60, tandas.length);
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
  tandas.forEach((t, i) => {
    const next = tandas[i + 1];
    if (!next) {
      const c =
        rules.cortinaBeforeCumparsita && o.closeWithCumparsita
          ? pickCortina(pool, t.energy, o, rng, used, plan)
          : null;
      t.cortina = c ? { ...c, lengthSec: o.cortinaLengthSec } : null;
      return;
    }
    const c = pickCortina(pool, next.energy, o, rng, used, plan);
    t.cortina = c ? { ...c, lengthSec: o.cortinaLengthSec } : null;
    if (c) remember(c);
  });
  // land on the requested length: a night more than a tanda too long drops a late tanda first, then cortina lengths
  // absorb the rest (±8 s around the DJ's length; ±15 s only when the hour would still be missed by >4 min — the
  // score sheet shows it). The target is the playing time: a show break is added on top, never paid for by cortinas.
  const fitLength = () => {
    const target = playHours * 3600 - (o.closeWithCumparsita ? 180 : 0);
    const total = () => tandas.reduce((a, t) => a + t.durationSec + (t.cortina?.lengthSec ?? 0), 0);
    const setCortinas = (len: number) => {
      for (const t of tandas) if (t.cortina) t.cortina = { ...t.cortina, lengthSec: len };
    };
    // the late tanda to drop: never one whose removal puts the same orchestra (or two vals/milongas) side by side
    const dropIndex = () => {
      const ok = (i: number) => {
        const a = tandas[i - 1],
          b = tandas[i + 1];
        return (
          !!a && !!b && a.orchestraId !== b.orchestraId && (a.rhythm === "tango" || b.rhythm === "tango")
        );
      };
      return (
        [tandas.length - 2, tandas.length - 3, tandas.length - 4].find((k) => k > 0 && ok(k)) ??
        tandas.length - 2
      );
    };
    setCortinas(o.cortinaLengthSec);
    let diff = target - total();
    const withC = tandas.filter((t) => t.cortina).length;
    // a late tanda is dropped only when that lands closer to the hour than stretching every cortina by 15 s could
    if (diff < 0 && tandas.length > 4 && Math.abs(diff) > withC * 15) {
      const i = dropIndex();
      const removedSec = tandas[i]!.durationSec + (tandas[i]!.cortina?.lengthSec ?? 0);
      if (Math.abs(diff + removedSec) < Math.abs(diff)) {
        const removed = tandas.splice(i, 1)[0]!;
        if (tandas[i - 1] && removed.cortina)
          tandas[i - 1]!.cortina = tandas[i - 1]!.cortina ?? removed.cortina;
        diff = target - total();
      }
    }
    const n = tandas.filter((t) => t.cortina).length;
    for (const flex of [8, 15]) {
      if (!n || Math.abs(diff) <= (flex === 8 ? 60 : 240)) break;
      const per = Math.max(-flex, Math.min(flex, Math.round(diff / n)));
      setCortinas(Math.max(10, Math.min(120, o.cortinaLengthSec + per)));
      diff = target - total();
    }
    // still short by more than half a tanda (no cortinas to stretch, or a long night): one more tango tanda
    // before the última, built like any other, so the night lands on the hour instead of ending early
    if (diff > 240 && tandas.length >= 3) {
      const prev = tandas[tandas.length - 2]!;
      const extra: Slot = {
        index: tandas.length - 1,
        rhythm: "tango",
        size: o.tangoTandaSize,
        targetEnergy: Math.round((prev.targetEnergy + tandas[tandas.length - 1]!.targetEnergy) / 2),
        phase: prev.phase,
        position: 0.92,
      };
      ctx.recentOrchestras = tandas.slice(-o.orchestraRepeatGap).map((t) => t.orchestraId);
      ctx.recentSingers = tandas
        .slice(-o.singerRepeatGap)
        .map((t) => t.singer)
        .filter((x): x is string => !!x);
      const t = buildTanda(extra, byRhythm.tango, o, rng, ctx, scFor(extra));
      const addSec = (t?.durationSec ?? 0) + (t && n ? o.cortinaLengthSec : 0);
      if (t && Math.abs(diff - addSec) < Math.abs(diff)) {
        const ult = tandas[tandas.length - 1]!;
        if (n) t.cortina = prev.cortina ? { ...prev.cortina } : null;
        tandas.splice(tandas.length - 1, 0, t);
        ult.index = tandas.length - 1;
        diff = target - total();
      }
    }
  };
  fitLength();
  // La Cumparsita: closing versions only (corpus/profile years), preferred orchestras, varied by seed, never the última's orchestra
  let closing: Song | null = null;
  if (o.closeWithCumparsita) {
    const lastOrch = tandas[tandas.length - 1]?.orchestraId;
    const cands = cumparsitaCandidates(cat, o).filter((s) => s.orchestraId !== lastOrch);
    closing = rng.weighted(cands, (s) => cumparsitaWeight(cat, o, s)) ?? cands[0] ?? null;
  }
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
  if (opening) {
    stats.durationSec += opening.durationSec ?? 180;
    stats.tracks += 1;
  }
  if (breaks) stats.durationSec += breakMin * 60;
  const playlist: Playlist = {
    id: `tdj-${seed.toString(36)}`,
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
    cortinaSec: cortN ? Math.round(cort / cortN) : undefined,
  };
}

/** Re-roll one tanda (keeps everything else). Uses the same scoring and pool rules as compose(). */
export function swapTanda(p: Playlist, index: number, deps: ComposeDeps, seed = Date.now()): Playlist {
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
      minTier: o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
    })
    .filter((s) => normTitle(s.title) !== "la cumparsita");
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
  ).filter((c) => c.orchestraId !== t.orchestraId);
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
