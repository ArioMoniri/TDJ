import { popularityScore } from "./popularity";
import { filterSongs, type SongHit, type SongQuery } from "./songSearch";
import {
  buildTextIndex,
  highlight,
  matchWords,
  type QueryWord,
  queryWords,
  suggest,
  type TextIndex,
  type TextMatch,
} from "./textIndex";
import type { Playlist, Song } from "./types";

/**
 * The one song search (2026-11): every caller — the Library, the Database, the Booth's search, the swap sheet and
 * Build by hand — can ask `searchSongs(index, query, opts)` and get `{ items, total, facets }`.
 *
 * The index is built once per catalogue (`buildSongIndex`, or `Catalog.searchIndex()`), over the fields title
 * (10) > alternative titles (7) > orchestra (6) > its aliases from the orchestra profiles (5: "OTV", "Pichuco") >
 * singer (4) > year (3) = rhythm (3: "vals", "valses", "waltz") > album (1). The text side is textIndex.ts. On top:
 *
 *  - inline filters, the same as the chips: `rhythm:vals`, `year:1940-1945`, `1940-45`, `40s` / `1940s`,
 *    `inst` / `instrumental` / `vocal`, `t12` (a tanda of the night, when the caller passes `tandaOf`),
 *    `has:spotify`, `is:fav` / `♥`, and `orchestra:` / `singer:` / `title:` to hold a word to one field;
 *  - ranking: text relevance, then popularity (dancer popularity from databases, else the corpus fame), then a
 *    playable stream, then the title;
 *  - facets for the chips: per rhythm, decade, orchestra, singer, vocal / instrumental, Spotify and favourites, each
 *    counted with every other chip applied but its own (so picking "Vals" still shows how many tangos there are);
 *  - "did you mean": with no result, each word that matched nothing replaced by its nearest well-known word.
 */

export interface SongIndex {
  text: TextIndex<Song>;
  songs: Song[];
  /** per song: popularity 0..1 */
  pop: Float32Array;
  /** per song: has a stream to play (Spotify or a resolved preview) */
  stream: Uint8Array;
  spotify: Uint8Array;
  decade: Int16Array;
  /** columns for the filters and facets (dictionary codes; plain arrays of typed values are much faster here) */
  year: Int16Array;
  rhythm: Uint8Array;
  rhythms: string[];
  orch: Uint16Array;
  orchestras: Array<{ id: string; name: string }>;
  /** singer code, 0 = instrumental */
  singer: Uint16Array;
  singers: string[];
  /** the title's rank in sorted order (ties by title without string compares) */
  titleRank: Int32Array;
  /** song id → position */
  pos: Map<string, number>;
  /** reused per query */
  scratch: { fav: Uint8Array; key: Float64Array };
}

const RHYTHM_WORDS: Record<string, string[]> = {
  tango: ["tango", "tangos"],
  vals: ["vals", "valses", "valsecito", "waltz"],
  milonga: ["milonga", "milongas"],
  cancion: ["cancion", "canciones"],
  foxtrot: ["foxtrot", "fox"],
};
/** a rhythm as the DJ may type it → the index's rhythm */
const RHYTHM_OF: Record<string, string> = {};
for (const [r, ws] of Object.entries(RHYTHM_WORDS)) for (const w of ws) RHYTHM_OF[w] = r;

export const SONG_FIELDS = [
  "title",
  "alt",
  "orchestra",
  "alias",
  "singer",
  "year",
  "rhythm",
  "album",
] as const;

export interface SongIndexOptions {
  /** the orchestra's other names (the orchestra profiles' `aliases`) */
  aliases?: (orchestraId: string) => readonly string[] | undefined;
  /** 0..1 per recording; default: dancer popularity from databases where it is loaded (blended with fame), else none */
  popularity?: (s: Song) => number | undefined;
}

/** something the app's player can play: a Spotify track, or a resolved preview (the player's `sourceFor`) */
const streamOf = (s: Song) => !!(s.spotify?.uri || s.resolved?.previewUrl);

export function buildSongIndex(songs: Song[], o: SongIndexOptions = {}): SongIndex {
  const text = buildTextIndex<Song>(songs, [
    { name: "title", weight: 10, get: (s) => s.title },
    { name: "alt", weight: 7, get: (s) => s.altTitles },
    { name: "orchestra", weight: 6, get: (s) => s.orchestra },
    { name: "alias", weight: 5, get: (s) => o.aliases?.(s.orchestraId) },
    { name: "singer", weight: 4, get: (s) => s.singer },
    { name: "year", weight: 3, get: (s) => (s.year ? String(s.year) : null) },
    { name: "rhythm", weight: 3, get: (s) => RHYTHM_WORDS[s.rhythm] ?? [s.rhythm] },
    { name: "album", weight: 1, get: (s) => s.album ?? s.spotify?.album },
  ]);
  const n = songs.length;
  const pop = new Float32Array(n);
  const stream = new Uint8Array(n);
  const spotify = new Uint8Array(n);
  const decade = new Int16Array(n);
  songs.forEach((s, i) => {
    const p = o.popularity ? o.popularity(s) : popularityScore(s.id);
    const fame = Math.min(5, s.fame ?? 0) / 5;
    // the corpus fame is per title (every version of a famous title shares it); the dancer popularity is per
    // recording, so where it is loaded it decides between the versions
    pop[i] = (p === undefined ? fame : 0.6 * p + 0.4 * fame) + (s.spotify?.popularity ?? 0) / 10000;
    stream[i] = streamOf(s) ? 1 : 0;
    spotify[i] = s.spotify?.uri ? 1 : 0;
    decade[i] = s.year ? Math.floor(s.year / 10) * 10 : 0;
  });
  const code = <K>(m: Map<K, number>, k: K, add: () => void) => {
    let c = m.get(k);
    if (c === undefined) {
      c = m.size;
      m.set(k, c);
      add();
    }
    return c;
  };
  const rhythms: string[] = [];
  const orchestras: Array<{ id: string; name: string }> = [];
  const singers: string[] = [""];
  const rM = new Map<string, number>();
  const oM = new Map<string, number>();
  const sM = new Map<string, number>([["", 0]]);
  const year = new Int16Array(n);
  const rhythm = new Uint8Array(n);
  const orch = new Uint16Array(n);
  const singer = new Uint16Array(n);
  const pos = new Map<string, number>();
  songs.forEach((s, i) => {
    year[i] = s.year ?? 0;
    rhythm[i] = code(rM, s.rhythm, () => rhythms.push(s.rhythm));
    orch[i] = code(oM, s.orchestraId, () => orchestras.push({ id: s.orchestraId, name: s.orchestra }));
    singer[i] = s.singer ? code(sM, s.singer, () => singers.push(s.singer!)) : 0;
    pos.set(s.id, i);
  });
  const byTitle = Array.from(songs, (_, i) => i).sort((a, b) =>
    songs[a]!.title < songs[b]!.title ? -1 : songs[a]!.title > songs[b]!.title ? 1 : 0,
  );
  const titleRank = new Int32Array(n);
  byTitle.forEach((i, r) => {
    titleRank[i] = r;
  });
  return {
    text,
    songs,
    pop,
    stream,
    spotify,
    decade,
    year,
    rhythm,
    rhythms,
    orch,
    orchestras,
    singer,
    singers,
    titleRank,
    pos,
    scratch: { fav: new Uint8Array(n), key: new Float64Array(n) },
  };
}

/** the chips: AND across kinds, OR inside one (two rhythms = either) */
export interface SongFilters {
  rhythms?: string[];
  decades?: number[];
  orchestraIds?: string[];
  /** singer names as shown; "" = instrumental */
  singers?: string[];
  vocal?: boolean;
  yearFrom?: number;
  yearTo?: number;
  hasSpotify?: boolean;
  hasStream?: boolean;
  /** the DJ's favourite song ids (counted in the facets); `favouritesOnly` keeps just those */
  favourites?: readonly string[] | ReadonlySet<string>;
  favouritesOnly?: boolean;
}

export interface ParsedSongQuery {
  /** the words left for the text match */
  text: QueryWord[];
  filters: SongFilters & { tanda?: number };
  /** what the query said as filters, for the UI to show as chips */
  tokens: Array<{ kind: "rhythm" | "year" | "vocal" | "tanda" | "spotify" | "favourites"; raw: string }>;
}

const YEAR = (y: string, base?: number) => {
  const n = Number(y);
  if (y.length === 4) return n;
  if (y.length === 2) return base !== undefined ? Math.floor(base / 100) * 100 + n : 1900 + n;
  return Number.NaN;
};

/** cut a query into inline filters and the words to match */
export function parseSongQuery(q: string): ParsedSongQuery {
  const raw = String(q ?? "").slice(0, 400);
  const filters: ParsedSongQuery["filters"] = {};
  const tokens: ParsedSongQuery["tokens"] = [];
  const rest: string[] = [];
  const chunks = raw.split(/\s+/).filter(Boolean);
  const range = (a: number, b: number) => {
    filters.yearFrom = Math.min(a, b);
    filters.yearTo = Math.max(a, b);
  };
  /** each inline filter: its pattern, and what it sets (false: not a filter after all, a word) */
  const RULES: Array<[RegExp, ParsedSongQuery["tokens"][number]["kind"], (m: RegExpExecArray) => boolean]> = [
    [
      /^(?:rhythm|ritmo|ritim|r):(.+)$/,
      "rhythm",
      (m) => {
        const r = RHYTHM_OF[m[1]!.normalize("NFD").replace(/\p{M}/gu, "")] ?? m[1]!;
        filters.rhythms = [...(filters.rhythms ?? []), r];
        return true;
      },
    ],
    [
      /^(?:year|y|ano|año|yil|yıl):(\d{4})(?:[-–—](\d{2}|\d{4}))?$/,
      "year",
      (m) => {
        const a = YEAR(m[1]!);
        range(a, m[2] ? YEAR(m[2], a) : a);
        return true;
      },
    ],
    [
      /^(\d{4})[-–—](\d{2}|\d{4})$/,
      "year",
      (m) => {
        const a = YEAR(m[1]!);
        range(a, YEAR(m[2]!, a));
        return true;
      },
    ],
    [
      /^['’]?(\d{2}|\d{3}0)['’]?(?:s|ler|lar)$/,
      "year",
      (m) => {
        const d = m[1]!.length === 2 ? YEAR(m[1]!) : Number(m[1]);
        if (d % 10 !== 0) return false;
        range(d, d + 9);
        return true;
      },
    ],
    [
      /^(?:inst|instr|instrumental|instrumentales|instrumentals|enstrumantal|enstrümantal)$/,
      "vocal",
      () => {
        filters.vocal = false;
        return true;
      },
    ],
    [
      /^(?:vocal|vocals|vocales|cantado|cantada|sung|vokal|sozlu|sözlü)$/,
      "vocal",
      () => {
        filters.vocal = true;
        return true;
      },
    ],
    [
      /^t(\d{1,2})$/,
      "tanda",
      (m) => {
        filters.tanda = Number(m[1]);
        return true;
      },
    ],
    [
      /^has:(?:spotify|stream)$/,
      "spotify",
      () => {
        filters.hasSpotify = true;
        return true;
      },
    ],
    [
      /^(?:is:fav|is:favourite|is:favorite|♥|❤|❤️)$/,
      "favourites",
      () => {
        filters.favouritesOnly = true;
        return true;
      },
    ],
  ];
  let lastIsText = false;
  for (const c of chunks) {
    const l = c.toLowerCase();
    const rule = RULES.find(([re]) => re.test(l));
    const m = rule ? rule[0].exec(l) : null;
    if (rule && m && rule[2](m)) {
      tokens.push({ kind: rule[1], raw: c });
      lastIsText = false;
    } else {
      rest.push(c);
      lastIsText = true;
    }
  }
  // the last word is a prefix only while it is being typed (the query's last chunk, no space after it)
  const text = queryWords(rest.join(" ") + (lastIsText && !/\s$/.test(raw) ? "" : " "), [...SONG_FIELDS]);
  return { text, filters, tokens };
}

export interface SongSearchOptions {
  filters?: SongFilters;
  limit?: number;
  offset?: number;
  /** "orchestra": the items come grouped (each orchestra where its best side ranks), with `groups` */
  group?: "orchestra";
  /** the tanda (1-based) a song sits in tonight, for `t12` */
  tandaOf?: (songId: string) => number | undefined;
  /** how many orchestras / singers the facets list (default 12) */
  facetLimit?: number;
}

export interface SongSearchHit {
  song: Song;
  score: number;
  /** spans of the original text that matched, for highlighting */
  highlights: {
    title?: Array<[number, number]>;
    orchestra?: Array<[number, number]>;
    singer?: Array<[number, number]>;
  };
  favourite?: boolean;
  popularity: number;
}

export interface Facet<K = string> {
  key: K;
  count: number;
  label?: string;
}
export interface SongFacets {
  rhythm: Facet[];
  decade: Array<Facet<number>>;
  orchestra: Facet[];
  singer: Facet[];
  vocal: { vocal: number; instrumental: number };
  spotify: number;
  favourites: number;
}

export interface SongSearchResult {
  items: SongSearchHit[];
  total: number;
  facets: SongFacets;
  /** with 0 results: a close spelling that finds some ("pugliese yumba") */
  suggestion?: string;
  /** results came only from close spellings of these words (typed → found) */
  corrected?: Array<{ typed: string; found: string }>;
  groups?: Array<{ orchestraId: string; orchestra: string; count: number }>;
  /** the filters the query itself carried */
  parsed: ParsedSongQuery["tokens"];
}

const DIM = {
  rhythm: 1,
  decade: 2,
  orchestra: 4,
  singer: 8,
  vocal: 16,
  spotify: 32,
  favourites: 64,
  all: 127,
} as const;

/**
 * The song search. Overloads: `searchSongs(index, "query", opts)` is the engine; the older
 * `searchSongs(songs, { text, orchestra, … }, playlist?)` (round 22's search panel) still answers as before.
 */
export function searchSongs(index: SongIndex, query: string, opts?: SongSearchOptions): SongSearchResult;
export function searchSongs(songs: Song[], q: SongQuery, p?: Playlist | null): SongHit[];
export function searchSongs(
  a: SongIndex | Song[],
  b: string | SongQuery,
  c?: SongSearchOptions | Playlist | null,
): SongSearchResult | SongHit[] {
  if (Array.isArray(a)) return filterSongs(a, (b ?? {}) as SongQuery, c as Playlist | null | undefined);
  return runSearch(a, typeof b === "string" ? b : String(b ?? ""), (c ?? {}) as SongSearchOptions);
}

function runSearch(ix: SongIndex, query: string, o: SongSearchOptions): SongSearchResult {
  const parsed = parseSongQuery(query);
  const f: SongFilters & { tanda?: number } = { ...parsed.filters, ...(o.filters ?? {}) };
  // a query's own year / rhythm narrows the chips' further
  if (parsed.filters.rhythms && o.filters?.rhythms)
    f.rhythms = o.filters.rhythms.filter((r) => parsed.filters.rhythms!.includes(r));
  if (parsed.filters.yearFrom !== undefined) {
    f.yearFrom = Math.max(parsed.filters.yearFrom, o.filters?.yearFrom ?? 0);
    f.yearTo = Math.min(parsed.filters.yearTo!, o.filters?.yearTo ?? 9999);
  }
  if (parsed.filters.favouritesOnly) f.favouritesOnly = true;
  if (parsed.filters.hasSpotify) f.hasSpotify = true;
  const songs = ix.songs;
  const favSet = f.favourites ? (f.favourites instanceof Set ? f.favourites : new Set(f.favourites)) : null;
  const n = songs.length;
  /** per song: one of the DJ's favourites */
  const fav = ix.scratch.fav;
  fav.fill(0);
  if (favSet)
    for (const id of favSet) {
      const i = ix.pos.get(id as string);
      if (i !== undefined) fav[i] = 1;
    }
  const codeSet = (
    wanted: readonly (string | number)[] | undefined,
    names: readonly string[],
    key?: (x: never) => string,
  ) => {
    if (!wanted?.length) return null;
    const w = new Set(wanted.map(String));
    const out = new Uint8Array(names.length);
    names.forEach((x, c) => {
      if (w.has(key ? key(x as never) : x)) out[c] = 1;
    });
    return out;
  };
  const rh = codeSet(f.rhythms, ix.rhythms);
  const orch = codeSet(
    f.orchestraIds,
    ix.orchestras.map((x) => x.id),
  );
  const sing = codeSet(f.singers, ix.singers);
  const dec = f.decades?.length ? new Set(f.decades) : null;
  const tandaOf = o.tandaOf;
  const yFrom = f.yearFrom;
  const yTo = f.yearTo;
  const vocal = f.vocal;

  /**
   * Which chips a song fails, as bits (the facets count a dimension over the songs failing nothing but it), or -1
   * when a filter no chip shows (year range, tanda, a stream) fails.
   */
  const fails = (i: number): number => {
    const y = ix.year[i]!;
    if (yFrom !== undefined && (!y || y < yFrom)) return -1;
    if (yTo !== undefined && (!y || y > yTo)) return -1;
    if (f.tanda !== undefined && tandaOf && tandaOf(songs[i]!.id) !== f.tanda) return -1;
    if (f.hasStream && !ix.stream[i]) return -1;
    let m = 0;
    if (rh && !rh[ix.rhythm[i]!]) m |= DIM.rhythm;
    if (dec && !dec.has(ix.decade[i]!)) m |= DIM.decade;
    if (orch && !orch[ix.orch[i]!]) m |= DIM.orchestra;
    if (sing && !sing[ix.singer[i]!]) m |= DIM.singer;
    if (vocal !== undefined && ix.singer[i]! > 0 !== vocal) m |= DIM.vocal;
    if (f.hasSpotify && !ix.spotify[i]) m |= DIM.spotify;
    if (f.favouritesOnly && !fav[i]) m |= DIM.favourites;
    return m;
  };
  const pass = (i: number) => fails(i) === 0;

  const empty: SongFacets = {
    rhythm: [],
    decade: [],
    orchestra: [],
    singer: [],
    vocal: { vocal: 0, instrumental: 0 },
    spotify: 0,
    favourites: 0,
  };
  const noWords = !parsed.text.length;
  // a query of only punctuation ("(", ".*") asks for nothing
  if (noWords && !parsed.tokens.length && query.trim() && !/^\s*$/.test(query))
    return { items: [], total: 0, facets: empty, parsed: parsed.tokens };
  // the tanda token needs the night; without one it is ignored
  if (f.tanda !== undefined && !tandaOf) delete f.tanda;

  const m: TextMatch = matchWords(ix.text, parsed.text);
  const baseCount = m.hits ? m.hits.length : n;

  // one pass: the songs that pass, and the facet counts (each dimension with every other chip on)
  const facets = empty;
  const rhythmC = new Int32Array(ix.rhythms.length);
  const decadeC = new Int32Array(300);
  const orchC = new Int32Array(ix.orchestras.length);
  const singC = new Int32Array(ix.singers.length);
  const hits: number[] = [];
  for (let k = 0; k < baseCount; k++) {
    const i = m.hits ? m.hits[k]! : k;
    const mask = fails(i);
    if (mask < 0) continue;
    if (mask === 0) hits.push(i);
    if (mask & (mask - 1)) continue; // fails two chips: counts nowhere
    if (!(mask & ~DIM.rhythm)) rhythmC[ix.rhythm[i]!]!++;
    const dc = ix.decade[i]!;
    if (dc && !(mask & ~DIM.decade)) decadeC[dc / 10 - 170]!++;
    if (!(mask & ~DIM.orchestra)) orchC[ix.orch[i]!]!++;
    const sc = ix.singer[i]!;
    if (sc && !(mask & ~DIM.singer)) singC[sc]!++;
    if (!(mask & ~DIM.vocal)) {
      if (sc) facets.vocal.vocal++;
      else facets.vocal.instrumental++;
    }
    if (ix.spotify[i] && !(mask & ~DIM.spotify)) facets.spotify++;
    if (fav[i] && !(mask & ~DIM.favourites)) facets.favourites++;
  }

  // the ranking: the songs every word matched as typed before those found by a close spelling; then text relevance
  // with popularity and a playable stream in the same score; ties by title and year
  const key = ix.scratch.key;
  for (const i of hits)
    key[i] = (m.loose?.[i] ? 0 : 1e6) + (m.score?.[i] ?? 0) + 4 * ix.pop[i]! + 0.5 * ix.stream[i]!;
  const cmp = (x: number, y: number) =>
    key[y]! - key[x]! ||
    ix.titleRank[x]! - ix.titleRank[y]! ||
    (ix.year[x]! || 9999) - (ix.year[y]! || 9999) ||
    x - y;
  const off = Math.max(0, o.offset ?? 0);
  const limit = Math.max(0, Math.min(500, o.limit ?? 50));
  const want = off + limit;
  let ranked: number[];
  if (o.group !== "orchestra" && hits.length > want * 4 && hits.length > 400) {
    // only the page needs an order: the want-th best key, then a full sort of what reaches it
    const ks = Float64Array.from(hits, (i) => key[i]!).sort();
    const cut = ks[ks.length - want]!;
    ranked = hits.filter((i) => key[i]! >= cut).sort(cmp);
  } else ranked = hits.sort(cmp);
  const score = (i: number) => m.score?.[i] ?? 0;

  const top = <K>(e: Array<Facet<K>>, k: number) => e.sort((a, b) => b.count - a.count).slice(0, k);
  const lim = o.facetLimit ?? 12;
  const list = <K>(counts: Int32Array, at: (c: number) => Facet<K>) => {
    const out: Array<Facet<K>> = [];
    counts.forEach((c, i) => {
      if (c > 0) out.push({ ...at(i), count: c });
    });
    return out;
  };
  facets.rhythm = top(
    list(rhythmC, (c) => ({ key: ix.rhythms[c]!, count: 0 })),
    50,
  );
  facets.decade = list(decadeC, (c) => ({ key: (c + 170) * 10, count: 0 }));
  facets.orchestra = top(
    list(orchC, (c) => ({ key: ix.orchestras[c]!.id, label: ix.orchestras[c]!.name, count: 0 })),
    lim,
  );
  facets.singer = top(
    list(singC, (c) => ({ key: ix.singers[c]!, count: 0 })),
    lim,
  );

  let order = ranked;
  let groups: SongSearchResult["groups"];
  if (o.group === "orchestra") {
    const byOrch = new Map<string, number[]>();
    for (const i of ranked) {
      const k = songs[i]!.orchestraId;
      const l = byOrch.get(k);
      if (l) l.push(i);
      else byOrch.set(k, [i]);
    }
    order = [...byOrch.values()].flat();
    groups = [...byOrch].map(([k, l]) => ({
      orchestraId: k,
      orchestra: songs[l[0]!]!.orchestra,
      count: l.length,
    }));
  }

  const items: SongSearchHit[] = order.slice(off, off + limit).map((i) => {
    const s = songs[i]!;
    const hl: SongSearchHit["highlights"] = {};
    if (m.hits) {
      hl.title = highlight(ix.text, s.title, m);
      hl.orchestra = highlight(ix.text, s.orchestra, m);
      hl.singer = highlight(ix.text, s.singer, m);
    }
    return {
      song: s,
      score: score(i),
      highlights: hl,
      popularity: Math.min(1, ix.pop[i]!),
      ...(fav[i] ? { favourite: true } : {}),
    };
  });
  const out: SongSearchResult = { items, total: hits.length, facets, parsed: parsed.tokens };
  if (groups) out.groups = groups;
  if (!hits.length && parsed.text.length) {
    const sug = suggest(ix.text, parsed.text, m, pass);
    if (sug) {
      const filtersRaw = parsed.tokens.map((t) => t.raw);
      out.suggestion = [sug, ...filtersRaw].join(" ");
    }
  } else if (hits.length && m.hits) {
    const corrected = parsed.text.flatMap((w, k) => {
      if (!m.fuzzyOnly[k]) return [];
      // the word it was taken for: the best-scoring vocabulary word in the top hit's fields
      const top = songs[order[0]!]!;
      for (const v of [top.title, top.orchestra, top.singer ?? ""]) {
        const span = highlight(ix.text, v, { expansions: [m.expansions[k]!] })[0];
        if (span) return [{ typed: w.raw, found: v.slice(span[0], span[1]) }];
      }
      return [];
    });
    if (corrected.length) out.corrected = corrected;
  }
  return out;
}
