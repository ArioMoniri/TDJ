"use client";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import type { AppOverrides } from "@/lib/types";

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
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      aria-label={label}
      className="field w-20"
      value={value ?? ""}
      placeholder={placeholder == null ? "" : String(placeholder)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
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
  return (
    <input
      type="text"
      aria-label={label}
      className={`field ${wide ? "w-full min-w-40" : "w-28"} ${mono ? "font-mono text-xs" : ""}`}
      value={value ?? ""}
      placeholder={placeholder ?? ""}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
    />
  );
}

export function Edited({ on, onRevert }: { on: boolean; onRevert: () => void }) {
  if (!on) return <span className="text-muted text-xs">index</span>;
  return (
    <button type="button" className="chip text-xs" onClick={onRevert}>
      edited · revert
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted py-8 text-center text-sm">{children}</p>;
}

export type Patch<T> = Record<string, Partial<T>>;
export type Db = AppOverrides;
