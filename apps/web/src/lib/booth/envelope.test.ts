import { describe, expect, it } from "vitest";
import { dbToGain, fadeInCurve, fadeOutCurve, gainToDb, volumeSteps } from "./envelope";

describe("envelope curves (round7-booth.md §5.1)", () => {
  it("fadeOutCurve: monotonic, first value 1, last exactly 0, second-to-last ≈ 10^(−60/20)", () => {
    const c = fadeOutCurve(64);
    expect(c.length).toBe(64);
    expect(c[0]).toBe(1);
    expect(c[63]).toBe(0);
    expect(c[62]).toBeCloseTo(10 ** (-60 / 20), 3);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeLessThanOrEqual(c[i - 1]!);
  });
  it("fadeInCurve mirrors it and both scale by the base gain", () => {
    const out = fadeOutCurve(16, 0.5);
    const inn = fadeInCurve(16, 0.5);
    expect(inn[0]).toBe(0);
    expect(inn[15]).toBe(0.5);
    for (let i = 0; i < 16; i++) expect(inn[i]).toBeCloseTo(out[15 - i]!, 9);
  });
  it("dB ↔ gain and the 50 ms step count for a 4 s fade (≈ 80 calls)", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(gainToDb(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(volumeSteps(4)).toBe(80);
  });
});
