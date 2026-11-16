import { describe, expect, it } from "vitest";
import {
  CLIP_HOLD_SEC,
  dbFromAmp,
  frameStats,
  K_HIGHPASS,
  K_SHELF,
  LevelMeter,
  lufsFromMs,
  normalisationPath,
  PEAK_FALL_DB_PER_SEC,
  PEAK_HOLD_SEC,
  songLoudness,
  webAudioBiquad,
} from "./level";
import { integratedLoudness, kWeight } from "./loudness";

const FS = 48000;
const sine = (freq: number, amp: number, sec: number, fs = FS) => {
  const x = new Float32Array(Math.round(sec * fs));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return x;
};
function biquad(x: Float32Array, c: ReturnType<typeof webAudioBiquad>): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i]! + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = v;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
  }
  return y;
}
const msTail = (x: Float32Array, from: number) => {
  let s = 0;
  for (let i = from; i < x.length; i++) s += x[i]! * x[i]!;
  return s / (x.length - from);
};
/** the live meter's K-weighting: the browser's two biquads */
const liveK = (x: Float32Array) =>
  biquad(biquad(x, webAudioBiquad(K_SHELF, FS)), webAudioBiquad(K_HIGHPASS, FS));

describe("2026-11 level meter: the live K-weighting matches BS.1770", () => {
  it("the browser's highshelf + highpass are within 0.1 dB of the ITU K filter from 20 Hz to 16 kHz", () => {
    for (const f of [20, 40, 100, 300, 1000, 2000, 3000, 5000, 10000, 16000]) {
      const x = sine(f, 0.5, 1);
      const skip = Math.round(0.5 * FS); // settle
      const live = 10 * Math.log10(msTail(liveK(x), skip));
      const itu = 10 * Math.log10(msTail(kWeight(x, FS), skip));
      expect(Math.abs(live - itu), `${f} Hz`).toBeLessThan(0.1);
    }
  });

  it("a 1 kHz sine at −20 dBFS RMS reads −20 ±0.3 LUFS short-term on the live meter (mono)", () => {
    const amp = 10 ** (-20 / 20) * Math.SQRT2;
    const k = liveK(sine(1000, amp, 4));
    const m = new LevelMeter();
    const frame = 2048;
    let r = m.push({ t: 0, peak: 0, msK: 0 });
    for (let s = FS; s + frame <= k.length; s += 1600) {
      const raw = frameStats(k.subarray(s, s + frame));
      r = m.push({ t: s / FS, peak: amp, msK: raw.ms });
    }
    expect(Math.abs(r.shortTermLufs - -20)).toBeLessThan(0.3);
    expect(Math.abs(r.momentaryLufs - -20)).toBeLessThan(0.3);
    // and the integrated loudness of the same signal agrees (the offline path that normalises every side)
    expect(Math.abs(integratedLoudness([sine(1000, amp, 4)], FS) - -20)).toBeLessThan(0.3);
  });

  it("stereo: identical channels sum to +3 dB (BS.1770 channel weights 1.0)", () => {
    const one = lufsFromMs(0.01);
    expect(lufsFromMs(0.02) - one).toBeCloseTo(3.01, 2);
  });

  it("pink-ish noise at two levels reads 10 dB apart (the meter is linear in dB)", () => {
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    const noise = new Float32Array(FS * 4).map(() => rnd() * 0.5);
    const quiet = noise.map((v) => v * 10 ** (-10 / 20));
    const read = (x: Float32Array) => {
      const k = liveK(x);
      const m = new LevelMeter();
      let r = m.push({ t: 0, peak: 0, msK: 0 });
      for (let s = 0; s + 2048 <= k.length; s += 1600)
        r = m.push({ t: s / FS, peak: 0.25, msK: frameStats(k.subarray(s, s + 2048)).ms });
      return r.shortTermLufs;
    };
    expect(read(noise) - read(quiet)).toBeCloseTo(10, 1);
  });
});

describe("2026-11 level meter: ballistics, hold, clip", () => {
  it("frameStats: a −6 dBFS sine peaks at −6 dBFS with mean square A²/2", () => {
    const a = 10 ** (-6 / 20);
    const s = frameStats(sine(1000, a, 0.1));
    expect(dbFromAmp(s.peak)).toBeCloseTo(-6, 1);
    expect(s.ms).toBeCloseTo((a * a) / 2, 3);
  });

  it("the bar rises at once and falls at 20 dB/s; the tick holds 1.5 s first", () => {
    const m = new LevelMeter();
    m.push({ t: 0, peak: 10 ** (-6 / 20), msK: 0.1 });
    const after = m.push({ t: 0.5, peak: 10 ** (-40 / 20), msK: 0.0001 });
    expect(after.peakDb).toBeCloseTo(-6 - PEAK_FALL_DB_PER_SEC * 0.5, 5);
    expect(after.holdDb).toBeCloseTo(-6, 5);
    let r = after;
    for (let t = 0.6; t <= PEAK_HOLD_SEC + 1; t += 0.1)
      r = m.push({ t, peak: 10 ** (-40 / 20), msK: 0.0001 });
    expect(r.holdDb).toBeLessThan(-6);
    expect(r.peakDb).toBeCloseTo(-40, 5);
  });

  it("a frame at full scale lights the clip indicator for 5 s; a tap clears it", () => {
    const m = new LevelMeter();
    expect(m.push({ t: 0, peak: 0.5, msK: 0.1 }).clip).toBe(false);
    expect(m.push({ t: 0.1, peak: 1, msK: 0.1 }).clip).toBe(true);
    expect(m.push({ t: 0.1 + CLIP_HOLD_SEC - 0.1, peak: 0.5, msK: 0.1 }).clip).toBe(true);
    expect(m.push({ t: 0.2 + CLIP_HOLD_SEC, peak: 0.5, msK: 0.1 }).clip).toBe(false);
    m.push({ t: 10, peak: 1, msK: 0.1 });
    m.clearClip();
    expect(m.read(10.1).clip).toBe(false);
  });

  it("silence reads −Infinity, never NaN", () => {
    const m = new LevelMeter();
    const r = m.push({ t: 0, peak: 0, msK: 0 });
    expect(r.shortTermLufs).toBe(Number.NEGATIVE_INFINITY);
    expect(r.peakDb).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(r.momentaryLufs)).toBe(false);
  });
});

describe("2026-11 song loudness and the normalisation path", () => {
  it("a measurement wins, then the cache, then the catalogue; nothing → null", () => {
    expect(songLoudness({ measured: { lufs: -14 }, measuredFrom: "clip", catalogueDb: -20 })).toEqual({
      lufs: -14,
      from: "clip",
    });
    expect(songLoudness({ cached: { lufs: -17, from: "file" }, catalogueDb: -20 })).toEqual({
      lufs: -17,
      from: "file",
    });
    expect(songLoudness({ catalogueDb: -20 })).toEqual({ lufs: -20, from: "catalogue" });
    expect(songLoudness({ measured: { lufs: Number.NEGATIVE_INFINITY }, measuredFrom: "file" })).toBeNull();
  });

  it("files and clips use the graph; Spotify's SDK the player gain; Spotify Connect its own normalisation", () => {
    expect(normalisationPath("file", { gain: true })).toBe("graph");
    expect(normalisationPath("preview", { gain: false })).toBe("graph");
    expect(normalisationPath("spotify", { gain: true })).toBe("sdk");
    expect(normalisationPath("spotify", { gain: false })).toBe("spotify");
    expect(normalisationPath("youtube", { gain: false })).toBe("none");
  });
});
