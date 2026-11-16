"use client";
import { CircleX, Headphones, Search, Square } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { t as tx } from "@/lib/i18n";

/**
 * 2026-11 (the owner's iPad: "the search won't work on the playlist songs"): the pieces the Booth's two search sheets
 * share — Find in tonight's night and Swap. A real `<input type=search>` at 17 px (iOS never zooms) that takes the
 * focus inside the tap that opened the sheet, an iOS segmented control with equal segments, a row with artwork,
 * where it sits and its length, and an inline confirm for what would change the song the room hears.
 */

/** UISegmentedControl: equal segments, the selected one on a raised thumb, 15 px semibold text, 44 px tall */
export function ScopeSwitch<K extends string>({
  value,
  items,
  onChange,
  label,
  testId,
}: {
  value: K;
  items: Array<[K, string]>;
  onChange: (k: K) => void;
  label: string;
  testId?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex(([k]) => k === value);
    const d =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    const next = items[(i + d + items.length) % items.length]![0];
    onChange(next);
    e.currentTarget
      .querySelectorAll<HTMLElement>('[role="radio"]')
      [items.findIndex(([k]) => k === next)]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="booth-scope grid gap-[2px] rounded-[11px] bg-[var(--fill-3)] p-[2px]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      onKeyDown={onKey}
      data-testid={testId}
    >
      {items.map(([k, l]) => {
        const on = k === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: segmented control built from buttons (WAI-ARIA radio group pattern)
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`min-h-11 min-w-0 truncate rounded-[9px] px-2 text-[15px] font-semibold transition-colors ${
              on ? "seg-thumb text-[var(--label)]" : "text-[var(--label-2)]"
            }`}
            onClick={() => onChange(k)}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** the sheet's search field: a magnifier, 17 px text, the clear glyph; it takes the focus as the sheet opens */
export function SearchBar({
  value,
  onChange,
  placeholder,
  testId,
  onEnter,
  busy,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
  onEnter?: () => void;
  busy?: boolean;
  /** take the focus as the sheet opens (default); a phone may keep the keyboard down for a list it reads first */
  autoFocus?: boolean;
}) {
  return (
    <div className="search-field min-h-11 w-full">
      <Search size={16} strokeWidth={2} className={busy ? "animate-pulse" : ""} aria-hidden />
      <input
        type="search"
        className="min-h-11 w-full min-w-0 flex-1 bg-transparent text-[17px] text-[var(--label)] outline-0"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        enterKeyHint="search"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-testid={testId}
        data-autofocus={autoFocus || undefined}
        // biome-ignore lint/a11y/noAutofocus: the sheet opens to type a search (inside the tap, so iOS shows the keyboard)
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="-my-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center"
          aria-label={tx("boothSongSearch.clear")}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
        >
          <CircleX size={18} strokeWidth={2} fill="currentColor" stroke="rgb(var(--bg-cell))" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** a result: [where] [artwork] title / subline, length, then the row's actions (44 px each) */
export function HitRow({
  where,
  art,
  title,
  sub,
  length,
  dim,
  current,
  children,
  testId,
  whereTestId,
  data,
  onArt,
  artLabel,
  artDisabled,
}: {
  where?: ReactNode;
  art: ReactNode;
  /** a tap on the cover: the same action as the row's play / pre-listen button */
  onArt?: () => void;
  artLabel?: string;
  artDisabled?: boolean;
  title: ReactNode;
  sub: ReactNode;
  length?: string;
  dim?: boolean;
  current?: boolean;
  children?: ReactNode;
  testId: string;
  whereTestId?: string;
  data?: Record<string, string | number | undefined>;
}) {
  return (
    <li
      className={`flex min-h-14 items-center gap-2 rounded-[10px] px-2 py-1 max-sm:gap-1 max-sm:px-0 ${current ? "bg-[var(--fill-4)]" : ""}`}
      data-testid={testId}
      {...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
    >
      {/* a phone keeps the title wide: where it sits and its length go to the second line */}
      {where !== undefined && (
        <span
          className="text-caption1 w-14 flex-none font-semibold tabular-nums text-[var(--tint)] max-sm:hidden"
          data-testid={whereTestId ?? `${testId}-where`}
        >
          {where}
        </span>
      )}
      {/* 2026-11: the cover does what the row's play button does (pre-listen, or Play now with its confirmation) */}
      {onArt ? (
        <button
          type="button"
          className="grid min-h-11 min-w-11 flex-none place-items-center disabled:opacity-60"
          aria-label={artLabel}
          disabled={artDisabled}
          onClick={onArt}
          data-testid="hit-art-play"
        >
          {art}
        </button>
      ) : (
        <span className="flex-none">{art}</span>
      )}
      <span className={`min-w-0 flex-1 ${dim ? "opacity-60" : ""}`}>
        <span className="text-subhead block truncate font-semibold">{title}</span>
        <span className="text-footnote block truncate text-[var(--label-2)]">
          {where !== undefined && (
            <span className="font-semibold text-[var(--tint)] sm:hidden">
              {where}
              {" · "}
            </span>
          )}
          {sub}
          {length && <span className="sm:hidden">{` · ${length}`}</span>}
        </span>
      </span>
      {length && (
        <span
          className="text-caption1 flex-none tabular-nums text-[var(--label-2)] max-sm:hidden"
          data-testid={`${testId}-len`}
        >
          {length}
        </span>
      )}
      {children}
    </li>
  );
}

/** the headphones button of a result: pre-listen in the headphones only, never the room */
export function PreviewButton({
  hearing,
  label,
  onPlay,
  onStop,
}: {
  hearing: boolean;
  label: string;
  onPlay: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-btn icon-btn-bare h-11 w-11 flex-none text-[var(--cue)]"
      aria-label={hearing ? tx("boothSwap.stop_preview") : label}
      aria-pressed={hearing}
      onClick={hearing ? onStop : onPlay}
      data-testid="booth-preview"
    >
      {hearing ? (
        <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />
      ) : (
        <Headphones size={16} strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}

/** an inline question inside the sheet, for an action that changes the song the room hears */
export function ConfirmBar({
  text,
  yes,
  onYes,
  onNo,
  testId,
}: {
  text: string;
  yes: string;
  onYes: () => void;
  onNo: () => void;
  testId: string;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={text}
      className="mx-1 my-2 flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--fill-4)] px-3 py-2"
      data-testid={testId}
    >
      <p className="text-subhead min-w-0 flex-[1_1_14rem]">{text}</p>
      <button type="button" className="btn-plain min-h-11 px-3" onClick={onNo} data-testid={`${testId}-no`}>
        {tx("boothSongSearch.cancel")}
      </button>
      <button
        type="button"
        className="btn btn-primary min-h-11 px-4"
        onClick={onYes}
        data-testid={`${testId}-yes`}
        // the answer is one tap away: the keyboard lands on it
        data-autofocus
      >
        {yes}
      </button>
    </div>
  );
}

/** a song or a cortina is playing in the room (a pause, a hold or a stop is not) */
export const roomPlaying = (s: { started: boolean; state: string }) =>
  s.started && (s.state === "playing" || s.state === "cortina");
