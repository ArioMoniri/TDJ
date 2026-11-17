"use client";
import { create } from "zustand";

/**
 * 2026-11 — two choices of the play views, kept on this device: the beat glow behind Now playing's artwork (on by
 * default; Reduce motion and Battery saver turn it off whatever is chosen), and whether the dancers' Floor screen
 * shows the synced lyrics or the matched video (on by default). A Floor screen window this browser opened follows a
 * change at once (the storage event); a Floor screen on another device reads `?extras=0` in its link.
 */
const KEY = "tdj-now-prefs-v1";

export interface NowPrefs {
  beatGlow: boolean;
  floorExtras: boolean;
}
const DEFAULTS: NowPrefs = { beatGlow: true, floorExtras: true };

function read(): NowPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const o = raw ? (JSON.parse(raw) as Partial<NowPrefs>) : {};
    return {
      beatGlow: typeof o.beatGlow === "boolean" ? o.beatGlow : DEFAULTS.beatGlow,
      floorExtras: typeof o.floorExtras === "boolean" ? o.floorExtras : DEFAULTS.floorExtras,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useNowPrefs = create<NowPrefs & { set: (p: Partial<NowPrefs>) => void; reload: () => void }>()(
  (set, get) => ({
    ...DEFAULTS,
    set: (p) => {
      const next = { beatGlow: get().beatGlow, floorExtras: get().floorExtras, ...p };
      set(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
    },
    reload: () => set(read()),
  }),
);

/** load the saved choices and follow another window's changes; returns its stop */
export function watchNowPrefs(): () => void {
  useNowPrefs.getState().reload();
  const on = (e: StorageEvent) => {
    if (e.key === KEY) useNowPrefs.getState().reload();
  };
  window.addEventListener("storage", on);
  return () => window.removeEventListener("storage", on);
}

/** Reduce motion or Battery saver (lib/power.ts: `data-power="saver"` on the root): no beat animation at all */
export function motionOff(): boolean {
  if (typeof document === "undefined") return true;
  return (
    document.documentElement.dataset.power === "saver" ||
    document.documentElement.classList.contains("power-saver") ||
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
