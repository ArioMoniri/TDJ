"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearOverrides, loadOverrides, saveOverrides, type StorageMode } from "./overrides";
import type { AppOverrides, ComposeOptions, Playlist } from "./types";
import { AI_DEFAULT_MODEL, DEFAULT_SETTINGS, type UserSettings } from "./types";

export const DEFAULT_OPTS: Partial<ComposeOptions> = {
  hours: 4,
  eras: ["golden"],
  pattern: "classic",
  tandaShape: "rise-settle",
  arc: "classic-two-peaks",
  cortinaStyle: "matched",
  cortinaCultures: ["global"],
  cortinaTrend: "mixed",
  cortinaLengthSec: 45,
  closeWithCumparsita: true,
  floorMood: "balanced",
  tangoTandaSize: 4,
  valsTandaSize: 3,
  milongaTandaSize: 3,
  orchestraRepeatGap: 6,
  maxYearSpread: 4,
};

interface State {
  options: Partial<ComposeOptions>;
  playlist: Playlist | null;
  busy: boolean;
  settings: UserSettings;
  spotifyToken: { access: string; expires: number; refresh?: string } | null;
  /** the user's database (IndexedDB, or the server when enabled); not part of localStorage */
  overrides: AppOverrides;
  overridesReady: boolean;
  storageMode: StorageMode;
  setOptions: (o: Partial<ComposeOptions>) => void;
  replaceOptions: (o: Partial<ComposeOptions>) => void;
  setPlaylist: (p: Playlist | null) => void;
  setBusy: (b: boolean) => void;
  setSettings: (s: Partial<UserSettings>) => void;
  setSpotifyToken: (t: State["spotifyToken"]) => void;
  bootOverrides: () => Promise<void>;
  updateOverrides: (fn: (o: AppOverrides) => AppOverrides) => void;
  resetOverrides: () => Promise<void>;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      options: DEFAULT_OPTS,
      playlist: null,
      busy: false,
      settings: DEFAULT_SETTINGS,
      spotifyToken: null,
      overrides: {},
      overridesReady: false,
      storageMode: "browser",
      setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),
      replaceOptions: (options) => set({ options }),
      setPlaylist: (playlist) => set({ playlist }),
      setBusy: (busy) => set({ busy }),
      setSettings: (x) => set((s) => ({ settings: { ...s.settings, ...x } })),
      setSpotifyToken: (spotifyToken) => set({ spotifyToken }),
      bootOverrides: async () => {
        if (get().overridesReady) return;
        const { overrides, mode } = await loadOverrides();
        set({ overrides, storageMode: mode, overridesReady: true });
      },
      updateOverrides: (fn) => {
        const next = fn(get().overrides);
        set({ overrides: next });
        saveOverrides(next, get().storageMode);
      },
      resetOverrides: async () => {
        set({ overrides: {} });
        await clearOverrides(get().storageMode);
      },
    }),
    {
      name: "tdj-v1",
      version: 2,
      partialize: (s) => ({
        options: s.options,
        settings: s.settings,
        spotifyToken: s.spotifyToken,
        playlist: s.playlist,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { settings?: Record<string, unknown> };
        if (version < 2 && p.settings) {
          const old = p.settings;
          const key = typeof old.anthropicApiKey === "string" ? old.anthropicApiKey : "";
          const model = typeof old.anthropicModel === "string" ? old.anthropicModel : AI_DEFAULT_MODEL.anthropic;
          p.settings = { ...old, ai: { provider: "anthropic", key, model } };
          delete p.settings.anthropicApiKey;
          delete p.settings.anthropicModel;
        }
        return p as unknown as State;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings ?? {}),
            ai: { ...DEFAULT_SETTINGS.ai, ...(p.settings?.ai ?? {}) },
            djApps: { ...DEFAULT_SETTINGS.djApps, ...(p.settings?.djApps ?? {}) },
          },
        };
      },
    },
  ),
);

/** Overrides are sent with every compose; undefined when the database is untouched keeps the shared cache hot. */
export function overridesForRequest(o: AppOverrides): AppOverrides | undefined {
  const { updatedAt: _u, ...rest } = o;
  const any = Object.values(rest).some((v) =>
    Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : false,
  );
  return any ? rest : undefined;
}
