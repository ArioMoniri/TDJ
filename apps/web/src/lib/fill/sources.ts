import { mergeScraped, needsRefresh, normTitle, type ScrapedRecord, type ScrapedValues } from "@tdj/core";
import { t as tx } from "@/lib/i18n";

/**
 * Round 22 — filling missing data (BPM, key, level, artwork, dates) from every source the DJ connects. Plain functions
 * over an injected `fetch`, so the web server, the browser and a standalone app all run the same code.
 *
 * Keyless: Deezer (BPM, gain, artwork, release, preview), MusicBrainz (first-release date) and the Cover Art Archive
 * (artwork for that MusicBrainz release). With the DJ's own token: Discogs (year, artwork) and Spotify (album art,
 * release date of the matched recording). Each value lands in the user's scraped record with its source; the DJ's
 * edits are a layer above and always win.
 */
export type SourceId = "deezer" | "musicbrainz" | "coverart" | "discogs" | "spotify";
export interface SourceInfo {
  id: SourceId;
  name: string;
  /** what it fills, in the DJ's words */
  gives: string;
  /** what it needs from the DJ: nothing, their own token, or their Spotify login */
  needs: "nothing" | "token" | "spotify";
  /** a keyless source is on unless the DJ turns it off */
  defaultOn: boolean;
  /** where to get a token (shown in the add-a-source sheet) */
  tokenHelp?: string;
  color: string;
}
export const SOURCES: SourceInfo[] = [
  {
    id: "deezer",
    name: "Deezer",
    get gives() {
      return tx("fill.sources.bpm_level_artwork_release_date_and");
    },
    needs: "nothing",
    defaultOn: true,
    color: "#a238ff",
  },
  {
    id: "musicbrainz",
    name: "MusicBrainz",
    get gives() {
      return tx("fill.sources.the_recording_s_first_release_date");
    },
    needs: "nothing",
    defaultOn: true,
    color: "#ba478f",
  },
  {
    id: "coverart",
    get name() {
      return tx("fill.sources.cover_art_archive");
    },
    get gives() {
      return tx("fill.sources.album_artwork_for_the_musicbrainz_release");
    },
    needs: "nothing",
    defaultOn: true,
    color: "#eb743b",
  },
  {
    id: "discogs",
    name: "Discogs",
    get gives() {
      return tx("fill.sources.year_and_artwork_of_the_78");
    },
    needs: "token",
    defaultOn: false,
    get tokenHelp() {
      return tx("fill.sources.discogs_settings_developers_generate_new_token");
    },
    color: "#333333",
  },
  {
    id: "spotify",
    name: "Spotify",
    get gives() {
      return tx("fill.sources.album_artwork_and_release_date_of");
    },
    needs: "spotify",
    defaultOn: false,
    color: "#1db954",
  },
];
export const sourceInfo = (id: string) => SOURCES.find((s) => s.id === id);

export interface FillWant {
  id: string;
  title: string;
  orchestra: string;
  singer?: string | null;
  year?: number | null;
  /** the Deezer track the index already matched */
  deezerId?: string | null;
  spotifyUri?: string | null;
}
export interface FillResult {
  source: SourceId;
  values: ScrapedValues;
  /** the source's own id of what it matched */
  ref?: string;
  /** a 30 s preview link (Deezer) the browser can analyse for the key */
  previewUrl?: string;
  error?: string;
}
export type Fetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const UA = "TDJ/0.1 (+https://github.com/ArioMoniri/TDJ)";
const surname = (o: string) =>
  normTitle(o.replace(/\(.*?\)/g, ""))
    .split(" ")
    .filter((w) => w.length > 2)
    .pop() ?? "";
/** title words + the orchestra's surname: the same rule the resolver uses */
export function matchScore(want: FillWant, title: string, artist: string): number {
  const wt = normTitle(want.title);
  const tt = normTitle(title);
  let c = 0;
  if (tt === wt) c += 0.6;
  else if (tt.startsWith(wt) || wt.startsWith(tt)) c += 0.4;
  const sur = surname(want.orchestra);
  if (sur && normTitle(artist).includes(sur)) c += 0.4;
  return Math.round(c * 100) / 100;
}
const yearOf = (d?: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
/** a date within 5 years of the index's year (a CD reissue of a 1937 side is not its date) */
export const plausibleDate = (date: string | null | undefined, year?: number | null) => {
  const y = yearOf(date);
  if (y === null || y < 1900) return false;
  return !year || Math.abs(y - year) <= 5;
};

/* ---------- parsers (pure) ---------- */

interface DzTrack {
  id: number | string;
  title?: string;
  bpm?: number;
  gain?: number;
  release_date?: string;
  preview?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string; release_date?: string };
}
export function parseDeezerSearch(j: unknown, want: FillWant): DzTrack | null {
  const data = ((j as { data?: DzTrack[] })?.data ?? []).map((t) => ({
    t,
    c: matchScore(want, t.title ?? "", t.artist?.name ?? ""),
  }));
  data.sort((a, b) => b.c - a.c);
  return data[0] && data[0].c >= 0.8 ? data[0].t : null;
}
export function parseDeezerTrack(j: unknown): { values: ScrapedValues; previewUrl?: string; ref?: string } {
  const t = (j ?? {}) as DzTrack;
  const values: ScrapedValues = {};
  if (t.id !== undefined) values.deezerId = String(t.id);
  if (typeof t.bpm === "number" && t.bpm > 30) values.bpm = Math.round(t.bpm * 10) / 10;
  if (typeof t.gain === "number" && Number.isFinite(t.gain)) values.gainDb = Math.round(t.gain * 10) / 10;
  const art = t.album?.cover_medium ?? t.album?.cover_big;
  if (art) values.artwork = art;
  const rel = t.release_date ?? t.album?.release_date;
  if (rel) values.release = rel;
  return {
    values,
    ...(t.preview ? { previewUrl: t.preview } : {}),
    ...(t.id ? { ref: `deezer:${t.id}` } : {}),
  };
}

interface MbRec {
  id: string;
  title: string;
  "first-release-date"?: string;
  "artist-credit"?: Array<{ name?: string }>;
  releases?: Array<{ id: string; date?: string }>;
}
export function parseMusicBrainz(
  j: unknown,
  want: FillWant,
): { values: ScrapedValues; ref?: string; releaseId?: string } | null {
  const recs = ((j as { recordings?: MbRec[] })?.recordings ?? [])
    .map((r) => ({
      r,
      c: matchScore(want, r.title, (r["artist-credit"] ?? []).map((a) => a.name ?? "").join(" ")),
    }))
    .filter((x) => x.c >= 0.8)
    .sort((a, b) => b.c - a.c);
  const best = recs[0]?.r;
  if (!best) return null;
  // the earliest dated release is the original; later ones are reissues
  const dated = (best.releases ?? [])
    .filter((x) => x.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const date = dated[0]?.date ?? best["first-release-date"];
  const values: ScrapedValues = {};
  if (date && plausibleDate(date, want.year)) values.release = date;
  return { values, ref: `mb:${best.id}`, ...(dated[0] ? { releaseId: dated[0].id } : {}) };
}
export function parseCoverArt(j: unknown): string | undefined {
  const imgs = (
    j as { images?: Array<{ front?: boolean; thumbnails?: Record<string, string>; image?: string }> }
  )?.images;
  const front = imgs?.find((i) => i.front) ?? imgs?.[0];
  return front?.thumbnails?.["250"] ?? front?.thumbnails?.small ?? front?.image;
}
interface DgResult {
  id: number;
  title?: string;
  year?: string;
  cover_image?: string;
  thumb?: string;
}
export function parseDiscogs(j: unknown, want: FillWant): { values: ScrapedValues; ref?: string } | null {
  const rs = ((j as { results?: DgResult[] })?.results ?? []).filter((r) => {
    // Discogs titles read "Artist - Title"
    const [artist, title] = (r.title ?? "").split(" - ");
    return matchScore(want, title ?? r.title ?? "", artist ?? "") >= 0.4;
  });
  const best = rs.find((r) => plausibleDate(r.year, want.year)) ?? rs[0];
  if (!best) return null;
  const values: ScrapedValues = {};
  if (best.year && plausibleDate(best.year, want.year)) values.release = best.year;
  const art = best.cover_image ?? best.thumb;
  if (art && !/spacer\.gif/.test(art)) values.artwork = art;
  return { values, ref: `discogs:${best.id}` };
}
export function parseSpotifyTrack(j: unknown): { values: ScrapedValues; ref?: string } {
  const t = (j ?? {}) as {
    uri?: string;
    album?: { images?: Array<{ url: string; width?: number }>; release_date?: string };
  };
  const imgs = (t.album?.images ?? []).slice().sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const art = imgs.find((i) => (i.width ?? 0) >= 200) ?? imgs[imgs.length - 1];
  const values: ScrapedValues = {};
  if (art) values.artwork = art.url;
  if (t.uri) values.spotifyUri = t.uri;
  // Spotify's release date is the album's (often a reissue): kept for display, judged by the date rule like any other
  if (t.album?.release_date) values.release = t.album.release_date;
  return { values, ...(t.uri ? { ref: t.uri } : {}) };
}

/* ---------- lookups (one per source) ---------- */

/**
 * MusicBrainz and the Cover Art Archive allow one request a second per address: every call through this fetch is
 * spaced by `intervalMs` (per instance / per browser).
 */
export function politeFetch(f: Fetch, intervalMs = 1100): Fetch {
  let next = 0;
  return async (url, init) => {
    if (/musicbrainz\.org|coverartarchive\.org/.test(url)) {
      const now = Date.now();
      const at = Math.max(now, next);
      next = at + intervalMs;
      if (at > now) await new Promise((r) => setTimeout(r, at - now));
    }
    return f(url, init);
  };
}

async function getJson(fetcher: Fetch, url: string, headers: Record<string, string> = {}, ms = 8000) {
  const r = await fetcher(url, {
    headers: { "user-agent": UA, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return r.json();
}

export interface LookupDeps {
  fetch: Fetch;
  discogsToken?: string;
  spotifyToken?: string;
}

export async function lookup(source: SourceId, want: FillWant, deps: LookupDeps): Promise<FillResult> {
  try {
    if (source === "deezer") {
      let id = want.deezerId ?? null;
      if (!id) {
        const q = `${want.title} ${want.orchestra.replace(/\(.*?\)/g, "")}`.trim();
        const hit = parseDeezerSearch(
          await getJson(deps.fetch, `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`),
          want,
        );
        if (!hit) return { source, values: {}, error: tx("fill.sources.no_match") };
        id = String(hit.id);
      }
      const t = parseDeezerTrack(
        await getJson(deps.fetch, `https://api.deezer.com/track/${encodeURIComponent(id)}`),
      );
      if (t.values.release && !plausibleDate(t.values.release, want.year)) delete t.values.release;
      return { source, ...t };
    }
    if (source === "musicbrainz" || source === "coverart") {
      const esc = (s: string) => s.replace(/["\\]/g, "\\$&");
      const q = `recording:"${esc(want.title)}" AND artist:"${esc(want.orchestra.replace(/\(.*?\)/g, "").trim())}"`;
      const mb = parseMusicBrainz(
        await getJson(
          deps.fetch,
          `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
        ),
        want,
      );
      if (!mb) return { source, values: {}, error: tx("fill.sources.no_match") };
      if (source === "musicbrainz") return { source, values: mb.values, ...(mb.ref ? { ref: mb.ref } : {}) };
      if (!mb.releaseId) return { source, values: {}, error: tx("fill.sources.no_release") };
      const art = parseCoverArt(
        await getJson(deps.fetch, `https://coverartarchive.org/release/${mb.releaseId}`),
      );
      return { source, values: art ? { artwork: art } : {}, ref: `caa:${mb.releaseId}` };
    }
    if (source === "discogs") {
      if (!deps.discogsToken)
        return { source, values: {}, error: tx("fill.sources.needs_your_discogs_token") };
      const q = new URLSearchParams({
        track: want.title,
        artist: want.orchestra.replace(/\(.*?\)/g, "").trim(),
        type: "release",
        per_page: "10",
      });
      const dg = parseDiscogs(
        await getJson(deps.fetch, `https://api.discogs.com/database/search?${q}`, {
          authorization: tx("fill.sources.discogs_token", { discogsToken: deps.discogsToken }),
        }),
        want,
      );
      return dg ? { source, ...dg } : { source, values: {}, error: tx("fill.sources.no_match") };
    }
    if (source === "spotify") {
      if (!deps.spotifyToken)
        return { source, values: {}, error: tx("fill.sources.needs_your_spotify_login") };
      const id = want.spotifyUri?.replace(/^spotify:track:/, "");
      if (!id) return { source, values: {}, error: tx("fill.sources.no_spotify_recording") };
      return {
        source,
        ...parseSpotifyTrack(
          await getJson(deps.fetch, `https://api.spotify.com/v1/tracks/${id}`, {
            authorization: `Bearer ${deps.spotifyToken}`,
          }),
        ),
      };
    }
    return { source, values: {}, error: tx("fill.sources.unknown_source") };
  } catch (e) {
    return { source, values: {}, error: (e as Error).message };
  }
}

/** the source's current id for what it would match (a known Deezer track), so a change triggers a refetch */
const refFor = (source: SourceId, want: FillWant) =>
  source === "deezer" && want.deezerId
    ? `deezer:${want.deezerId}`
    : source === "spotify" && want.spotifyUri
      ? want.spotifyUri
      : undefined;

/**
 * Fill one song from every enabled source that is due (never fetched, the source's track changed, or old), merging
 * each answer into the user's scraped record. Returns the new record and what each source said.
 */
export async function fillSong(
  want: FillWant,
  prev: ScrapedRecord | null | undefined,
  sources: SourceId[],
  deps: LookupDeps,
  opts: { force?: boolean; now?: number } = {},
): Promise<{ record: ScrapedRecord | null; results: FillResult[] }> {
  let record = prev ?? null;
  const results: FillResult[] = [];
  const now = opts.now ?? Date.now();
  for (const source of sources) {
    if (!opts.force && !needsRefresh(record, source, refFor(source, want), now)) continue;
    const r = await lookup(source, want, deps);
    results.push(r);
    if (r.error && !Object.keys(r.values).length) continue;
    record = mergeScraped(record, r.values, source, r.ref, new Date(now).toISOString());
  }
  return { record, results };
}
