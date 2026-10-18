"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComposeOptions, Playlist } from "./types";
import { DEFAULT_SETTINGS, type UserSettings } from "./types";

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
  setOptions: (o: Partial<ComposeOptions>) => void;
  setPlaylist: (p: Playlist | null) => void;
  setBusy: (b: boolean) => void;
  setSettings: (s: Partial<UserSettings>) => void;
  setSpotifyToken: (t: State["spotifyToken"]) => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      options: DEFAULT_OPTS,
      playlist: null,
      busy: false,
      settings: DEFAULT_SETTINGS,
      spotifyToken: null,
      setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),
      setPlaylist: (playlist) => set({ playlist }),
      setBusy: (busy) => set({ busy }),
      setSettings: (x) => set((s) => ({ settings: { ...s.settings, ...x } })),
      setSpotifyToken: (spotifyToken) => set({ spotifyToken }),
    }),
    {
      name: "tdj-v1",
      partialize: (s) => ({
        options: s.options,
        settings: s.settings,
        spotifyToken: s.spotifyToken,
        playlist: s.playlist,
      }),
    },
  ),
);
