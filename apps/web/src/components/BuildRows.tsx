"use client";
import { Info, Plus } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { fmtLen } from "@/lib/lengths";
import { orchestraName } from "@/lib/orchestraName";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import type { Version } from "@/lib/smartSearch";
import { yearText } from "@/lib/year";
import { Menu, type MenuItem } from "./Menu";
import { Artwork } from "./ui/Artwork";
import { NowBars } from "./ui/NowPlaying";
import type { RowContext } from "./ui/SmartSearch";
import { TandaTypeBadge } from "./ui/TandaTypeBadge";

/**
 * 2026-11 (the owner: Build by hand's version rows — "two lines, the title and a one-line fit summary, ⓘ for the full
 * reasons, one + Add and a … menu, the same height every row"; "warning lines are never cut"). The builder's own row
 * for the smart search (SmartSearchResults `renderVersion`) and the ⓘ that holds a long reason.
 */

/** an ⓘ that opens the full reasons in a bubble under it (a tap, Enter or Space; Esc or a tap elsewhere closes) */
export function ReasonInfo({
  label,
  lines,
  testId = "build-reasons",
}: {
  label: string;
  lines: string[];
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", off, true);
    document.addEventListener("keydown", off, true);
    return () => {
      document.removeEventListener("pointerdown", off, true);
      document.removeEventListener("keydown", off, true);
    };
  }, [open]);
  if (!lines.length) return null;
  return (
    <span ref={ref} className="build-info relative inline-flex shrink-0">
      <button
        type="button"
        className="icon-btn icon-btn-bare -my-1 h-11 w-11 text-[var(--label-2)]"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          haptic(4);
          setOpen((v) => !v);
        }}
        data-testid={testId}
      >
        <Info size={16} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <span id={id} role="note" className="build-info-pop" data-testid={`${testId}-pop`}>
          {lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export interface VersionFit {
  /** one line: the facts and what it does to the tanda */
  short: string;
  /** every reason, for the ⓘ */
  full: string[];
  /** it breaks a tanda rule (the line says so with ⚠) */
  warn: boolean;
}

/** one version in Build by hand's search: cover (plays) · title + one line · length · ⓘ · + Add · … */
export function BuildVersionRow({
  v,
  ctx,
  fit,
  onAdd,
  more,
}: {
  v: Version;
  ctx: RowContext;
  fit: VersionFit | null;
  onAdd: () => void;
  more: MenuItem[];
}) {
  const s = v.song;
  const item = useMemo<PlayItem>(() => ({ kind: "song", song: s, where: t("manualBuilder.search") }), [s]);
  const play = useTapPlay(item);
  const facts = [
    orchestraName(s),
    s.singer && orchestraName(s) === s.orchestra ? s.singer : null,
    yearText(s.year),
  ]
    .filter(Boolean)
    .join(" · ");
  const line: ReactNode = fit ? (
    <>
      {fit.warn ? <span aria-hidden>⚠ </span> : null}
      {fit.short}
    </>
  ) : (
    facts
  );
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: a listbox option driven by the field's ↑ ↓ (aria-activedescendant)
    <div
      role="option"
      id={ctx.id}
      aria-selected={ctx.active}
      className={`cell build-version gap-2 ${play.state ? "row-now" : ""}`}
      data-leading="art"
      data-active={ctx.active ? "" : undefined}
      data-testid="build-version"
      data-song-id={s.id}
      data-warn={fit?.warn || undefined}
      onPointerEnter={ctx.onHover}
    >
      <button
        type="button"
        className="relative -my-1 shrink-0"
        onClick={() => {
          haptic(4);
          void play.tap();
        }}
        aria-label={
          play.playing ? t("songRow.pause", { title: s.title }) : t("songRow.play", { title: s.title })
        }
        aria-pressed={play.playing}
        data-testid="build-version-play"
      >
        <Artwork orchestra={s.orchestra} orchestraId={s.orchestraId} song={s} />
        {play.state && (
          <span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/45">
            <NowBars on={play.playing} className="!text-white" />
          </span>
        )}
      </button>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate" data-testid="build-version-title">
            {s.title}
          </span>
          {ctx.workRhythm !== s.rhythm && <TandaTypeBadge rhythm={s.rhythm} compact />}
        </span>
        <span
          className={`text-footnote block truncate ${fit?.warn ? "text-[var(--orange-text,var(--label-2))]" : "text-[var(--label-2)]"}`}
          data-testid="build-fit-line"
          title={fit ? [facts, ...fit.full].join(" · ") : facts}
        >
          {line}
        </span>
      </span>
      <span className="len text-caption1" data-testid="build-version-len">
        <span className="sr-only">{t("play.length")} </span>
        {fmtLen(s.durationSec)}
      </span>
      <ReasonInfo
        label={t("build.fit_reasons", { title: s.title })}
        lines={[facts, ...(fit?.full ?? [])]}
        testId="build-version-info"
      />
      <button
        type="button"
        className="btn btn-ghost -my-1 min-h-11 shrink-0 px-3"
        onClick={onAdd}
        aria-label={t("search.add_to_night", { title: s.title })}
        data-testid="build-version-add"
      >
        <Plus size={16} strokeWidth={2.25} aria-hidden /> {t("manualBuilder.add")}
      </button>
      <span data-testid="build-version-more">
        <Menu
          label={t("builder.more_for", { title: s.title })}
          className="icon-btn-bare -my-1 h-11 w-10"
          items={more}
        />
      </span>
    </div>
  );
}
