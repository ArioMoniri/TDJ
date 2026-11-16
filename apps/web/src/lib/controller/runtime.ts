import {
  type Binding,
  type ControlId,
  controlKind,
  FN_KIND,
  type FnId,
  fnOf,
  type Mapping,
  MappingIndex,
} from "./mappings";
import { Fine14, type MidiMsg, midiBytes, midiKey, norm, parseKey, relDelta } from "./midi";

/**
 * 2026-11 (docs/design/controller.md): a controller's messages (or the virtual controller's touches) → the digital
 * mirror of its surface and the Booth intents they ask for. Pure: no store, no clock but the one passed in. The
 * Booth side (actions.ts) decides what an intent may do now (capabilities, mid-night confirmations, soft takeover).
 */
export type Intent =
  | { fn: FnId; type: "press"; control?: ControlId }
  | { fn: FnId; type: "level"; value: number; control?: ControlId; soft: boolean }
  | { fn: FnId; type: "turn"; delta: number; shift: boolean; control?: ControlId }
  | { fn: "crossfade"; type: "across" | "back" };

export interface Mirror {
  /** absolute controls 0…1 */
  values: Partial<Record<ControlId, number>>;
  /** buttons held now */
  pressed: Partial<Record<ControlId, boolean>>;
  /** relative controls: ticks so far (a jog's drawn angle) */
  turns: Partial<Record<ControlId, number>>;
  /** the last message, for the monitor line */
  last: { key: string; value: number; control?: ControlId; fn?: FnId | null } | null;
}
export const emptyMirror = (): Mirror => ({ values: {}, pressed: {}, turns: {}, last: null });

/** the crossfader's sides: at or under LEFT it is on A (NOW), at or over RIGHT it is across on B (NEXT) */
export const XF_LEFT = 0.25;
export const XF_RIGHT = 0.75;

export class ControllerRuntime {
  private index: MappingIndex;
  private fine = new Fine14();
  private abs = new Map<string, number>();
  /** the crossfader has been seen on the NOW side since its last crossing (never armed by a first reading) */
  private xfReady = false;
  private xfAcross = false;
  mirror: Mirror = emptyMirror();

  constructor(mapping: Mapping) {
    this.index = new MappingIndex(mapping);
  }
  get mapping() {
    return this.index.mapping;
  }
  setMapping(m: Mapping) {
    this.index = new MappingIndex(m);
  }
  keyOf(c: ControlId) {
    return this.index.keyOf(c);
  }

  /** One MIDI message from the hardware */
  midi(m: MidiMsg): Intent[] {
    const r = this.index.find(m);
    if (!r) {
      this.mirror = { ...this.mirror, last: { key: midiKey(m), value: m.value } };
      return [];
    }
    const b = r.binding;
    const fn = fnOf(b);
    const key = b.key;
    const last = { key: midiKey(m), value: m.value, control: b.control, fn };
    const kind = b.control ? controlKind(b.control) : fn ? kindOfFn(fn) : "button";
    if (b.rel || (kind === "rel" && m.kind === "cc")) {
      const delta = b.rel ? relDelta(m.value, b.rel) : this.absDelta(key, m.value);
      this.mirror = { ...this.mirror, last };
      return delta ? this.turn(b, fn, delta) : [];
    }
    if (m.kind === "note" || kind === "button") {
      const on = m.kind === "note" ? !!m.on : m.value >= 64;
      this.mirror = { ...this.mirror, last };
      return this.button(b, fn, on);
    }
    let v: number | null;
    if (m.kind === "pitch") v = norm(m);
    else if (r.lsb) v = this.fine.fine(key, m.value);
    else v = b.lsb !== undefined ? this.fine.coarse(key, m.value) : m.value / 127;
    this.mirror = { ...this.mirror, last };
    return v === null ? [] : this.level(b.control, fn, v, true);
  }

  /** The virtual controller: one control, as the hardware would send it (no soft takeover: the hand is on it) */
  control(c: ControlId, ev: { on?: boolean; value?: number; delta?: number }): Intent[] {
    const b = this.bindingOf(c) ?? { key: "", control: c };
    const fn = fnOf(b);
    if (ev.delta !== undefined) return ev.delta ? this.turn(b, fn, ev.delta) : [];
    if (ev.value !== undefined) return this.level(c, fn, ev.value, false);
    return this.button(b, fn, !!ev.on);
  }

  private bindingOf(c: ControlId): Binding | null {
    return this.mapping.bindings.find((b) => b.control === c && !b.shift) ?? null;
  }

  private absDelta(key: string, v: number): number {
    const prev = this.abs.get(key);
    this.abs.set(key, v);
    return prev === undefined ? 0 : v - prev;
  }

  private button(b: Binding, fn: FnId | null, on: boolean): Intent[] {
    if (b.control) this.mirror = { ...this.mirror, pressed: { ...this.mirror.pressed, [b.control]: on } };
    if (!on || !fn) return [];
    if (fn === "crossfade") return [{ fn, type: "press", control: b.control }];
    return [{ fn, type: "press", control: b.control }];
  }

  private turn(b: Binding, fn: FnId | null, delta: number): Intent[] {
    if (b.control) {
      const was = this.mirror.turns[b.control] ?? 0;
      this.mirror = { ...this.mirror, turns: { ...this.mirror.turns, [b.control]: was + delta } };
    }
    if (!fn) return [];
    const shift = !!this.mirror.pressed.shift;
    if (FN_KIND[fn] === "rel") return [{ fn, type: "turn", delta, shift, control: b.control }];
    return [];
  }

  private level(c: ControlId | undefined, fn: FnId | null, v: number, soft: boolean): Intent[] {
    const value = Math.max(0, Math.min(1, v));
    if (c) this.mirror = { ...this.mirror, values: { ...this.mirror.values, [c]: value } };
    if (!fn) return [];
    if (fn === "crossfade") return this.crossfader(value);
    if (FN_KIND[fn] === "abs") return [{ fn, type: "level", value, control: c, soft }];
    return [];
  }

  /** a crossfader moved across to NEXT arms the crossfade; back to NOW cancels (and makes it ready again) */
  private crossfader(v: number): Intent[] {
    if (v <= XF_LEFT) {
      const back = this.xfAcross;
      this.xfReady = true;
      this.xfAcross = false;
      return back ? [{ fn: "crossfade", type: "back" }] : [];
    }
    if (v >= XF_RIGHT && this.xfReady && !this.xfAcross) {
      this.xfAcross = true;
      this.xfReady = false;
      return [{ fn: "crossfade", type: "across" }];
    }
    return [];
  }
  /** where the crossfader's arming stands (shown in the sheet) */
  get crossfaderState(): "ready" | "across" | "unknown" {
    return this.xfAcross ? "across" : this.xfReady ? "ready" : "unknown";
  }
}

const kindOfFn = (fn: FnId) => (FN_KIND[fn] === "abs" ? "abs" : FN_KIND[fn] === "rel" ? "rel" : "button");

/**
 * Soft takeover (Mixxx's term): a hardware fader drives a software value only once it reaches it — within `CATCH` of
 * it, or crossing it between two readings — so a fader left low never drops the room's volume when it is first moved.
 */
export const CATCH = 0.04;
export class SoftTakeover {
  private last = new Map<string, number>();
  private caught = new Set<string>();
  accept(id: string, hw: number, sw: number): boolean {
    const prev = this.last.get(id);
    this.last.set(id, hw);
    if (this.caught.has(id)) return true;
    const crossed = prev !== undefined && (prev - sw) * (hw - sw) <= 0;
    if (Math.abs(hw - sw) <= CATCH || crossed) {
      this.caught.add(id);
      return true;
    }
    return false;
  }
  /** the software value moved by itself (a tap on screen, a key): the fader must catch it again */
  release(id: string) {
    this.caught.delete(id);
  }
  releaseAll() {
    this.caught.clear();
  }
}

/* ---- LEDs ---- */

export interface LedState {
  playing: boolean;
  auditioning: boolean;
  ducked: boolean;
  muted: boolean;
  holding: boolean;
}
const LED_OF: Partial<Record<FnId, keyof LedState>> = {
  playPause: "playing",
  cueNext: "auditioning",
  talk: "ducked",
  mute: "muted",
  hold: "holding",
};

/** The LED messages a mapping's buttons should show for `s` (Pioneer's convention: the button's note, 127 / 0) */
export function ledsFor(m: Mapping, s: LedState): Array<{ key: string; on: boolean }> {
  if (!m.leds) return [];
  const out: Array<{ key: string; on: boolean }> = [];
  for (const b of m.bindings) {
    const k = parseKey(b.key);
    if (k?.kind !== "note" || k.ch < 0 || b.shift) continue;
    const fn = fnOf(b);
    const what = fn ? LED_OF[fn] : undefined;
    if (what) out.push({ key: b.key, on: s[what] });
  }
  return out;
}

/** Only what changed since the last call (a controller's LEDs are not re-sent every frame) */
export class LedDiff {
  private sent = new Map<string, boolean>();
  next(leds: Array<{ key: string; on: boolean }>): number[][] {
    const out: number[][] = [];
    for (const l of leds) {
      if (this.sent.get(l.key) === l.on) continue;
      this.sent.set(l.key, l.on);
      const k = parseKey(l.key)!;
      out.push(midiBytes({ kind: "note", ch: k.ch, num: k.num, value: l.on ? 127 : 0 }));
    }
    return out;
  }
  reset() {
    this.sent.clear();
  }
}

/* ---- fader tapers ---- */

/** A channel fader (0…1) as the room's level in dB: full up 0 dB, an audio taper below, −30 dB (the master's floor) at the bottom */
export function faderDb(v: number, floor = -30): number {
  if (v <= 0.001) return floor;
  const db = 40 * Math.log10(Math.min(1, v));
  return Math.max(floor, Math.round(db));
}
/** The inverse (what a fader at `db` reads) */
export function dbFader(db: number, floor = -30): number {
  if (db <= floor) return 0;
  return Math.min(1, 10 ** (Math.min(0, db) / 40));
}
/** A MASTER knob (0…1) as −30…+6 dB, linear in dB like the on-screen master */
export const knobDb = (v: number) => Math.round(-30 + v * 36);
export const dbKnob = (db: number) => Math.max(0, Math.min(1, (db + 30) / 36));
/** An EQ knob (0…1, 0.5 flat) as dB: −24 (a kill) … +6 */
export function eqDb(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  if (Math.abs(c - 0.5) < 0.02) return 0;
  return Math.round((c < 0.5 ? (c - 0.5) * 48 : (c - 0.5) * 12) * 2) / 2;
}
export function dbEq(db: number): number {
  if (db === 0) return 0.5;
  return db < 0 ? 0.5 + Math.max(-24, db) / 48 : 0.5 + Math.min(6, db) / 12;
}

/* ---- jog seek and browse ---- */

/** Where a jog's ticks put the playhead: `base` + ticks × s/tick (SHIFT: ×10), inside the song */
export function seekTarget(
  base: number,
  ticks: number,
  secPerTick: number,
  shift: boolean,
  length: number,
): number {
  const t = base + ticks * secPerTick * (shift ? 10 : 1);
  return Math.max(0, Math.min(Math.max(0, length - 0.5), Math.round(t * 10) / 10));
}

/**
 * The browse cursor: the coming rows that can be queued (a track or a cortina, not a break, not missing, after the
 * playhead), moved by `delta` from `from` (null: the first one). null when nothing is left.
 */
export function browseStep(
  rows: ReadonlyArray<{ kind: string }>,
  playable: (i: number) => boolean,
  playhead: number,
  from: number | null,
  delta: number,
): number | null {
  const ok: number[] = [];
  for (let i = playhead + 1; i < rows.length; i++) if (rows[i]!.kind !== "break" && playable(i)) ok.push(i);
  if (!ok.length) return null;
  const at = from === null ? -1 : ok.indexOf(from);
  if (at < 0) return ok[0]!;
  const step = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta)));
  return ok[Math.max(0, Math.min(ok.length - 1, at + step))]!;
}
