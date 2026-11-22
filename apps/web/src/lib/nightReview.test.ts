import { describe, expect, it } from "vitest";
import { reviewFixOf, reviewSettings } from "./api/spot";
import { composeSettings, dragOrder } from "./nightReview";

describe("the review follows the Compose settings", () => {
  it("the era's defaults under the DJ's own rules, only the keys a review reads", () => {
    const s = composeSettings({
      eras: ["golden"],
      hours: 3,
      pattern: "TVTM",
      rules: { lastFourTango: true },
      pinned: ["pattern"],
      touched: ["pattern"],
    } as never);
    expect(s.pattern).toBe("TVTM");
    expect(s.maxYearSpread).toBe(4);
    expect(s.orchestraRepeatGap).toBe(6);
    expect(s.rules?.lastFourTango).toBe(true);
    // the era's own night rules stay under the DJ's
    expect(s.rules?.ultimaRule).toBe("emotional-vocal");
    // never the night's length or anything else Compose holds
    expect("hours" in s).toBe(false);
    expect("pinned" in s).toBe(false);
  });

  it("the route keeps only the review's keys and checks a fix's shape", () => {
    expect(reviewSettings({ pattern: "TVTM", hours: 9, overrides: { x: 1 } })).toEqual({ pattern: "TVTM" });
    expect(reviewSettings(null)).toBeUndefined();
    expect(reviewFixOf({ kind: "side", tanda: 1, side: 2, songId: "abc" })).toEqual({
      kind: "side",
      tanda: 1,
      side: 2,
      songId: "abc",
    });
    expect(reviewFixOf({ kind: "guide", fix: { kind: "cortina", tanda: 3 } })).toEqual({
      kind: "guide",
      fix: { kind: "cortina", tanda: 3 },
    });
    expect(reviewFixOf({ kind: "guide", fix: { kind: "rm -rf" } })).toBeNull();
    expect(reviewFixOf({ kind: "order", order: [1, 0, 2] })).toEqual({ kind: "order", order: [1, 0, 2] });
    expect(reviewFixOf({ kind: "nope" })).toBeNull();
  });

  it("a drag of the tanda list is an order of every tanda", () => {
    expect(dragOrder(5, 4, 1)).toEqual([0, 4, 1, 2, 3]);
    expect(dragOrder(5, 0, 4)).toEqual([1, 2, 3, 4, 0]);
    expect(dragOrder(3, 1, 1)).toEqual([0, 1, 2]);
    expect(dragOrder(3, 5, 0)).toEqual([0, 1, 2]);
  });
});
