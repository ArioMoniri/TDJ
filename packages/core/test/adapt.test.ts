/**
 * 2026-11 — live adaptation and floor learning (packages/core/src/adapt.ts, floor.ts; docs/MUSICALITY.md
 * "Succession"): after a tanda's floor reaction in the Booth the next unplayed tandas are weighed again and at most one
 * suggestion comes back (never applied by the engine); the reaction teaches the succession a small, capped nudge.
 * Written before the Booth reads them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ADAPT,
  adaptNext,
  compose,
  FLOOR_LEARN,
  floorLearningOn,
  floorLessons,
  floorMood,
  learnFromFloor,
  mergeLearned,
  type Playlist,
  setFloorLearning,
  stepKey,
  succession,
  successionSide,
  type Tanda,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let night: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  night = compose({ hours: 3, seed: 21 }, deps);
}, 600000);

const T = (orchestraId: string, energy: number, phase: Tanda["phase"] = "build") =>
  ({ orchestraId, energy, phase }) as Pick<Tanda, "orchestraId" | "energy" | "phase">;

describe("floor learning: one reaction is a nudge, inside caps", () => {
  const n = { tandas: [T("a", 60, "warmup"), T("b", 72, "build"), T("c", 70, "build")] };
  it("emptied lowers the pair into the tanda and its energy step; a changed tap replaces it; taking it back undoes it", () => {
    const L1 = learnFromFloor(undefined, n, "night-1", 1, "emptied", "2026-11-16T20:00:00Z");
    expect(L1.floor!.pairs["a>b"]).toBe(FLOOR_LEARN.pair.emptied);
    expect(L1.floor!.steps[stepKey(n.tandas[0]!, n.tandas[1]!)]).toBe(FLOOR_LEARN.step.emptied);
    expect(stepKey(n.tandas[0]!, n.tandas[1]!)).toBe("build|up");
    const L2 = learnFromFloor(L1, n, "night-1", 1, "full", "2026-11-16T20:01:00Z");
    expect(L2.floor!.pairs["a>b"]).toBe(FLOOR_LEARN.pair.full);
    const L3 = learnFromFloor(L2, n, "night-1", 1, null);
    expect(L3.floor!.pairs).toEqual({});
    expect(L3.floor!.steps).toEqual({});
    expect(L3.floor!.taps).toEqual({});
  });
  it("many nights saturate at the caps; the first tanda teaches no pair", () => {
    let L = learnFromFloor(undefined, n, "x", 0, "full");
    expect(L.floor!.pairs).toEqual({});
    for (let k = 0; k < 20; k++) L = learnFromFloor(L, n, `night-${k}`, 1, "full");
    expect(L.floor!.pairs["a>b"]).toBe(FLOOR_LEARN.pairMax);
    for (let k = 0; k < 40; k++) L = learnFromFloor(L, n, `night-e${k}`, 1, "emptied");
    expect(L.floor!.pairs["a>b"]).toBe(FLOOR_LEARN.pairMin);
    expect(Object.keys(L.floor!.taps).length).toBeLessThanOrEqual(FLOOR_LEARN.keep);
  });
  it("the switch: off keeps what was learned, learns nothing more and is not read", () => {
    const L1 = learnFromFloor(undefined, n, "n", 1, "full");
    const off = setFloorLearning(L1, false);
    expect(floorLearningOn(off)).toBe(false);
    expect(learnFromFloor(off, n, "n2", 1, "full").floor!.pairs).toEqual(L1.floor!.pairs);
    const a = { ...successionSide(night.tandas[0]!), orchestraId: "a" };
    const b = { ...successionSide(night.tandas[1]!), orchestraId: "b", phase: "build" };
    const on = succession(a, b, { learned: L1 }).parts.find((p) => p.kind === "learned");
    expect(on!.points).toBeGreaterThan(0);
    expect(on!.detail.floor).toBe(FLOOR_LEARN.pair.full);
    expect(succession(a, b, { learned: off }).parts.some((p) => p.kind === "learned")).toBe(false);
    expect(floorLearningOn(setFloorLearning(off, true))).toBe(true);
  });
  it("Settings → learning lists the lessons (pairs and steps); mergeLearned keeps the DJ's floor store", () => {
    const L = learnFromFloor(undefined, n, "n", 1, "emptied");
    expect(
      floorLessons(L)
        .map((x) => x.kind)
        .sort(),
    ).toEqual(["pair", "step"]);
    expect(mergeLearned({ sides: {}, families: {} }, L).floor).toEqual(L.floor);
  });
});

describe("live adaptation: after a floor reaction, one suggestion for the next tandas, never applied", () => {
  it("the reaction: the DJ's tap, else the room's hearts, else none", () => {
    expect(floorMood({ reaction: "emptied", hearts: 40 })).toBe("emptied");
    expect(floorMood({ hearts: ADAPT.heartsFull * 4 }, 4)).toBe("full");
    expect(floorMood({ hearts: 1 }, 4)).toBeNull();
    expect(floorMood({})).toBeNull();
    expect(adaptNext(night, 2, {}, deps)).toBeNull();
  });
  it("an emptied floor before a weak next tanda (cold and unknown) brings a better one: hotter, known, the night otherwise unchanged", () => {
    const i = night.tandas.findIndex(
      (_t, k) => k > 1 && !night.tandas[k + 1]?.peak && !night.tandas[k + 1]?.pinned,
    );
    const k = i + 1;
    // the next tanda as an experimental, cold pick
    const weak: Playlist = {
      ...night,
      tandas: night.tandas.map((t, j) =>
        j === k
          ? {
              ...t,
              energy: t.targetEnergy - 18,
              energyCurve: t.songs.map(() => t.targetEnergy - 18),
              songs: t.songs.map((s) => ({ ...s, fame: 0, energy: t.targetEnergy - 18 })),
            }
          : t,
      ),
    };
    const s = adaptNext(weak, i, { reaction: "emptied" }, deps, { seed: 3 });
    expect(s).not.toBeNull();
    expect(s!.index).toBeGreaterThan(i);
    expect(s!.index).toBeLessThanOrEqual(i + ADAPT.lookahead);
    expect(s!.gain).toBeGreaterThanOrEqual(ADAPT.margin.emptied);
    expect(s!.reaction).toBe("emptied");
    expect(s!.reasons.length).toBeGreaterThan(0);
    // only that chair changes; the night handed in is untouched (nothing applies the suggestion here)
    for (let j = 0; j < weak.tandas.length; j++)
      if (j !== s!.index)
        expect(s!.playlist.tandas[j]!.songs.map((x) => x.id)).toEqual(weak.tandas[j]!.songs.map((x) => x.id));
    expect(weak.tandas[k]!.energy).toBe(weak.tandas[k]!.targetEnergy - 18);
    if (s!.index === k) expect(s!.to.energy).toBeGreaterThan(weak.tandas[k]!.energy);
  });
  it("a full floor keeps the line: it needs the largest margin, so it suggests no more than an emptied one", () => {
    expect(ADAPT.margin.full).toBeGreaterThan(ADAPT.margin.ok);
    expect(ADAPT.margin.ok).toBeGreaterThan(ADAPT.margin.emptied);
    const full = adaptNext(night, 3, { reaction: "full" }, deps, { seed: 3 });
    if (full) expect(full.gain).toBeGreaterThanOrEqual(ADAPT.margin.full);
  });
  it("frozen (played, playing), pinned, locked, summit and última chairs are never suggested", () => {
    const frozenAll = Array.from({ length: night.tandas.length }, (_, k) => k);
    expect(adaptNext(night, 1, { reaction: "emptied" }, deps, { frozen: frozenAll })).toBeNull();
    const pinned: Playlist = {
      ...night,
      tandas: night.tandas.map((t) => ({ ...t, pinned: { by: "dj" as const }, locked: true })),
    };
    expect(adaptNext(pinned, 1, { reaction: "emptied" }, deps)).toBeNull();
    const last = night.tandas.length - 2;
    expect(adaptNext(night, last, { reaction: "emptied" }, deps)).toBeNull();
  });
  it("compose never runs it (the golden set is unaffected): compose.ts does not import adapt", () => {
    const src = readFileSync(join(findRoot(), "packages/core/src/compose.ts"), "utf8");
    expect(src).not.toMatch(/from "\.\/adapt"/);
  });
});
