"use client";
import { useEffect } from "react";
import { type Edit, historyKey, isTextTarget, redoEdit, undoEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/**
 * 2026-11 — the edit keys on every page (mounted once in the layout):
 * - ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo, over the one edit history (lib/editHistory.ts) — never
 *   while a text field has the focus (it keeps its own undo of the words typed);
 * - the Mac app's Edit → Undo / Redo (the menu bar's `edit.undo` / `edit.redo` commands, `tdj:command`): the same,
 *   and in a text field the field's own undo;
 * - S on a focused song or tanda row opens its Swap sheet (the row's Swap button, marked `data-kb="swap"` or one of
 *   the Booth's swap buttons).
 * Each undo or redo says what it did in the toast, with the opposite one as its action.
 */
const SWAP_BUTTONS =
  '[data-kb="swap"], [data-testid="booth-row-swap"], [data-testid="booth-swap"], [data-testid="booth-next-swap"], [data-testid="booth-tonight-swap"]';

let last = 0;
async function run(kind: "undo" | "redo") {
  // the Mac app: a key press and its menu command can both arrive for one ⌘Z
  const now = Date.now();
  if (now - last < 250) return;
  last = now;
  const e: Edit | null = kind === "undo" ? await undoEdit() : await redoEdit();
  if (!e) {
    toast(kind === "undo" ? t("editKeys.nothing_to_undo") : t("editKeys.nothing_to_redo"));
    return;
  }
  if (kind === "undo")
    toast(t("editKeys.undone", { label: e.label }), () => void run("redo"), t("editKeys.redo"));
  else toast(t("editKeys.redone", { label: e.label }), () => void run("undo"), t("editKeys.undo"));
}

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
      const kind = historyKey(e);
      const active = document.activeElement;
      if (kind) {
        if (isTextTarget(active)) return;
        e.preventDefault();
        void run(kind);
        return;
      }
      if (
        (e.key === "s" || e.key === "S") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTextTarget(active) &&
        !e.repeat
      ) {
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
      void run(id === "edit.undo" ? "undo" : "redo");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tdj:command", onCommand);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tdj:command", onCommand);
    };
  }, []);
  return null;
}
