"use client";
import { useEffect } from "react";
import { isTextTarget } from "@/lib/editHistory";
import { runHistory } from "@/lib/editToast";
import { isAction } from "@/lib/keymap";
import { ShakeUndo } from "./ShakeUndo";

/**
 * 2026-11 — the edit keys on every page (mounted once in the layout):
 * - undo / redo (⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Shift+Z / ⌘Y / Ctrl+Y by default; the DJ's own in Settings → Keyboard,
 *   lib/keymap.ts), over the one edit history (lib/editHistory.ts) — never while a text field has the focus (it
 *   keeps its own undo of the words typed; ⌘Y there is the field's redo, never the browser's History);
 * - the Mac app's Edit → Undo / Redo (the menu bar's `edit.undo` / `edit.redo` commands, `tdj:command`): the same,
 *   and in a text field the field's own undo; the menu shows ⇧⌘Z and ⌘Y reaches the page as a key (no menu item
 *   claims it, apps/desktop/src-tauri/src/menu.rs);
 * - Shake to Undo on a phone or a tablet (components/ShakeUndo.tsx, rendered here);
 * - Swap (S by default) on a focused song or tanda row opens its Swap sheet (the row's Swap button, marked
 *   `data-kb="swap"` or one of the Booth's swap buttons).
 * Each undo or redo says what it did in the toast, with the opposite one as its action (lib/editToast.ts).
 */
const SWAP_BUTTONS =
  '[data-kb="swap"], [data-testid="booth-row-swap"], [data-testid="booth-swap"], [data-testid="booth-next-swap"], [data-testid="booth-tonight-swap"]';

/** the swap button of the row that has the focus (or holds it) */
export function focusedSwap(active: Element | null): HTMLButtonElement | null {
  if (!active) return null;
  if (active.matches?.(SWAP_BUTTONS)) return active as HTMLButtonElement;
  const row = active.closest?.("li, [data-kb-row], header, [role='option'], [data-tanda]");
  return row?.querySelector<HTMLButtonElement>(SWAP_BUTTONS) ?? null;
}

export function EditKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const active = document.activeElement;
      // (a key being recorded in Settings → Keyboard is the recorder's)
      if (active?.closest?.("[data-key-recorder]")) return;
      const kind = isAction("edit.undo", e) ? "undo" : isAction("edit.redo", e) ? "redo" : null;
      if (kind) {
        if (isTextTarget(active)) {
          // ⌘Y is no text field's redo on a Mac (Safari and Chrome would open History): the field's own redo
          if (kind === "redo" && e.metaKey && !e.shiftKey && e.key.toLowerCase() === "y") {
            e.preventDefault();
            document.execCommand("redo");
          }
          return;
        }
        e.preventDefault();
        void runHistory(kind);
        return;
      }
      if (isAction("edit.swap", e) && !isTextTarget(active) && !e.repeat) {
        const b = focusedSwap(active);
        if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") {
          e.preventDefault();
          b.click();
        }
      }
    };
    const onCommand = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id !== "edit.undo" && id !== "edit.redo") return;
      e.preventDefault();
      if (isTextTarget(document.activeElement)) {
        document.execCommand(id === "edit.undo" ? "undo" : "redo");
        return;
      }
      void runHistory(id === "edit.undo" ? "undo" : "redo");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tdj:command", onCommand);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tdj:command", onCommand);
    };
  }, []);
  return <ShakeUndo />;
}
