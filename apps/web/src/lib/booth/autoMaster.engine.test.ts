import { describe, expect, it } from "vitest";
import { type AudioContextLike, BoothEngine, DUCK_DB } from "./engine";
import { dbToGain } from "./envelope";
import type { SourceAdapter } from "./sources/types";

/** the smallest context the engine's master needs (its gain's last target is what the room hears) */
function ctx() {
  const targets: number[] = [];
  const c = {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        setValueCurveAtTime() {},
        setTargetAtTime(v: number) {
          targets.push(v);
        },
        cancelScheduledValues() {},
      },
      connect() {},
      disconnect() {},
    }),
    createBufferSource: () => {
      throw new Error("unused");
    },
    createAnalyser: () => ({ fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData() {} }),
    resume: async () => {},
  } as unknown as AudioContextLike;
  return { c, targets };
}

describe("2026-11 Auto master in the engine's gain chain", () => {
  it("the boost adds to the master on the graph and on an external player; mute and talk still win", () => {
    const { c, targets } = ctx();
    const ext: number[] = [];
    const spotify = {
      kind: "spotify",
      external: { capabilities: { fade: true }, setMaster: (g: number) => ext.push(g) },
    } as unknown as SourceAdapter;
    const e = new BoothEngine(c, { adapters: [spotify] });
    e.setMaster(-6);
    e.setAutoDb(2);
    expect(targets.at(-1)).toBeCloseTo(dbToGain(-4), 6);
    expect(ext.at(-1)).toBeCloseTo(dbToGain(-4), 6);
    e.setDucked(true);
    expect(targets.at(-1)).toBeCloseTo(dbToGain(-4 + DUCK_DB), 6);
    e.setDucked(false);
    e.setMuted(true);
    expect(targets.at(-1)).toBe(0);
    e.setMuted(false);
    // the master's own +6 dB top is the ceiling of master + boost
    e.setMaster(5);
    e.setAutoDb(3);
    expect(targets.at(-1)).toBeCloseTo(dbToGain(6), 6);
    // never negative, never NaN
    e.setAutoDb(-3);
    expect(e.autoDb).toBe(0);
    e.setAutoDb(Number.NaN);
    expect(e.autoDb).toBe(0);
    // the snapshot keeps the DJ's master, not the boost
    expect(e.snapshot().master).toBe(5);
  });
});
