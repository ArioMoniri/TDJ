import { type Cortina, type DjSongData, type ScrapedRecord, type Song, songData } from "@tdj/core";
import { surnameOf } from "./booth/songInfo";
import type { SongPatch } from "./types";

/**
 * Round 22 — artwork on every song (compose, the database, the search panel): the DJ's own image, else what their
 * sources fetched (Deezer, the Cover Art Archive, Discogs, Spotify), else the shipped Deezer match's cover; with none,
 * a placeholder per orchestra (its colour and initials), the same everywhere.
 */
export function djDataOf(p: SongPatch | undefined | null): DjSongData | null {
  if (!p) return null;
  return {
    ...(typeof p.bpm === "number" ? { bpm: p.bpm } : {}),
    ...(typeof p.gainDb === "number" ? { gainDb: p.gainDb } : {}),
    ...(p.key ? { key: p.key } : {}),
    ...(p.artwork ? { artwork: p.artwork } : {}),
    ...(p.release ? { release: p.release } : {}),
    ...(p.deezerId ? { deezerId: p.deezerId } : {}),
    ...(p.spotify !== undefined ? { spotify: p.spotify ? { uri: p.spotify.uri } : null } : {}),
    ...(p.vocalStyle ? { vocalStyle: p.vocalStyle } : {}),
  };
}

export function artworkFor(
  s: Song,
  scraped?: ScrapedRecord | null,
  patch?: SongPatch | null,
): string | undefined {
  return songData(s, scraped, djDataOf(patch)).artwork?.value as string | undefined;
}

const SKIP = new Set([
  "orquesta",
  "tipica",
  "típica",
  "y",
  "su",
  "de",
  "del",
  "la",
  "los",
  "las",
  "el",
  "sexteto",
  "cuarteto",
  "trio",
  "trío",
]);
/** a stable colour pair and initials per orchestra: "Carlos Di Sarli" → CS on its own hue */
export function orchestraPlaceholder(
  id: string,
  name: string,
): { initials: string; from: string; to: string } {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}']/gu, ""))
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words[words.length - 1]!.replace(/^[dD]'/, "")[0] ?? "") : "";
  let h = 0;
  for (const ch of id || name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return {
    initials: `${first}${last}`.toUpperCase(),
    from: `hsl(${hue} 58% 54%)`,
    to: `hsl(${(hue + 28) % 360} 62% 34%)`,
  };
}

/* ---------- the Booth's covers: the catalogue's, else a Spotify cover looked up once and kept on this device ---------- */

/**
 * The Booth reads the catalogue's Deezer cover (`resolved.artwork`) first, then a cached cover found for the side's
 * Spotify recording; without either, a placeholder per orchestra (its surname's initials on a hue of its own), so a
 * set list of the same orchestra reads as one block.
 */
type Entity = Song | Cortina | null | undefined;

const IMAGE = /^https:\/\/[^\s"'<>]+$/;
const ok = (u: unknown): u is string => typeof u === "string" && IMAGE.test(u);

/** The cover URL for a side or cortina, or null. `cache` maps an id to a cover found earlier (Spotify). */
export function coverFor(e: Entity, cache?: Record<string, string>): string | null {
  if (!e) return null;
  const r = (e as { resolved?: { artwork?: string } | null }).resolved;
  if (ok(r?.artwork)) return r.artwork;
  const c = cache?.[e.id];
  return ok(c) ? c : null;
}

/** A stable placeholder per orchestra: initials of its surname and a hue (0–359). */
export function placeholderFor(orchestra: string): { initials: string; hue: number } {
  const sur = surnameOf(orchestra || "?");
  const parts = sur.split(/[\s']+/).filter(Boolean);
  const initials =
    parts.length > 1
      ? parts
          .map((w) => w[0]!.toUpperCase())
          .join("")
          .slice(0, 2)
      : (parts[0]?.[0] ?? "?").toUpperCase();
  let h = 2166136261;
  for (const ch of orchestra) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return { initials, hue: (h >>> 0) % 360 };
}

/* ---------- the cover cache (browser): Spotify covers looked up once per recording, kept on this device ---------- */

const KEY = "tdj-artwork-v1";
let mem: Record<string, string> | null = null;
const inflight = new Map<string, Promise<string | null>>();

export function artworkCache(): Record<string, string> {
  if (mem) return mem;
  mem = {};
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) mem = JSON.parse(raw) as Record<string, string>;
  } catch {}
  return mem;
}
function remember(id: string, url: string) {
  const c = artworkCache();
  c[id] = url;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

/** Spotify's public oEmbed gives a recording's cover without a login. */
export type CoverLookup = (spotifyUrl: string) => Promise<string | null>;
export const spotifyOEmbed: CoverLookup = async (url) => {
  const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { thumbnail_url?: string } | null;
  return ok(j?.thumbnail_url) ? j.thumbnail_url : null;
};

/** The cover for a side, looking it up (once) from its Spotify recording when the catalogue has none. */
export function loadArtwork(e: Entity, lookup: CoverLookup = spotifyOEmbed): Promise<string | null> {
  const hit = coverFor(e, artworkCache());
  if (hit || !e) return Promise.resolve(hit);
  const url = (e as { spotify?: { url?: string } | null }).spotify?.url;
  if (!url || !/^https:\/\/open\.spotify\.com\/track\//.test(url)) return Promise.resolve(null);
  let p = inflight.get(e.id);
  if (!p) {
    p = lookup(url)
      .then((u) => {
        if (u) remember(e.id, u);
        return u;
      })
      .catch(() => null);
    inflight.set(e.id, p);
  }
  return p;
}
