"use client";
import { createContext, type ReactNode, useCallback, useContext, useId, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { AppOverrides } from "@/lib/types";
import { EmptyState } from "../EmptyState";

export function useDb() {
  const overrides = useStore((s) => s.overrides);
  const update = useStore((s) => s.updateOverrides);
  return { overrides, update };
}

/** Edit mode (the "Edit / Done" bar button): rows are plain text until it is on. */
export const DbEditContext = createContext(false);
export const useDbEdit = () => useContext(DbEditContext);

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
 * Optimistic save pulse: the cell runs `.cell-saved` (6 px ring, 500 ms, once) on commit (blur/change).
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

/**
 * Label left; when not editing, the effective value right (edited values in tint, index values secondary);
 * when editing, a right-aligned field with the index value as the placeholder.
 */
export function ValueCell({
  label,
  inputLabel,
  value,
  placeholder,
  editing,
  type = "text",
  min,
  max,
  step,
  mono,
  onChange,
  display,
}: {
  label: string;
  /** accessible name of the field (defaults to label) */
  inputLabel?: string;
  value: string | number | undefined | null;
  placeholder?: string | number | null;
  editing: boolean;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  mono?: boolean;
  onChange: (v: string) => void;
  /** how a non-empty value is shown when not editing (e.g. a percentage) */
  display?: (v: string | number) => string;
}) {
  const p = useSavedPulse();
  const id = useId();
  const edited = value !== undefined && value !== null && value !== "";
  const shown = edited ? (display ? display(value as string | number) : String(value)) : (placeholder ?? "–");
  const Tag = editing ? "label" : "div";
  return (
    <Tag
      className={`cell ${p.className}`}
      onAnimationEnd={p.onAnimationEnd}
      htmlFor={editing ? id : undefined}
    >
      <span className="min-w-0 flex-[0_1_45%] truncate">{label}</span>
      {editing ? (
        <input
          id={id}
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          aria-label={inputLabel ?? label}
          className={`field field-value min-w-0 flex-1 ${mono ? "font-mono" : ""}`}
          value={value ?? ""}
          placeholder={placeholder == null ? "" : String(placeholder)}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            p.touch();
            onChange(e.target.value);
          }}
          onBlur={p.pulse}
          autoComplete="off"
          spellCheck={false}
        />
      ) : (
        <span
          className={`cell-value ${mono ? "font-mono text-footnote" : "tabular-nums"} ${edited ? "text-[var(--tint)]" : ""} truncate`}
          data-edited={edited || undefined}
        >
          {String(shown)}
        </span>
      )}
    </Tag>
  );
}

/** Text-only empty line (loading, nothing matches). The Lottie crate is `EmptyState` for "nothing here yet". */
export function Empty({ children, crate = false }: { children: ReactNode; crate?: boolean }) {
  if (crate) return <EmptyState>{children}</EmptyState>;
  return <p className="text-subhead py-8 text-center text-[var(--label-2)]">{children}</p>;
}

export type Patch<T> = Record<string, Partial<T>>;
export type Db = AppOverrides;
