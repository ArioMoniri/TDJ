import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_UNPLUGGED_BELOW,
  cancelPowerFrame,
  forgetPoll,
  frameBudget,
  frameDue,
  fromNative,
  idleAfter,
  NO_SIGNALS,
  type PowerSignals,
  pollEvery,
  powerFrame,
  resolveSaver,
  resyncPolls,
  SAVER_FRAME_MS,
  skipPoll,
  usePower,
} from "./power";

const sig = (p: Partial<PowerSignals> = {}): PowerSignals => ({ ...NO_SIGNALS, ...p });
const saving = (on: boolean) => usePower.setState({ active: on, reason: on ? "manual" : null });

describe("Battery saver — the mode resolver", () => {
  it("Off never saves, On always does, whatever the battery", () => {
    for (const s of [
      sig(),
      sig({ batteryLevel: 0.02, charging: false, lowPowerMode: true, thermal: "critical" }),
    ])
      expect(resolveSaver("off", s)).toEqual({ active: false, reason: null });
    expect(resolveSaver("on", sig({ batteryLevel: 1, charging: true }))).toEqual({
      active: true,
      reason: "manual",
    });
  });

  it("Auto: unplugged under 30 % saves; at 30 % or plugged in it does not", () => {
    expect(resolveSaver("auto", sig({ batteryLevel: 0.29, charging: false }))).toEqual({
      active: true,
      reason: "battery-unplugged",
    });
    expect(resolveSaver("auto", sig({ batteryLevel: AUTO_UNPLUGGED_BELOW, charging: false })).active).toBe(
      false,
    );
    expect(resolveSaver("auto", sig({ batteryLevel: 0.2, charging: true })).active).toBe(false);
    expect(resolveSaver("auto", sig({ batteryLevel: 0.8, charging: false })).active).toBe(false);
  });

  it("Auto: a low battery (≤ 10 %) saves even while charging", () => {
    expect(resolveSaver("auto", sig({ batteryLevel: 0.1, charging: true }))).toEqual({
      active: true,
      reason: "battery-low",
    });
    expect(resolveSaver("auto", sig({ batteryLevel: 0.11, charging: true })).active).toBe(false);
  });

  it("Auto: the OS's Low Power Mode and a serious / critical thermal state save, plugged in or not", () => {
    expect(resolveSaver("auto", sig({ lowPowerMode: true, batteryLevel: 0.9, charging: true }))).toEqual({
      active: true,
      reason: "low-power-mode",
    });
    expect(resolveSaver("auto", sig({ thermal: "serious" })).reason).toBe("thermal");
    expect(resolveSaver("auto", sig({ thermal: "critical" })).reason).toBe("thermal");
    expect(resolveSaver("auto", sig({ thermal: "fair" })).active).toBe(false);
    expect(resolveSaver("auto", sig({ lowPowerMode: false })).active).toBe(false);
  });

  it("Auto: Reduce Motion / Save Data are hints — on battery they save from 50 %; alone they do nothing", () => {
    expect(
      resolveSaver("auto", sig({ batteryLevel: 0.45, charging: false, reducedMotion: true })).active,
    ).toBe(true);
    expect(resolveSaver("auto", sig({ batteryLevel: 0.45, charging: false, saveData: true })).active).toBe(
      true,
    );
    expect(resolveSaver("auto", sig({ batteryLevel: 0.45, charging: false })).active).toBe(false);
    expect(
      resolveSaver("auto", sig({ batteryLevel: 0.45, charging: true, reducedMotion: true })).active,
    ).toBe(false);
    expect(resolveSaver("auto", sig({ reducedMotion: true, saveData: true })).active).toBe(false);
  });

  it("Auto without a battery reading (Safari, Firefox) follows the system alone; unknown charging never guesses", () => {
    expect(resolveSaver("auto", sig()).active).toBe(false);
    expect(resolveSaver("auto", sig({ batteryLevel: 0.2, charging: null })).active).toBe(false);
    expect(resolveSaver("auto", sig({ batteryLevel: Number.NaN, charging: false })).active).toBe(false);
  });

  it("the app's native reading: known fields only, levels in 0…1, thermal names only", () => {
    expect(
      fromNative({ lowPowerMode: true, thermal: "serious", batteryLevel: 0.42, charging: false }),
    ).toEqual({
      lowPowerMode: true,
      thermal: "serious",
      batteryLevel: 0.42,
      charging: false,
    });
    expect(fromNative({ thermal: "hot", batteryLevel: -1, charging: null })).toEqual({});
    expect(fromNative(null)).toEqual({});
  });

  it("the store resolves on every change of mode or signal", () => {
    const s = usePower.getState();
    s.setMode("auto");
    s.setSignals({ batteryLevel: 0.5, charging: false });
    expect(usePower.getState().active).toBe(false);
    s.setSignals({ batteryLevel: 0.25 });
    expect(usePower.getState()).toMatchObject({ active: true, reason: "battery-unplugged" });
    s.setSignals({ charging: true });
    expect(usePower.getState().active).toBe(false);
    s.setMode("on");
    expect(usePower.getState().active).toBe(true);
    s.setMode("off");
    s.setSignals({ lowPowerMode: true });
    expect(usePower.getState().active).toBe(false);
    s.setSignals(NO_SIGNALS);
  });
});

describe("Battery saver — the frame scheduler (4 fps budget)", () => {
  let frames = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    frames = 0;
    // a 60 Hz display: each rAF fires at the next 16.67 ms vsync
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const at = Math.ceil((Date.now() + 0.01) / (1000 / 60)) * (1000 / 60);
      return setTimeout(() => {
        frames++;
        cb(Date.now());
      }, at - Date.now()) as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    saving(false);
  });

  /** a loop like the Booth's tick: asks for the next frame first, then works within its own 33 ms budget */
  function run(ms: number) {
    let last = Number.NEGATIVE_INFINITY;
    let work = 0;
    const stamps: number[] = [];
    let id = 0;
    const tick = (now: number) => {
      id = powerFrame(tick);
      if (!frameDue(last, now, 33)) return;
      last = now;
      work++;
      stamps.push(now);
    };
    id = powerFrame(tick);
    vi.advanceTimersByTime(ms);
    cancelPowerFrame(id);
    return { work, stamps };
  }

  it("off: every display frame is a callback (60 / s) and the loop works at its own 30 fps", () => {
    saving(false);
    const r = run(10_000);
    expect(frames).toBeGreaterThanOrEqual(595);
    expect(r.work).toBeGreaterThanOrEqual(295);
    expect(r.work).toBeLessThanOrEqual(305);
  });

  it("saving: ≈ 4 callbacks a second, each one works, never closer than a frame under the budget", () => {
    saving(true);
    const r = run(10_000);
    expect(frames).toBeGreaterThanOrEqual(36);
    expect(frames).toBeLessThanOrEqual(42);
    expect(r.work).toBe(frames);
    const gaps = r.stamps.slice(1).map((t, i) => t - r.stamps[i]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(SAVER_FRAME_MS - 17);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(SAVER_FRAME_MS + 17);
  });

  it("the saver turning on mid-loop takes effect at the next frame; off again, back to every frame", () => {
    saving(false);
    let n = 0;
    let id = 0;
    const tick = () => {
      n++;
      id = powerFrame(tick);
    };
    id = powerFrame(tick);
    vi.advanceTimersByTime(1000);
    const off = n;
    saving(true);
    n = 0;
    vi.advanceTimersByTime(1000);
    const on = n;
    saving(false);
    n = 0;
    vi.advanceTimersByTime(1000);
    cancelPowerFrame(id);
    expect(off).toBeGreaterThanOrEqual(59);
    expect(on).toBeLessThanOrEqual(5);
    expect(n).toBeGreaterThanOrEqual(55);
  });

  it("cancel stops a pending saver frame at either stage (timer or rAF)", () => {
    saving(true);
    const cb = vi.fn();
    const a = powerFrame(cb);
    expect(a).toBeLessThan(0);
    cancelPowerFrame(a);
    const b = powerFrame(cb);
    vi.advanceTimersByTime(SAVER_FRAME_MS - 17); // the timer fired, the rAF is pending
    cancelPowerFrame(b);
    vi.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
  });

  it("budgets: the saver never makes a loop faster than its own budget", () => {
    expect(frameBudget(33, false)).toBe(33);
    expect(frameBudget(33, true)).toBe(SAVER_FRAME_MS);
    expect(frameBudget(1000, true)).toBe(1000);
    expect(pollEvery(1000, 10_000, false)).toBe(1000);
    expect(pollEvery(1000, 10_000, true)).toBe(10_000);
    expect(pollEvery(15_000, 10_000, true)).toBe(15_000);
  });
});

describe("Battery saver — gated polls", () => {
  afterEach(() => saving(false));

  it("off: a poll never skips", () => {
    saving(false);
    const k = {};
    for (let t = 0; t < 10_000; t += 1000) expect(skipPoll(k, 10_000, false, t)).toBe(false);
  });

  it("saving: one run per window; urgent runs always; focus / a poke re-syncs at once", () => {
    saving(true);
    const k = {};
    const ran = (t: number, urgent = false) => !skipPoll(k, 10_000, urgent, t);
    expect(ran(0)).toBe(true);
    expect(ran(1000)).toBe(false);
    expect(ran(9000)).toBe(false);
    expect(ran(10_000)).toBe(true);
    expect(ran(11_000, true)).toBe(true); // a start, a seek, the end of a track
    expect(ran(12_000)).toBe(false);
    resyncPolls(); // the tab came back
    expect(ran(12_500)).toBe(true);
    expect(ran(13_000)).toBe(false);
    forgetPoll(k); // the app came to the front (Spotify's poke)
    expect(ran(13_500)).toBe(true);
    // a minute of 1 s ticks: 6 runs instead of 60
    let runs = 0;
    for (let t = 30_000; t < 90_000; t += 1000) if (ran(t)) runs++;
    expect(runs).toBe(6);
  });

  it("idleAfter: only while saving, after a quiet spell, reset by each call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    saving(false);
    idleAfter("t", 1000, fn);
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    saving(true);
    idleAfter("t", 1000, fn);
    vi.advanceTimersByTime(900);
    idleAfter("t", 1000, fn);
    vi.advanceTimersByTime(900);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
