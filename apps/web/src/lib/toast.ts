"use client";
import { create } from "zustand";
import type { ToastItem } from "@/components/Toast";
import { useSheets } from "@/lib/sheets";

interface ToastState {
  toast: ToastItem | null;
  show: (text: string, undo?: () => void, actionLabel?: string, secondary?: ToastItem["secondary"]) => void;
  dismiss: () => void;
}
let seq = 0;

/**
 * QA 2026-11 ("Undid: crossfade · Redo" sat inside the Stop the music? sheet, "Lo Pasado plays next · Undo" inside
 * Change the end): a toast never shows over a sheet it did not come from. A toast remembers how many sheets were open
 * when it appeared (`sheets`); once more are open than that, it is stale — a sheet opened over it — and goes. A toast
 * raised from inside a sheet (as many sheets are open as when it appeared) stays that sheet's inline status row; when
 * the sheet closes it floats on as before, and the next sheet to open dismisses it.
 */
export function toastStale(item: Pick<ToastItem, "sheets"> | null, openNow: number): boolean {
  return !!item && openNow > (item.sheets ?? 0);
}

/** App-wide toast (mounted once in the layout) for actions that happen inside cards and sheets. */
export const useGlobalToast = create<ToastState>()((set) => ({
  toast: null,
  show: (text, undo, actionLabel, secondary) =>
    set({
      toast: {
        id: ++seq,
        text,
        undo,
        actionLabel,
        secondary,
        ttl: undo ? (actionLabel || secondary ? 10000 : 6000) : 3500,
        sheets: useSheets.getState().open,
      },
    }),
  dismiss: () => set({ toast: null }),
}));

// a sheet opening over the toast dismisses it; one closing under it lets it float on (and a later sheet dismisses it)
useSheets.subscribe((s, prev) => {
  const cur = useGlobalToast.getState().toast;
  if (!cur || s.open === prev.open) return;
  if (toastStale(cur, s.open)) useGlobalToast.setState({ toast: null });
  else if (s.open < (cur.sheets ?? 0)) useGlobalToast.setState({ toast: { ...cur, sheets: s.open } });
});

/** `secondary`: a second action next to Undo (the rule check's "See suggestion") */
export const toast = (
  text: string,
  undo?: () => void,
  actionLabel?: string,
  secondary?: ToastItem["secondary"],
) => useGlobalToast.getState().show(text, undo, actionLabel, secondary);
