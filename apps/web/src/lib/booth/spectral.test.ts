import { describe, expect, it } from "vitest";
import { bandAt, bandEnvelopes, normalise } from "./spectral";

const RATE = 1000;
const tone = (sec: number, amp: (t: number) => number) =>
  Float32Array.from({ length: sec * RATE }, (_, i) => amp(i / RATE) * Math.sin(i));

describe("band envelopes (the transition editor's coloured waveform)", () => {
  it("one bucket per 1/perSec seconds, every value in 0…1", () => {
    const c = tone(3, () => 0.5);
    const b = bandEnvelopes([c, c, c], RATE, 20);
    expect(b.low).toHaveLength(60);
    expect(b.mid).toHaveLength(60);
    expect(b.high).toHaveLength(60);
    expect(b.perSec).toBeCloseTo(20, 6);
    for (const v of [...b.low, ...b.mid, ...b.high]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("each band is normalised on its own: a quiet band still shows its shape", () => {
    const loud = tone(2, (t) => (t < 1 ? 0.9 : 0.3));
    const quiet = tone(2, (t) => (t < 1 ? 0.03 : 0.01));
    const b = bandEnvelopes([loud, quiet, quiet], RATE, 10);
    expect(Math.max(...b.mid)).toBeCloseTo(1, 1);
    expect(b.mid[2]!).toBeGreaterThan(b.mid[15]! * 2);
    expect(b.low[2]!).toBeGreaterThan(b.low[15]!);
  });
  it("silence is flat zero, never NaN", () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
    const z = new Float32Array(RATE);
    const b = bandEnvelopes([z, z, z], RATE, 10);
    expect(b.low.every((v) => v === 0)).toBe(true);
  });
  it("reads the bands at a second; null outside the side", () => {
    const c = tone(2, (t) => (t < 1 ? 0.9 : 0.1));
    const b = bandEnvelopes([c, c, c], RATE, 10);
    expect(bandAt(b, 0.5)!.low).toBeGreaterThan(bandAt(b, 1.5)!.low);
    expect(bandAt(b, -0.1)).toBeNull();
    expect(bandAt(b, 2.5)).toBeNull();
  });
});
