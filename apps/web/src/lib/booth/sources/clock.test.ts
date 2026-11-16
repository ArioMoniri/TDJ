import { describe, expect, it } from "vitest";
import { TrackClock } from "./clock";

/**
 * 2026-11 (the owner: "the slider and the song playing are not always synced"): an external player's position (Spotify
 * Connect, the Web Playback SDK, YouTube) is a local clock reconciled with the device's reports — each report stamped
 * at the middle of its request (half the round trip), small errors slewed over a second (no jumps), large ones snapped,
 * a pause snapped — so what the slider shows is what the device plays.
 */
function sim(o: { start: number; rate?: number; oneWayMs?: number }) {
  let t = 0;
  const clock = new TrackClock(() => t);
  /** the device's real position at time `ms` */
  const device = (ms: number) => o.start + ((o.rate ?? 1) * ms) / 1000;
  /** one poll: the device answers its position when the request reaches it; the answer arrives one way later */
  const poll = () => {
    const one = o.oneWayMs ?? 0;
    const sentAt = t;
    const progress = device(sentAt + one);
    t += 2 * one;
    clock.report(progress, true, (sentAt + t) / 2);
  };
  return {
    clock,
    device,
    poll,
    advance: (ms: number) => {
      t += ms;
    },
    now: () => t,
  };
}

describe("TrackClock: one position model for an external player", () => {
  it("runs on its own between reports", () => {
    const s = sim({ start: 10 });
    s.clock.set(10, true);
    s.advance(2500);
    expect(s.clock.read()).toBeCloseTo(12.5, 6);
  });

  it("a plan clock 0.8 s off with 150 ms of latency each way: < 0.3 s off after reconciliation, no jump", () => {
    const s = sim({ start: 30.8, oneWayMs: 150 });
    s.clock.set(30, true);
    let last = s.clock.read();
    for (let k = 0; k < 4; k++) {
      // read every 100 ms: the display moves forward smoothly, never a jump (≤ 0.1 s played + 0.1 s of slew)
      for (let j = 0; j < 10; j++) {
        s.advance(100);
        const v = s.clock.read();
        expect(v - last).toBeGreaterThan(0);
        expect(v - last).toBeLessThan(0.2);
        last = v;
      }
      s.poll();
      last = s.clock.read();
    }
    s.advance(1200);
    expect(Math.abs(s.clock.read() - s.device(s.now()))).toBeLessThan(0.3);
  });

  it("a device running 1 % fast stays within 0.3 s with a report every few seconds", () => {
    const s = sim({ start: 0, rate: 1.01, oneWayMs: 80 });
    s.clock.set(0, true);
    for (let k = 0; k < 20; k++) {
      s.advance(3000);
      s.poll();
    }
    s.advance(1200);
    expect(Math.abs(s.clock.read() - s.device(s.now()))).toBeLessThan(0.3);
  });

  it("a hidden tab (60 s, no reports, no ticks): read from the clock on return, corrected by the first report", () => {
    const s = sim({ start: 0, rate: 1.008, oneWayMs: 100 });
    s.clock.set(0, true);
    s.advance(60_000);
    // straight from the clock: the time passed, not the ticks counted
    expect(s.clock.read()).toBeCloseTo(60, 6);
    s.poll(); // visibilitychange: one report at once
    s.advance(1200);
    expect(Math.abs(s.clock.read() - s.device(s.now()))).toBeLessThan(0.3);
  });

  it("a big error (a seek on the device, a skip) snaps; a pause stops the clock where the device is", () => {
    const s = sim({ start: 0 });
    s.clock.set(0, true);
    s.advance(1000);
    s.clock.report(95, true, s.now());
    expect(s.clock.read()).toBeCloseTo(95, 6);
    s.clock.report(96, false, s.now());
    s.advance(5000);
    expect(s.clock.read()).toBeCloseTo(96, 6);
    expect(s.clock.playing).toBe(false);
  });

  it("noise under 0.1 s is ignored (the slider never wobbles)", () => {
    const s = sim({ start: 0 });
    s.clock.set(0, true);
    s.advance(1000);
    s.clock.report(1.06, true, s.now());
    expect(s.clock.read()).toBeCloseTo(1, 6);
  });
});
