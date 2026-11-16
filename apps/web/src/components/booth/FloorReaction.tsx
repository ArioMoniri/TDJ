"use client";
import type { FloorReaction as Reaction, Song } from "@tdj/core";
import { ChevronDown, Heart, Meh, TrendingDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { recordMemoryEdit } from "@/lib/booth/undo";
import { floorReactionOf, floorTap } from "@/lib/favourites";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

const REACTIONS: Array<{ r: Reaction; key: "fav.floor_full" | "fav.floor_ok" | "fav.floor_emptied" }> = [
  { r: "full", key: "fav.floor_full" },
  { r: "ok", key: "fav.floor_ok" },
  { r: "emptied", key: "fav.floor_emptied" },
];
const ICON = { full: Heart, ok: Meh, emptied: TrendingDown } as const;

/**
 * 2026-11, dancer favourites: the DJ's one-tap floor reaction — "Floor full ♥", "OK", "Floor emptied" — on the
 * playing song (scope song: the Now card, the Controls panel) or on a tanda (scope tanda: its set-list row, the
 * Controls panel). It is kept in the DJ's memory with the night id, the time and the tanda's role; the same tap again
 * takes it back. Buttons are 44 pt; `compact` shows the icons only (the set list's tanda rows).
 */
export function FloorReaction({
  scope,
  tanda: tandaProp,
  compact,
  testPrefix,
  onPick,
}: {
  scope: "song" | "tanda";
  /** the plan's tanda (1-based); default: the playing item's */
  tanda?: number;
  compact?: boolean;
  testPrefix: string;
  /** after a reaction is saved or taken back (the "Floor…" menu closes) */
  onPick?: () => void;
}) {
  const playlist = useBooth((s) => s.playlist);
  const item = useBooth((s) => s.plan?.items[s.planIndex]);
  const entity = useBooth((s) => s.entities[s.planIndex] ?? null);
  const memory = useStore((s) => s.memory);
  const tanda = tandaProp ?? item?.tanda ?? 0;
  const song: Song | null =
    scope === "song" && item?.kind === "track" && entity && "rhythm" in entity ? (entity as Song) : null;
  const t0 = playlist?.tandas[tanda - 1];
  const disabled = !playlist || !t0 || (scope === "song" && !song);
  const pressed =
    playlist && !disabled ? floorReactionOf(memory, playlist, { scope, tanda, songId: song?.id }) : undefined;
  const label =
    scope === "song" ? t("fav.floor_label") : t("fav.floor_tanda_label", { tanda: Math.max(1, tanda) });
  const tap = (r: Reaction) => {
    if (!playlist || disabled) return;
    haptic(8);
    const was = floorReactionOf(useStore.getState().memory, playlist, { scope, tanda, songId: song?.id });
    const what = REACTIONS.find((x) => x.r === r)!;
    // 2026-11: ⌘Z takes the reaction back (lib/booth/undo.ts)
    recordMemoryEdit(t("boothUndo.floor", { reaction: t(what.key), tanda: Math.max(1, tanda) }), () =>
      useStore.getState().updateMemory((m) => floorTap(m, playlist, { scope, tanda, song, reaction: r })),
    );
    toast(was === r ? t("fav.cleared_toast") : t("fav.tapped_toast", { reaction: t(what.key) }));
    onPick?.();
  };
  return (
    <fieldset
      className={`booth-floor ${compact ? "booth-floor-compact" : ""}`}
      data-testid={`${testPrefix}-floor`}
      disabled={disabled}
    >
      <legend className={compact ? "sr-only" : "booth-floor-title"}>{label}</legend>
      {REACTIONS.map(({ r, key }) => {
        const Icon = ICON[r];
        return (
          <button
            key={r}
            type="button"
            className={`booth-floor-btn booth-floor-${r}`}
            aria-pressed={pressed === r}
            aria-label={compact ? `${t(key)} · ${label}` : undefined}
            title={compact ? t(key) : undefined}
            onClick={() => tap(r)}
            data-testid={`${testPrefix}-floor-${r}`}
          >
            <Icon
              size={16}
              strokeWidth={2}
              aria-hidden
              fill={r === "full" && pressed === r ? "currentColor" : "none"}
            />
            {!compact && <span>{t(key)}</span>}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * 2026-11 — a narrow set-list column (iPhone, iPad landscape with the sidebar open): the tanda header's three
 * reactions collapse into one "Floor…" button (44 pt) that opens a small menu with the labelled reactions, so the
 * header's title, type and total keep their room. The button shows the chosen reaction's glyph once there is one.
 * A choice, Escape or a tap outside closes the menu.
 */
export function FloorMenu({ tanda, testPrefix }: { tanda: number; testPrefix: string }) {
  const playlist = useBooth((s) => s.playlist);
  const memory = useStore((s) => s.memory);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const disabled = !playlist?.tandas[tanda - 1];
  const pressed =
    playlist && !disabled ? floorReactionOf(memory, playlist, { scope: "tanda", tanda }) : undefined;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the menu only, not the set-list sheet around it (window capture runs before the sheet's own)
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);
  const Icon = pressed ? ICON[pressed] : null;
  const label = t("fav.floor_menu_label", { tanda: Math.max(1, tanda) });
  return (
    <span ref={root} className="booth-floor-menu" data-testid={`${testPrefix}-floor-menu`}>
      <button
        type="button"
        className="booth-floor-btn booth-floor-menu-btn"
        data-reaction={pressed}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={pressed ? `${label} · ${t(REACTIONS.find((x) => x.r === pressed)!.key)}` : label}
        title={t("fav.floor_tanda_label", { tanda: Math.max(1, tanda) })}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        data-testid={`${testPrefix}-floor-menu-btn`}
      >
        {Icon && (
          <Icon size={16} strokeWidth={2} aria-hidden fill={pressed === "full" ? "currentColor" : "none"} />
        )}
        <span>{t("fav.floor_menu_short")}</span>
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden className="booth-floor-menu-chev" />
      </button>
      {open && (
        <span id={id} className="booth-floor-pop" data-testid={`${testPrefix}-floor-pop`}>
          <FloorReaction
            scope="tanda"
            tanda={tanda}
            testPrefix={`${testPrefix}-menu`}
            onPick={() => {
              setOpen(false);
              root.current?.querySelector<HTMLButtonElement>("button")?.focus();
            }}
          />
        </span>
      )}
    </span>
  );
}
