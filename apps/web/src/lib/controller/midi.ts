/**
 * 2026-11 (docs/design/controller.md): MIDI bytes → messages, pure. A DJ controller sends Note On / Note Off for
 * buttons (Note On with velocity 0 is an Off), Control Change for faders, knobs and jog wheels (a relative CC for a
 * jog or an endless encoder), sometimes a 14-bit fader as two CCs (MSB on n, LSB on n + 32) or as Pitch Bend.
 */
export type MidiKind = "note" | "cc" | "pitch";

export interface MidiMsg {
  kind: MidiKind;
  /** MIDI channel 0–15 */
  ch: number;
  /** note or CC number (0 for pitch bend) */
  num: number;
  /** 0–127 (pitch: 0–16383) */
  value: number;
  /** a note pressed (Note On with velocity > 0) */
  on?: boolean;
}

/** One message from a byte array, or null for what a controller mapping never uses (clock, SysEx, aftertouch…). */
export function parseMidi(data: ArrayLike<number>): MidiMsg | null {
  if (!data || data.length < 2) return null;
  const status = data[0]! & 0xff;
  if (status < 0x80 || status >= 0xf0) return null;
  const type = status & 0xf0;
  const ch = status & 0x0f;
  const d1 = (data[1] ?? 0) & 0x7f;
  const d2 = (data[2] ?? 0) & 0x7f;
  switch (type) {
    case 0x90:
      if (data.length < 3) return null;
      return { kind: "note", ch, num: d1, value: d2, on: d2 > 0 };
    case 0x80:
      return { kind: "note", ch, num: d1, value: 0, on: false };
    case 0xb0:
      if (data.length < 3) return null;
      return { kind: "cc", ch, num: d1, value: d2 };
    case 0xe0:
      if (data.length < 3) return null;
      return { kind: "pitch", ch, num: 0, value: (d2 << 7) | d1 };
    default:
      return null;
  }
}

/** A message's identity for bindings: "note:0:11", "cc:6:31", "pitch:2:0" (ch -1 = any channel) */
export const midiKey = (m: { kind: MidiKind; ch: number; num: number }) => `${m.kind}:${m.ch}:${m.num}`;

export function parseKey(k: string): { kind: MidiKind; ch: number; num: number } | null {
  const m = /^(note|cc|pitch):(-?\d{1,2}):(\d{1,3})$/.exec(k);
  if (!m) return null;
  const ch = Number(m[2]);
  const num = Number(m[3]);
  if (ch < -1 || ch > 15 || num > 127) return null;
  return { kind: m[1] as MidiKind, ch, num };
}

/** "Note 11 · ch 1", "CC 31 · ch 7" (channels shown 1–16, as on the controllers' charts) */
export function describeKey(k: string): string {
  const p = parseKey(k);
  if (!p) return k;
  const what = p.kind === "note" ? `Note ${p.num}` : p.kind === "cc" ? `CC ${p.num}` : "Pitch bend";
  return p.ch < 0 ? `${what} · any ch` : `${what} · ch ${p.ch + 1}`;
}

/** Bytes for a message (LED feedback, the virtual controller's own MIDI) */
export function midiBytes(m: { kind: MidiKind; ch: number; num: number; value: number }): number[] {
  const ch = Math.max(0, Math.min(15, m.ch | 0));
  if (m.kind === "pitch") {
    const v = Math.max(0, Math.min(16383, Math.round(m.value)));
    return [0xe0 | ch, v & 0x7f, (v >> 7) & 0x7f];
  }
  const v = Math.max(0, Math.min(127, Math.round(m.value)));
  return [(m.kind === "note" ? 0x90 : 0xb0) | ch, m.num & 0x7f, v];
}

/**
 * Relative encodings a jog or an endless knob uses:
 * - `rel64`: 64 is still, 65… clockwise, 63… counter-clockwise (Pioneer DDJ jogs, Hercules)
 * - `rel2c`: two's complement, 1… clockwise, 127… counter-clockwise (Numark, many encoders)
 * - `relSign`: sign bit, 1… clockwise, 65… counter-clockwise
 */
export type RelMode = "rel64" | "rel2c" | "relSign";
export function relDelta(value: number, mode: RelMode): number {
  const v = value & 0x7f;
  switch (mode) {
    case "rel64":
      return v - 64;
    case "rel2c":
      return v >= 64 ? v - 128 : v;
    case "relSign":
      return v >= 64 ? -(v - 64) : v;
  }
}

/** Guess a relative encoding from a few values of one control (MIDI Learn), or null when it looks absolute. */
export function guessRelative(values: number[]): RelMode | null {
  if (values.length < 3) return null;
  const near64 = values.every((v) => v >= 56 && v <= 72 && v !== 64);
  if (near64) return "rel64";
  const near0 = values.every((v) => (v >= 1 && v <= 8) || (v >= 120 && v <= 127));
  if (near0) return "rel2c";
  const sign = values.every((v) => (v >= 1 && v <= 8) || (v >= 65 && v <= 72));
  if (sign) return "relSign";
  return null;
}

/**
 * 14-bit CC pairs: a fader sends its coarse value on CC n (MSB) and its fine value on CC n + 32 (LSB). The pair is
 * read as 0…1 with the last MSB; an MSB alone (a controller without the LSB) is MSB / 127.
 */
export class Fine14 {
  private msb = new Map<string, number>();
  private lsb = new Map<string, number>();
  /** an MSB arrived (0–127): the 0…1 value */
  coarse(key: string, v: number): number {
    this.msb.set(key, v);
    this.lsb.delete(key);
    return v / 127;
  }
  /** its LSB arrived: the fine 0…1 value, or null without an MSB yet */
  fine(key: string, v: number): number | null {
    const m = this.msb.get(key);
    if (m === undefined) return null;
    this.lsb.set(key, v);
    return ((m << 7) | v) / 16383;
  }
}

/** Absolute value 0…1 from a message (CC / pitch / note velocity) */
export const norm = (m: MidiMsg) => (m.kind === "pitch" ? m.value / 16383 : m.value / 127);
