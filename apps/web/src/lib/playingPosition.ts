"use client";
import { useEffect, useRef, useState } from "react";
import type { useBooth as UseBooth } from "./booth/store";
import { type BoothSnap, type PlayerSnap, type Playing, pickPlaying } from "./lyricsSync";
import { usePlayer } from "./player";

/**
 * 2026-11 — "what is playing and where is it", one answer for every lyrics view, rhythm lane and "Mark now": the
 * Booth's engine (its room clock — the reconciled TrackClock for Spotify — or a pre-listen of the file) while a night
 * plays, else the app's mini player (lib/player.ts, the element or the Spotify device lib/playback.ts drives). The
 * Booth is read through `window.__tdjBooth` (set by its page) so no page gains the engine for this. Pure choice:
 * lib/lyricsSync.ts → `pickPlaying`.
 */

type BoothStore = typeof UseBooth;
type BoothState = ReturnType<BoothStore["getState"]>;
type EngineLike = {
  sourcePosition: () => number | null;
  position: () => number;
  currentLength: () => number;
} | null;

export const boothStore = (): BoothStore | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { __tdjBooth?: BoothStore }).__tdjBooth ?? null);
export const boothEngine = (): EngineLike =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { __tdjBoothEngine?: () => EngineLike }).__tdjBoothEngine?.() ?? null);

type BoothView = Pick<BoothState, "started" | "planIndex" | "plan" | "entities" | "sources" | "audition"> & {
  positionOf: BoothState["positionOf"];
};

/** tonight's row of a side (its plan item or its entity), −1 when it is not in tonight's plan */
export function planRowOf(s: Pick<BoothView, "plan" | "entities">, songId: string): number {
  const items = s.plan?.items ?? [];
  for (let i = 0; i < items.length; i++)
    if (items[i]?.kind !== "break" && (items[i]?.id === songId || s.entities[i]?.id === songId)) return i;
  return -1;
}

/** the Booth's word on one side: its clock (room or pre-listen of the file), or that it sounds from a clip */
export function boothSnapOf(s: BoothView, songId: string): BoothSnap {
  const pos = s.positionOf(songId);
  if (pos) return { pos, clip: false };
  const i = s.planIndex;
  const current = s.started && (s.plan?.items[i]?.id === songId || s.entities[i]?.id === songId);
  const roomClip = current && s.sources[i] === "preview";
  const cueClip = s.audition?.songId === songId && s.audition.via !== "file";
  return { pos: null, clip: !!(roomClip || cueClip) };
}

/* the mini player's last report, timed (it ticks a few times a second: frames in between carry it forward) */
let reportedAt = 0;
if (typeof window !== "undefined")
  usePlayer.subscribe((s, prev) => {
    if (s.position !== prev.position || s.playing !== prev.playing || s.track?.id !== prev.track?.id)
      reportedAt = performance.now();
  });

export function playerSnap(now = typeof performance !== "undefined" ? performance.now() : 0): PlayerSnap {
  const p = usePlayer.getState();
  return {
    trackId: p.track?.id ?? null,
    kind: p.track?.source.kind ?? null,
    playing: p.playing,
    position: p.position,
    duration: p.duration,
    sinceMs: reportedAt ? now - reportedAt : 0,
  };
}

/** right now: is this side playing, where, and from which player (null: not playing anywhere) */
export function readPlaying(songId: string): Playing | null {
  const b = boothStore();
  return pickPlaying(songId, b ? boothSnapOf(b.getState(), songId) : null, playerSnap());
}

/** the `PositionFn` shape the rhythm lane and the marks read every frame (a clip has no recording second) */
export const playingPositionFn = (songId: string) => () => {
  const p = readPlaying(songId);
  return p?.synced ? { sec: p.positionSec, playing: p.playing } : null;
};

const same = (a: Playing | null, b: Playing | null, step: number) =>
  a === b ||
  (!!a &&
    !!b &&
    a.source === b.source &&
    a.playing === b.playing &&
    a.synced === b.synced &&
    Math.abs(a.positionSec - b.positionSec) < step);

/**
 * The side's playing state for a view, read every animation frame (a seek, a pause, the next song show at once) and
 * handed to React only when it changes by `stepSec` or its source / play state changes. `onFrame` runs every frame.
 */
export function usePlayingPosition(
  songId: string | null | undefined,
  o: { stepSec?: number; onFrame?: (p: Playing | null) => void } = {},
): Playing | null {
  const [p, setP] = useState<Playing | null>(null);
  const frame = useRef(o.onFrame);
  frame.current = o.onFrame;
  const step = o.stepSec ?? 0.25;
  useEffect(() => {
    if (!songId) {
      setP(null);
      return;
    }
    let raf = 0;
    let last: Playing | null = null;
    let first = true;
    const tick = () => {
      const now = readPlaying(songId);
      frame.current?.(now);
      if (first || !same(now, last, step)) {
        first = false;
        last = now;
        setP(now);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [songId, step]);
  return p;
}
