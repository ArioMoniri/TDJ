import { redoEdit, type UndoResult, undoEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/**
 * 2026-11: one undo / redo with its toast, for the keys (components/EditKeys.tsx), the Mac app's Edit menu and every
 * toast's Undo (the Booth's "will be skipped"): "Undid: Skip next (Ahora No Me Conocés)" with Redo, and the opposite
 * after a redo. An entry that cannot be undone (it already played in the room) says why instead.
 */
let last = 0;
export async function runHistory(kind: "undo" | "redo", o: { scope?: string; id?: number } = {}) {
  // the Mac app: a key press and its menu command can both arrive for one ⌘Z
  const now = Date.now();
  if (now - last < 250) return null;
  last = now;
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
