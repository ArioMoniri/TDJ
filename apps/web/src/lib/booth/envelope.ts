/**
 * Pure gain curves and constants (round7-booth.md §5.1). The engine applies `fadeOutCurve` with
 * `gain.setValueCurveAtTime(curve, t0, fadeSec)`: a −60 dB logarithmic decay whose last point is exactly 0, so a
 * cortina reaches true silence at its planned stop second instead of trailing off at −60 dB.
 */

/** 5 ms linear ramp from 0 at every start (no click). */
export const DECLICK_IN = 0.005;
/** 20 ms linear ramp to 0 before every `source.stop()`. */
export const DECLICK_OUT = 0.02;
/** Emergency stop: everything to silence in one second. */
export const EMERGENCY_FADE = 1.0;
/** Master fader / mute ramps (time constant). */
export const PAUSE_RAMP = 0.02;
/** Spotify has no automation: the fade is `setVolume()` steps at this interval. */
export const VOLUME_STEP_SEC = 0.05;
/** Lowest point of the log curves: −60 dB. */
export const FADE_FLOOR_DB = -60;

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => (g <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(g));

/** g[i] = 10^((−60 · i/(n−1)) / 20) for i < n−1, g[n−1] = 0. Scaled by `base` (the item's normalisation gain). */
export function fadeOutCurve(n = 64, base = 1): Float32Array {
  const out = new Float32Array(Math.max(2, n));
  const last = out.length - 1;
  for (let i = 0; i < last; i++) out[i] = base * 10 ** ((FADE_FLOOR_DB * i) / last / 20);
  out[last] = 0;
  return out;
}
/** The mirror image: g[0] = 0, rising along the same log law to `base`. */
export function fadeInCurve(n = 64, base = 1): Float32Array {
  const down = fadeOutCurve(n, base);
  const out = new Float32Array(down.length);
  for (let i = 0; i < down.length; i++) out[i] = down[down.length - 1 - i]!;
  return out;
}
/** Number of 50 ms `setVolume()` steps for a fade of `sec` seconds (a 4 s fade ≈ 80 calls). */
export const volumeSteps = (sec: number) => Math.max(2, Math.round(sec / VOLUME_STEP_SEC));
