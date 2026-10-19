"use client";
import { create } from "zustand";

interface SheetsState {
  /** how many sheets are open right now (menus on phones count: they are sheets) */
  open: number;
  _inc: () => void;
  _dec: () => void;
}

/**
 * One counter for every open `Sheet`, so the control layer can get out of the way: the phone primary bar hides
 * while any sheet is up (round5-design.md §1) instead of peeking out from under the dimmed backdrop.
 */
export const useSheets = create<SheetsState>()((set) => ({
  open: 0,
  _inc: () => set((s) => ({ open: s.open + 1 })),
  _dec: () => set((s) => ({ open: Math.max(0, s.open - 1) })),
}));

export const useSheetOpen = () => useSheets((s) => s.open > 0);
