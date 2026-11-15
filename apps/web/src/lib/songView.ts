"use client";
import { type Song, type SongDataView, songData } from "@tdj/core";
import { useMemo } from "react";
import { djDataOf } from "./artwork";
import { patchedSong } from "./audio";
import { useStore } from "./store";

/**
 * Round 22 — what a row shows for one side (artwork, BPM, key, level, date): the DJ's edit, then their sources, then
 * the index. Subscribes to this song's patch and scraped record only, so a row re-renders for its own side.
 */
export function useSongData(s: Song): { song: Song; data: SongDataView } {
  const patch = useStore((st) => st.overrides.songs?.[s.id]);
  const scraped = useStore((st) => st.overrides.scraped?.[s.id]);
  return useMemo(() => {
    const song = patchedSong(s, patch);
    return { song, data: songData(song, scraped, djDataOf(patch)) };
  }, [s, patch, scraped]);
}

/** "124 BPM", "Am" — the short chips of a row */
export const bpmText = (d: SongDataView) => (d.bpm ? `${Math.round(d.bpm.value as number)} BPM` : null);
export const keyText = (d: SongDataView) => (d.key ? String(d.key.value) : null);
/** where a value came from, in the DJ's words */
export const SOURCE_LABEL: Record<string, string> = {
  dj: "yours",
  deezer: "Deezer",
  musicbrainz: "MusicBrainz",
  coverart: "Cover Art Archive",
  discogs: "Discogs",
  spotify: "Spotify",
  audio: "analysed preview",
  index: "index",
  knowledge: "knowledge table",
  heuristic: "refrain-era rule",
};
