"use client";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { toastIn } from "@/lib/motion";
import { useSheetOpen, useSheets } from "@/lib/sheets";
import { toastStale } from "@/lib/toast";

export interface ToastItem {
  id: number;
  text: string;
  undo?: () => void;
  /** the action button's label (default "Undo") */
  actionLabel?: string;
  /** ms before auto-dismiss: 6 s with Undo, 3 s informational */
  ttl?: number;
  /** a second action before the first (the rule check's "See suggestion") */
  secondary?: { label: string; run: () => void };
  /** how many sheets were open when it appeared: a sheet opened over it since makes it stale (lib/toast.ts) */
  sheets?: number;
}

/** One toast at a time; the newest replaces the older with a cross-fade. Hover/focus pauses dismissal. */
export function useToast() {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const show = useCallback((text: string, undo?: () => void) => {
    seq.current += 1;
    setToast({ id: seq.current, text, undo, ttl: undo ? 6000 : 3000, sheets: useSheets.getState().open });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, show, dismiss };
}

/**
 * The topmost open sheet's status slot (Sheet.tsx), or null with no sheet open. Read after the sheet has mounted
 * (one frame later), and again whenever the sheet count changes or a new toast arrives.
 */
function useSheetSlot(toastId: number | undefined): HTMLElement | null {
  const open = useSheetOpen();
  // the sheet mounts its slot in the commit that opens it; a toast arrives later, so a lookup when the toast renders
  // finds it (the topmost slot is the last one in the document: sheets portal to the end of <body>)
  const [, rerun] = useState(0);
  useEffect(() => {
    // a sheet opened or closed under a toast that is already up: look again next frame
    if (!open || toastId === undefined) return;
    const raf = requestAnimationFrame(() => rerun((n) => n + 1));
    return () => cancelAnimationFrame(raf);
  }, [open, toastId]);
  if (!open || toastId === undefined || typeof document === "undefined") return null;
  const all = document.querySelectorAll<HTMLElement>("[data-sheet-status]");
  return all[all.length - 1] ?? null;
}

export function Toast({ toast: item, onDismiss }: { toast: ToastItem | null; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  // QA 2026-11: a toast never shows over a sheet opened after it (its Undo / Redo live under a modal) — it goes
  const openNow = useSheets((s) => s.open);
  const stale = toastStale(item, openNow);
  const toast = stale ? null : item;
  useEffect(() => {
    if (stale) onDismiss();
  }, [stale, onDismiss]);
  const slot = useSheetSlot(toast?.id);
  // 2026-11 (the owner: "these notifications should also have a close icon on hover"): Esc dismisses the toast when no
  // sheet is up (a sheet's Esc is its own)
  useEffect(() => {
    if (!toast) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      onDismiss();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toast, onDismiss]);
  useEffect(() => {
    if (!toast || paused) return;
    const id = setTimeout(onDismiss, toast.ttl ?? 3000);
    return () => clearTimeout(id);
  }, [toast, paused, onDismiss]);
  const action = (toast?.undo || toast?.secondary) && (
    <>
      {toast.secondary && (
        <button
          type="button"
          className="btn-plain min-h-11 shrink-0"
          data-testid="toast-secondary"
          onClick={() => {
            toast.secondary?.run();
            onDismiss();
          }}
        >
          {toast.secondary.label}
        </button>
      )}
      {toast.undo && (
        <button
          type="button"
          className="btn-plain shrink-0 font-semibold"
          onClick={() => {
            toast.undo?.();
            onDismiss();
          }}
        >
          {toast.actionLabel ?? t("toast.undo")}
        </button>
      )}
    </>
  );
  const close = (
    <button
      type="button"
      className="toast-close"
      aria-label={t("toast.dismiss")}
      onClick={onDismiss}
      data-testid="toast-close"
    >
      <X size={16} strokeWidth={2.25} aria-hidden />
    </button>
  );
  // wave 4: while a sheet is open the toast is an inline status row under the sheet's title (it floated over the
  // grabber and the title, cut to one line); the text wraps there instead of truncating
  if (slot)
    return createPortal(
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <div className="sheet-status" data-testid="toast" data-inline="sheet">
              <span className="min-w-0 flex-1">{toast.text}</span>
              {action}
              {close}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      slot,
    );
  return (
    <AnimatePresence mode="wait">
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          aria-live="polite"
          variants={toastIn}
          initial="hidden"
          animate="show"
          exit="exit"
          onHoverStart={() => setPaused(true)}
          onHoverEnd={() => setPaused(false)}
          // a swipe up or down dismisses it (touch)
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.6}
          dragSnapToOrigin
          onDragEnd={(_e, info) => {
            if (Math.abs(info.offset.y) > 28 || Math.abs(info.velocity.y) > 400) onDismiss();
          }}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          // top centre, under the top chrome (wave 2): at the bottom it squeezed between the tab bar and the floating
          // Compose / Export bar on iPhone, and covered the Rooms row buttons and the Compose dock on iPad
          className="app-toast glass glass-pill text-subhead fixed inset-x-4 top-[calc(var(--chrome-top)+0.75rem)] z-50 mx-auto flex min-h-11 max-w-md items-center gap-3 py-1 pl-4 pr-1 sm:top-[calc(var(--chrome-top)+5.25rem)] sm:w-max sm:min-w-[16rem]"
          data-testid="toast"
        >
          <span className="min-w-0 flex-1 truncate">{toast.text}</span>
          {action}
          {close}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
