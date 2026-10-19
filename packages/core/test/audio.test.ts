import { describe, expect, it } from "vitest";
import { camelotDistance, compatibility, cortinaFit, keyRelation, tandaCohesion } from "../src/audio/compat";
import { analyzePcm } from "../src/audio/dsp";

const f = (bpm: number, camelot = "8A", loud = -12, bright = 1800, energy = 60) => ({
  bpm,
  camelot,
  loudnessDb: loud,
  brightnessHz: bright,
  energy,
});

describe("audio compatibility model (audio_model.json v1)", () => {
  it("camelot distance is circular and letter-aware", () => {
    expect(camelotDistance("1A", "12A")).toBe(1);
    expect(camelotDistance("8A", "8B")).toBe(1);
    expect(camelotDistance("8A", "2A")).toBe(6);
  });
  it("same key scores below fifth/relative (contrast wanted, nothing overlaid)", () => {
    expect(keyRelation("8A", "8A")).toBeLessThan(keyRelation("8A", "9A"));
    expect(keyRelation("8A", "8B")).toBe(1);
  });
  it("identical features are 100, tempo clash drops hard, unknown is 50", () => {
    expect(compatibility(f(120), f(120)).score).toBeGreaterThanOrEqual(95);
    expect(compatibility(f(120), f(140)).score).toBeLessThan(compatibility(f(120), f(123)).score);
    expect(compatibility(null, f(120))).toEqual({ score: 50, parts: {}, known: false });
  });
  it("is symmetric and milonga tolerates a bigger energy step", () => {
    expect(compatibility(f(110), f(118)).score).toBe(compatibility(f(118), f(110)).score);
    const a = f(100, "8A", -12, 1800, 60),
      b = f(100, "8A", -12, 1800, 72);
    expect(compatibility(a, b, "milonga").score).toBeGreaterThan(compatibility(a, b, "tango").score);
  });
  it("tanda badge is pulled toward the worst pair", () => {
    const c = tandaCohesion([f(120), f(121), f(145), f(144)], "tango");
    expect(c.known).toBe(3);
    expect(c.score).toBeLessThan(80);
  });
  it("cortina fit likes a cortina a little below the next tanda and not louder", () => {
    expect(cortinaFit(f(120, "8A", -14, 1800, 52), f(120, "8A", -12, 1800, 60))).toBeGreaterThan(90);
    expect(cortinaFit(f(120, "8A", -6, 1800, 75), f(120, "8A", -12, 1800, 60))).toBeLessThan(50);
  });
  it("analyses a synthetic 120 BPM A-minor pulse into the tango window", () => {
    const sr = 22050,
      n = sr * 12,
      pcm = new Float32Array(n);
    const freqs = [220, 261.63, 329.63];
    for (let i = 0; i < n; i++) {
      const t = i / sr,
        beat = (t * 2) % 1; // 120 BPM
      const env = Math.exp(-beat * 6);
      pcm[i] = env * freqs.reduce((a, fq) => a + Math.sin(2 * Math.PI * fq * t), 0) * 0.2;
    }
    const r = analyzePcm(pcm, sr, { rhythmHint: "tango" });
    expect(Math.abs(r.bpm - 120)).toBeLessThan(3);
    expect(r.key).toBe("A");
    expect(r.mode).toBe("minor");
  });
});
