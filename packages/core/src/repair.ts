import { tandaCohesion } from "./audio/compat";
import { attachBooth } from "./booth";
import type { Catalog } from "./catalog";
import { type ComposeDeps, computeStats, familyBreaks, makeScoring } from "./compose";
import { candidatesFor, cortinaPool, cortinaTempo, familyOf } from "./cortinas";
import { isDanceableSong, normTitle } from "./energy";
import { familyBand, goldenClassOf, isColour, isGoldenNight } from "./knowledge";
import { heatOfSides, orderCost, strictOrder } from "./order";
import { CORPUS_CAPS, DEFAULT_CAP, NEVER_OPEN, OPENERS } from "./rules";
import { scorePlaylist } from "./score";
import {
  cueHasAudio,
  cueMoody,
  hourBuckets,
  isPeakSlot,
  lineupPeriod,
  MUST_HAVE,
  mustHaveOf,
  mustHavesOf,
  type StrictResult,
  streamable,
  strictChecks,
} from "./strict";
import { families, isSuspectSide, isTandaEligible, songRhythm, type TandaCandidate } from "./tanda";
import { nightTransitions, styleClass } from "./transitions";
import type { ComposeOptions, Cortina, DanceRhythm, Playlist, Song, Tanda } from "./types";

/**
 * Round 14 — the strict-panel repair (docs/specs/round14-engine.md §3). A deterministic, greedy search over local
 * edits that drives the strict panel's penalty (blockers × 10 + should-fix) down: reorder a tanda's sides, rebuild a
 * tanda from its own family's best sides, give a chair to another family the composer would accept there, swap two
 * tandas of the same rhythm, re-pick the cortinas, re-pick the closer. An edit is kept only when the penalty falls
 * (ties broken by the engine score); compose() runs it on every golden night and improveNight() offers its edits as
 * the "strict" fixer, whose acceptance rule is the composer's own: no new violation.
 */

export interface RepairOptions {
  /** the composer's own families per rhythm (compose passes them; improveNight builds them once per night) */
  fams?: Partial<Record<DanceRhythm, TandaCandidate[]>>;
  /** greedy rounds (default 30) */
  maxSteps?: number;
  /** never accept an edit that lowers the engine score (improveNight's contract) */
  keepScore?: boolean;
  /** never accept an edit that lowers the benchmark total (improveNight's contract) */
  bench?: (p: Playlist) => number;
}
export interface RepairEdit {
  kind: "reorder" | "reside" | "replace" | "swap" | "cues" | "closer" | "replan";
  tanda: number;
  text: string;
  playlist: Playlist;
}

const isCump = (s: Song) => /cumparsita/i.test(s.title);
const fame = (s: Song) => s.fame ?? 0;
const surname = (s: string | null | undefined) =>
  normTitle(s ?? "")
    .split(" ")
    .pop() ?? "";
const tName = (t: Pick<Tanda, "orchestra" | "singer" | "vocal">) =>
  `${t.orchestra}${t.vocal && t.singer ? ` / ${t.singer}` : t.vocal ? "" : " instrumental"}`;
const yearsStr = (songs: Song[]) => {
  const ys = songs.map((s) => s.year ?? 0).filter(Boolean);
  if (!ys.length) return "";
  const a = Math.min(...ys),
    b = Math.max(...ys);
  return a === b ? `${a}` : `${a}–${String(b).slice(-2)}`;
};
const sizeOf = (o: ComposeOptions, r: DanceRhythm) =>
  r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;

/** a tanda with its derived fields recomputed from its sides */
let AVG_TRACK: number | undefined;
function retanda(
  t: Tanda,
  songs: Song[],
  slot: Pick<Tanda, "index" | "targetEnergy" | "phase" | "peak">,
  note?: string,
): Tanda {
  const dance = songs.filter((s) => !isCump(s));
  const ys = dance.map((s) => s.year).filter((y): y is number => !!y);
  const curve = songs.map((s) => s.energy ?? 50);
  const heat = heatOfSides(songs);
  const coh = tandaCohesion(
    songs.map((x) => x.audio),
    t.rhythm,
  );
  const out: Tanda = {
    ...t,
    index: slot.index,
    targetEnergy: slot.targetEnergy,
    phase: slot.phase,
    songs,
    yearRange: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
    energy: Math.round(curve.reduce((a, b) => a + b, 0) / Math.max(1, curve.length)),
    energyCurve: curve,
    // (a night planned on avgTrackSec keeps that convention, as buildTanda does)
    durationSec: AVG_TRACK ? songs.length * AVG_TRACK : songs.reduce((a, s) => a + (s.durationSec ?? 170), 0),
    cohesion: coh.known > 0 ? coh.score : undefined,
  };
  if (slot.peak) out.peak = true;
  else delete out.peak;
  if (heat) out.heat = heat;
  else delete out.heat;
  if (note) out.reason = `${(t.reason ?? "").replace(/ · strict panel:.*$/, "")} · strict panel: ${note}`;
  return out;
}

/** the night's families per rhythm, as the composer builds them (memoised per catalogue and options) */
const famMemo = new WeakMap<Catalog, Map<string, TandaCandidate[]>>();
export function nightFamilies(cat: Catalog, o: ComposeOptions, r: DanceRhythm): TandaCandidate[] {
  const key = JSON.stringify([
    r,
    o.eras,
    o.yearRange,
    o.includeOrchestras,
    o.excludeOrchestras,
    o.onlySelection,
    o.requireSpotify,
    o.maxYearSpread,
    o.mixVocalInstrumental,
    o.rules?.mixedMilongaVals,
    o.rules?.allowUndated,
    sizeOf(o, r),
  ]);
  let m = famMemo.get(cat);
  if (!m) {
    m = new Map();
    famMemo.set(cat, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const rules = o.rules ?? {};
  const pool = cat
    .filter({
      eras: o.eras,
      rhythms: [r],
      includeOrchestras: o.includeOrchestras,
      excludeOrchestras: [...(o.excludeOrchestras ?? []), "guitarras-solo-singer", "orquesta-unspecified"],
      onlySelection: o.onlySelection,
      requireSpotify: o.requireSpotify,
      yearRange: o.yearRange,
      minTier: o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
    })
    .filter((s) => normTitle(s.title) !== "la cumparsita" && isTandaEligible(s, !!rules.allowUndated));
  const totals = new Map<string, number>();
  for (const [id, songs] of cat.byOrchestra)
    totals.set(
      id,
      songs.filter((s) => s.rhythm === "tango" || s.rhythm === "vals" || s.rhythm === "milonga").length,
    );
  const fams = families(
    pool,
    o.maxYearSpread,
    o.mixVocalInstrumental || (r !== "tango" && !!rules.mixedMilongaVals),
    totals,
    { rhythm: r, need: sizeOf(o, r), breaks: familyBreaks(cat) },
  );
  m.set(key, fams);
  return fams;
}

/** Find the strict panel's edits for a night and apply them greedily. Pure: `p` is not touched. */
export function strictRepair(
  p: Playlist,
  deps: ComposeDeps,
  opts: RepairOptions = {},
): { playlist: Playlist; edits: Array<Omit<RepairEdit, "playlist">> } {
  let cur = p;
  let curR = strictChecks(cur);
  const edits: Array<Omit<RepairEdit, "playlist">> = [];
  const maxSteps = opts.maxSteps ?? 40;
  const tried = new Set<string>();
  for (let step = 0; step < maxSteps && curR.violations.length; step++) {
    const r = bestEdit(cur, curR, deps, opts, tried);
    if (!r) break;
    edits.push({ kind: r.edit.kind, tanda: r.edit.tanda, text: r.edit.text });
    cur = r.edit.playlist;
    curR = r.res;
  }
  // tandas moved or replaced: the cues they now sit between are re-picked under the placement and panel rules
  const rc = recue(cur.tandas, deps, cur.options);
  if (rc) {
    const q = { ...cur, tandas: rc, stats: { ...cur.stats, ...computeStats(rc, cur.closing, cur.options) } };
    const r2 = strictChecks(q);
    if (r2.blockers <= curR.blockers && recueBetter(r2, curR) && cueFamilies(q) <= cueFamilies(cur)) {
      q.score = scorePlaylist(q);
      cur = q;
      edits.push({
        kind: "cues",
        tanda: -1,
        text: "Cortinas re-picked for the strict panel (artists, moods, tempo)",
      });
    }
  }
  return { playlist: cur, edits };
}

/** transitions hard rules (H1, H3, H4, H5, H6) and jarring boundaries: an edit never adds one */
const trOf = (q: Playlist) => {
  const r = nightTransitions(q.tandas);
  return { hard: 3 * (r.hard.H1 + r.hard.H6) + 2 * (r.hard.H3 + r.hard.H4) + r.hard.H5, jarring: r.jarring };
};
export const cueFamilies = (q: Pick<Playlist, "tandas">) =>
  new Set(q.tandas.filter((t) => t.cortina).map((t) => familyOf(t.cortina!))).size;

const countOf = (r: StrictResult, key: string) => r.violations.filter((v) => v.rule === key).length;
const worse = (a: StrictResult, b: StrictResult, key: string) => countOf(a, key) > countOf(b, key);
/** a cue re-pick is kept when it mends the placement rules (rounds 10–11) or, those equal, the panel's penalty */
export const recueBetter = (a: StrictResult, b: StrictResult) =>
  countOf(a, "cuePlace") < countOf(b, "cuePlace") ||
  (countOf(a, "cuePlace") === countOf(b, "cuePlace") && a.penalty < b.penalty);
/** an edit never breaks a rule more often than before (the composer's rule set holds for every edit) */
const PARETO = new Set(["gap", "darienzoPeak", "colourPeak", "range", "dated", "rhythm", "closer", "canon"]);
const anyWorse = (a: StrictResult, b: StrictResult) => [...PARETO].some((k) => worse(a, b, k));

/** the best single edit for a night (the penalty first, the engine score as the trade-off), or null */
export function bestEdit(
  cur: Playlist,
  curR: StrictResult,
  deps: ComposeDeps,
  opts: RepairOptions,
  tried = new Set<string>(),
): { edit: RepairEdit; res: StrictResult } | null {
  const gen = editsFor(cur, curR, deps, opts);
  let best: { edit: RepairEdit; res: StrictResult; j: number } | null = null;
  const curScore = cur.score.total;
  const curBench = opts.bench ? opts.bench(cur) : 0;
  const curTr = trOf(cur);
  const curFam = cueFamilies(cur);
  // the panel's penalty (×3) with the transitions folded in (H1 and H6 3 each; H3, H4, H5 and a jarring boundary 1
  // each): an edit may trade an energy jump for a panel item, never a strict blocker for anything
  const curP = 3 * curR.penalty + curTr.hard + curTr.jarring;
  // the composer's night-level rules an edit never makes worse: the vocal band (and an explicit "more instrumental"),
  // H1/H5/H6 and the H3 allowance (two a night), the golden-core share (≥ 75 %), the long-night sawtooth
  const o = cur.options;
  const vocalOf = (q: Playlist) => {
    const tg = q.tandas.filter((t) => t.rhythm === "tango");
    return tg.length ? tg.filter((t) => t.vocal).length / tg.length : 0;
  };
  const band = o.rules?.vocalShare ?? (isGoldenNight(o) ? ([0.55, 0.75] as [number, number]) : undefined);
  const curV = vocalOf(cur);
  const hardOf = (q: Playlist) => nightTransitions(q.tandas).hard;
  const curH = hardOf(cur);
  const coreOf = (q: Playlist) =>
    q.tandas.filter((t) => t.golden === "core" && !isColour(deps.catalog.profile(t.orchestraId))).length /
    Math.max(1, q.tandas.length);
  const curCore = coreOf(cur);
  const edgeOf = (q: Playlist) =>
    q.tandas.filter((t) => t.golden === "edge" && !isColour(deps.catalog.profile(t.orchestraId))).length;
  const curEdge = edgeOf(cur);
  const saw = (q: Playlist) => {
    let k = 0;
    const es = q.tandas.map((t) => t.energy);
    for (let i = 1; i < es.length - 1; i++) {
      const a = es[i]! - es[i - 1]!,
        b = es[i + 1]! - es[i]!;
      if (a * b < 0 && Math.abs(a) > 10 && Math.abs(b) > 10 && !q.tandas[i]!.peak) k++;
    }
    return k;
  };
  const curSaw = o.hours >= 5 ? saw(cur) : 0;
  const guards = (q: Playlist) => {
    const v = vocalOf(q);
    if (
      band &&
      Math.abs(o.vocalBias ?? 0) < 0.2 &&
      (v > band[1] + 1e-9 || v < band[0] - 1e-9) &&
      Math.abs(v - (band[0] + band[1]) / 2) > Math.abs(curV - (band[0] + band[1]) / 2)
    )
      return false;
    if ((o.vocalBias ?? 0) < 0 && v > curV + 1e-9) return false;
    if ((o.vocalBias ?? 0) > 0 && v < curV - 1e-9) return false;
    // golden-age R1: at most three edge tandas; a planned peak keeps delivering target − 4
    const edge = edgeOf(q);
    if (edge > curEdge && edge > 3) return false;
    for (let i = 0; i < q.tandas.length; i++) {
      const a = cur.tandas[i],
        b = q.tandas[i]!;
      if (b.peak && a && a.energy >= a.targetEnergy - 4 && b.energy < b.targetEnergy - 4) return false;
    }
    const h = hardOf(q);
    if (h.H1 > curH.H1 || h.H5 > curH.H5 || h.H6 > curH.H6 || (h.H3 > curH.H3 && h.H3 > 1)) return false;
    const core = coreOf(q);
    if (isGoldenNight(o) && core < curCore - 1e-9 && core < 0.75) return false;
    return !(o.hours >= 5 && saw(q) > curSaw);
  };
  for (const phase of gen) {
    for (const e of phase()) {
      const key = `${e.kind}|${e.tanda}|${e.text}`;
      if (tried.has(key)) continue;
      const res = strictChecks(e.playlist);
      if (res.blockers > curR.blockers || res.penalty >= curR.penalty || anyWorse(res, curR)) {
        tried.add(key);
        continue;
      }
      // a fixer never removes a must-have family (DJ B4) and never breaks the colour budget for another rule
      if (
        mustHavesOf(e.playlist.tandas).size < mustHavesOf(cur.tandas).size ||
        worse(res, curR, "colourBudget")
      )
        continue;
      if (!guards(e.playlist)) continue;
      if (Number.isNaN(e.playlist.score.total)) e.playlist.score = scorePlaylist(e.playlist);
      if (opts.keepScore && e.playlist.score.total < curScore) continue;
      if (opts.bench && opts.bench(e.playlist) < curBench) continue;
      const tr = trOf(e.playlist);
      const P = 3 * res.penalty + tr.hard + tr.jarring;
      if (P >= curP) continue;
      if (cueFamilies(e.playlist) > curFam) continue;
      // a blocker is worth any score; a point of the folded penalty is worth an engine point
      const j = (curR.blockers - res.blockers) * 100 + (curP - P) + (e.playlist.score.total - curScore);
      if (!best || j > best.j) best = { edit: e, res, j };
    }
    // a cheap phase whose best edit costs no score wins over the costlier phases
    if (best && best.edit.playlist.score.total >= curScore - 1) break;
  }
  return best ? { edit: best.edit, res: best.res } : null;
}

/** The candidate edits, in phases from the cheapest (reorder, cues, closer) to the costliest (replace, swap). */
export function editsFor(
  cur: Playlist,
  curR: StrictResult,
  deps: ComposeDeps,
  opts: RepairOptions,
): Array<() => RepairEdit[]> {
  const cat = deps.catalog;
  const o = cur.options;
  AVG_TRACK = o.avgTrackSec;
  const n = cur.tandas.length;
  const last = n - 1;
  const golden = isGoldenNight(o);
  const sc0 = makeScoring(cat, o, deps.contextModel);
  const seedJ = (o.seed ?? 0) >>> 0;
  const jitter = (id: string) => {
    let h = seedJ ^ 0x9e3779b9;
    for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 0x01000193) >>> 0;
    return ((h % 1000) / 1000) * 2.5;
  };
  // the score is computed lazily (bestEdit scores only the edits the panel accepts)
  const finalize = (tandas: Tanda[], closing = cur.closing): Playlist => {
    const stats = { ...cur.stats, ...computeStats(tandas, closing, o) };
    return { ...cur, tandas, closing, stats, score: { total: Number.NaN, factors: [], verdict: "" } };
  };
  const famsOf = (r: DanceRhythm) => opts.fams?.[r] ?? nightFamilies(cat, o, r);
  const bad = new Map<number, Set<string>>();
  for (const v of curR.violations)
    if (v.tanda >= 0 && v.tanda < n) bad.set(v.tanda, new Set([...(bad.get(v.tanda) ?? []), v.rule]));
  const ruleSet = new Set(curR.violations.map((v) => v.rule));
  const CUE = ["cueRisk", "cueArtist", "cueSlowPeak", "cueDramatic", "cueVals", "cuePlace", "cueAudio"];
  const STRUCT = [
    "colourPeak",
    "colourBudget",
    "hotSlot",
    "dramaticAfterSummit",
    "pugliesePlace",
    "rhythmicRun",
    "darienzoPeak",
    "rotation",
    "singerOnce",
    "instrHour",
    "wedge",
    "valley",
    "peakRun",
    "gap",
    "peakHits",
    "range",
    "dated",
    "rhythm",
    "fame0",
    "fameMean",
    "stream",
    "lastFour",
    "opener",
    "suspectCredit",
  ];
  const badTandas = [...bad.keys()].filter((i) => [...bad.get(i)!].some((k) => !CUE.includes(k)));
  // night-level rules point at their tandas: the last four (lastFour), the colour tandas (budget)
  if (ruleSet.has("lastFour")) for (let i = Math.max(0, last - 4); i < last; i++) badTandas.push(i);
  if (ruleSet.has("canon")) for (let i = 0; i < n; i++) if (!mustHaveOf(cur.tandas[i]!)) badTandas.push(i);
  // run and hour rules point at every tanda that could change them
  const hb = hourBuckets(cur);
  for (const v of curR.violations) {
    if (v.rule === "instrHour") {
      const b = hb.find((x) => x.includes(v.tanda)) ?? [];
      for (const i of b) if (cur.tandas[i]!.rhythm === "tango") badTandas.push(i);
      for (let i = Math.max(0, v.tanda - 6); i <= v.tanda; i++)
        if (cur.tandas[i]?.rhythm === "tango") badTandas.push(i);
    }
    if (v.rule === "rhythmicRun" || v.rule === "valley")
      for (let i = Math.max(0, v.tanda - 5); i <= v.tanda; i++) badTandas.push(i);
    if (v.rule === "colourBudget")
      cur.tandas.forEach((t, i) => {
        if (isColour(cat.profile(t.orchestraId))) badTandas.push(i);
      });
  }
  const firstDAIdx = cur.tandas.findIndex((t) => t.orchestraId === "juan-d-arienzo" && t.rhythm === "tango");
  const earlyDA =
    firstDAIdx >= 0 && firstDAIdx / Math.max(1, n - 1) < 0.35 && !cur.tandas[firstDAIdx]!.vocal
      ? firstDAIdx
      : -1;
  const targets = [...new Set(badTandas)].filter(
    (i) => i >= 0 && i < n && !cur.tandas[i]!.locked && !cur.tandas[i]!.birthday && i !== earlyDA,
  );

  // --- side choice ------------------------------------------------------------------------------------------
  // the night's titles, counted once; a chair's own titles are subtracted when it is rebuilt
  const titleCount = new Map<string, number>();
  const addT = (t: string) => titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
  for (const t of cur.tandas) for (const x of t.songs) addT(normTitle(x.title));
  if (cur.closing) addT(normTitle(cur.closing.title));
  if (cur.opening) addT(normTitle(cur.opening.title));
  const usedMemo = new Map<number, { has: (k: string) => boolean }>();
  const usedTitles = (except: number) => {
    const hit = usedMemo.get(except);
    if (hit) return hit;
    const own = new Map<string, number>();
    for (const x of cur.tandas[except]?.songs ?? []) {
      const k = normTitle(x.title);
      own.set(k, (own.get(k) ?? 0) + 1);
    }
    const u = { has: (k: string) => (titleCount.get(k) ?? 0) - (own.get(k) ?? 0) > 0 };
    usedMemo.set(except, u);
    return u;
  };
  const sideMemo = new Map<string, boolean>();
  const sideOkM = (s: Song, rhythm: DanceRhythm) => {
    const k = `${s.id}|${rhythm}`;
    let v = sideMemo.get(k);
    if (v === undefined) {
      v = sideOk(s, rhythm);
      sideMemo.set(k, v);
    }
    return v;
  };
  const yr = o.yearRange;
  const sideOk = (s: Song, rhythm: DanceRhythm) =>
    isTandaEligible(s, !!o.rules?.allowUndated) &&
    songRhythm(s) === rhythm &&
    !isCump(s) &&
    !isSuspectSide(s) &&
    !s.reissue &&
    s.heat !== 0 &&
    (s.heat !== 1 || fame(s) >= 2) &&
    (!yr || (!!s.year && s.year >= yr[0] && s.year <= yr[1])) &&
    isDanceableSong(s, cat.blacklist) &&
    !cat.nonDance(s.orchestraId, s.title, s.year);
  /** the best `need` sides of a family for a slot, under the panel's per-tanda rules, from its tightest window */
  const bestSides = (
    c: TandaCandidate,
    i: number,
    rhythm: DanceRhythm,
    need: number,
    slot: Pick<Tanda, "targetEnergy" | "phase" | "peak">,
  ): Song[] | null => {
    const used = usedTitles(i);
    const seen = new Map<string, Song>();
    const p = cat.profile(c.orchestraId);
    // DJ S2: a D'Arienzo peak chair takes Echagüe 1938–39 or instrumentals 1937–40 only
    const daPeak = !!slot.peak && c.orchestraId === "juan-d-arienzo" && rhythm === "tango";
    const [ylo, yhi] = daPeak ? (c.vocal ? [1938, 1939] : [1937, 1940]) : [0, 9999];
    // DJ S3: a D'Arienzo instrumental tango tanda never shares a line-up period with another one tonight
    const daOther =
      c.orchestraId === "juan-d-arienzo" && rhythm === "tango" && !c.vocal
        ? new Set(
            cur.tandas
              .filter(
                (x, j) => j !== i && x.orchestraId === "juan-d-arienzo" && x.rhythm === "tango" && !x.vocal,
              )
              .map((x) => lineupPeriod(x.orchestraId, false, x.songs)),
          )
        : null;
    const firstDA =
      c.orchestraId === "juan-d-arienzo" &&
      rhythm === "tango" &&
      !c.vocal &&
      !slot.peak &&
      !cur.tandas.some((x, j) => j < i && x.orchestraId === "juan-d-arienzo" && x.rhythm === "tango");
    // cohesion R9 / round 8: the same orchestra, singer and rhythm never comes back from years it already played
    const sameFam = cur.tandas
      .filter(
        (x, j) =>
          j !== i &&
          x.orchestraId === c.orchestraId &&
          x.rhythm === rhythm &&
          (x.singer ?? "") === (c.singer ?? "") &&
          x.yearRange,
      )
      .map((x) => x.yearRange!);
    const overlaps = (lo: number, hi: number) => sameFam.some((r) => lo <= r[1] && r[0] <= hi);
    for (const s of c.songs) {
      if (!sideOkM(s, rhythm) || used.has(normTitle(s.title))) continue;
      if ((s.year ?? 0) < ylo || (s.year ?? 0) > yhi) continue;
      if (overlaps(s.year ?? 0, s.year ?? 0)) continue;
      // (round 11: the first D'Arienzo leaves El flete, El internado, Hotel Victoria to the summit chair)
      if (firstDA && fame(s) >= 4 && (s.energy ?? 50) >= 85) continue;
      if (daOther?.has(lineupPeriod(c.orchestraId, false, [s]))) continue;
      if (golden && p?.goldenBands && goldenClassOf(p, [s.year ?? 0]) === "other") continue;
      const k = normTitle(s.title);
      const prev = seen.get(k);
      if (!prev || fame(s) + (streamable(s) ? 0.5 : 0) > fame(prev) + (streamable(prev) ? 0.5 : 0))
        seen.set(k, s);
    }
    const pool = [...seen.values()];
    if (pool.length < need) return null;
    const hot = isPeakSlot(slot) || i >= n - 6;
    const noUnstream = i === 0 || i === last || i === last - 1 || !!slot.peak;
    const w = (s: Song) =>
      fame(s) * 3 +
      (streamable(s) ? 2.5 : 0) -
      Math.abs((s.energy ?? 50) - slot.targetEnergy) / 4 +
      (s.heat === 4 ? 0.5 : 0) +
      (familyBand(p, c.singer, s.year) === "best" ? 0.6 : 0) +
      (s.suspectCredit ? -3 : 0) +
      // a seeded tie-break so twelve nights do not rebuild the same four sides (round 8: the first D'Arienzo varies)
      jitter(s.id);
    const pick = (xs: Song[]) => {
      const ranked = xs.slice().sort((a, b) => w(b) - w(a) || a.id.localeCompare(b.id));
      const out: Song[] = [];
      let zero = 0,
        unst = 0;
      for (const s of ranked) {
        if (out.length >= need) break;
        if (fame(s) === 0 && zero >= 1) continue;
        if (!streamable(s) && unst >= (noUnstream ? 0 : 1)) continue;
        out.push(s);
        if (fame(s) === 0) zero++;
        if (!streamable(s)) unst++;
      }
      // the constraints could not all be met: the best by weight
      return out.length >= need ? out : ranked.slice(0, need);
    };
    const orderOk = (xs: Song[]) => 45 - 4 * Math.min(14, orderCost(xs, isPeakSlot(slot)));
    // a planned peak delivers its energy (target − 4)
    const peakE = (xs: Song[]) => {
      if (!slot.peak) return 0;
      const e = xs.reduce((a, s) => a + (s.energy ?? 50), 0) / xs.length;
      return e >= slot.targetEnergy - 4 ? 15 : -(slot.targetEnergy - 4 - e) * 3;
    };
    const quality = (xs: Song[]) => {
      const mf = xs.reduce((a, s) => a + fame(s), 0) / xs.length;
      const ok = mf >= (hot ? 3 : 2.5) && xs.filter((s) => fame(s) === 0).length <= 1;
      const hits = xs.filter((s) => fame(s) >= 4).length;
      const ys = xs.map((s) => s.year ?? 0);
      return (
        (overlaps(Math.min(...ys), Math.max(...ys)) ? -200 : 0) +
        (ok ? 100 : 0) +
        (slot.peak && hits >= 2 ? 30 : 0) +
        orderOk(xs) +
        peakE(xs) +
        xs.reduce((a, s) => a + w(s), 0) -
        (Math.max(...ys) - Math.min(...ys)) * 6
      );
    };
    let best = pick(pool);
    let bq = quality(best);
    const ys = [...new Set(pool.map((s) => s.year!))];
    for (const y of ys) {
      const sub = pool.filter((s) => s.year! >= y && s.year! <= y + 1);
      if (sub.length < need) continue;
      const cand = pick(sub);
      const q = quality(cand);
      if (q > bq) {
        best = cand;
        bq = q;
      }
    }
    return strictOrder(best, isPeakSlot(slot));
  };
  const asTanda = (c: TandaCandidate, i: number, songs: Song[], why: string): Tanda => {
    const old = cur.tandas[i]!;
    const p = cat.profile(c.orchestraId);
    const ys = songs.map((s) => s.year ?? 0).filter(Boolean);
    const base: Tanda = {
      ...old,
      orchestra: c.orchestra,
      orchestraId: c.orchestraId,
      singer: c.singer,
      vocal: c.vocal,
      style: p?.style ?? old.style,
      era: songs[0]?.era ?? old.era,
      golden: goldenClassOf(p, ys),
      band: undefined,
      crossesBreak: false,
      note: undefined,
      reason: `${old.phase}: ${p?.style ?? "balanced"} ${c.orchestra}${c.singer ? ` with ${c.singer}` : " instrumental"} ${yearsStr(songs)}, for target ${old.targetEnergy}`,
    };
    if (base.golden === undefined) delete base.golden;
    delete base.band;
    delete base.note;
    return retanda(base, songs, old, why);
  };

  // --- which families may take chair i (the composer's slot rules) -----------------------------------------
  const gap = o.orchestraRepeatGap ?? 6;
  const sgap = o.singerRepeatGap ?? 4;
  const hours = o.hours;
  const slotOk = (c: TandaCandidate, i: number, rhythm: DanceRhythm): boolean => {
    const t = cur.tandas[i]!;
    const p = cat.profile(c.orchestraId);
    const pos = i / Math.max(1, n - 1);
    const others = cur.tandas.filter((_x, j) => j !== i);
    for (let j = Math.max(0, i - gap + 1); j < Math.min(n, i + gap); j++)
      if (j !== i && cur.tandas[j]!.orchestraId === c.orchestraId) return false;
    if (c.vocal && c.singer)
      for (let j = Math.max(0, i - sgap); j <= Math.min(last, i + sgap); j++)
        if (j !== i && cur.tandas[j]!.vocal && surname(cur.tandas[j]!.singer) === surname(c.singer))
          return false;
    // DJ S4: one tango tanda per voice, never three appearances
    if (golden && c.vocal && c.singer) {
      const mine = others.filter((x) => x.vocal && surname(x.singer) === surname(c.singer));
      if (mine.length >= 2 || (rhythm === "tango" && mine.some((x) => x.rhythm === "tango"))) return false;
    }
    const same = others.filter((x) => x.orchestraId === c.orchestraId);
    // DJ S3: an orchestra's tango tandas differ in line-up period or mode
    if (golden && rhythm === "tango" && !c.vocal && same.some((x) => x.rhythm === "tango" && !x.vocal)) {
      const per = new Set(
        same
          .filter((x) => x.rhythm === "tango" && !x.vocal)
          .map((x) => lineupPeriod(x.orchestraId, false, x.songs)),
      );
      if (c.orchestraId !== "juan-d-arienzo" || per.has(lineupPeriod(c.orchestraId, false, c.songs)))
        return false;
    }
    // (DJ S5: two tango tandas in different modes or with different singers, plus one vals or milonga)
    const cap =
      c.orchestraId === "juan-d-arienzo"
        ? 4
        : c.orchestraId === "osvaldo-pugliese"
          ? 1
          : golden && hours < 5
            ? 3
            : (CORPUS_CAPS[c.orchestraId] ?? DEFAULT_CAP);
    if (same.length >= cap) return false;
    if (c.orchestraId === "juan-d-arienzo") {
      if (rhythm === "tango" && same.filter((x) => x.rhythm === "tango").length >= (hours >= 5 ? 4 : 3))
        return false;
    } else if (hours < 5 && rhythm === "tango" && golden) {
      const tg = same.filter((x) => x.rhythm === "tango");
      if (tg.length >= 2 || tg.some((x) => surname(x.singer) === surname(c.singer) && x.vocal === c.vocal))
        return false;
    } else if (hours < 5 && same.some((x) => x.rhythm === rhythm)) return false;
    if (c.orchestraId === "osvaldo-pugliese" && (pos < 0.5 || t.peak)) return false;
    if (
      i === 0 &&
      (NEVER_OPEN.has(c.orchestraId) || (o.rules?.openerRule === "canon" && !OPENERS[c.orchestraId]))
    )
      return false;
    if (
      i === last &&
      rhythm === "tango" &&
      ![
        "osvaldo-pugliese",
        "juan-d-arienzo",
        "angel-d-agostino",
        "carlos-di-sarli",
        "alfredo-de-angelis",
        "anibal-troilo",
        "ricardo-tanturi",
        "rodolfo-biagi",
        "miguel-calo",
      ].includes(c.orchestraId)
    )
      return false;
    if (i === last && p?.neverClose) return false;
    if (
      t.peak &&
      (p?.avoidMainPeak || !(p?.phase?.includes("peak") || p?.phase?.includes("any") || !p?.phase))
    )
      return false;
    // dancer R14-7b: a planned peak is a rhythmic orchestra
    if (golden && t.peak && rhythm === "tango" && p?.style !== "rhythmic") return false;
    if ((p?.notBefore ?? 0) > pos + 1e-9 && c.orchestraId !== "osvaldo-pugliese") return false;
    // the night's context (beginners: no dramatic orchestra, no family above the difficulty) and the follow rules
    if (sc0.avoidStyles?.includes(p?.style ?? "balanced")) return false;
    if (sc0.maxDifficulty !== undefined && (p?.difficulty ?? 0) > sc0.maxDifficulty) return false;
    const prevT = cur.tandas[i - 1],
      nextT = cur.tandas[i + 1];
    const fw = prevT ? cat.profile(prevT.orchestraId)?.followWith : undefined;
    if (fw?.length && rhythm === "tango" && !(fw.includes(p?.style ?? "balanced") || p?.style === "balanced"))
      return false;
    const myFw = p?.followWith;
    if (myFw?.length && nextT?.rhythm === "tango") {
      const ns = cat.profile(nextT.orchestraId)?.style ?? "balanced";
      if (!(myFw.includes(ns) || ns === "balanced")) return false;
    }
    if (
      p?.style === "dramatic" &&
      (cat.profile(prevT?.orchestraId ?? "")?.style === "dramatic" ||
        cat.profile(nextT?.orchestraId ?? "")?.style === "dramatic")
    )
      return false;
    if (p?.notAfter !== undefined && pos > p.notAfter && i !== last) return false;
    if (!cat.singerOk(c.orchestraId, c.singer)) return false;
    if (p?.tangoOnly && rhythm !== "tango") return false;
    if (golden && isColour(p) && isPeakSlot(t)) return false;
    if (golden && isColour(p) && o.rules?.colourTanda === false) {
      const col = cur.tandas
        .map((x, j) => (j !== i && isColour(cat.profile(x.orchestraId)) ? j : -1))
        .filter((j) => j >= 0);
      if (col.length >= Math.max(1, Math.round(hours / 2)) || col.some((j) => Math.abs(j - i) < 4))
        return false;
    }
    if (golden && t.targetEnergy >= 78 && ((p?.tier ?? 3) > 1 || isColour(p))) return false;
    // D'Arienzo at a planned peak (DJ S2)
    if (t.peak && c.orchestraId === "juan-d-arienzo" && rhythm === "tango") {
      const ys = c.songs.map((s) => s.year ?? 0).filter(Boolean);
      const lo = Math.min(...ys),
        hi = Math.max(...ys);
      if (c.vocal ? surname(c.singer) !== "echague" || hi < 1938 || lo > 1939 : hi < 1937 || lo > 1940)
        return false;
    }
    return true;
  };

  // --- edits --------------------------------------------------------------------------------------------------
  const reorderEdits = (): RepairEdit[] => {
    const out: RepairEdit[] = [];
    for (const i of targets) {
      const t = cur.tandas[i]!;
      const songs = strictOrder(t.songs, isPeakSlot(t));
      if (songs.every((s, k) => s === t.songs[k])) continue;
      const tandas = cur.tandas.slice();
      tandas[i] = retanda(t, songs, t);
      out.push({
        kind: "reorder",
        tanda: i,
        text: `Tanda ${i + 1}: ${tName(t)} reordered (opens on ${songs[0]!.title}, ends on ${songs.filter((s) => !isCump(s)).at(-1)!.title})`,
        playlist: finalize(tandas),
      });
    }
    // heat labels capped by fame (a relabel, no side moves)
    const relabel = cur.tandas.map((t) => {
      const h = heatOfSides(t.songs);
      return h && t.heat && h.label !== t.heat.label ? { ...t, heat: h } : t;
    });
    if (relabel.some((t, i) => t !== cur.tandas[i]))
      out.push({
        kind: "reorder",
        tanda: -1,
        text: "Heat labels capped by the sides' fame",
        playlist: finalize(relabel),
      });
    return out;
  };
  const resideEdits = (): RepairEdit[] => {
    const out: RepairEdit[] = [];
    for (const i of targets) {
      const t = cur.tandas[i]!;
      if (t.songs.some(isCump)) continue;
      const fams = famsOf(t.rhythm).filter(
        (c) =>
          c.orchestraId === t.orchestraId && c.vocal === t.vocal && surname(c.singer) === surname(t.singer),
      );
      for (const c of fams) {
        const songs = bestSides(c, i, t.rhythm, t.songs.length, t);
        if (!songs || songs.every((s, k) => s.id === t.songs[k]?.id)) continue;
        const tandas = cur.tandas.slice();
        tandas[i] = asTanda(c, i, songs, "same family, its best sides");
        tandas[i]!.reason =
          `${t.reason?.replace(/ · strict panel:.*$/, "")} · strict panel: same family, its best sides`;
        out.push({
          kind: "reside",
          tanda: i,
          text: `Tanda ${i + 1}: ${tName(t)} ${yearsStr(t.songs)} → its family's best sides ${yearsStr(songs)} (${songs.map((s) => s.title).join(", ")})`,
          playlist: finalize(tandas),
        });
      }
    }
    return out;
  };
  const replaceEdits = (only?: (c: TandaCandidate) => boolean, at?: number[], top = 8): RepairEdit[] => {
    const out: RepairEdit[] = [];
    const have = mustHavesOf(cur.tandas);
    for (const i of at ?? targets) {
      const t = cur.tandas[i]!;
      // the última follows the night's última rule (composer): its family stays, its sides may be rebuilt
      if (t.songs.some(isCump) || i === last) continue;
      const mh = mustHaveOf(t);
      // never remove the only tanda of a must-have family (DJ B4)
      if (mh && cur.tandas.filter((x) => mustHaveOf(x) === mh).length === 1) continue;
      const need = t.songs.length || sizeOf(o, t.rhythm);
      const cands = famsOf(t.rhythm).filter((c) => (!only || only(c)) && slotOk(c, i, t.rhythm));
      // rank by the family's promise: must-have families missing tonight, known sides, energy fit
      const promise = (c: TandaCandidate) => {
        const fs = c.songs
          .filter((s) => sideOkM(s, t.rhythm))
          .sort((a, b) => fame(b) - fame(a))
          .slice(0, need);
        if (fs.length < need) return -1e9;
        const mf = fs.reduce((a, s) => a + fame(s), 0) / need;
        const e = fs.reduce((a, s) => a + (s.energy ?? 50), 0) / need;
        const st = fs.filter(streamable).length;
        const f = mustHaveOf({
          orchestraId: c.orchestraId,
          singer: c.singer,
          vocal: c.vocal,
          rhythm: t.rhythm,
        });
        const opens = fs.some((s) => fame(s) >= (isPeakSlot(t) ? 4 : 3)) ? 4 : -4;
        return (
          mf * 4 +
          st +
          opens -
          Math.abs(e - t.targetEnergy) / 2 +
          (f && !have.has(f) ? 12 : 0) +
          (cat.profile(c.orchestraId)?.tier === 1 ? 2 : 0)
        );
      };
      const ranked = cands
        .map((c) => ({ c, v: promise(c) }))
        .filter((x) => x.v > -1e8)
        .sort((a, b) => b.v - a.v)
        .slice(0, at ? Math.max(10, top) : top);
      for (const { c } of ranked) {
        const songs = bestSides(c, i, t.rhythm, need, t);
        if (!songs) continue;
        const tandas = cur.tandas.slice();
        tandas[i] = asTanda(c, i, songs, `replaces ${tName(t)}`);
        out.push({
          kind: "replace",
          tanda: i,
          text: `Tanda ${i + 1}: ${tName(t)} ${yearsStr(t.songs)} → ${tName(tandas[i]!)} ${yearsStr(songs)}`,
          playlist: finalize(tandas),
        });
      }
    }
    return out;
  };
  /** per rule, the families that can mend it and the chairs they may take (the panel's targeted replacements) */
  const famEnergy = (c: TandaCandidate, t: Tanda) => {
    const es = c.songs
      .filter((x) => sideOkM(x, t.rhythm))
      .map((x) => x.energy ?? 50)
      .sort((a, b) => Math.abs(a - t.targetEnergy) - Math.abs(b - t.targetEnergy))
      .slice(0, t.songs.length);
    return es.reduce((a, b) => a + b, 0) / Math.max(1, es.length);
  };
  const rhythmicFam = (c: TandaCandidate) => cat.profile(c.orchestraId)?.style === "rhythmic";
  const targetedEdits = (): RepairEdit[] => {
    const out: RepairEdit[] = [];
    const tangoIdx = cur.tandas.map((t, i) => (t.rhythm === "tango" ? i : -1)).filter((i) => i >= 0);
    for (const v of curR.violations) {
      const i = v.tanda;
      if (i < 0 || i >= n) continue;
      const t = cur.tandas[i]!;
      if (v.rule === "instrHour") {
        const b = hb.find((x) => x.includes(i)) ?? [];
        const k = tangoIdx.indexOf(i);
        const run = k >= 0 ? tangoIdx.slice(Math.max(0, k - 3), k + 1) : [];
        const at = [
          ...new Set([...b.filter((j) => cur.tandas[j]!.rhythm === "tango" && cur.tandas[j]!.vocal), ...run]),
        ];
        out.push(
          ...replaceEdits(
            (c) => !c.vocal,
            at.filter((j) => j !== last),
            6,
          ),
        );
      } else if (v.rule === "rhythmicRun") {
        const k = tangoIdx.indexOf(i);
        const at = k >= 0 ? tangoIdx.slice(Math.max(0, k - 2), k + 1) : [i];
        out.push(
          ...replaceEdits(
            (c) => !rhythmicFam(c),
            at.filter((j) => j !== last && !cur.tandas[j]!.peak),
            6,
          ),
        );
      } else if (v.rule === "peakHits" || (v.rule === "hotSlot" && t.peak)) {
        out.push(...replaceEdits((c) => rhythmicFam(c), [i], 10));
      } else if (v.rule === "opener") {
        const need = isPeakSlot(t) ? 4 : 3;
        out.push(...replaceEdits((c) => c.songs.filter((x) => fame(x) >= need).length >= 2, [i], 8));
      } else if (v.rule === "colourBudget") {
        const col = cur.tandas
          .map((x, j) => (isColour(cat.profile(x.orchestraId)) ? j : -1))
          .filter((j) => j > 0);
        out.push(
          ...replaceEdits(
            (c) => !isColour(cat.profile(c.orchestraId)),
            col.filter((j) => j !== last),
            6,
          ),
        );
      } else if (v.rule === "valley") {
        const at = [i - 2, i - 1, i].filter((j) => j > 0 && j < last);
        out.push(...replaceEdits((c) => famEnergy(c, cur.tandas[at[0]!]!) >= 66, at, 6));
      } else if (v.rule === "wedge") {
        const ult = cur.tandas[last]!;
        out.push(
          ...replaceEdits(
            (c) =>
              famEnergy(c, t) >= ult.energy - 10 &&
              c.songs.filter((x) => fame(x) >= 2 && streamable(x)).length >= t.songs.length,
            [i],
            10,
          ),
        );
      } else if (v.rule === "hotSlot") {
        out.push(...replaceEdits((c) => famEnergy(c, t) >= t.targetEnergy - 8, [i], 8));
      }
    }
    return out;
  };
  const canonEdits = (): RepairEdit[] => {
    if (!ruleSet.has("canon")) return [];
    const have = mustHavesOf(cur.tandas);
    const missing = MUST_HAVE.filter((f) => !have.has(f.id));
    const out: RepairEdit[] = [];
    for (const f of missing) {
      const only = (c: TandaCandidate) =>
        c.orchestraId === f.orchestraId && (!f.singers || (c.vocal && f.singers.includes(surname(c.singer))));
      const at = cur.tandas
        .map((_t, i) => i)
        .filter((i) => i !== last && (!f.tangoOnly || cur.tandas[i]!.rhythm === "tango"));
      out.push(...replaceEdits(only, at));
    }
    return out;
  };
  const swapEdits = (): RepairEdit[] => {
    const out: RepairEdit[] = [];
    const structural = targets.filter((i) => [...(bad.get(i) ?? [])].some((k) => STRUCT.includes(k)));
    const seen = new Set<string>();
    for (const i of structural)
      for (let j = 1; j < last; j++) {
        if (j === i || i === 0 || i === last) continue;
        const a = cur.tandas[i]!,
          b = cur.tandas[j]!;
        if (a.rhythm !== b.rhythm || a.locked || b.locked || a.birthday || b.birthday) continue;
        const k = `${Math.min(i, j)}|${Math.max(i, j)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const gapAt = (pos: number, id: string, skip: number) =>
          cur.tandas.some(
            (x, q) => q !== pos && q !== skip && x.orchestraId === id && Math.abs(q - pos) < gap,
          );
        if (gapAt(i, b.orchestraId, j) || gapAt(j, a.orchestraId, i)) continue;
        const tandas = cur.tandas.slice();
        tandas[i] = retanda(
          { ...b, cortina: a.cortina },
          strictOrder(b.songs, isPeakSlot(a)),
          a,
          `moved from ${j + 1}`,
        );
        tandas[j] = retanda(
          { ...a, cortina: b.cortina },
          strictOrder(a.songs, isPeakSlot(b)),
          b,
          `moved from ${i + 1}`,
        );
        out.push({
          kind: "swap",
          tanda: i,
          text: `Tandas ${i + 1} and ${j + 1} swap places (${tName(a)} ↔ ${tName(b)})`,
          playlist: finalize(tandas),
        });
      }
    return out;
  };
  const cueEdits = (): RepairEdit[] => {
    if (!CUE.some((k) => ruleSet.has(k))) return [];
    const tandas = recue(cur.tandas, deps, o);
    if (!tandas) return [];
    return [
      {
        kind: "cues",
        tanda: -1,
        text: "Cortinas re-picked for the strict panel (artists, moods, tempo)",
        playlist: finalize(tandas),
      },
    ];
  };
  const closerEdits = (): RepairEdit[] => {
    if (!ruleSet.has("closer") || !cur.closing) return [];
    const c = pickStrictCloser(cat, o, cur.tandas[last]?.orchestraId ?? "");
    if (!c || c.id === cur.closing.id) return [];
    return [
      {
        kind: "closer",
        tanda: n,
        text: `Closing Cumparsita: ${cur.closing.orchestra} ${cur.closing.year ?? ""} → ${c.orchestra} ${c.year ?? ""} (streams, known, in range)`,
        playlist: finalize(cur.tandas, c),
      },
    ];
  };
  /** dancer R14-6b: a hot slot no family can lift is planned lower (never a summit, at most 10 points, energy + 8) */
  const replanEdits = (): RepairEdit[] => {
    const out: RepairEdit[] = [];
    for (const v of curR.violations) {
      if (v.rule !== "hotSlot" || v.tanda < 0) continue;
      const t = cur.tandas[v.tanda]!;
      if (t.peak || v.tanda === last || t.energy >= t.targetEnergy - 8) continue;
      const to = Math.max(t.targetEnergy - 10, Math.min(77, t.energy + 8));
      if (to >= t.targetEnergy) continue;
      const tandas = cur.tandas.slice();
      tandas[v.tanda] = retanda(
        { ...t, reason: t.reason },
        strictOrder(t.songs, to >= 78 || t.phase === "peak"),
        {
          index: v.tanda,
          targetEnergy: to,
          phase: to < 78 && t.phase === "peak" ? "build" : t.phase,
          peak: t.peak,
        },
        `slot re-planned at ${to} (no family lifts ${t.targetEnergy} here)`,
      );
      out.push({
        kind: "replan",
        tanda: v.tanda,
        text: `Tanda ${v.tanda + 1}: slot re-planned from target ${t.targetEnergy} to ${to} (no family the rules allow reaches it)`,
        playlist: finalize(tandas),
      });
    }
    return out;
  };
  return [
    () => [...reorderEdits(), ...cueEdits(), ...closerEdits()],
    resideEdits,
    () => [...canonEdits(), ...targetedEdits(), ...replaceEdits()],
    swapEdits,
    replanEdits,
  ];
}

/** the closing Cumparsita the panel accepts: streams, fame ≥ 2, in the night's range, never the última's orchestra */
export function pickStrictCloser(cat: Catalog, o: ComposeOptions, lastOrch: string): Song | null {
  return pickCloser(cat, o, lastOrch) ?? pickCloser(cat, o, "");
}
function pickCloser(cat: Catalog, o: ComposeOptions, lastOrch: string): Song | null {
  const yr = o.yearRange;
  const cands = cat.songs.filter(
    (s) =>
      normTitle(s.title) === "la cumparsita" &&
      s.rhythm === "tango" &&
      !s.vocal &&
      isTandaEligible(s) &&
      !s.streamSuspect &&
      s.orchestraId !== lastOrch &&
      streamable(s) &&
      fame(s) >= 2 &&
      (!yr || (!!s.year && s.year >= yr[0] && s.year <= yr[1])),
  );
  return (
    cands.sort(
      (a, b) =>
        fame(b) - fame(a) ||
        Number(!!b.selection) - Number(!!a.selection) ||
        (a.year ?? 0) - (b.year ?? 0) ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

/**
 * Re-pick the night's cortinas under the panel's cue rules (DJ S9, S10; dancer R14-14, R14-15) and the composer's
 * placement rules (round 10/11): a cue that already fits stays; the others take the closest-fitting fresh cue of the
 * night's culture. Returns null when nothing changes.
 */
export function recue(tandas: Tanda[], deps: ComposeDeps, o: ComposeOptions): Tanda[] | null {
  if (o.cortinaStyle === "none" || o.cortinaStyle === "constant") return null;
  const all = candidatesFor(cortinaPool(deps.cortinas, o.overrides?.cortinas), o).filter(cueHasAudio);
  // the night's own cortina families first (a re-pick never opens a new family while these can serve)
  const fams = new Set(tandas.filter((t) => t.cortina).map((t) => familyOf(t.cortina!)));
  const own = all.filter((c) => fams.has(familyOf(c)));
  if (!all.length) return null;
  const n = tandas.length;
  const out = tandas.slice();
  const chosen: Cortina[] = [];
  const art = (c: Cortina) => normTitle(c.artist);
  const isD = (t: Tanda) => styleClass(t) === "D" && t.rhythm === "tango";
  /** the composer's placement rules (rounds 10–11): never broken by a re-pick */
  const placed = (c: Cortina, k: number) => {
    const prev = out[k]!,
      next = out[k + 1]!;
    const tempo = cortinaTempo(c);
    if (next.rhythm !== "tango" && tempo === "slow") return false;
    if (next.energy >= 75 && (tempo === "slow" || c.energy < 60)) return false;
    if (tempo === "slow" && next.energy > 70) return false;
    if (isD(next) && (c.energy > 70 || tempo === "up")) return false;
    if (isD(prev) && !isD(next) && (c.energy < 70 || tempo !== "up")) return false;
    if (c.genre === "arabesk" && (next.energy >= 75 || chosen.some((x) => x.genre === "arabesk")))
      return false;
    const last = chosen[chosen.length - 1];
    return !(last && last.id === c.id);
  };
  /** the strict panel's cue rules (DJ S9, S10; dancer R14-14, R14-15) */
  const panel = (c: Cortina, k: number) => {
    const next = out[k + 1]!;
    const tempo = cortinaTempo(c);
    if (c.tags?.includes("danceable-risk") || !cueHasAudio(c)) return false;
    const same = chosen.map((x, j) => ({ x, j })).filter(({ x }) => art(x) === art(c));
    if (same.length >= 2 || (same.length && k - same[same.length - 1]!.j < 4)) return false;
    if (next.targetEnergy >= 78 && tempo === "slow") return false;
    if (isD(next) && !cueMoody(c)) return false;
    return !(next.rhythm === "vals" && c.energy > next.energy + 4);
  };
  const fresh = (c: Cortina) => !chosen.some((x) => x.id === c.id);
  const notNear = (c: Cortina, k: number) => !chosen.slice(Math.max(0, k - 4)).some((x) => x.id === c.id);
  let changed = false;
  for (let k = 0; k < n - 1; k++) {
    const t = out[k]!;
    const cur = t.cortina;
    if (!cur) continue;
    const next = out[k + 1]!;
    if (placed(cur, k) && panel(cur, k) && fresh(cur)) {
      chosen.push(cur);
      continue;
    }
    const energyGap = (c: Cortina) => Math.abs(c.energy - (next.energy - 8));
    const pickFrom = (ok: (c: Cortina) => boolean, pool = own) =>
      pool.filter((x) => ok(x)).sort((a, b) => energyGap(a) - energyGap(b) || a.id.localeCompare(b.id))[0];
    const tiers: Array<(c: Cortina) => boolean> = [
      (c) => placed(c, k) && panel(c, k) && fresh(c),
      (c) => placed(c, k) && fresh(c),
      (c) => placed(c, k) && panel(c, k) && notNear(c, k),
    ];
    let c: Cortina | undefined;
    for (const pool of [own, all]) {
      for (const ok of tiers) {
        c = pickFrom(ok, pool);
        if (c) break;
      }
      if (c) break;
    }
    if (!c) c = placed(cur, k) ? cur : (pickFrom((x) => placed(x, k), all) ?? cur);
    if (c.id !== cur.id) {
      out[k] = { ...t, cortina: { ...c, lengthSec: cur.lengthSec ?? c.lengthSec } };
      changed = true;
    }
    chosen.push(c);
  }
  return changed ? out : null;
}

/** attach the booth again after a repair (the timing plan reads the sides and cues) */
export const rebooth = (p: Playlist): Playlist => (p.booth ? attachBooth(p) : p);
