import type { AudioFeatures } from "./dsp";

/** Pair-compatibility model from docs/research/audio-features.md (data/knowledge/audio_model.json v1). */
export interface CompatWeights {
  tempo: number;
  loudness: number;
  key: number;
  brightness: number;
  energy: number;
}
export const DEFAULT_WEIGHTS: CompatWeights = {
  tempo: 0.3,
  loudness: 0.2,
  key: 0.1,
  brightness: 0.15,
  energy: 0.1,
};
export const BPM_DELTA_MAX: Record<string, number> = { tango: 8, vals: 12, milonga: 7, cortina: 30 };
/** Same key scores below fifth/relative on purpose: tango DJs want contrast between neighbours, nothing is overlaid. */
const KEY_REL: Record<string, number> = {
  rel: 1,
  "1": 1,
  "0": 0.7,
  par: 0.8,
  "2": 0.85,
  "3": 0.75,
  "4": 0.65,
  "5": 0.65,
  "6": 0.55,
};

/** Camelot distance: 0 same, 1 neighbour (±1 number or A↔B), … up to 6. */
export function camelotDistance(a: string, b: string): number {
  const pa = /^(\d+)([AB])$/.exec(a);
  const pb = /^(\d+)([AB])$/.exec(b);
  if (!pa || !pb) return 6;
  const na = Number(pa[1]);
  const nb = Number(pb[1]);
  const d = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
  return d + (pa[2] === pb[2] ? 0 : 1);
}
export function keyRelation(a: string, b: string): number {
  const pa = /^(\d+)([AB])$/.exec(a);
  const pb = /^(\d+)([AB])$/.exec(b);
  if (!pa || !pb) return 0.7;
  if (pa[1] === pb[1]) return pa[2] === pb[2] ? KEY_REL["0"]! : KEY_REL.rel!;
  const d = Math.min(Math.abs(Number(pa[1]) - Number(pb[1])), 12 - Math.abs(Number(pa[1]) - Number(pb[1])));
  if (d === 3 && pa[2] !== pb[2]) return KEY_REL.par!; // parallel major/minor sits 3 steps across the wheel
  return KEY_REL[String(Math.min(6, d + (pa[2] === pb[2] ? 0 : 1)))] ?? 0.6;
}
const ramp = (x: number, full: number, zero: number) =>
  x <= full ? 1 : x >= zero ? 0 : 1 - (x - full) / (zero - full);

/** 0..100 compatibility of playing `b` after `a` inside one tanda. */
export function compatibility(
  a: Partial<AudioFeatures> | null | undefined,
  b: Partial<AudioFeatures> | null | undefined,
  rhythm = "tango",
  w: CompatWeights = DEFAULT_WEIGHTS,
): { score: number; parts: Record<string, number>; known: boolean } {
  if (!a || !b) return { score: 50, parts: {}, known: false };
  const parts: Record<string, number> = {};
  const max = BPM_DELTA_MAX[rhythm] ?? 8;
  if (a.bpm && b.bpm) parts.tempo = ramp(Math.abs(a.bpm - b.bpm) / max, 0.5, 2) * 100;
  if (a.loudnessDb != null && b.loudnessDb != null)
    parts.loudness = ramp(Math.abs(a.loudnessDb - b.loudnessDb), 2, 6) * 100;
  if (a.camelot && b.camelot) parts.key = keyRelation(a.camelot, b.camelot) * 100;
  if (a.brightnessHz && b.brightnessHz)
    parts.brightness = ramp(Math.abs(12 * Math.log2(a.brightnessHz / b.brightnessHz)), 2, 8) * 100;
  if (a.energy != null && b.energy != null)
    parts.energy = ramp(Math.abs(a.energy - b.energy), rhythm === "milonga" ? 12 : 8, 25) * 100;
  let num = 0;
  let den = 0;
  for (const [k, v] of Object.entries(parts)) {
    const wk = w[k as keyof CompatWeights] ?? 0;
    num += v * wk;
    den += wk;
  }
  return { score: den ? Math.round(num / den) : 50, parts, known: den > 0 };
}

/** Badge for a tanda: mean of consecutive pairs pulled halfway toward the worst pair (one audible step is what dancers notice). */
export function tandaCohesion(
  features: Array<Partial<AudioFeatures> | null | undefined>,
  rhythm: string,
): { score: number; known: number } {
  const pairs: number[] = [];
  for (let i = 1; i < features.length; i++) {
    const c = compatibility(features[i - 1], features[i], rhythm);
    if (c.known) pairs.push(c.score);
  }
  if (!pairs.length) return { score: 50, known: 0 };
  const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
  return { score: Math.round(mean - 0.5 * (mean - Math.min(...pairs))), known: pairs.length };
}
export function cohesionLabel(score: number): "seamless" | "fine" | "audible step" | "jarring" {
  return score >= 85 ? "seamless" : score >= 70 ? "fine" : score >= 55 ? "audible step" : "jarring";
}

/** Cortina → next tanda fit (energy a little below, never louder, similar brightness). 0..100. */
export function cortinaFit(
  c: Partial<AudioFeatures> | null | undefined,
  next: Partial<AudioFeatures> | null | undefined,
): number | null {
  if (!c || !next || c.energy == null || next.energy == null) return null;
  const d = next.energy - c.energy; // want 2..14
  const e = d >= 2 && d <= 14 ? 1 : ramp(Math.min(Math.abs(d - 2), Math.abs(d - 14)), 0, 20);
  const l =
    c.loudnessDb != null && next.loudnessDb != null
      ? c.loudnessDb <= next.loudnessDb + 1
        ? 1
        : ramp(c.loudnessDb - next.loudnessDb, 1, 6)
      : 0.7;
  const b =
    c.brightnessHz && next.brightnessHz
      ? ramp(Math.abs(12 * Math.log2(c.brightnessHz / next.brightnessHz)), 3, 12)
      : 0.7;
  return Math.round((0.45 * e + 0.35 * l + 0.2 * b) * 100);
}
