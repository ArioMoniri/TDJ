import { peaks } from "./waveform";

/**
 * Wave 4 — the transition editor's coloured waveform: the low, mid and high energy of a side over time, drawn as three
 * mirrored layers (lows widest, highs in front). The audio is split with biquad filters in an OfflineAudioContext
 * (`renderBands`), then each band is reduced to an envelope of `perSec` buckets a second (`bandEnvelopes`).
 */
export interface Bands {
  low: number[];
  mid: number[];
  high: number[];
  /** buckets per second */
  perSec: number;
}
/** low | mid at 250 Hz, mid | high at 2.5 kHz */
export const BAND_SPLIT_HZ = [250, 2500] as const;
export const BANDS_PER_SEC = 20;
/** the rate the bands are rendered at: highs up to its Nyquist (5.5 kHz) are plenty for a picture */
const RENDER_RATE = 11025;

/** A band normalised to its own loud end (the 98th percentile), so a quiet band still reads; clamped to 0…1. */
export function normalise(v: number[]): number[] {
  if (!v.length) return v;
  const sorted = [...v].sort((a, b) => a - b);
  const top = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] ?? 0;
  if (top <= 1e-6) return v.map(() => 0);
  return v.map((x) => Math.min(1, x / top));
}

/** Three filtered channels (low, mid, high) at `sampleRate` → three envelopes of `perSec` buckets a second. */
export function bandEnvelopes(
  ch: readonly [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
  sampleRate: number,
  perSec = BANDS_PER_SEC,
): Bands {
  const len = ch[0].length;
  const buckets = Math.max(1, Math.round((len / sampleRate) * perSec));
  const [low, mid, high] = ch.map((c) => normalise(peaks(c, buckets))) as [number[], number[], number[]];
  return { low, mid, high, perSec: buckets / Math.max(1e-9, len / sampleRate) };
}

/** The three bands at `sec` into the side, or null outside it. */
export function bandAt(b: Bands, sec: number): { low: number; mid: number; high: number } | null {
  const k = Math.floor(sec * b.perSec);
  if (sec < 0 || k >= b.low.length) return null;
  return { low: b.low[k] ?? 0, mid: b.mid[k] ?? 0, high: b.high[k] ?? 0 };
}

/** Split a decoded side into its bands offline (lowpass · bandpass · highpass into three channels). */
export async function renderBands(
  buffer: AudioBuffer,
  Off: typeof OfflineAudioContext,
  perSec = BANDS_PER_SEC,
): Promise<Bands> {
  const len = Math.max(1, Math.ceil(buffer.duration * RENDER_RATE));
  const ctx = new Off(3, len, RENDER_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = (type: BiquadFilterType, hz: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = Math.SQRT1_2;
    return f;
  };
  const [lo, hi] = BAND_SPLIT_HZ;
  const low = filter("lowpass", lo);
  const midHp = filter("highpass", lo);
  const midLp = filter("lowpass", hi);
  const high = filter("highpass", hi);
  const merge = ctx.createChannelMerger(3);
  src.connect(low).connect(merge, 0, 0);
  src.connect(midHp).connect(midLp).connect(merge, 0, 1);
  src.connect(high).connect(merge, 0, 2);
  merge.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return bandEnvelopes(
    [out.getChannelData(0), out.getChannelData(1), out.getChannelData(2)],
    RENDER_RATE,
    perSec,
  );
}
