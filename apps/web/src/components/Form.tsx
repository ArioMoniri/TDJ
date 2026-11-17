"use client";
import { Check, ChevronRight, ChevronsUpDown, LoaderCircle, Music } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { fmtNumber, fmtSec, t as tx } from "@/lib/i18n";

/** the seconds unit after a number, for a stepper's spoken label (" s" / " sn") */
export const secUnit = () => ` ${tx("unit.sec", { n: "" }).trim()}`;

import { Sheet } from "./Sheet";
import { useTip } from "./ui/Tip";

/** a row's help tag: its own `tip`, else its one-line `sub` when that is plain text */
const tipOf = (tip: string | undefined, sub: ReactNode) => tip ?? (typeof sub === "string" ? sub : undefined);
/* the tag's props go on whichever element the row renders */
// biome-ignore lint/suspicious/noExplicitAny: one spread for <a>, <button>, <div> and <label>
const on = (p: unknown) => p as any;

import { NudgeValue, Segmented, Stepper, Switch } from "./ui";

/** Inset grouped list: optional uppercase header, the white/ink container, optional footer. */
export function Group({
  header,
  footer,
  children,
  className = "",
  bodyClassName = "",
  titleHeader = false,
  ...rest
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** a title3 head instead of the uppercase group header (sections inside an article, e.g. the Guide) */
  titleHeader?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  return (
    <section className={`min-w-0 ${className}`} {...rest}>
      {header && <h2 className={titleHeader ? "text-title3 mt-8 mb-2 px-4" : "section-head"}>{header}</h2>}
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
  /** the help tag on hover and long-press: what the row does */
  tip?: string;
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
  tip,
  ...aria
}: RowProps) {
  // a row you can tap explains itself; a row that only shows a value needs no tag
  const t = useTip(onClick || href ? tipOf(tip, sub) : tip);
  const body = (
    <>
      {t.tag}
      {tile}
      <span className="min-w-0 flex-1">
        <span className="cell-label">{label}</span>
        {sub && <span className="text-footnote cell-sub text-[var(--label-2)]">{sub}</span>}
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
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cls}
        data-leading={lead}
        id={id}
        {...aria}
        {...on(t.props)}
      >
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
        {...on(t.props)}
      >
        {body}
      </button>
    );
  return (
    <div className={cls} data-leading={lead} id={id} {...aria} {...on(t.props)}>
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
  placeholder = tx("form.choose"),
  trailingDot,
  trailingDotTitle,
  disabled,
  children,
  ariaLabel,
  sub,
  tile,
  tip,
  wrapValue,
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
  tip?: string;
  /** the values are phrases: the current one wraps onto more lines instead of ending in "…" */
  wrapValue?: boolean;
}) {
  const id = useId();
  const t = useTip(tipOf(tip, sub));
  const current = items.find(([k]) => k === value)?.[1];
  return (
    <div
      className={`cell relative w-full ${disabled ? "" : "cell-tap"}`}
      data-leading={tile ? "tile" : undefined}
      {...on(t.props)}
    >
      {t.tag}
      {tile}
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="cell-label">{label}</span>
        {sub && <span className="text-footnote cell-sub text-[var(--label-2)]">{sub}</span>}
      </label>
      {trailingDot && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: trailingDot }}
          role="img"
          aria-label={trailingDotTitle}
        />
      )}
      <span className={wrapValue ? "cell-value cell-value-wrap" : "cell-value"} data-picker-value>
        {current ?? placeholder}
      </span>
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
  tip,
}: {
  label: string;
  sub?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  tile?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
  tip?: string;
}) {
  const t = useTip(tipOf(tip, sub));
  return (
    <div className="cell" data-leading={tile ? "tile" : undefined} {...on(t.props)}>
      {t.tag}
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
  tile,
  children,
  display,
  tip,
  ...stepper
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: ReactNode;
  /** leading tile (Settings rows) */
  tile?: ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  children?: ReactNode;
  /** overrides the trailing text (defaults to value + unit) */
  display?: ReactNode;
  tip?: string;
}) {
  // phones show the bare number; the group footer names the units
  // (" s": seconds, in the locale's unit and decimal mark: "2,5 sn")
  const sec = unit === " s";
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const t = useTip(tipOf(tip, sub));
  return (
    <div className="cell" {...on(t.props)}>
      {t.tag}
      {tile}
      <span className="min-w-0 flex-1">
        <span className="cell-label">{label}</span>
        {sub && <span className="text-footnote cell-sub text-[var(--label-2)]">{sub}</span>}
      </span>
      {children}
      <span className="cell-value tabular-nums">
        {display ?? (
          <NudgeValue
            value={
              isPhone
                ? sec
                  ? fmtNumber(value, { maximumFractionDigits: 1 })
                  : String(value)
                : sec
                  ? fmtSec(value)
                  : `${value}${unit}`
            }
          />
        )}
      </span>
      <Stepper label={label} value={value} unit={sec ? secUnit() : unit} {...stepper} />
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
  tip,
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
  tip?: string;
}) {
  const auto = useId();
  const sid = id ?? auto;
  const t = useTip(tip);
  return (
    <div className="cell flex-col items-stretch gap-1" {...on(t.props)}>
      {t.tag}
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
  tip,
}: {
  label: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  tip?: string;
}) {
  const t = useTip(tip);
  return (
    <button
      type="button"
      {...on(t.props)}
      id={id}
      onClick={onClick}
      disabled={disabled || busy}
      className={`cell cell-tap w-full justify-center ${destructive ? "text-[var(--destructive)]" : "text-[var(--tint)]"} disabled:text-[var(--label-3)]`}
    >
      {t.tag}
      {busy ? <LoaderCircle size={16} className="animate-spin" aria-label={tx("form.working")} /> : label}
    </button>
  );
}

/** Inline segmented inside a cell: label on its own line, the control under it. */
/**
 * A choice row. Round 23 (native form rows): label left, control right, on one row with the whole width used:
 * - 2–4 short choices: a segmented control sized to its content, trailing (NSSegmentedControl / UISegmentedControl);
 *   on a phone, or when the label and the control do not fit side by side, the control takes its own full-width line;
 * - more or longer choices: a pop-up button (`PickerRow`: the value on the right, the system menu / picker).
 * The old row put every control on a second line, left-aligned, with the rest of the row empty.
 */
export function SegmentedRow<K extends string>({
  label,
  children,
  sub,
  tile,
  tip,
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
  tip?: string;
  /** a help tag per choice */
  tips?: Partial<Record<K, string>>;
}) {
  const t = useTip(tipOf(tip, sub));
  const chars = seg.items.reduce((n, [, l]) => n + l.length, 0);
  if (seg.items.length > 4 || chars > 36)
    return (
      <PickerRow
        label={label}
        ariaLabel={label}
        sub={sub}
        tile={tile}
        tip={tip}
        value={seg.value}
        items={seg.items}
        onChange={(k) => k && seg.onChange(k)}
      >
        {children}
      </PickerRow>
    );
  return (
    <div className="cell seg-row" data-leading={tile ? "tile" : undefined} {...on(t.props)}>
      {t.tag}
      {tile}
      <span className="seg-row-label min-w-0 flex-1">
        {/* the label wraps rather than truncating ("Where the night rises and …", wave 2) */}
        <span className="block text-pretty">{label}</span>
        {sub && <span className="text-footnote block text-[var(--label-2)]">{sub}</span>}
      </span>
      {children}
      <Segmented label={label} {...seg} className="seg-row-control" />
    </div>
  );
}

/**
 * A form section that folds (Mac preferences / iPad Settings disclosure): the header is a 44 pt button with the
 * section's current values as a one-line summary, so a DJ can compose without opening it and see what it holds.
 * `bare`: the children bring their own groups (Tanda rules, Tonight).
 */
export function FoldGroup({
  header,
  summary,
  children,
  footer,
  id,
  bare = false,
  defaultOpen = false,
  tip,
}: {
  header: string;
  summary?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  id?: string;
  bare?: boolean;
  defaultOpen?: boolean;
  /** what the section holds, on hover and long-press of its header */
  tip?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = useId();
  const t = useTip(tip);
  return (
    <section className="fold min-w-0" id={id} data-open={open || undefined}>
      <button
        type="button"
        className="fold-head"
        {...on(t.props)}
        aria-expanded={open}
        aria-controls={body}
        onClick={() => {
          haptic(4);
          setOpen((v) => !v);
        }}
      >
        {t.tag}
        <span className="fold-title">{header}</span>
        <span className="fold-summary">{summary}</span>
        <ChevronRight size={16} strokeWidth={2.5} className="fold-chevron" aria-hidden />
      </button>
      <div id={body} hidden={!open}>
        {bare ? children : <div className="group-inset">{children}</div>}
        {footer && <p className="section-foot">{footer}</p>}
      </div>
    </section>
  );
}

/** Checklist row inside a sheet or group (Apple Music add-to-playlist): label + trailing checkmark in tint. */
export function CheckRow({
  label,
  sub,
  checked,
  onChange,
  tile,
  tip,
}: {
  label: ReactNode;
  sub?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  tile?: ReactNode;
  tip?: string;
}) {
  const t = useTip(tipOf(tip, sub));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a checkmark row (Apple Music add-to-playlist), not a checkbox glyph
    <button
      type="button"
      role="checkbox"
      {...on(t.props)}
      aria-checked={checked}
      onClick={() => {
        haptic(4);
        onChange(!checked);
      }}
      className="cell cell-tap w-full text-left"
      data-leading={tile ? "art" : undefined}
    >
      {t.tag}
      {tile}
      <span className="min-w-0 flex-1">
        <span className="cell-label">{label}</span>
        {sub && <span className="text-footnote cell-sub text-[var(--label-2)]">{sub}</span>}
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
  tip,
}: {
  label: string;
  values: K[];
  items: Array<[K, string]>;
  onChange: (v: K[]) => void;
  footer?: ReactNode;
  /** at least this many must stay chosen */
  min?: number;
  children?: ReactNode;
  tip?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = items.filter(([k]) => values.includes(k)).map(([, l]) => l);
  const text =
    chosen.length === 0
      ? tx("form.none")
      : chosen.length <= 2
        ? chosen.join(", ")
        : tx("form.chosen", { length: chosen.length });
  return (
    <>
      <Row label={label} value={text} chevron onClick={() => setOpen(true)} tip={tip}>
        {children}
      </Row>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} trailing={tx("form.done")}>
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
  tip,
}: {
  label: ReactNode;
  id: string;
  children: ReactNode;
  sub?: ReactNode;
  tile?: ReactNode;
  tip?: string;
}) {
  const t = useTip(tipOf(tip, sub));
  return (
    <label htmlFor={id} className="cell" data-leading={tile ? "tile" : undefined} {...on(t.props)}>
      {t.tag}
      {tile}
      <span className="min-w-0 flex-[0_1_45%]">
        <span className="cell-label">{label}</span>
        {sub && <span className="text-footnote cell-sub text-[var(--label-2)]">{sub}</span>}
      </span>
      {children}
    </label>
  );
}
