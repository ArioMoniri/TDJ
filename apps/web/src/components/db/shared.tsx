"use client";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { t } from "@/lib/motion";
import { useStore } from "@/lib/store";
import type { AppOverrides } from "@/lib/types";
import { EmptyState } from "../EmptyState";

export function useDb() {
  const overrides = useStore((s) => s.overrides);
  const update = useStore((s) => s.updateOverrides);
  return { overrides, update };
}

/** Set or clear one field of a keyed patch map (songs, profiles); empty patches are dropped. */
export function patchMap<T extends object>(
  map: Record<string, Partial<T>> | undefined,
  id: string,
  field: keyof T & string,
  value: unknown,
  original: unknown,
): Record<string, Partial<T>> {
  const next = { ...(map ?? {}) };
  const cur = { ...(next[id] ?? {}) } as Record<string, unknown>;
  const same =
    value === original ||
    value === "" ||
    value === undefined ||
    (typeof original === "number" && Number(value) === original) ||
    (original == null && (value === "" || value === null));
  if (same) delete cur[field];
  else cur[field] = value;
  if (Object.keys(cur).length) next[id] = cur as Partial<T>;
  else delete next[id];
  return next;
}

/**
 * Optimistic save pulse: the cell runs `.cell-saved` (6 px ring in --ok, 500 ms, once) on commit (blur/change).
 * Typing never pulses; a cell pulses at most once per 500 ms. Reduced motion: the CSS zeroes the ring.
 */
export function useSavedPulse() {
  const [on, setOn] = useState(false);
  const last = useRef(0);
  const dirty = useRef(false);
  const pulse = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    const now = Date.now();
    if (now - last.current < 500) return;
    last.current = now;
    setOn(false);
    requestAnimationFrame(() => setOn(true));
  }, []);
  const touch = useCallback(() => {
    dirty.current = true;
  }, []);
  return { className: on ? "cell-saved" : "", onAnimationEnd: () => setOn(false), pulse, touch };
}

export function Num({
  id,
  value,
  placeholder,
  onChange,
  min,
  max,
  step,
  label,
}: {
  id?: string;
  value: number | undefined | null;
  placeholder?: number | string | null;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const p = useSavedPulse();
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      aria-label={label}
      className={`field w-20 ${p.className}`}
      value={value ?? ""}
      placeholder={placeholder == null ? "" : String(placeholder)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        p.touch();
        onChange(e.target.value === "" ? undefined : Number(e.target.value));
      }}
      onBlur={p.pulse}
      onAnimationEnd={p.onAnimationEnd}
    />
  );
}

export function Text({
  value,
  placeholder,
  onChange,
  label,
  mono,
  wide,
}: {
  value: string | undefined | null;
  placeholder?: string | null;
  onChange: (v: string) => void;
  label: string;
  mono?: boolean;
  wide?: boolean;
}) {
  const p = useSavedPulse();
  return (
    <input
      type="text"
      aria-label={label}
      className={`field ${wide ? "w-full min-w-40" : "w-28"} ${mono ? "font-mono text-xs" : ""} ${p.className}`}
      value={value ?? ""}
      placeholder={placeholder ?? ""}
      onChange={(e) => {
        p.touch();
        onChange(e.target.value);
      }}
      onBlur={p.pulse}
      onAnimationEnd={p.onAnimationEnd}
      autoComplete="off"
      spellCheck={false}
    />
  );
}

/** "index" ↔ "edited · revert" cross-fade (125 ms). */
export function Edited({ on, onRevert }: { on: boolean; onRevert: () => void }) {
  return (
    <span className="relative inline-grid">
      <AnimatePresence mode="popLayout" initial={false}>
        {on ? (
          <motion.button
            key="edited"
            type="button"
            className="chip col-start-1 row-start-1 text-xs"
            onClick={onRevert}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.press}
          >
            edited · revert
          </motion.button>
        ) : (
          <motion.span
            key="index"
            className="text-muted col-start-1 row-start-1 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.press}
          >
            index
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Text-only empty line (loading, nothing matches). The Lottie crate is `EmptyState` for "nothing here yet". */
export function Empty({ children, crate = false }: { children: ReactNode; crate?: boolean }) {
  if (crate) return <EmptyState>{children}</EmptyState>;
  return <p className="text-muted py-8 text-center text-sm">{children}</p>;
}

export type Patch<T> = Record<string, Partial<T>>;
export type Db = AppOverrides;
