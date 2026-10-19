"use client";
import { create } from "zustand";
import type { ToastItem } from "@/components/Toast";

interface ToastState {
  toast: ToastItem | null;
  show: (text: string, undo?: () => void, actionLabel?: string) => void;
  dismiss: () => void;
}
let seq = 0;

/** App-wide toast (mounted once in the layout) for actions that happen inside cards and sheets. */
export const useGlobalToast = create<ToastState>()((set) => ({
  toast: null,
  show: (text, undo, actionLabel) =>
    set({ toast: { id: ++seq, text, undo, actionLabel, ttl: undo ? (actionLabel ? 10000 : 6000) : 3500 } }),
  dismiss: () => set({ toast: null }),
}));
export const toast = (text: string, undo?: () => void, actionLabel?: string) =>
  useGlobalToast.getState().show(text, undo, actionLabel);
