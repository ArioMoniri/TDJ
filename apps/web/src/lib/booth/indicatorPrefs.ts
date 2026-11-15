"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { type IndicatorId, type IndicatorPrefs, indicatorDefaults } from "./indicatorList";

/**
 * Round 22: the DJ's indicator switches (energy, BPM, key, era, artwork), kept on this device. Settings and the
 * player's Show sheet write the same store, so a switch hides the indicator everywhere it appears.
 */
const KEY = "tdj-indicators-v1";

interface Prefs {
  prefs: IndicatorPrefs;
  hydrated: boolean;
  set: (id: IndicatorId, on: boolean) => void;
  hydrate: () => void;
}

export const useIndicatorPrefs = create<Prefs>()((set, get) => ({
  prefs: indicatorDefaults(),
  hydrated: false,
  set: (id, on) => {
    const prefs = { ...get().prefs, [id]: on };
    set({ prefs });
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {}
  },
  hydrate: () => {
    if (get().hydrated) return;
    let saved: Partial<IndicatorPrefs> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<IndicatorPrefs>;
    } catch {}
    set({ prefs: { ...indicatorDefaults(), ...saved }, hydrated: true });
  },
}));

/** The switches, read after mount (the server renders every indicator on). */
export function useIndicators(): IndicatorPrefs {
  const prefs = useIndicatorPrefs((s) => s.prefs);
  const hydrate = useIndicatorPrefs((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  return prefs;
}
