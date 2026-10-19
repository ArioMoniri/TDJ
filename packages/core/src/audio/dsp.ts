/**
 * Pure-TypeScript audio analysis for 30-second previews (works in Node with ffmpeg-decoded PCM and in the browser with
 * AudioContext.decodeAudioData). No dependencies. Input: mono Float32 PCM in [-1, 1] and its sample rate.
 * Output: AudioFeatures (tempo with tango folding, key/mode via Krumhansl profiles + Camelot code, loudness, brightness,
 * pulse clarity, onset density, intro length). Accuracy on 78-rpm transfers is medium for key and tempo; see docs/research/audio-features.md.
 */
export interface AudioFeatures {
  version: 1;
  durationSec: number;
  bpm: number;
  bpmCandidates: number[];
  pulseClarity: number; // 0..1
  key: string; // e.g. "D"
  mode: "major" | "minor";
  keyConfidence: number; // 0..1
  camelot: string; // e.g. "10B"
  loudnessDb: number; // mean RMS dBFS (not R128, but comparable within the corpus)
  loudnessRange: number; // dB between 10th and 95th percentile of short-term RMS
  brightnessHz: number; // mean spectral centroid
  onsetsPerSec: number;
  introSec: number; // time until the level reaches -30 dBFS
  energy: number; // 0..100 composite usable as a prior for the engine
  chroma: number[]; // 12 mean pitch-class energies, normalised
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Camelot wheel: index by pitch class; B = major, A = minor
const CAMELOT_MAJOR: Record<string, string> = {
  C: "8B",
  "C#": "3B",
  D: "10B",
  "D#": "5B",
  E: "12B",
  F: "7B",
  "F#": "2B",
  G: "9B",
  "G#": "4B",
  A: "11B",
  "A#": "6B",
  B: "1B",
};
const CAMELOT_MINOR: Record<string, string> = {
  C: "5A",
  "C#": "12A",
  D: "7A",
  "D#": "2A",
  E: "9A",
  F: "4A",
  "F#": "11A",
  G: "6A",
  "G#": "1A",
  A: "8A",
  "A#": "3A",
  B: "10A",
};
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** In-place iterative radix-2 FFT (real input in re, zeros in im). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j,
          b = i + j + len / 2;
        const xr = re[b]! * cr - im[b]! * ci,
          xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Simple decimating resampler to ~22050 Hz (box filter) to bound the work. */
export function downmixResample(
  pcm: Float32Array,
  sampleRate: number,
  target = 22050,
): { pcm: Float32Array; sampleRate: number } {
  const f = Math.max(1, Math.floor(sampleRate / target));
  if (f === 1) return { pcm, sampleRate };
  const out = new Float32Array(Math.floor(pcm.length / f));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < f; k++) s += pcm[i * f + k]!;
    out[i] = s / f;
  }
  return { pcm: out, sampleRate: sampleRate / f };
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n,
    mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export interface AnalyzeOptions {
  rhythmHint?: "tango" | "vals" | "milonga" | string;
}

export function analyzePcm(input: Float32Array, inputRate: number, opts: AnalyzeOptions = {}): AudioFeatures {
  const { pcm, sampleRate } = downmixResample(input, inputRate);
  const N = 4096,
    hop = 1024;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const frames = Math.max(1, Math.floor((pcm.length - N) / hop));
  const re = new Float64Array(N),
    im = new Float64Array(N);
  const prevMag = new Float64Array(N / 2);
  const flux = new Float64Array(frames),
    rms = new Float64Array(frames),
    centroid = new Float64Array(frames);
  const chroma = new Float64Array(12);
  const binFreq = (k: number) => (k * sampleRate) / N;
  // precompute pitch class per bin (A4 = 440), only for 60..5000 Hz
  const pc = new Int8Array(N / 2);
  for (let k = 1; k < N / 2; k++) {
    const f = binFreq(k);
    pc[k] = f >= 60 && f <= 5000 ? ((Math.round(12 * Math.log2(f / 440)) % 12) + 9 + 120) % 12 : -1;
  }
  for (let fi = 0; fi < frames; fi++) {
    const off = fi * hop;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = pcm[off + i]!;
      re[i] = v * win[i]!;
      im[i] = 0;
      e += v * v;
    }
    rms[fi] = Math.sqrt(e / N);
    fft(re, im);
    let fl = 0,
      cnum = 0,
      cden = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!);
      const d = m - prevMag[k]!;
      if (d > 0) fl += d;
      prevMag[k] = m;
      const f = binFreq(k);
      cnum += f * m;
      cden += m;
      const p = pc[k]!;
      if (p >= 0) chroma[p] = chroma[p]! + m * m;
    }
    flux[fi] = fl;
    centroid[fi] = cden ? cnum / cden : 0;
  }
  const fps = sampleRate / hop;
  // ---- key
  const csum = chroma.reduce((a, b) => a + b, 0) || 1;
  const ch = Array.from(chroma, (v) => v / csum);
  let best = { score: -2, key: "C", mode: "major" as "major" | "minor" };
  let second = -2;
  for (let r = 0; r < 12; r++) {
    const rot = ch.map((_, i) => ch[(i + r) % 12]!);
    const sMaj = pearson(rot, KS_MAJOR),
      sMin = pearson(rot, KS_MINOR);
    for (const [s, mode] of [
      [sMaj, "major"],
      [sMin, "minor"],
    ] as const) {
      if (s > best.score) {
        second = best.score;
        best = { score: s, key: NOTES[r]!, mode };
      } else if (s > second) second = s;
    }
  }
  const keyConfidence = Math.max(0, Math.min(1, (best.score - second) * 4 + 0.2));
  // ---- tempo via autocorrelation of the onset envelope
  const mean = flux.reduce((a, b) => a + b, 0) / frames;
  const env = Float64Array.from(flux, (v) => Math.max(0, v - mean));
  const minLag = Math.floor((60 / 220) * fps),
    maxLag = Math.ceil((60 / 40) * fps);
  const ac: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < frames; i++) s += env[i]! * env[i - lag]!;
    ac.push(s / (frames - lag));
  }
  const acMax = Math.max(...ac, 1e-9);
  const cands = ac
    .map((v, i) => ({ bpm: 60 / ((i + minLag) / fps), v: v / acMax }))
    .filter((c, i, arr) => i > 0 && i < arr.length - 1 && c.v > arr[i - 1]!.v && c.v >= arr[i + 1]!.v)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  const fold = (bpm: number): number => {
    const hint = opts.rhythmHint;
    const lo = hint === "vals" ? 150 : hint === "milonga" ? 92 : 100,
      hi = hint === "vals" ? 210 : hint === "milonga" ? 132 : 145;
    const mid = (lo + hi) / 2;
    const options = [bpm / 4, bpm / 2, bpm, bpm * 2, bpm * 4];
    const inside = options.filter((b) => b >= lo && b <= hi);
    if (inside.length) return inside.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]!;
    return options.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]!;
  };
  const folded = cands.map((c) => ({ bpm: Math.round(fold(c.bpm) * 10) / 10, v: c.v, raw: c.bpm }));
  // merge octave-equivalent candidates (same folded tempo) so the strongest pulse wins
  const merged = new Map<number, { bpm: number; v: number }>();
  for (const c of folded) {
    const k = Math.round(c.bpm);
    const m = merged.get(k);
    if (m) m.v += c.v;
    else merged.set(k, { bpm: c.bpm, v: c.v });
  }
  const ranked = [...merged.values()].sort((a, b) => b.v - a.v);
  const bpm = ranked[0]?.bpm ?? 0;
  const pulseClarity = Math.max(0, Math.min(1, (cands[0]?.v ?? 0) - 0.15));
  // ---- loudness, brightness, onsets, intro
  const db = Array.from(rms, (v) => 20 * Math.log10(v + 1e-9));
  const sorted = db.slice().sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? -60;
  const loudnessDb = db.reduce((a, b) => a + b, 0) / frames;
  const loudnessRange = p(0.95) - p(0.1);
  const brightnessHz = centroid.reduce((a, b) => a + b, 0) / frames;
  let onsets = 0;
  const thr = mean * 1.5;
  for (let i = 1; i < frames - 1; i++)
    if (flux[i]! > thr && flux[i]! > flux[i - 1]! && flux[i]! >= flux[i + 1]!) onsets++;
  const onsetsPerSec = onsets / (frames / fps);
  let intro = 0;
  for (let i = 0; i < frames; i++) {
    if (db[i]! > -30) {
      intro = i / fps;
      break;
    }
  }
  const energy = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        50 +
          (loudnessDb + 22) * 1.2 +
          (onsetsPerSec - 2) * 6 +
          (pulseClarity - 0.4) * 20 +
          (brightnessHz - 1800) / 60,
      ),
    ),
  );
  return {
    version: 1,
    durationSec: pcm.length / sampleRate,
    bpm,
    bpmCandidates: ranked.map((c) => c.bpm),
    pulseClarity: Math.round(pulseClarity * 100) / 100,
    key: best.key,
    mode: best.mode,
    keyConfidence: Math.round(keyConfidence * 100) / 100,
    camelot: (best.mode === "major" ? CAMELOT_MAJOR : CAMELOT_MINOR)[best.key]!,
    loudnessDb: Math.round(loudnessDb * 10) / 10,
    loudnessRange: Math.round(loudnessRange * 10) / 10,
    brightnessHz: Math.round(brightnessHz),
    onsetsPerSec: Math.round(onsetsPerSec * 100) / 100,
    introSec: Math.round(intro * 10) / 10,
    energy,
    chroma: ch.map((v) => Math.round(v * 1000) / 1000),
  };
}
