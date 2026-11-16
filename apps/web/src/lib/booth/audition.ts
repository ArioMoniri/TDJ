import type { AudioParamLike } from "./engine";
import {
  applyEqPoints,
  applyIncoming,
  applyOutgoing,
  auditionSpan,
  BASS_SHELF_HZ,
  eqLanes,
  HIGH_SHELF_HZ,
  MID_PEAK_HZ,
  type TransitionWindow,
} from "./transition";

/**
 * Wave 4 — hear a transition before the night uses it: the last ~8 s of the outgoing side, through the transition,
 * into the first ~8 s of the incoming, rendered offline with the same curves and EQ the engine schedules, then played
 * by the pre-listen player (the headphones output during the night, never the room).
 */

export interface AuditionSide {
  buffer: AudioBuffer;
  /** seconds into the buffer where the side starts playing (a cortina's cue-in, a cued song) */
  offset: number;
  /** how long it plays from there */
  length: number;
  /** its gain (normalisation, a cortina's level) */
  gain: number;
}

/** Render the transition into one buffer (stereo, 44.1 kHz). */
export async function renderTransition(
  Off: typeof OfflineAudioContext,
  o: { out: AuditionSide; in: AuditionSide; window: TransitionWindow },
): Promise<AudioBuffer> {
  const rate = 44100;
  const span = auditionSpan(o.window, { outLen: o.out.length, inLen: o.in.length });
  const ctx = new Off(2, Math.max(1, Math.ceil(span.totalSec * rate)), rate);
  const w = o.window;
  const lane = (side: AuditionSide) => {
    const src = ctx.createBufferSource();
    src.buffer = side.buffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = BASS_SHELF_HZ;
    low.gain.value = 0;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = MID_PEAK_HZ;
    mid.gain.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = HIGH_SHELF_HZ;
    high.gain.value = 0;
    const g = ctx.createGain();
    src.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(g);
    g.connect(ctx.destination);
    return { src, low, mid, high, g };
  };
  // the outgoing: from `outFrom` to its end, its end at `outEnd` on the audition's clock
  const a = lane(o.out);
  const outEnd = o.out.length - span.outFrom;
  a.g.gain.setValueAtTime(o.out.gain, 0);
  applyOutgoing(a.g.gain as unknown as AudioParamLike, {
    endsAt: outEnd,
    base: o.out.gain,
    window: w,
    curve: w.curveOut,
    now: 0,
    notBefore: 0.01,
  });
  a.src.start(0, o.out.offset + span.outFrom, Math.max(0.01, outEnd + Math.min(0, w.outStop)));
  // the incoming: from its start, at `inAt`, for `inUntil`, with a short fade at the audition's end
  const b = lane(o.in);
  applyIncoming(b.g.gain as unknown as AudioParamLike, {
    when: span.inAt,
    base: o.in.gain,
    window: w,
    curve: w.curveIn,
  });
  const tailAt = span.inAt + span.inUntil;
  b.g.gain.setValueAtTime(o.in.gain, Math.max(span.inAt + w.inFade.len, tailAt - 0.4));
  b.g.gain.linearRampToValueAtTime(0, tailAt);
  b.src.start(span.inAt, o.in.offset, span.inUntil);
  // the same EQ the engine schedules: the bass swap, or the three-band swap
  const eq = eqLanes(w);
  if (eq) {
    const P = (f: BiquadFilterNode) => f.gain as unknown as AudioParamLike;
    applyEqPoints(P(a.low), eq.out.low, outEnd);
    applyEqPoints(P(a.mid), eq.out.mid, outEnd);
    applyEqPoints(P(a.high), eq.out.high, outEnd);
    applyEqPoints(P(b.low), eq.in.low, outEnd);
    applyEqPoints(P(b.mid), eq.in.mid, outEnd);
    applyEqPoints(P(b.high), eq.in.high, outEnd);
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV of a rendered buffer (what the pre-listen <audio> element plays). */
export function encodeWav(
  b: Pick<AudioBuffer, "numberOfChannels" | "sampleRate" | "length" | "getChannelData">,
): Blob {
  const ch = Math.max(1, b.numberOfChannels);
  const n = b.length;
  const bytes = 44 + n * ch * 2;
  const v = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  return new Blob([v.buffer], { type: "audio/wav" });
}
