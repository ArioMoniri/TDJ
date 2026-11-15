import { describe, expect, it } from "vitest";
import { SEEK_KEY_SEC, seekFraction, seekStep } from "./seek";

describe("seek bar math", () => {
  it("a pointer maps to 0…1 of the bar, clamped at both ends", () => {
    expect(seekFraction(150, 100, 200)).toBeCloseTo(0.25, 9);
    expect(seekFraction(50, 100, 200)).toBe(0);
    expect(seekFraction(400, 100, 200)).toBe(1);
    expect(seekFraction(150, 100, 0)).toBe(0);
  });
  it("← / → move 5 s, Home / End go to the ends, never past them; other keys do not seek", () => {
    expect(SEEK_KEY_SEC).toBe(5);
    expect(seekStep("ArrowRight", 10, 170)).toBe(15);
    expect(seekStep("ArrowLeft", 10, 170)).toBe(5);
    expect(seekStep("ArrowLeft", 3, 170)).toBe(0);
    expect(seekStep("ArrowRight", 168, 170)).toBe(170);
    expect(seekStep("Home", 99, 170)).toBe(0);
    expect(seekStep("End", 9, 170)).toBe(170);
    expect(seekStep("Enter", 9, 170)).toBeNull();
  });
});
