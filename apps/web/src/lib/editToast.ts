import { redoEdit, type UndoResult, undoEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/**
 * 2026-11: one undo / redo with its toast, for the keys (components/EditKeys.tsx), the Mac app's Edit menu and every
 * toast's Undo (the Booth's "will be skipped"): "Undid: Skip next (Ahora No Me Conocés)" with Redo, and the opposite
 * after a redo. An entry that cannot be undone (it already played in the room) says why instead.
 */
let last: { at: number; kind: "undo" | "redo"; source: HistorySource } | null = null;
/** where an undo / redo came from, for the keys and the Mac app's menu (a button or a toast's action passes none) */
export type HistorySource = "key" | "menu";
/** a key press and its menu command closer than this are one ⌘Z */
const SAME_PRESS_MS = 250;
export async function runHistory(
  kind: "undo" | "redo",
  o: { scope?: string; id?: number; source?: HistorySource } = {},
) {
  // the Mac app: a key press and its menu command can both arrive for one ⌘Z — only that pair is one action. Two
  // presses of the key, or the header's Undo and then ⌘Z, are two (the ⌘Z right after a click on Undo was lost)
  if (o.source) {
    const now = Date.now();
    const twin = last && last.kind === kind && last.source !== o.source && now - last.at < SAME_PRESS_MS;
    // (a twin closes its pair: the next press is a new one)
    last = twin ? null : { at: now, kind, source: o.source };
    if (twin) return null;
  }
  const e: UndoResult | null =
    kind === "undo" ? await undoEdit(o) : await redoEdit(o.scope ? { scope: o.scope } : {});
  if (!e) {
    toast(kind === "undo" ? t("editKeys.nothing_to_undo") : t("editKeys.nothing_to_redo"));
    return null;
  }
  if (e.why) toast(e.why);
  else if (kind === "undo")
    toast(
      t("editKeys.undone", { label: e.label }),
      () => void runHistory("redo", { scope: e.scope }),
      t("editKeys.redo"),
    );
  else
    toast(
      t("editKeys.redone", { label: e.label }),
      () => void runHistory("undo", { scope: e.scope }),
      t("editKeys.undo"),
    );
  return e;
}
