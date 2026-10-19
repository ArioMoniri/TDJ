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

/** A chained preview: the tracks of one tanda back to back, `clipSec` of each (round4-ux.md §10.1 "Preview tanda"). */
export interface PlayerQueue {
  label: string;
  tracks: PlayerTrack[];
  index: number;
  clipSec: number;
}

interface PlayerState {
  track: PlayerTrack | null;
  playing: boolean;
  /** seconds */
  position: number;
  duration: number;
  /** a preview failed to load */
  error: string | null;
  /** set while a tanda preview chains its tracks; any manual play clears it */
  queue: PlayerQueue | null;
  play: (t: PlayerTrack) => void;
  /** play `tracks` back to back, `clipSec` seconds each */
  playQueue: (label: string, tracks: PlayerTrack[], clipSec?: number) => void;
  /** advance the chain; stops at the end */
  next: () => void;
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
  queue: null,
  play: (track) => set({ track, playing: true, position: 0, duration: 0, error: null, queue: null }),
  playQueue: (label, tracks, clipSec = 10) => {
    const first = tracks[0];
    if (!first) return;
    set({
      track: first,
      playing: true,
      position: 0,
      duration: 0,
      error: null,
      queue: { label, tracks, index: 0, clipSec },
    });
  },
  next: () => {
    const q = get().queue;
    if (!q) return set({ playing: false, position: 0 });
    const index = q.index + 1;
    const track = q.tracks[index];
    if (!track) return set({ playing: false, position: 0, queue: null });
    set({ track, playing: true, position: 0, duration: 0, error: null, queue: { ...q, index } });
  },
  toggle: (t) => {
    const cur = get().track;
    if (t && cur?.id !== t.id) return get().play(t);
    if (!cur) return;
    set({ playing: !get().playing });
  },
  pause: () => set({ playing: false }),
  close: () => set({ track: null, playing: false, position: 0, duration: 0, error: null, queue: null }),
  seek: (position) => set({ position }),
  _tick: (position, duration) => {
    const q = get().queue;
    // a chained preview hands over to the next track after its clip
    if (q && position >= q.clipSec) return get().next();
    set({ position, duration });
  },
  _ended: () => get().next(),
  _error: (error) => {
    // a chain skips a preview that fails instead of stopping the tanda
    if (get().queue) return get().next();
    set({ error, playing: false });
  },
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
