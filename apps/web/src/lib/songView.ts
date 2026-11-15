"use client";
import { type Song, type SongDataView, songData } from "@tdj/core";
import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { djDataOf } from "./artwork";
import { patchedSong } from "./audio";
import { type BpmChoice, bpmChoice } from "./songData";
import { useStore } from "./store";

/**
 * Round 22 — what a row shows for one side (artwork, BPM, key, level, date): the DJ's edit, then their sources, then
 * the index. Subscribes to this song's patch and scraped record only, so a row re-renders for its own side.
 * Wave 2: the BPM is the one `bpmChoice` picks (DJ edit > analysed preview > source > estimate, in the rhythm's
 * convention), so every place that prints a tempo prints the same number.
 */
export function useSongData(s: Song): { song: Song; data: SongDataView; bpm: BpmChoice | null } {
  const patch = useStore((st) => st.overrides.songs?.[s.id]);
  const scraped = useStore((st) => st.overrides.scraped?.[s.id]);
  return useMemo(() => {
    const song = patchedSong(s, patch);
    const dj = djDataOf(patch);
    const data = songData(song, scraped, dj);
    const bpm = bpmChoice(song, scraped, dj);
    if (bpm)
      data.bpm = {
        value: bpm.value,
        source:
          bpm.used.source !== "source"
            ? bpm.used.source
            : (Object.keys(SOURCE_LABEL).find((k) => SOURCE_LABEL[k] === bpm.used.label) ?? "source"),
      };
    else delete data.bpm;
    return { song, data, bpm };
  }, [s, patch, scraped]);
}

/** "124 BPM", "Am" — the short chips of a row */
export const bpmText = (d: SongDataView) =>
  d.bpm ? t("songView.bpm", { p1: Math.round(d.bpm.value as number) }) : null;
export const keyText = (d: SongDataView) => (d.key ? String(d.key.value) : null);
/** where a value came from, in the DJ's words */
export const SOURCE_LABEL: Record<string, string> = {
  get dj() {
    return t("songView.yours");
  },
  deezer: "Deezer",
  musicbrainz: "MusicBrainz",
  get coverart() {
    return t("songView.cover_art_archive");
  },
  discogs: "Discogs",
  spotify: "Spotify",
  get audio() {
    return t("songView.analysed_preview");
  },
  get index() {
    return t("songView.t_dj_catalogue");
  },
  get knowledge() {
    return t("songView.tango_reference");
  },
  get heuristic() {
    return t("songView.guessed_from_the_era");
  },
};
