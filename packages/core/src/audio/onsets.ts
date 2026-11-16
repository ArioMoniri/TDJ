/**
 * 2026-11 — when a side's music starts, where its first beat and first downbeat fall, and its beat grid, measured
 * from decodable audio (the DJ's file, or a 30 s clip: then only the clip's own seconds). Pure functions over mono
 * PCM, shared by the browser and the invariants (packages/core/test/songDna.test.ts).
 *
 * The onset envelope is the half-wave rectified rise of the short-time level (10 ms hops, 20 ms windows, in dB): a
 * bandoneón's marcato, a piano's chord and a double bass's pizzicato all show as a rise. The tempo comes from the
 * envelope's autocorrelation in the rhythm's range; the beat phase is the offset whose comb of beats collects the
 * most onset strength over the first minute; the downbeat is the beat of the bar that collects the most (the
 * accented first beat). The singer's entry is not measured here (a voice over an orchestra is not an onset): the DJ
 * marks it while listening.
 */

const HOP_SEC = 0.01;
/** below this (dBFS RMS) a frame is silence; and anything 35 dB under the loudest frame is not the music yet */
const FLOOR_DB = -60;
const START_REL_DB = 35;

export const BEATS_PER_BAR: Record<string, number> = { tango: 4, milonga: 4, vals: 3 };
export const PHRASE_BARS = 8;

/** frame levels in dB (20 ms windows every 10 ms) */
function levels(x: Float32Array, sr: number): { db: Float32Array; hop: number } {
  const hop = Math.max(1, Math.round(HOP_SEC * sr));
  const win = hop * 2;
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const db = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const a = f * hop;
    for (let i = a; i < a + win; i++) s += x[i]! * x[i]!;
    const ms = s / win;
    db[f] = ms > 1e-12 ? 10 * Math.log10(ms) : -120;
  }
  return { db, hop };
}

/** the onset strength per 10 ms frame and the hop in seconds; frame `f` is centred at (f + 1) · hopSec */
export function onsetEnvelope(x: Float32Array, sr: number): { env: Float32Array; hopSec: number } {
  const { db, hop } = levels(x, sr);
  const env = new Float32Array(db.length);
  for (let f = 1; f < db.length; f++) {
    // only rises out of the floor count (noise flickering at −80 dB is not an onset)
    const a = Math.max(db[f - 1]!, FLOOR_DB);
    const b = Math.max(db[f]!, FLOOR_DB);
    env[f] = Math.max(0, b - a);
  }
  return { env, hopSec: hop / sr };
}
const timeOf = (f: number, hopSec: number) => Math.round((f + 1) * hopSec * 1000) / 1000;

/** the second the music starts (the first frame within 35 dB of the loudest, above −60 dBFS); null for silence */
export function firstOnsetSec(x: Float32Array, sr: number): number | null {
  const { db, hop } = levels(x, sr);
  let max = Number.NEGATIVE_INFINITY;
  for (const v of db) if (v > max) max = v;
  if (!(max > FLOOR_DB)) return null;
  const thr = Math.max(FLOOR_DB, max - START_REL_DB);
  for (let f = 0; f < db.length; f++) if (db[f]! > thr) return Math.round(f * (hop / sr) * 1000) / 1000;
  return null;
}

/** the tempo (BPM, one decimal) whose beat period best repeats the onsets, inside `range`; null when none does */
export function estimateBpm(
  env: Float32Array,
  hopSec: number,
  range: readonly [number, number] = [60, 240],
): number | null {
  const n = env.length;
  let mean = 0;
  for (const v of env) mean += v;
  mean /= Math.max(1, n);
  const lagOf = (bpm: number) => 60 / bpm / hopSec;
  const lo = Math.max(1, Math.floor(lagOf(range[1])));
  const hi = Math.min(n - 1, Math.ceil(lagOf(range[0])));
  if (hi <= lo) return null;
  const ac = (lag: number) => {
    let s = 0;
    for (let i = lag; i < n; i++) s += (env[i]! - mean) * (env[i - lag]! - mean);
    return s / (n - lag);
  };
  let best = -1;
  let bestV = 0;
  const vals = new Map<number, number>();
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    vals.set(lag, v);
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  if (best < 0) return null;
  // parabolic refinement between the neighbouring lags
  const a = vals.get(best - 1) ?? ac(best - 1);
  const c = vals.get(best + 1) ?? ac(best + 1);
  const den = a - 2 * bestV + c;
  const lag = den < 0 ? best + (0.5 * (a - c)) / den : best;
  return Math.round((60 / (lag * hopSec)) * 10) / 10;
}

export interface Timing {
  /** the second the music starts */
  musicStartSec: number;
  /** the first beat at or after the music start */
  firstBeatSec: number;
  /** the first accented (bar-starting) beat */
  firstDownbeatSec: number;
  bpm: number;
  /** 0–1: how clearly the beat comb stands out of the other phases */
  confidence: number;
}

/** the tempo range each rhythm is counted in (as core `BPM_RANGE`, widened a little for the measurement) */
const RANGE: Record<string, [number, number]> = {
  tango: [92, 156],
  vals: [140, 220],
  milonga: [84, 140],
};

/** music start, first beat, first downbeat and tempo of mono PCM; `bpm` given (a measured or DJ tempo) is used */
export function measureTiming(
  x: Float32Array,
  sr: number,
  o: { bpm?: number | null; rhythm?: string; maxSec?: number } = {},
): Timing | null {
  const start = firstOnsetSec(x, sr);
  if (start === null) return null;
  const { env, hopSec } = onsetEnvelope(x, sr);
  const rhythm = o.rhythm ?? "tango";
  const bpm =
    o.bpm && Number.isFinite(o.bpm) && o.bpm > 30
      ? o.bpm
      : estimateBpm(env, hopSec, RANGE[rhythm] ?? [60, 240]);
  if (!bpm) return null;
  const P = 60 / bpm / hopSec;
  const s0 = Math.max(1, Math.round(start / hopSec) - 2);
  const end = Math.min(env.length - 2, s0 + Math.round((o.maxSec ?? 60) / hopSec));
  const at = (c: number) =>
    c >= 1 && c < env.length - 1 ? env[c]! + 0.5 * Math.max(env[c - 1]!, env[c + 1]!) : 0;
  const comb = (phi: number, every = 1, from = 0) => {
    let s = 0;
    for (let k = from; ; k += every) {
      const c = Math.round(s0 + phi + k * P);
      if (c > end) break;
      s += at(c);
    }
    return s;
  };
  const scores: number[] = [];
  let bestPhi = 0;
  for (let phi = 0; phi < Math.ceil(P); phi++) {
    const v = comb(phi);
    scores.push(v);
    if (v > scores[bestPhi]!) bestPhi = phi;
  }
  const best = scores[bestPhi]!;
  if (!(best > 0)) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const confidence = Math.max(0, Math.min(1, (best - median) / best));
  const bpb = BEATS_PER_BAR[rhythm] ?? 4;
  let bestBar = 0;
  let barV = -1;
  for (let b = 0; b < bpb; b++) {
    const v = comb(bestPhi, bpb, b);
    if (v > barV) {
      barV = v;
      bestBar = b;
    }
  }
  const beatFrame = s0 + bestPhi;
  return {
    musicStartSec: start,
    firstBeatSec: timeOf(beatFrame, hopSec),
    firstDownbeatSec: timeOf(Math.round(beatFrame + bestBar * P), hopSec),
    bpm: Math.round(bpm * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export interface BeatGrid {
  beats: number[];
  bars: number[];
  phrases: number[];
}

/** the grid from a downbeat: every beat of the recording, a bar every `beatsPerBar`, a phrase every 8 bars */
export function beatGrid(o: {
  downbeatSec: number;
  bpm: number;
  durationSec: number;
  beatsPerBar?: number;
  phraseBars?: number;
}): BeatGrid {
  const out: BeatGrid = { beats: [], bars: [], phrases: [] };
  if (!(o.bpm > 0) || !(o.durationSec > 0)) return out;
  const p = 60 / o.bpm;
  const bpb = o.beatsPerBar ?? 4;
  const phrase = o.phraseBars ?? PHRASE_BARS;
  const k0 = -Math.floor(o.downbeatSec / p);
  for (let k = k0; ; k++) {
    const t = o.downbeatSec + k * p;
    if (t > o.durationSec) break;
    if (t < 0) continue;
    const r = Math.round(t * 1000) / 1000;
    out.beats.push(r);
    if (((k % bpb) + bpb) % bpb === 0) out.bars.push(r);
    if (k >= 0 && k % (bpb * phrase) === 0) out.phrases.push(r);
    if (out.beats.length > 4000) break;
  }
  return out;
}
