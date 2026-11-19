"use client";
import { saveHistory } from "@/lib/history";
import { normalizeMemory } from "@/lib/memory";
import { useStore } from "@/lib/store";
import type { AppOverrides, HistorySnapshot, UserSettings } from "@/lib/types";
import type { LocalSide } from "./engine";
import type { Library } from "./library";

/**
 * The app's stores as the sync engine's local side. Reads are the stores' current objects (by reference, so an
 * untouched night is never compared); writes go through the stores' public actions, which also persist them
 * (IndexedDB, the device database in the apps, the server row when the DJ chose server storage).
 */
export const storeSide: LocalSide = {
  read(): Library {
    const s = useStore.getState();
    return {
      history: s.history,
      memory: s.memory,
      settings: s.settings,
      overrides: s.overrides,
    } as unknown as Library;
  },
  write(p: Partial<Library>) {
    const s = useStore.getState();
    if (p.history) {
      // History's own persistence (one record per night): a synced rename or delete lands like a local one
      const history = p.history as unknown as HistorySnapshot[];
      useStore.setState({ history });
      saveHistory(history, s.storageMode, true);
    }
    if (p.memory) s.updateMemory(() => normalizeMemory(p.memory));
    if (p.overrides) s.updateOverrides(() => p.overrides as AppOverrides);
    if (p.settings) s.setSettings(p.settings as Partial<UserSettings>);
  },
};

/** Whether the stores hold the device's data yet (before that, an empty History is not a delete). */
export const storesReady = () => useStore.getState().overridesReady && useStore.persist.hasHydrated();

/** Calls `fn` when the synced parts of the stores change. */
export function onLocalChange(fn: () => void): () => void {
  return useStore.subscribe((s, prev) => {
    if (
      s.history !== prev.history ||
      s.memory !== prev.memory ||
      s.settings !== prev.settings ||
      s.overrides !== prev.overrides
    )
      fn();
  });
}
