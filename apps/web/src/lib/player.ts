"use client";
import { create } from "zustand";
import type { Song } from "./types";

/** What the one global player can play for a song: a Spotify track (connected) or the 30 s Deezer preview. */
export interface PlayerSource {
  kind: "spotify" | "preview";
  /** spotify track id or preview MP3 URL */
  ref: string;
}

export interface PlayerTrack {
  id: string;
  title: string;
  orchestra: string;
  singer?: string | null;
  year?: number | null;
  source: PlayerSource;
}

interface PlayerState {
  track: PlayerTrack | null;
  playing: boolean;
  /** seconds */
  position: number;
  duration: number;
  /** a preview failed to load */
  error: string | null;
  play: (t: PlayerTrack) => void;
  toggle: (t?: PlayerTrack) => void;
  pause: () => void;
  close: () => void;
  seek: (sec: number) => void;
  /** internal: the <audio> element reports here */
  _tick: (position: number, duration: number) => void;
  _ended: () => void;
  _error: (msg: string) => void;
}

/** One preview at a time, app-wide. The `<audio>` element itself lives in `MiniPlayer`. */
export const usePlayer = create<PlayerState>()((set, get) => ({
  track: null,
  playing: false,
  position: 0,
  duration: 0,
  error: null,
  play: (track) => set({ track, playing: true, position: 0, duration: 0, error: null }),
  toggle: (t) => {
    const cur = get().track;
    if (t && cur?.id !== t.id) return get().play(t);
    if (!cur) return;
    set({ playing: !get().playing });
  },
  pause: () => set({ playing: false }),
  close: () => set({ track: null, playing: false, position: 0, duration: 0, error: null }),
  seek: (position) => set({ position }),
  _tick: (position, duration) => set({ position, duration }),
  _ended: () => set({ playing: false, position: 0 }),
  _error: (error) => set({ error, playing: false }),
}));

const spotifyId = (uri: string) => uri.replace(/^spotify:track:/, "");

/**
 * Source order per spec: Spotify full track when connected and the song has a Spotify id,
 * else the resolved 30 s preview; null means "Find" (see ResolveSheet).
 */
export function sourceFor(
  song: Pick<Song, "spotify" | "resolved">,
  spotifyConnected: boolean,
  patch?: { resolved?: Song["resolved"]; spotify?: Song["spotify"] } | null,
): PlayerSource | null {
  const sp = patch?.spotify ?? song.spotify;
  if (spotifyConnected && sp?.uri) return { kind: "spotify", ref: spotifyId(sp.uri) };
  const r = patch?.resolved ?? song.resolved;
  if (r?.previewUrl) return { kind: "preview", ref: r.previewUrl };
  return null;
}

export function trackFor(song: Song, source: PlayerSource): PlayerTrack {
  return {
    id: song.id,
    title: song.title,
    orchestra: song.orchestra,
    singer: song.singer,
    year: song.year,
    source,
  };
}
