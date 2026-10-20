import { flatten, type Playlist } from "@tdj/core";
import { withoutCortinas } from "./exportPaths";

/**
 * The YouTube export, shared by the route (`/api/google/youtube`) and the Export sheet: one text search per track
 * ("title orchestra singer"), sent in batches so one request never outlives the function (each search plus insert
 * is about a second; a 4 h set has 60–80 tracks). Pure: no server or browser dependency.
 */
export const YOUTUBE_BATCH = 10;

/** One search query per track of the set, in set order (cortinas included when asked). */
export function youtubeQueries(playlist: Playlist, includeCortinas: boolean): string[] {
  return flatten(includeCortinas ? playlist : withoutCortinas(playlist), { includeCortinas }).map(
    (t) => `${t.title} ${t.orchestra ?? t.artist}${t.singer ? ` ${t.singer}` : ""}`,
  );
}

/** Batches of ≤ YOUTUBE_BATCH queries, the most the route takes per request. */
export function youtubeBatches<T>(xs: T[], n = YOUTUBE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
