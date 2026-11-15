"use client";
import { type PointerEvent as ReactPointerEvent, useCallback, useRef } from "react";

/**
 * 2026-11 — drag to reorder rows (songs in a tanda, tandas in a hand-built night): mouse drags at once, touch after a
 * long-press (350 ms, so a scroll stays a scroll). The rows carry `data-reorder-row` inside one `data-reorder-list`
 * element; the dragged row dims and a tint line marks where it lands. Only the handle starts a drag, so a drag never
 * plays the row. `onMove(from, to)` uses splice semantics (remove `from`, insert at `to`).
 */
export function useDragReorder(onMove: (from: number, to: number) => void, disabled = false) {
  const live = useRef<(() => void) | null>(null);
  const handle = useCallback(
    (from: number) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (disabled || e.button > 0) return;
        e.stopPropagation();
        const el = e.currentTarget;
        const row = el.closest<HTMLElement>("[data-reorder-row]");
        const list = row?.closest<HTMLElement>("[data-reorder-list]");
        if (!row || !list) return;
        live.current?.();
        const touch = e.pointerType === "touch" || e.pointerType === "pen";
        if (!touch) e.preventDefault();
        const x0 = e.clientX;
        const y0 = e.clientY;
        let dragging = false;
        let to = from;
        const rows = () =>
          [...list.querySelectorAll<HTMLElement>("[data-reorder-row]")].filter(
            (r) => r.closest("[data-reorder-list]") === list,
          );
        const clearMarks = () => {
          for (const r of rows()) delete r.dataset.dropBefore;
        };
        const begin = () => {
          dragging = true;
          row.dataset.dragging = "1";
          try {
            el.setPointerCapture(e.pointerId);
          } catch {}
          navigator.vibrate?.(8);
        };
        const timer = touch ? setTimeout(begin, 350) : null;
        const move = (ev: PointerEvent) => {
          if (!dragging) {
            const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
            if (touch && d > 8) return end(false);
            if (!touch && d > 4) begin();
            if (!dragging) return;
          }
          ev.preventDefault();
          const others = rows().filter((r) => r !== row);
          to = others.filter((r) => {
            const b = r.getBoundingClientRect();
            return b.top + b.height / 2 < ev.clientY;
          }).length;
          clearMarks();
          const mark = others[to];
          if (mark && to !== from) mark.dataset.dropBefore = "1";
        };
        const up = () => end(dragging);
        const end = (commit: boolean) => {
          if (timer) clearTimeout(timer);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
          delete row.dataset.dragging;
          clearMarks();
          live.current = null;
          if (commit && to !== from) onMove(from, to);
        };
        const cancel = () => end(false);
        live.current = cancel;
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
      },
      // a long-press must not open the browser's context menu or select text
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
    }),
    [onMove, disabled],
  );
  return handle;
}
