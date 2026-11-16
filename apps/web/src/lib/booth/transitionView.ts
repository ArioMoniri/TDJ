import type { CurveShape, TransitionPreset } from "@tdj/core";
import type { Bands } from "./spectral";

/**
 * 2026-11 — the finished transition editor's drawing, the pure part (components/booth/TransitionSheet.tsx): the time
 * ruler, the zoomed view, the handles each lane offers per preset, the clearly-estimated shape of a side the browser
 * cannot hear (Spotify), the first beat of a decoded side, and the curve a dragged bend picks. Every time is in
 * seconds relative to the outgoing side's end (negative = before it ends), as in lib/booth/transition.ts.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Span {
  start: number;
  end: number;
}

/** The ruler's steps (seconds) and the least room between two labels. */
const STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30];
const MIN_LABEL_PX = 44;

/** "−4 s" … "0" … "+2 s": the ruler's ticks over `start…end` at `widthPx` (labelled majors, minor ticks between). */
export function rulerTicks(start: number, end: number, widthPx: number): Array<{ t: number; label?: string }> {
  const span = Math.max(1e-3, end - start);
  const pxPerSec = widthPx / span;
  const step = STEPS.find((s) => s * pxPerSec >= MIN_LABEL_PX) ?? STEPS[STEPS.length - 1]!;
  const minor = step / (step >= 5 ? 5 : 2);
  const out: Array<{ t: number; label?: string }> = [];
  const first = Math.ceil(start / minor - 1e-9);
  for (let k = first; k * minor <= end + 1e-9; k++) {
    const t = Math.round(k * minor * 1000) / 1000;
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    if (!major) {
      out.push({ t });
      continue;
    }
    const v = Math.abs(t);
    const num = Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    out.push({ t, label: t === 0 ? "0" : `${t < 0 ? "−" : "+"}${num}` });
  }
  return out;
}

/** Zoom levels the editor steps through (0 = fit). */
export const ZOOM_MIN = -2;
export const ZOOM_MAX = 3;
/** seconds of each side shown around the transition at the fitted zoom */
const LEAD_SEC = 4;
/**
 * The visible window: the transition with a lead on each side at zoom 0; each step in halves the span, each step
 * out doubles it (3 … 64 s), centred on the transition's middle.
 */
export function viewSpan(panel: Span, zoom: number): Span {
  const mid = (panel.start + panel.end) / 2;
  const fit = Math.max(8, panel.end - panel.start + 2 * LEAD_SEC);
  const span = clamp(fit / 2 ** zoom, 3, 64);
  return { start: mid - span / 2, end: mid + span / 2 };
}

export type EdgeId = "start" | "end" | "gap" | "outEnd" | "inEnd";
/**
 * The handles each lane offers (Spotify's Mix editor and DJ.Studio: a box per lane with its edges): a blend's overlap
 * start spans both lanes, its outgoing fade end and incoming rise end each sit on their own lane; a fade's fade out
 * start (top), where the incoming comes in and its rise's end (bottom); a gap's silence (bottom).
 */
export function editorEdges(p: TransitionPreset): Array<{ which: EdgeId; lane: "out" | "in" | "both" }> {
  switch (p) {
    case "blend":
      return [
        { which: "start", lane: "both" },
        { which: "outEnd", lane: "out" },
        { which: "inEnd", lane: "in" },
      ];
    case "rise":
      return [
        { which: "start", lane: "both" },
        { which: "inEnd", lane: "in" },
      ];
    case "fade":
      return [
        { which: "start", lane: "out" },
        { which: "gap", lane: "in" },
        { which: "end", lane: "in" },
      ];
    case "cortinaCut":
      return [
        { which: "start", lane: "out" },
        { which: "gap", lane: "in" },
      ];
    default:
      return [{ which: "gap", lane: "in" }];
  }
}

/**
 * A side the browser cannot decode (Spotify full tracks): an honest, smooth estimate from what is known — its length,
 * its measured or estimated silent head and tail, its energy (0…100) — never beat-shaped detail that would pass for a
 * real waveform. `sec` is seconds into the side; null outside it; 0 inside its silence.
 */
export function estimatedLevel(
  o: { lengthSec: number; headSilenceSec?: number; tailSilenceSec?: number; energy?: number | null },
  sec: number,
): number | null {
  const len = Math.max(0, o.lengthSec);
  if (sec < 0 || sec > len) return null;
  const head = Math.max(0, o.headSilenceSec ?? 0);
  const tail = Math.max(0, o.tailSilenceSec ?? 0);
  if (sec < head || sec > len - tail) return 0;
  const e = o.energy ?? 50;
  const top = 0.45 + 0.4 * clamp(e / 100, 0, 1);
  // an attack over the first 1.5 s of music, a gentle settle over the last 6 s
  const inMusic = sec - head;
  const toEnd = len - tail - sec;
  const attack = clamp(inMusic / 1.5, 0, 1);
  const release = 0.75 + 0.25 * clamp(toEnd / 6, 0, 1);
  return top * (0.15 + 0.85 * attack) * release;
}

/**
 * The first strong low-band onset after the side's silent head (a decoded side): where the music's first downbeat
 * is, to the band envelope's resolution. Null when there is none in the first 12 s.
 */
export function firstBeatSec(b: Bands, afterSec = 0): number | null {
  const low = b.low;
  if (!low.length) return null;
  const from = Math.max(0, Math.floor(afterSec * b.perSec));
  const to = Math.min(low.length, from + 12 * b.perSec);
  let max = 0;
  for (let k = from; k < to; k++) max = Math.max(max, low[k] ?? 0);
  if (max < 0.05) return null;
  for (let k = Math.max(1, from); k < to; k++) {
    const v = low[k] ?? 0;
    if (v >= 0.6 * max && v > (low[k - 1] ?? 0)) return k / b.perSec;
  }
  return null;
}

/** A curve's bend, dragged: down an S-curve, the middle linear, up equal power. */
export const CURVE_ORDER: ReadonlyArray<CurveShape> = ["sCurve", "linear", "equalPower"];
export function curveFromLevel(level: number): CurveShape {
  const v = clamp(level, 0, 1);
  return v < 1 / 3 ? "sCurve" : v < 2 / 3 ? "linear" : "equalPower";
}
export function curveLevel(c: CurveShape): number {
  return (CURVE_ORDER.indexOf(c) + 0.5) / CURVE_ORDER.length;
}
