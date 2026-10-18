"use client";
import { Minus, Plus } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

/** Labelled control group. */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  const head = (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-muted text-xs">{hint}</span>}
    </div>
  );
  if (htmlFor)
    return (
      <div>
        <label htmlFor={htmlFor} className="block">
          {head}
        </label>
        <div className="mt-2">{children}</div>
      </div>
    );
  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset/legend break the label-left, hint-right layout
    <div role="group" aria-label={label}>
      {head}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Single-select control for 2–5 mutually exclusive choices. `chips` renders the same semantics as a wrapping chip row. */
export function Segmented<K extends string>({
  value,
  items,
  onChange,
  chips = false,
  label,
}: {
  value: K;
  items: Array<[K, string]>;
  onChange: (k: K) => void;
  chips?: boolean;
  label?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex(([k]) => k === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % items.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next]![0]);
    (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={chips ? "chip-row scroll-x" : "segmented scroll-x"}
      onKeyDown={onKey}
    >
      {items.map(([k, l]) => {
        const on = value === k;
        return (
          // biome-ignore lint/a11y/useSemanticElements: segmented control built from buttons (WAI-ARIA radio group pattern)
          <button
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            key={k}
            onClick={() => onChange(k)}
            className={chips ? `chip ${on ? "chip-on" : ""}` : `seg ${on ? "seg-on" : ""}`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="text-muted block text-xs">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`switch ${checked ? "switch-on" : ""}`}
      >
        <span className="switch-track">
          <span className="switch-knob" />
        </span>
      </button>
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  step,
  unit,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label: string;
  onChange: (v: number) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: stepper is an inline control group, not a form section
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus size={16} />
      </button>
      <output className="min-w-14 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}
        {unit}
      </output>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
