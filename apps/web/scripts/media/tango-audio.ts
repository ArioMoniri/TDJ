/**
 * Stand-in audio for the media captures: a synthesised, tango-shaped signal, so a waveform in the Booth or the
 * transition editor looks like music (2026-11, owner: the old 220 Hz sine drew flat stripes, "not a real music
 * outline"). Nothing recorded, nothing copyrighted: every sample is computed here.
 *
 * What makes it read as a tango on a waveform:
 * - a 4/4 marcato: a bass note and a piano stab on every beat, the downbeats heavier, an arrastre (a short swell)
 *   dragging into beat 1;
 * - a bandoneón line (two slightly detuned reeds, a bellows envelope) and a string pad that swells across a phrase;
 * - phrases of four bars that grow, then a stop (a beat of near-silence) before the next one, as the orchestras of
 *   the 1940s do; a soft head before the music and the final "chan-chan" with a decaying tail.
 *
 * `tangoWav(seed)` varies the key, the tempo, the balance between marcato and legato and where the stops fall, so
 * two sides of a transition never look alike.
 */

const RATE = 22050;

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** a few cycles of a reed: odd and even harmonics falling off, a little brighter than a saw at the top */
function reed(phase: number) {
  let v = 0;
  for (let h = 1; h <= 7; h++) v += Math.sin(phase * h) / (h * (h % 2 ? 1 : 1.6));
  return v * 0.45;
}

/** a 16-bit mono WAV of `sec` seconds, deterministic for a seed */
export function tangoWav(seed = 1, sec = 30): Buffer {
  const r = rng(seed * 7919 + 13);
  const n = Math.round(RATE * sec);
  const out = new Float32Array(n);
  const bpm = 112 + Math.floor(r() * 16); // 112–127: a tango's walk
  const beat = 60 / bpm;
  const key = 45 + Math.floor(r() * 7); // A2–D#3 roots
  const minor = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15];
  const marcato = 0.55 + r() * 0.45; // how hard the beats hit against the legato voices
  const head = 0.35 + r() * 0.3; // the silence before the first note
  const stopEvery = 2 + Math.floor(r() * 2); // a stop after every 2nd or 3rd phrase
  // the harmony: i – iv – V – i, one chord per bar, a phrase is four bars
  const prog = [0, 5, 7, 0, 3, 5, 7, 7, 0, 8, 7, 0];
  const bars = Math.ceil((sec - head) / (beat * 4));
  const add = (i: number, v: number) => {
    if (i >= 0 && i < n) out[i]! += v;
  };

  for (let bar = 0; bar < bars; bar++) {
    const phrase = Math.floor(bar / 4);
    const inPhrase = bar % 4;
    const t0 = head + bar * beat * 4;
    const last = t0 + beat * 4 > sec - 2.2; // the final bar: chan-chan
    // a phrase grows from soft to full; some phrases are quieter (a variación, a piano solo)
    const quiet = r() < 0.22 ? 0.55 : 1;
    const grow = (0.62 + 0.38 * (inPhrase / 3)) * quiet;
    const stop = inPhrase === 3 && (phrase + 1) % stopEvery === 0;
    const root = key + prog[(phrase * 4 + inPhrase) % prog.length]!;

    if (last) {
      // chan … chan: two hits, the second a beat and a half later, then the hall's tail
      for (const [k, at] of [
        [1, 0],
        [0.85, 1.5],
      ] as const) {
        const s = Math.round((t0 + at * beat) * RATE);
        const len = Math.round(RATE * (at ? 1.6 : 0.35));
        for (let i = 0; i < len; i++) {
          const t = i / RATE;
          const env = Math.exp(-t * (at ? 2.6 : 9)) * k;
          const v =
            Math.sin(2 * Math.PI * hz(key - 12) * t) * 0.9 +
            reed(2 * Math.PI * hz(key + 12) * t) * 0.5 +
            reed(2 * Math.PI * hz(key + 19) * t) * 0.3;
          add(s + i, v * env * 0.55);
        }
      }
      break;
    }

    for (let b = 0; b < 4; b++) {
      if (stop && b >= 2) continue; // the stop: the bar breaks off after beat 2
      const tb = t0 + b * beat;
      const down = b === 0 || b === 2;
      const acc = (down ? 1 : 0.72) * grow * (0.75 + 0.25 * r());
      // bass: a plucked double-bass note, root on 1, fifth on 3, walking on 2 and 4
      const bassNote = root - 12 + (b === 2 ? 7 : b % 2 ? minor[Math.floor(r() * 4)]! : 0);
      const sb = Math.round(tb * RATE);
      const blen = Math.round(RATE * beat * 0.9);
      for (let i = 0; i < blen; i++) {
        const t = i / RATE;
        const env = Math.min(1, t * 200) * Math.exp(-t * 5.5);
        add(sb + i, Math.sin(2 * Math.PI * hz(bassNote) * t) * env * 0.5 * acc);
      }
      // piano: a short chord stab, the marcato
      const plen = Math.round(RATE * 0.18);
      for (let i = 0; i < plen; i++) {
        const t = i / RATE;
        const env = Math.min(1, t * 400) * Math.exp(-t * 22);
        let v = 0;
        for (const iv of [0, 3, 7, 12]) v += Math.sin(2 * Math.PI * hz(root + 12 + iv) * t);
        // a click of hammer noise on the attack
        v += (r() * 2 - 1) * Math.exp(-t * 90) * 1.5;
        add(sb + i, v * env * 0.17 * acc * marcato);
      }
      // arrastre: the bandoneones drag into the downbeat (a fast swell over the last eighth)
      if (b === 3 && !stop) {
        const s = Math.round((tb + beat * 0.5) * RATE);
        const len = Math.round(RATE * beat * 0.5);
        for (let i = 0; i < len; i++) {
          const t = i / RATE;
          const env = (i / len) ** 2.2;
          add(s + i, reed(2 * Math.PI * hz(root + 12) * t) * env * 0.42 * grow * marcato);
        }
      }
    }

    // bandoneón melody: eighths and quarters over the bar, two reeds a few cents apart
    let tm = t0;
    const end = t0 + beat * (stop ? 2 : 4);
    while (tm < end - 0.05) {
      const len = beat * (r() < 0.6 ? 0.5 : r() < 0.7 ? 1 : 1.5);
      const note = root + 12 + minor[Math.floor(r() * minor.length)]!;
      const s = Math.round(tm * RATE);
      const l = Math.round(Math.min(len, end - tm) * RATE);
      const f1 = hz(note);
      const f2 = f1 * 1.004;
      const legato = 1 - marcato * 0.5;
      for (let i = 0; i < l; i++) {
        const t = i / RATE;
        const rel = (l - i) / RATE;
        const env =
          Math.min(1, t * 60) * Math.min(1, rel * (legato > 0.6 ? 20 : 45)) * (0.75 + 0.25 * Math.sin(t * 9));
        const v = reed(2 * Math.PI * f1 * t) + reed(2 * Math.PI * f2 * t);
        add(s + i, v * env * 0.16 * grow);
      }
      tm += len;
    }

    // strings: a pad on the chord, swelling across the bar (none in a stop's silence)
    const sl = Math.round(beat * (stop ? 2 : 4) * RATE);
    const ss = Math.round(t0 * RATE);
    for (let i = 0; i < sl; i++) {
      const t = i / RATE;
      const swell = Math.sin(Math.PI * (i / sl)) ** 1.5;
      let v = 0;
      for (const iv of [0, 7, 15]) {
        const f = hz(root + 12 + iv);
        v += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 5.2 * t) * 0.6);
      }
      add(ss + i, v * swell * 0.07 * grow * (1.3 - marcato * 0.5));
    }
  }

  // a soft hall: a few early reflections, then normalise to −1 dBFS
  const verb = new Float32Array(n);
  for (const [d, g] of [
    [0.031, 0.22],
    [0.047, 0.18],
    [0.083, 0.12],
    [0.121, 0.08],
  ] as const) {
    const k = Math.round(d * RATE);
    for (let i = k; i < n; i++) verb[i]! += out[i - k]! * g;
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    out[i]! += verb[i]!;
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  const gain = 0.89 / peak;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i]! * gain)) * 32767), i * 2);

  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** a stable small number for a URL, so the same song always gets the same stand-in */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}
