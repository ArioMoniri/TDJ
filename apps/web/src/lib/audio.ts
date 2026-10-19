"use client";
import { cohesionLabel, compatibility, tandaCohesion } from "@tdj/core";
import type { AppOverrides, AudioFeatures, ResolvedTrack, Song, Tanda } from "./types";

/** The song as the engine would see it after this browser's edits: analysed audio and the chosen preview win. */
export function effectiveSong(s: Song, overrides: AppOverrides | null | undefined): Song {
  const p = overrides?.songs?.[s.id];
  if (!p) return s;
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

/** Tanda cohesion recomputed over the browser's analysed features (falls back to the engine's badge). */
export function cohesionFor(t: Tanda, overrides: AppOverrides | null | undefined): CohesionInfo | null {
  const songs = t.songs.map((s) => effectiveSong(s, overrides));
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
