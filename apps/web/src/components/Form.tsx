"use client";
import { Check, ChevronRight, ChevronsUpDown, LoaderCircle, Music } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { Sheet } from "./Sheet";
import { NudgeValue, Segmented, Stepper, Switch } from "./ui";

/** Inset grouped list: optional uppercase header, the white/ink container, optional footer. */
export function Group({
  header,
  footer,
  children,
  className = "",
  bodyClassName = "",
  ...rest
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  return (
    <section className={`min-w-0 ${className}`} {...rest}>
      {header && <h2 className="section-head">{header}</h2>}
      <div className={`group-inset ${bodyClassName}`}>{children}</div>
      {footer && <p className="section-foot">{footer}</p>}
    </section>
  );
}

/** Artwork tile glyph per rhythm: T / V / M, a note for the rest. */
export function RhythmTile({ rhythm, label }: { rhythm: string; label?: string }) {
  const g = rhythm === "tango" ? "T" : rhythm === "vals" ? "V" : rhythm === "milonga" ? "M" : null;
  return (
    <span className="tile-art" data-rhythm={rhythm} aria-label={label ?? rhythm} role="img">
      {g ? <span className="text-footnote font-semibold">{g}</span> : <Music size={16} strokeWidth={2} />}
    </span>
  );
}

/** Settings icon tile: 29 pt, 7 radius, white 16 pt glyph. */
export function Tile({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="tile" style={{ background: color }} aria-hidden>
      {children}
    </span>
  );
}

export interface RowProps {
  tile?: ReactNode;
  leading?: "art" | "num";
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  /** a row that is a link out of the app */
  href?: string;
  id?: string;
  "aria-label"?: string;
  "data-resolved"?: string;
  "data-testid"?: string;
}

/** Label left, value right, optional tile, optional chevron. A button when it has `onClick`, a link with `href`. */
export function Row({
  tile,
  leading,
  label,
  sub,
  value,
  chevron,
  onClick,
  children,
  busy,
  disabled,
  className = "",
  href,
  id,
  ...aria
}: RowProps) {
  const body = (
    <>
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      {value !== undefined && <span className="cell-value text-body">{value}</span>}
      {children}
      {busy ? (
        <LoaderCircle size={16} className="cell-chevron animate-spin" aria-hidden />
      ) : (
        chevron && <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
      )}
    </>
  );
  const cls = `cell w-full text-left ${onClick || href ? "cell-tap" : ""} ${className}`;
  const lead = tile ? "tile" : leading;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} data-leading={lead} id={id} {...aria}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        className={cls}
        data-leading={lead}
        id={id}
        {...aria}
      >
        {body}
      </button>
    );
  return (
    <div className={cls} data-leading={lead} id={id} {...aria}>
      {body}
    </div>
  );
}

/** Native select dressed as a picker row: iOS shows the system picker, desktop the menu. */
export function PickerRow<K extends string>({
  label,
  value,
  items,
  onChange,
  placeholder = "Choose",
  trailingDot,
  trailingDotTitle,
  disabled,
  children,
  ariaLabel,
  sub,
  tile,
}: {
  label: ReactNode;
  value: K | undefined;
  items: Array<[K, string]>;
  onChange: (k: K | undefined) => void;
  placeholder?: string;
  trailingDot?: string;
  trailingDotTitle?: string;
  disabled?: boolean;
  /** extra trailing controls (e.g. a pin) rendered above the invisible select */
  children?: ReactNode;
  ariaLabel?: string;
  sub?: ReactNode;
  /** leading Settings tile */
  tile?: ReactNode;
}) {
  const id = useId();
  const current = items.find(([k]) => k === value)?.[1];
  return (
    <div
      className={`cell relative w-full ${disabled ? "" : "cell-tap"}`}
      data-leading={tile ? "tile" : undefined}
    >
      {tile}
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </label>
      {trailingDot && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: trailingDot }}
          title={trailingDotTitle}
          aria-hidden
        />
      )}
      <span className="cell-value">{current ?? placeholder}</span>
      {!disabled && <ChevronsUpDown size={14} strokeWidth={2} className="cell-chevron" aria-hidden />}
      <select
        id={id}
        aria-label={ariaLabel}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          haptic(4);
          onChange((e.target.value || undefined) as K | undefined);
        }}
        className="absolute inset-0 h-full w-full cursor-default opacity-0"
      >
        <option value="">{placeholder}</option>
        {items.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      {children && <span className="relative z-[1] flex items-center">{children}</span>}
    </div>
  );
}

export function SwitchRow({
  label,
  sub,
  checked,
  onChange,
  tile,
  disabled,
  children,
}: {
  label: string;
  sub?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  tile?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="cell" data-leading={tile ? "tile" : undefined}>
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {sub && <span className="text-footnote block text-[var(--label-2)]">{sub}</span>}
      </span>
      {children}
      <Switch checked={checked} onChange={onChange} label={label} bare disabled={disabled} />
    </div>
  );
}

export function StepperRow({
  label,
  value,
  unit = "",
  sub,
  children,
  display,
  ...stepper
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  children?: ReactNode;
  /** overrides the trailing text (defaults to value + unit) */
  display?: ReactNode;
}) {
  // phones show the bare number; the group footer names the units
  const isPhone = useMediaQuery("(max-width: 639px)");
  return (
    <div className="cell">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      {children}
      <span className="cell-value tabular-nums">
        {display ?? <NudgeValue value={isPhone ? String(value) : `${value}${unit}`} />}
      </span>
      <Stepper label={label} value={value} unit={unit} {...stepper} />
    </div>
  );
}

/** Label + trailing value on line 1, slider on line 2 (Settings → Display & Brightness). */
export function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  id,
  children,
}: {
  label: string;
  value: number;
  display: ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  id?: string;
  children?: ReactNode;
}) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="cell flex-col items-stretch gap-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={sid}>{label}</label>
        <span className="flex items-center gap-1">
          {children}
          <span className="cell-value tabular-nums">{display}</span>
        </span>
      </div>
      <input
        id={sid}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${((value - min) / (max - min)) * 100}%` }}
        aria-label={label}
      />
    </div>
  );
}

/** Centred tinted action, "Sign Out" style; destructive in red. */
export function ActionRow({
  label,
  onClick,
  destructive,
  disabled,
  busy,
  id,
}: {
  label: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled || busy}
      className={`cell cell-tap w-full justify-center ${destructive ? "text-[var(--destructive)]" : "text-[var(--tint)]"} disabled:text-[var(--label-3)]`}
    >
      {busy ? <LoaderCircle size={16} className="animate-spin" aria-label="Working" /> : label}
    </button>
  );
}

/** Inline segmented inside a cell: label on its own line, the control under it. */
export function SegmentedRow<K extends string>({
  label,
  children,
  sub,
  tile,
  ...seg
}: {
  label: string;
  value: K;
  items: Array<[K, string]>;
  onChange: (k: K) => void;
  children?: ReactNode;
  sub?: ReactNode;
  /** leading Settings tile */
  tile?: ReactNode;
}) {
  return (
    <div className="cell flex-col items-stretch gap-1.5" data-leading={tile ? "tile" : undefined}>
      <div className="flex items-center gap-3">
        {tile}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
        </span>
        {children}
      </div>
      <Segmented label={label} {...seg} />
    </div>
  );
}

/** Checklist row inside a sheet or group (Apple Music add-to-playlist): label + trailing checkmark in tint. */
export function CheckRow({
  label,
  sub,
  checked,
  onChange,
  tile,
}: {
  label: ReactNode;
  sub?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  tile?: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a checkmark row (Apple Music add-to-playlist), not a checkbox glyph
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => {
        haptic(4);
        onChange(!checked);
      }}
      className="cell cell-tap w-full text-left"
      data-leading={tile ? "art" : undefined}
    >
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      <span className="grid h-5 w-5 place-items-center">
        {checked && <Check size={18} strokeWidth={2.5} className="text-[var(--tint)]" aria-hidden />}
      </span>
    </button>
  );
}

/** Multi-select: a row whose value lists the chosen items; opens a sheet with checkmark rows. */
export function MultiPickerRow<K extends string>({
  label,
  values,
  items,
  onChange,
  footer,
  min = 0,
  children,
}: {
  label: string;
  values: K[];
  items: Array<[K, string]>;
  onChange: (v: K[]) => void;
  footer?: ReactNode;
  /** at least this many must stay chosen */
  min?: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chosen = items.filter(([k]) => values.includes(k)).map(([, l]) => l);
  const text =
    chosen.length === 0 ? "None" : chosen.length <= 2 ? chosen.join(", ") : `${chosen.length} chosen`;
  return (
    <>
      <Row label={label} value={text} chevron onClick={() => setOpen(true)}>
        {children}
      </Row>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} trailing="Done">
        <Group footer={footer}>
          {items.map(([k, l]) => {
            const on = values.includes(k);
            return (
              <CheckRow
                key={k}
                label={l}
                checked={on}
                onChange={(v) => {
                  if (!v && values.length <= min) return;
                  onChange(v ? [...values, k] : values.filter((x) => x !== k));
                }}
              />
            );
          })}
        </Group>
      </Sheet>
    </>
  );
}

/** A cell that holds a right-aligned text field (Settings "Client ID" style). */
export function FieldRow({
  label,
  id,
  children,
  sub,
  tile,
}: {
  label: ReactNode;
  id: string;
  children: ReactNode;
  sub?: ReactNode;
  tile?: ReactNode;
}) {
  return (
    <label htmlFor={id} className="cell" data-leading={tile ? "tile" : undefined}>
      {tile}
      <span className="min-w-0 flex-[0_1_45%]">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      {children}
    </label>
  );
}
