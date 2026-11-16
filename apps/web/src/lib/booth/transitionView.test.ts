import { resolveTransition, type TransitionEdit } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { dragHandle, eqLanes, transitionWindow } from "./transition";
import {
  CURVE_ORDER,
  curveFromLevel,
  editorEdges,
  estimatedLevel,
  firstBeatSec,
  rulerTicks,
  viewSpan,
} from "./transitionView";

/**
 * 2026-11 — the finished transition editor (TransitionSheet.tsx): the pure parts of what it draws — the time ruler,
 * the zoomed view, the handles each lane offers per preset, the estimated shape of a side the browser cannot hear
 * (Spotify), the first beat of a decoded side, the curve a dragged bend picks, and the three-band EQ hand-over.
 */
const side = (kind: "track" | "cortina" | "closing", lengthSec = 180) => ({ kind, lengthSec, tanda: 1 });
const win = (e: TransitionEdit) =>
  transitionWindow(resolveTransition(e, { from: side("track"), to: { ...side("track"), tanda: 2 } }), {
    outLen: 180,
    inLen: 170,
  });

describe("the ruler", () => {
  it("ticks at a readable step (≥ 44 px apart), labelled relative to the transition, 0 included", () => {
    const t = rulerTicks(-8, 6, 600);
    const major = t.filter((x) => x.label);
    expect(major.map((x) => x.t)).toContain(0);
    const step = major[1]!.t - major[0]!.t;
    expect((step / 14) * 600).toBeGreaterThanOrEqual(44);
    expect(major.find((x) => x.t === 0)!.label).toBe("0");
    expect(major.find((x) => x.t < 0)!.label).toMatch(/^−\d/);
    expect(major.find((x) => x.t > 0)!.label).toMatch(/^\+\d/);
    // zoomed out a wider step
    const wide = rulerTicks(-40, 30, 400).filter((x) => x.label);
    expect(wide[1]!.t - wide[0]!.t).toBeGreaterThan(step);
  });
});

describe("the view (zoom)", () => {
  it("fits the transition with a lead on each side; zooming in halves the span, out doubles it, within limits", () => {
    const p = { start: -6, end: 2 };
    const v0 = viewSpan(p, 0);
    expect(v0.start).toBeLessThan(-6);
    expect(v0.end).toBeGreaterThan(2);
    const span0 = v0.end - v0.start;
    const v1 = viewSpan(p, 1);
    expect(v1.end - v1.start).toBeCloseTo(span0 / 2, 6);
    expect(viewSpan(p, -1).end - viewSpan(p, -1).start).toBeCloseTo(span0 * 2, 6);
    expect(viewSpan(p, 9).end - viewSpan(p, 9).start).toBeGreaterThanOrEqual(3);
    expect(viewSpan(p, -9).end - viewSpan(p, -9).start).toBeLessThanOrEqual(64);
    // the transition's middle stays centred
    expect((v1.start + v1.end) / 2).toBeCloseTo(-2, 6);
  });
});

describe("the handles each preset offers, per lane", () => {
  it("a blend: the overlap's start on both lanes, the outgoing's fade end, the incoming's rise end", () => {
    const e = editorEdges("blend");
    expect(e.map((x) => `${x.which}:${x.lane}`)).toEqual(["start:both", "outEnd:out", "inEnd:in"]);
  });
  it("a fade: the fade out's start, where the incoming comes in (the gap), its rise end", () => {
    expect(editorEdges("fade").map((x) => x.which)).toEqual(["start", "gap", "end"]);
  });
  it("a gap: only where the incoming comes in; a rise: the overlap and the rise end", () => {
    expect(editorEdges("gap").map((x) => x.which)).toEqual(["gap"]);
    expect(editorEdges("rise").map((x) => x.which)).toEqual(["start", "inEnd"]);
    expect(editorEdges("cortinaCut").map((x) => x.which)).toEqual(["start", "gap"]);
  });
  it("a blend's two fade ends move on their own", () => {
    const e: TransitionEdit = { preset: "blend", overlapSec: 8, fadeOutSec: 8, fadeInSec: 8 };
    expect(dragHandle(e, "outEnd", -3)).toMatchObject({ fadeOutSec: 5, fadeInSec: 8 });
    expect(dragHandle(e, "inEnd", -6)).toMatchObject({ fadeInSec: 2, fadeOutSec: 8 });
    expect(dragHandle(e, "inEnd", 5)).toMatchObject({ fadeInSec: 8 });
  });
});

describe("a side the browser cannot hear (Spotify): its estimated shape", () => {
  const row = { lengthSec: 180, headSilenceSec: 1.2, tailSilenceSec: 2, energy: 60 };
  it("is 0 in the measured silence and outside the side, smooth and below full scale in the music", () => {
    expect(estimatedLevel(row, 0.5)).toBe(0);
    expect(estimatedLevel(row, 179)).toBe(0);
    expect(estimatedLevel(row, -1)).toBeNull();
    expect(estimatedLevel(row, 181)).toBeNull();
    const mid = estimatedLevel(row, 90)!;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.95);
    // no beat-shaped detail: two points a quarter second apart differ by very little
    expect(Math.abs(estimatedLevel(row, 90)! - estimatedLevel(row, 90.25)!)).toBeLessThan(0.01);
  });
  it("a louder side (higher energy) draws taller", () => {
    expect(estimatedLevel({ ...row, energy: 90 }, 90)!).toBeGreaterThan(
      estimatedLevel({ ...row, energy: 20 }, 90)!,
    );
  });
});

describe("the first beat of a decoded side", () => {
  it("is the first strong low-band onset after its silent head", () => {
    const perSec = 20;
    const low = Array.from({ length: 200 }, (_, k) => (k < 30 ? 0.01 : k === 34 ? 0.9 : 0.3));
    expect(firstBeatSec({ low, mid: low, high: low, perSec }, 1.5)).toBeCloseTo(34 / perSec, 6);
    expect(firstBeatSec({ low: [0, 0, 0], mid: [], high: [], perSec }, 0)).toBeNull();
  });
});

describe("a dragged curve bend", () => {
  it("up is equal power (fuller), the middle linear, down an S-curve", () => {
    expect(CURVE_ORDER).toEqual(["sCurve", "linear", "equalPower"]);
    expect(curveFromLevel(0.9)).toBe("equalPower");
    expect(curveFromLevel(0.5)).toBe("linear");
    expect(curveFromLevel(0.1)).toBe("sCurve");
  });
});

describe("EQ lanes", () => {
  it("a bass swap moves the lows only; a three-band swap hands the mids and highs over too", () => {
    const b = eqLanes(win({ preset: "blend", overlapSec: 8, eq: "bassSwap" }))!;
    expect(b.out.low.length).toBeGreaterThan(1);
    expect(b.out.mid).toEqual([]);
    expect(b.in.high).toEqual([]);
    const t = eqLanes(win({ preset: "blend", overlapSec: 8, eq: "threeBand" }))!;
    for (const band of ["low", "mid", "high"] as const) {
      expect(t.out[band].length).toBeGreaterThan(1);
      expect(t.in[band].length).toBeGreaterThan(1);
      // the outgoing ends cut, the incoming ends flat
      expect(t.out[band].at(-1)![1]).toBeLessThan(0);
      expect(t.in[band].at(-1)![1]).toBe(0);
    }
    expect(eqLanes(win({ preset: "fade" }))).toBeNull();
  });
});
