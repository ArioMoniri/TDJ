import { type DjSongData, type ScrapedRecord, type Song, songData } from "@tdj/core";
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
