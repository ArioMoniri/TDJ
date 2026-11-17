"use client";
import type { PointerEvent as ReactPointerEvent } from "react";
import { create } from "zustand";
import {
  type DockSaved,
  defaultSaved,
  dockKey,
  type FormFactor,
  type Place,
  parseSaved,
  serializeSaved,
} from "./geometry";

/**
 * The one player's place, shared by its shell (components/player/PlayerDock.tsx) and what it holds (the Booth's
 * night, BoothMini; a preview, MiniPlayerCard): where it is now, whether it is being dragged, the gramophone's quick
 * controls, and what this device keeps (localStorage, one entry per form: phone, iPad portrait, sidebar windows).
 */
interface DockState {
  form: FormFactor;
  loaded: boolean;
  saved: DockSaved;
  /** null while nothing plays */
  place: Place | null;
  dragging: boolean;
  quick: boolean;
  /** the shell's drag start, for a grip inside the bar (the bar itself is laid out by what it holds) */
  grip: ((e: ReactPointerEvent<HTMLElement>) => void) | null;
  setForm: (f: FormFactor) => void;
  save: (s: DockSaved) => void;
}

const read = (f: FormFactor): DockSaved => {
  try {
    return parseSaved(localStorage.getItem(dockKey(f)), f);
  } catch {
    return defaultSaved(f);
  }
};

export const useDock = create<DockState>()((set, get) => ({
  form: "desktop",
  loaded: false,
  saved: defaultSaved("desktop"),
  place: null,
  dragging: false,
  quick: false,
  grip: null,
  setForm: (form) => {
    if (form === get().form && get().loaded) return;
    set({ form, loaded: true, saved: read(form) });
  },
  save: (saved) => {
    set({ saved });
    try {
      localStorage.setItem(dockKey(get().form), serializeSaved(saved));
    } catch {}
  },
}));
