import { attachBooth } from "./booth";
import { BIG_FOUR, bigFourProblems, sideBpm, sideProblem, tandaRulesOf } from "./coherence";
import { type ComposeDeps, cumparsitaCandidates, swapTandaOptions } from "./compose";
import { candidatesFor, cortinaPool, familyOf } from "./cortinas";
import {
  type ClosingFormat,
  closingFor,
  closingFormatOf,
  cortinaBeforeClosing,
  cumparsitaPlacement,
  isCumparsita,
  openingCumparsita,
} from "./cumparsita";
import { isDanceableSong, normTitle } from "./energy";
import { nightOptions } from "./suggest";
import { renight, retimeTanda, type SwapOption, setTandaSides } from "./swap";
import { isTandaEligible } from "./tanda";
import type { Cortina, DanceRhythm, Playlist, Song, Tanda } from "./types";

/**
 * 2026-11 (the owner: "songs and tandas should be insertable or removable in each tanda and before / after tandas, by
 * AI and manually; during and after these the AI should help and guide; near the Cumparsitas it should check and
 * suggest changes to the Cumparsita").
 *
 * - The edits: `insertSong` (a side at a place in a tanda), `removeSong`, `insertTanda` (a whole tanda before / after
 *   another: an engine suggestion or the DJ's own sides), `removeTanda`, `moveTanda` — each re-times and re-scores the
 *   night, keeps the cortinas right (the gap a new tanda opens gets a cortina of the night's own families, never the
 *   one beside it; the última keeps the closing format's cortina or none) and renumbers the tandas and breaks.
 * - The suggestions for a spot: `insertSongOptions` (sides that fit the tanda — orchestra, singer, voice, years,
 *   tempo — ranked for the place, each with a one-line why) and `insertTandaOptions` (the composer's own builder for
 *   the new chair, ranked by the energy the arc wants there, the rhythm cycle, the big-four spread, the repeat gaps
 *   and — when given — a succession score; each with a why).
 * - The guide after an edit: `editGuide(before, after)` — what changed for the night (its length, an energy bump, a
 *   broken rhythm cycle, a cortina added or removed, big-four or orchestra repeats, the 4 + 1 última, the opening and
 *   closing La Cumparsita that no longer match) with a one-tap fix each (`applyGuideFix`).
 *
 * The rule check (editCheck) still judges every edit before it applies; the guide is information after it.
 */

/* ---------- the night's structure ---------- */

/** the night with these tandas: renumbered, re-stated, re-timed (booth plan) and re-scored */
function withTandas(p: Playlist, tandas: Tanda[], breaks = p.breaks): Playlist {
  const ts = tandas.map((t, k) => (t.index === k ? t : { ...t, index: k }));
  const base = { ...p, ...(breaks ? { breaks } : {}) };
  if (!breaks) delete base.breaks;
  try {
    return renight(base, ts);
  } catch {
    // a partial night (an imported file without its booth plan): the tandas are what matters
    return { ...base, tandas: ts };
  }
}
/** a show break follows the tanda it was after: shifted by an insert / removal at `at` (`delta` ±1) */
function shiftBreaks(p: Playlist, at: number, delta: 1 | -1): Playlist["breaks"] {
  if (!p.breaks?.length) return p.breaks;
  return p.breaks.map((b) =>
    b.afterTanda >= at ? { ...b, afterTanda: Math.max(0, b.afterTanda + delta) } : b,
  );
}

const cortinaWanted = (p: Playlist) => cortinaBeforeClosing(closingFormatOf(p.options));

/**
 * A cortina for the gap after tanda `i` (between it and the next): the night's own cortina families first, never the
 * cortina of the gap before or after, unused ones first, the energy a little under the next tanda's. The night's
 * style decides: no cortinas → none; one cortina all night → that one.
 */
export function cortinaForGap(
  p: Playlist,
  i: number,
  deps: Pick<ComposeDeps, "cortinas">,
  /** 2026-11 (rooms): the cortinas to choose from (the night's cultures and genres); default the whole pool */
  from?: Cortina[],
): Cortina | null {
  const o = p.options;
  if (o.cortinaStyle === "none") return null;
  const others = p.tandas.map((t, k) => (k === i ? null : t.cortina)).filter((c): c is Cortina => !!c);
  if (o.cortinaStyle === "constant" && others[0]) return { ...others[0], picked: undefined };
  const pool =
    from ?? cortinaPool(deps.cortinas, o.overrides?.cortinas as Record<string, Cortina | null> | undefined);
  const fams = new Set(others.map(familyOf));
  const near = new Set(
    [p.tandas[i - 1]?.cortina?.id, p.tandas[i + 1]?.cortina?.id].filter((x): x is string => !!x),
  );
  const used = new Map<string, number>();
  for (const c of others) used.set(c.id, (used.get(c.id) ?? 0) + 1);
  const fam = pool.filter((c) => fams.has(familyOf(c)));
  const cands = (fam.length ? fam : pool).filter((c) => !near.has(c.id));
  if (!cands.length) return others[0] ? { ...others[0], picked: undefined } : null;
  const target = (p.tandas[i + 1]?.energy ?? p.tandas[i]?.energy ?? 60) - 8;
  const len = others.length
    ? Math.round(others.reduce((a, c) => a + (c.lengthSec ?? o.cortinaLengthSec), 0) / others.length)
    : o.cortinaLengthSec;
  const best = cands
    .map((c) => ({
      c,
      v: (used.get(c.id) ?? 0) * 100 + Math.abs(c.energy - target) + (c.spotify?.uri ? 0 : 5),
    }))
    .sort((a, b) => a.v - b.v || a.c.id.localeCompare(b.c.id))[0]!.c;
  return { ...best, lengthSec: len };
}

/** the cortinas around tanda positions `at` set right: each gap has a cortina, the última the closing format's */
function mendCortinas(
  p: Playlist,
  tandas: Tanda[],
  gaps: number[],
  deps: Pick<ComposeDeps, "cortinas">,
): Tanda[] {
  const out = tandas.slice();
  const n = out.length;
  for (const i of new Set(gaps)) {
    const t = out[i];
    if (!t) continue;
    if (i === n - 1) continue;
    const cur = t.cortina;
    const clash = !!cur && (cur.id === out[i - 1]?.cortina?.id || cur.id === out[i + 1]?.cortina?.id);
    if (!cur || (clash && !t.locked))
      out[i] = { ...t, cortina: cortinaForGap({ ...p, tandas: out }, i, deps) };
  }
  return out;
}
/** the última's cortina by the closing format: kept / given when the format plays one, else none */
function mendLastCortina(
  p: Playlist,
  tandas: Tanda[],
  deps: Pick<ComposeDeps, "cortinas">,
  carried?: Cortina | null,
) {
  const n = tandas.length;
  const last = tandas[n - 1];
  if (!last) return tandas;
  const want = cortinaWanted(p) && !!(p.closing ?? null);
  let c: Cortina | null = null;
  if (want) c = carried ?? last.cortina ?? cortinaForGap({ ...p, tandas }, n - 1, deps);
  if ((c?.id ?? null) === (last.cortina?.id ?? null)) return tandas;
  const out = tandas.slice();
  out[n - 1] = { ...last, cortina: c };
  return out;
}

export interface EditResult {
  playlist: Playlist;
  /** why nothing changed (the night is the one given) */
  reason?: string;
}

const findSong = (deps: ComposeDeps, x: string | Song): Song | undefined =>
  typeof x === "string" ? deps.catalog.songs.find((s) => s.id === x || s.altIds?.includes(x)) : x;

/** put a side at place `at` (0-based; past the end = last) of tanda `ti`: the tanda re-timed, the night re-scored */
export function insertSong(
  p: Playlist,
  ti: number,
  at: number,
  side: string | Song,
  deps: ComposeDeps,
): EditResult {
  const t = p.tandas[ti];
  if (!t) return { playlist: p, reason: "no such tanda" };
  const s = findSong(deps, side);
  if (!s) return { playlist: p, reason: "no such side" };
  if (isCumparsita(s)) return { playlist: p, reason: "La Cumparsita opens or closes the night only" };
  if (p.tandas.some((x) => x.songs.some((y) => y.id === s.id)))
    return { playlist: p, reason: "already in the night" };
  if (t.songs.length >= 8) return { playlist: p, reason: "a tanda holds at most eight sides" };
  const songs = t.songs.slice();
  songs.splice(Math.max(0, Math.min(at, songs.length)), 0, s);
  const tandas = p.tandas.map((x, i) => (i === ti ? { ...retimeTanda(x, songs), djOrder: true } : x));
  return { playlist: withTandas(p, tandas) };
}

/** take side `si` out of tanda `ti`; the last side of a tanda takes the tanda with it (its cortina handled) */
export function removeSong(p: Playlist, ti: number, si: number, deps: ComposeDeps): EditResult {
  const t = p.tandas[ti];
  if (!t?.songs[si]) return { playlist: p, reason: "no such side" };
  if (t.songs.length === 1) return removeTanda(p, ti, deps);
  const songs = t.songs.filter((_, k) => k !== si);
  const tandas = p.tandas.map((x, i) => (i === ti ? retimeTanda(x, songs) : x));
  return { playlist: withTandas(p, tandas) };
}

/** a tanda out of the night: the gap it leaves keeps one cortina (never two alike in a row), the última its format's */
export function removeTanda(p: Playlist, ti: number, deps: ComposeDeps): EditResult {
  const n = p.tandas.length;
  const t = p.tandas[ti];
  if (!t) return { playlist: p, reason: "no such tanda" };
  if (n <= 1) return { playlist: p, reason: "a night keeps at least one tanda" };
  let tandas = p.tandas.filter((_, i) => i !== ti);
  if (ti === n - 1) tandas = mendLastCortina(p, tandas, deps, t.cortina);
  else tandas = mendCortinas(p, tandas, [ti - 1], deps);
  return { playlist: withTandas(p, tandas, p.breaks ? shiftBreaks(p, ti, -1) : undefined) };
}

/** the plan of a new chair at `at`: the rhythm, the energy and the phase the arc wants there */
export function slotAt(
  p: Playlist,
  at: number,
): { rhythm: DanceRhythm; targetEnergy: number; phase: Tanda["phase"] } {
  const prev = p.tandas[at - 1];
  const next = p.tandas[at];
  const e = (t?: Tanda) => t?.targetEnergy ?? t?.energy;
  const es = [e(prev), e(next)].filter((x): x is number => typeof x === "number");
  const targetEnergy = Math.round(es.length ? es.reduce((a, b) => a + b, 0) / es.length : 60);
  const phase = (next ?? prev)?.phase ?? "build";
  const rhythms: DanceRhythm[] = ["tango", "vals", "milonga"];
  const faults = (r: DanceRhythm) => {
    const ts = p.tandas.slice();
    ts.splice(at, 0, { rhythm: r } as Tanda);
    return rhythmCycleFaults(ts, p.options).length;
  };
  const base = rhythmCycleFaults(p.tandas, p.options).length;
  // the rhythm that adds no cycle fault; tango when several do (the cycle is mostly tango)
  const rhythm = rhythms.map((r) => ({ r, f: faults(r) - base })).sort((a, b) => a.f - b.f)[0]!.r;
  return { rhythm, targetEnergy, phase };
}

/** a placeholder chair at `at` (the builder fills it): no sides of its own, the slot's plan */
function withChair(p: Playlist, at: number, rhythm: DanceRhythm, size: number): Playlist {
  const sl = slotAt(p, at);
  const chair: Tanda = {
    index: at,
    rhythm,
    orchestra: "",
    orchestraId: "",
    singer: null,
    vocal: false,
    yearRange: null,
    era: "golden" as Tanda["era"],
    songs: Array.from({ length: size }, (_, k) => ({
      id: `__chair_${k}`,
      title: `__chair ${k}`,
      rhythm,
      orchestra: "",
      orchestraId: "",
      singer: null,
      singerId: null,
      vocal: false,
      year: null,
      era: "golden",
      energy: sl.targetEnergy,
    })) as unknown as Song[],
    energy: sl.targetEnergy,
    energyCurve: [],
    targetEnergy: sl.targetEnergy,
    phase: sl.phase,
    durationSec: 0,
    cortina: null,
  } as unknown as Tanda;
  const tandas = p.tandas.slice();
  tandas.splice(at, 0, chair);
  return { ...p, tandas: tandas.map((t, k) => ({ ...t, index: k })) };
}

/**
 * A whole tanda in at `at` (0 = before the first, `tandas.length` = after the última): an engine tanda as it is, or the
 * DJ's own sides (pinned as the DJ's). The new gap gets a cortina; after the última the new tanda takes over the
 * closing format's cortina and the old última gets a gap cortina.
 */
export function insertTanda(
  p: Playlist,
  at: number,
  what: { tanda: Tanda } | { sides: ReadonlyArray<string | Song> },
  deps: ComposeDeps,
): EditResult {
  const n = p.tandas.length;
  const i = Math.max(0, Math.min(at, n));
  let nt: Tanda;
  if ("tanda" in what) nt = { ...what.tanda };
  else {
    if (!what.sides.length) return { playlist: p, reason: "a tanda needs at least one side" };
    const first = findSong(deps, what.sides[0]!);
    if (!first) return { playlist: p, reason: "no such side" };
    const used = new Set(p.tandas.flatMap((t) => t.songs.map((s) => s.id)));
    for (const x of what.sides) {
      const s = findSong(deps, x);
      if (s && used.has(s.id)) return { playlist: p, reason: `${s.title} is already in the night` };
      if (s && isCumparsita(s))
        return { playlist: p, reason: "La Cumparsita opens or closes the night only" };
    }
    const chair = withChair(
      p,
      i,
      (first.rhythm === "unknown" ? "tango" : first.rhythm) as DanceRhythm,
      what.sides.length,
    );
    const r = setTandaSides(chair, i, what.sides, deps);
    if (r.reason) return { playlist: p, reason: r.reason };
    nt = r.playlist.tandas[i]!;
  }
  let tandas = p.tandas.slice();
  tandas.splice(i, 0, { ...nt, cortina: null });
  if (i === n) {
    // after the última: the new tanda closes; the old última opens a gap
    const oldLast = p.tandas[n - 1];
    tandas = mendLastCortina(p, tandas, deps, oldLast?.cortina ?? null);
    if (oldLast) tandas[n - 1] = { ...tandas[n - 1]!, cortina: null };
    tandas = mendCortinas(p, tandas, [n - 1], deps);
  } else tandas = mendCortinas(p, tandas, [i, i - 1], deps);
  const breaks = p.breaks ? shiftBreaks(p, i, 1) : undefined;
  return { playlist: withTandas(p, tandas, breaks) };
}

/** move tanda `from` to place `to` (cortinas mended around both places; the última keeps its format's cortina) */
export function moveTanda(p: Playlist, from: number, to: number, deps: ComposeDeps): EditResult {
  const n = p.tandas.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to)
    return { playlist: p, reason: "no such move" };
  // (QA fix 2026-11: a locked tanda stays where it is)
  if (p.tandas[from]?.locked)
    return { playlist: p, reason: `tanda ${from + 1} is locked: unlock it to move it` };
  const lastCortina = p.tandas[n - 1]?.cortina ?? null;
  const moved = p.tandas.slice();
  const [x] = moved.splice(from, 1);
  moved.splice(to, 0, x!);
  // the plan of each place stays (the arc's target, the phase, the peak); the old última leaves its closing cortina
  let tandas = moved.map((t, k) => ({
    ...t,
    targetEnergy: p.tandas[k]!.targetEnergy,
    phase: p.tandas[k]!.phase,
    ...(from === n - 1 && t === x ? { cortina: null } : {}),
  }));
  tandas = mendLastCortina(p, tandas, deps, lastCortina);
  if (to === n - 1 && tandas[n - 1])
    tandas[n - 1] = { ...tandas[n - 1]!, cortina: cortinaWanted(p) && p.closing ? lastCortina : null };
  tandas = mendCortinas(p, tandas, [from - 1, from, to - 1, to], deps);
  return { playlist: withTandas(p, tandas) };
}

/* ---------- suggestions for a spot ---------- */

export interface SpotOption extends SwapOption {
  /** one line: why it fits this place */
  why: string;
}

/** why `s` may not join tanda `ti` (null: it may) — the tanda's own rules, as the Swap sheet judges a side */
export function insertReason(p: Playlist, ti: number, s: Song, deps: ComposeDeps): string | null {
  const t = p.tandas[ti];
  if (!t) return "no such tanda";
  if (isCumparsita(s)) return "La Cumparsita opens or closes the night only";
  if (p.tandas.some((x) => x.songs.some((y) => y.id === s.id))) return "already in the night";
  const at = p.tandas.findIndex((x) => x.songs.some((y) => normTitle(y.title) === normTitle(s.title)));
  if (at >= 0) return `the title already plays in tanda ${at + 1}`;
  if (s.orchestraId !== t.orchestraId) return `another orchestra (${s.orchestra}); a tanda is one orchestra`;
  if (s.rhythm !== t.rhythm) return `a ${s.rhythm} in a ${t.rhythm} tanda`;
  const singers = new Set(t.songs.filter((x) => x.vocal).map((x) => x.singerId ?? null));
  if (s.vocal && singers.size === 1 && !singers.has(s.singerId ?? null))
    return `another singer (${s.singer}); the tanda is ${t.singer ?? t.songs.find((x) => x.vocal)?.singer}'s`;
  if (!isTandaEligible(s, !!p.options.rules?.allowUndated)) return "not a dated studio side";
  if (!isDanceableSong(s, deps.catalog.blacklist) || deps.catalog.nonDance(s.orchestraId, s.title, s.year))
    return "not for dancing";
  const soft = {
    ...p.options,
    tandaRules: { ...tandaRulesOf(p.options), bpmBand: false, levelBand: false, tone: "inside" as const },
  };
  const why = sideProblem(t.songs, s, { rhythm: t.rhythm, o: soft });
  if (why) return why;
  if (!s.spotify?.uri) return "no checked Spotify recording";
  return null;
}

/** the reasons a side may never join a tanda (never offered as a near miss) */
const HARD_INSERT =
  /^(no such|La Cumparsita|already in the night|the title already plays|another orchestra|a \w+ in a \w+ tanda|not a dated|not for dancing)/;

const mmss = (sec?: number) =>
  sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "";

/**
 * The sides for place `at` of tanda `ti`: the tanda's family (its orchestra and rhythm) that keeps the tanda valid,
 * ranked by the energy the place wants (between its neighbours, the tanda's shape), the tempo of the neighbours and
 * the floor's knowledge; with `ids` exactly those sides judged (a search's results), in their order.
 */
export function insertSongOptions(
  p: Playlist,
  ti: number,
  at: number,
  deps: ComposeDeps,
  opts: { limit?: number; ids?: readonly string[] } = {},
): { suggestions: SpotOption[]; judged: SpotOption[] } {
  const t = p.tandas[ti];
  if (!t) return { suggestions: [], judged: [] };
  const limit = opts.limit ?? 8;
  const prev = t.songs[at - 1];
  const next = t.songs[at];
  const ne = [prev?.energy, next?.energy].filter((x): x is number => typeof x === "number");
  const target = ne.length ? ne.reduce((a, b) => a + b, 0) / ne.length : t.energy;
  const bpm0 = [prev, next].map((x) => (x ? sideBpm(x, t.rhythm) : null)).filter((x): x is number => !!x);
  const judge = (s: Song): SpotOption => {
    const reason = insertReason(p, ti, s, deps);
    const e = 1 - Math.min(1, Math.abs((s.energy ?? 50) - target) / 25);
    const b1 = sideBpm(s, t.rhythm);
    const bm = bpm0.length ? bpm0.reduce((a, b) => a + b, 0) / bpm0.length : null;
    const b = bm && b1 ? 1 - Math.min(1, Math.abs(b1 - bm) / bm / 0.12) : 0.5;
    const fit = Math.round((0.5 * e + 0.25 * b + 0.25 * Math.min(1, (s.fame ?? 0) / 5)) * 100) / 100;
    const where =
      prev && next
        ? `between ${prev.title} and ${next.title}`
        : prev
          ? `after ${prev.title}`
          : next
            ? `before ${next.title}`
            : "";
    const why = [
      `${s.orchestra}${s.singer ? ` / ${s.singer}` : " · instrumental"} ${s.year ?? ""}`.trim(),
      `energy ${Math.round(s.energy ?? 50)}${where ? ` ${where}` : ""}`,
      b1 ? `${Math.round(b1)} BPM` : "",
      mmss(s.durationSec),
    ]
      .filter(Boolean)
      .join(" · ");
    return { song: s, ok: !reason, ...(reason ? { reason } : {}), fit, why };
  };
  const rank = (a: SpotOption, b: SpotOption) =>
    Number(b.ok) - Number(a.ok) || b.fit - a.fit || a.song.id.localeCompare(b.song.id);
  const fam = (deps.catalog.byOrchestra.get(t.orchestraId) ?? []).filter((s) => s.rhythm === t.rhythm);
  const all = fam.map(judge);
  const fits = all.filter((x) => x.ok).sort(rank);
  // QA fix 2026-11 (a 4-side tango tanda offered 2 sides, most offered none): when too few sides keep every rule,
  // the nearest misses follow — the family's sides that break a soft rule only (another voice, an instrumental in a
  // sung tanda, the year spread, no checked stream), each with its reason; the rule check still asks before it lands
  const misses =
    fits.length >= limit
      ? []
      : all
          .filter((x) => !x.ok && !HARD_INSERT.test(x.reason ?? ""))
          .sort((a, b) => b.fit - a.fit || a.song.id.localeCompare(b.song.id));
  const suggestions = [...fits, ...misses].slice(0, limit);
  const byId = (id: string) => deps.catalog.songs.find((x) => x.id === id || x.altIds?.includes(id));
  const judged = (opts.ids ?? [])
    .slice(0, 200)
    .map(byId)
    .filter((s): s is Song => !!s)
    .map(judge);
  return { suggestions, judged };
}

export interface TandaSpotOption {
  /** the night with the tanda in at the spot */
  playlist: Playlist;
  tanda: Tanda;
  why: string;
  /** lower ranks first */
  cost: number;
}
/**
 * 2026-11 — the hook for the succession model (another round adds a score for one tanda following another): given,
 * it ranks the candidates too (0..1, higher follows better); absent, the ranking is the arc, the cycle, the big four
 * and the repeat gaps alone.
 */
export type SuccessionScore = (prev: Tanda | null, cand: Tanda, next: Tanda | null) => number;

/**
 * Whole tandas for a new chair at `at`: the composer's builder fills the chair (swapTandaOptions over a placeholder
 * with the slot's rhythm, energy and phase), and the candidates are ranked by the energy the arc wants there, the
 * rhythm cycle, the big-four spread, the orchestra repeat gap and the succession score when one is given.
 */
export function insertTandaOptions(
  p: Playlist,
  at: number,
  deps: ComposeDeps,
  opts: { n?: number; seed?: number; rhythm?: DanceRhythm; succession?: SuccessionScore } = {},
): TandaSpotOption[] {
  const n = opts.n ?? 4;
  const i = Math.max(0, Math.min(at, p.tandas.length));
  const sl = slotAt(p, i);
  const rhythm = opts.rhythm ?? sl.rhythm;
  const size =
    rhythm === "tango"
      ? p.options.tangoTandaSize
      : rhythm === "vals"
        ? p.options.valsTandaSize
        : p.options.milongaTandaSize;
  const chair = withChair(p, i, rhythm, size ?? 4);
  const qs = swapTandaOptions(chair, i, deps, opts.seed ?? (p.options.seed ?? 1) + 31 * (i + 1), n + 2, 10);
  const cycle0 = rhythmCycleFaults(p.tandas, p.options).length;
  const big0 = bigFourProblems(p.tandas, p.options).filter(
    (x) => x.kind === "adjacent" || x.kind === "gap",
  ).length;
  const gap = p.options.orchestraRepeatGap ?? 6;
  const out: TandaSpotOption[] = [];
  for (const q of qs) {
    const cand = q.tandas[i]!;
    const r = insertTanda(p, i, { tanda: { ...cand, locked: false } }, deps);
    if (r.reason) continue;
    const ts = r.playlist.tandas;
    const cyc = rhythmCycleFaults(ts, p.options).length - cycle0;
    const big =
      bigFourProblems(ts, p.options).filter((x) => x.kind === "adjacent" || x.kind === "gap").length - big0;
    const near = ts.findIndex(
      (x, k) => k !== i && Math.abs(k - i) < gap && x.orchestraId === cand.orchestraId,
    );
    const lastSame = [...ts.slice(0, i)].reverse().findIndex((x) => x.orchestraId === cand.orchestraId);
    const de = Math.abs(cand.energy - sl.targetEnergy);
    const succ = opts.succession?.(ts[i - 1] ?? null, cand, ts[i + 1] ?? null);
    const cost =
      de +
      25 * Math.max(0, cyc) +
      20 * Math.max(0, big) +
      (near >= 0 ? 15 : 0) -
      (succ !== undefined ? 20 * succ : 0);
    const why = [
      `${cand.orchestra}${cand.singer ? ` / ${cand.singer}` : " · instrumental"} ${cand.yearRange?.join("–") ?? ""}`.trim(),
      `energy ${Math.round(cand.energy)} (the arc wants ${sl.targetEnergy} here)`,
      cyc > 0 ? "breaks the rhythm cycle" : "keeps the rhythm cycle",
      big > 0 ? "a big-four tanda too close" : "",
      near >= 0
        ? `${cand.orchestra} also in tanda ${near + 1}`
        : lastSame >= 0
          ? `${lastSame + 1} tandas since the last ${cand.orchestra}`
          : `first ${cand.orchestra} tonight`,
      succ !== undefined ? `follows ${Math.round(succ * 100)}%` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    out.push({ playlist: r.playlist, tanda: r.playlist.tandas[i]!, why, cost });
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, n);
}

/* ---------- the rhythm cycle ---------- */

/** the longest run of tango tandas the night's pattern plays (TTVTTM: 2); tango-only: no limit */
export function maxTangoRun(o: Playlist["options"]): number {
  if (o.pattern === "tango-only") return Number.POSITIVE_INFINITY;
  const pat =
    o.pattern === "custom"
      ? String(o.customPattern ?? "TTVTTM")
          .toUpperCase()
          .replace(/[^TVM]/g, "") || "TTVTTM"
      : o.pattern === "TVTM" || o.pattern === "TMTV"
        ? o.pattern
        : "TTVTTM";
  if (!/[VM]/.test(pat)) return Number.POSITIVE_INFINITY;
  const twice = pat + pat;
  let best = 0;
  let run = 0;
  for (const ch of twice) {
    run = ch === "T" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return Math.min(best, pat.length);
}

export interface CycleFault {
  /** the first tanda of the fault (0-based) */
  at: number;
  /** the last one */
  to: number;
  kind: "adjacent" | "tangoRun";
  rhythm: DanceRhythm;
}
/** two vals / milonga tandas back to back, or more tango tandas in a row than the pattern plays (+1 of slack) */
export function rhythmCycleFaults(
  tandas: Array<Pick<Tanda, "rhythm">>,
  o: Playlist["options"],
): CycleFault[] {
  const out: CycleFault[] = [];
  for (let i = 1; i < tandas.length; i++) {
    const a = tandas[i - 1]!.rhythm,
      b = tandas[i]!.rhythm;
    if (a !== "tango" && b !== "tango") out.push({ at: i - 1, to: i, kind: "adjacent", rhythm: b });
  }
  const max = maxTangoRun(o) + 1;
  let start = 0;
  for (let i = 0; i <= tandas.length; i++) {
    if (i < tandas.length && tandas[i]!.rhythm === "tango") continue;
    if (i - start > max) out.push({ at: start, to: i - 1, kind: "tangoRun", rhythm: "tango" });
    start = i + 1;
  }
  return out;
}

/* ---------- the guide ---------- */

export type GuideFix =
  | { kind: "removeTanda"; tanda: number }
  | { kind: "moveTanda"; from: number; to: number }
  | { kind: "retune"; tanda: number; direction: "calmer" | "livelier" }
  | { kind: "swapTanda"; tanda: number }
  | { kind: "cortina"; tanda: number }
  | { kind: "noCortina"; tanda: number }
  | { kind: "opening"; songId: string }
  | { kind: "closing"; songId: string };

export interface GuideLine {
  key:
    | "length"
    | "energy"
    | "cycle"
    | "cortina"
    | "bigFour"
    | "repeat"
    | "opening"
    | "closing"
    | "ultima"
    | "size";
  tone: "info" | "warn";
  /** the DJ's words: an i18n key (web: guide.*) with its values, and the English line */
  message: { key: string; params: Record<string, string | number> };
  text: string;
  fix?: { message: { key: string; params: Record<string, string | number> }; text: string; fix: GuideFix };
}

const tkey = (t?: Tanda) =>
  t
    ? `${t.orchestraId}|${t.singer ?? ""}|${t.yearRange?.join("-") ?? ""}|${t.songs.map((s) => s.id).join(",")}`
    : "";
const hm = (sec: number) => {
  // (QA fix 2026-11: "4 h 47 min", floored like every printed length)
  const m = Math.floor(Math.floor(sec + 1e-6) / 60);
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const yrs = (t: Tanda) =>
  t.yearRange ? (t.yearRange[0] === t.yearRange[1] ? `${t.yearRange[0]}` : t.yearRange.join("–")) : "";
const fill = (s: string, params: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
const line = (
  key: GuideLine["key"],
  tone: GuideLine["tone"],
  msg: string,
  english: string,
  params: Record<string, string | number>,
  fix?: { msg: string; english: string; params?: Record<string, string | number>; fix: GuideFix },
): GuideLine => ({
  key,
  tone,
  message: { key: `guide.${msg}`, params },
  text: fill(english, params),
  ...(fix
    ? {
        fix: {
          message: { key: `guide.fix.${fix.msg}`, params: fix.params ?? params },
          text: fill(fix.english, fix.params ?? params),
          fix: fix.fix,
        },
      }
    : {}),
});

/**
 * The tandas an edit touched (in the night after it): the new or changed ones and the ones whose neighbours changed
 * (either side of an insert, a removal or a move). QA fix 2026-11: a tanda that only moved down a place because a
 * tanda went in before it is not touched (the guide listed every renumbered tanda's old energy step as the edit's).
 */
function touched(before: Playlist, after: Playlist): number[] {
  const pos = new Map<string, number>();
  before.tandas.forEach((t, i) => {
    if (!pos.has(tkey(t))) pos.set(tkey(t), i);
  });
  const around = (ts: Tanda[], k: number) => `${tkey(ts[k - 1])}#${tkey(ts[k + 1])}`;
  const out: number[] = [];
  after.tandas.forEach((t, i) => {
    const j = pos.get(tkey(t));
    if (j === undefined || around(after.tandas, i) !== around(before.tandas, j)) out.push(i);
  });
  return out;
}
/** the tandas the edit put in (not in the night before) */
const fresh = (before: Playlist, after: Playlist) => {
  const keys = new Set(before.tandas.map(tkey));
  return after.tandas.map((t, i) => (keys.has(tkey(t)) ? -1 : i)).filter((i) => i >= 0);
};

/** a move that ends the new rhythm-cycle faults without a new big-four fault (nearest first) */
function cycleMove(p: Playlist, f: CycleFault, deps: ComposeDeps): GuideFix | null {
  const n = p.tandas.length;
  const base = rhythmCycleFaults(p.tandas, p.options).length;
  const big0 = bigFourProblems(p.tandas, p.options).length;
  const who = f.kind === "adjacent" ? f.to : f.to;
  for (let d = 1; d <= 4; d++)
    for (const to of [who + d, who - d]) {
      if (to < 0 || to >= n - 1 || to === who) continue;
      const r = moveTanda(p, who, to, deps);
      if (r.reason) continue;
      if (rhythmCycleFaults(r.playlist.tandas, p.options).length >= base) continue;
      if (bigFourProblems(r.playlist.tandas, p.options).length > big0) continue;
      return { kind: "moveTanda", from: who, to };
    }
  return null;
}

/** the classic closing for a night: a documented La Cumparsita from the night's years by another orchestra than the última's */
function classicClosing(p: Playlist, deps: ComposeDeps): Song | null {
  const last = p.tandas.at(-1);
  const yr = p.options.yearRange;
  const cands = cumparsitaCandidates(deps.catalog, p.options).filter(
    (s) => s.orchestraId !== last?.orchestraId && !s.streamSuspect,
  );
  const inR = yr ? cands.filter((s) => !!s.year && s.year >= yr[0] && s.year <= yr[1]) : cands;
  const from = inR.length ? inR : cands;
  return (
    from.sort(
      (a, b) =>
        Number(!!b.spotify) - Number(!!a.spotify) ||
        (b.fame ?? 0) - (a.fame ?? 0) ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

/**
 * What an edit did to the night, in the DJ's words, each with a one-tap fix where one exists: the night's length,
 * an energy bump at the tandas it touched, a broken rhythm cycle, cortinas added or removed, big-four and orchestra
 * repeats, the 4 + 1 última, and the opening and closing La Cumparsita when the first or last tanda changed.
 */
export function editGuide(before: Playlist, after: Playlist, deps: ComposeDeps): GuideLine[] {
  const out: GuideLine[] = [];
  const o = after.options;
  const n = after.tandas.length;
  const at = touched(before, after);
  // the night's length
  const d0 = before.stats?.durationSec ?? 0;
  const d1 = after.stats?.durationSec ?? 0;
  const dm = Math.round((d1 - d0) / 60);
  if (dm !== 0 && before.tandas.length !== after.tandas.length) {
    const want = (o.hours ?? 4) * 3600;
    const over = d1 > want * 1.1;
    let fix: Parameters<typeof line>[5];
    if (over) {
      // a late, unpinned chair of the rhythm added (never the última, never the touched ones)
      const first = fresh(before, after)[0] ?? at[0];
      const added = first !== undefined ? after.tandas[first]?.rhythm : "tango";
      const k = after.tandas
        .map((t, i) => ({ t, i }))
        .filter((x) => x.i > n / 2 && x.i < n - 1 && !x.t.pinned && !at.includes(x.i) && x.t.rhythm === added)
        .at(-1)?.i;
      if (k !== undefined)
        fix = {
          msg: "remove_tanda",
          english: "Remove tanda {n}",
          params: { n: k + 1 },
          fix: { kind: "removeTanda", tanda: k },
        };
    }
    out.push(
      line(
        "length",
        over || d1 < want * 0.9 ? "warn" : "info",
        dm > 0 ? "longer" : "shorter",
        dm > 0 ? "The night is {m} min longer: {total}" : "The night is {m} min shorter: {total}",
        { m: Math.abs(dm), total: hm(d1) },
        fix,
      ),
    );
  }
  // QA fix 2026-11 (a fifth side in a four-side tango tanda said nothing): a tanda the edit grew or shrank away from
  // the night's size for its rhythm
  const sizeFor = (r: DanceRhythm) =>
    r === "tango"
      ? (o.tangoTandaSize ?? 4)
      : r === "vals"
        ? (o.valsTandaSize ?? 3)
        : (o.milongaTandaSize ?? 3);
  for (const i of at) {
    const t = after.tandas[i];
    if (!t) continue;
    const want = sizeFor(t.rhythm);
    const was = before.tandas.length === after.tandas.length ? before.tandas[i]?.songs.length : undefined;
    if (t.songs.length === want || (was !== undefined && was === t.songs.length)) continue;
    if (was === undefined && before.tandas.some((x) => tkey(x) === tkey(t))) continue;
    out.push(
      line(
        "size",
        "warn",
        t.songs.length > want ? "tanda_size_more" : "tanda_size_fewer",
        "Tanda {n} has {k} songs: your {r} tandas are {s}",
        { n: i + 1, k: t.songs.length, r: t.rhythm, s: want },
      ),
    );
  }
  // an energy bump at a touched tanda
  for (const i of at) {
    const t = after.tandas[i];
    const a = after.tandas[i - 1];
    const b = after.tandas[i + 1];
    if (!t || (!a && !b)) continue;
    const nb = [a?.energy, b?.energy].filter((x): x is number => typeof x === "number");
    const mid = nb.reduce((x, y) => x + y, 0) / nb.length;
    const step = Math.round(t.energy - mid);
    if (Math.abs(step) < 15 || t.pinned) continue;
    out.push(
      line(
        "energy",
        "warn",
        step > 0 ? "energy_up" : "energy_down",
        step > 0
          ? "Tanda {n} jumps the energy: {a} → {e} → {b}"
          : "Tanda {n} drops the energy: {a} → {e} → {b}",
        {
          n: i + 1,
          a: Math.round(a?.energy ?? t.energy),
          e: Math.round(t.energy),
          b: Math.round(b?.energy ?? t.energy),
        },
        {
          msg: step > 0 ? "calmer" : "livelier",
          english: step > 0 ? "Make tanda {n} calmer" : "Make tanda {n} livelier",
          params: { n: i + 1 },
          fix: { kind: "retune", tanda: i, direction: step > 0 ? "calmer" : "livelier" },
        },
      ),
    );
  }
  // the rhythm cycle
  const key = (f: CycleFault, ts: Tanda[]) => `${f.kind}|${tkey(ts[f.at])}|${tkey(ts[f.to])}`;
  const c0 = new Set(rhythmCycleFaults(before.tandas, before.options).map((f) => key(f, before.tandas)));
  for (const f of rhythmCycleFaults(after.tandas, o)) {
    if (c0.has(key(f, after.tandas))) continue;
    const mv = cycleMove(after, f, deps);
    out.push(
      line(
        "cycle",
        "warn",
        f.kind === "adjacent" ? "cycle_adjacent" : "cycle_run",
        f.kind === "adjacent"
          ? "Two {r} tandas back to back (tandas {a}–{b}): a tango tanda goes between"
          : "{k} tango tandas in a row (tandas {a}–{b})",
        {
          r:
            after.tandas[f.at]!.rhythm === after.tandas[f.to]!.rhythm
              ? f.rhythm
              : `${after.tandas[f.at]!.rhythm}/${f.rhythm}`,
          a: f.at + 1,
          b: f.to + 1,
          k: f.to - f.at + 1,
        },
        mv && mv.kind === "moveTanda"
          ? {
              msg: "move_tanda",
              english: "Move tanda {from} to place {to}",
              params: { from: mv.from + 1, to: mv.to + 1 },
              fix: mv,
            }
          : undefined,
      ),
    );
  }
  // cortinas: added, removed, two alike in a row
  const cb = before.tandas.filter((t) => t.cortina).length;
  const ca = after.tandas.filter((t) => t.cortina).length;
  if (ca !== cb)
    out.push(
      line(
        "cortina",
        "info",
        ca > cb ? "cortina_added" : "cortina_removed",
        ca > cb ? "{k} cortina added for the new gap" : "{k} cortina removed with it",
        { k: Math.abs(ca - cb) },
      ),
    );
  for (let i = 1; i < n; i++) {
    const x = after.tandas[i - 1]?.cortina,
      y = after.tandas[i]?.cortina;
    if (x && y && x.id === y.id && o.cortinaStyle !== "constant" && (at.includes(i) || at.includes(i - 1)))
      out.push(
        line(
          "cortina",
          "warn",
          "cortina_twice",
          "The same cortina after tandas {a} and {b}",
          { a: i, b: i + 1 },
          {
            msg: "other_cortina",
            english: "Another cortina after tanda {n}",
            params: { n: i + 1 },
            fix: { kind: "cortina", tanda: i },
          },
        ),
      );
  }
  const fmt: ClosingFormat = closingFormatOf(o);
  const last = after.tandas[n - 1];
  if (last && after.closing) {
    if (cortinaBeforeClosing(fmt) && !last.cortina && o.cortinaStyle !== "none")
      out.push(
        line(
          "cortina",
          "warn",
          "closing_cortina_missing",
          "A cortina before La Cumparsita is missing (tanda {n})",
          { n },
          {
            msg: "add_cortina",
            english: "Add the cortina after tanda {n}",
            fix: { kind: "cortina", tanda: n - 1 },
          },
        ),
      );
    if (!cortinaBeforeClosing(fmt) && last.cortina)
      out.push(
        line(
          "cortina",
          "warn",
          "closing_cortina_extra",
          "Tanda {n} has a cortina, but La Cumparsita follows it straight",
          { n },
          {
            msg: "remove_cortina",
            english: "No cortina after tanda {n}",
            fix: { kind: "noCortina", tanda: n - 1 },
          },
        ),
      );
  }
  // the big four and the orchestra gap, new faults only
  const bk = (f: ReturnType<typeof bigFourProblems>[number], ts: Tanda[]) =>
    `${f.kind}|${tkey(ts[f.with ?? -1])}|${tkey(ts[f.tanda])}`;
  const b0 = new Set(bigFourProblems(before.tandas, before.options).map((f) => bk(f, before.tandas)));
  for (const f of bigFourProblems(after.tandas, o)) {
    if (f.kind !== "adjacent" && f.kind !== "gap") continue;
    if (b0.has(bk(f, after.tandas))) continue;
    const tg = at.includes(f.tanda) ? f.tanda : (f.with ?? f.tanda);
    out.push(
      line(
        "bigFour",
        "warn",
        f.kind === "adjacent" ? "big4_adjacent" : "big4_gap",
        f.kind === "adjacent"
          ? "Two big-four tandas back to back: {a} then {b} (tandas {x}–{y})"
          : "{b} comes back too soon (tandas {x} and {y})",
        {
          a: after.tandas[f.with ?? 0]?.orchestra ?? "",
          b: after.tandas[f.tanda]?.orchestra ?? "",
          x: (f.with ?? 0) + 1,
          y: f.tanda + 1,
        },
        {
          msg: "swap_tanda",
          english: "Swap tanda {n} for another orchestra",
          params: { n: tg + 1 },
          fix: { kind: "swapTanda", tanda: tg },
        },
      ),
    );
  }
  const gap = o.orchestraRepeatGap ?? 6;
  for (const i of at) {
    const t = after.tandas[i];
    if (!t || (BIG_FOUR as readonly string[]).includes(t.orchestraId)) continue;
    const j = after.tandas.findIndex(
      (x, k) => k !== i && Math.abs(k - i) < gap && x.orchestraId === t.orchestraId,
    );
    const wasNear = before.tandas.some(
      (x, k) =>
        tkey(x) === tkey(t) &&
        before.tandas.some((y, m) => m !== k && Math.abs(m - k) < gap && y.orchestraId === t.orchestraId),
    );
    if (j >= 0 && !wasNear)
      out.push(
        line(
          "repeat",
          "warn",
          "orchestra_repeat",
          "{o} plays in tandas {a} and {b} ({gap}-tanda gap)",
          {
            o: t.orchestra,
            a: Math.min(i, j) + 1,
            b: Math.max(i, j) + 1,
            gap,
          },
          {
            msg: "swap_tanda",
            english: "Swap tanda {n} for another orchestra",
            params: { n: i + 1 },
            fix: { kind: "swapTanda", tanda: i },
          },
        ),
      );
  }
  // 4 + 1: a four-side tango última
  if (
    fmt === "in-tanda" &&
    last &&
    (last.rhythm !== "tango" || last.songs.length !== 4) &&
    tkey(last) !== tkey(before.tandas.at(-1))
  )
    out.push(
      line(
        "ultima",
        "warn",
        "four_plus_one",
        "The 4 + 1 closing wants a four-side tango última; tanda {n} is {r}, {k} sides",
        {
          n,
          r: last.rhythm,
          k: last.songs.length,
        },
      ),
    );
  // the opening and the closing La Cumparsita, when the first or last tanda changed
  const place = cumparsitaPlacement(o);
  const first = after.tandas[0];
  if (place.open && first && tkey(first) !== tkey(before.tandas[0])) {
    const r = openingCumparsita(deps.catalog, o, first, after.closing);
    if (
      r.song &&
      r.song.id !== after.opening?.id &&
      !(
        after.opening &&
        after.opening.orchestraId === first.orchestraId &&
        r.song.orchestraId !== first.orchestraId
      )
    )
      out.push(
        line(
          "opening",
          "warn",
          "opening_switch",
          "Tanda 1 is now {o} {y}: switch the opening La Cumparsita to {o2} {y2}?",
          { o: first.orchestra, y: yrs(first), o2: r.song.orchestra, y2: r.song.year ?? "" },
          {
            msg: "apply_opening",
            english: "Switch to {o2} {y2}",
            fix: { kind: "opening", songId: r.song.id },
          },
        ),
      );
  }
  if (
    place.close &&
    last &&
    after.closing &&
    !after.closingPinned &&
    tkey(last) !== tkey(before.tandas.at(-1))
  ) {
    const harmony = fmt === "in-tanda" || !!o.rules?.cumparsitaHarmony;
    let s: Song | null = null;
    if (harmony) {
      const r = closingFor(deps.catalog, o, last, after.opening ?? null);
      if (r.song && r.song.id !== after.closing.id) s = r.song;
    } else if (after.closing.orchestraId === last.orchestraId) s = classicClosing(after, deps);
    if (s)
      out.push(
        line(
          "closing",
          "warn",
          harmony ? "closing_harmony" : "closing_other",
          harmony
            ? "The última is now {o} {y}: switch the closing La Cumparsita to {o2} {y2}?"
            : "The última and La Cumparsita are both {o}: switch the closing to {o2} {y2}?",
          { o: last.orchestra, y: yrs(last), o2: s.orchestra, y2: s.year ?? "" },
          { msg: "apply_closing", english: "Switch to {o2} {y2}", fix: { kind: "closing", songId: s.id } },
        ),
      );
  }
  return out;
}

/** a guide line's fix on the night (the rule check judges it before it applies, as any edit) */
export function applyGuideFix(p: Playlist, fix: GuideFix, deps: ComposeDeps, seed = Date.now()): EditResult {
  switch (fix.kind) {
    case "removeTanda":
      return removeTanda(p, fix.tanda, deps);
    case "moveTanda":
      return moveTanda(p, fix.from, fix.to, deps);
    case "swapTanda": {
      const q = swapTandaOptions(p, fix.tanda, deps, seed, 1, 6)[0];
      return q ? { playlist: q } : { playlist: p, reason: "no other family keeps the night" };
    }
    case "retune": {
      // the nearest family at the asked energy: the composer's builder with the target moved 12 points
      const t = p.tandas[fix.tanda];
      if (!t) return { playlist: p, reason: "no such tanda" };
      const target = t.energy + (fix.direction === "calmer" ? -12 : 12);
      const tmp = {
        ...p,
        tandas: p.tandas.map((x, i) => (i === fix.tanda ? { ...x, targetEnergy: target } : x)),
      };
      const q = swapTandaOptions(tmp, fix.tanda, deps, seed, 1, 8)[0];
      if (!q) return { playlist: p, reason: "no other family at that energy" };
      const ok =
        fix.direction === "calmer"
          ? q.tandas[fix.tanda]!.energy < t.energy
          : q.tandas[fix.tanda]!.energy > t.energy;
      if (!ok) return { playlist: p, reason: "no other family at that energy" };
      return {
        playlist: withTandas(
          p,
          q.tandas.map((x, i) => (i === fix.tanda ? { ...x, targetEnergy: t.targetEnergy } : x)),
        ),
      };
    }
    case "cortina": {
      const c = cortinaForGap(p, fix.tanda, deps);
      if (!c) return { playlist: p, reason: "no cortina for this gap" };
      return {
        playlist: withTandas(
          p,
          p.tandas.map((x, i) => (i === fix.tanda ? { ...x, cortina: c } : x)),
        ),
      };
    }
    case "noCortina":
      return {
        playlist: withTandas(
          p,
          p.tandas.map((x, i) => (i === fix.tanda ? { ...x, cortina: null } : x)),
        ),
      };
    case "opening":
    case "closing": {
      const s = deps.catalog.songs.find((x) => x.id === fix.songId);
      if (!s || !isCumparsita(s)) return { playlist: p, reason: "not a La Cumparsita" };
      const np = fix.kind === "opening" ? { ...p, opening: s } : { ...p, closing: s };
      return { playlist: withTandas(np, np.tandas) };
    }
  }
}

/* ---------- 2026-11: rooms — an empty night built together, its cortinas mended after every edit ---------- */

/**
 * An empty night (the owner: "Empty night — build it together"): no tandas yet, the night's options, its booth plan
 * and score as an empty night has them. A room starts with it; the DJs add tandas (Add a tanda, Compose, Build by
 * hand, Import) and `mendNightCortinas` keeps its cortinas and Cumparsitas right as it grows.
 */
export function emptyNight(
  opts: Partial<Playlist["options"]> = {},
  o: { name?: string; id?: string; at?: string } = {},
): Playlist {
  const at = o.at ?? new Date().toISOString();
  const options = nightOptions(opts);
  const shell = {
    id: o.id ?? `empty-${Date.parse(at).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: o.name ?? "Empty night",
    createdAt: at,
    options,
    tandas: [],
    closing: null,
    opening: null,
  } as unknown as Playlist;
  return renight(shell, []);
}

/** the cortinas a night draws from: its cultures and genres (Compose's own candidates), the pool when none fit */
function nightCortinaPool(p: Playlist, deps: Pick<ComposeDeps, "cortinas">): Cortina[] {
  const pool = cortinaPool(
    deps.cortinas,
    p.options.overrides?.cortinas as Record<string, Cortina | null> | undefined,
  );
  const c = candidatesFor(pool, nightOptions(p.options));
  return c.length ? c : pool;
}
const sameCortinas = (a: Tanda[], b: Tanda[]) =>
  a.length === b.length &&
  a.every(
    (t, i) =>
      (t.cortina?.id ?? null) === (b[i]!.cortina?.id ?? null) &&
      (t.cortina?.lengthSec ?? null) === (b[i]!.cortina?.lengthSec ?? null) &&
      !!t.cortina?.picked === !!b[i]!.cortina?.picked,
  );

/**
 * The night's cortinas set right after any edit, as Compose keeps them: every gap with one cortina (none with the
 * "none" style), never the same cortina twice in a row, the última's by the closing format; a cortina the DJ picked
 * stays where it is. `refresh` re-picks every automatic cortina (a change of the cortina settings); `cumparsitas`
 * also gives a night that grew from empty its opening and closing La Cumparsita as its settings ask. The same
 * night comes back (by reference) when nothing needed mending.
 */
export function mendNightCortinas(
  p: Playlist,
  deps: ComposeDeps,
  o: {
    refresh?: boolean;
    cumparsitas?: boolean | { open?: boolean; close?: boolean };
    lengthSec?: number;
  } = {},
): Playlist {
  const n = p.tandas.length;
  let np = p;
  // (a night with neither Cumparsita grew from empty: it gets both as its settings ask; a composed night keeps what
  // the DJ left it — only the settings sheet asks for one by name)
  if (n && o.cumparsitas === true && !p.opening && !p.closing)
    np = withCumparsitas(np, deps, { open: true, close: true });
  else if (n && o.cumparsitas && typeof o.cumparsitas === "object")
    np = withCumparsitas(np, deps, o.cumparsitas);
  if (!n) return np;
  const none = np.options.cortinaStyle === "none";
  const pool = nightCortinaPool(np, deps);
  let tandas = np.tandas.map((t) =>
    none || (o.refresh && t.cortina && !t.cortina.picked) ? { ...t, cortina: null } : t,
  );
  if (!none)
    for (let i = 0; i < n - 1; i++) {
      const t = tandas[i]!;
      const cur = t.cortina;
      const clash =
        !!cur &&
        !cur.picked &&
        (cur.id === tandas[i - 1]?.cortina?.id || cur.id === tandas[i + 1]?.cortina?.id);
      if (!cur || clash) {
        const c = cortinaForGap({ ...np, tandas }, i, deps, pool);
        tandas[i] = { ...t, cortina: c && o.lengthSec ? { ...c, lengthSec: o.lengthSec } : c };
      }
    }
  // the última: the closing format's cortina (kept, or one of the night's), else none
  const last = tandas[n - 1]!;
  const want = !none && cortinaWanted(np) && !!np.closing;
  if (!want && last.cortina) tandas[n - 1] = { ...last, cortina: null };
  else if (want && !last.cortina) {
    const c = cortinaForGap({ ...np, tandas }, n - 1, deps, pool);
    tandas[n - 1] = { ...last, cortina: c && o.lengthSec ? { ...c, lengthSec: o.lengthSec } : c };
  }
  if (o.lengthSec)
    tandas = tandas.map((t) =>
      t.cortina && t.cortina.lengthSec !== o.lengthSec
        ? { ...t, cortina: { ...t.cortina, lengthSec: o.lengthSec } }
        : t,
    );
  if (np === p && sameCortinas(tandas, p.tandas)) return p;
  return withTandas(np, tandas);
}

/** the opening and closing La Cumparsita a night's settings ask for (those `want` names), when it has none yet */
function withCumparsitas(
  p: Playlist,
  deps: ComposeDeps,
  want: { open?: boolean; close?: boolean },
): Playlist {
  const first = p.tandas[0];
  const last = p.tandas.at(-1);
  if (!first || !last) return p;
  const o = nightOptions(p.options);
  const place = cumparsitaPlacement(p.options);
  const fmt = closingFormatOf(p.options);
  let np = p;
  if (want.close && fmt !== "none" && place.close && !p.closing) {
    const s = closingFor(deps.catalog, o, last, p.opening ?? null).song;
    if (s) np = { ...np, closing: s };
  }
  if (want.open && place.open && !p.opening) {
    const s = openingCumparsita(deps.catalog, o, first, np.closing ?? null).song;
    if (s) np = { ...np, opening: s };
  }
  return np;
}

/** the DJ picks the cortina after tanda `i` (marked theirs: re-picks and mending keep it) */
export function pickNightCortina(p: Playlist, i: number, c: Cortina): Playlist {
  const t = p.tandas[i];
  if (!t) return p;
  const len = t.cortina?.lengthSec ?? c.lengthSec ?? p.options.cortinaLengthSec;
  return withTandas(
    p,
    p.tandas.map((x, k) => (k === i ? { ...x, cortina: { ...c, lengthSec: len, picked: true } } : x)),
  );
}

/** what a room's "Night settings" sheet changes (each optional; the rest of the night stays) */
export interface NightSettingsPatch {
  cortinaCultures?: string[];
  cortinaGenres?: string[];
  /** 20–90 s */
  cortinaLengthSec?: number;
  /** the cortina's fade-out, 3–6 s (the booth plan) */
  cortinaFadeOutSec?: number;
  cortinaChoice?: "auto" | "pick";
  pattern?: Playlist["options"]["pattern"];
  lastFourTango?: boolean;
  closingFormat?: ClosingFormat;
  /** the opening La Cumparsita */
  opening?: boolean;
}

/**
 * A room's night settings on its night (owner's edits, synced to every DJ): the options change, the cortinas are
 * re-mended — the cortina culture / genre and "Auto" re-pick the automatic ones (the DJ's picks stay unless Auto),
 * the length is every cortina's, the closing format decides the última's cortina and La Cumparsita, the opening
 * La Cumparsita comes or goes.
 */
export function applyNightSettings(p: Playlist, patch: NightSettingsPatch, deps: ComposeDeps): Playlist {
  const opts = { ...p.options } as Playlist["options"];
  const rules = { ...(opts.rules ?? {}) };
  let refresh = false;
  if (patch.cortinaCultures) {
    opts.cortinaCultures = patch.cortinaCultures.slice(0, 12);
    refresh = true;
  }
  if (patch.cortinaGenres) {
    if (patch.cortinaGenres.length) opts.cortinaGenres = patch.cortinaGenres.slice(0, 12);
    else delete opts.cortinaGenres;
    refresh = true;
  }
  let lengthSec: number | undefined;
  if (typeof patch.cortinaLengthSec === "number" && Number.isFinite(patch.cortinaLengthSec)) {
    lengthSec = Math.round(Math.min(90, Math.max(20, patch.cortinaLengthSec)));
    opts.cortinaLengthSec = lengthSec;
  }
  let tandas = p.tandas;
  if (patch.cortinaChoice) {
    opts.cortinaChoice = patch.cortinaChoice;
    if (patch.cortinaChoice === "auto") {
      tandas = tandas.map((t) =>
        t.cortina?.picked ? { ...t, cortina: { ...t.cortina, picked: undefined } } : t,
      );
      refresh = true;
    }
  }
  if (patch.pattern) opts.pattern = patch.pattern;
  if (typeof patch.lastFourTango === "boolean") rules.lastFourTango = patch.lastFourTango || undefined;
  let closing = p.closing;
  let opening = p.opening ?? null;
  if (patch.closingFormat) {
    rules.closingFormat = patch.closingFormat;
    if (patch.closingFormat === "none") closing = null;
  }
  if (typeof patch.opening === "boolean") {
    const close = cumparsitaPlacement({ ...opts, rules }).close;
    rules.cumparsita = patch.opening ? (close ? "both" : "open") : close ? "close" : "none";
    delete rules.openWithCumparsita;
    if (!patch.opening) opening = null;
  }
  opts.rules = rules;
  let np: Playlist = { ...p, options: opts, tandas, closing, opening };
  if (typeof patch.cortinaFadeOutSec === "number" && Number.isFinite(patch.cortinaFadeOutSec))
    np = attachBooth(np, { cortinaFadeOutSec: patch.cortinaFadeOutSec });
  if (lengthSec !== undefined && np.booth?.cortinaStopSec !== undefined)
    np = attachBooth(np, { cortinaStopSec: lengthSec });
  const mended = mendNightCortinas(np, deps, {
    refresh,
    cumparsitas: {
      open: patch.opening === true,
      close: !!patch.closingFormat && patch.closingFormat !== "none",
    },
    lengthSec,
  });
  return mended === np ? withTandas(np, np.tandas) : mended;
}
