import { type PlannedTransition, resolveTransition, type TransitionEdit } from "@tdj/core";
import { describe, expect, it } from "vitest";
import type { AudioParamLike } from "./engine";
import {
  AUDITION_LEAD_SEC,
  applyIncoming,
  applyOutgoing,
  auditionSpan,
  barsToSec,
  bassSwapPoints,
  curve,
  curveAt,
  dragHandle,
  incomingWhen,
  lengthLabel,
  secToBars,
  transitionWindow,
} from "./transition";

const side = (kind: "track" | "cortina" | "closing", lengthSec = 180) => ({ kind, lengthSec, tanda: 1 });
const plan = (e: TransitionEdit, from = side("track"), to = side("track")): PlannedTransition =>
  resolveTransition(e, { from, to });

describe("curves", () => {
  it("every shape starts and ends exactly where it should, and is monotonic", () => {
    for (const shape of ["linear", "equalPower", "sCurve"] as const) {
      const out = curve(shape, "out", 64, 0.8);
      const inn = curve(shape, "in", 64, 0.8);
      expect(out[0]).toBeCloseTo(0.8, 6);
      expect(out[63]).toBe(0);
      expect(inn[0]).toBe(0);
      expect(inn[63]).toBeCloseTo(0.8, 6);
      for (let i = 1; i < 64; i++) {
        expect(out[i]!).toBeLessThanOrEqual(out[i - 1]! + 1e-7);
        expect(inn[i]!).toBeGreaterThanOrEqual(inn[i - 1]! - 1e-7);
      }
    }
  });
  it("equal-power keeps the summed power at 1 across the blend; linear keeps the summed amplitude at 1", () => {
    for (let k = 0; k <= 20; k++) {
      const x = k / 20;
      expect(curveAt("equalPower", "out", x) ** 2 + curveAt("equalPower", "in", x) ** 2).toBeCloseTo(1, 6);
      expect(curveAt("linear", "out", x) + curveAt("linear", "in", x)).toBeCloseTo(1, 6);
      expect(curveAt("sCurve", "out", x) + curveAt("sCurve", "in", x)).toBeCloseTo(1, 6);
    }
    // the S-curve is flat at both ends, the linear is not
    expect(curveAt("sCurve", "in", 0.05)).toBeLessThan(curveAt("linear", "in", 0.05));
    expect(curveAt("equalPower", "in", 0.5)).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe("transition window", () => {
  it("a gap: the incoming starts gapSec after the outgoing ends, no fades", () => {
    const w = transitionWindow(plan({ preset: "gap", gapSec: 3 }), { outLen: 180, inLen: 170 });
    expect(w).toMatchObject({
      inStart: 3,
      outFade: { start: 0, len: 0 },
      inFade: { start: 3, len: 0 },
      outStop: 0,
    });
    expect(w.box).toEqual({ start: 0, end: 3 });
  });
  it("a fade: the outgoing fades to its end, silence, the incoming fades in", () => {
    const w = transitionWindow(plan({ preset: "fade", fadeOutSec: 3, gapSec: 1, fadeInSec: 2 }), {
      outLen: 180,
      inLen: 170,
    });
    expect(w.outFade).toEqual({ start: -3, len: 3 });
    expect(w.inStart).toBe(1);
    expect(w.inFade).toEqual({ start: 1, len: 2 });
    expect(w.box).toEqual({ start: -3, end: 3 });
  });
  it("a blend: the incoming starts overlapSec before the end and both curves run from there", () => {
    const w = transitionWindow(plan({ preset: "blend", overlapSec: 6, fadeOutSec: 4 }), {
      outLen: 180,
      inLen: 170,
    });
    expect(w.inStart).toBe(-6);
    expect(w.outFade).toEqual({ start: -6, len: 4 });
    // the outgoing is silent once its fade is through: it stops there
    expect(w.outStop).toBe(-2);
    expect(w.inFade).toEqual({ start: -6, len: 6 });
    expect(w.box).toEqual({ start: -6, end: 0 });
  });
  it("a rise: the outgoing keeps its level to its end, the incoming rises under it", () => {
    const w = transitionWindow(plan({ preset: "rise", overlapSec: 5, fadeInSec: 3 }), {
      outLen: 180,
      inLen: 170,
    });
    expect(w).toMatchObject({
      inStart: -5,
      outFade: { start: 0, len: 0 },
      outStop: 0,
      inFade: { start: -5, len: 3 },
    });
  });
  it("auto follows the night: its gap and its song end fade (a cortina keeps its own fade)", () => {
    expect(transitionWindow(null, { outLen: 180, inLen: 170, gapSec: 2.5, songFadeOutSec: 2 })).toMatchObject(
      {
        inStart: 2.5,
        outFade: { start: -2, len: 2 },
      },
    );
    expect(
      transitionWindow(null, {
        outLen: 45,
        inLen: 170,
        gapSec: 2.5,
        outKind: "cortina",
        cortinaFadeOutSec: 4,
      }),
    ).toMatchObject({ outFade: { start: -4, len: 4 } });
  });
  it("an overlap never reaches past either side, even for a short clip", () => {
    const tr = plan({ preset: "blend", overlapSec: 12 });
    const w = transitionWindow(tr, { outLen: 10, inLen: 6 });
    expect(-w.inStart).toBeLessThanOrEqual(3);
    expect(-w.outFade.start).toBeLessThanOrEqual(5);
    expect(w.inFade.len).toBeLessThanOrEqual(6);
  });
});

describe("scheduling", () => {
  it("the incoming item's start: the outgoing end minus the overlap, or plus the gap", () => {
    expect(incomingWhen(100, plan({ preset: "blend", overlapSec: 4 }), 2.5)).toBe(96);
    expect(incomingWhen(100, plan({ preset: "gap", gapSec: 1.5 }), 2.5)).toBe(101.5);
    expect(incomingWhen(100, null, 2.5)).toBe(102.5);
  });
  it("the night's time stays right: Σ(len + gap − overlap) over a chain of transitions", () => {
    const lens = [180, 170, 45, 175];
    const trs = [plan({ preset: "gap", gapSec: 2 }), plan({ preset: "blend", overlapSec: 5 }), null];
    let t = 0;
    let end = 0;
    lens.forEach((len, i) => {
      end = t + len;
      if (i < trs.length) t = incomingWhen(end, trs[i]!, 2.5);
    });
    expect(end).toBe(180 + 170 + 45 + 175 + 2 - 5 + 2.5);
  });
});

/* a recording AudioParam: the engine's gain automation goes through `setValueCurveAtTime` */
class Rec implements AudioParamLike {
  value = 1;
  calls: Array<[string, ...unknown[]]> = [];
  setValueAtTime(v: number, t: number) {
    this.calls.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["ramp", v, t]);
  }
  setValueCurveAtTime(c: Float32Array, t: number, d: number) {
    this.calls.push(["curve", c, t, d]);
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    this.calls.push(["target", v, t, tc]);
  }
  cancelScheduledValues(t: number) {
    this.calls.push(["cancel", t]);
  }
}

describe("gain automation", () => {
  it("the outgoing fades with setValueCurveAtTime from the window start; the incoming rises from its start", () => {
    const tr = plan({ preset: "blend", overlapSec: 6, curveOut: "equalPower", curveIn: "sCurve" });
    const w = transitionWindow(tr, { outLen: 180, inLen: 170 });
    const o = new Rec();
    applyOutgoing(o, { endsAt: 200, base: 0.5, window: w, curve: tr.curveOut, now: 0 });
    const c = o.calls.find((x) => x[0] === "curve")!;
    expect(c[2]).toBe(194);
    expect(c[3]).toBe(6);
    expect((c[1] as Float32Array)[0]).toBeCloseTo(0.5, 6);
    expect((c[1] as Float32Array).at(-1)).toBe(0);
    const i = new Rec();
    applyIncoming(i, { when: 194, base: 0.7, window: w, curve: tr.curveIn });
    const ci = i.calls.find((x) => x[0] === "curve")!;
    expect(ci[2]).toBe(194);
    expect(ci[3]).toBe(6);
    expect((ci[1] as Float32Array).at(-1)).toBeCloseTo(0.7, 6);
  });
  it("a gap keeps the declicks (no curve), a rise keeps the outgoing at its level", () => {
    const g = transitionWindow(plan({ preset: "gap", gapSec: 2 }), { outLen: 180, inLen: 170 });
    const o = new Rec();
    applyOutgoing(o, { endsAt: 200, base: 1, window: g, curve: "linear", now: 0 });
    expect(o.calls.some((x) => x[0] === "curve")).toBe(false);
    expect(o.calls.at(-1)).toEqual(["ramp", 0, 200]);
    const r = transitionWindow(plan({ preset: "rise", overlapSec: 4 }), { outLen: 180, inLen: 170 });
    const o2 = new Rec();
    applyOutgoing(o2, { endsAt: 200, base: 1, window: r, curve: "linear", now: 0 });
    expect(o2.calls.some((x) => x[0] === "curve")).toBe(false);
  });
  it("the bass swap happens at the centre of the overlap: out loses its lows, in gains them", () => {
    const w = transitionWindow(plan({ preset: "blend", overlapSec: 8, bassSwap: true }), {
      outLen: 180,
      inLen: 170,
    });
    const b = bassSwapPoints(w)!;
    expect(b.center).toBe(-4);
    expect(b.outLow.at(-1)).toEqual([expect.any(Number), b.cutDb]);
    expect(b.inLow[0]).toEqual([-8, b.cutDb]);
    expect(b.inLow.at(-1)![1]).toBe(0);
    expect(bassSwapPoints(transitionWindow(plan({ preset: "gap" }), { outLen: 180, inLen: 170 }))).toBeNull();
  });
});

describe("audition", () => {
  it("plays ~8 s of the outgoing before the transition and ~8 s of the incoming after it, inside both sides", () => {
    const w = transitionWindow(plan({ preset: "blend", overlapSec: 6 }), { outLen: 180, inLen: 170 });
    const a = auditionSpan(w, { outLen: 180, inLen: 170 });
    expect(a.outFrom).toBe(180 - 6 - AUDITION_LEAD_SEC);
    expect(a.inAt).toBe(AUDITION_LEAD_SEC);
    expect(a.totalSec).toBe(AUDITION_LEAD_SEC + 6 + AUDITION_LEAD_SEC);
    // a short clip: never before its start
    const s = auditionSpan(transitionWindow(plan({ preset: "gap", gapSec: 2 }), { outLen: 5, inLen: 4 }), {
      outLen: 5,
      inLen: 4,
    });
    expect(s.outFrom).toBe(0);
    expect(s.inAt).toBe(5 + 2);
    expect(s.inUntil).toBeLessThanOrEqual(4);
  });
});

describe("handles and length", () => {
  it("dragging the start of a blend sets the overlap; the end sets the fade; the result follows the rules", () => {
    const e: TransitionEdit = { preset: "blend", overlapSec: 4 };
    expect(dragHandle(e, "start", -7)).toMatchObject({ overlapSec: 7 });
    expect(dragHandle({ ...e, overlapSec: 7 }, "end", -3)).toMatchObject({ fadeOutSec: 4, fadeInSec: 4 });
    expect(dragHandle({ preset: "gap", gapSec: 2 }, "end", 3.5)).toMatchObject({ gapSec: 3.5 });
    expect(dragHandle({ preset: "fade", gapSec: 1 }, "start", -2.5)).toMatchObject({ fadeOutSec: 2.5 });
    expect(dragHandle({ preset: "fade", gapSec: 1 }, "end", 4)).toMatchObject({ fadeInSec: 3 });
    // a start handle past the outgoing end does nothing silly
    expect(dragHandle(e, "start", 2).overlapSec).toBeGreaterThanOrEqual(1);
  });
  it("seconds ↔ bars at a known BPM (4/4); seconds without one", () => {
    expect(secToBars(4, 120)).toBe(2);
    expect(barsToSec(2, 120)).toBe(4);
    expect(lengthLabel(4, 120, "bars")).toBe("2 bars");
    expect(lengthLabel(2, 120, "bars")).toBe("1 bar");
    expect(lengthLabel(4, null, "bars")).toBe("4 s");
    expect(lengthLabel(3.5, 120, "sec")).toBe("3.5 s");
  });
});
