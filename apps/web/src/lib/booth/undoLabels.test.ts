import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { tr } from "@/lib/i18n/tr";

/**
 * QA 2026-11: "Undid: Undo the crossfade" — the history's labels name the action, never a verb of their own: the toast
 * adds "Undid: " / "Redone: " ("Geri alındı: " / "Yinelendi: ") in front of them.
 */
const LABELS = (o: Record<string, string>) =>
  Object.entries(o).filter(([k]) => k.startsWith("boothUndo.") || /^booth\.fade\.undo_/.test(k));

describe("the Booth's undo labels", () => {
  it("never start with an undo verb (en, tr)", () => {
    for (const [k, v] of LABELS(en as unknown as Record<string, string>))
      expect(v, k).not.toMatch(/^(undo|undid|redo)\b/i);
    for (const [k, v] of LABELS(tr as unknown as Record<string, string>))
      expect(v, k).not.toMatch(/^(geri al|yinele)/i);
  });
  it("the crossfade reads 'Undid: Crossfade'", () => {
    expect(en["editKeys.undone"].replace("{label}", en["booth.fade.undo_crossfade"])).toBe(
      "Undid: Crossfade",
    );
    expect(en["editKeys.undone"].replace("{label}", en["booth.fade.undo_fade"])).toBe("Undid: Fade out");
  });
});
