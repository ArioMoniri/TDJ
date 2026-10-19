import { planSlots, sanitizeOptions } from "./arc";
import type { Catalog } from "./catalog";
import { applyContextToOptions, BUILTIN_CONTEXT, resolveContext } from "./context";
import { cortinaPool, pickCortina, planCortinas } from "./cortinas";
import { isDanceable, normTitle } from "./energy";
import { withEraSettings } from "./profiles";
import { makeRng } from "./rng";
import { OPENERS } from "./rules";
import { scorePlaylist } from "./score";
import { type BuildContext, buildTanda, families, type Scoring, type TandaCandidate } from "./tanda";
import type {
  ComposeOptions,
  ContextModel,
  Cortina,
  DanceRhythm,
  Playlist,
  PlaylistStats,
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
const ULTIMA_PREF = [
  "juan-d-arienzo",
  "carlos-di-sarli",
  "anibal-troilo",
  "ricardo-tanturi",
  "miguel-calo",
  "rodolfo-biagi",
  "osvaldo-pugliese",
  "alfredo-de-angelis",
  "enrique-rodriguez",
  "angel-d-agostino",
];

export function compose(
  partial: Partial<ComposeOptions>,
  deps: ComposeDeps,
  extras: ComposeExtras = {},
): Playlist {
  let o: ComposeOptions = sanitizeOptions({
    ...DEFAULT_OPTIONS,
    ...withEraSettings(partial),
    ...(partial.overrides?.rules ?? {}),
  });
  const rules = o.rules ?? {};
  const rc = resolveContext(o.context, deps.contextModel ?? BUILTIN_CONTEXT);
  o = applyContextToOptions(o, rc);
  // what the DJ set explicitly tonight always wins over context suggestions (sizes, pattern)
  const explicit = sanitizeOptions({ ...o, ...partial });
  if (partial.tangoTandaSize !== undefined) o.tangoTandaSize = explicit.tangoTandaSize;
  if (partial.valsTandaSize !== undefined) o.valsTandaSize = explicit.valsTandaSize;
  if (partial.milongaTandaSize !== undefined) o.milongaTandaSize = explicit.milongaTandaSize;
  if (partial.pattern !== undefined && partial.pattern !== "classic") {
    o.pattern = partial.pattern;
    if (partial.customPattern !== undefined) o.customPattern = partial.customPattern;
  }
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
  const slots = planSlots(breakMin ? { ...o, hours: Math.max(0.5, o.hours - breakMin / 60) } : o);
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
  const extraBl = new Set([...cat.blacklist]);
  const sc: Scoring = {
    energy: (id) => cat.profile(id)?.energy ?? 50,
    phase: (id) => cat.profile(id)?.phase,
    tier: (id) => cat.profile(id)?.tier ?? 3,
    notBefore: (id) => o.overrides?.rules?.notBefore?.[id] ?? cat.profile(id)?.notBefore ?? 0,
    style: (id) => cat.profile(id)?.style,
    preferStyles: rc.preferStyles,
    avoidStyles: rc.avoidStyles,
    isDanceable: (s) => isDanceable(s.title, s.rhythm, extraBl),
    canonical: cat.corpus.canonicalTandas as Scoring["canonical"],
    guardiaOnly: o.eras.every((e) => e === "guardia-vieja"),
    maxPerNight: (id) =>
      id === "osvaldo-pugliese" && rules.puglieseOnce === false
        ? 2
        : (cat.profile(id) as { maxPerNight?: number } | undefined)?.maxPerNight,
    notAfter: (id) => (cat.profile(id) as { notAfter?: number } | undefined)?.notAfter,
    neverClose: (id) => !!(cat.profile(id) as { neverClose?: boolean } | undefined)?.neverClose,
    nonDance: (id, title) => {
      const pr = cat.profile(id) as { nonDanceTitles?: string[] } | undefined;
      return !!pr?.nonDanceTitles?.some((t) => normTitle(t) === normTitle(title));
    },
  };
  const byRhythm: Record<DanceRhythm, TandaCandidate[]> = { tango: [], vals: [], milonga: [] };
  for (const r of ["tango", "vals", "milonga"] as DanceRhythm[]) {
    const pool = cat
      .filter({
        eras: o.eras,
        rhythms: [r],
        includeOrchestras: o.includeOrchestras,
        excludeOrchestras: [...(o.excludeOrchestras ?? []), "guitarras-solo-singer", "orquesta-unspecified"],
        onlySelection: o.onlySelection,
        requireSpotify: o.requireSpotify,
        minTier:
          o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
      })
      .filter((s) => normTitle(s.title) !== "la cumparsita" || !o.closeWithCumparsita);
    byRhythm[r] = families(
      pool,
      o.maxYearSpread,
      o.mixVocalInstrumental || (r !== "tango" && !!rules.mixedMilongaVals),
    );
  }
  const ctx: BuildContext = {
    recentOrchestras: [],
    recentSingers: [],
    usedTitles: new Set(),
    usedSongIds: new Set(),
  };
  const lockedByIndex = new Map((extras.locked ?? []).filter((t) => t.locked).map((t) => [t.index, t]));
  for (const t of lockedByIndex.values())
    for (const s of t.songs) {
      ctx.usedSongIds.add(s.id);
      ctx.usedTitles.add(normTitle(s.title));
    }
  const tandas: Tanda[] = [];
  const last = slots.length - 1;
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
      if (prefO.length) tanda = buildTanda(slot, prefO, o, rng, ctx, sc);
    }
    if (!tanda && slot.index === last) {
      // última tanda: always tango; the night rule decides who closes
      const rule = rules.ultimaRule ?? "emotional-vocal";
      const ult = {
        ...slot,
        rhythm: "tango" as DanceRhythm,
        size: o.tangoTandaSize,
        targetEnergy:
          rule === "d-arienzo-rhythmic"
            ? Math.max(76, slot.targetEnergy + 10)
            : Math.max(62, slot.targetEnergy + 8),
      };
      const pref =
        rule === "any"
          ? byRhythm.tango
          : rule === "pugliese"
            ? byRhythm.tango.filter((c) => c.orchestraId === "osvaldo-pugliese")
            : rule === "d-arienzo-rhythmic"
              ? byRhythm.tango.filter((c) => c.orchestraId === "juan-d-arienzo")
              : byRhythm.tango.filter(
                  (c) =>
                    ULTIMA_PREF.includes(c.orchestraId) &&
                    (c.vocal ||
                      c.orchestraId === "osvaldo-pugliese" ||
                      c.orchestraId === "juan-d-arienzo" ||
                      c.orchestraId === "carlos-di-sarli"),
                );
      tanda =
        buildTanda(ult, pref.length ? pref : byRhythm.tango, o, rng, ctx, { ...sc, notBefore: () => 0 }) ??
        buildTanda(ult, byRhythm.tango, o, rng, ctx, { ...sc, notBefore: () => 0 });
    }
    if (!tanda) tanda = buildTanda(slot, byRhythm[slot.rhythm], o, rng, ctx, sc);
    if (!tanda && slot.rhythm !== "tango")
      tanda = buildTanda(
        { ...slot, rhythm: "tango", size: o.tangoTandaSize },
        byRhythm.tango,
        o,
        rng,
        ctx,
        sc,
      );
    if (!tanda) {
      // long nights exhaust the caps: relax per-night limits and phase filters rather than leave a hole in the set
      const relaxed: Scoring = {
        ...sc,
        maxPerNight: () => 99,
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
    ctx.recentOrchestras.unshift(tanda.orchestraId);
    if (tanda.singer) ctx.recentSingers.unshift(tanda.singer);
    for (const s of tanda.songs) {
      ctx.usedSongIds.add(s.id);
      ctx.usedTitles.add(normTitle(s.title));
    }
  }
  // cortinas: one family per night by default, each cue ~8 points under the NEXT tanda
  const pool = cortinaPool(deps.cortinas, o.overrides?.cortinas);
  const used = new Set<string>();
  const plan = planCortinas(pool, o, rng, tandas[1]?.energy ?? 60);
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
      pick.t.note = "Vals de cumpleaños";
      pick.t.reason = `${pick.t.reason ?? ""} · reserved for the birthday vals`.trim();
    }
  }
  tandas.forEach((t, i) => {
    const next = tandas[i + 1];
    if (!next) {
      t.cortina =
        rules.cortinaBeforeCumparsita && o.closeWithCumparsita
          ? pickCortina(pool, t.energy, o, rng, used, plan)
          : null;
      return;
    }
    const c = pickCortina(pool, next.energy, o, rng, used, plan);
    t.cortina = c ? { ...c, lengthSec: o.cortinaLengthSec } : null;
    if (c) used.add(c.id);
  });
  // land on the requested length: absorb drift in cortina lengths (25–60 s), then drop the penultimate tanda if still long
  const fit = () => {
    const target = o.hours * 3600 - (o.closeWithCumparsita ? 180 : 0);
    const withC = tandas.filter((t) => t.cortina);
    const total = () => tandas.reduce((a, t) => a + t.durationSec + (t.cortina?.lengthSec ?? 0), 0);
    let diff = target - total();
    if (withC.length && Math.abs(diff) > 60) {
      const per = Math.max(-20, Math.min(15, Math.round(diff / withC.length)));
      for (const t of withC)
        t.cortina = {
          ...t.cortina!,
          lengthSec: Math.max(25, Math.min(60, (t.cortina!.lengthSec ?? 45) + per)),
        };
      diff = target - total();
    }
    if (diff < -360 && tandas.length > 4) {
      const i = tandas.length - 2;
      const removed = tandas.splice(i, 1)[0]!;
      if (tandas[i - 1] && removed.cortina)
        tandas[i - 1]!.cortina = tandas[i - 1]!.cortina ?? removed.cortina;
    }
  };
  fit();
  // La Cumparsita: preferred orchestras, varied by seed, never the última tanda's orchestra
  let closing: Song | null = null;
  if (o.closeWithCumparsita) {
    const lastOrch = tandas[tandas.length - 1]?.orchestraId;
    const cands = cat.songs.filter(
      (s) =>
        normTitle(s.title) === "la cumparsita" &&
        s.rhythm === "tango" &&
        s.orchestraId !== lastOrch &&
        (o.eras.includes("all") || s.era.startsWith("golden") || s.era === "post-golden"),
    );
    closing =
      rng.weighted(cands, (s) => {
        const i = CUMPARSITA_PREF.indexOf(s.orchestraId);
        const corpus = cat.fame.get(`la cumparsita|${s.orchestraId}`);
        const yearHit = (cat.corpus.famousRecordings ?? []).some(
          (f) => f.role === "cumparsita" && f.orchestraId === s.orchestraId && f.year === s.year,
        );
        const used = (corpus?.role === "cumparsita" ? 1 + (corpus.fame ?? 0) : 0.4) * (yearHit ? 2.5 : 1); // versions and years DJs actually close with
        return (i === -1 ? 0.05 : 1.6 - i * 0.2) * (s.selection ? 1.3 : 1) * used;
      }) ??
      cands[0] ??
      null;
  }
  // Buenos Aires style: the última tanda ends with its own orchestra's Cumparsita, then the standalone closing version
  if (o.closeWithCumparsita && rules.cumparsitaCount === 2) {
    const ult = tandas[tandas.length - 1];
    const own = ult
      ? cat.songs.find(
          (s) =>
            normTitle(s.title) === "la cumparsita" &&
            s.orchestraId === ult.orchestraId &&
            s.rhythm === "tango",
        )
      : undefined;
    if (ult && own && !ult.songs.some((s) => s.id === own.id)) {
      ult.songs = [...ult.songs, own];
      ult.energyCurve = ult.songs.map((s) => s.energy ?? 50);
      ult.durationSec += own.durationSec ?? 180;
      ult.note = `${ult.note ? `${ult.note} · ` : ""}ends with its own La Cumparsita`;
    }
  }
  let opening: Song | null = null;
  if (rules.openWithCumparsita) {
    const cands = cat.songs.filter(
      (s) =>
        normTitle(s.title) === "la cumparsita" &&
        s.rhythm === "tango" &&
        s.id !== closing?.id &&
        s.orchestraId !== tandas[0]?.orchestraId &&
        (s.era.startsWith("golden") || s.era === "post-golden" || o.eras.includes("all")),
    );
    opening =
      rng.weighted(
        cands,
        (s) => (CUMPARSITA_PREF.includes(s.orchestraId) ? 1.5 : 0.3) * (1 + (s.fame ?? 0) * 0.3),
      ) ?? null;
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
    name: o.name ?? `${o.hours}h ${o.eras.join("+")} milonga`,
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
  return playlist;
}

export function computeStats(tandas: Tanda[], closing: Song | null, o: ComposeOptions): PlaylistStats {
  const byRhythm: Record<DanceRhythm, number> = { tango: 0, vals: 0, milonga: 0 };
  const orchestras: Record<string, number> = {};
  let dur = 0,
    tracks = 0,
    vocal = 0;
  for (const t of tandas) {
    byRhythm[t.rhythm]++;
    orchestras[t.orchestra] = (orchestras[t.orchestra] ?? 0) + 1;
    dur += t.durationSec + (t.cortina ? (t.cortina.lengthSec ?? o.cortinaLengthSec) : 0);
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
  };
}

/** Re-roll one tanda (keeps everything else). */
export function swapTanda(p: Playlist, index: number, deps: ComposeDeps, seed = Date.now()): Playlist {
  const o = p.options;
  const rng = makeRng(seed);
  const cat = deps.catalog;
  const t = p.tandas[index];
  if (!t) return p;
  const pool = cat.filter({
    eras: o.eras,
    rhythms: [t.rhythm],
    includeOrchestras: o.includeOrchestras,
    excludeOrchestras: o.excludeOrchestras,
    onlySelection: o.onlySelection,
    requireSpotify: o.requireSpotify,
    minTier: 2,
  });
  const neighbours = p.tandas
    .map((x, i) => ({ x, d: Math.abs(i - index) }))
    .filter((n) => n.d > 0 && n.d <= Math.max(o.orchestraRepeatGap, o.singerRepeatGap))
    .sort((a, b) => a.d - b.d);
  const ctx: BuildContext = {
    recentOrchestras: neighbours.map((n) => n.x.orchestraId),
    recentSingers: neighbours.map((n) => n.x.singer).filter((x): x is string => !!x),
    usedTitles: new Set(
      p.tandas.flatMap((x, i) => (i === index ? [] : x.songs.map((s) => normTitle(s.title)))),
    ),
    usedSongIds: new Set(p.tandas.flatMap((x, i) => (i === index ? [] : x.songs.map((s) => s.id)))),
  };
  const slot = {
    index,
    rhythm: t.rhythm,
    size: t.songs.length,
    targetEnergy: t.targetEnergy,
    phase: t.phase,
    position: index / Math.max(1, p.tandas.length - 1),
  };
  const sc: Scoring = {
    energy: (id) => cat.profile(id)?.energy ?? 50,
    phase: (id) => cat.profile(id)?.phase,
    tier: (id) => cat.profile(id)?.tier ?? 3,
    notBefore: (id) => cat.profile(id)?.notBefore ?? 0,
    style: (id) => cat.profile(id)?.style,
    isDanceable: (s) => isDanceable(s.title, s.rhythm, cat.blacklist),
  };
  const fams = families(pool, o.maxYearSpread, o.mixVocalInstrumental).filter(
    (c) => c.orchestraId !== t.orchestraId,
  );
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
  const tandas = p.tandas.map((x, i) => (i === index ? nt : x));
  const np = { ...p, tandas, stats: computeStats(tandas, p.closing, o) };
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
  const used = new Set(p.tandas.flatMap((x) => x.songs.map((s) => normTitle(s.title))));
  const cands = (deps.catalog.byOrchestra.get(t.orchestraId) ?? []).filter(
    (s) =>
      s.rhythm === t.rhythm &&
      (s.singerId ?? null) === (cur.singerId ?? null) &&
      s.year &&
      t.yearRange &&
      s.year >= t.yearRange[0] - 1 &&
      s.year <= t.yearRange[1] + 1 &&
      !used.has(normTitle(s.title)) &&
      isDanceable(s.title, s.rhythm, deps.catalog.blacklist),
  );
  const pick = rng.weighted(
    cands,
    (s) =>
      Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - (cur.energy ?? 50)) / 25) * (1 + (s.fame ?? 0) * 0.4),
  );
  if (!pick) return p;
  const songs = t.songs.map((s, i) => (i === trackIndex ? pick : s));
  const years = songs.map((s) => s.year).filter((y): y is number => !!y);
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
  const np = { ...p, tandas, stats: computeStats(tandas, p.closing, p.options) };
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
        out.context = { ...out.context, mood: out.context?.mood ?? "nostalgic" };
        break;
      case "more-instrumental":
        out.excludeOrchestras = o.excludeOrchestras;
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
