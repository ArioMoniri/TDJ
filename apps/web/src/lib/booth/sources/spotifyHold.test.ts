import { describe, expect, it } from "vitest";
import { PauseWatch } from "./spotifyHold";

describe("PauseWatch (Spotify interrupted on its device)", () => {
  const at = (playing: boolean, positionSec: number) => ({ playing, positionSec, durationSec: 180 });

  it("a pause mid-song that lasts is an interruption, said once", () => {
    const w = new PauseWatch(2500);
    expect(w.observe(at(true, 60), 0)).toBe(false);
    expect(w.observe(at(false, 61), 1000)).toBe(false);
    expect(w.observe(at(false, 61), 3000)).toBe(false);
    expect(w.observe(at(false, 61), 3600)).toBe(true);
    expect(w.observe(at(false, 61), 9000)).toBe(false);
    // it plays again, then stops again: a new interruption
    expect(w.observe(at(true, 62), 10000)).toBe(false);
    expect(w.observe(at(false, 70), 11000)).toBe(false);
    expect(w.observe(at(false, 70), 14000)).toBe(true);
  });

  it("a buffering blip is not; the natural end is not; the first second is not", () => {
    const w = new PauseWatch(2500);
    expect(w.observe(at(false, 61), 0)).toBe(false);
    expect(w.observe(at(true, 61), 800)).toBe(false);
    expect(w.observe(at(false, 61), 1000)).toBe(false);
    expect(w.observe(at(false, 61), 2000)).toBe(false);
    const end = new PauseWatch(100);
    expect(end.observe(at(false, 178.5), 0)).toBe(false);
    expect(end.observe(at(false, 178.5), 500)).toBe(false);
    expect(end.observe(at(false, 0), 1000)).toBe(false);
    expect(end.observe(at(false, 0.5), 2000)).toBe(false);
  });
});
