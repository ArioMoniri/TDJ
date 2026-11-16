"use client";
import { create } from "zustand";
import type { Song } from "./types";

/**
 * 2026-11 — the app-wide sheets of the song details work (mounted once, components/song/SongHosts.tsx): a side's
 * details from any row (Compose, Library, Database, search, the DNA pages), a list of an orchestra's sides with one
 * singer (Database → Orchestras), and the Song DNA pages as an overlay where leaving the page would end something
 * (the Booth: its page leaving stops the night).
 */
export type DnaTarget = { kind: "song" | "orchestra" | "singer"; id: string };
export interface SidesQuery {
  orchestraId: string;
  orchestra: string;
  /** a singer's name (or id); null with `instrumental` for the instrumentals, null alone for every side */
  singer: string | null;
  instrumental?: boolean;
}

interface OpenState {
  song: Song | null;
  sides: SidesQuery | null;
  dna: DnaTarget | null;
  openSong: (s: Song) => void;
  openSides: (q: SidesQuery) => void;
  openDna: (t: DnaTarget) => void;
  close: (what: "song" | "sides" | "dna") => void;
}

export const useSongOpen = create<OpenState>()((set) => ({
  song: null,
  sides: null,
  dna: null,
  openSong: (song) => set({ song }),
  openSides: (sides) => set({ sides }),
  openDna: (dna) => set({ dna, song: null, sides: null }),
  close: (what) => set({ [what]: null } as Partial<OpenState>),
}));

export const openSongDetails = (s: Song) => useSongOpen.getState().openSong(s);

/** the page of a DNA target (a query string: the apps ship a static export, which has no dynamic segments) */
export const dnaHref = (t: DnaTarget) => `/${t.kind}?id=${encodeURIComponent(t.id)}`;

/** inside the Booth a DNA link opens the overlay (leaving the Booth's page would end the night) */
export const inBooth = () =>
  typeof document !== "undefined" && document.documentElement.dataset.booth === "1";
