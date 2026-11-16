/**
 * 2026-11 (the owner: "some songs play a lot of silent moments; those should be counted as the gap"): the silent
 * head and tail of a decoded side. An RMS gate relative to the side's loudness (−50 dBFS, or 40 dB under its
 * integrated level when that is lower) with a 200 ms hold: a crackle in the lead-in is not the music's start, and a
 * quiet passage (or a coda with breaths between its notes) is music, never silence.
 */
import { describe, expect, it } from "vitest";
import { measurePcm, SILENCE_HOLD_SEC, silenceBounds, silenceThresholdDb } from "./loudness";

const RATE = 48000;
/** Segments of [seconds, rms dBFS | null (digital silence)] → one mono channel of a 220 Hz tone. */
function build(segs: Array<[number, number | null]>, rate = RATE): Float32Array {
  const n = Math.round(segs.reduce((a, [s]) => a + s, 0) * rate);
  const out = new Float32Array(n);
  let i = 0;
  for (const [sec, db] of segs) {
    const len = Math.round(sec * rate);
    if (db !== null) {
      const amp = Math.SQRT2 * 10 ** (db / 20);
      for (let k = 0; k < len; k++) out[i + k] = amp * Math.sin((2 * Math.PI * 220 * (i + k)) / rate);
    }
    i += len;
  }
  return out;
}

describe("silenceBounds: the silent head and tail of a side", () => {
  it("1.5 s of silence, 6 s of music, 2.5 s of silence → head 1.5, tail 2.5 (±20 ms)", () => {
    const ch = build([
      [1.5, null],
      [6, -20],
      [2.5, null],
    ]);
    const b = silenceBounds([ch], RATE);
    expect(Math.abs(b.headSec - 1.5)).toBeLessThan(0.02);
    expect(Math.abs(b.tailSec - 2.5)).toBeLessThan(0.02);
  });
  it("music to both edges has no silence; a silent buffer is never trimmed (0 / 0)", () => {
    const b = silenceBounds([build([[5, -18]])], RATE);
    expect(b.headSec).toBeLessThan(0.02);
    expect(b.tailSec).toBeLessThan(0.02);
    expect(silenceBounds([new Float32Array(RATE * 3)], RATE)).toEqual({ headSec: 0, tailSec: 0 });
  });
  it("a quiet passage in the middle, and a quiet coda before the tail, are music (not cut)", () => {
    const ch = build([
      [3, -20],
      [2, -42], // a pianissimo passage
      [3, -20],
      [2, -45], // a quiet coda
      [1.5, null],
    ]);
    const b = silenceBounds([ch], RATE);
    expect(b.headSec).toBeLessThan(0.02);
    expect(Math.abs(b.tailSec - 1.5)).toBeLessThan(0.02);
  });
  it("the last notes with short breaths between them (under the 200 ms hold) still count as music", () => {
    const ch = build([
      [4, -20],
      [0.15, -30],
      [0.15, null],
      [0.15, -30],
      [0.15, null],
      [0.15, -30],
      [2, null],
    ]);
    const b = silenceBounds([ch], RATE);
    expect(Math.abs(b.tailSec - 2)).toBeLessThan(0.02);
    expect(SILENCE_HOLD_SEC).toBe(0.2);
  });
  it("a crackle in the silent lead-in (shorter than the hold) is not the music's start", () => {
    const ch = build([
      [1, null],
      [0.01, -10],
      [1, null],
      [5, -20],
      [1, null],
    ]);
    const b = silenceBounds([ch], RATE);
    expect(Math.abs(b.headSec - 2.01)).toBeLessThan(0.02);
    expect(Math.abs(b.tailSec - 1)).toBeLessThan(0.02);
  });
  it("surface noise under the gate counts as silence; the gate follows the side's loudness", () => {
    // −62 dBFS hiss after a −16 dBFS side: under the gate (min(−50, −16 − 40) ≈ −56)
    const ch = build([
      [5, -16],
      [2, -62],
    ]);
    const b = silenceBounds([ch], RATE);
    expect(Math.abs(b.tailSec - 2)).toBeLessThan(0.02);
    expect(silenceThresholdDb(-16)).toBe(-56);
    expect(silenceThresholdDb(-8)).toBe(-50);
    expect(silenceThresholdDb(Number.NEGATIVE_INFINITY)).toBe(-50);
    // a very quiet side keeps its quiet ending: the gate drops with it
    const quiet = build([
      [5, -34],
      [2, -58],
      [1, null],
    ]);
    expect(Math.abs(silenceBounds([quiet], RATE).tailSec - 1)).toBeLessThan(0.02);
  });
  it("stereo: a sound on either channel is sound", () => {
    const l = build([
      [1, null],
      [4, -20],
      [2, null],
    ]);
    const r = build([
      [0.5, null],
      [4.5, -20],
      [2, null],
    ]);
    expect(Math.abs(silenceBounds([l, r], RATE).headSec - 0.5)).toBeLessThan(0.02);
  });
  it("measurePcm carries headSilenceSec / tailSilenceSec with the loudness", () => {
    const m = measurePcm(
      [
        build([
          [1, null],
          [5, -20],
          [3, null],
        ]),
      ],
      RATE,
    );
    expect(Math.abs(m.headSilenceSec - 1)).toBeLessThan(0.02);
    expect(Math.abs(m.tailSilenceSec - 3)).toBeLessThan(0.02);
  });
});
