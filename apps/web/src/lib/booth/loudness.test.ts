import { describe, expect, it } from "vitest";
import { channelCorrelation, integratedLoudness, introSeconds, measurePcm, samplePeakDb } from "./loudness";

const RATE = 48000;
function sine(sec: number, freq: number, rmsDb: number, rate = RATE, leadSilenceSec = 0): Float32Array {
  const n = Math.round(sec * rate);
  const out = new Float32Array(n);
  const amp = Math.SQRT2 * 10 ** (rmsDb / 20);
  const lead = Math.round(leadSilenceSec * rate);
  for (let i = lead; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

describe("BS.1770 measurement (round7-booth.md §5.3)", () => {
  it("a 1 kHz sine at −20 dBFS RMS reads −20 ±0.5 LUFS after K-weighting", () => {
    const l = integratedLoudness([sine(5, 1000, -20)], RATE);
    expect(Math.abs(l + 20)).toBeLessThan(0.5);
  });
  it("the same at 44.1 kHz (coefficients designed at the buffer's rate) and in stereo", () => {
    const s = sine(5, 1000, -20, 44100);
    expect(Math.abs(integratedLoudness([s], 44100) + 20)).toBeLessThan(0.5);
    // two identical channels sum: +3 dB (channel weights 1.0 each)
    expect(Math.abs(integratedLoudness([s, s], 44100) + 17)).toBeLessThan(0.6);
  });
  it("silence is −Infinity, never NaN", () => {
    const m = measurePcm([new Float32Array(RATE)], RATE);
    expect(m.lufs).toBe(Number.NEGATIVE_INFINITY);
    expect(m.peakDbFS).toBe(Number.NEGATIVE_INFINITY);
    expect(m.introSec).toBe(0);
    expect(Number.isNaN(m.truePeakDbTP)).toBe(false);
  });
  it("a track starting with 1.2 s of silence has introSec 0.9 (first loud 100 ms block − 0.3 s)", () => {
    expect(introSeconds([sine(4, 440, -20, RATE, 1.2)], RATE)).toBeCloseTo(0.9, 3);
    // never more than 3 s
    expect(introSeconds([sine(6, 440, -20, RATE, 5)], RATE)).toBe(3);
  });
  it("identical channels correlate 1; inverted channels −1; mono reports 1", () => {
    const s = sine(2, 440, -20);
    const inv = s.map((v) => -v);
    expect(channelCorrelation([s, s], RATE)).toBeCloseTo(1, 6);
    expect(channelCorrelation([s, inv], RATE)).toBeCloseTo(-1, 6);
    expect(channelCorrelation([s], RATE)).toBe(1);
  });
  it("sample peak: a −3 dBFS sine peaks at −3 dBFS", () => {
    const amp = 10 ** (-3 / 20);
    const s = new Float32Array(4800).map((_, i) => amp * Math.sin((2 * Math.PI * 100 * i) / RATE));
    expect(Math.abs(samplePeakDb([s]) + 3)).toBeLessThan(0.05);
  });
});
