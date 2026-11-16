import { describe, expect, it } from "vitest";
import {
  continues,
  type ScopeRow,
  scopeIndexes,
  scopeStep,
  songScope,
  tandaScope,
  tapScope,
} from "./playScope";

// opening, tanda 1 (3 songs + cortina), tanda 2 (3 songs + cortina), tanda 3 (2 songs), closing
const night: ScopeRow[] = [
  { kind: "song" },
  { kind: "song", tanda: 0 },
  { kind: "song", tanda: 0 },
  { kind: "song", tanda: 0 },
  { kind: "cortina", tanda: 0 },
  { kind: "song", tanda: 1 },
  { kind: "song", tanda: 1 },
  { kind: "song", tanda: 1 },
  { kind: "cortina", tanda: 1 },
  { kind: "song", tanda: 2 },
  { kind: "song", tanda: 2 },
  { kind: "song" },
];

describe("what a play covers", () => {
  it("a plain tap: the row only, or on to the end of the night (cortinas included)", () => {
    expect(tapScope(night, 6, "only")).toMatchObject({ kind: "one", from: 6, to: 6, tanda: 1 });
    const on = tapScope(night, 6, "continue");
    expect(on).toMatchObject({ kind: "from", from: 6, to: 11 });
    expect(scopeIndexes(on, night.length).map((i) => night[i]!.kind)).toContain("cortina");
    expect(continues(tapScope(night, 6, "only"))).toBe(false);
    expect(continues(on)).toBe(true);
  });
  it("Play this tanda: its songs, not the cortina after it; Play from here to the end: on to the last row", () => {
    expect(tandaScope(night, 1, "tanda")).toEqual({ kind: "tanda", from: 5, to: 7, tanda: 1 });
    expect(tandaScope(night, 1, "from")).toEqual({ kind: "from", from: 5, to: 11, tanda: 1 });
    expect(tandaScope(night, 2, "tanda")).toEqual({ kind: "tanda", from: 9, to: 10, tanda: 2 });
    expect(tandaScope(night, 7, "tanda")).toBeNull();
  });
  it("Play this song / Play from here", () => {
    expect(songScope(night, 2, "one")).toMatchObject({ kind: "one", from: 2, to: 2 });
    expect(songScope(night, 2, "from")).toMatchObject({ kind: "from", from: 2, to: 11 });
  });
  it("Next / Previous stay inside the scope and stop cleanly at its end", () => {
    const tanda = tandaScope(night, 1, "tanda")!;
    expect(scopeStep(tanda, night.length, 5, 1)).toBe(6);
    expect(scopeStep(tanda, night.length, 7, 1)).toBeNull(); // the cortina after tanda 2 is not played
    expect(scopeStep(tanda, night.length, 5, -1)).toBeNull();
    const one = tapScope(night, 3, "only");
    expect(scopeStep(one, night.length, 3, 1)).toBeNull();
    const toEnd = tapScope(night, 9, "continue");
    expect(scopeStep(toEnd, night.length, 10, 1)).toBe(11);
    expect(scopeStep(toEnd, night.length, 11, 1)).toBeNull();
    // no scope: the whole list
    expect(scopeStep(null, night.length, 0, 1)).toBe(1);
  });
});
