"use client";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useMemo,
  useRef,
} from "react";
import { create } from "zustand";
import { pressHaptic } from "./haptics";
import { PlayListContext } from "./playback";
import type { PlayItem } from "./player";
import { openSongDetails } from "./songOpen";
import type { Song } from "./types";

/**
 * 2026-11 (the owner: "song details and Song DNA from every song row") — one context menu for every song row and
 * cover in the app: right-click on a desktop, a long press with a haptic on touch, the ⓘ where a row has room, and
 * "i" on a focused row (Space and Enter keep their play meanings). The menu is mounted once
 * (components/song/SongContextMenu.tsx, beside the app-wide song sheets); a row hands it the side and what its
 * surface can do (the Booth's own sheet, Swap…, Insert…). Everything else is the same everywhere: Play / Pre-listen,
 * Play from here, Song details, Song DNA, Find on services, Measure from your file, Copy title.
 */
export interface SongMenuAction {
  label?: string;
  run: () => void;
  disabled?: boolean;
  /** why it is off (a locked tanda), a second line under the label */
  subtitle?: string;
}

export interface SongMenuSpec {
  /** the side (no menu without one: a cortina, a break) */
  song: Song | null | undefined;
  /** the surface's own play (the Booth: pre-listen in the headphones); default: the app's player */
  play?: SongMenuAction;
  /** "Play from here" (false: never offered); default: on through the row's list */
  playFrom?: SongMenuAction | false;
  /** the surface's own details (the Booth's sheet with Play now / next on top); default: the shared song details */
  details?: () => void;
  /** Swap… (Compose, the Booth) */
  swap?: SongMenuAction;
  /** Insert… (a tanda's place); without it "Add to tonight…" is offered while a night is open */
  insert?: SongMenuAction;
  /** "Add to tonight…" off (the Booth's night is not the Compose night) */
  noAddToTonight?: boolean;
  /** the surface's own "Find on services" (the Booth: a file for the night) */
  find?: () => void;
  /** the surface's own measure (the Booth's decoded file; undefined: it said the outcome itself) */
  measure?: () => Promise<string | null | undefined>;
}

export interface SongMenuOpen {
  spec: SongMenuSpec & { song: Song };
  list: { label: string; items: PlayItem[] } | null;
  x: number;
  y: number;
  /** a long press (a touch screen): the menu opens as a sheet */
  touch: boolean;
  /** the row the menu came from (focus returns there) */
  from: HTMLElement | null;
  at: number;
}

export const useSongMenu = create<{ open: SongMenuOpen | null }>()(() => ({ open: null }));
export const closeSongMenu = () => useSongMenu.setState({ open: null });

/** a long press opens the menu after this long (a scroll or a drag cancels it; a drag picks up at 350 ms) */
export const LONG_PRESS_MS = 500;
/** a finger that moves farther than this is scrolling, not pressing */
export const LONG_PRESS_SLOP = 10;

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true']");

/** "i" (no modifier) on a focused row opens its details; true when it did */
export function isInfoKey(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">) {
  return (e.key === "i" || e.key === "I") && !e.metaKey && !e.ctrlKey && !e.altKey && !editable(e.target);
}

export function openSongMenu(
  spec: SongMenuSpec,
  list: SongMenuOpen["list"],
  at: { x: number; y: number; touch: boolean; from?: HTMLElement | null },
) {
  if (!spec.song) return;
  useSongMenu.setState({
    open: {
      spec: spec as SongMenuSpec & { song: Song },
      list,
      x: at.x,
      y: at.y,
      touch: at.touch,
      from: at.from ?? null,
      at: Date.now(),
    },
  });
}

export interface SongMenuHandlers {
  "data-song-menu": "";
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMoveCapture: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUpCapture: () => void;
  onPointerCancelCapture: () => void;
  onClickCapture: (e: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
}

/**
 * The props that make an element (a row, a card, a cover) open the song menu. `spec` is read when the menu opens (a
 * fresh object every render is fine, or a function read then); the list is the row's PlayListContext (Play from here). Pointer handlers run in
 * the capture phase, so a row's buttons that stop propagation (drag handles, swipe rows) still count.
 */
export function useSongMenuProps(spec: SongMenuSpec | null | (() => SongMenuSpec | null)): SongMenuHandlers {
  const list = useContext(PlayListContext);
  const live = useRef({ spec, list });
  live.current = { spec, list };
  return useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let x0 = 0;
    let y0 = 0;
    let fired = 0;
    const cur = () => {
      const s = live.current.spec;
      return typeof s === "function" ? s() : s;
    };
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const show = (x: number, y: number, touch: boolean, from: HTMLElement) => {
      const { list: l } = live.current;
      const s = cur();
      if (!s?.song) return false;
      openSongMenu(s, l, { x, y, touch, from });
      return true;
    };
    return {
      "data-song-menu": "",
      onContextMenu: (e) => {
        if (!cur()?.song || editable(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        // a long press already opened it (Android sends contextmenu after the press too)
        if (Date.now() - fired < 1000) return;
        show(e.clientX, e.clientY, false, e.currentTarget);
      },
      onPointerDownCapture: (e) => {
        clear();
        if (e.pointerType === "mouse" || !cur()?.song || editable(e.target)) return;
        x0 = e.clientX;
        y0 = e.clientY;
        const row = e.currentTarget;
        timer = setTimeout(() => {
          timer = null;
          // a drag picked the row up (Compose's tanda rows, the Booth's set list): no menu
          if (row.closest("[data-dragging]") || row.querySelector("[data-dragging]")) return;
          if (!show(x0, y0, true, row)) return;
          fired = Date.now();
          pressHaptic();
        }, LONG_PRESS_MS);
      },
      onPointerMoveCapture: (e) => {
        if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > LONG_PRESS_SLOP) clear();
      },
      onPointerUpCapture: clear,
      onPointerCancelCapture: clear,
      onClickCapture: (e) => {
        // the release of a long press is not a tap (it would play the row)
        if (Date.now() - fired < 800) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      onKeyDown: (e) => {
        const s = cur();
        if (!s?.song) return;
        if (isInfoKey(e)) {
          e.preventDefault();
          e.stopPropagation();
          if (s.details) s.details();
          else openSongDetails(s.song);
          return;
        }
        // the keyboard's menu key and ⇧F10 open the menu at the row
        if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          show(r.left + 24, r.top + r.height / 2, false, e.currentTarget);
        }
      },
    };
  }, []);
}
