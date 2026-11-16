"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type LadderSong,
  type LrclibRecord,
  type Lyrics,
  lrclibRecords,
  lyricsOf,
  pastedLyrics,
  pickRecord,
  pickWork,
  titleKey,
  titlesOf,
  workLyricsOf,
} from "./lyrics";

/**
 * 2026-11 (the owner: "this should work automatically and find and match; if not, have a setting to add or connect
 * services for it") — where lyrics may come from, beyond LRCLIB (always on, keyless): Musixmatch (its official API,
 * the DJ's own key; the free tier gives part of the text) and Genius (its official API gives songs and links only:
 * credits and a link, never the words). Both opt-in in Settings → Connections → Lyrics; the keys stay in this browser
 * (BYOK) and travel only with the one search they make (lib/api/lyrics.ts). The DJ's paste is the last source.
 */
export interface LyricsSourcesState {
  musixmatch: { on: boolean; key: string };
  genius: { on: boolean; key: string };
  set: (p: Partial<Pick<LyricsSourcesState, "musixmatch" | "genius">>) => void;
}
export const useLyricsSources = create<LyricsSourcesState>()(
  persist(
    (set) => ({
      musixmatch: { on: false, key: "" },
      genius: { on: false, key: "" },
      set: (p) => set(p),
    }),
    {
      name: "tdj-lyrics-sources-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ musixmatch: s.musixmatch, genius: s.genius }),
    },
  ),
);

export interface LyricsCandidate {
  key: string;
  source: "lrclib" | "musixmatch" | "genius";
  title: string;
  artist: string;
  durationSec?: number | null;
  /** this recording, or another recording of the work */
  fit: "side" | "work";
  /** what attaching it gives (absent: a link only — Genius) */
  lyrics?: Lyrics;
  /** the provider's page (Genius) */
  url?: string;
}

/** LRCLIB's answers for a side as candidates: every record with words, this recording's first, synced first */
export function lrclibCandidates(all: readonly LrclibRecord[], s: LadderSong): LyricsCandidate[] {
  const best = pickRecord(all, s);
  const keys = new Set(titlesOf(s).map(titleKey));
  const seen = new Set<number>();
  const out: Array<LyricsCandidate & { rank: number }> = [];
  for (const r of all) {
    if (seen.has(r.id) || r.instrumental || !keys.has(titleKey(r.trackName))) continue;
    if (!r.plainLyrics?.trim() && !r.syncedLyrics?.trim()) continue;
    seen.add(r.id);
    const side = best?.id === r.id;
    const lyrics = side ? lyricsOf(r) : workLyricsOf(pickWork([r], s));
    const kind = side ? "side" : "work";
    out.push({
      key: `lrclib:${r.id}`,
      source: "lrclib",
      title: r.trackName,
      artist: r.artistName,
      durationSec: r.duration ?? null,
      fit: kind,
      lyrics: { ...lyrics, source: "lrclib", match: lyrics.match && { ...lyrics.match, kind } },
      rank: (side ? 100 : 0) + (lyrics.state === "synced" ? 10 : 0),
    });
  }
  return out.sort((a, b) => b.rank - a.rank).map(({ rank: _r, ...c }) => c);
}

async function ask(provider: "musixmatch" | "genius", key: string, s: LadderSong) {
  const r = await fetch("/api/lyrics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, key, title: s.title, artist: s.singer || s.orchestra }),
  });
  return (await r.json().catch(() => ({ state: "error" }))) as {
    state: "ok" | "none" | "key" | "error";
    lyrics?: { id: number; text: string; partial: boolean; copyright: string; pixel: string };
    hits?: Array<{ id: number; title: string; artist: string; url: string }>;
  };
}

export type SourceState = "ok" | "none" | "key" | "error" | "off";

/** every enabled source's candidates for a side, and how each source answered */
export async function findLyrics(
  s: LadderSong,
  o: { f?: typeof fetch } = {},
): Promise<{
  candidates: LyricsCandidate[];
  states: Record<"lrclib" | "musixmatch" | "genius", SourceState>;
}> {
  const cfg = useLyricsSources.getState();
  const states: Record<"lrclib" | "musixmatch" | "genius", SourceState> = {
    lrclib: "none",
    musixmatch: cfg.musixmatch.on && cfg.musixmatch.key ? "none" : "off",
    genius: cfg.genius.on && cfg.genius.key ? "none" : "off",
  };
  const [lr, mx, gn] = await Promise.all([
    lrclibRecords(s, o.f).catch(() => ({ all: [], answered: false })),
    states.musixmatch === "off" ? null : ask("musixmatch", cfg.musixmatch.key, s).catch(() => null),
    states.genius === "off" ? null : ask("genius", cfg.genius.key, s).catch(() => null),
  ]);
  const candidates = lrclibCandidates(lr.all, s);
  states.lrclib = !lr.answered ? "error" : candidates.length ? "ok" : "none";
  if (mx) {
    states.musixmatch = mx.state;
    if (mx.state === "ok" && mx.lyrics)
      candidates.push({
        key: `musixmatch:${mx.lyrics.id}`,
        source: "musixmatch",
        title: s.title,
        artist: s.singer || s.orchestra,
        fit: "work",
        lyrics: {
          ...pastedLyrics(mx.lyrics.text),
          source: "musixmatch",
          copyright: mx.lyrics.copyright || undefined,
          pixel: mx.lyrics.pixel || undefined,
          partial: mx.lyrics.partial || undefined,
        },
      });
  } else if (states.musixmatch !== "off") states.musixmatch = "error";
  if (gn) {
    states.genius = gn.state;
    for (const h of gn.hits ?? [])
      candidates.push({
        key: `genius:${h.id}`,
        source: "genius",
        title: h.title,
        artist: h.artist,
        fit: "work",
        url: h.url,
      });
  } else if (states.genius !== "off") states.genius = "error";
  return { candidates, states };
}
