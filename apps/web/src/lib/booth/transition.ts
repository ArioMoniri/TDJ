import {
  type CurveShape,
  type PlannedTransition,
  TRANSITION_RANGES,
  type TransitionEdit,
  type TransitionEq,
} from "@tdj/core";
import { t as tx } from "@/lib/i18n";
import type { AudioParamLike } from "./engine";
import { DECLICK_IN, DECLICK_OUT } from "./envelope";

/**
 * Wave 4 — the Booth's transition editor, the pure part: the volume curves (linear, equal-power, S-curve), the
 * transition window both the editor draws and the engine schedules (every time relative to the outgoing item's end),
 * the gain automation the engine and the audition apply with `setValueCurveAtTime`, the bass swap's EQ points, the
 * audition span, the handle drags and the bars ↔ seconds label. The plan's rules (La Cumparsita whole, a cortina cut
 * only after a cortina, overlap limits) live in `@tdj/core`'s `resolveTransition`.
 */

export type CurveDir = "in" | "out";
/** Points per curve handed to `setValueCurveAtTime`. */
export const CURVE_POINTS = 64;
/** The audition plays this long before the transition and after it. */
export const AUDITION_LEAD_SEC = 8;
/** The bass swap cuts the lows by this much. */
export const BASS_CUT_DB = -24;
export const BASS_SHELF_HZ = 220;
export const HIGH_SHELF_HZ = 3500;
/** The outgoing's highs ease off by this much after the swap (the hand-off). */
export const HIGH_EASE_DB = -6;
/** 2026-11 — a three-band swap: the mids (a peaking band) and the highs handed over across the overlap */
export const MID_PEAK_HZ = 1000;
export const MID_CUT_DB = -9;
export const HIGH_CUT_DB = -12;
/** Anything heard during a transition is never left hanging longer than this before the outgoing's end. */
const TAIL_MAX_SEC = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The gain of a curve at `x` ∈ [0, 1] (`out` falls from 1 to 0, `in` rises from 0 to 1). */
export function curveAt(shape: CurveShape, dir: CurveDir, x: number): number {
  const t = clamp(x, 0, 1);
  const p = dir === "in" ? t : 1 - t;
  if (shape === "equalPower") return Math.sin((p * Math.PI) / 2);
  if (shape === "sCurve") return 0.5 - 0.5 * Math.cos(p * Math.PI);
  return p;
}

/** `n` points of a curve scaled by `peak` (the item's gain); the end points are exact. */
export function curve(shape: CurveShape, dir: CurveDir, n = CURVE_POINTS, peak = 1): Float32Array {
  const out = new Float32Array(Math.max(2, n));
  const last = out.length - 1;
  for (let i = 0; i <= last; i++) out[i] = peak * curveAt(shape, dir, i / last);
  out[dir === "out" ? last : 0] = 0;
  out[dir === "out" ? 0 : last] = peak;
  return out;
}

/** A transition laid out in seconds relative to the outgoing item's end (negative = before it ends). */
export interface TransitionWindow {
  /** when the incoming item starts */
  inStart: number;
  /** the outgoing's fade (len 0: it plays to its end, declicked) */
  outFade: { start: number; len: number };
  /** the incoming's rise (len 0: it starts at its level, declicked) */
  inFade: { start: number; len: number };
  /** where the outgoing stops (≤ 0: a blend whose fade is through before its end stops there) */
  outStop: number;
  /** the box the editor draws and its two handles move */
  box: { start: number; end: number };
  overlapSec: number;
  gapSec: number;
  bassSwap: boolean;
  /** 2026-11: the EQ hand-over (none, the centre bass swap, the three-band swap) */
  eq: TransitionEq;
  curveOut: CurveShape;
  curveIn: CurveShape;
}

/**
 * Lay a resolved transition out against the two sides as they will actually play (a 30 s clip is shorter than the
 * plan's side, so the overlap and fades are clamped again here). `null` = Auto: the night's gap and song end fade
 * (a cortina keeps its own fade).
 */
export function transitionWindow(
  tr: PlannedTransition | null,
  o: {
    outLen: number;
    inLen: number;
    gapSec?: number;
    songFadeOutSec?: number;
    outKind?: string;
    cortinaFadeOutSec?: number;
  },
): TransitionWindow {
  const halfOut = Math.max(0, o.outLen / 2);
  const halfIn = Math.max(0, o.inLen / 2);
  if (!tr) {
    const gap = o.gapSec ?? 2.5;
    const want = o.outKind === "cortina" ? (o.cortinaFadeOutSec ?? 0) : (o.songFadeOutSec ?? 0);
    const fo = r1(clamp(want, 0, halfOut));
    return {
      inStart: gap,
      outFade: { start: fo ? -fo : 0, len: fo },
      inFade: { start: gap, len: 0 },
      outStop: 0,
      box: { start: fo ? -fo : 0, end: gap },
      overlapSec: 0,
      gapSec: gap,
      bassSwap: false,
      eq: "none",
      curveOut: "equalPower",
      curveIn: "linear",
    };
  }
  const base = { bassSwap: false, eq: "none" as TransitionEq, curveOut: tr.curveOut, curveIn: tr.curveIn };
  if (tr.overlapSec > 0) {
    const ov = r1(Math.min(tr.overlapSec, halfOut, halfIn));
    const fi = r1(Math.min(tr.fadeInSec, ov));
    const fo = r1(Math.min(tr.fadeOutSec, ov));
    const start = -ov;
    return {
      ...base,
      inStart: start,
      outFade: { start: fo > 0 ? start : 0, len: fo },
      inFade: { start, len: fi },
      outStop: fo > 0 ? r1(start + fo) : 0,
      box: { start, end: r1(start + Math.max(fi, fo)) },
      overlapSec: ov,
      gapSec: 0,
      bassSwap: tr.bassSwap && ov > 0,
      eq: ov > 0 ? (tr.eq ?? (tr.bassSwap ? "bassSwap" : "none")) : "none",
    };
  }
  const gap = tr.gapSec;
  const fo = r1(Math.min(tr.fadeOutSec, halfOut));
  const fi = r1(Math.min(tr.fadeInSec, halfIn));
  return {
    ...base,
    inStart: gap,
    outFade: { start: fo ? -fo : 0, len: fo },
    inFade: { start: gap, len: fi },
    outStop: 0,
    box: { start: fo ? -fo : 0, end: r1(gap + fi) },
    overlapSec: 0,
    gapSec: gap,
  };
}

/** When the incoming item starts (context time) after an outgoing item ending at `endsAt`. */
export function incomingWhen(endsAt: number, tr: PlannedTransition | null, defaultGapSec: number): number {
  if (!tr) return endsAt + defaultGapSec;
  return tr.overlapSec > 0 ? endsAt - tr.overlapSec : endsAt + tr.gapSec;
}

/**
 * The outgoing item's tail: everything scheduled on its gain from `from` on is replaced by the transition's fade
 * (`setValueCurveAtTime`), or by the plain declick at its end (gap, rise). `from` is never before `now`.
 */
export function applyOutgoing(
  p: AudioParamLike,
  o: {
    endsAt: number;
    base: number;
    window: TransitionWindow;
    curve: CurveShape;
    now: number;
    notBefore?: number;
  },
): void {
  const w = o.window;
  const from = Math.max(o.now, o.notBefore ?? 0, o.endsAt - Math.max(TAIL_MAX_SEC, -w.outFade.start));
  try {
    p.cancelScheduledValues(from);
  } catch {}
  p.setValueAtTime(o.base, from);
  const stopAt = o.endsAt + w.outStop;
  if (w.outFade.len > 0) {
    const t0 = Math.max(from, o.endsAt + w.outFade.start);
    const len = Math.max(DECLICK_OUT, o.endsAt + w.outFade.start + w.outFade.len - t0);
    try {
      p.setValueCurveAtTime(curve(o.curve, "out", CURVE_POINTS, o.base), t0, len);
    } catch {
      p.setTargetAtTime(0, t0, len / 6);
    }
    if (stopAt > t0 + len) p.setValueAtTime(0, t0 + len);
    return;
  }
  p.setValueAtTime(o.base, Math.max(from, stopAt - DECLICK_OUT));
  p.linearRampToValueAtTime(0, stopAt);
}

/** The incoming item's head: its rise with `setValueCurveAtTime`, or the plain 5 ms declick. */
export function applyIncoming(
  p: AudioParamLike,
  o: { when: number; base: number; window: TransitionWindow; curve: CurveShape },
): void {
  const len = o.window.inFade.len;
  if (len > 0) {
    p.setValueCurveAtTime(curve(o.curve, "in", CURVE_POINTS, o.base), o.when, len);
    return;
  }
  p.setValueAtTime(0, o.when);
  p.linearRampToValueAtTime(o.base, o.when + DECLICK_IN);
}

/**
 * The bass swap ("centre bass swap"): at the centre of the overlap the outgoing's lowshelf drops to BASS_CUT_DB while
 * the incoming's comes up from it, and the outgoing's highshelf eases off after the swap. Points are
 * [seconds relative to the outgoing's end, dB]; null when the transition has no overlap or no swap.
 */
export function bassSwapPoints(w: TransitionWindow): {
  center: number;
  cutDb: number;
  outLow: Array<[number, number]>;
  inLow: Array<[number, number]>;
  outHigh: Array<[number, number]>;
} | null {
  if (!w.bassSwap || w.overlapSec <= 0) return null;
  const start = w.inStart;
  const center = r1(start + w.overlapSec / 2);
  const edge = Math.min(0.25, w.overlapSec / 8);
  const end = w.outStop < 0 ? w.outStop : 0;
  return {
    center,
    cutDb: BASS_CUT_DB,
    outLow: [
      [start, 0],
      [center - edge, 0],
      [center, BASS_CUT_DB],
    ],
    inLow: [
      [start, BASS_CUT_DB],
      [center - edge, BASS_CUT_DB],
      [center, 0],
    ],
    outHigh: [
      [center, 0],
      [Math.max(center + edge, end), HIGH_EASE_DB],
    ],
  };
}

export type EqPoints = Array<[number, number]>;
export interface EqLanes {
  center: number;
  out: { low: EqPoints; mid: EqPoints; high: EqPoints };
  in: { low: EqPoints; mid: EqPoints; high: EqPoints };
}
/**
 * 2026-11 — every band's automation for both sides ([seconds relative to the outgoing's end, dB]; an empty list is
 * a flat band). A bass swap is `bassSwapPoints`; a three-band swap also hands the mids and highs over: the outgoing's
 * ease down across the overlap, the incoming's come up to flat by its centre. Null without an overlap or an EQ.
 */
export function eqLanes(w: TransitionWindow): EqLanes | null {
  const b = bassSwapPoints(w);
  if (!b) return null;
  if (w.eq !== "threeBand")
    return {
      center: b.center,
      out: { low: b.outLow, mid: [], high: b.outHigh },
      in: { low: b.inLow, mid: [], high: [] },
    };
  const start = w.inStart;
  const end = w.outStop < 0 ? w.outStop : 0;
  const c = b.center;
  return {
    center: c,
    out: {
      low: b.outLow,
      mid: [
        [start, 0],
        [end, MID_CUT_DB],
      ],
      high: [
        [start, 0],
        [c, HIGH_EASE_DB],
        [Math.max(c + 0.05, end), HIGH_CUT_DB],
      ],
    },
    in: {
      low: b.inLow,
      mid: [
        [start, MID_CUT_DB],
        [c, 0],
      ],
      high: [
        [start, HIGH_CUT_DB],
        [c, 0],
      ],
    },
  };
}

/** Schedule EQ points on a filter's gain param, `t0` = the outgoing's end in context time. */
export function applyEqPoints(p: AudioParamLike, points: Array<[number, number]>, t0: number, now = 0): void {
  const first = points[0];
  if (!first) return;
  p.setValueAtTime(first[1], Math.max(now, t0 + first[0]));
  for (const [t, db] of points.slice(1)) p.linearRampToValueAtTime(db, Math.max(now, t0 + t));
}

/**
 * The audition: the outgoing from AUDITION_LEAD_SEC before the transition begins, through it, into AUDITION_LEAD_SEC
 * of the incoming after the transition's box. `outFrom` is seconds into the outgoing side, `inAt` when the incoming
 * starts on the audition's own clock, `inUntil` how much of the incoming plays.
 */
export function auditionSpan(
  w: TransitionWindow,
  o: { outLen: number; inLen: number },
): { outFrom: number; inAt: number; inUntil: number; totalSec: number } {
  const begins = Math.min(w.outFade.start, w.inStart, 0);
  const outFrom = r1(Math.max(0, o.outLen + begins - AUDITION_LEAD_SEC));
  const inAt = r1(o.outLen + w.inStart - outFrom);
  const inUntil = r1(
    Math.max(0.5, Math.min(o.inLen, Math.max(0, w.box.end - w.inStart) + AUDITION_LEAD_SEC)),
  );
  return { outFrom, inAt, inUntil, totalSec: r1(inAt + inUntil) };
}

/**
 * A handle dragged to `sec` (relative to the outgoing's end). Start: a blend / rise's overlap, a fade's or a cortina
 * cut's fade out. End: a blend's fades, a rise's rise, a fade's fade in, a gap's (and a cortina cut's) silence.
 */
export function dragHandle(
  e: TransitionEdit,
  which: "start" | "end" | "gap" | "outEnd" | "inEnd",
  sec: number,
): TransitionEdit {
  const R = TRANSITION_RANGES;
  const v = r1(sec);
  const next: TransitionEdit = { ...e };
  const overlap = e.overlapSec ?? 4;
  // the incoming box's left edge: where the next side comes in (a fade's silence; a blend's or rise's overlap)
  if (which === "gap") {
    if (e.preset === "blend" || e.preset === "rise") return dragHandle(e, "start", sec);
    next.gapSec = r1(clamp(v, R.gapSec.min, R.gapSec.max));
    return next;
  }
  // 2026-11: a blend's / rise's fade ends move on their own (the outgoing's lane, the incoming's lane)
  if ((which === "outEnd" || which === "inEnd") && (e.preset === "blend" || e.preset === "rise")) {
    const f = r1(clamp(v + overlap, 0, overlap));
    if (which === "outEnd") next.fadeOutSec = e.preset === "blend" ? f : 0;
    else next.fadeInSec = f;
    return next;
  }
  if (which === "inEnd") return dragHandle(e, "end", sec);
  if (which === "outEnd") return next;
  switch (e.preset) {
    case "blend":
    case "rise":
      if (which === "start") {
        const ov = r1(clamp(-v, R.overlapSec.min, R.overlapSec.max));
        next.overlapSec = ov;
        if (next.fadeInSec !== undefined) next.fadeInSec = Math.min(next.fadeInSec, ov);
        if (next.fadeOutSec !== undefined) next.fadeOutSec = Math.min(next.fadeOutSec, ov);
      } else {
        const f = r1(clamp(v + overlap, 0, overlap));
        next.fadeInSec = f;
        if (e.preset === "blend") next.fadeOutSec = f;
      }
      return next;
    case "fade":
      if (which === "start") next.fadeOutSec = r1(clamp(-v, 0, R.fadeSec.max));
      else next.fadeInSec = r1(clamp(v - (e.gapSec ?? 1), 0, R.fadeSec.max));
      return next;
    case "cortinaCut":
      if (which === "start") next.fadeOutSec = r1(clamp(-v, 0, R.fadeSec.max));
      else next.gapSec = r1(clamp(v, R.gapSec.min, R.gapSec.max));
      return next;
    default:
      if (which === "end") next.gapSec = r1(clamp(v, R.gapSec.min, R.gapSec.max));
      return next;
  }
}

/** A dragged edge lands on the nearest beat (relative to the outgoing's end) when the BPM is known. */
export function snapToBeat(sec: number, bpm: number | null | undefined): number {
  if (!bpm || bpm <= 0) return sec;
  const beat = 60 / bpm;
  return Math.round(sec / beat) * beat;
}

/** The outgoing side's gain at `t` (seconds relative to its end) under a transition window, 0…1. */
export function gainOutAt(w: TransitionWindow, t: number): number {
  const stop = Math.min(0, w.outStop);
  if (t > stop) return 0;
  if (w.outFade.len <= 0) return t >= 0 ? 0 : 1;
  if (t < w.outFade.start) return 1;
  return curveAt(w.curveOut, "out", (t - w.outFade.start) / w.outFade.len);
}
/** The incoming side's gain at `t`, 0…1. */
export function gainInAt(w: TransitionWindow, t: number): number {
  if (t < w.inStart) return 0;
  if (w.inFade.len <= 0) return 1;
  return curveAt(w.curveIn, "in", (t - w.inStart) / w.inFade.len);
}

export interface Span {
  start: number;
  end: number;
}
/**
 * The editor's two lanes: the outgoing's box (from its fade or the overlap to where it stops), the incoming's box
 * (from where it comes in to the end of its rise or the overlap) and the panel that spans both.
 */
export function laneBoxes(w: TransitionWindow): { out: Span; in: Span; panel: Span } {
  const outEnd = w.outStop < 0 ? w.outStop : 0;
  let outStart = outEnd;
  if (w.outFade.len > 0) outStart = Math.min(outStart, w.outFade.start);
  if (w.overlapSec > 0) outStart = Math.min(outStart, w.inStart);
  const inStart = w.inStart;
  const inEnd = Math.max(w.inStart + w.inFade.len, w.overlapSec > 0 ? Math.min(0, w.box.end) : w.inStart);
  const out = { start: r1(outStart), end: r1(outEnd) };
  const inn = { start: r1(inStart), end: r1(Math.max(inStart, inEnd)) };
  return {
    out,
    in: inn,
    panel: { start: Math.min(out.start, inn.start), end: Math.max(out.end, inn.end) },
  };
}

/** Seconds → bars of 4 beats at `bpm` (to the half bar). */
export function secToBars(sec: number, bpm: number): number {
  return Math.round(((sec * bpm) / 240) * 2) / 2;
}
export function barsToSec(bars: number, bpm: number): number {
  return r1((bars * 240) / bpm);
}
/** "2 bars" when the BPM is known and bars are asked for, else "3.5 s". */
export function lengthLabel(sec: number, bpm: number | null | undefined, unit: "bars" | "sec"): string {
  if (unit === "bars" && bpm && bpm > 0) {
    const b = secToBars(sec, bpm);
    return b === 1 ? tx("booth.transition.one_bar", { n: b }) : tx("booth.transition.n_bars", { n: b });
  }
  return `${r1(sec)} s`;
}
