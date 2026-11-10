import { describe, expect, it } from "vitest";
import { autoImproveLine } from "./changes";
import { DEFAULT_SETTINGS } from "./types";

describe("auto-improve (round 13)", () => {
  it("is on by default", () => {
    expect(DEFAULT_SETTINGS.autoImprove).toBe(true);
  });
  it("says nothing when nothing changed, and names the kinds and both numbers when something did", () => {
    expect(autoImproveLine(null)).toBeNull();
    expect(
      autoImproveLine({
        changes: [],
        before: { score: 90, inRange: 14, scored: 17 },
        after: { score: 90, inRange: 14, scored: 17 },
      }),
    ).toBeNull();
    const line = autoImproveLine({
      changes: [
        { kind: "tighten", tanda: 3, text: "Tanda 4: …" },
        { kind: "heatmap", tanda: 7, text: "Tanda 8: …" },
        { kind: "tighten", tanda: 9, text: "Tanda 10: …" },
      ],
      before: { score: 89, inRange: 13, scored: 17 },
      after: { score: 91, inRange: 15, scored: 17 },
    });
    expect(line).toBe(
      "Auto-improved against published sets: 3 changes (one recording period, heatmap years) · engine 89 → 91 · benchmark 13/17 → 15/17",
    );
  });
  it("round 14: the strict panel's own edits are named", () => {
    const line = autoImproveLine({
      changes: [
        { kind: "strict", tanda: 20, text: "Tanda 21: … (strict panel: 0 blockers · 2 should-fix → …)" },
      ],
      before: { score: 86, inRange: 15, scored: 18 },
      after: { score: 88, inRange: 16, scored: 18 },
    });
    expect(line).toContain("(strict panel)");
  });
});
