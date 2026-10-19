"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toastIn } from "@/lib/motion";

export interface ToastItem {
  id: number;
  text: string;
  undo?: () => void;
  /** the action button's label (default "Undo") */
  actionLabel?: string;
  /** ms before auto-dismiss: 6 s with Undo, 3 s informational */
  ttl?: number;
}

/** One toast at a time; the newest replaces the older with a cross-fade. Hover/focus pauses dismissal. */
export function useToast() {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const show = useCallback((text: string, undo?: () => void) => {
    seq.current += 1;
    setToast({ id: seq.current, text, undo, ttl: undo ? 6000 : 3000 });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, show, dismiss };
}

export function Toast({ toast, onDismiss }: { toast: ToastItem | null; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!toast || paused) return;
    const id = setTimeout(onDismiss, toast.ttl ?? 3000);
    return () => clearTimeout(id);
  }, [toast, paused, onDismiss]);
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
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="glass glass-pill text-subhead fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+140px)] z-50 mx-auto flex max-w-md items-center gap-3 py-1 pl-4 pr-1 sm:inset-x-auto sm:right-6 sm:bottom-6"
          data-testid="toast"
        >
          <span className="min-w-0 flex-1 truncate">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="btn-plain font-semibold"
              onClick={() => {
                toast.undo?.();
                onDismiss();
              }}
            >
              {toast.actionLabel ?? "Undo"}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
