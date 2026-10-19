/**
 * BS.1770-4 integrated loudness, sample peak, a true-peak estimate, intro detection and L/R correlation on raw PCM
 * (round7-booth.md §5.3). Pure functions over Float32Array channels so the worker and vitest share them; the
 * page hands decoded `AudioBuffer` channels over through `measureBuffer` (lib/booth/measure.ts).
 */
export interface Measurement {
  /** integrated loudness, LUFS (−Infinity for silence) */
  lufs: number;
  /** sample peak, dBFS */
  peakDbFS: number;
  /** 4× linear-interpolated peak estimate, dBTP */
  truePeakDbTP: number;
  /** seconds of near-silence before the music (0–3) */
  introSec: number;
  /** Pearson correlation of L and R over the first 30 s (1 for mono) */
  correlation: number;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Pre-filter: high shelf (+4 dB above ~1.5 kHz) designed at `fs` from the ITU reference (f0 1681.97 Hz, Q 0.7071752). */
function shelf(fs: number): Biquad {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}
/** RLB weighting: second-order high-pass (f0 38.135 Hz, Q 0.5003270). */
function highpass(fs: number): Biquad {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
}
function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    y[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return y;
}
/** K-weighting: the two cascaded biquads at the buffer's sample rate. */
export function kWeight(x: Float32Array, sampleRate: number): Float32Array {
  return filter(filter(x, shelf(sampleRate)), highpass(sampleRate));
}

const ABS_GATE = -70;
const REL_GATE = -10;
const toLufs = (meanSquare: number) =>
  meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : Number.NEGATIVE_INFINITY;

/**
 * Integrated loudness: 400 ms blocks with 75 % overlap, absolute gate −70 LUFS, relative gate −10 LU below the
 * absolutely gated mean, channel weights 1.0 for L/R. Returns −Infinity for silence.
 */
export function integratedLoudness(channels: Float32Array[], sampleRate: number): number {
  if (!channels.length || !channels[0]!.length) return Number.NEGATIVE_INFINITY;
  const weighted = channels.map((c) => kWeight(c, sampleRate));
  const block = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const n = weighted[0]!.length;
  if (n < block) {
    // shorter than one block: one block of what there is
    let sum = 0;
    for (const c of weighted) for (let i = 0; i < c.length; i++) sum += c[i]! * c[i]!;
    return toLufs(sum / n);
  }
  const blocks: number[] = [];
  for (let start = 0; start + block <= n; start += hop) {
    let sum = 0;
    for (const c of weighted) for (let i = start; i < start + block; i++) sum += c[i]! * c[i]!;
    blocks.push(sum / block);
  }
  const abs = blocks.filter((ms) => toLufs(ms) > ABS_GATE);
  if (!abs.length) return Number.NEGATIVE_INFINITY;
  const absMean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const relGate = toLufs(absMean) + REL_GATE;
  const rel = abs.filter((ms) => toLufs(ms) > relGate);
  if (!rel.length) return Number.NEGATIVE_INFINITY;
  return toLufs(rel.reduce((a, b) => a + b, 0) / rel.length);
}

/** Sample peak in dBFS across channels. */
export function samplePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]!));
  return peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY;
}
/** 4× linear-interpolated peak (an estimate of the inter-sample peak), dBTP. */
export function truePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const c of channels)
    for (let i = 0; i < c.length - 1; i++) {
      const a = c[i]!;
      const b = c[i + 1]!;
      peak = Math.max(
        peak,
        Math.abs(a),
        Math.abs(a + (b - a) * 0.25),
        Math.abs(a + (b - a) * 0.5),
        Math.abs(a + (b - a) * 0.75),
      );
    }
  const lastCh = channels[channels.length - 1];
  if (lastCh?.length) peak = Math.max(peak, Math.abs(lastCh[lastCh.length - 1]!));
  return peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY;
}

/** First 100 ms block whose RMS exceeds −40 dBFS, minus 0.3 s, clamped to [0, 3]. */
export function introSeconds(channels: Float32Array[], sampleRate: number): number {
  const hop = Math.max(1, Math.round(0.1 * sampleRate));
  const n = channels[0]?.length ?? 0;
  const thr = 10 ** (-40 / 10);
  for (let start = 0; start < n; start += hop) {
    const end = Math.min(n, start + hop);
    let sum = 0;
    for (const c of channels) for (let i = start; i < end; i++) sum += c[i]! * c[i]!;
    const ms = sum / ((end - start) * channels.length);
    if (ms > thr) return Math.min(3, Math.max(0, Math.round((start / sampleRate - 0.3) * 1000) / 1000));
  }
  return 0;
}

/** Pearson correlation of the first two channels over the first 30 s (1 when mono or either side is silent). */
export function channelCorrelation(channels: Float32Array[], sampleRate: number): number {
  if (channels.length < 2) return 1;
  const l = channels[0]!;
  const r = channels[1]!;
  const n = Math.min(l.length, r.length, Math.round(30 * sampleRate));
  if (!n) return 1;
  let ml = 0;
  let mr = 0;
  for (let i = 0; i < n; i++) {
    ml += l[i]!;
    mr += r[i]!;
  }
  ml /= n;
  mr /= n;
  let sll = 0;
  let srr = 0;
  let slr = 0;
  for (let i = 0; i < n; i++) {
    const a = l[i]! - ml;
    const b = r[i]! - mr;
    sll += a * a;
    srr += b * b;
    slr += a * b;
  }
  if (sll === 0 || srr === 0) return 1;
  return slr / Math.sqrt(sll * srr);
}

/** Everything the engine needs from one decoded item. */
export function measurePcm(channels: Float32Array[], sampleRate: number): Measurement {
  return {
    lufs: integratedLoudness(channels, sampleRate),
    peakDbFS: samplePeakDb(channels),
    truePeakDbTP: truePeakDb(channels),
    introSec: introSeconds(channels, sampleRate),
    correlation: channelCorrelation(channels, sampleRate),
  };
}
