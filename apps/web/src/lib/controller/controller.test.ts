import { describe, expect, it } from "vitest";
import type { OutputInfo } from "@/lib/booth/outputs";
import { audioOfController } from "./audio";
import { Learner } from "./learn";
import {
  ASSIGN,
  BUILT_IN,
  builtIn,
  builtInFor,
  CONTROLS,
  exportMapping,
  FN_KIND,
  FNS,
  fnOf,
  importMapping,
  keysFor,
  learnInto,
  MappingIndex,
  manufacturerOf,
  ROOM_FNS,
  unlearn,
} from "./mappings";
import {
  describeKey,
  Fine14,
  guessRelative,
  midiBytes,
  midiKey,
  parseKey,
  parseMidi,
  relDelta,
} from "./midi";
import {
  browseStep,
  ControllerRuntime,
  dbEq,
  dbFader,
  dbKnob,
  eqDb,
  faderDb,
  knobDb,
  LedDiff,
  ledsFor,
  SoftTakeover,
  seekTarget,
} from "./runtime";

const ddj = builtIn("ddj-400")!;
const flx4 = builtIn("ddj-flx4")!;
const generic = builtIn("generic-2deck")!;

describe("MIDI parsing", () => {
  it("reads notes, note-offs (velocity 0 too), CCs and pitch bend; ignores clock and SysEx", () => {
    expect(parseMidi([0x90, 0x0b, 0x7f])).toEqual({ kind: "note", ch: 0, num: 11, value: 127, on: true });
    expect(parseMidi([0x91, 0x0b, 0x00])).toMatchObject({ kind: "note", ch: 1, on: false });
    expect(parseMidi([0x80, 0x0b, 0x40])).toMatchObject({ kind: "note", on: false, value: 0 });
    expect(parseMidi([0xb6, 0x1f, 0x40])).toEqual({ kind: "cc", ch: 6, num: 31, value: 64 });
    expect(parseMidi([0xe2, 0x7f, 0x7f])).toEqual({ kind: "pitch", ch: 2, num: 0, value: 16383 });
    expect(parseMidi([0xf8])).toBeNull();
    expect(parseMidi([0xf0, 0x7e, 0xf7])).toBeNull();
    expect(parseMidi([0x0b, 0x7f])).toBeNull();
    expect(parseMidi([0xb0, 0x07])).toBeNull();
  });
  it("keys round-trip, ch -1 is any channel, and read like a MIDI chart (channels 1–16)", () => {
    expect(midiKey({ kind: "cc", ch: 6, num: 31 })).toBe("cc:6:31");
    expect(parseKey("note:-1:36")).toEqual({ kind: "note", ch: -1, num: 36 });
    expect(parseKey("cc:16:1")).toBeNull();
    expect(parseKey("note:0:128")).toBeNull();
    expect(describeKey("cc:6:31")).toBe("CC 31 · ch 7");
    expect(describeKey("note:-1:36")).toBe("Note 36 · any ch");
  });
  it("writes bytes back (LEDs), clamped", () => {
    expect(midiBytes({ kind: "note", ch: 0, num: 0x0b, value: 127 })).toEqual([0x90, 0x0b, 0x7f]);
    expect(midiBytes({ kind: "cc", ch: 6, num: 31, value: 300 })).toEqual([0xb6, 31, 127]);
    expect(midiBytes({ kind: "pitch", ch: 1, num: 0, value: 8192 })).toEqual([0xe1, 0, 64]);
  });
  it("decodes the three relative encodings and guesses them from a few values", () => {
    expect(relDelta(65, "rel64")).toBe(1);
    expect(relDelta(60, "rel64")).toBe(-4);
    expect(relDelta(1, "rel2c")).toBe(1);
    expect(relDelta(127, "rel2c")).toBe(-1);
    expect(relDelta(66, "relSign")).toBe(-2);
    expect(guessRelative([65, 66, 65])).toBe("rel64");
    expect(guessRelative([1, 2, 127])).toBe("rel2c");
    expect(guessRelative([1, 65, 66])).toBe("relSign");
    expect(guessRelative([10, 20, 30])).toBeNull();
  });
  it("reads a 14-bit fader (MSB then LSB) and an MSB alone", () => {
    const f = new Fine14();
    expect(f.fine("x", 10)).toBeNull();
    expect(f.coarse("x", 127)).toBe(1);
    expect(f.fine("x", 127)).toBe(1);
    expect(f.coarse("x", 64)).toBeCloseTo(64 / 127);
    expect(f.fine("x", 0)).toBeCloseTo((64 << 7) / 16383);
  });
});

describe("built-in mappings", () => {
  it("pick the DDJ-FLX4 and DDJ-400 by port name (as Chrome, Windows and CoreMIDI name them), else the generic layout", () => {
    expect(builtInFor("DDJ-FLX4").id).toBe("ddj-flx4");
    expect(builtInFor("DDJ-FLX4 MIDI 1").id).toBe("ddj-flx4");
    expect(builtInFor("2- DDJ-400").id).toBe("ddj-400");
    expect(builtInFor("LPD8").id).toBe("pads-8");
    expect(builtInFor("Arturia BeatStep").id).toBe("generic-2deck");
  });
  it("every binding is a valid key and a known control or function; no two bindings share a message", () => {
    const ctl = new Set(CONTROLS);
    for (const m of BUILT_IN) {
      const seen = new Set<string>();
      for (const b of m.bindings) {
        expect(parseKey(b.key), `${m.id} ${b.key}`).not.toBeNull();
        expect(b.control === undefined || ctl.has(b.control)).toBe(true);
        expect(b.fn === undefined || (FNS as readonly string[]).includes(b.fn)).toBe(true);
        expect(seen.has(b.key), `${m.id} duplicate ${b.key}`).toBe(false);
        seen.add(b.key);
        if (b.lsb !== undefined) seen.add(`cc:${parseKey(b.key)!.ch}:${b.lsb}`);
      }
    }
  });
  it("the DDJ: deck 1 PLAY is the room's play / pause, deck 2's CUE and headphone CUE pre-listen NEXT, the channel 1 fader is the room", () => {
    const ix = new MappingIndex(ddj);
    const f = (bytes: number[]) => {
      const r = ix.find(parseMidi(bytes)!);
      return r ? fnOf(r.binding) : null;
    };
    expect(f([0x90, 0x0b, 0x7f])).toBe("playPause");
    expect(f([0x91, 0x0b, 0x7f])).toBe("nextNow");
    expect(f([0x91, 0x0c, 0x7f])).toBe("cueNext");
    expect(f([0x91, 0x54, 0x7f])).toBe("cueNext");
    expect(f([0xb0, 0x13, 0x40])).toBe("master");
    expect(f([0xb0, 0x33, 0x40])).toBe("master"); // its LSB
    expect(f([0xb6, 0x1f, 0x40])).toBe("crossfade");
    expect(f([0xb0, 0x22, 0x41])).toBe("seek");
    expect(f([0xb6, 0x40, 0x41])).toBe("browse");
    expect(f([0x96, 0x41, 0x7f])).toBe("confirm");
    expect(f([0x97, 0x00, 0x7f])).toBe("talk");
    expect(f([0x99, 0x02, 0x7f])).toBe("stop");
    // the FLX4 keeps the 400's message list
    expect(flx4.bindings).toEqual(ddj.bindings);
  });
  it("tempo is never assigned: tango plays at the original tempo", () => {
    expect(ASSIGN["A.tempo"]).toBeUndefined();
    expect(ASSIGN["B.tempo"]).toBeUndefined();
    expect(ASSIGN["A.sync"]).toBeUndefined();
    expect(Object.values(ASSIGN)).not.toContain("tempo");
  });
  it("what changes the room at once is marked so (mid-night confirmations)", () => {
    for (const f of ["playPause", "nextNow", "previous", "stop", "crossfade", "seek"] as const)
      expect(ROOM_FNS.has(f)).toBe(true);
    for (const f of ["cueNext", "talk", "mute", "master", "floorFull", "browse", "load"] as const)
      expect(ROOM_FNS.has(f)).toBe(false);
  });
  it("names a maker from a port name when the system gives none", () => {
    expect(manufacturerOf("DDJ-FLX4")).toBe("Pioneer DJ");
    expect(manufacturerOf("DJControl Inpulse 300")).toBe("Hercules");
    expect(manufacturerOf("X", "AlphaTheta")).toBe("AlphaTheta");
    expect(manufacturerOf("Something")).toBeNull();
  });
});

describe("MIDI Learn", () => {
  it("a button function takes the first pressed note (never a note-off)", () => {
    const l = new Learner();
    l.arm("talk");
    expect(l.feed(parseMidi([0x82, 40, 0])!)).toBeNull();
    expect(l.feed(parseMidi([0x92, 40, 100])!)).toEqual({ key: "note:2:40" });
    expect(l.fn).toBeNull();
  });
  it("a level function takes a CC once it moved three times, with its 14-bit LSB", () => {
    const l = new Learner();
    l.arm("master");
    expect(l.feed(parseMidi([0x90, 1, 127])!)).toBeNull(); // a button is no level
    expect(l.feed(parseMidi([0xb0, 0x13, 10])!)).toBeNull();
    expect(l.feed(parseMidi([0xb0, 0x33, 5])!)).toBeNull();
    expect(l.feed(parseMidi([0xb0, 0x13, 12])!)).toBeNull();
    expect(l.feed(parseMidi([0xb0, 0x13, 14])!)).toEqual({ key: "cc:0:19", lsb: 0x33 });
  });
  it("a turn function recognises a relative encoder", () => {
    const l = new Learner();
    l.arm("seek");
    for (const v of [65, 65]) expect(l.feed(parseMidi([0xb3, 9, v])!)).toBeNull();
    expect(l.feed(parseMidi([0xb3, 9, 66])!)).toEqual({ key: "cc:3:9", rel: "rel64" });
  });
  it("the crossfade takes a fader or a button", () => {
    const l = new Learner();
    l.arm("crossfade");
    expect(l.feed(parseMidi([0x94, 7, 127])!)).toEqual({ key: "note:4:7" });
  });
  it("binding moves a message from the function it drove, replaces an earlier Learn and unlearns back", () => {
    const r = learnInto(ddj, "stop", { key: "note:0:11" }); // deck 1 PLAY now stops
    expect(r.moved).toBe("playPause");
    const ix = new MappingIndex(r.mapping);
    expect(fnOf(ix.find(parseMidi([0x90, 0x0b, 0x7f])!)!.binding)).toBe("stop");
    // the control keeps its mirror
    expect(ix.find(parseMidi([0x90, 0x0b, 0x7f])!)!.binding.control).toBe("A.play");
    expect(r.mapping.id).toBe("ddj-400-custom");
    const r2 = learnInto(r.mapping, "stop", { key: "note:5:5" });
    expect(keysFor(r2.mapping, "stop")).toContain("note:5:5");
    expect(keysFor(r2.mapping, "stop")).not.toContain("note:0:11");
    expect(fnOf(new MappingIndex(r2.mapping).find(parseMidi([0x90, 0x0b, 0x7f])!)!.binding)).toBe(
      "playPause",
    );
    const back = unlearn(r2.mapping, "stop");
    expect(keysFor(back, "stop")).toEqual(keysFor(ddj, "stop"));
  });
  it("export / import round-trips and rejects what is not a mapping", () => {
    const r = learnInto(generic, "cortina", { key: "cc:5:70" });
    const again = importMapping(exportMapping(r.mapping));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.mapping.bindings).toEqual(r.mapping.bindings);
    expect(importMapping("nope")).toEqual({ ok: false, why: "not-json" });
    expect(importMapping('{"format":"x"}')).toEqual({ ok: false, why: "format" });
    expect(
      importMapping(
        JSON.stringify({
          format: "tdj-controller-mapping",
          version: 1,
          bindings: [{ key: "cc:0:1", fn: "eval" }],
        }),
      ),
    ).toEqual({ ok: false, why: "bindings" });
    expect(
      importMapping(
        JSON.stringify({
          format: "tdj-controller-mapping",
          version: 1,
          bindings: [{ key: "cc:0:1", control: "A.level" }],
          match: ["(("],
        }),
      ),
    ).toMatchObject({ ok: true, mapping: { match: [] } });
  });
});

describe("the runtime: mirror and intents", () => {
  it("a DDJ press is an intent, its release only the mirror; faders mirror 14-bit", () => {
    const rt = new ControllerRuntime(ddj);
    expect(rt.midi(parseMidi([0x90, 0x0b, 0x7f])!)).toEqual([
      { fn: "playPause", type: "press", control: "A.play" },
    ]);
    expect(rt.mirror.pressed["A.play"]).toBe(true);
    expect(rt.midi(parseMidi([0x90, 0x0b, 0])!)).toEqual([]);
    expect(rt.mirror.pressed["A.play"]).toBe(false);
    rt.midi(parseMidi([0xb1, 0x13, 64])!);
    rt.midi(parseMidi([0xb1, 0x33, 0])!);
    expect(rt.mirror.values["B.level"]).toBeCloseTo((64 << 7) / 16383);
    // the EQ of deck B is mirrored only; deck A's EQ is the room EQ
    expect(rt.midi(parseMidi([0xb1, 0x07, 20])!)).toEqual([]);
    expect(rt.midi(parseMidi([0xb0, 0x07, 20])!)[0]).toMatchObject({ fn: "eqHi", type: "level", soft: true });
    // tempo: mirrored, never an intent
    expect(rt.midi(parseMidi([0xb0, 0x00, 100])!)).toEqual([]);
    expect(rt.mirror.values["A.tempo"]).toBeCloseTo(100 / 127);
  });
  it("jogs turn (SHIFT ×), unknown messages land in the monitor", () => {
    const rt = new ControllerRuntime(ddj);
    expect(rt.midi(parseMidi([0xb0, 0x22, 0x43])!)).toEqual([
      { fn: "seek", type: "turn", delta: 3, shift: false, control: "A.jog" },
    ]);
    rt.midi(parseMidi([0x90, 0x3f, 0x7f])!);
    expect(rt.midi(parseMidi([0xb0, 0x21, 0x3f])!)[0]).toMatchObject({ delta: -1, shift: true });
    expect(rt.mirror.turns["A.jog"]).toBe(3);
    expect(rt.midi(parseMidi([0x9f, 1, 1])!)).toEqual([]);
    expect(rt.mirror.last?.key).toBe("note:15:1");
  });
  it("the crossfader: across to NEXT arms once, back cancels; a first reading on B never arms", () => {
    const rt = new ControllerRuntime(ddj);
    const xf = (v: number) => rt.midi(parseMidi([0xb6, 0x1f, v])!);
    expect(xf(127)).toEqual([]); // first seen on B: not ready
    expect(xf(0)).toEqual([]);
    expect(rt.crossfaderState).toBe("ready");
    expect(xf(64)).toEqual([]);
    expect(xf(110)).toEqual([{ fn: "crossfade", type: "across" }]);
    expect(xf(127)).toEqual([]);
    expect(xf(10)).toEqual([{ fn: "crossfade", type: "back" }]);
    expect(xf(127)).toEqual([{ fn: "crossfade", type: "across" }]);
  });
  it("the virtual controller drives the same intents (no soft takeover: the hand is on it)", () => {
    const rt = new ControllerRuntime(generic);
    expect(rt.control("A.play", { on: true })).toEqual([
      { fn: "playPause", type: "press", control: "A.play" },
    ]);
    expect(rt.control("A.level", { value: 0.5 })).toEqual([
      { fn: "master", type: "level", value: 0.5, control: "A.level", soft: false },
    ]);
    expect(rt.control("A.jog", { delta: -2 })[0]).toMatchObject({ fn: "seek", delta: -2 });
    expect(rt.control("B.jog", { delta: 1 })[0]).toMatchObject({ fn: "browse", delta: 1 });
    expect(rt.control("B.tempo", { value: 1 })).toEqual([]);
  });
  it("the 8-pad controller answers any channel", () => {
    const rt = new ControllerRuntime(builtIn("pads-8")!);
    expect(rt.midi(parseMidi([0x99, 36, 90])!)).toMatchObject([{ fn: "playPause" }]);
    expect(rt.midi(parseMidi([0x90, 38, 90])!)).toMatchObject([{ fn: "talk" }]);
    expect(rt.midi(parseMidi([0xb4, 2, 64])!)).toMatchObject([{ fn: "cortina", type: "level" }]);
  });
  it("a learned function on an absolute knob turns by its movement", () => {
    const m = learnInto(generic, "seek", { key: "cc:9:1" }).mapping;
    const rt = new ControllerRuntime(m);
    expect(rt.midi(parseMidi([0xb9, 1, 10])!)).toEqual([]);
    expect(rt.midi(parseMidi([0xb9, 1, 13])!)).toMatchObject([{ fn: "seek", delta: 3 }]);
  });
});

describe("soft takeover", () => {
  it("a fader far from the room's level does nothing until it reaches it or crosses it", () => {
    const s = new SoftTakeover();
    expect(s.accept("m", 0.1, 0.8)).toBe(false);
    expect(s.accept("m", 0.5, 0.8)).toBe(false);
    expect(s.accept("m", 0.9, 0.8)).toBe(true); // crossed
    expect(s.accept("m", 0.2, 0.8)).toBe(true); // caught: follows
    s.release("m");
    expect(s.accept("m", 0.3, 0.8)).toBe(false);
    expect(s.accept("m", 0.78, 0.8)).toBe(true); // within reach
  });
});

describe("LEDs", () => {
  it("the DDJ's PLAY lights while playing, NEXT's CUEs while pre-listening, pads for Talk / Mute / Hold; only changes are sent", () => {
    const s = { playing: true, auditioning: false, ducked: true, muted: false, holding: false };
    const leds = ledsFor(ddj, s);
    expect(leds).toContainEqual({ key: "note:0:11", on: true });
    expect(leds).toContainEqual({ key: "note:1:12", on: false });
    expect(leds).toContainEqual({ key: "note:1:84", on: false });
    expect(leds).toContainEqual({ key: "note:7:0", on: true });
    const d = new LedDiff();
    const first = d.next(leds);
    expect(first).toContainEqual([0x90, 0x0b, 0x7f]);
    expect(d.next(leds)).toEqual([]);
    expect(d.next(ledsFor(ddj, { ...s, playing: false }))).toEqual([[0x90, 0x0b, 0]]);
    expect(ledsFor(builtIn("pads-8")!, s)).toEqual([]);
  });
});

describe("tapers, seek and browse", () => {
  it("a channel fader: full up is 0 dB (no boost), the bottom the master's floor; the knob spans −30…+6", () => {
    expect(faderDb(1)).toBe(0);
    expect(faderDb(0)).toBe(-30);
    expect(faderDb(0.5)).toBe(-12);
    expect(dbFader(faderDb(0.7))).toBeCloseTo(0.7, 1);
    expect(knobDb(1)).toBe(6);
    expect(knobDb(0)).toBe(-30);
    expect(dbKnob(knobDb(0.5))).toBeCloseTo(0.5, 1);
  });
  it("an EQ knob: centre flat, left a kill, right +6", () => {
    expect(eqDb(0.5)).toBe(0);
    expect(eqDb(0)).toBe(-24);
    expect(eqDb(1)).toBe(6);
    expect(dbEq(eqDb(0.25))).toBeCloseTo(0.25, 2);
  });
  it("the jog seek stays inside the song; SHIFT is ×10", () => {
    expect(seekTarget(10, 10, 0.03, false, 180)).toBeCloseTo(10.3);
    expect(seekTarget(10, 10, 0.03, true, 180)).toBe(13);
    expect(seekTarget(1, -100, 0.03, true, 180)).toBe(0);
    expect(seekTarget(179, 100, 0.1, false, 180)).toBe(179.5);
  });
  it("browse walks the coming playable rows, never a break or what cannot play", () => {
    const rows = [
      { kind: "track" },
      { kind: "track" },
      { kind: "break" },
      { kind: "cortina" },
      { kind: "track" },
    ];
    const ok = (i: number) => i !== 4 || false;
    expect(browseStep(rows, ok, 0, null, 1)).toBe(1);
    expect(browseStep(rows, ok, 0, 1, 1)).toBe(3);
    expect(browseStep(rows, ok, 0, 3, 5)).toBe(3);
    expect(browseStep(rows, ok, 0, 3, -1)).toBe(1);
    expect(browseStep(rows, () => false, 0, null, 1)).toBeNull();
  });
});

describe("a controller's own audio interface", () => {
  const out = (id: string, label: string, channels?: number): OutputInfo => ({
    id,
    label,
    kind: "usb",
    channels,
    via: "browser",
  });
  it("is the output named like its MIDI port (the named one over the Default alias)", () => {
    const list = [
      out("default", "Default - DDJ-400", 4),
      out("ddj", "DDJ-400", 4),
      out("mac", "MacBook Pro Speakers"),
    ];
    expect(audioOfController("DDJ-400", list)?.id).toBe("ddj");
    expect(audioOfController("DDJ-400 MIDI 1", list)?.id).toBe("ddj");
    expect(audioOfController("LPD8", list)).toBeNull();
    expect(audioOfController("DDJ-FLX4", [out("x", "DDJ-FLX4 (Pioneer DJ)", 4)])?.id).toBe("x");
  });
});

it("every function has a kind", () => {
  for (const f of FNS) expect(FN_KIND[f]).toBeTruthy();
});

describe("review fixes (the tango DJ)", () => {
  it("NOW's CUE fades the playing item out, NEXT's pad 5 skips the rest of the tanda; both ask twice mid-night", () => {
    const ix = new MappingIndex(ddj);
    expect(fnOf(ix.find(parseMidi([0x90, 0x0c, 0x7f])!)!.binding)).toBe("fadeOut");
    expect(fnOf(ix.find(parseMidi([0x99, 0x04, 0x7f])!)!.binding)).toBe("skipTanda");
    expect(ROOM_FNS.has("fadeOut")).toBe(true);
    expect(ROOM_FNS.has("skipTanda")).toBe(true);
  });
});
