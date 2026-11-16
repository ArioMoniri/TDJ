import { type ImportItem, parseDuration, splitArtists } from "@tdj/core";

/**
 * "Import a playlist" (2026-11): reading a Spotify or YouTube playlist into the engine's `ImportItem`s
 * (core playlistImport.ts matches and structures them). Pure functions over a `call` (the Web API with the DJ's own
 * token), so the browser (Spotify: the signed-in client's token) and the server (YouTube: the Google session) run the
 * same code, and the tests run it against a fake.
 */

export type ApiCall = <T>(path: string) => Promise<T>;

/** at most this many rows are read from one playlist (a 6 h marathon with cortinas is about 150) */
export const IMPORT_MAX_ITEMS = 1000;

export interface PlaylistSummary {
  id: string;
  name: string;
  /** how many rows the service says it holds */
  total: number;
  owner?: string;
  image?: string;
  url: string;
}
export interface ReadPlaylist {
  id: string;
  name: string;
  url: string;
  items: ImportItem[];
  /** rows the reader skipped: local files, podcasts, removed videos */
  skipped: number;
  /** more rows than IMPORT_MAX_ITEMS */
  truncated?: boolean;
}

/* ---------- Spotify ---------- */

/** a Spotify playlist link, URI or bare id → the playlist id */
export function spotifyPlaylistId(text: string): string | null {
  const t = text.trim();
  const m =
    /spotify:playlist:([A-Za-z0-9]{10,40})/.exec(t) ??
    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:user\/[^/]+\/)?playlist\/([A-Za-z0-9]{10,40})/.exec(t) ??
    /^([A-Za-z0-9]{22})$/.exec(t);
  return m ? m[1]! : null;
}

interface SpTrack {
  type?: string;
  uri?: string;
  name?: string;
  is_local?: boolean;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; release_date?: string };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
}
interface SpPage<T> {
  items?: T[];
  next?: string | null;
  total?: number;
}

/** the DJ's own playlists (and the ones they follow), every page */
export async function spotifyMyPlaylists(call: ApiCall): Promise<PlaylistSummary[]> {
  const out: PlaylistSummary[] = [];
  for (let offset = 0; offset < 2000; offset += 50) {
    const j = await call<
      SpPage<{
        id: string;
        name?: string;
        owner?: { display_name?: string };
        images?: Array<{ url?: string }> | null;
        tracks?: { total?: number };
        items?: { total?: number };
        external_urls?: { spotify?: string };
      } | null>
    >(`/me/playlists?limit=50&offset=${offset}`);
    for (const p of j.items ?? []) {
      if (!p?.id) continue;
      out.push({
        id: p.id,
        name: p.name || p.id,
        total: p.items?.total ?? p.tracks?.total ?? 0,
        ...(p.owner?.display_name ? { owner: p.owner.display_name } : {}),
        ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}),
        url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
      });
    }
    if (!j.next || !j.items?.length) break;
  }
  return out;
}

/** a Spotify track as an item: the album's date is a release year, never a recording date */
export function spotifyItem(t: SpTrack): ImportItem | null {
  if (!t || t.is_local || (t.type && t.type !== "track") || !t.uri?.startsWith("spotify:track:") || !t.name)
    return null;
  const it: ImportItem = {
    title: t.name,
    artists: (t.artists ?? []).map((a) => a.name ?? "").filter(Boolean),
    spotifyUri: t.uri,
  };
  if (t.album?.name) it.album = t.album.name;
  if (t.duration_ms) it.durationSec = Math.round(t.duration_ms / 1000);
  const y = Number(t.album?.release_date?.slice(0, 4));
  if (y > 1880) {
    it.year = y;
    it.yearIsRelease = true;
  }
  if (t.external_ids?.isrc) it.isrc = t.external_ids.isrc;
  if (t.external_urls?.spotify) it.url = t.external_urls.spotify;
  return it;
}

/**
 * Every row of a playlist in order, as the listener's market sees it (`market=from_token`): `/items` (the 2026 API),
 * `/tracks` where `/items` does not exist. Local files and episodes are skipped and counted.
 */
export async function spotifyReadPlaylist(call: ApiCall, id: string): Promise<ReadPlaylist> {
  const meta = await call<{ name?: string; external_urls?: { spotify?: string } }>(
    `/playlists/${id}?market=from_token&fields=name,external_urls`,
  );
  const items: ImportItem[] = [];
  let skipped = 0;
  let legacy = false;
  let truncated = false;
  // (the next page starts after the rows this one held: Spotify may answer fewer than the limit)
  for (let offset = 0, n = 0; n < 200; n++) {
    const q = `?market=from_token&limit=100&offset=${offset}`;
    type Row = { is_local?: boolean; item?: SpTrack | null; track?: SpTrack | null };
    let j: SpPage<Row>;
    try {
      j = await call<SpPage<Row>>(`/playlists/${id}/${legacy ? "tracks" : "items"}${q}`);
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (legacy || offset > 0 || (st !== 404 && st !== 405 && st !== 410)) throw e;
      legacy = true;
      j = await call<SpPage<Row>>(`/playlists/${id}/tracks${q}`);
    }
    for (const r of j.items ?? []) {
      const it = spotifyItem({ ...(r.item ?? r.track ?? {}), ...(r.is_local ? { is_local: true } : {}) });
      if (it) items.push(it);
      else skipped++;
    }
    if (items.length >= IMPORT_MAX_ITEMS) {
      truncated = !!j.next;
      break;
    }
    offset += j.items?.length ?? 0;
    if (!j.next || !j.items?.length) break;
  }
  return {
    id,
    name: meta.name || "Spotify playlist",
    url: meta.external_urls?.spotify ?? `https://open.spotify.com/playlist/${id}`,
    items: items.slice(0, IMPORT_MAX_ITEMS),
    skipped,
    ...(truncated ? { truncated } : {}),
  };
}

/* ---------- YouTube ---------- */

/** a YouTube or YouTube Music playlist link (or a bare list id) → the playlist id */
export function youtubePlaylistId(text: string): string | null {
  const t = text.trim();
  if (/^(PL|OL|FL|UU|LL|RD)[A-Za-z0-9_-]{8,60}$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)) return null;
    const l = u.searchParams.get("list");
    return l && /^[A-Za-z0-9_-]{8,80}$/.test(l) ? l : null;
  } catch {
    return null;
  }
}

const DECOR =
  /\s*[([](?:official\s*(?:video|audio)|audio|video|lyrics?|letra|hd|hq|remaster(?:ed)?|restaurad[oa]|full|4k)[^)\]]*[)\]]\s*/gi;

/**
 * A video as an item. YouTube Music's own uploads come from "<Artist> - Topic" with the song as the title; other
 * uploads read "Orchestra - Title (1941)" or "Title - Orchestra", tried both ways round by the matcher.
 */
export function youtubeItem(v: {
  videoId: string;
  title: string;
  channel?: string;
  durationSec?: number;
}): ImportItem | null {
  if (!v.videoId || !v.title || /^(private|deleted) video$/i.test(v.title)) return null;
  const topic = /^(.*) - Topic$/.exec(v.channel ?? "");
  let title = v.title.replace(DECOR, " ").replace(/\s+/g, " ").trim();
  let year: number | undefined;
  title = title
    .replace(/\s*[([](1[89]\d\d|20\d\d)[)\]]\s*/, (_, y: string) => {
      year = Number(y);
      return " ";
    })
    .trim();
  let it: ImportItem;
  if (topic) it = { title, artists: splitArtists(topic[1]!) };
  else {
    const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(title);
    it = m
      ? {
          title: m[2]!.trim(),
          artists: splitArtists(m[1]!),
          variants: [{ title: m[1]!.trim(), artists: splitArtists(m[2]!) }],
        }
      : { title, artists: v.channel ? [v.channel] : [] };
  }
  it.youtubeId = v.videoId;
  it.url = `https://www.youtube.com/watch?v=${v.videoId}`;
  if (year) it.year = year;
  if (v.durationSec) it.durationSec = v.durationSec;
  return it;
}

/** the DJ's own YouTube playlists, every page */
export async function youtubeMyPlaylists(call: ApiCall): Promise<PlaylistSummary[]> {
  const out: PlaylistSummary[] = [];
  let page = "";
  for (let n = 0; n < 40; n++) {
    const j = await call<{
      items?: Array<{
        id: string;
        snippet?: { title?: string; channelTitle?: string; thumbnails?: { default?: { url?: string } } };
        contentDetails?: { itemCount?: number };
      }>;
      nextPageToken?: string;
    }>(
      `/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50${page ? `&pageToken=${page}` : ""}`,
    );
    for (const p of j.items ?? [])
      out.push({
        id: p.id,
        name: p.snippet?.title || p.id,
        total: p.contentDetails?.itemCount ?? 0,
        ...(p.snippet?.channelTitle ? { owner: p.snippet.channelTitle } : {}),
        ...(p.snippet?.thumbnails?.default?.url ? { image: p.snippet.thumbnails.default.url } : {}),
        url: `https://www.youtube.com/playlist?list=${p.id}`,
      });
    if (!j.nextPageToken) break;
    page = encodeURIComponent(j.nextPageToken);
  }
  return out;
}

/** every video of a playlist in order, with its length (one `videos` call per 50) */
export async function youtubeReadPlaylist(call: ApiCall, id: string): Promise<ReadPlaylist> {
  const meta = await call<{ items?: Array<{ snippet?: { title?: string } }> }>(
    `/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(id)}`,
  );
  const rows: Array<{ videoId: string; title: string; channel?: string }> = [];
  let page = "";
  let truncated = false;
  for (let n = 0; n < 40; n++) {
    const j = await call<{
      items?: Array<{
        snippet?: { title?: string; videoOwnerChannelTitle?: string; resourceId?: { videoId?: string } };
        contentDetails?: { videoId?: string };
      }>;
      nextPageToken?: string;
    }>(
      `/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(id)}${page ? `&pageToken=${page}` : ""}`,
    );
    for (const x of j.items ?? [])
      rows.push({
        videoId: x.contentDetails?.videoId ?? x.snippet?.resourceId?.videoId ?? "",
        title: x.snippet?.title ?? "",
        ...(x.snippet?.videoOwnerChannelTitle ? { channel: x.snippet.videoOwnerChannelTitle } : {}),
      });
    if (rows.length >= IMPORT_MAX_ITEMS) {
      truncated = !!j.nextPageToken;
      break;
    }
    if (!j.nextPageToken) break;
    page = encodeURIComponent(j.nextPageToken);
  }
  const lengths = new Map<string, number>();
  const ids = rows.map((r) => r.videoId).filter(Boolean);
  for (let i = 0; i < ids.length; i += 50) {
    const j = await call<{ items?: Array<{ id: string; contentDetails?: { duration?: string } }> }>(
      `/youtube/v3/videos?part=contentDetails&id=${ids.slice(i, i + 50).join(",")}`,
    ).catch(() => ({ items: [] }));
    for (const v of j.items ?? []) {
      const d = parseDuration(v.contentDetails?.duration);
      if (d) lengths.set(v.id, d);
    }
  }
  const items: ImportItem[] = [];
  let skipped = 0;
  for (const r of rows.slice(0, IMPORT_MAX_ITEMS)) {
    const it = youtubeItem({ ...r, durationSec: lengths.get(r.videoId) });
    if (it) items.push(it);
    else skipped++;
  }
  return {
    id,
    name: meta.items?.[0]?.snippet?.title || "YouTube playlist",
    url: `https://www.youtube.com/playlist?list=${id}`,
    items,
    skipped,
    ...(truncated ? { truncated } : {}),
  };
}
