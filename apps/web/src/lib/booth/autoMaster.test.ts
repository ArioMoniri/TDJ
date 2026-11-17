import { describe, expect, it } from "vitest";
import {
  AUTO_CEILING_DB,
  AUTO_MAX_RATE_DB_PER_SEC,
  AutoMaster,
  appliedBoost,
  autoConfig,
  autoHold,
  autoPath,
  calibrationOffset,
  powerSubDb,
  quantile,
  RoomEstimator,
} from "./autoMaster";

const ms = (db: number) => 10 ** (db / 10);
/** the microphone hears the speakers (out + coupling) plus the crowd, in power */
const mic = (outDb: number, couplingDb: number, noiseDb: number) =>
  ms(outDb + couplingDb) * (Number.isFinite(outDb) ? 1 : 0) + ms(noiseDb);
const out = (db: number) => (Number.isFinite(db) ? ms(db) : 0);

describe("2026-11 room meter: the crowd's noise apart from the music", () => {
  it("powerSub and quantile", () => {
    expect(powerSubDb(-10, -13.0103)).toBeCloseTo(-13.0103, 2);
    expect(powerSubDb(-10, -10)).toBe(Number.NEGATIVE_INFINITY);
    expect(quantile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
  });

  it("between songs (silence at the output) the microphone hears the room alone", () => {
    const r = new RoomEstimator();
    let last = r.push(0, ms(-50), 0);
    for (let t = 0.1; t < 5; t += 0.1) last = r.push(t, ms(-50), 0);
    expect(last.noiseDb).toBeCloseTo(-50, 1);
  });

  it("with music: learns the coupling and reads the crowd under it (music −20 LUFS, coupling −15, crowd −45)", () => {
    const r = new RoomEstimator();
    let last = r.push(0, mic(-20, -15, -60), out(-20));
    // a quiet room first (the coupling's floor), then the crowd arrives; the music's level moves (dynamics)
    for (let t = 0.1; t < 60; t += 0.1) {
      const o = -20 + 6 * Math.sin(t / 3);
      last = r.push(t, mic(o, -15, -60), out(o));
    }
    expect(last.couplingDb).toBeCloseTo(-15, 0);
    for (let t = 60; t < 180; t += 0.1) {
      const o = -20 + 6 * Math.sin(t / 3);
      last = r.push(t, mic(o, -15, -45), out(o));
    }
    expect(Math.abs((last.noiseDb ?? 0) - -45)).toBeLessThan(1.5);
  });

  it("the master's own level never runs Auto master away: a quiet room keeps the boost at 0 (closed loop)", () => {
    const r = new RoomEstimator();
    const a = new AutoMaster({ maxBoostDb: 6, rateDbPerSec: 0.5 });
    a.enable();
    let boost = 0;
    let maxBoost = 0;
    for (let t = 0; t < 600; t += 0.1) {
      // the music's short-term level moves ±4 dB; a 2.5 s gap every 30 s; the crowd stays at −60
      const o = t % 30 < 2.5 ? Number.NEGATIVE_INFINITY : -20 + boost + 4 * Math.sin(t / 2);
      const rd = r.push(t, mic(o, -15, -60), out(o));
      boost = a.step(0.1, {
        noiseDb: rd.noiseDb,
        hold: Number.isFinite(o) ? null : "gap",
        masterDb: 0,
        outPeakDb: -6,
      });
      maxBoost = Math.max(maxBoost, boost);
    }
    expect(maxBoost).toBeLessThan(1);
  });

  it("a crowd that arrives during the night lifts the boost, and it stays up while the crowd does", () => {
    const r = new RoomEstimator();
    const a = new AutoMaster({ maxBoostDb: 3, rateDbPerSec: 0.5 });
    a.enable();
    let boost = 0;
    const noiseAt = (t: number) => (t < 120 ? -65 : -35);
    let at300 = 0;
    for (let t = 0; t < 900; t += 0.1) {
      const o = t % 30 < 2.5 ? Number.NEGATIVE_INFINITY : -20 + boost + 4 * Math.sin(t / 2);
      const rd = r.push(t, mic(o, -15, noiseAt(t)), out(o));
      boost = a.step(0.1, {
        noiseDb: rd.noiseDb,
        hold: Number.isFinite(o) ? null : "gap",
        masterDb: 0,
        outPeakDb: -6,
      });
      if (Math.abs(t - 300) < 0.05) at300 = boost;
    }
    expect(at300).toBeCloseTo(3, 1);
    expect(boost).toBeCloseTo(3, 1);
  });

  it("an unknown output (a Connect device) never guesses: only gaps teach the noise", () => {
    const r = new RoomEstimator();
    let last = r.push(0, ms(-30), null);
    for (let t = 0.1; t < 20; t += 0.1) last = r.push(t, ms(-30), null);
    expect(last.noiseDb).toBeNull();
    // the engine knows the gap between two tracks: the output is silent there (0), the room alone
    for (let t = 20; t < 22.5; t += 0.1) last = r.push(t, ms(-48), 0);
    expect(last.noiseDb).toBeCloseTo(-48, 0);
  });
});

/**
 * The browser as it is: the microphone hears the speakers a moment late (`lag`), its 43 ms frame and the output's
 * last rAF frame are not the same instant, and the clips carry a 4 Hz tremolo — the estimate under the music then
 * sits well above the room (the subtraction's error). Returns the top boost and the baseline Auto master kept.
 */
function night(o: { songSec: number; musicDb: number; crowdDb: number; lag: number; secs?: number }) {
  const out = (t: number) =>
    t % (o.songSec + 2.5) > o.songSec
      ? Number.NEGATIVE_INFINITY
      : o.musicDb + 6 * Math.sin(2 * Math.PI * 4 * t);
  const p = (t: number) => (Number.isFinite(out(t)) ? ms(out(t)) : 0);
  const win = (a: number, b: number) => {
    let s = 0;
    for (let i = 0; i < 20; i++) s += p(a + ((b - a) * (i + 0.5)) / 20);
    return s / 20;
  };
  const r = new RoomEstimator();
  const a = new AutoMaster();
  let boost = 0;
  let top = 0;
  for (let t = 0; t < (o.secs ?? 600); t += 0.1) {
    if (Math.abs(t - 15) < 0.05) a.enable();
    const g = ms(boost);
    const micMs = win(t - o.lag - 0.043, t - o.lag) * g * ms(-15) + ms(t < 30 ? -80 : o.crowdDb);
    const f = Math.floor(t / 0.0333) * 0.0333;
    const outMs = win(f - 0.043, f) * g;
    const rd = r.push(t, micMs, outMs);
    boost = a.step(0.1, {
      noiseDb: rd.room?.db ?? null,
      noiseKind: rd.room?.kind,
      hold: outMs > 1e-5 ? null : "gap",
      masterDb: 0,
      outPeakDb: -6,
    });
    top = Math.max(top, boost);
  }
  return { top, baseline: a.baseline };
}

describe("2026-11 Auto master: a reading against a baseline of its own kind (a gap's, or the music's estimate)", () => {
  it("the crowd 45 dB louder lifts the boost although the estimate under the music read near it (e2e: 0 dB on CI)", () => {
    for (const lag of [0.05, 0.12, 0.25]) {
      // clips of 8 s and 2.5 s gaps; the music loud at the microphone (its estimate of the room near −40)
      const r = night({ songSec: 8, musicDb: -10, crowdDb: -36, lag, secs: 120 });
      expect(r.top, `lag ${lag}`).toBeGreaterThanOrEqual(2.5);
      // the baseline is the room as a gap heard it when Auto master started (the fake room's −80 dB)
      expect(r.baseline!, `lag ${lag}`).toBeLessThan(-75);
    }
  });
  it("a quiet room never lifts it: 3-minute songs, the estimate under the music far above the room's gaps", () => {
    // (a 250 ms lag drifts the music's estimate by itself, before and after this change: not judged here)
    for (const lag of [0.05, 0.12])
      expect(night({ songSec: 190, musicDb: -10, crowdDb: -80, lag }).top, `lag ${lag}`).toBeLessThan(1);
  });
});

describe("2026-11 Auto master: slow, bounded, held during cortinas and talk", () => {
  const live = { hold: null, masterDb: 0, outPeakDb: -6 } as const;

  it("off by default and does nothing until enabled", () => {
    const a = new AutoMaster();
    expect(a.enabled).toBe(false);
    for (let i = 0; i < 100; i++) a.step(0.1, { ...live, noiseDb: -30 });
    expect(a.db).toBe(0);
  });

  it("the crowd 6 dB louder: +3 dB (half the rise), never faster than the rate, never more than the max", () => {
    const a = new AutoMaster({ maxBoostDb: 3, rateDbPerSec: 0.5 });
    a.enable();
    a.step(0.1, { ...live, noiseDb: -50 }); // baseline
    let prev = a.db;
    let maxStep = 0;
    for (let i = 0; i < 400; i++) {
      a.step(0.1, { ...live, noiseDb: -44 });
      maxStep = Math.max(maxStep, Math.abs(a.db - prev));
      prev = a.db;
    }
    expect(a.db).toBeCloseTo(3, 5);
    expect(maxStep).toBeLessThanOrEqual(AUTO_MAX_RATE_DB_PER_SEC * 0.1 + 1e-9);
    // a much louder room stays at the DJ's maximum
    for (let i = 0; i < 400; i++) a.step(0.1, { ...live, noiseDb: -20 });
    expect(a.db).toBeCloseTo(3, 5);
    // and back down when the room quietens
    for (let i = 0; i < 400; i++) a.step(0.1, { ...live, noiseDb: -50 });
    expect(a.db).toBe(0);
  });

  it("the rate can never be set above 0.5 dB/s, and a long tick (a hidden tab) moves at most 0.5 dB", () => {
    expect(autoConfig({ rateDbPerSec: 5 }).rateDbPerSec).toBe(AUTO_MAX_RATE_DB_PER_SEC);
    const a = new AutoMaster({ rateDbPerSec: 5, maxBoostDb: 6 });
    a.enable();
    a.step(0.1, { ...live, noiseDb: -50 });
    a.step(30, { ...live, noiseDb: -30 });
    expect(a.db).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("small wobbles under 1 dB of target do not move it (no hunting)", () => {
    const a = new AutoMaster();
    a.enable();
    a.step(0.1, { ...live, noiseDb: -50 });
    for (let i = 0; i < 200; i++) a.step(0.1, { ...live, noiseDb: -50 + (i % 2 ? 1.5 : -1.5) });
    expect(a.db).toBe(0);
  });

  it("holds still during a cortina, talk-over, mute, pause and gaps", () => {
    const a = new AutoMaster({ maxBoostDb: 3, rateDbPerSec: 0.5 });
    a.enable();
    a.step(0.1, { ...live, noiseDb: -50 });
    for (const hold of ["cortina", "talk", "muted", "paused", "gap"] as const) {
      for (let i = 0; i < 50; i++) a.step(0.1, { ...live, hold, noiseDb: -40 });
      expect(a.db, hold).toBe(0);
    }
    expect(
      autoHold({ state: "cortina", ducked: false, muted: false, sounding: true, itemKind: "cortina" }),
    ).toBe("cortina");
    expect(autoHold({ state: "playing", ducked: true, muted: false, sounding: true })).toBe("talk");
    expect(autoHold({ state: "playing", ducked: false, muted: false, sounding: false })).toBe("gap");
    expect(autoHold({ state: "playing", ducked: false, muted: false, sounding: true })).toBeNull();
  });

  it("never above the safety ceiling: master + boost ≤ +6 dB", () => {
    const a = new AutoMaster({ maxBoostDb: 6, rateDbPerSec: 0.5 });
    a.enable();
    a.step(0.1, { ...live, masterDb: 4, noiseDb: -60 });
    for (let i = 0; i < 600; i++) a.step(0.1, { ...live, masterDb: 4, noiseDb: -30 });
    expect(a.db + 4).toBeLessThanOrEqual(AUTO_CEILING_DB);
  });

  it("never pushes the output into clipping: no rise at −1 dBFS peaks, backs off near full scale", () => {
    const a = new AutoMaster({ maxBoostDb: 3, rateDbPerSec: 0.5 });
    a.enable();
    a.step(0.1, { ...live, noiseDb: -50 });
    for (let i = 0; i < 20; i++) a.step(0.1, { ...live, noiseDb: -40 });
    const at = a.db;
    expect(at).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) a.step(0.1, { ...live, outPeakDb: -0.8, noiseDb: -40 });
    expect(a.db).toBeCloseTo(at, 9);
    for (let i = 0; i < 20; i++) a.step(0.1, { ...live, outPeakDb: -0.1, noiseDb: -40 });
    expect(a.db).toBeLessThan(at);
  });

  it("stop ramps the boost back to 0 at the rate (no jump); moving the master re-learns the room", () => {
    const a = new AutoMaster({ maxBoostDb: 3, rateDbPerSec: 0.5 });
    a.enable();
    a.step(0.1, { ...live, noiseDb: -50 });
    for (let i = 0; i < 200; i++) a.step(0.1, { ...live, noiseDb: -44 });
    a.disable();
    const before = a.db;
    a.step(0.1, { ...live, noiseDb: -44 });
    expect(before - a.db).toBeCloseTo(0.05, 5);
    for (let i = 0; i < 100; i++) a.step(0.1, { ...live, noiseDb: -44 });
    expect(a.db).toBe(0);
    a.enable();
    a.step(0.1, { ...live, noiseDb: -44 });
    expect(a.baseline).toBe(-44);
    a.rebase();
    a.step(0.1, { ...live, noiseDb: -40 });
    expect(a.baseline).toBe(-40);
  });
});

describe("2026-11 Auto master: where it can act", () => {
  it("files / clips on the graph, the Spotify SDK by its volume, Connect in whole dB, none without volume", () => {
    expect(autoPath("file", { volume: true, gain: true })).toBe("graph");
    expect(autoPath("spotify", { volume: true, gain: true })).toBe("sdk");
    expect(autoPath("spotify", { volume: true, gain: false })).toBe("connect");
    expect(autoPath("spotify", { volume: false, gain: false })).toBe("none");
    expect(appliedBoost(1.4, "connect")).toBe(1);
    expect(appliedBoost(1.6, "connect")).toBe(2);
    expect(appliedBoost(1.234, "graph")).toBe(1.23);
    expect(appliedBoost(2, "none")).toBe(0);
  });
  it("calibration: the offset to a phone SPL app's value", () => {
    expect(calibrationOffset(78, -32.44)).toBe(110.4);
    expect(calibrationOffset(78, Number.NEGATIVE_INFINITY)).toBeNull();
  });
});
