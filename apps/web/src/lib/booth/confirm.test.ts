import { afterEach, describe, expect, it, vi } from "vitest";
import { ARM_MS, confirmArmed, disarm, guard, setConfirmNeeded, useArm } from "./confirm";

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
});
