import { afterEach, describe, expect, it, vi } from "vitest";
import { ARM_MS, confirmArmed, disarm, guard, roomCut, setConfirmNeeded, useArm } from "./confirm";

describe("2026-11: the light confirmation (a mistaken tap never cuts the song)", () => {
  afterEach(() => {
    disarm();
    vi.useRealTimers();
  });
  it("no confirmation needed (before the night, the setting off): the first tap runs", () => {
    setConfirmNeeded(() => false);
    const run = vi.fn();
    expect(guard("next", run)).toBe("ran");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("mid-night the first tap arms, the second runs once; another control re-arms instead", () => {
    setConfirmNeeded(() => true);
    const run = vi.fn();
    expect(guard("next", run)).toBe("armed");
    expect(run).not.toHaveBeenCalled();
    expect(useArm.getState().armed?.key).toBe("next");
    expect(guard("prev", vi.fn())).toBe("armed");
    expect(useArm.getState().armed?.key).toBe("prev");
    expect(guard("next", run)).toBe("armed");
    expect(guard("next", run)).toBe("ran");
    expect(run).toHaveBeenCalledTimes(1);
    expect(useArm.getState().armed).toBeNull();
  });
  it("the arm lapses after 3 s; Enter confirms what is armed, Esc (disarm) cancels it", () => {
    vi.useFakeTimers();
    setConfirmNeeded(() => true);
    const run = vi.fn();
    guard("fade", run);
    vi.advanceTimersByTime(ARM_MS + 10);
    expect(useArm.getState().armed).toBeNull();
    expect(confirmArmed()).toBe(false);
    guard("fade", run);
    expect(confirmArmed()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    guard("fade", run);
    disarm();
    expect(confirmArmed()).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("QA: Space / m / the mini Pause mid-night — a cut asks (second press confirms), the way back never waits", () => {
    setConfirmNeeded(() => true);
    const pause = vi.fn();
    expect(roomCut("pause", true, pause)).toBe("armed");
    expect(pause).not.toHaveBeenCalled();
    expect(useArm.getState().armed?.key).toBe("pause");
    expect(roomCut("pause", true, pause)).toBe("ran");
    expect(pause).toHaveBeenCalledTimes(1);
    // resume / unmute: at once, and an arm left on the key is dropped (Enter must not cut the room afterwards)
    const mute = vi.fn();
    roomCut("mute", true, mute);
    const unmute = vi.fn();
    expect(roomCut("mute", false, unmute)).toBe("ran");
    expect(unmute).toHaveBeenCalledTimes(1);
    expect(confirmArmed()).toBe(false);
    expect(mute).not.toHaveBeenCalled();
    // before the night (no confirmation needed) a cut runs at once
    setConfirmNeeded(() => false);
    expect(roomCut("pause", true, pause)).toBe("ran");
    expect(pause).toHaveBeenCalledTimes(2);
  });
});
