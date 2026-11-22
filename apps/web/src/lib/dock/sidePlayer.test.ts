import { describe, expect, it } from "vitest";
import {
  COMPACT_H,
  DEFAULT_H,
  FULL_MIN,
  NAV_MIN,
  readSidePlayer,
  settleSidePlayer,
  sidePlayerFit,
} from "./sidePlayer";

describe("the sidebar's player height", () => {
  it("gives the chosen height when the window has room for it and the nav", () => {
    expect(sidePlayerFit(400, 900)).toEqual({ height: 400, mode: "full" });
  });
  it("never takes the nav's least room: a short window shrinks it, into the compact row", () => {
    const tall = sidePlayerFit(DEFAULT_H, 1000);
    expect(tall.mode).toBe("full");
    expect(tall.height).toBeLessThanOrEqual(1000 - NAV_MIN);
    const short = sidePlayerFit(DEFAULT_H, 300);
    expect(short.mode).toBe("compact");
    expect(short.height).toBeGreaterThanOrEqual(COMPACT_H);
  });
  it("is compact below the whole player's least height and whole from it", () => {
    expect(sidePlayerFit(FULL_MIN - 1, 2000).mode).toBe("compact");
    expect(sidePlayerFit(FULL_MIN, 2000).mode).toBe("full");
    expect(sidePlayerFit(0, 2000).height).toBe(COMPACT_H);
  });
  it("settles a let-go height below the whole player on the compact row", () => {
    expect(settleSidePlayer(FULL_MIN - 20)).toBe(COMPACT_H);
    expect(settleSidePlayer(FULL_MIN + 20.4)).toBe(FULL_MIN + 20);
  });
  it("reads what the device kept, or the default", () => {
    expect(readSidePlayer(null)).toBe(DEFAULT_H);
    expect(readSidePlayer("abc")).toBe(DEFAULT_H);
    expect(readSidePlayer("300")).toBe(300);
    expect(readSidePlayer("10")).toBe(COMPACT_H);
  });
});
