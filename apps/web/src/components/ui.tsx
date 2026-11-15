"use client";
import { Minus, Plus } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useId, useRef } from "react";
import { haptic } from "@/lib/haptics";
import { spring, t } from "@/lib/motion";
import { useTip } from "./ui/Tip";

/** one choice of a segmented control; its help tag goes straight on the button (no wrapper: arrows move by index) */
function SegItem({
  on,
  label,
  tip,
  layoutId,
  onPick,
}: {
  on: boolean;
  label: string;
  tip?: string;
  layoutId: string;
  onPick: () => void;
}) {
  const t = useTip<HTMLButtonElement>(tip);
  return (
    // biome-ignore lint/a11y/useSemanticElements: segmented control built from buttons (WAI-ARIA radio group pattern)
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      {...t.props}
      onClick={() => {
        if (!on) haptic(4);
        onPick();
      }}
      className={`seg relative isolate ${on ? "seg-on" : ""}`}
    >
      {on && (
        <motion.span
          layoutId={layoutId}
          transition={spring.thumb}
          className="seg-thumb absolute inset-0 -z-10 rounded-[7px]"
          aria-hidden
        />
      )}
      {label}
      {t.tag}
    </button>
  );
}

/** Single-select control for 2–5 mutually exclusive choices (UISegmentedControl). `tips`: a help tag per choice. */
export function Segmented<K extends string>({
  value,
  items,
  onChange,
  label,
  className = "",
  tips,
  size = "regular",
}: {
  value: K;
  items: Array<[K, string]>;
  onChange: (k: K) => void;
  label?: string;
  className?: string;
  tips?: Partial<Record<K, string>>;
  /** `large`: 44 px segments with a mouse too (a page's main switch, e.g. Night / Log in a room) */
  size?: "regular" | "large";
}) {
  const id = useId();
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
    (
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next] as HTMLElement | undefined
    )?.focus();
  };
  return (
    <LayoutGroup id={id}>
      <div
        role="radiogroup"
        aria-label={label}
        className={`segmented scroll-x ${size === "large" ? "segmented-l" : ""} ${className}`}
        onKeyDown={onKey}
      >
        {items.map(([k, l]) => (
          <SegItem
            key={k}
            on={value === k}
            label={l}
            tip={tips?.[k]}
            layoutId={`seg-${id}`}
            onPick={() => onChange(k)}
          />
        ))}
      </div>
    </LayoutGroup>
  );
}

/** UISwitch. `bare` renders only the control (for use inside `SwitchRow`). */
export function Switch({
  checked,
  onChange,
  label,
  bare = false,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  bare?: boolean;
  disabled?: boolean;
}) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic(6);
        onChange(!checked);
      }}
      className={`switch ${checked ? "switch-on" : ""} ${disabled ? "opacity-50" : ""}`}
    >
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
    </button>
  );
  if (bare) return control;
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span>{label}</span>
      {control}
    </div>
  );
}

/** UIStepper: joined 94×32 control. The value is shown by the row that hosts it; a visually hidden live span announces it. */
export function Stepper({
  value,
  min,
  max,
  step,
  unit,
  label,
  onChange,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const change = (v: number) => {
    haptic(4);
    onChange(v);
  };
  // each button says where it takes the value
  const down = Math.max(min, +(value - step).toFixed(2));
  const up = Math.min(max, +(value + step).toFixed(2));
  const less = useTip<HTMLButtonElement>(
    value <= min ? "Already the lowest" : `Down to ${down}${unit ?? ""}`,
  );
  const more = useTip<HTMLButtonElement>(value >= max ? "Already the highest" : `Up to ${up}${unit ?? ""}`);
  return (
    // biome-ignore lint/a11y/useSemanticElements: stepper is an inline control group, not a form section
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        {...less.props}
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => change(down)}
      >
        {less.tag}
        <Minus size={16} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        {...more.props}
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => change(up)}
      >
        {more.tag}
        <Plus size={16} strokeWidth={2.25} />
      </button>
      <span className="sr-only" aria-live="polite">
        {value}
        {unit}
      </span>
    </div>
  );
}

/** A number that cross-fades 125 ms and nudges 3 px in the direction of change (stepper values, counts). */
export function NudgeValue({ value, className = "" }: { value: string | number; className?: string }) {
  const reduced = useReducedMotion();
  const prev = useRef<string | number>(value);
  const dir = useRef(1);
  if (prev.current !== value) {
    dir.current = Number(value) > Number(prev.current) ? 1 : -1;
    prev.current = value;
  }
  const nudge = reduced ? 0 : 3;
  return (
    <span className={`relative inline-grid overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, y: dir.current * nudge }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -dir.current * nudge }}
          transition={t.press}
          className="col-start-1 row-start-1 block whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
