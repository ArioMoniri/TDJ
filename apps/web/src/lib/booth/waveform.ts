import { SONG_CUE_MIN_SEC } from "@tdj/core";

/**
 * Round 22: the per-song waveform and its cue / stop handles. `peaks` reduces decoded audio to bars; `cueFromX` and
 * `clampCue` turn a drag into seconds the plan accepts (`songCues`: at least SONG_CUE_MIN_SEC of music).
 */
export function peaks(data: ArrayLike<number>, buckets: number): number[] {
  const n = Math.max(1, Math.floor(buckets));
  const out = new Array<number>(n).fill(0);
  const per = data.length / n;
  for (let b = 0; b < n; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(data.length, Math.floor((b + 1) * per));
    let m = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(data[i]!);
      if (v > m) m = v;
    }
    out[b] = Math.min(1, m);
  }
  return out;
}

/** Peaks of an AudioBuffer (all channels mixed by maximum). */
export function bufferPeaks(
  b: Pick<AudioBuffer, "numberOfChannels" | "getChannelData">,
  buckets: number,
): number[] {
  let acc: number[] | null = null;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const p = peaks(b.getChannelData(c), buckets);
    acc = acc ? acc.map((v, i) => Math.max(v, p[i]!)) : p;
  }
  return acc ?? new Array<number>(Math.max(1, buckets)).fill(0);
}

/** x (px) in a waveform `width` px wide → seconds of a `dur` s side, clamped, to 0.1 s. */
export function cueFromX(x: number, width: number, dur: number): number {
  if (width <= 0) return 0;
  return Math.round(Math.max(0, Math.min(dur, (x / width) * dur)) * 10) / 10;
}

/** Keep the cue and the stop inside the side and SONG_CUE_MIN_SEC apart; the handle being dragged gives way last. */
export function clampCue(
  c: { inSec: number; outSec: number },
  dur: number,
  moving: "in" | "out",
): { inSec: number; outSec: number } {
  const min = Math.min(SONG_CUE_MIN_SEC, dur);
  let inSec = Math.max(0, Math.min(dur - min, c.inSec));
  let outSec = Math.max(min, Math.min(dur, c.outSec));
  if (outSec - inSec < min) {
    if (moving === "in") inSec = Math.max(0, outSec - min);
    else outSec = Math.min(dur, inSec + min);
  }
  inSec = Math.round(inSec * 10) / 10;
  outSec = Math.round(outSec * 10) / 10;
  return { inSec, outSec };
}
