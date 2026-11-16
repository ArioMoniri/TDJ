import { describe, expect, it } from "vitest";
import { wideSheetWidth } from "./sheetWidth";

describe("QA 2026-11: the Controller sheet never covers the sidebar", () => {
  it("1440 with a 240 px sidebar: 928 wide, its left edge 16 px clear of the sidebar", () => {
    const w = wideSheetWidth(1440, 240);
    expect(w).toBe(928);
    expect((1440 - w) / 2).toBeGreaterThanOrEqual(240 + 16);
  });
  it("wide screens keep the cap; no sidebar keeps 16 px margins; never under 320", () => {
    expect(wideSheetWidth(1920, 240)).toBe(980);
    expect(wideSheetWidth(834, 0)).toBe(802);
    expect(wideSheetWidth(700, 300)).toBe(320);
  });
});
