"use client";
import { create } from "zustand";
import type { ToastItem } from "@/components/Toast";

interface ToastState {
  toast: ToastItem | null;
  show: (text: string, undo?: () => void) => void;
  dismiss: () => void;
}
let seq = 0;

/** App-wide toast (mounted once in the layout) for actions that happen inside cards and sheets. */
export const useGlobalToast = create<ToastState>()((set) => ({
  toast: null,
  show: (text, undo) => set({ toast: { id: ++seq, text, undo, ttl: undo ? 6000 : 3500 } }),
  dismiss: () => set({ toast: null }),
}));
export const toast = (text: string, undo?: () => void) => useGlobalToast.getState().show(text, undo);
