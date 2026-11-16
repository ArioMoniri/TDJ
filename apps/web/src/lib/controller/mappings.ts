import { midiKey, parseKey, type RelMode } from "./midi";

/**
 * 2026-11 (docs/design/controller.md): a controller mapping in two layers — MIDI → the controller's physical control
 * (one vocabulary for every controller), then control → Booth function (fixed by tango's needs, `ASSIGN`). MIDI
 * Learn binds a message straight to a Booth function (`fn`), which overrides the control's assignment.
 *
 * Built-in mappings are written for T-DJ from the makers' public MIDI message lists — nothing is copied from Mixxx
 * (GPL) or any other app.
 */
export const DECK_CONTROLS = [
  "play",
  "cue",
  "pfl",
  "load",
  "level",
  "eqHi",
  "eqMid",
  "eqLow",
  "trim",
  "filter",
  "tempo",
  "jog",
  "jogSide",
  "jogTouch",
  "sync",
  "pad1",
  "pad2",
  "pad3",
  "pad4",
  "pad5",
  "pad6",
  "pad7",
  "pad8",
] as const;
export type DeckControl = (typeof DECK_CONTROLS)[number];
export const MIXER_CONTROLS = [
  "xfader",
  "master",
  "hpMix",
  "hpLevel",
  "browse",
  "browsePress",
  "shift",
] as const;
export type MixerControl = (typeof MIXER_CONTROLS)[number];
export type Deck = "A" | "B";
export type ControlId = `${Deck}.${DeckControl}` | MixerControl;
export const CONTROLS: ControlId[] = [
  ...(["A", "B"] as const).flatMap((d) => DECK_CONTROLS.map((c) => `${d}.${c}` as ControlId)),
  ...MIXER_CONTROLS,
];

/** How a control reports: a button, an absolute position (0…1), a relative turn (ticks) */
export type ControlKind = "button" | "abs" | "rel";
export function controlKind(c: ControlId): ControlKind {
  const leaf = c.includes(".") ? c.split(".")[1]! : c;
  if (["jog", "jogSide", "browse"].includes(leaf)) return "rel";
  if (
    [
      "level",
      "eqHi",
      "eqMid",
      "eqLow",
      "trim",
      "filter",
      "tempo",
      "xfader",
      "master",
      "hpMix",
      "hpLevel",
    ].includes(leaf)
  )
    return "abs";
  return "button";
}

/** The Booth functions a controller (or the virtual controller) can drive. */
export const FNS = [
  "playPause",
  "nextNow",
  "previous",
  "skipNext",
  "stop",
  "fadeOut",
  "skipTanda",
  "cueNext",
  "master",
  "cortina",
  "crossfade",
  "seek",
  "eqHi",
  "eqMid",
  "eqLow",
  "talk",
  "mute",
  "hold",
  "undo",
  "floorFull",
  "floorOk",
  "floorEmptied",
  "findSongs",
  "browse",
  "load",
  "confirm",
] as const;
export type FnId = (typeof FNS)[number];
export type FnKind = "button" | "abs" | "rel" | "fader";
export const FN_KIND: Record<FnId, FnKind> = {
  playPause: "button",
  nextNow: "button",
  previous: "button",
  skipNext: "button",
  stop: "button",
  fadeOut: "button",
  skipTanda: "button",
  cueNext: "button",
  master: "abs",
  cortina: "abs",
  // a crossfader across arms it; a button arms it too
  crossfade: "fader",
  seek: "rel",
  eqHi: "abs",
  eqMid: "abs",
  eqLow: "abs",
  talk: "button",
  mute: "button",
  hold: "button",
  undo: "button",
  floorFull: "button",
  floorOk: "button",
  floorEmptied: "button",
  findSongs: "button",
  browse: "rel",
  load: "button",
  confirm: "button",
};
/** What changes what the room hears at once (mid-night: press twice, docs/design/controller.md) */
export const ROOM_FNS: ReadonlySet<FnId> = new Set([
  "playPause",
  "nextNow",
  "previous",
  "stop",
  "fadeOut",
  "skipTanda",
  "crossfade",
  "seek",
]);

/** Deck A is NOW (the room), deck B is NEXT; they never swap (tango: one song at a time, its original tempo). */
export const ASSIGN: Partial<Record<ControlId, FnId>> = {
  "A.play": "playPause",
  "B.play": "nextNow",
  // (review, the tango DJ: "the cortina runs long — fade it now" is the NOW deck's CUE, pressed twice mid-night)
  "A.cue": "fadeOut",
  "B.cue": "cueNext",
  "B.pfl": "cueNext",
  "A.level": "master",
  master: "master",
  xfader: "crossfade",
  "A.jog": "seek",
  "A.jogSide": "seek",
  "B.jog": "browse",
  "B.jogSide": "browse",
  browse: "browse",
  browsePress: "confirm",
  "A.load": "load",
  "B.load": "load",
  "A.eqHi": "eqHi",
  "A.eqMid": "eqMid",
  "A.eqLow": "eqLow",
  "A.pad1": "talk",
  "A.pad2": "mute",
  "A.pad3": "hold",
  "A.pad4": "undo",
  "A.pad5": "floorFull",
  "A.pad6": "floorOk",
  "A.pad7": "floorEmptied",
  "A.pad8": "findSongs",
  "B.pad1": "previous",
  "B.pad2": "skipNext",
  "B.pad3": "stop",
  "B.pad4": "crossfade",
  "B.pad5": "skipTanda",
};
/** Controls shown but never used, with why (tempo: tango plays at the original tempo) */
export const UNUSED: Partial<Record<ControlId, "tempo" | "hardware" | "mirror">> = {
  "A.tempo": "tempo",
  "B.tempo": "tempo",
  "A.sync": "tempo",
  "B.sync": "tempo",
  hpMix: "hardware",
  hpLevel: "hardware",
  "B.level": "mirror",
  "B.eqHi": "mirror",
  "B.eqMid": "mirror",
  "B.eqLow": "mirror",
  "A.trim": "mirror",
  "B.trim": "mirror",
  "A.filter": "mirror",
  "B.filter": "mirror",
  "A.pfl": "mirror",
};

export interface Binding {
  /** midiKey of the message (ch -1: any channel) */
  key: string;
  /** the physical control it is (built-in mappings) */
  control?: ControlId;
  /** a Booth function bound by MIDI Learn: overrides the control's assignment */
  fn?: FnId;
  /** a relative encoder's encoding */
  rel?: RelMode;
  /** a 14-bit CC: the LSB's CC number */
  lsb?: number;
  /** the controller's SHIFTed message for that control */
  shift?: boolean;
}

export const MAPPING_FORMAT = "tdj-controller-mapping";
export interface Mapping {
  format: typeof MAPPING_FORMAT;
  version: 1;
  id: string;
  name: string;
  /** port-name patterns (case-insensitive regular expressions) this mapping is for */
  match: string[];
  bindings: Binding[];
  /** LEDs follow Pioneer's convention: the button's own note, velocity 127 on / 0 off */
  leds?: boolean;
  /** where the mapping comes from (shown) */
  source?: string;
  /** a seconds-per-tick scale for the jog seek */
  jogSecPerTick?: number;
}

/* ---- built-in mappings ---- */

const n = (ch: number, num: number) => midiKey({ kind: "note", ch, num });
const cc = (ch: number, num: number) => midiKey({ kind: "cc", ch, num });

/** Pioneer DJ DDJ-400 / DDJ-FLX4 (one message list): decks on ch 1/2, mixer on ch 7, pads on ch 8/10 (HOT CUE). */
function pioneer(id: string, name: string, match: string[]): Mapping {
  const b: Binding[] = [];
  for (const [d, ch, padCh] of [
    ["A", 0, 7],
    ["B", 1, 9],
  ] as const) {
    b.push(
      { key: n(ch, 0x0b), control: `${d}.play` },
      { key: n(ch, 0x0c), control: `${d}.cue` },
      { key: n(ch, 0x54), control: `${d}.pfl` },
      { key: n(ch, 0x58), control: `${d}.sync` },
      { key: n(ch, 0x36), control: `${d}.jogTouch` },
      { key: cc(ch, 0x13), control: `${d}.level`, lsb: 0x33 },
      { key: cc(ch, 0x07), control: `${d}.eqHi`, lsb: 0x27 },
      { key: cc(ch, 0x0b), control: `${d}.eqMid`, lsb: 0x2b },
      { key: cc(ch, 0x0f), control: `${d}.eqLow`, lsb: 0x2f },
      { key: cc(ch, 0x04), control: `${d}.trim`, lsb: 0x24 },
      { key: cc(ch, 0x00), control: `${d}.tempo`, lsb: 0x20 },
      { key: cc(ch, 0x22), control: `${d}.jog`, rel: "rel64" },
      { key: cc(ch, 0x23), control: `${d}.jog`, rel: "rel64" },
      { key: cc(ch, 0x21), control: `${d}.jogSide`, rel: "rel64" },
      { key: n(ch, 0x3f), control: "shift" },
    );
    for (let p = 0; p < 8; p++) b.push({ key: n(padCh, p), control: `${d}.pad${p + 1}` as ControlId });
  }
  b.push(
    { key: cc(6, 0x1f), control: "xfader", lsb: 0x3f },
    { key: cc(6, 0x17), control: "A.filter", lsb: 0x37 },
    { key: cc(6, 0x18), control: "B.filter", lsb: 0x38 },
    { key: cc(6, 0x0c), control: "hpMix", lsb: 0x2c },
    { key: cc(6, 0x0d), control: "hpLevel", lsb: 0x2d },
    { key: cc(6, 0x40), control: "browse", rel: "rel64" },
    { key: n(6, 0x41), control: "browsePress" },
    { key: n(6, 0x46), control: "A.load" },
    { key: n(6, 0x47), control: "B.load" },
  );
  return {
    format: MAPPING_FORMAT,
    version: 1,
    id,
    name,
    match,
    bindings: b,
    leds: true,
    source: "Pioneer DJ List of MIDI Messages (DDJ-400)",
    jogSecPerTick: 0.03,
  };
}

/** T-DJ's own 2-deck layout: the virtual controller speaks it; a starting point for any controller (then Learn). */
function generic(): Mapping {
  const b: Binding[] = [];
  for (const [d, ch] of [
    ["A", 0],
    ["B", 1],
  ] as const) {
    b.push(
      { key: n(ch, 0), control: `${d}.play` },
      { key: n(ch, 1), control: `${d}.cue` },
      { key: n(ch, 2), control: `${d}.pfl` },
      { key: n(ch, 3), control: `${d}.load` },
      { key: n(ch, 4), control: `${d}.jogTouch` },
      { key: n(ch, 5), control: `${d}.sync` },
      { key: cc(ch, 7), control: `${d}.level` },
      { key: cc(ch, 16), control: `${d}.eqHi` },
      { key: cc(ch, 17), control: `${d}.eqMid` },
      { key: cc(ch, 18), control: `${d}.eqLow` },
      { key: cc(ch, 19), control: `${d}.trim` },
      { key: cc(ch, 20), control: `${d}.filter` },
      { key: cc(ch, 22), control: `${d}.jog`, rel: "rel64" },
    );
    for (let p = 0; p < 8; p++) b.push({ key: n(ch, 8 + p), control: `${d}.pad${p + 1}` as ControlId });
  }
  b.push(
    { key: cc(2, 7), control: "master" },
    { key: cc(2, 8), control: "xfader" },
    { key: cc(2, 9), control: "hpMix" },
    { key: cc(2, 12), control: "hpLevel" },
    { key: cc(2, 21), control: "browse", rel: "rel64" },
    { key: n(2, 0), control: "browsePress" },
    { key: n(2, 1), control: "shift" },
  );
  return {
    format: MAPPING_FORMAT,
    version: 1,
    id: "generic-2deck",
    name: "Generic 2-deck",
    match: [],
    bindings: b,
    leds: true,
    source: "T-DJ",
    jogSecPerTick: 0.03,
  };
}

/** An 8-pad controller (Akai LPD8, Korg nanoPAD…): pads on notes 36–43 on any channel, knobs CC 1–2. */
function pads8(): Mapping {
  const fns: FnId[] = [
    "playPause",
    "nextNow",
    "talk",
    "mute",
    "hold",
    "cueNext",
    "floorFull",
    "floorEmptied",
  ];
  return {
    format: MAPPING_FORMAT,
    version: 1,
    id: "pads-8",
    name: "8-pad controller",
    match: ["lpd8", "mpd ?2", "nanopad", "mpk ?mini"],
    bindings: [
      ...fns.map((fn, p) => ({ key: n(-1, 36 + p), control: `A.pad${p + 1}` as ControlId, fn })),
      { key: cc(-1, 1), control: "master", fn: "master" },
      { key: cc(-1, 2), control: "B.level", fn: "cortina" },
    ],
    leds: false,
    source: "T-DJ (General MIDI drum pads 36–43)",
  };
}

export const BUILT_IN: Mapping[] = [
  pioneer("ddj-flx4", "Pioneer DJ DDJ-FLX4", ["ddj-?flx4"]),
  pioneer("ddj-400", "Pioneer DJ DDJ-400", ["ddj-?400"]),
  generic(),
  pads8(),
];
export const GENERIC_ID = "generic-2deck";
export const builtIn = (id: string) => BUILT_IN.find((m) => m.id === id) ?? null;

/** The built-in mapping for a port name (the generic layout when none matches) */
export function builtInFor(portName: string): Mapping {
  for (const m of BUILT_IN) if (m.match.some((p) => safeRe(p)?.test(portName))) return m;
  return builtIn(GENERIC_ID)!;
}
const safeRe = (p: string) => {
  try {
    return new RegExp(p, "i");
  } catch {
    return null;
  }
};

/** "Pioneer DJ" for a DDJ… (the native app's CoreMIDI ports carry a name only) */
export function manufacturerOf(name: string, reported?: string | null): string | null {
  if (reported?.trim()) return reported.trim();
  if (/\b(ddj|xdj|djm|cdj)-/i.test(name)) return "Pioneer DJ";
  if (/numark|mixtrack/i.test(name)) return "Numark";
  if (/hercules|djcontrol|inpulse/i.test(name)) return "Hercules";
  if (/traktor|kontrol/i.test(name)) return "Native Instruments";
  if (/reloop/i.test(name)) return "Reloop";
  if (/akai|lpd8|mpd|mpk/i.test(name)) return "Akai";
  if (/korg|nano/i.test(name)) return "Korg";
  if (/denon|prime|mc\d{4}/i.test(name)) return "Denon DJ";
  return null;
}

/* ---- lookup ---- */

export interface Resolved {
  binding: Binding;
  /** the LSB half of a 14-bit pair */
  lsb?: boolean;
}

/** A mapping's bindings by message key (ch -1 bindings answer any channel); LSB keys point at their pair. */
export class MappingIndex {
  private exact = new Map<string, Resolved>();
  private omni = new Map<string, Resolved>();
  constructor(readonly mapping: Mapping) {
    // learned bindings (fn) win over a built-in control on the same key: they come last in `bindings`
    for (const b of mapping.bindings) {
      const k = parseKey(b.key);
      if (!k) continue;
      const put = (key: { kind: "note" | "cc" | "pitch"; ch: number; num: number }, r: Resolved) => {
        const target = key.ch < 0 ? this.omni : this.exact;
        target.set(key.ch < 0 ? `${key.kind}:${key.num}` : midiKey(key), r);
      };
      put(k, { binding: b });
      if (b.lsb !== undefined && k.kind === "cc") put({ ...k, num: b.lsb }, { binding: b, lsb: true });
    }
  }
  find(m: { kind: "note" | "cc" | "pitch"; ch: number; num: number }): Resolved | null {
    return this.exact.get(midiKey(m)) ?? this.omni.get(`${m.kind}:${m.num}`) ?? null;
  }
  /** the key of a control's own message (its LED) */
  keyOf(c: ControlId): string | null {
    const b = this.mapping.bindings.find(
      (x) => x.control === c && !x.shift && parseKey(x.key)?.kind === "note",
    );
    return b?.key ?? null;
  }
}

/** The Booth function a binding drives (its learned fn, else its control's assignment) */
export const fnOf = (b: Binding): FnId | null => b.fn ?? (b.control ? (ASSIGN[b.control] ?? null) : null);

/* ---- MIDI Learn result ---- */

/**
 * Bind `learned.key` to `fn` in `m`: a copy where no other message drives `fn` by Learn any more and the message
 * drives `fn` (a built-in control on it keeps its mirror). `moved`: what the message drove before, if anything else.
 */
export function learnInto(
  m: Mapping,
  fn: FnId,
  learned: { key: string; rel?: RelMode; lsb?: number },
): { mapping: Mapping; moved: FnId | null } {
  const drop = (b: Binding): Binding | null => {
    if (b.fn !== fn) return b;
    const { fn: _f, ...rest } = b;
    return rest.control ? rest : null;
  };
  let moved: FnId | null = null;
  let found = false;
  const out: Binding[] = [];
  for (const b of m.bindings) {
    if (b.key === learned.key) {
      found = true;
      const was = fnOf(b);
      if (was && was !== fn) moved = was;
      out.push({
        ...b,
        fn,
        ...(learned.rel ? { rel: learned.rel } : {}),
        ...(learned.lsb !== undefined ? { lsb: learned.lsb } : {}),
      });
      continue;
    }
    const k = drop(b);
    if (k) out.push(k);
  }
  if (!found)
    out.push({
      key: learned.key,
      fn,
      ...(learned.rel ? { rel: learned.rel } : {}),
      ...(learned.lsb !== undefined ? { lsb: learned.lsb } : {}),
    });
  return { mapping: { ...m, id: m.id.endsWith("-custom") ? m.id : `${m.id}-custom`, bindings: out }, moved };
}

/** Forget what was learned for `fn` (a built-in control's assignment comes back) */
export function unlearn(m: Mapping, fn: FnId): Mapping {
  const out: Binding[] = [];
  for (const b of m.bindings) {
    if (b.fn !== fn) {
      out.push(b);
      continue;
    }
    const { fn: _f, ...rest } = b;
    if (rest.control) out.push(rest);
  }
  return { ...m, bindings: out };
}

/** The message keys that drive `fn` now (learned or assigned) */
export function keysFor(m: Mapping, fn: FnId): string[] {
  return m.bindings.filter((b) => fnOf(b) === fn).map((b) => b.key);
}

/* ---- export / import ---- */

export function exportMapping(m: Mapping): string {
  const { format, version, id, name, match, bindings, leds, source, jogSecPerTick } = m;
  return JSON.stringify({ format, version, id, name, match, bindings, leds, source, jogSecPerTick }, null, 2);
}

const MAX_BINDINGS = 512;
export function importMapping(text: string): { ok: true; mapping: Mapping } | { ok: false; why: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, why: "not-json" };
  }
  const o = raw as Partial<Mapping> | null;
  if (!o || typeof o !== "object" || o.format !== MAPPING_FORMAT) return { ok: false, why: "format" };
  if (o.version !== 1) return { ok: false, why: "version" };
  if (!Array.isArray(o.bindings) || o.bindings.length > MAX_BINDINGS) return { ok: false, why: "bindings" };
  const ctl = new Set<string>(CONTROLS);
  const fns = new Set<string>(FNS);
  const rels = new Set(["rel64", "rel2c", "relSign"]);
  const bindings: Binding[] = [];
  for (const b of o.bindings as Binding[]) {
    if (!b || typeof b.key !== "string" || !parseKey(b.key)) return { ok: false, why: "bindings" };
    if (b.control !== undefined && !ctl.has(b.control)) return { ok: false, why: "bindings" };
    if (b.fn !== undefined && !fns.has(b.fn)) return { ok: false, why: "bindings" };
    if (!b.control && !b.fn) return { ok: false, why: "bindings" };
    if (b.rel !== undefined && !rels.has(b.rel)) return { ok: false, why: "bindings" };
    if (b.lsb !== undefined && !(Number.isInteger(b.lsb) && b.lsb >= 0 && b.lsb <= 127))
      return { ok: false, why: "bindings" };
    bindings.push({
      key: b.key,
      ...(b.control ? { control: b.control } : {}),
      ...(b.fn ? { fn: b.fn } : {}),
      ...(b.rel ? { rel: b.rel } : {}),
      ...(b.lsb !== undefined ? { lsb: b.lsb } : {}),
      ...(b.shift ? { shift: true } : {}),
    });
  }
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 80) : "Imported";
  const match = Array.isArray(o.match)
    ? o.match.filter((x): x is string => typeof x === "string" && !!safeRe(x)).slice(0, 8)
    : [];
  const jog =
    typeof o.jogSecPerTick === "number" && o.jogSecPerTick > 0 && o.jogSecPerTick <= 1
      ? o.jogSecPerTick
      : undefined;
  return {
    ok: true,
    mapping: {
      format: MAPPING_FORMAT,
      version: 1,
      id: typeof o.id === "string" && /^[\w-]{1,64}$/.test(o.id) ? o.id : "imported",
      name,
      match,
      bindings,
      leds: o.leds === true,
      source: typeof o.source === "string" ? o.source.slice(0, 120) : undefined,
      ...(jog ? { jogSecPerTick: jog } : {}),
    },
  };
}

/* ---- saved per controller, on this device ---- */

const SAVED_KEY = "tdj-controller-maps";
export function loadSaved(): Record<string, Mapping> {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") as Record<string, unknown>;
    const out: Record<string, Mapping> = {};
    for (const [k, v] of Object.entries(raw)) {
      const r = importMapping(JSON.stringify(v));
      if (r.ok) out[k] = r.mapping;
    }
    return out;
  } catch {
    return {};
  }
}
export function saveFor(controller: string, m: Mapping | null) {
  try {
    const all = loadSaved();
    if (m) all[controller] = m;
    else delete all[controller];
    localStorage.setItem(SAVED_KEY, JSON.stringify(all));
  } catch {}
}
/** The mapping a controller uses on this device: its saved one, else the built-in for its name */
export function mappingFor(controller: string, saved: Record<string, Mapping> = loadSaved()): Mapping {
  return saved[controller] ?? builtInFor(controller);
}
