import { FN_KIND, type FnId } from "./mappings";
import { guessRelative, type MidiMsg, midiKey, type RelMode } from "./midi";

export interface Learned {
  key: string;
  rel?: RelMode;
  lsb?: number;
}

/** messages of one moving control before it is taken (a fader bumped once is not a choice) */
export const LEARN_MOVES = 3;

/**
 * MIDI Learn (docs/design/controller.md): the DJ taps a Booth function, then presses or moves a control.
 * - a button function takes a pressed note (note-offs are ignored) or a CC button (value 127);
 * - a level / turn function takes a CC (or pitch bend) once it has moved `LEARN_MOVES` times: a 14-bit pair (CC n and
 *   n + 32 on one channel) is taken as one fader, values around 64 or 1 / 127 as a relative encoder;
 * - the crossfade takes either.
 */
export class Learner {
  fn: FnId | null = null;
  private seen = new Map<string, number[]>();
  arm(fn: FnId | null) {
    this.fn = fn;
    this.seen.clear();
  }
  feed(m: MidiMsg): Learned | null {
    const fn = this.fn;
    if (!fn) return null;
    const kind = FN_KIND[fn];
    const wantsButton = kind === "button" || kind === "fader";
    const wantsLevel = kind !== "button";
    if (m.kind === "note") {
      if (!m.on || !wantsButton) return null;
      return this.done({ key: midiKey(m) });
    }
    const key = midiKey(m);
    if (m.kind === "cc" && wantsButton && !wantsLevel && m.value === 127) return this.done({ key });
    if (!wantsLevel) return null;
    const vals = [...(this.seen.get(key) ?? []), m.value].slice(-8);
    this.seen.set(key, vals);
    if (vals.length < LEARN_MOVES) return null;
    if (m.kind === "pitch") return this.done({ key });
    // a 14-bit pair: this is the LSB of an MSB that moves too → the MSB with its LSB
    const msbKey = midiKey({ kind: "cc", ch: m.ch, num: m.num - 32 });
    if (m.num >= 32 && this.seen.has(msbKey)) return this.done({ key: msbKey, lsb: m.num });
    const lsbKey = midiKey({ kind: "cc", ch: m.ch, num: m.num + 32 });
    const lsb = m.num < 32 && this.seen.has(lsbKey) ? m.num + 32 : undefined;
    const rel = guessRelative(vals) ?? undefined;
    return this.done({ key, ...(rel ? { rel } : {}), ...(lsb !== undefined && !rel ? { lsb } : {}) });
  }
  private done(l: Learned): Learned {
    this.fn = null;
    this.seen.clear();
    return l;
  }
}
