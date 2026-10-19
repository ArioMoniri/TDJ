"use client";
import { cohesionLabel, compatibility, tandaCohesion } from "@tdj/core";
import type { AppOverrides, AudioFeatures, ResolvedTrack, Song, Tanda } from "./types";

export type SongPatch = NonNullable<AppOverrides["songs"]>[string];
/** `effectiveSong` results per song object, keyed by the patch that produced them (patches are replaced, never mutated). */
const effectiveCache = new WeakMap<Song, { patch: SongPatch; song: Song }>();

/**
 * The song as the engine would see it after this browser's edits: analysed audio and the chosen preview win.
 * Memoised per song object + patch identity: 88 rows re-rendering ask for the same 88 answers.
 */
export function effectiveSong(s: Song, overrides: AppOverrides | null | undefined): Song {
  return patchedSong(s, overrides?.songs?.[s.id]);
}

/** `effectiveSong` with the song's patch already picked out (a row subscribes to that one patch only). */
export function patchedSong(s: Song, p: SongPatch | undefined): Song {
  if (!p) return s;
  const hit = effectiveCache.get(s);
  if (hit && hit.patch === p) return hit.song;
  const song = applyPatch(s, p);
  effectiveCache.set(s, { patch: p, song });
  return song;
}

function applyPatch(s: Song, p: SongPatch): Song {
  const audio: AudioFeatures | null | undefined = p.audio !== undefined ? p.audio : s.audio;
  const resolved: ResolvedTrack | null | undefined = p.resolved !== undefined ? p.resolved : s.resolved;
  return {
    ...s,
    ...(p.year !== undefined ? { year: p.year } : {}),
    ...(p.singer !== undefined ? { singer: p.singer } : {}),
    audio,
    resolved,
  };
}

export type CohesionLabel = ReturnType<typeof cohesionLabel>;
export interface CohesionInfo {
  score: number;
  known: number;
  label: CohesionLabel;
  /** one entry per consecutive pair: the compatibility parts (0..100) or null when a side has no features */
  pairs: Array<{ from: string; to: string; parts: Record<string, number> | null; score: number | null }>;
}

const cohesionCache = new WeakMap<
  Tanda,
  { patches: Array<SongPatch | undefined>; info: CohesionInfo | null }
>();

/**
 * Tanda cohesion recomputed over the browser's analysed features (falls back to the engine's badge).
 * Memoised per tanda object + the patch identities of its songs, so a re-render costs a few reference checks.
 */
export function cohesionFor(t: Tanda, overrides: AppOverrides | null | undefined): CohesionInfo | null {
  return cohesionWith(
    t,
    t.songs.map((s) => overrides?.songs?.[s.id]),
  );
}

/** `cohesionFor` with the songs' patches already picked out (one per song, in order). */
export function cohesionWith(t: Tanda, patches: Array<SongPatch | undefined>): CohesionInfo | null {
  const hit = cohesionCache.get(t);
  if (hit && hit.patches.length === patches.length && hit.patches.every((p, i) => p === patches[i]))
    return hit.info;
  const info = computeCohesion(t, patches);
  cohesionCache.set(t, { patches, info });
  return info;
}

function computeCohesion(t: Tanda, patches: Array<SongPatch | undefined>): CohesionInfo | null {
  const songs = t.songs.map((s, i) => patchedSong(s, patches[i]));
  const feats = songs.map((s) => s.audio ?? null);
  const pairs: CohesionInfo["pairs"] = [];
  for (let i = 1; i < songs.length; i++) {
    const c = compatibility(feats[i - 1], feats[i], t.rhythm);
    pairs.push({
      from: songs[i - 1]!.title,
      to: songs[i]!.title,
      parts: c.known ? c.parts : null,
      score: c.known ? c.score : null,
    });
  }
  const own = tandaCohesion(feats, t.rhythm);
  const score = own.known ? own.score : (t.cohesion ?? null);
  if (score == null) return null;
  return { score, known: own.known, label: cohesionLabel(score), pairs };
}

/** Badge colours: seamless = accent, fine = neutral, audible step = amber, jarring = rose. */
export const COHESION_COLOR: Record<CohesionLabel, string> = {
  seamless: "var(--tint)",
  fine: "var(--label-2)",
  "audible step": "#d9822b",
  jarring: "#e5484d",
};
export const PART_LABEL: Record<string, string> = {
  tempo: "tempo",
  loudness: "loudness",
  key: "key",
  brightness: "brightness",
  energy: "energy",
};
export const PART_ORDER = ["tempo", "loudness", "key", "brightness", "energy"];
