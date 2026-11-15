"use client";
import { create } from "zustand";
import type { ToastItem } from "@/components/Toast";

interface ToastState {
  toast: ToastItem | null;
  show: (text: string, undo?: () => void, actionLabel?: string, secondary?: ToastItem["secondary"]) => void;
  dismiss: () => void;
}
let seq = 0;

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
      },
    }),
  dismiss: () => set({ toast: null }),
}));
/** `secondary`: a second action next to Undo (the rule check's "See suggestion") */
export const toast = (
  text: string,
  undo?: () => void,
  actionLabel?: string,
  secondary?: ToastItem["secondary"],
) => useGlobalToast.getState().show(text, undo, actionLabel, secondary);
