import { attachBooth } from "./booth";
import { sideBpm, sideGain, sideProblem, tandaRulesOf } from "./coherence";
import { type ComposeDeps, computeStats } from "./compose";
import { isDanceableSong, normTitle } from "./energy";
import { asFavouriteTable, type DancerFavourites, type FavouriteTable, isFavouriteSide } from "./favourites";
import { scorePlaylist } from "./score";
import { isTandaEligible } from "./tanda";
import type { Playlist, Song, Tanda } from "./types";

/**
 * Round 21 — the Swap sheet (docs/specs/round21-engine.md §7): one sheet per song, on the result page and in the
 * booth. Suggestions are the sides that keep the tanda valid (the same orchestra and singer, the voice, the vocal
 * style, the year band, the tempo / level / tone bands, not already in the night, a checked Spotify id), ranked by fit;
 * a search over the whole catalogue shows the same validity with the reason anything is excluded. Swapping re-times
 * and re-scores the night and keeps the Spotify id the catalogue judged.
 */
export interface SwapOption {
  song: Song;
  ok: boolean;
  /** why the side may not take the chair (unset when ok) */
  reason?: string;
  /** 0..1, higher fits better (energy, tempo, level against the side it replaces, fame) */
  fit: number;
  /** 2026-11: a dancer favourite in this tanda's slot role (♥; ranked first among the valid sides) */
  favourite?: boolean;
}

/** the playlist's stats again, keeping the opening, the show break and the recorded fallbacks */
export function restat(p: Playlist, tandas: Tanda[]): Playlist["stats"] {
  const st = computeStats(tandas, p.closing, p.options);
  if (p.opening) {
    st.durationSec += p.opening.durationSec ?? 180;
    st.tracks += 1;
  }
  for (const b of p.breaks ?? []) st.durationSec += b.minutes * 60;
  if (p.stats?.settingFallbacks) st.settingFallbacks = p.stats.settingFallbacks;
  if (p.stats?.cortinaFallback) st.cortinaFallback = p.stats.cortinaFallback;
  return st;
}

/** a tanda rebuilt around new sides: the energy curve, the years, the length */
export function retimeTanda(t: Tanda, songs: Song[]): Tanda {
  const years = songs.map((s) => (s.year && !s.yearApprox ? s.year : null)).filter((y): y is number => !!y);
  const curve = songs.map((s) => s.energy ?? 50);
  return {
    ...t,
    songs,
    energyCurve: curve,
    energy: Math.round(curve.reduce((a, b) => a + b, 0) / Math.max(1, curve.length)),
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : t.yearRange,
    durationSec: songs.reduce((a, s) => a + (s.durationSec ?? 170), 0),
  };
}

/** the night with the tandas replaced: re-stated, re-timed (booth plan) and re-scored */
export function renight(p: Playlist, tandas: Tanda[]): Playlist {
  const np = attachBooth({ ...p, tandas, stats: restat(p, tandas) });
  np.score = scorePlaylist(np);
  return np;
}

const fitOf = (cur: Song, s: Song, rhythm: string) => {
  const e = 1 - Math.min(1, Math.abs((s.energy ?? 50) - (cur.energy ?? 50)) / 25);
  const b0 = sideBpm(cur, rhythm),
    b1 = sideBpm(s, rhythm);
  const b = b0 && b1 ? 1 - Math.min(1, Math.abs(b1 - b0) / b0 / 0.12) : 0.5;
  const g0 = sideGain(cur),
    g1 = sideGain(s);
  const g = g0 !== null && g1 !== null ? 1 - Math.min(1, Math.abs(g1 - g0) / 6) : 0.5;
  return Math.round((0.45 * e + 0.2 * b + 0.1 * g + 0.25 * Math.min(1, (s.fame ?? 0) / 5)) * 100) / 100;
};

/** why `s` may not take chair `si` of tanda `ti` (null: it may) */
export function swapReason(p: Playlist, ti: number, si: number, s: Song, deps: ComposeDeps): string | null {
  const t = p.tandas[ti];
  const cur = t?.songs[si];
  if (!t || !cur) return "no such chair";
  if (s.id === cur.id) return "the side playing in this chair";
  if (normTitle(s.title) === "la cumparsita") return "La Cumparsita opens or closes the night only";
  const usedIds = new Set(p.tandas.flatMap((x) => x.songs.map((y) => y.id)));
  const usedTitles = new Map<string, number>();
  p.tandas.forEach((x, i) => {
    for (const y of x.songs) if (!(i === ti && y.id === cur.id)) usedTitles.set(normTitle(y.title), i);
  });
  if (usedIds.has(s.id)) return "already in the night";
  if (usedTitles.has(normTitle(s.title)))
    return `the title already plays in tanda ${usedTitles.get(normTitle(s.title))! + 1}`;
  if (s.orchestraId !== t.orchestraId) return `another orchestra (${s.orchestra}); a tanda is one orchestra`;
  if (
    t.vocal &&
    s.vocal &&
    (s.singerId ?? null) !== (cur.singerId ?? null) &&
    t.songs.every((x) => x.singerId === cur.singerId)
  )
    return `another singer (${s.singer}); the tanda is ${cur.singer}'s`;
  if (!isTandaEligible(s, !!p.options.rules?.allowUndated)) return "not a dated studio side";
  if (!isDanceableSong(s, deps.catalog.blacklist) || deps.catalog.nonDance(s.orchestraId, s.title, s.year))
    return "not for dancing";
  const others = t.songs.filter((_, i) => i !== si);
  // (round 21c: voice, vocal style and the years decide; the tempo / level bands and the tone only rank — `fit`)
  const soft = {
    ...p.options,
    tandaRules: { ...tandaRulesOf(p.options), bpmBand: false, levelBand: false, tone: "inside" as const },
  };
  const why = sideProblem(others, s, { rhythm: t.rhythm, o: soft });
  if (why) return why;
  if (!s.spotify?.uri) return "no checked Spotify recording";
  return null;
}

/**
 * The Swap sheet's lists for chair `si` of tanda `ti`: `suggestions` (valid sides of the tanda's family, best fit
 * first) and, with a query, `results` (the catalogue by title, orchestra or singer, valid ones first, each excluded
 * one with its reason).
 */
export function swapOptions(
  p: Playlist,
  ti: number,
  si: number,
  deps: ComposeDeps,
  opts: {
    query?: string;
    limit?: number;
    favourites?: FavouriteTable | DancerFavourites | null;
    /** 2026-11: judge exactly these sides (the smart search's results), in this order; unknown ids are left out */
    ids?: readonly string[];
  } = {},
): { suggestions: SwapOption[]; results: SwapOption[]; judged: SwapOption[] } {
  const t = p.tandas[ti];
  const cur = t?.songs[si];
  if (!t || !cur) return { suggestions: [], results: [], judged: [] };
  const limit = opts.limit ?? 12;
  // 2026-11: the dancer favourites of this tanda's role (the request's, else the night's own; null = none)
  const fav =
    opts.favourites === null ? undefined : asFavouriteTable(opts.favourites ?? p.options?.favourites);
  const judge = (s: Song): SwapOption => {
    const reason = swapReason(p, ti, si, s, deps);
    const heart = !reason && isFavouriteSide(fav, s.id, t.phase);
    return {
      song: s,
      ok: !reason,
      ...(reason ? { reason } : {}),
      fit: fitOf(cur, s, t.rhythm),
      ...(heart ? { favourite: true } : {}),
    };
  };
  const rank = (a: SwapOption, b: SwapOption) =>
    Number(b.ok) - Number(a.ok) ||
    Number(!!b.favourite) - Number(!!a.favourite) ||
    b.fit - a.fit ||
    a.song.id.localeCompare(b.song.id);
  const fam = (deps.catalog.byOrchestra.get(t.orchestraId) ?? []).filter((s) => s.rhythm === t.rhythm);
  const suggestions = fam
    .map(judge)
    .filter((x) => x.ok)
    .sort(rank)
    .slice(0, limit);
  const q = normTitle(opts.query ?? "").trim();
  let results: SwapOption[] = [];
  if (q.length >= 2) {
    const words = q.split(" ").filter(Boolean);
    const hay = (s: Song) => ` ${normTitle(`${s.title} ${s.orchestra} ${s.singer ?? ""} ${s.year ?? ""}`)} `;
    results = deps.catalog.songs
      .filter((s) => s.rhythm === t.rhythm && words.every((w) => hay(s).includes(w)))
      .slice(0, 400)
      .map(judge)
      .sort(rank)
      .slice(0, Math.max(limit, 30));
  }
  const byId = (id: string) => deps.catalog.songs.find((x) => x.id === id || x.altIds?.includes(id));
  const judged = (opts.ids ?? [])
    .slice(0, 200)
    .map(byId)
    .filter((s): s is Song => !!s)
    .map(judge);
  return { suggestions, results, judged };
}

/**
 * 2026-11 (the owner: "I can't swap a tanda by searching, selecting and reordering songs"): the DJ's own tanda in
 * place `ti` — the sides in the DJ's order, each a catalogue id or a recording given whole (one a connected service
 * found), re-timed, named after its sides (orchestra, singer, rhythm), pinned as the DJ's and the night re-scored. The
 * rule check (editCheck) judges it before it applies; this only refuses what cannot be a tanda at all.
 */
export function setTandaSides(
  p: Playlist,
  ti: number,
  sides: ReadonlyArray<string | Song>,
  deps: ComposeDeps,
): { playlist: Playlist; reason?: string } {
  const t = p.tandas[ti];
  if (!t) return { playlist: p, reason: "no such tanda" };
  if (!sides.length) return { playlist: p, reason: "a tanda needs at least one side" };
  if (sides.length > 8) return { playlist: p, reason: "a tanda holds at most eight sides" };
  const songs: Song[] = [];
  for (const x of sides) {
    const s = typeof x === "string" ? deps.catalog.songs.find((y) => y.id === x || y.altIds?.includes(x)) : x;
    if (!s) return { playlist: p, reason: `no such side (${String(x)})` };
    songs.push(s);
  }
  const first = songs[0]!;
  const rhythms = new Set(songs.map((s) => s.rhythm));
  const voices = songs.filter((s) => s.vocal && s.singer);
  const singer =
    voices.length && voices.every((s) => s.singer === voices[0]!.singer) ? voices[0]!.singer : null;
  const nt: Tanda = {
    ...retimeTanda(t, songs),
    rhythm: (rhythms.size === 1 ? first.rhythm : t.rhythm) as Tanda["rhythm"],
    orchestra: first.orchestra,
    orchestraId: first.orchestraId,
    singer,
    vocal: songs.some((s) => s.vocal),
    locked: true,
    pinned: { by: "dj", reason: "DJ's tanda", at: new Date().toISOString() },
  };
  const tandas = p.tandas.map((x, i) => (i === ti ? nt : x));
  try {
    return { playlist: renight(p, tandas) };
  } catch {
    // a partial night (an imported file without its booth plan): the tandas are what matters
    return { playlist: { ...p, tandas } };
  }
}

/** put `songId` in chair `si` of tanda `ti` (a valid side only, unless `force` — the DJ's own choice, then pinned) */
export function replaceSide(
  p: Playlist,
  ti: number,
  si: number,
  songId: string,
  deps: ComposeDeps,
  opts: { force?: boolean; pin?: boolean } = {},
): { playlist: Playlist; reason?: string } {
  const t = p.tandas[ti];
  const s = deps.catalog.songs.find((x) => x.id === songId || x.altIds?.includes(songId));
  if (!t || !s) return { playlist: p, reason: "no such side" };
  const reason = swapReason(p, ti, si, s, deps);
  if (reason && !opts.force) return { playlist: p, reason };
  const songs = t.songs.map((x, i) => (i === si ? s : x));
  let nt = retimeTanda(t, songs);
  if (opts.pin || (reason && opts.force))
    nt = {
      ...nt,
      locked: true,
      pinned: {
        by: "dj",
        reason: reason ? `DJ's choice: ${reason}` : "DJ's choice",
        at: new Date().toISOString(),
      },
    };
  return {
    playlist: renight(
      p,
      p.tandas.map((x, i) => (i === ti ? nt : x)),
    ),
    ...(reason ? { reason } : {}),
  };
}
