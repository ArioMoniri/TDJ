"use client";
import type { FloorReaction, Song } from "@tdj/core";
import { create } from "zustand";
import { arm, confirmArmed, confirmNeeded, disarm, guard, useArm } from "@/lib/booth/confirm";
import { CUE_ON_ROOM } from "@/lib/booth/cue";
import { outputsModel, useAudio } from "@/lib/booth/guard";
import { setSystemOutput } from "@/lib/booth/nativeAudio";
import { pairsOf } from "@/lib/booth/outputs";
import { roomCaps, useBooth } from "@/lib/booth/store";
import { undoEdit } from "@/lib/editHistory";
import { floorReactionOf, floorTap } from "@/lib/favourites";
import { t } from "@/lib/i18n";
import { powerFrame } from "@/lib/power";
import { useStore } from "@/lib/store";
import { toast, useGlobalToast } from "@/lib/toast";
import { type MidiHub, midiSupport, openHub, outputFor, type PortInfo, type Support } from "./access";
import { audioOfController } from "./audio";
import { Learner } from "./learn";
import {
  builtIn,
  builtInFor,
  type ControlId,
  exportMapping,
  type FnId,
  GENERIC_ID,
  importMapping,
  learnInto,
  loadSaved,
  type Mapping,
  mappingFor,
  saveFor,
  unlearn,
} from "./mappings";
import { parseMidi } from "./midi";
import { applyRoomEq, type EqDb, FLAT } from "./roomEq";
import {
  browseStep,
  ControllerRuntime,
  dbEq,
  dbFader,
  dbKnob,
  emptyMirror,
  eqDb,
  faderDb,
  type Intent,
  knobDb,
  LedDiff,
  ledsFor,
  type Mirror,
  SoftTakeover,
  seekTarget,
} from "./runtime";

/**
 * 2026-11 (docs/design/controller.md): the controller in the Booth — the MIDI hub (Web MIDI or the app's CoreMIDI),
 * one runtime per input port (its mapping: saved on this device, else built in), the digital mirror, MIDI Learn,
 * the virtual controller, LED feedback, and the Booth actions every intent ends in. The actions obey the night:
 * what changes the room at once asks for a second press mid-night (lib/booth/confirm.ts), Stop always does, and
 * what the room's player cannot do (Spotify Connect: no crossfade, no EQ) is refused with the reason.
 */
export type Status = "off" | "asking" | "on" | "denied" | "unsupported" | "error";

export interface Offer {
  controller: string;
  outputId: string;
  label: string;
  /** the output carries the headphones on a second pair (a DDJ: ch 3–4) */
  pairs: number;
}

export interface ControllerState {
  status: Status;
  support: Support;
  ports: PortInfo[];
  /** the input whose surface the mirror shows (a controller's port name), null: the virtual controller only */
  active: string | null;
  mapping: Mapping;
  mirror: Mirror;
  xf: "ready" | "across" | "unknown";
  learn: FnId | null;
  /** the controller sheet (the virtual controller, the mirror, Learn) */
  open: boolean;
  browse: number | null;
  /** a jog seek waiting for its confirmation (s) */
  seekTo: number | null;
  eq: EqDb;
  /** a hardware fader still short of the software value (soft takeover): where it is, 0…1 */
  takeover: Partial<Record<FnId, number>>;
  offer: Offer | null;
  /** the last thing a control did, for the sheet's status line */
  did: { fn: FnId; text: string; at: number } | null;
}

const ON_KEY = "tdj-controller-on";
const loadOn = () => {
  try {
    return localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
};
const saveOn = (on: boolean) => {
  try {
    localStorage.setItem(ON_KEY, on ? "1" : "0");
  } catch {}
};

export const useController = create<ControllerState>(() => ({
  status: "off",
  support: "none",
  ports: [],
  active: null,
  mapping: builtIn(GENERIC_ID)!,
  mirror: emptyMirror(),
  xf: "unknown",
  learn: null,
  open: false,
  browse: null,
  seekTo: null,
  eq: { ...FLAT },
  takeover: {},
  offer: null,
  did: null,
}));

let hub: MidiHub | null = null;
const runtimes = new Map<string, ControllerRuntime>();
/** the virtual controller's own runtime (the generic layout) */
let virtualRt = newVirtual();
/** the on-screen controller's runtime: its crossfader starts on A (ready), as drawn */
function newVirtual() {
  const rt = new ControllerRuntime(builtIn(GENERIC_ID)!);
  rt.control("xfader", { value: 0 });
  return rt;
}
const learner = new Learner();
const soft = new SoftTakeover();
const leds = new Map<string, LedDiff>();
let unsubs: Array<() => void> = [];
const offered = new Set<string>();

const set = useController.setState;
const get = useController.getState;

/* ---- connecting ---- */

export function controllerSupport(): Support {
  return midiSupport();
}

/** Ask for MIDI (a click: Chrome shows its prompt), list the ports, listen. */
export async function connectController(): Promise<Status> {
  if (hub) return get().status;
  const support = midiSupport();
  set({ support });
  if (support === "none") {
    set({ status: "unsupported" });
    return "unsupported";
  }
  set({ status: "asking" });
  const r = await openHub();
  if (!("hub" in r)) {
    const status: Status = r.why === "unsupported" ? "unsupported" : r.why === "denied" ? "denied" : "error";
    set({ status });
    if (status === "denied") saveOn(false);
    return status;
  }
  hub = r.hub;
  saveOn(true);
  unsubs.push(hub.onPorts(portsChanged), hub.onMessage(onMessage), watchBooth());
  set({ status: "on" });
  portsChanged();
  return "on";
}

export function disconnectController() {
  for (const u of unsubs) u();
  unsubs = [];
  // the LEDs go dark
  sendLeds({ playing: false, auditioning: false, ducked: false, muted: false, holding: false });
  hub?.close();
  hub = null;
  runtimes.clear();
  leds.clear();
  saveOn(false);
  set({ status: "off", ports: [], active: null, mirror: virtualRt.mirror, mapping: virtualRt.mapping });
}

/** At the Booth's mount: reconnect when the DJ turned the controller on before (no prompt once allowed) */
export function autoConnect() {
  set({ support: midiSupport() });
  if (loadOn() && !hub) void connectController();
}

function portsChanged() {
  if (!hub) return;
  const ports = hub.ports();
  const saved = loadSaved();
  const inputs = ports.filter((p) => p.dir === "in");
  for (const p of inputs)
    if (!runtimes.has(p.name)) runtimes.set(p.name, new ControllerRuntime(mappingFor(p.name, saved)));
  for (const k of [...runtimes.keys()])
    if (!inputs.some((p) => p.name === k)) {
      runtimes.delete(k);
      leds.delete(k);
      // (review, the club DJ: a USB cable knocked out mid-set) the night is never touched; the DJ is told
      toast(t("controller.unplugged", { name: k }));
    }
  let active = get().active;
  if (!active || !runtimes.has(active)) {
    // a known controller first (a DDJ over a keyboard's MIDI port)
    active = inputs.find((p) => builtInFor(p.name).id !== GENERIC_ID)?.name ?? inputs[0]?.name ?? null;
  }
  const rt = active ? runtimes.get(active)! : virtualRt;
  set({ ports, active, mapping: rt.mapping, mirror: rt.mirror, xf: rt.crossfaderState });
  for (const d of leds.values()) d.reset();
  pushLeds();
  void offerAudio(inputs);
}

export function setActive(name: string) {
  const rt = runtimes.get(name);
  if (!rt) return;
  set({ active: name, mapping: rt.mapping, mirror: rt.mirror, xf: rt.crossfaderState });
}

function onMessage(port: PortInfo, data: number[]) {
  const m = parseMidi(data);
  if (!m) return;
  // MIDI Learn: the next control the DJ moves is the one (from any connected controller)
  if (learner.fn) {
    const fn = learner.fn;
    const l = learner.feed(m);
    if (l) finishLearn(port.name, fn, l);
    return;
  }
  const rt = runtimes.get(port.name);
  if (!rt) return;
  const intents = rt.midi(m);
  if (port.name === get().active) mirrorSoon(rt);
  for (const i of intents) runIntent(i, rt.mapping);
}

/**
 * (review, the club DJ: a spinning jog or a fader sends hundreds of messages a second) the mirror is drawn once
 * per frame, whatever came in meanwhile; the intents run at once.
 */
let mirrorFrame = 0;
function mirrorSoon(rt: ControllerRuntime) {
  if (mirrorFrame) return;
  const draw = () => {
    mirrorFrame = 0;
    set({ mirror: rt.mirror, xf: rt.crossfaderState });
  };
  if (typeof requestAnimationFrame === "function")
    mirrorFrame = powerFrame(draw); // saver: 4 fps
  else draw();
}

/* ---- the virtual controller ---- */

/**
 * A touch on the on-screen controller: the same intents a hardware control sends, through the active controller's
 * mapping when one is connected (so it mirrors and drives exactly like it), else the generic layout.
 */
export function virtualControl(c: ControlId, ev: { on?: boolean; value?: number; delta?: number }) {
  const active = get().active;
  const rt = (active && runtimes.get(active)) || virtualRt;
  const intents = rt.control(c, ev);
  set({ mirror: rt.mirror, xf: rt.crossfaderState });
  for (const i of intents) runIntent(i, rt.mapping);
}

/* ---- MIDI Learn ---- */

export function startLearn(fn: FnId | null) {
  learner.arm(fn);
  set({ learn: fn });
}

function finishLearn(
  portName: string,
  fn: FnId,
  l: { key: string; rel?: import("./midi").RelMode; lsb?: number },
) {
  const rt = runtimes.get(portName);
  const base = rt?.mapping ?? mappingFor(portName);
  const r = learnInto(base, fn, l);
  applyMapping(portName, r.mapping);
  set({ learn: null });
  toast(
    r.moved
      ? t("controller.learn.moved", { fn: fnLabel(fn), was: fnLabel(r.moved) })
      : t("controller.learn.bound", { fn: fnLabel(fn) }),
  );
}

/** Use (and save on this device) a mapping for a controller */
export function applyMapping(portName: string, m: Mapping | null) {
  saveFor(portName, m);
  const next = m ?? builtInFor(portName);
  const rt = runtimes.get(portName);
  if (rt) rt.setMapping(next);
  else runtimes.set(portName, new ControllerRuntime(next));
  leds.get(portName)?.reset();
  if (get().active === portName) set({ mapping: next });
  pushLeds();
}

export function forgetLearned(fn: FnId) {
  const name = get().active;
  if (!name) return;
  applyMapping(name, unlearn(get().mapping, fn));
}

export function exportActive(): string {
  return exportMapping(get().mapping);
}

export function importForActive(text: string): { ok: boolean; why?: string } {
  const r = importMapping(text);
  if (!r.ok) return { ok: false, why: r.why };
  const name = get().active;
  if (!name) return { ok: false, why: "no-controller" };
  applyMapping(name, r.mapping);
  return { ok: true };
}

/* ---- the controller's own audio interface ---- */

async function offerAudio(inputs: PortInfo[]) {
  if (!inputs.length) return;
  const b = useBooth.getState();
  await b.refreshOutputs(false).catch(() => {});
  const a = useAudio.getState();
  const n = useBooth.getState().outputs;
  const list = outputsModel(a, { devices: n.devices, room: n.room });
  for (const p of inputs) {
    if (offered.has(p.name)) continue;
    const o = audioOfController(p.name, list);
    if (!o) continue;
    offered.add(p.name);
    // (the room already plays there: nothing to offer — "Default - DDJ-400" is the DDJ too)
    const roomId = a.native ? (a.native.outputs.find((x) => x.isDefault)?.id ?? "") : n.room;
    const room = list.find((x) => x.id === roomId);
    if (o.id === roomId || (room && audioOfController(p.name, [room]))) continue;
    const known = builtInFor(p.name).id.startsWith("ddj-");
    set({
      offer: { controller: p.name, outputId: o.id, label: o.label, pairs: known ? 2 : pairsOf(o.channels) },
    });
    return;
  }
}

/** Play the room on the controller's output (ch 1–2) and the headphones on its ch 3–4. Mid-night: press twice. */
export function acceptOffer(): "ran" | "armed" | null {
  const o = get().offer;
  if (!o) return null;
  return guard("ctl-audio", () => {
    void (async () => {
      const a = useAudio.getState();
      const b = useBooth.getState();
      if (a.native?.platform === "macos") await setSystemOutput(o.outputId);
      else if (!a.native) await b.setRoomOutput(o.outputId);
      if (o.pairs >= 2) {
        await a.setRouting({ roomPair: 0, cuePair: 1 });
        useBooth.getState().setCueOutput(CUE_ON_ROOM);
      }
      set({ offer: null });
      toast(t("controller.audio.done", { name: o.label }));
    })();
  });
}
export const dismissOffer = () => set({ offer: null });

/* ---- LEDs ---- */

function ledState() {
  const b = useBooth.getState();
  return {
    playing: b.state === "playing" || b.state === "cortina",
    auditioning: !!b.audition,
    ducked: b.ducked,
    muted: b.muted,
    holding: b.holding,
  };
}
function sendLeds(s: ReturnType<typeof ledState>) {
  if (!hub) return;
  const ports = hub.ports();
  for (const [name, rt] of runtimes) {
    const input = ports.find((p) => p.dir === "in" && p.name === name);
    const out = input ? outputFor(input, ports) : null;
    if (!out || !rt.mapping.leds) continue;
    let d = leds.get(name);
    if (!d) {
      d = new LedDiff();
      leds.set(name, d);
    }
    for (const bytes of d.next(ledsFor(rt.mapping, s))) hub.send(out.id, bytes);
  }
}
const pushLeds = () => sendLeds(ledState());

/** LEDs follow the Booth; a fader caught by soft takeover lets go when the screen moves the value */
function watchBooth(): () => void {
  let lastMaster = useBooth.getState().master;
  let lastCortina = useBooth.getState().cortinaFader;
  return useBooth.subscribe((s, p) => {
    if (
      s.state !== p.state ||
      s.audition !== p.audition ||
      s.ducked !== p.ducked ||
      s.muted !== p.muted ||
      s.holding !== p.holding
    )
      pushLeds();
    if (s.master !== lastMaster && s.master !== mine.master) soft.release("master");
    if (s.cortinaFader !== lastCortina && s.cortinaFader !== mine.cortina) soft.release("cortina");
    lastMaster = s.master;
    lastCortina = s.cortinaFader;
    if (s.planIndex !== p.planIndex) set({ browse: null, seekTo: null });
  });
}
/** what the controller set last (to tell its own changes from the screen's) */
const mine: { master: number | null; cortina: number | null } = { master: null, cortina: null };

/* ---- intents → the Booth ---- */

export function fnLabel(fn: FnId): string {
  return t(`controller.fn.${fn}` as Parameters<typeof t>[0]);
}

let whyAt = 0;
function why(text: string) {
  const now = Date.now();
  // (a fader sends dozens of messages: the reason is said once a second)
  if (now - whyAt < 1200) return;
  whyAt = now;
  toast(text);
}
/**
 * What a control did, for the sheet's line; with the sheet closed (review, the club DJ: "BROWSE and the jog give me
 * no feedback") it is a toast — the one toast replaces itself, so a turning jog is one updating line.
 */
function did(fn: FnId, text: string, o: { toast?: boolean } = {}) {
  set({ did: { fn, text, at: Date.now() } });
  if (o.toast !== false && !get().open && QUIET_TOAST.has(fn)) toast(text);
}
/** functions whose result the screen does not show by itself */
const QUIET_TOAST: ReadonlySet<FnId> = new Set(["seek", "browse", "cueNext", "confirm", "hold", "mute"]);
/** arm a room action mid-night and say so on screen (the DJ's eyes may be on the controller) */
function confirmRun(fn: FnId, key: string, run: () => void, always = false) {
  const armedNow = useArm.getState().armed;
  const second = armedNow?.key === key && armedNow.until > Date.now();
  // (the sheet says it in its own line; with the sheet closed the DJ's eyes are on the controller: a toast)
  const ask = () => {
    if (!get().open) toast(t("controller.press_again", { fn: fnLabel(fn) }));
    did(fn, t("controller.press_again", { fn: fnLabel(fn) }), { toast: false });
  };
  if (always && !second) {
    arm(key, run);
    return ask();
  }
  if (guard(key, run) === "armed") ask();
  else did(fn, fnLabel(fn));
}

/** the next item that can play after the playhead (what NEXT's deck holds) */
export function nextPlayable(): number | null {
  const s = useBooth.getState();
  if (!s.plan) return null;
  for (let i = s.planIndex + 1; i < s.plan.items.length; i++)
    if (s.sources[i] !== "missing" && s.plan.items[i]!.kind !== "break") return i;
  return null;
}

/** whether the room EQ can act on what plays now (Web Audio: files and clips) */
export function eqAvailable(): boolean {
  const s = useBooth.getState();
  const k = s.sources[s.planIndex];
  return k === "file" || k === "preview" || k === undefined;
}

export function runIntent(i: Intent, mapping: Mapping) {
  const b = useBooth.getState();
  const caps = roomCaps(b);
  const live = b.state === "playing" || b.state === "cortina";
  switch (i.fn) {
    case "playPause": {
      if (!b.started) {
        if (b.plan) void b.start();
        return did("playPause", t("controller.did.start"));
      }
      if (b.breakUntil !== null) return void b.endBreak();
      if (live) return confirmRun("playPause", "ctl-pause", () => useBooth.getState().pause());
      void b.play();
      return did("playPause", t("controller.did.play"));
    }
    case "nextNow":
      if (!b.plan) return;
      return confirmRun("nextNow", "next", () => void useBooth.getState().nextNow());
    case "previous":
      if (!b.plan) return;
      return confirmRun("previous", "prev", () => void useBooth.getState().previous());
    case "skipNext":
      if (!b.started) return why(t("controller.why.not_started"));
      return confirmRun("skipNext", "skip-next", () => useBooth.getState().next());
    case "stop":
      if (!b.started || b.state === "stopped") return why(t("controller.why.not_started"));
      return confirmRun(
        "stop",
        "ctl-stop",
        () => useBooth.getState().stop(caps.fade ? useBooth.getState().settings.fadeNowSec : 0),
        true,
      );
    case "fadeOut":
      if (!live) return why(t("controller.why.not_playing"));
      if (!caps.fade) return why(t("booth.connect.no_fade_why"));
      return confirmRun("fadeOut", "fade", () => useBooth.getState().fadeOutNow());
    case "skipTanda": {
      const it = b.plan?.items[b.planIndex];
      if (!live || it?.kind !== "track") return why(t("controller.why.not_playing"));
      return confirmRun("skipTanda", "skip-tanda", () => useBooth.getState().cueCortina());
    }
    case "cueNext": {
      if (b.audition) {
        b.stopAudition();
        return did("cueNext", t("controller.did.cue_stopped"));
      }
      const n = get().browse ?? nextPlayable();
      if (n === null) return why(t("controller.why.nothing_next"));
      const nowSpotify = b.started && (b.sources[b.planIndex] === "spotify" || b.sources[n] === "spotify");
      if (nowSpotify) return why(t("booth.controls.why_spotify_cue"));
      void b.prelisten({ i: n }).then((w) => {
        if (w) why(t("booth.songSheet.can_t_pre_listen", { why: w }));
        else did("cueNext", t("controller.did.cue", { title: titleOf(n) }));
      });
      return;
    }
    case "master": {
      if (i.type !== "level") return;
      if (!caps.volume) return why(t("booth.connect.no_volume_why"));
      const fader = i.control === "A.level" || i.control === "B.level";
      const sw = fader ? dbFader(b.master) : dbKnob(b.master);
      if (i.soft && !soft.accept("master", i.value, sw)) return takeover("master", i.value);
      const db = fader ? faderDb(i.value) : knobDb(i.value);
      mine.master = db;
      clearTakeover("master");
      if (db !== b.master) b.setMaster(db);
      return;
    }
    case "cortina": {
      if (i.type !== "level") return;
      if (i.soft && !soft.accept("cortina", i.value, b.cortinaFader)) return takeover("cortina", i.value);
      const v = Math.round(i.value * 20) / 20;
      mine.cortina = v;
      clearTakeover("cortina");
      if (v !== b.cortinaFader) b.setCortinaFader(v);
      return;
    }
    case "eqHi":
    case "eqMid":
    case "eqLow": {
      if (i.type !== "level") return;
      if (!eqAvailable()) return why(t("controller.why.eq_spotify"));
      const band = i.fn === "eqHi" ? "high" : i.fn === "eqMid" ? "mid" : "low";
      const cur = get().eq;
      if (i.soft && !soft.accept(i.fn, i.value, dbEq(cur[band]))) return takeover(i.fn, i.value);
      clearTakeover(i.fn);
      const eq = { ...cur, [band]: eqDb(i.value) };
      set({ eq });
      applyRoomEq(eq);
      return;
    }
    case "crossfade": {
      if (i.type === "turn" || i.type === "level") return;
      if (i.type === "back") {
        if (useArm.getState().armed?.key === "crossfade") {
          disarm();
          did("crossfade", t("controller.did.crossfade_cancelled"));
        }
        return;
      }
      if (!live) return why(t("controller.why.not_playing"));
      if (!caps.fade) return why(t("booth.connect.no_fade_why"));
      const n = nextPlayable();
      if (n !== null && (b.sources[b.planIndex] === "spotify" || b.sources[n] === "spotify"))
        return why(t("booth.controls.why_spotify_overlap"));
      return confirmRun("crossfade", "crossfade", () => void useBooth.getState().crossfadeNext());
    }
    case "seek": {
      if (i.type !== "turn") return;
      const item = b.plan?.items[b.planIndex];
      if (!b.started || !item || item.kind === "break" || !(live || b.state === "paused"))
        return why(t("controller.why.not_playing"));
      const length = b.current ? Math.max(0, b.current.endsAt - b.current.startedAt) : (item.lengthSec ?? 0);
      const base = get().seekTo ?? b.position;
      const to = seekTarget(base, i.delta, mapping.jogSecPerTick ?? 0.03, i.shift, length);
      set({ seekTo: to });
      if (live && confirmNeeded()) {
        // mid-night: the target waits for BROWSE (Confirm) — the song plays on meanwhile
        arm("ctl-seek", () => {
          set({ seekTo: null });
          void useBooth.getState().seek(to);
        });
        return did("seek", t("controller.did.seek_armed", { at: clock(to) }));
      }
      scheduleSeek(to);
      return did("seek", t("controller.did.seek", { at: clock(to) }));
    }
    case "browse": {
      if (i.type !== "turn" || !b.plan) return;
      const at = browseStep(
        b.plan.items,
        (k) => b.sources[k] !== "missing" && !b.skipped.includes(k),
        b.planIndex,
        get().browse,
        i.delta,
      );
      set({ browse: at });
      if (at !== null) did("browse", t("controller.did.browse", { n: at + 1, title: titleOf(at) }));
      return;
    }
    case "load": {
      const at = get().browse;
      if (at === null || !b.plan) return why(t("controller.why.browse_first"));
      if (b.started) {
        b.playNext(at);
        toast(t("controller.did.load", { title: titleOf(at) }));
      } else {
        b.select(at);
        toast(t("controller.did.select", { title: titleOf(at) }));
      }
      set({ browse: null });
      return did("load", t("controller.did.load", { title: titleOf(at) }));
    }
    case "confirm": {
      if (confirmArmed()) return did("confirm", t("controller.did.confirmed"));
      if (get().browse !== null) return runIntent({ fn: "load", type: "press" }, mapping);
      return;
    }
    case "talk":
      if (!caps.volume) return why(t("booth.connect.talk_unavailable"));
      b.setDucked(!b.ducked);
      return did("talk", b.ducked ? t("controller.did.talk_off") : t("controller.did.talk_on"));
    case "mute":
      // (review, the tango DJ: a pad is easy to hit by mistake — silencing the room mid-night asks twice;
      // the sound coming back never waits)
      if (!b.muted && live) return confirmRun("mute", "ctl-mute", () => useBooth.getState().toggleMute());
      b.toggleMute();
      return did("mute", fnLabel("mute"));
    case "hold":
      if (!live) return why(t("controller.why.not_playing"));
      b.toggleHold();
      return did("hold", fnLabel("hold"));
    case "undo": {
      const tst = useGlobalToast.getState().toast;
      if (tst?.undo) {
        tst.undo();
        useGlobalToast.getState().dismiss();
        return did("undo", fnLabel("undo"));
      }
      void undoEdit().then((e) =>
        toast(e ? t("editKeys.undone", { label: e.label }) : t("editKeys.nothing_to_undo")),
      );
      return;
    }
    case "floorFull":
      return floor("full");
    case "floorOk":
      return floor("ok");
    case "floorEmptied":
      return floor("emptied");
    case "findSongs": {
      const el = document.querySelector<HTMLButtonElement>('[data-testid="booth-find-songs"]');
      if (el) {
        set({ open: false });
        el.click();
      }
      return;
    }
  }
}

function takeover(fn: FnId, v: number) {
  const cur = get().takeover;
  if (cur[fn] !== v) set({ takeover: { ...cur, [fn]: v } });
}
function clearTakeover(fn: FnId) {
  const cur = get().takeover;
  if (cur[fn] === undefined) return;
  const { [fn]: _x, ...rest } = cur;
  set({ takeover: rest });
}

let seekTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSeek(to: number) {
  if (seekTimer) clearTimeout(seekTimer);
  seekTimer = setTimeout(() => {
    seekTimer = null;
    set({ seekTo: null });
    void useBooth.getState().seek(to);
  }, 220);
}

function titleOf(i: number): string {
  const s = useBooth.getState();
  const it = s.plan?.items[i] as { title?: string } | undefined;
  return it?.title ?? "";
}
const clock = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

function floor(r: FloorReaction) {
  const b = useBooth.getState();
  const playlist = b.playlist;
  const item = b.plan?.items[b.planIndex];
  const entity = b.entities[b.planIndex] ?? null;
  const song: Song | null = item?.kind === "track" && entity && "rhythm" in entity ? (entity as Song) : null;
  const tanda = item?.tanda ?? 0;
  if (!playlist || !song || !playlist.tandas[tanda - 1]) return why(t("controller.why.no_song"));
  const was = floorReactionOf(useStore.getState().memory, playlist, {
    scope: "song",
    tanda,
    songId: song.id,
  });
  useStore.getState().updateMemory((m) => floorTap(m, playlist, { scope: "song", tanda, song, reaction: r }));
  const key = r === "full" ? "fav.floor_full" : r === "ok" ? "fav.floor_ok" : "fav.floor_emptied";
  toast(was === r ? t("fav.cleared_toast") : t("fav.tapped_toast", { reaction: t(key) }));
  did(r === "full" ? "floorFull" : r === "ok" ? "floorOk" : "floorEmptied", t(key));
}

/** For the e2e and the console: the hub's state (nothing secret) */
export const _controllerDebug = () => ({ runtimes: [...runtimes.keys()], hub: hub?.via ?? null });
/** tests: start over */
export function _resetController() {
  disconnectController();
  virtualRt = newVirtual();
  offered.clear();
  soft.releaseAll();
}
