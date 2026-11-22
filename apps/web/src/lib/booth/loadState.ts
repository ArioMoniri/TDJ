"use client";
import { create } from "zustand";

/**
 * 2026-11: what the Booth shows and loads, without the Booth's engine (lib/booth/store.ts): History, the sidebar and
 * Compose set it when they send a night to the Booth (lib/nightActions.ts), and the Booth page reads it. Kept apart
 * from lib/booth/loadNight.ts so a page that only sends a night never bundles the Booth.
 */
export interface LoadState {
  /** the Booth shows no night (Compose keeps its own) */
  cleared: boolean;
  /** a night waiting for the room's song to end (lib/booth/loadNight.ts) */
  pending: import("@/lib/types").Playlist | null;
  /** one more on every load: the Booth boots again even when the night loaded is the one it had */
  seq: number;
  /** after the next boot, the playhead goes here (an Undo that brings a night back where it was), then null */
  resumeAt: number | null;
}
export const useBoothLoad = create<LoadState>(() => ({
  cleared: false,
  pending: null,
  seq: 0,
  resumeAt: null,
}));

/** the Booth (re)boots on the app's current night: a load, an Undo, a reset */
export function bootBooth(o: { resumeAt?: number | null } = {}): void {
  useBoothLoad.setState((x) => ({
    cleared: false,
    pending: null,
    seq: x.seq + 1,
    resumeAt: o.resumeAt ?? null,
  }));
}
