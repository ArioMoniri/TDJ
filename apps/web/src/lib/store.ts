"use client";
import { emptyMemory } from "@tdj/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearHistoryStore, isSnapshot, loadHistoryLocal, pushSnapshot, saveHistory } from "./history";
import { clearMemoryStore, saveMemory } from "./memory";
import { clearOverrides, loadOverrides, type StorageMode, saveOverrides } from "./overrides";
import type {
  AgentMemory,
  AppOptions,
  AppOverrides,
  ComposeOptions,
  HistorySnapshot,
  Playlist,
} from "./types";
import { AI_DEFAULT_MODEL, DEFAULT_SETTINGS, type UserSettings } from "./types";

/** Mirrors the engine's DEFAULT_OPTIONS: an untouched control shows what the engine will do. */
export const DEFAULT_OPTS: Partial<ComposeOptions> = {
  hours: 4,
  eras: ["golden"],
  pattern: "classic",
  tandaShape: "rise-settle",
  arc: "classic-two-peaks",
  cortinaStyle: "family",
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
  options: AppOptions;
  playlist: Playlist | null;
  busy: boolean;
  settings: UserSettings;
  spotifyToken: { access: string; expires: number; refresh?: string } | null;
  /** the user's database (IndexedDB, or the server when enabled); not part of localStorage */
  overrides: AppOverrides;
  overridesReady: boolean;
  storageMode: StorageMode;
  /** what the agents remember (notes, sets, feedback, learned preferences); stored with the database */
  memory: AgentMemory;
  /** previous generations, newest first (IndexedDB `tdj-history-v1`, plus the server row when enabled) */
  history: HistorySnapshot[];
  addSnapshot: (s: HistorySnapshot) => void;
  updateSnapshot: (id: string, patch: Partial<HistorySnapshot>) => void;
  removeSnapshot: (id: string) => void;
  clearHistory: () => Promise<void>;
  /** the DJ changed these controls: every key becomes explicit (era presets use `presetOptions`) */
  setOptions: (o: Partial<AppOptions>) => void;
  /** an era preset or a reset filled these keys: not explicit */
  presetOptions: (o: Partial<AppOptions>) => void;
  /** replaces the engine options (feedback / refine results), keeps pins and marks `explicit` (or the changed keys) touched */
  replaceOptions: (o: Partial<ComposeOptions>, explicit?: string[]) => void;
  setPlaylist: (p: Playlist | null) => void;
  setBusy: (b: boolean) => void;
  setSettings: (s: Partial<UserSettings>) => void;
  setSpotifyToken: (t: State["spotifyToken"]) => void;
  bootOverrides: () => Promise<void>;
  updateOverrides: (fn: (o: AppOverrides) => AppOverrides) => void;
  resetOverrides: () => Promise<void>;
  updateMemory: (fn: (m: AgentMemory) => AgentMemory) => void;
  clearMemory: () => Promise<void>;
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
      memory: emptyMemory(),
      history: [],
      addSnapshot: (snap) => {
        const next = pushSnapshot(get().history, snap);
        set({ history: next });
        saveHistory(next, get().storageMode);
      },
      updateSnapshot: (id, patch) => {
        const next = get().history.map((h) => (h.id === id ? { ...h, ...patch } : h));
        set({ history: next });
        saveHistory(next, get().storageMode);
      },
      removeSnapshot: (id) => {
        const next = get().history.filter((h) => h.id !== id);
        set({ history: next });
        saveHistory(next, get().storageMode);
      },
      clearHistory: async () => {
        set({ history: [] });
        await clearHistoryStore(get().storageMode);
      },
      setOptions: (o) =>
        set((s) => {
          const { pinned: _p, touched: _t, ...keys } = o;
          const touched = [...new Set([...(s.options.touched ?? []), ...Object.keys(keys)])];
          return { options: { ...s.options, ...o, touched } };
        }),
      presetOptions: (o) =>
        set((s) => {
          const { pinned: _p, touched: _t, ...keys } = o;
          const touched = (s.options.touched ?? []).filter((k) => !(k in keys));
          return { options: { ...s.options, ...o, touched } };
        }),
      replaceOptions: (options, explicit) =>
        set((s) => ({
          options: {
            ...options,
            pinned: s.options.pinned,
            touched: [
              ...new Set([...(s.options.touched ?? []), ...(explicit ?? changedKeys(s.options, options))]),
            ],
          },
        })),
      setPlaylist: (playlist) => set({ playlist }),
      setBusy: (busy) => set({ busy }),
      setSettings: (x) => set((s) => ({ settings: { ...s.settings, ...x } })),
      setSpotifyToken: (spotifyToken) => set({ spotifyToken }),
      bootOverrides: async () => {
        if (get().overridesReady) return;
        const { overrides, memory, mode, history: serverHistory } = await loadOverrides();
        const local = await loadHistoryLocal();
        // the server row keeps a bounded copy; the browser keeps up to 50: merge by id, newest first
        const merged = [...(serverHistory ?? []).filter(isSnapshot), ...local]
          .filter((h, i, arr) => arr.findIndex((x) => x.id === h.id) === i)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50);
        set({ overrides, memory, history: merged, storageMode: mode, overridesReady: true });
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
      updateMemory: (fn) => {
        const next = fn(get().memory);
        set({ memory: next });
        saveMemory(next, get().storageMode);
      },
      clearMemory: async () => {
        set({ memory: emptyMemory() });
        await clearMemoryStore(get().storageMode);
      },
    }),
    {
      name: "tdj-v1",
      version: 3,
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
          const model =
            typeof old.anthropicModel === "string" ? old.anthropicModel : AI_DEFAULT_MODEL.anthropic;
          p.settings = { ...old, ai: { provider: "anthropic", key, model } };
          delete p.settings.anthropicApiKey;
          delete p.settings.anthropicModel;
        }
        if (version < 3) {
          // every stored option counts as touched once: nothing the DJ saw changes under them
          const po = (p as { options?: Record<string, unknown> }).options;
          if (po && typeof po === "object")
            po.touched = Object.keys(po).filter(
              (k) =>
                k !== "pinned" &&
                k !== "touched" &&
                JSON.stringify(po[k]) !== JSON.stringify((DEFAULT_OPTS as Record<string, unknown>)[k]),
            );
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

/** Keys whose value differs between two option sets (deep-compared by JSON). */
export function changedKeys(a: Partial<ComposeOptions>, b: Partial<ComposeOptions>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (k === "pinned" || k === "touched") continue;
    const va = (a as Record<string, unknown>)[k];
    const vb = (b as Record<string, unknown>)[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) out.push(k);
  }
  return out;
}

/** The keys that count as the DJ's explicit choices tonight: touched or pinned. */
export function explicitKeys(o: AppOptions): string[] {
  return [...new Set([...(o.touched ?? []), ...(o.pinned ?? [])])];
}

/**
 * Engine options for a request: only what the DJ touched or pinned, plus `explicit` naming those keys, so the
 * engine layers defaults → era → database rules → explicit → context (for the rest) itself. Pins and the
 * touched list never leave the browser as such. `seed` and `name` ride along when set (seed replay).
 */
export function optionsForRequest(o: AppOptions): Partial<ComposeOptions> & { explicit: string[] } {
  const { pinned: _p, touched: _t, ...rest } = o;
  const explicit = explicitKeys(o).filter((k) => k in rest);
  const out: Record<string, unknown> = {};
  for (const k of explicit) out[k] = (rest as Record<string, unknown>)[k];
  for (const k of ["seed", "name", "context", "rules", "recent"] as const)
    if (rest[k] !== undefined && !(k in out)) out[k] = rest[k];
  return { ...(out as Partial<ComposeOptions>), explicit };
}

/** Every engine option the controls show (defaults included): for history snapshots and the share link. */
export function fullOptions(o: AppOptions): Partial<ComposeOptions> {
  const { pinned: _p, touched: _t, ...rest } = o;
  return rest;
}

/**
 * Overrides are sent with every compose; undefined when the database is untouched keeps the shared cache hot.
 * Guide text and connector URLs stay in the browser (house rules travel with the AI requests separately).
 */
export function overridesForRequest(o: AppOverrides): AppOverrides | undefined {
  const { updatedAt: _u, guide: _g, connectors: _c, ...rest } = o;
  const any = Object.values(rest).some((v) =>
    Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : false,
  );
  return any ? rest : undefined;
}
