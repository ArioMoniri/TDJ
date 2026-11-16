"use client";
import type React from "react";
import { useBooth } from "@/lib/booth/store";
import { undoEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { gateEdit } from "@/lib/ruleCheck";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";

/**
 * 2026-11 ("order in each tanda should be changeable"): the songs of a tanda can change places in the Booth — by drag
 * (the row's number; a long press on touch) or Move up / Move down in the row's sheet. Only songs that have neither
 * played nor play now can move (the playing song stays put; the ones after it in its tanda can, which changes what
 * plays next). It never changes the sound of the room, so no confirmation: a toast with Undo. The night re-times,
 * the store's set (Compose) and the saved night follow; the rule check runs (soft: Undo / See suggestion).
 */

/** can the item at plan index `i` move? (a song of a tanda, not played, not playing) */
export function movable(i: number): boolean {
  const s = useBooth.getState();
  const it = s.plan?.items[i];
  if (it?.kind !== "track" || it.tanda < 1 || !it.id) return false;
  return !s.started || i > s.planIndex;
}

/** the plan indexes `i` can move to inside its tanda (in order) */
export function movableRange(i: number): number[] {
  const s = useBooth.getState();
  const it = s.plan?.items[i];
  if (!it || !movable(i)) return [];
  const out: number[] = [];
  s.plan!.items.forEach((x, j) => {
    if (x.tanda === it.tanda && movable(j)) out.push(j);
  });
  return out;
}

/** the set with the song at plan index `from` moved to where the song at plan index `to` is (same tanda) */
export function reordered(from: number, to: number): { before: Playlist; after: Playlist } | null {
  const s = useBooth.getState();
  const p = s.playlist;
  const a = s.plan?.items[from];
  const b = s.plan?.items[to];
  if (!p || !a || !b || from === to || a.tanda !== b.tanda || !movable(from) || !movable(to)) return null;
  const tanda = p.tandas[a.tanda - 1];
  if (!tanda) return null;
  const ia = tanda.songs.findIndex((x) => x.id === a.id);
  const ib = tanda.songs.findIndex((x) => x.id === b.id);
  if (ia < 0 || ib < 0) return null;
  const songs = [...tanda.songs];
  const [moved] = songs.splice(ia, 1);
  songs.splice(ib, 0, moved!);
  return {
    before: p,
    after: { ...p, tandas: p.tandas.map((x, k) => (k === a.tanda - 1 ? { ...x, songs } : x)) },
  };
}

/** move the song at `from` to the place of `to`, through the rule check, with Undo */
export async function moveSong(from: number, to: number): Promise<boolean> {
  const r = reordered(from, to);
  if (!r) return false;
  const title = useBooth.getState().plan?.items[from]?.title ?? "";
  const label = t("booth.reorder.moved", { title });
  const apply = (p: Playlist) => useBooth.getState().applySwappedPlaylist(p);
  const res = await gateEdit({ before: r.before, after: r.after, label, apply, learn: false });
  // 2026-11: the toast's Undo is the one undo history (⌘Z walks the same)
  if (res === "applied") toast(label, () => void undoEdit());
  return res !== "cancelled";
}

/** Move up / Move down: one place inside the tanda */
export function stepTarget(i: number, dir: -1 | 1): number | null {
  const range = movableRange(i);
  const k = range.indexOf(i);
  const j = range[k + dir];
  return j === undefined ? null : j;
}

/* ---------- drag: the row's number is the handle (a press-and-drag with a mouse, a long press on touch) ---------- */

interface Drag {
  i: number;
  id: number;
  y0: number;
  row: HTMLElement;
  on: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  target: number | null;
}
let drag: Drag | null = null;
let swallowClick = false;

function rowsOf(i: number): Array<{ i: number; el: HTMLElement }> {
  const range = movableRange(i);
  return range
    .map((j) => ({ i: j, el: document.querySelector<HTMLElement>(`.booth-row[data-plan-index="${j}"]`)! }))
    .filter((x) => !!x.el);
}
function begin(d: Drag) {
  d.on = true;
  d.row.setAttribute("data-dragging", "");
  if (typeof navigator !== "undefined") navigator.vibrate?.(8);
}
function end(commit: boolean) {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.timer) clearTimeout(d.timer);
  d.row.removeAttribute("data-dragging");
  d.row.style.removeProperty("transform");
  for (const el of document.querySelectorAll("[data-drop]")) el.removeAttribute("data-drop");
  if (d.on) {
    swallowClick = true;
    setTimeout(() => {
      swallowClick = false;
    }, 0);
    if (commit && d.target !== null && d.target !== d.i) void moveSong(d.i, d.target);
  }
}

/** the handlers for a row's number: a tap opens the sheet, a drag reorders inside the tanda */
export function dragHandle(i: number, onOpen: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !movable(i)) return;
      const row = e.currentTarget.closest<HTMLElement>(".booth-row");
      if (!row) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const d: Drag = { i, id: e.pointerId, y0: e.clientY, row, on: false, timer: null, target: null };
      drag = d;
      // touch: a long press picks the row up (a short tap stays a tap)
      if (e.pointerType !== "mouse") d.timer = setTimeout(() => drag === d && begin(d), 350);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.y0;
      if (!d.on) {
        if (e.pointerType === "mouse" && Math.abs(dy) > 6) begin(d);
        else if (e.pointerType !== "mouse" && Math.abs(dy) > 10) return end(false);
        else return;
      }
      d.row.style.transform = `translateY(${dy}px)`;
      const rows = rowsOf(d.i);
      let target: number | null = null;
      for (const r of rows) {
        if (r.i === d.i) continue;
        const b = r.el.getBoundingClientRect();
        if (e.clientY >= b.top && e.clientY <= b.bottom) target = r.i;
      }
      d.target = target;
      for (const r of rows) r.el.toggleAttribute("data-drop", r.i === target);
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (swallowClick) {
        e.preventDefault();
        return;
      }
      onOpen();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      // the keyboard: Alt + ↑ / ↓ moves the song one place
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const j = stepTarget(i, e.key === "ArrowUp" ? -1 : 1);
      if (j === null) return;
      e.preventDefault();
      void moveSong(i, j);
    },
  };
}
