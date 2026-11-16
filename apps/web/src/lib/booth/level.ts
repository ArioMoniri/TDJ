/**
 * 2026-11 (the owner: "the decibel shower doesn't work"): the Booth's level meter, as pure math the runtime
 * (levelRuntime.ts) feeds with analyser frames and the vitest feeds with known signals.
 *
 * - peak: the sample peak of each frame, dBFS; the bar rises at once and falls at `PEAK_FALL_DB_PER_SEC` (a PPM's
 *   ballistics), a tick holds the highest peak for `PEAK_HOLD_SEC`;
 * - loudness: BS.1770 K-weighted mean square (channels summed), momentary over 400 ms and short-term over 3 s, LUFS;
 * - clip: a frame whose sample peak reaches `CLIP_DBFS` lights the indicator for `CLIP_HOLD_SEC` (a tap clears it).
 *
 * The K-weighting runs in the audio graph (two BiquadFilterNodes with `K_SHELF` / `K_HIGHPASS`); this module only
 * integrates what the analysers hand over.
 */

export const LUFS_OFFSET = -0.691;
export const METER_FLOOR_DB = -60;
export const PEAK_FALL_DB_PER_SEC = 20;
export const PEAK_HOLD_SEC = 1.5;
export const CLIP_DBFS = -0.1;
export const CLIP_HOLD_SEC = 5;
export const MOMENTARY_SEC = 0.4;
export const SHORT_TERM_SEC = 3;

/**
 * The K-weighting as Web Audio biquads: the BS.1770 pre-filter is a +4 dB high shelf (ITU midpoint 1682 Hz, Q 0.707),
 * the RLB weighting a second-order high-pass at 38 Hz, Q 0.5. A `highshelf` BiquadFilterNode is the Audio EQ
 * Cookbook shelf with slope 1, which matches it best with its corner at 1470 Hz; a `highpass` node reads its Q in dB, so 0.5 is
 * 20·log10(0.5) there. The vitest runs the browser's biquads against the ITU filters (within 0.1 dB, 20 Hz–16 kHz).
 */
export const K_SHELF = { type: "highshelf" as const, frequency: 1470, gain: 4 };
export const K_HIGHPASS = { type: "highpass" as const, frequency: 38.135, Q: 20 * Math.log10(0.500327) };

/** A Web Audio BiquadFilterNode's coefficients (the spec's Audio EQ Cookbook formulas), normalised to a0 = 1. */
export function webAudioBiquad(
  f:
    | { type: "highshelf"; frequency: number; gain: number }
    | { type: "highpass"; frequency: number; Q: number },
  fs: number,
): { b0: number; b1: number; b2: number; a1: number; a2: number } {
  const w = (2 * Math.PI * f.frequency) / fs;
  const c = Math.cos(w);
  let b: [number, number, number];
  let a: [number, number, number];
  if (f.type === "highshelf") {
    const A = 10 ** (f.gain / 40);
    const al = (Math.sin(w) / 2) * Math.SQRT2; // slope S = 1
    const sa = 2 * Math.sqrt(A) * al;
    b = [A * (A + 1 + (A - 1) * c + sa), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - sa)];
    a = [A + 1 - (A - 1) * c + sa, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - sa];
  } else {
    const Q = 10 ** (f.Q / 20);
    const al = Math.sin(w) / (2 * Q);
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    a = [1 + al, -2 * c, 1 - al];
  }
  return { b0: b[0] / a[0], b1: b[1] / a[0], b2: b[2] / a[0], a1: a[1] / a[0], a2: a[2] / a[0] };
}

export const dbFromMs = (ms: number): number => (ms > 0 ? 10 * Math.log10(ms) : Number.NEGATIVE_INFINITY);
export const dbFromAmp = (a: number): number => (a > 0 ? 20 * Math.log10(a) : Number.NEGATIVE_INFINITY);
/** LUFS of a K-weighted mean square summed over channels */
export const lufsFromMs = (ms: number): number =>
  ms > 0 ? LUFS_OFFSET + dbFromMs(ms) : Number.NEGATIVE_INFINITY;

/** Sample peak (linear) and mean square of one analyser frame. */
export function frameStats(buf: ArrayLike<number>): { peak: number; ms: number } {
  let pk = 0;
  let sq = 0;
  const n = buf.length;
  for (let i = 0; i < n; i++) {
    const v = buf[i]!;
    const a = v < 0 ? -v : v;
    if (a > pk) pk = a;
    sq += v * v;
  }
  return { peak: pk, ms: n ? sq / n : 0 };
}

export interface MeterFrame {
  /** seconds (any monotonic clock) */
  t: number;
  /** the frame's sample peak over all channels, linear */
  peak: number;
  /** the frame's K-weighted mean square, summed over channels (BS.1770 channel weights 1.0 for L / R) */
  msK: number;
}

export interface MeterReading {
  /** the bar: dBFS with PPM ballistics (−Infinity when nothing plays) */
  peakDb: number;
  /** the held peak tick, dBFS */
  holdDb: number;
  /** LUFS over the last 400 ms */
  momentaryLufs: number;
  /** LUFS over the last 3 s */
  shortTermLufs: number;
  /** a frame reached CLIP_DBFS within the last CLIP_HOLD_SEC (until cleared) */
  clip: boolean;
}

export const SILENT_READING: MeterReading = {
  peakDb: Number.NEGATIVE_INFINITY,
  holdDb: Number.NEGATIVE_INFINITY,
  momentaryLufs: Number.NEGATIVE_INFINITY,
  shortTermLufs: Number.NEGATIVE_INFINITY,
  clip: false,
};

/** The meter's state between frames: ballistics, peak hold, the loudness windows, the clip latch. */
export class LevelMeter {
  private frames: MeterFrame[] = [];
  private bar = Number.NEGATIVE_INFINITY;
  private hold = { db: Number.NEGATIVE_INFINITY, at: Number.NEGATIVE_INFINITY };
  private clipAt = Number.NEGATIVE_INFINITY;
  private lastT: number | null = null;

  push(f: MeterFrame): MeterReading {
    const dt = this.lastT === null ? 0 : Math.max(0, f.t - this.lastT);
    this.lastT = f.t;
    const db = dbFromAmp(f.peak);
    // the bar: up at once, down at the fall rate
    const fallen = this.bar - PEAK_FALL_DB_PER_SEC * dt;
    this.bar = Math.max(db, fallen < METER_FLOOR_DB - 20 ? Number.NEGATIVE_INFINITY : fallen);
    // the tick: held, then it falls like the bar
    if (db >= this.hold.db) this.hold = { db, at: f.t };
    else if (f.t - this.hold.at > PEAK_HOLD_SEC) {
      const d = this.hold.db - PEAK_FALL_DB_PER_SEC * dt;
      this.hold = {
        db: Math.max(db, d < METER_FLOOR_DB - 20 ? Number.NEGATIVE_INFINITY : d),
        at: this.hold.at,
      };
    }
    if (db >= CLIP_DBFS) this.clipAt = f.t;
    this.frames.push(f);
    const cut = f.t - SHORT_TERM_SEC;
    let k = 0;
    while (k < this.frames.length && this.frames[k]!.t <= cut) k++;
    if (k) this.frames.splice(0, k);
    return this.read(f.t);
  }

  read(now: number): MeterReading {
    return {
      peakDb: this.bar,
      holdDb: this.hold.db,
      momentaryLufs: lufsFromMs(windowMean(this.frames, now - MOMENTARY_SEC)),
      shortTermLufs: lufsFromMs(windowMean(this.frames, now - SHORT_TERM_SEC)),
      clip: now - this.clipAt <= CLIP_HOLD_SEC,
    };
  }

  clearClip(): void {
    this.clipAt = Number.NEGATIVE_INFINITY;
  }
  reset(): void {
    this.frames = [];
    this.bar = Number.NEGATIVE_INFINITY;
    this.hold = { db: Number.NEGATIVE_INFINITY, at: Number.NEGATIVE_INFINITY };
    this.clipAt = Number.NEGATIVE_INFINITY;
    this.lastT = null;
  }
}

function windowMean(frames: MeterFrame[], from: number): number {
  let s = 0;
  let n = 0;
  for (const f of frames)
    if (f.t > from) {
      s += f.msK;
      n++;
    }
  return n ? s / n : 0;
}

/** Where a side's loudness number comes from (the static value the meter shows for Spotify). */
export type SongLoudnessFrom = "file" | "clip" | "catalogue";
export interface SongLoudness {
  /** LUFS (file / clip: BS.1770 integrated) or the catalogue's mean RMS dBFS (comparable, not R128) */
  lufs: number;
  from: SongLoudnessFrom;
}

/**
 * The best loudness known for a side: a measurement of the playing file or clip, else one cached from an earlier
 * file or clip of the same side, else the catalogue's analysed level. Null when nothing is known.
 */
export function songLoudness(o: {
  measured?: { lufs?: number } | null;
  measuredFrom?: "file" | "clip" | null;
  cached?: SongLoudness | null;
  catalogueDb?: number | null;
}): SongLoudness | null {
  const m = o.measured?.lufs;
  if (m !== undefined && Number.isFinite(m) && o.measuredFrom) return { lufs: m, from: o.measuredFrom };
  if (o.cached && Number.isFinite(o.cached.lufs)) return o.cached;
  if (o.catalogueDb !== undefined && o.catalogueDb !== null && Number.isFinite(o.catalogueDb))
    return { lufs: o.catalogueDb, from: "catalogue" };
  return null;
}

/**
 * How the night's per-song normalisation reaches the room for the item at the playhead:
 * - "graph": files and clips — the engine's gain node (measured or prior, plus the DJ's trim);
 * - "sdk": the Spotify player in this page — the per-item gain, but only ever down (a player volume cannot exceed 1);
 * - "spotify": a Spotify Connect device — no per-item gain at all: Spotify's own "Normalize volume" does the job;
 * - "none": an external player without gain (YouTube on iOS).
 */
export type NormalisationPath = "graph" | "sdk" | "spotify" | "none";
export function normalisationPath(
  source: string | null | undefined,
  caps: { gain: boolean },
): NormalisationPath {
  if (source === "file" || source === "preview") return "graph";
  if (source === "spotify") return caps.gain ? "sdk" : "spotify";
  return caps.gain ? "sdk" : "none";
}
