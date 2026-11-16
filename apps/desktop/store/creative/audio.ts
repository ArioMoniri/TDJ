/**
 * An original, synthesised tango-like bed for the app previews (and the Booth's local clip in the captures, so the
 * transition editor draws the waveform of music, not of a test tone). No recording, no sample, no copyrighted music:
 * a marcato in four in A minor (Am – E7 – Am – Dm – E7 – Am), a plucked bass on every beat, short piano-like chords
 * with the accents of a tango marcato, a syncopa every fourth bar, and a reedy lead with a little vibrato that
 * stands in for a bandoneon. 48 kHz stereo, 16-bit WAV.
 */

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);
// MIDI notes: chord tones per bar, bass root
const BARS: Array<{ bass: number; chord: number[]; lead: number[] }> = [
  { bass: 45, chord: [57, 60, 64], lead: [76, 74, 72, 71] },
  { bass: 40, chord: [56, 59, 62, 64], lead: [71, 72, 74, 68] },
  { bass: 45, chord: [57, 60, 64], lead: [69, 72, 76, 81] },
  { bass: 50, chord: [57, 62, 65], lead: [77, 76, 74, 72] },
  { bass: 40, chord: [56, 59, 62, 64], lead: [71, 74, 72, 71] },
  { bass: 45, chord: [57, 60, 64], lead: [69, 69, 72, 69] },
];

export function tangoBed(
  seconds: number,
  rate = 48000,
  opts: { fadeOut?: number } = {},
): { l: Float32Array; r: Float32Array } {
  const n = Math.round(seconds * rate);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const bpm = 116;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const add = (t0: number, dur: number, f: (t: number) => number, gainL: number, gainR: number) => {
    const s0 = Math.max(0, Math.round(t0 * rate));
    const s1 = Math.min(n, Math.round((t0 + dur) * rate));
    for (let s = s0; s < s1; s++) {
      const v = f(s / rate - t0);
      l[s] = l[s]! + v * gainL;
      r[s] = r[s]! + v * gainR;
    }
  };
  const pluck = (freq: number, decay: number) => (t: number) =>
    Math.exp(-t / decay) *
    (Math.sin(2 * Math.PI * freq * t) +
      0.35 * Math.sin(4 * Math.PI * freq * t) +
      0.12 * Math.sin(6 * Math.PI * freq * t));
  const reed = (freq: number, dur: number) => (t: number) => {
    const env = Math.min(1, t / 0.06) * Math.min(1, (dur - t) / 0.08);
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t);
    const ph = 2 * Math.PI * freq * vib * t;
    // odd and even partials, softly: a reed, not a square
    return (
      env *
      (Math.sin(ph) +
        0.5 * Math.sin(2 * ph) +
        0.33 * Math.sin(3 * ph) +
        0.2 * Math.sin(4 * ph) +
        0.1 * Math.sin(5 * ph)) *
      0.45
    );
  };
  const bars = Math.ceil(seconds / bar);
  for (let b = 0; b < bars; b++) {
    const B = BARS[b % BARS.length]!;
    const t = b * bar;
    const syncopa = b % 4 === 3;
    // bass: marcato on every beat (accents on 1 and 3); a syncopa bar plays 1, the "and" of 2, and 4
    const beats = syncopa ? [0, 1.5, 3] : [0, 1, 2, 3];
    for (const k of beats) {
      const acc = k === 0 || k === 2 || syncopa ? 1 : 0.65;
      add(t + k * beat, beat * 0.9, pluck(NOTE(B.bass), 0.18), 0.32 * acc, 0.32 * acc);
      add(t + k * beat, beat * 0.9, pluck(NOTE(B.bass + 12), 0.09), 0.1 * acc, 0.1 * acc);
      // chords, short and dry, a little to the left
      for (const c of B.chord)
        add(t + k * beat + 0.012, beat * 0.5, pluck(NOTE(c), 0.07), 0.085 * acc, 0.05 * acc);
    }
    // the lead: long notes in the first half of each phrase, answered in the second
    if (b >= 2) {
      const notes = B.lead;
      for (let i = 0; i < notes.length; i++) {
        const d = beat * (b % 2 ? 1 : 0.95);
        add(t + i * beat, d, reed(NOTE(notes[i]!), d), 0.06, 0.11);
      }
    }
  }
  // gentle limiter and fades
  const fadeIn = 0.6 * rate;
  const fadeOut = (opts.fadeOut ?? 1.5) * rate;
  let peak = 0;
  for (let s = 0; s < n; s++) peak = Math.max(peak, Math.abs(l[s]!), Math.abs(r[s]!));
  const g = peak ? 0.5 / peak : 1;
  for (let s = 0; s < n; s++) {
    const f = Math.min(1, s / fadeIn, (n - s) / fadeOut);
    l[s] = Math.tanh(l[s]! * g * 1.2) * f * 0.8;
    r[s] = Math.tanh(r[s]! * g * 1.2) * f * 0.8;
  }
  return { l, r };
}

/** 16-bit PCM WAV, stereo (or mono: the left channel) */
export function wav(ch: { l: Float32Array; r?: Float32Array }, rate = 48000): Buffer {
  const channels = ch.r ? 2 : 1;
  const n = ch.l.length;
  const data = Buffer.alloc(n * 2 * channels);
  for (let s = 0; s < n; s++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch.l[s]!)) * 32767), s * 2 * channels);
    if (ch.r) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch.r[s]!)) * 32767), s * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2 * channels, 28);
  h.writeUInt16LE(2 * channels, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
