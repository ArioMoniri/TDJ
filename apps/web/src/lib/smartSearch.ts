import { normTitle, parseSongQuery, type SongFilters, type SongSearchHit } from "@tdj/core";
import type { Song } from "./types";
import type { SongSearchPage } from "./useSongSearch";

/**
 * 2026-11 (the owner: "for a song name there should be a helper/corrector for finding them from the connected service,
 * and show different versions of them after the correct name is completed"): the one smart search every search box
 * uses (Swap, Database, Library, Build by hand, the Booth's Find songs, Compose's search panel). The catalogue side
 * is core `searchSongs` (typos, accents, aliases, inline filters, facets, "did you mean"); this file adds what sits on
 * top of it, as pure functions the component (components/ui/SmartSearch.tsx) and the tests share:
 *
 *  - completions while typing (a title, an orchestra or a singer the words start), Tab takes the first;
 *  - the correction ("Did you mean …" with no result, "Showing … for …" when only close spellings matched);
 *  - results grouped by work once a title is complete, each recording a version with its sources;
 *  - recordings from connected services (Spotify's search) merged into the catalogue's: the same recording is one row
 *    with both sources, another one is its own version, its orchestra and rhythm read from the catalogue's names.
 */

export type SourceId = "catalogue" | "spotify" | "youtube" | "local";

/** a recording a connected service found (the wire of POST /api/services/search) */
export interface ServiceTrack {
  service: "spotify" | "youtube";
  /** the service's own id */
  id: string;
  /** spotify:track:… */
  uri: string;
  url?: string;
  title: string;
  artists: string[];
  album?: string;
  /** the album's release year (a reissue's, often: never taken as the recording date) */
  year?: number | null;
  durationSec?: number | null;
  previewUrl?: string | null;
  isrc?: string | null;
  /** 2026-11: the album's cover (Spotify's `album.images`, the one nearest a row's 2× tile) */
  image?: string | null;
}

export interface ServiceAnswer {
  id: "spotify" | "youtube";
  /** ok: searched; off: not offered here; signed-out: offered, the DJ is not connected; busy: rate limited; error */
  state: "ok" | "off" | "signed-out" | "busy" | "error";
  tracks: ServiceTrack[];
}

/** one recording in the results */
export interface Version {
  key: string;
  song: Song;
  /** the catalogue's hit (highlights, favourite), when the catalogue has it */
  hit?: SongSearchHit;
  sources: SourceId[];
  /** the service's recording, merged into a catalogue row or on its own */
  external?: ServiceTrack;
  /** the rhythm comes from the catalogue (the side itself, or the work's other versions) */
  rhythmKnown: boolean;
}

export interface Work {
  key: string;
  title: string;
  rhythm: string;
  versions: Version[];
}

export interface Completion {
  kind: "title" | "orchestra" | "singer";
  /** what the field holds once it is taken */
  query: string;
  /** what the list shows */
  label: string;
}

export interface Correction {
  /** the corrected query */
  query: string;
  /** "none": nothing matched as typed, the correction finds some; "close": these results are close spellings */
  kind: "none" | "close";
}

const fold = (s: string) => normTitle(s ?? "");
/** the work a recording belongs to: its title folded, without the bracketed part ("(vals)", "(instrumental)") */
export const workKey = (title: string) => fold(title);

/** the words of a query, without its inline filters ("40s", "vals", "instrumental") */
export function queryText(q: string): string {
  return parseSongQuery(q)
    .text.map((w) => w.raw)
    .join(" ");
}
/** the inline filters a query carries, as typed (kept when a completion replaces the words) */
export function queryFilters(q: string): string {
  return parseSongQuery(q)
    .tokens.map((t) => t.raw)
    .join(" ");
}
const withFilters = (text: string, q: string) => [text, queryFilters(q)].filter(Boolean).join(" ");

/** the words of a query are a whole title of the results: the versions view */
export function titleComplete(q: string, versions: readonly Pick<Version, "song">[]): boolean {
  const t = fold(queryText(q));
  if (t.length < 2) return false;
  return versions.some((v) => workKey(v.song.title) === t);
}

/**
 * Up to `limit` completions for what is typed: titles the words start (the results' own titles, best first), then
 * orchestras and singers whose name the last words start. Nothing once the words are a whole title.
 */
export function completionsFor(
  q: string,
  page: Pick<SongSearchPage, "items" | "facets"> | null,
  limit = 5,
): Completion[] {
  const text = queryText(q);
  const t = fold(text);
  if (!page || t.length < 2) return [];
  const out: Completion[] = [];
  const seen = new Set<string>();
  const add = (c: Completion) => {
    const k = `${c.kind}|${fold(c.label)}`;
    if (seen.has(k) || out.length >= limit) return;
    seen.add(k);
    out.push(c);
  };
  if (page.items.some((h) => workKey(h.song.title) === t)) return [];
  for (const h of page.items) {
    const w = workKey(h.song.title);
    if (w.startsWith(t) && w !== t)
      add({ kind: "title", label: h.song.title, query: withFilters(h.song.title, q) });
  }
  // the last one or two words as the start of a name ("di sar" → Carlos Di Sarli)
  const words = text.split(/\s+/).filter(Boolean);
  const tails = [words.slice(-2), words.slice(-1)].filter((x) => x.length);
  const names = (kind: "orchestra" | "singer", labels: string[]) => {
    for (const label of labels) {
      const n = fold(label);
      for (const tail of tails) {
        const f = fold(tail.join(" "));
        if (f.length < 2) continue;
        const starts = n.startsWith(f) || n.split(" ").some((_, i, a) => a.slice(i).join(" ").startsWith(f));
        if (starts && n !== f) {
          const head = words.slice(0, words.length - tail.length).join(" ");
          add({ kind, label, query: withFilters([head, label].filter(Boolean).join(" "), q) });
          break;
        }
      }
    }
  };
  names(
    "orchestra",
    page.facets.orchestra.map((f) => f.label ?? f.key),
  );
  names(
    "singer",
    page.facets.singer.map((f) => f.key),
  );
  return out;
}

/** the correction the catalogue offers: a spelling that finds something, or the words the results were taken for */
export function correctionFor(
  q: string,
  page: Pick<SongSearchPage, "suggestion" | "corrected" | "total"> | null,
): Correction | null {
  if (!page) return null;
  if (!page.total && page.suggestion && fold(page.suggestion) !== fold(q))
    return { query: page.suggestion, kind: "none" };
  if (page.total && page.corrected?.length) {
    let out = q;
    for (const c of page.corrected) {
      const re = new RegExp(`(^|\\s)${c.typed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i");
      out = out.replace(re, (_m, pre: string) => `${pre}${c.found}`);
    }
    if (fold(out) !== fold(q)) return { query: out, kind: "close" };
  }
  return null;
}

/** the eras as chips (yearFrom / yearTo) */
export const ERAS = {
  guardia: { yearTo: 1934 },
  golden: { yearFrom: 1935, yearTo: 1955 },
  post: { yearFrom: 1956 },
} as const;
export type EraChip = keyof typeof ERAS;
export function eraOfFilters(f: SongFilters): EraChip | null {
  for (const [k, v] of Object.entries(ERAS) as Array<[EraChip, { yearFrom?: number; yearTo?: number }]>)
    if (f.yearFrom === v.yearFrom && f.yearTo === v.yearTo) return k;
  return null;
}
export function withEra(f: SongFilters, era: EraChip | null): SongFilters {
  const { yearFrom: _a, yearTo: _b, ...rest } = f;
  return era ? { ...rest, ...ERAS[era] } : rest;
}

/* ---------- connected services ---------- */

const RHYTHM_IN_TITLE: Array<[RegExp, string]> = [
  [/\bvals(es)?\b|\bvalsecito\b|\bwaltz\b/, "vals"],
  [/\bmilonga\b|\bmilonguita\b|\bcandombe\b/, "milonga"],
];

export interface MergeContext {
  /** the catalogue's orchestras (id, name): a service's artist is read as one of them */
  orchestras: ReadonlyArray<{ id: string; name: string }>;
  /** a work's rhythm as the catalogue knows it (workKey → rhythm) */
  rhythmOf?: (work: string) => string | undefined;
}

const GENERIC =
  /^(orquesta|orchestra|orquestra|tipica|sexteto|cuarteto|quinteto|conjunto|trio|tango|tangos|los|las|del|de|la|el|y|su|sus|band|ensemble|quartet|quintet|sextet)$/;
/** an orchestra's name as an artist line names it: the whole name, or its leader's surname ("Di Sarli", "D'Arienzo") */

/**
 * 2026-11: an artist line that is just another person of the same surname ("Julio Sosa" is not Rubén Sosa's
 * orchestra): two words, the surname last, a first name the orchestra's name does not have
 */
function otherPerson(line: string, orchestra: string, surname: string): boolean {
  const w = line.split(" ");
  return w.length === 2 && w[1] === surname && !orchestra.split(" ").includes(w[0]!);
}

function orchestraIn(artists: string[], orchestras: MergeContext["orchestras"]) {
  const lines = artists.map(fold);
  let best: { id: string; name: string; at: number; len: number } | null = null;
  for (const o of orchestras) {
    const n = fold(o.name);
    // the leader's surname, or the ensemble's own word: never a word every band name has ("tango", "orquesta")
    const words = n.split(" ").filter((w) => w.length >= 4 && !GENERIC.test(w));
    const surname = words.at(-1) ?? null;
    const last2 = n.split(" ").slice(-2);
    const tail = last2.length === 2 && last2.every((w) => !GENERIC.test(w)) ? last2.join(" ") : null;
    lines.forEach((l, at) => {
      const hit = ` ${l} `.includes(` ${n} `)
        ? n.length + 100
        : tail && ` ${l} `.includes(` ${tail} `)
          ? tail.length + 50
          : surname && ` ${l} `.includes(` ${surname} `) && !otherPerson(l, n, surname)
            ? surname.length
            : 0;
      if (hit && (!best || at < best.at || (at === best.at && hit > best.len)))
        best = { id: o.id, name: o.name, at, len: hit };
    });
  }
  return best as { id: string; name: string; at: number; len: number } | null;
}

/**
 * A service's recording as a side: the orchestra read from its artists (the catalogue's name when it knows the
 * orchestra), the other artist as the singer, the rhythm from the work's catalogue versions (else the title), the
 * album year marked approximate (a release date, not a recording date).
 */
export function serviceSong(t: ServiceTrack, ctx: MergeContext): { song: Song; rhythmKnown: boolean } {
  const o = orchestraIn(t.artists, ctx.orchestras);
  const singerLine = t.artists.find((_, i) => !o || i !== o.at);
  const singer =
    singerLine && !/orquesta|orchestra|tipica|típica|sexteto|cuarteto/i.test(singerLine) ? singerLine : null;
  const w = workKey(t.title);
  const known = ctx.rhythmOf?.(w);
  const guess = RHYTHM_IN_TITLE.find(([re]) => re.test(fold(`${t.title} ${t.album ?? ""}`)))?.[1];
  const orchestra = o?.name ?? t.artists[0] ?? "";
  const song = {
    id: `ext:${t.service}:${t.id}`,
    title: t.title,
    rhythm: known ?? guess ?? "tango",
    orchestra,
    orchestraId: o?.id ?? `ext-${fold(orchestra).replace(/ /g, "-")}`,
    singer,
    singerId: singer ? fold(singer).replace(/ /g, "-") : null,
    vocal: !!singer,
    year: t.year ?? null,
    yearApprox: true,
    era: "unknown",
    album: t.album ?? null,
    source: t.service,
    durationSec: t.durationSec ?? undefined,
    spotify: t.service === "spotify" ? { uri: t.uri, url: t.url, album: t.album } : null,
    ...(t.previewUrl ? { resolved: { previewUrl: t.previewUrl } } : {}),
  } as unknown as Song;
  return { song, rhythmKnown: !!known };
}

/** 2026-11: a service's length agrees with the catalogue side's within this many seconds (the same pressing) */
export const SAME_LENGTH_SEC = 3;

/**
 * the same recording: the same service id, or the same work by the same orchestra with the same voice (the singer, or
 * none: an instrumental is never a sung recording), its length within ±3 s and the album not older than the side
 */
export function sameRecording(s: Song, t: ServiceTrack, ctx: MergeContext): boolean {
  if (s.spotify?.uri && s.spotify.uri === t.uri) return true;
  if (workKey(s.title) !== workKey(t.title) && workKey(s.title) !== serviceTitleKey(t.title)) return false;
  const o = orchestraIn(t.artists, ctx.orchestras);
  if (!o || o.id !== s.orchestraId) return false;
  if (s.durationSec && t.durationSec && Math.abs(s.durationSec - t.durationSec) > SAME_LENGTH_SEC)
    return false;
  if (s.year && t.year && t.year < s.year) return false;
  if (s.singer && !t.artists.some((a) => fold(a).includes(fold(s.singer!).split(" ").slice(-1)[0]!))) {
    // the artists name another singer: another recording
    const other = t.artists.filter((_, i) => i !== o.at);
    if (other.length) return false;
  }
  // an instrumental side: a track that names a singer is another recording
  if (!s.singer && serviceSong(t, ctx).song.singer) return false;
  return true;
}

/** a service title without its edition tail ("Malena - Remastered 2004", "Malena [Live]") as a work key */
const serviceTitleKey = (title: string) =>
  workKey(title.replace(/\s+[-–—]\s+.*$/, "").replace(/\s*\[.*?\]\s*/g, " "));

const lengthGap = (s: Song, t: ServiceTrack) =>
  s.spotify?.uri === t.uri
    ? -1
    : s.durationSec && t.durationSec
      ? Math.abs(s.durationSec - t.durationSec)
      : SAME_LENGTH_SEC + 1;

/** a service's recording passes the chips the catalogue applied (what it cannot tell, it lets through) */
function passes(s: Song, f: SongFilters | undefined, rhythmKnown: boolean): boolean {
  if (!f) return true;
  if (f.rhythms?.length && rhythmKnown && !f.rhythms.includes(s.rhythm)) return false;
  if (f.vocal !== undefined && s.vocal !== f.vocal) return false;
  if (f.orchestraIds?.length && !f.orchestraIds.includes(s.orchestraId)) return false;
  if (f.singers?.length && s.singer && !f.singers.includes(s.singer)) return false;
  // (no year check: a service dates the album, often a reissue decades after the recording)
  return true;
}

/**
 * The catalogue's hits and the services' recordings as one list: a recording both have is one row with both sources,
 * the rest of the services' recordings follow as versions of their own. Catalogue order first.
 */
export function mergeVersions(
  hits: readonly SongSearchHit[],
  services: readonly ServiceAnswer[],
  ctx: MergeContext,
  o: { filters?: SongFilters; extraSources?: (s: Song) => SourceId[] } = {},
): Version[] {
  const rhythmOf = (w: string) =>
    ctx.rhythmOf?.(w) ?? hits.find((h) => workKey(h.song.title) === w)?.song.rhythm;
  const full: MergeContext = { ...ctx, rhythmOf };
  const out: Version[] = hits.map((h) => ({
    key: h.song.id,
    song: h.song,
    hit: h,
    sources: [
      "catalogue",
      ...(h.song.spotify?.uri ? (["spotify"] as const) : []),
      ...(o.extraSources?.(h.song) ?? []),
    ],
    rhythmKnown: true,
  }));
  const tracks = services.flatMap((a) => (a.state === "ok" ? a.tracks : []));
  const seen = new Set<string>();
  for (const t of tracks) {
    if (seen.has(t.uri)) continue;
    seen.add(t.uri);
    // (2026-11: the catalogue side whose length is nearest, when two sides of the voice could be it)
    const same = out
      .filter((v) => !v.external && v.sources.includes("catalogue") && sameRecording(v.song, t, full))
      .sort((a, b) => lengthGap(a.song, t) - lengthGap(b.song, t))[0];
    if (same) {
      same.external = t;
      if (!same.sources.includes(t.service)) same.sources.push(t.service);
      continue;
    }
    const { song, rhythmKnown } = serviceSong(t, full);
    if (!passes(song, o.filters, rhythmKnown)) continue;
    out.push({ key: song.id, song, sources: [t.service], external: t, rhythmKnown });
  }
  return out;
}

/** versions grouped by work, in the order each work first appears (its catalogue versions before the services') */
export function groupWorks(versions: readonly Version[]): Work[] {
  const m = new Map<string, Work>();
  for (const v of versions) {
    const k = workKey(v.song.title);
    const w = m.get(k);
    if (w) w.versions.push(v);
    else m.set(k, { key: k, title: v.song.title, rhythm: v.song.rhythm, versions: [v] });
  }
  for (const w of m.values()) {
    const cat = w.versions.find((v) => v.sources.includes("catalogue"));
    if (cat) {
      w.title = cat.song.title;
      w.rhythm = cat.song.rhythm;
    }
    w.versions.sort(
      (a, b) => Number(b.sources.includes("catalogue")) - Number(a.sources.includes("catalogue")),
    );
  }
  return [...m.values()];
}
