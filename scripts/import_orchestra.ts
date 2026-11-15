/**
 * Import a contemporary orchestra's recordings as catalogue sides (2026-11: "Sexteto Cristal is not in the database or
 * the library"). The listado (data/index/songs.json) stops in 2008, so orchestras DJs play today — Sexteto Cristal,
 * Tango Bardo, Bandonegro — come in through the repo-level database: data/knowledge/added_songs.json (merged into the
 * index at load, packages/core/src/data.ts indexSongs) and their Spotify records in data/cache/spotify/tracks.json.
 *
 *   pnpm orchestra:import "Sexteto Cristal" [--market=TR] [--dry-run] [--no-embed]
 *
 * Discovery, in order:
 *  1. the Spotify Web API with client credentials (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET): the artist, every album,
 *     single, compilation and appears-on release, and each release's tracks for the market (is_playable). On a 429, or
 *     without keys, it falls back on
 *  2. the seeds in data/knowledge/orchestra_imports.json (the artist and album ids found with the Spotify connector
 *     search — "Sexteto Cristal", "… vals", "… milonga", "… album" — and the PLAYABLE status the connector reported),
 *     read through the unauthenticated embed pages (open.spotify.com/embed/album|track/<id>, __NEXT_DATA__ →
 *     props.pageProps.state.data.entity: track list, credits, duration, isPlayable, release date), paced 0.5 s apart.
 *  Every track is also read from its embed page (credits, release date, isPlayable) unless --no-embed.
 *
 * Rules (each side names where its year and rhythm come from):
 *  - the same recording on two releases (same title, durations within 2 s) is kept once, from the original release;
 *  - the singer is the extra performer credited beside the orchestra; no extra performer → instrumental;
 *  - rhythm: the title's rhythm in the classic repertoire (accent-insensitive title match against the index, the
 *    plurality of its tango/vals/milonga rows), else "vals"/"milonga" in the title or album, else tango, marked
 *    "rhythm assumed tango (no classic match) — check";
 *  - year: the release year Spotify gives the album (no recording date is published); era "contemporary";
 *  - not playable in the market (embed isPlayable, the API's is_playable, the connector's status): skipped and noted;
 *  - a side whose record the export match rules reject (matchRules.matchProblem, as audit_spotify judges it) is left out;
 *  - ids: sha1(`title|orchestra|singer|spotifyUri`) cut to 10 characters, checked against every id in the index, the
 *    added sides and the Spotify cache (a collision re-hashes with a counter).
 * Idempotent: a re-run replaces the orchestra's earlier import (same ids), keeping each side's addedAt and each cache
 * record's checkedAt when nothing about it changed.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normTitle } from "../packages/core/src/energy";
import { bareTitle, matchProblem, takesIndex } from "../packages/core/src/matchRules";
import { knownSingers } from "../packages/core/src/streams";
import type { Song } from "../packages/core/src/types";

// ——— pure helpers (tested in packages/core/test/orchestraImport.test.ts) ———

export type DanceRhythm = "tango" | "vals" | "milonga";
const CODE: Record<DanceRhythm, string> = { tango: "T", vals: "V", milonga: "M" };
export const ASSUMED_NOTE = "rhythm assumed tango (no classic match) — check";

export function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SMALL = new Set("de del la el los las y a en con por para un una al lo mi tu su sin que".split(" "));
/** the index's title style (build_index.py titlecase) without lowering the rest of a word ("S.O.S." stays) */
export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) =>
      i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** sha1(`title|orchestra|singer|spotifyUri`) cut to 10 characters */
export function sideId(title: string, orchestra: string, singer: string | null, uri: string, n = 0): string {
  const key = `${title}|${orchestra}|${singer ?? ""}|${uri}${n ? `|${n}` : ""}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 10);
}
/** the side's id, re-hashed with a counter while it collides with an id taken by anything else */
export function uniqueSideId(
  title: string,
  orchestra: string,
  singer: string | null,
  uri: string,
  taken: (id: string) => boolean,
): string {
  for (let n = 0; n < 100; n++) {
    const id = sideId(title, orchestra, singer, uri, n);
    if (!taken(id)) return id;
  }
  throw new Error(`no free id for ${title} (${uri})`);
}

/** normTitle → the rhythm the classic repertoire gives the title (plurality of its tango/vals/milonga rows) */
export function classicRhythms(
  songs: Array<Pick<Song, "title" | "rhythm" | "orchestraId">>,
  exceptOrchestraId?: string,
): Map<string, DanceRhythm> {
  const counts = new Map<string, Record<DanceRhythm, number>>();
  for (const s of songs) {
    if (s.orchestraId === exceptOrchestraId) continue;
    if (s.rhythm !== "tango" && s.rhythm !== "vals" && s.rhythm !== "milonga") continue;
    const k = normTitle(s.title);
    if (!k) continue;
    const c = counts.get(k) ?? { tango: 0, vals: 0, milonga: 0 };
    c[s.rhythm]++;
    counts.set(k, c);
  }
  const out = new Map<string, DanceRhythm>();
  for (const [k, c] of counts) {
    const best = (Object.keys(c) as DanceRhythm[]).sort((a, b) => c[b] - c[a])[0]!;
    // a tie between rhythms is no evidence
    if (Object.values(c).filter((v) => v === c[best]).length === 1) out.set(k, best);
  }
  return out;
}

export interface RhythmCall {
  rhythm: DanceRhythm;
  how: "classic" | "title" | "album" | "assumed";
}
export function rhythmFor(
  title: string,
  album: string | null | undefined,
  classic: Map<string, DanceRhythm>,
): RhythmCall {
  const hit = classic.get(normTitle(title)) ?? classic.get(bareTitle(title));
  if (hit) return { rhythm: hit, how: "classic" };
  const named = (s: string): DanceRhythm | null =>
    /\b(vals|valse|valsecito)\b/.test(s) ? "vals" : /\bmilongas?\b/.test(s) ? "milonga" : null;
  const t = named(normTitle(title));
  if (t) return { rhythm: t, how: "title" };
  const a = named(normTitle(album ?? ""));
  if (a) return { rhythm: a, how: "album" };
  return { rhythm: "tango", how: "assumed" };
}

/** One track as discovered (any source). */
export interface FoundTrack {
  uri: string;
  title: string;
  artists: string[];
  durationMs: number;
  album: string;
  albumUri: string;
  albumType?: string;
  release: string | null;
  trackNumber?: number;
  playable: boolean;
  playability?: string;
}

/**
 * The same recording on several releases (same title, durations within 2 s) kept once: the original release (the
 * earliest release date; an album or single before a compilation or another artist's release).
 */
export function dedupeRecordings(tracks: FoundTrack[]): { kept: FoundTrack[]; dropped: FoundTrack[] } {
  const rank = (t: FoundTrack) =>
    `${t.release ?? "9999"}|${t.albumType === "compilation" || t.albumType === "appears_on" ? 1 : 0}|${t.albumUri}|${String(t.trackNumber ?? 0).padStart(3, "0")}`;
  const sorted = [...tracks].sort((a, b) => rank(a).localeCompare(rank(b)));
  const kept: FoundTrack[] = [];
  const dropped: FoundTrack[] = [];
  for (const t of sorted) {
    const same = kept.find(
      (k) =>
        k.uri === t.uri ||
        (bareTitle(k.title) === bareTitle(t.title) && Math.abs(k.durationMs - t.durationMs) <= 2000),
    );
    if (same) dropped.push(t);
    else kept.push(t);
  }
  return { kept, dropped };
}

/** the singer: the performers credited beside the orchestra (none → instrumental) */
export function singerOf(artists: string[], orchestra: string): string | null {
  const o = normTitle(orchestra);
  const extra = artists.filter((a) => normTitle(a) !== o);
  return extra.length ? extra.join(" - ") : null;
}

export interface CacheRecord {
  uri: string;
  url: string;
  durationMs: number;
  album: string;
  matched: string;
  release?: string;
  checkedAt: string;
  via: string;
}

/** A discovered track as a catalogue side and its Spotify cache record. */
export function toSide(
  t: FoundTrack,
  orchestra: string,
  classic: Map<string, DanceRhythm>,
  taken: (id: string) => boolean,
  via: string,
  now: string,
): { song: Song & { addedAt: string; release?: string }; cache: CacheRecord; rhythm: RhythmCall } {
  const singer = singerOf(t.artists, orchestra);
  const title = titleCase(t.title);
  const id = uniqueSideId(title, orchestra, singer, t.uri, taken);
  const r = rhythmFor(t.title, t.album, classic);
  const year = t.release ? Number(t.release.slice(0, 4)) : null;
  const albumId = t.albumUri.split(":").pop();
  const notes = [
    `Imported (orchestra-import) from Spotify: album "${t.album}" (${albumId})${t.release ? `, released ${t.release}` : ""}. Year: the album's release year on Spotify (no recording date is published).`,
    singer
      ? `Singer: ${singer} (Spotify track credit).`
      : "Instrumental: no performer credited beside the orchestra.",
    r.how === "classic"
      ? `Rhythm ${r.rhythm}: the title's rhythm in the classic repertoire (index).`
      : r.how === "title"
        ? `Rhythm ${r.rhythm}: named in the title.`
        : r.how === "album"
          ? `Rhythm ${r.rhythm}: named in the album title.`
          : ASSUMED_NOTE,
  ].join(" ");
  const song = {
    id,
    title,
    rhythm: r.rhythm,
    rhythmCode: CODE[r.rhythm],
    orchestra,
    orchestraId: slug(orchestra),
    singer,
    singerId: singer ? slug(singer) : null,
    vocal: !!singer,
    year: year && Number.isFinite(year) ? year : null,
    date: null,
    era: "contemporary",
    album: t.album,
    source: "orchestra-import",
    notes,
    addedAt: now.slice(0, 10),
    ...(t.release ? { release: t.release } : {}),
  } as Song & { addedAt: string; release?: string };
  const cache: CacheRecord = {
    uri: t.uri,
    url: `https://open.spotify.com/track/${t.uri.split(":").pop()}`,
    durationMs: t.durationMs,
    album: t.album,
    matched: `${t.artists.join(", ")} – ${t.title}`,
    ...(t.release ? { release: t.release } : {}),
    checkedAt: now,
    via,
  };
  return { song, cache, rhythm: r };
}

// ——— fetching ———

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
class RateLimited extends Error {}

async function webApiToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (r.status === 429) throw new RateLimited("token 429");
  if (!r.ok) return null;
  return ((await r.json()) as { access_token?: string }).access_token ?? null;
}

async function api<T>(token: string, url: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 429) throw new RateLimited(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

interface ApiArtist {
  id: string;
  name: string;
}
interface ApiAlbum {
  id: string;
  name: string;
  album_type: string;
  album_group?: string;
  release_date: string;
  artists: ApiArtist[];
}
interface ApiTrack {
  uri: string;
  name: string;
  duration_ms: number;
  track_number: number;
  is_playable?: boolean;
  artists: ApiArtist[];
}

async function discoverWebApi(
  token: string,
  orchestra: string,
  seedArtist: string | undefined,
  market: string,
): Promise<{ artistId: string; albums: string[]; tracks: FoundTrack[] }> {
  let artistId = seedArtist;
  if (!artistId) {
    const q = encodeURIComponent(`artist:"${orchestra}"`);
    const res = await api<{ artists: { items: ApiArtist[] } }>(
      token,
      `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=10&market=${market}`,
    );
    artistId = res.artists.items.find((a) => normTitle(a.name) === normTitle(orchestra))?.id;
    if (!artistId) throw new Error(`no Spotify artist named ${orchestra}`);
  }
  const albums: ApiAlbum[] = [];
  let next: string | null =
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,compilation,appears_on&limit=10&market=${market}`;
  while (next) {
    const page: { items: ApiAlbum[]; next: string | null } = await api(token, next);
    albums.push(...page.items);
    next = page.next;
  }
  const tracks: FoundTrack[] = [];
  for (const a of albums) {
    let tnext: string | null = `https://api.spotify.com/v1/albums/${a.id}/tracks?limit=50&market=${market}`;
    while (tnext) {
      const page: { items: ApiTrack[]; next: string | null } = await api(token, tnext);
      for (const t of page.items) {
        // a various-artists release: only the orchestra's own tracks
        if (!t.artists.some((x) => x.id === artistId)) continue;
        tracks.push({
          uri: t.uri,
          title: t.name,
          artists: t.artists.map((x) => x.name),
          durationMs: t.duration_ms,
          album: a.name,
          albumUri: `spotify:album:${a.id}`,
          albumType: a.album_group === "appears_on" ? "appears_on" : a.album_type,
          release: a.release_date || null,
          trackNumber: t.track_number,
          playable: t.is_playable !== false,
          playability: t.is_playable === false ? `not playable in ${market} (Web API)` : "PLAYABLE",
        });
      }
      tnext = page.next;
      await sleep(150);
    }
  }
  return { artistId, albums: albums.map((a) => a.id), tracks };
}

interface EmbedEntity {
  name?: string;
  title?: string;
  uri?: string;
  releaseDate?: { isoString?: string } | null;
  duration?: number;
  isPlayable?: boolean;
  playabilityReason?: string;
  artists?: Array<{ name: string; uri: string }>;
  subtitle?: string;
  trackList?: Array<{
    uri: string;
    title: string;
    subtitle: string;
    duration: number;
    isPlayable: boolean;
    playabilityReason?: string;
  }>;
}
async function embed(kind: "album" | "track", id: string): Promise<EmbedEntity | null> {
  await sleep(500);
  const r = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: { "User-Agent": "Mozilla/5.0 (tdj orchestra import)" },
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!).props.pageProps.state.data.entity as EmbedEntity;
  } catch {
    return null;
  }
}

async function discoverEmbed(albumIds: string[], orchestra: string): Promise<FoundTrack[]> {
  const out: FoundTrack[] = [];
  for (const id of albumIds) {
    const a = await embed("album", id);
    if (!a?.trackList) continue;
    a.trackList.forEach((t, i) => {
      const artists = t.subtitle.split(/,\s*/);
      if (!artists.some((x) => normTitle(x) === normTitle(orchestra))) return;
      out.push({
        uri: t.uri,
        title: t.title,
        artists,
        durationMs: t.duration,
        album: a.name ?? a.title ?? "",
        albumUri: `spotify:album:${id}`,
        albumType: "album",
        release: a.releaseDate?.isoString?.slice(0, 10) ?? null,
        trackNumber: i + 1,
        playable: t.isPlayable,
        playability: t.playabilityReason ?? (t.isPlayable ? "PLAYABLE" : "not playable (embed)"),
      });
    });
  }
  return out;
}

// ——— the seeds and the run ———

export interface OrchestraSeed {
  name: string;
  spotifyArtist?: string;
  albums?: string[];
  /** the Spotify connector's playback status per track uri (search results), e.g. "PLAYABLE" */
  connector?: { checkedAt?: string; market?: string; status?: Record<string, string> };
  /** the last import: what was added, skipped and assumed */
  lastImport?: Record<string, unknown>;
}
interface SeedFile {
  about?: string;
  orchestras: Record<string, OrchestraSeed>;
}

async function main() {
  const argv = process.argv.slice(2);
  const name = argv.find((a) => !a.startsWith("--"));
  if (!name) {
    console.error('usage: pnpm orchestra:import "Orchestra Name" [--market=TR] [--dry-run] [--no-embed]');
    process.exit(2);
  }
  const flag = (k: string) => argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  const market = flag("market")?.split("=")[1] ?? "TR";
  const ROOT = new URL("..", import.meta.url).pathname;
  const read = <T>(p: string): T => JSON.parse(readFileSync(`${ROOT}${p}`, "utf8")) as T;
  const SEEDS = "data/knowledge/orchestra_imports.json";
  const ADDED = "data/knowledge/added_songs.json";
  const CACHE = "data/cache/spotify/tracks.json";
  let seeds: SeedFile;
  try {
    seeds = read<SeedFile>(SEEDS);
  } catch {
    seeds = { orchestras: {} };
  }
  const oid = slug(name);
  const seed: OrchestraSeed = seeds.orchestras[oid] ?? { name };
  const orchestra = seed.name || name;

  // discovery
  let found: FoundTrack[] = [];
  let via = "spotify-web-api";
  try {
    const token = await webApiToken();
    if (!token) throw new RateLimited("no client credentials");
    const r = await discoverWebApi(token, orchestra, seed.spotifyArtist, market);
    seed.spotifyArtist = r.artistId;
    seed.albums = [...new Set([...(seed.albums ?? []), ...r.albums])];
    found = r.tracks;
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e;
    console.warn(`Web API unavailable (${e.message}): reading the seeded albums from the embed pages`);
    via = "spotify-embed";
    found = await discoverEmbed(seed.albums ?? [], orchestra);
  }
  if (!found.length) throw new Error(`nothing found for ${orchestra}; add its album ids to ${SEEDS}`);

  // each track's embed page: the credits, the release date and the playability the web player shows
  if (!flag("no-embed"))
    for (const t of found) {
      const e = await embed("track", t.uri.split(":").pop()!);
      if (!e) continue;
      if (e.artists?.length) t.artists = e.artists.map((a) => a.name);
      if (e.releaseDate?.isoString) t.release = t.release ?? e.releaseDate.isoString.slice(0, 10);
      if (e.isPlayable === false) {
        t.playable = false;
        t.playability = `${e.playabilityReason ?? "not playable"} (embed)`;
      }
    }
  const status = seed.connector?.status ?? {};
  for (const t of found)
    if (status[t.uri] && status[t.uri] !== "PLAYABLE") {
      t.playable = false;
      t.playability = `${status[t.uri]} (Spotify connector, ${seed.connector?.market ?? market})`;
    }

  const skipped = found.filter((t) => !t.playable);
  const { kept, dropped } = dedupeRecordings(found.filter((t) => t.playable));

  // the index, the earlier import and the cache
  const indexSongs = read<Song[]>("data/index/songs.json");
  const added = read<{ about?: string; songs: Array<Song & { addedAt?: string }> }>(ADDED);
  const cache = read<Record<string, CacheRecord | null>>(CACHE);
  const before = added.songs.filter((s) => s.source === "orchestra-import" && s.orchestraId === oid);
  const others = added.songs.filter((s) => !(s.source === "orchestra-import" && s.orchestraId === oid));
  const mine = new Set(before.map((s) => s.id));
  const takenIds = new Set([
    ...indexSongs.map((s) => s.id),
    ...others.map((s) => s.id),
    ...Object.keys(cache).filter((k) => !mine.has(k)),
  ]);
  const classic = classicRhythms([...indexSongs, ...others], oid);
  const now = new Date().toISOString();
  const sides: ReturnType<typeof toSide>[] = [];
  const taken = (id: string) => takenIds.has(id) || sides.some((s) => s.song.id === id);
  for (const t of kept) sides.push(toSide(t, orchestra, classic, taken, via, now));

  // the export match rules, as the stream audit judges the cache (audit_spotify / quality)
  const all = [...indexSongs, ...others, ...sides.map((s) => s.song)];
  const takes = takesIndex(all);
  const singers = knownSingers(all);
  const rejected: Array<{ title: string; uri: string; why: string }> = [];
  const accepted = sides.filter(({ song, cache: c }) => {
    const [artists, ...rest] = c.matched.split(" – ");
    const why = matchProblem(
      { ...song, ...(takes.get(song.id) ?? {}) } as Parameters<typeof matchProblem>[0],
      {
        name: rest.join(" – "),
        artists: (artists ?? "").split(", "),
        album: c.album,
        durationMs: c.durationMs,
        release: c.release,
      },
      null,
      { singers },
    );
    if (why) rejected.push({ title: song.title, uri: c.uri, why });
    return !why;
  });

  // idempotent: keep addedAt and checkedAt for what did not change
  const prevById = new Map(before.map((s) => [s.id, s]));
  for (const s of accepted) {
    const prev = prevById.get(s.song.id);
    if (prev?.addedAt) s.song.addedAt = prev.addedAt;
    const pc = cache[s.song.id];
    if (pc && pc.uri === s.cache.uri && pc.durationMs === s.cache.durationMs && pc.album === s.cache.album)
      s.cache.checkedAt = pc.checkedAt;
  }
  accepted.sort((a, b) =>
    `${a.cache.release ?? ""}|${a.song.album}|${a.cache.uri}`.localeCompare(
      `${b.cache.release ?? ""}|${b.song.album}|${b.cache.uri}`,
    ),
  );
  const assumed = accepted.filter((s) => s.rhythm.how === "assumed");
  const albums = [...new Map(kept.map((t) => [t.albumUri, `${t.album} (${t.release ?? "?"})`])).values()];
  const summary = {
    at: now.slice(0, 10),
    via,
    market,
    albums,
    added: accepted.length,
    byRhythm: count(accepted.map((s) => s.song.rhythm)),
    bySinger: count(accepted.map((s) => s.song.singer ?? "instrumental")),
    assumedRhythm: assumed.map((s) => `${s.song.title} (${s.cache.uri})`),
    skippedNotPlayable: skipped.map((t) => `${t.title} (${t.uri}): ${t.playability}`),
    duplicates: dropped.map((t) => `${t.title} on ${t.album} (${t.uri})`),
    rejectedByMatchRules: rejected.map((r) => `${r.title} (${r.uri}): ${r.why}`),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (flag("dry-run")) return;

  const newIds = new Set(accepted.map((s) => s.song.id));
  for (const s of before) if (!newIds.has(s.id)) delete cache[s.id];
  for (const s of accepted) cache[s.song.id] = s.cache;
  added.songs = [...others, ...accepted.map((s) => s.song)];
  seeds.orchestras[oid] = { ...seed, name: orchestra, lastImport: summary };
  seeds.about ??=
    "Seeds and results of scripts/import_orchestra.ts (pnpm orchestra:import): per contemporary orchestra, the Spotify artist and album ids (found with the Spotify connector search and the Web API), the connector's playback status per track, and the last import's summary.";
  writeFileSync(`${ROOT}${ADDED}`, `${JSON.stringify(added, null, 1)}\n`);
  writeFileSync(`${ROOT}${CACHE}`, JSON.stringify(cache));
  writeFileSync(`${ROOT}${SEEDS}`, `${JSON.stringify(seeds, null, 1)}\n`);
  console.log(`${orchestra}: ${accepted.length} sides in ${ADDED}`);
}

function count(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
