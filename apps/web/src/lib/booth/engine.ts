import {
  energyHook,
  joinAfterTail,
  type PlannedTransition,
  SILENCE_CUT_FADE_SEC,
  SILENCE_MAX_SEC,
  type SilenceMode,
  silenceJoin,
} from "@tdj/core";
import { t as tx } from "@/lib/i18n";
import {
  DECLICK_IN,
  DECLICK_OUT,
  dbToGain,
  EMERGENCY_FADE,
  fadeInCurve,
  fadeOutCurve,
  PAUSE_RAMP,
} from "./envelope";
import type { BoothLogEntry, BoothRow, BoothRows } from "./plan";
import { remainingFrom } from "./plan";
import type {
  ExternalHandle,
  ItemSource,
  PlanEntity,
  PreparedItem,
  SourceAdapter,
  SourceKind,
} from "./sources/types";
import { isExternalKind } from "./sources/types";
import {
  applyEqPoints,
  applyIncoming,
  applyOutgoing,
  BASS_SHELF_HZ,
  eqLanes,
  HIGH_SHELF_HZ,
  MID_PEAK_HZ,
  type TransitionWindow,
  transitionWindow,
} from "./transition";

/* ---------- the subset of Web Audio the engine uses (tests inject a recording fake, §12.1) ---------- */
export interface AudioParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  setValueCurveAtTime(c: Float32Array, t: number, d: number): unknown;
  setTargetAtTime(v: number, t: number, tc: number): unknown;
  cancelScheduledValues(t: number): unknown;
  cancelAndHoldAtTime?(t: number): unknown;
}
export interface NodeLike {
  connect(n: unknown): unknown;
  disconnect(): void;
}
export interface GainNodeLike extends NodeLike {
  gain: AudioParamLike;
}
export interface SourceNodeLike extends NodeLike {
  buffer: AudioBuffer | null;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
  onended: ((ev: Event) => unknown) | null;
}
export interface OscillatorLike extends NodeLike {
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((ev: Event) => unknown) | null;
}
/** wave 4: the EQ of a transition's bass swap (a lowshelf and a highshelf per item) */
export interface BiquadLike extends NodeLike {
  type: string;
  frequency: AudioParamLike;
  gain: AudioParamLike;
}
export interface AnalyserLike extends NodeLike {
  fftSize: number;
  getFloatTimeDomainData(a: Float32Array): void;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly outputLatency?: number;
  readonly state?: string;
  destination: unknown;
  createGain(): GainNodeLike;
  createBufferSource(): SourceNodeLike;
  createAnalyser(): AnalyserLike;
  createOscillator?(): OscillatorLike;
  createBiquadFilter?(): BiquadLike;
  resume(): Promise<void>;
  suspend?(): Promise<void>;
  /** `statechange`: iOS interrupts the context for a call / Siri, a Bluetooth route change can suspend it */
  addEventListener?(type: "statechange", cb: () => void): void;
}

/* ---------- settings, state, events ---------- */
export interface BoothSettings {
  gapSec: number;
  cortinaFadeInSec: number;
  cortinaFadeOutSec: number;
  cortinaLevelDb: number;
  loudnessTargetLUFS: number;
  trimLeadingSilence: boolean;
  mediaKeys: boolean;
  /** round 20: fade at the end of every tango side (0 = none: dancers dislike faded songs) */
  songFadeOutSec: number;
  /** round 20: Pause / Resume fade */
  pauseFadeSec: number;
  /** round 20: "Fade out now" length */
  fadeNowSec: number;
  /** round 20: "Next with crossfade" length */
  crossfadeSec: number;
  /** round 20: "Fade out and stop" length ("Stop now" is 0.1 s) */
  stopFadeSec: number;
}
export const DEFAULT_BOOTH_SETTINGS: BoothSettings = {
  gapSec: 2.5,
  cortinaFadeInSec: 0,
  cortinaFadeOutSec: 4,
  cortinaLevelDb: -4,
  loudnessTargetLUFS: -16,
  trimLeadingSilence: false,
  mediaKeys: true,
  songFadeOutSec: 0,
  pauseFadeSec: 0.8,
  fadeNowSec: 4,
  crossfadeSec: 3,
  stopFadeSec: 3,
};
/** Ranges of the round-20 transport settings (steppers in the Mix sheet). */
export const TRANSPORT_RANGES = {
  songFadeOutSec: { min: 0, max: 8, step: 0.5 },
  pauseFadeSec: { min: 0, max: 3, step: 0.1 },
  fadeNowSec: { min: 1, max: 10, step: 0.5 },
  crossfadeSec: { min: 1, max: 8, step: 0.5 },
  stopFadeSec: { min: 0.5, max: 8, step: 0.5 },
} as const;
/** "Stop now": a cut, declicked. */
export const STOP_NOW_SEC = 0.1;
/** Talk-over: the master dips this much, over this long (round7-booth.md §11 "microphone duck"). */
export const DUCK_DB = -12;
export const DUCK_SEC = 0.5;
export type BoothState = "idle" | "armed" | "playing" | "cortina" | "paused" | "stopped";
export interface BoothItemRuntime {
  planIndex: number;
  /** ctx time the item starts */
  startedAt: number;
  endsAt: number;
  source: SourceKind;
  gainDb: number;
  peakCapped: boolean;
  /** where the normalisation number came from */
  gainFrom: "measured" | "prior" | "none";
  started: boolean;
  /** 2026-11: seconds of the side's silent head skipped (its clock starts at the music) */
  headCut?: number;
  /** 2026-11: the second in the recording the item's clock 0 is (its cue in plus the head cut) */
  srcStart?: number;
}
export type EngineEvent =
  | { type: "state"; from: BoothState; to: BoothState; planIndex: number; reason?: string }
  | { type: "item"; planIndex: number }
  | { type: "banner"; text: string; key?: string; action?: { label: string; run: () => void } }
  | { type: "ended" }
  | { type: "birthday"; result: "marked" | "needs-swap" }
  | { type: "decoding"; planIndex: number; busy: boolean }
  /** 2026-11: an external item was asked to start and its device has not confirmed it yet ("Starting…") */
  | { type: "starting"; on: boolean };

interface Scheduled extends BoothItemRuntime {
  kind: BoothRow["kind"];
  when: number;
  gain?: GainNodeLike;
  fader?: GainNodeLike;
  node?: SourceNodeLike;
  external?: ExternalHandle;
  base: number;
  measured?: PreparedItem["measured"];
  cancelled?: boolean;
  /** Spotify: the track position the item was started at */
  extStart?: number;
  /** wave 4: the item's EQ (flat until a transition's bass swap automates it) */
  eqLow?: BiquadLike;
  eqHigh?: BiquadLike;
  /** 2026-11: the mids (a peaking band) a three-band swap hands over */
  eqMid?: BiquadLike;
  /** wave 4: an edited transition rewrote this item's tail; `end` is where it would have ended on its own */
  tail?: { end: number };
  /** wave 4: the DJ acted on this item (fade now, pause, crossfade, cortina fader): no transition rewrites it */
  interrupted?: boolean;
  /** 2026-11: seconds of its silent tail the item still plays before it ends (they count toward the next gap) */
  keptTail?: number;
  /** 2026-11 (seek): an external item was started with a stop time (`durationSec`), not "to the track's end" */
  extTimed?: boolean;
  /** 2026-11 (seek): the clock holds here until the rebuilt item's own clock reaches it (never back, never 0) */
  seekFloor?: number;
  /** 2026-11: an external item's own end fade (restored when an edited transition into the next is called off) */
  extFadeOut?: number;
  /** 2026-11: an edited transition retimed this external item's end */
  extRetimed?: boolean;
}
/** Where a Pause left the night: the item and the seconds into it. */
export interface PausedAt {
  planIndex: number;
  at: number;
  /** the item as it was playing (its length, gain) for the cards while it waits */
  runtime: BoothItemRuntime;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The first start is this far ahead of "now": enough for the graph to settle, inaudible as a delay. */
export const START_AHEAD = 0.05;
/** a seek inside the song: the old position fades this fast and the new one rises as fast (no click, no gap) */
export const SEEK_FADE = 0.03;
/** Spotify plays one track at a time: the new position starts after the old play's pause went out */
export const SEEK_EXTERNAL_DELAY = 0.25;
export const TRIM_MAX_SEC = 3;
/** Normalisation never adds or removes more than ±12 dB. */
export const NORM_LIMIT_DB = 12;
export const PEAK_CAP_DBFS = -1;
/** A Deezer preview is 30 s: an item played from one is capped there whatever the mode. */
export const PREVIEW_CAP_SEC = 30;

/** §5.2: base gain from the measurement (or the prior), the DJ's trim, and the −1 dBFS peak cap. */
export function gainFor(
  item: Pick<BoothRow, "kind" | "gainDb">,
  measured: { lufs?: number; peakDbFS?: number } | undefined,
  settings: Pick<BoothSettings, "loudnessTargetLUFS" | "cortinaLevelDb">,
  trimDb = 0,
): { gainDb: number; base: number; peakCapped: boolean; from: BoothItemRuntime["gainFrom"] } {
  const target = settings.loudnessTargetLUFS + (item.kind === "cortina" ? settings.cortinaLevelDb : 0);
  let norm: number;
  let from: BoothItemRuntime["gainFrom"];
  if (measured && Number.isFinite(measured.lufs)) {
    norm = clamp(target - (measured.lufs as number), -NORM_LIMIT_DB, NORM_LIMIT_DB);
    from = "measured";
  } else if (item.gainDb !== undefined && Number.isFinite(item.gainDb)) {
    // the plan's prior already includes the cortina level offset and the peak cap when the catalogue knew a peak
    norm = clamp(item.gainDb, -NORM_LIMIT_DB, NORM_LIMIT_DB);
    from = "prior";
  } else {
    norm = item.kind === "cortina" ? settings.cortinaLevelDb : 0;
    from = "none";
  }
  let peakCapped = false;
  const peak = measured?.peakDbFS;
  if (peak !== undefined && Number.isFinite(peak) && peak + norm + trimDb > PEAK_CAP_DBFS) {
    norm = PEAK_CAP_DBFS - peak - trimDb; // the trim is the DJ's and is never reduced
    peakCapped = true;
  }
  const gainDb = norm + trimDb;
  return { gainDb, base: dbToGain(gainDb), peakCapped, from };
}

/** The loud part of a decoded full file (RMS per 0.5 s → `energyHook`), seconds; null when it has none. */
export function fileHookSec(buffer: AudioBuffer): number | null {
  const ch = typeof buffer.getChannelData === "function" ? buffer.getChannelData(0) : null;
  if (!ch?.length || !(buffer.sampleRate > 0)) return null;
  const hop = Math.round(buffer.sampleRate / 2);
  const env: number[] = [];
  for (let i = 0; i + hop <= ch.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j += 16) s += ch[j]! * ch[j]!;
    env.push(Math.sqrt(s / (hop / 16)));
  }
  return energyHook(env, 0.5)?.startSec ?? null;
}

/** 2026-11: the Booth's decisions about what comes next (BoothEngine.marks / restoreMarks) */
export interface BoothMarks {
  skipped: number[];
  holdBefore: number | null;
  holding: boolean;
  breakUntil: number | null;
  forcedNext: number | null;
  birthday: number[];
}

export interface EngineOptions {
  adapters: SourceAdapter[];
  settings?: Partial<BoothSettings>;
  onEvent?: (e: EngineEvent) => void;
  /** 30 in rehearsal mode: every item is capped there */
  rehearsalSec?: number | null;
  now?: () => number;
  /** wave 2: why an item has nothing to play it from, in plain words (the banner says it instead of "No source") */
  whyMissing?: (planIndex: number) => string | null;
  /**
   * 2026-11 (the audio fallback): whether a cortina playing from a full local file may start at the loud part its
   * energy shows — a cue without synced lyrics (no chorus in the data) and without the DJ's own start
   */
  audioHook?: (it: BoothRow) => boolean;
}

/**
 * The booth (round7-booth.md §3, §6): one master + analyser for the life of the page, a gain per item, buffer
 * sources started at absolute context times (the next item is scheduled as soon as the current one starts, so a
 * throttled tab still hits the gap), −60 dB log fades with `setValueCurveAtTime`, a 1 s emergency fade, and a
 * state machine whose transitions are logged for History. No React in here: the page subscribes through
 * `store.ts`.
 */
export class BoothEngine {
  readonly ctx: AudioContextLike;
  readonly master: GainNodeLike;
  readonly analyser: AnalyserLike;
  settings: BoothSettings;
  state: BoothState = "idle";
  plan: BoothRows | null = null;
  entities: PlanEntity[] = [];
  sources: ItemSource[] = [];
  planIndex = 0;
  /** items left out of the rest of the night (missing, skipped, cued past) */
  skipped = new Set<number>();
  trims: Record<string, number> = {};
  log: BoothLogEntry[] = [];
  anchors: Array<{ planIndex: number; at: string }> = [];
  /** wall clock when the night started (ms) */
  startedWall = 0;
  masterDb = 0;
  muted = false;
  cortinaFader = 1;
  /** finish the current item, then wait */
  holding = false;
  /** hold before this plan index (birthday vals) */
  holdBefore: number | null = null;
  breakUntil: number | null = null;
  /** round 20: an immediate Pause (not a hold): Play resumes this item from `at` */
  pausedAt: PausedAt | null = null;
  /** round 20: talk-over, the master dipped by DUCK_DB */
  ducked = false;
  /** 2026-11: Auto master's boost on top of the DJ's master (lib/booth/autoMaster.ts), dB ≥ 0 */
  autoDb = 0;
  current: Scheduled | null = null;
  rehearsalSec: number | null;
  private queued: Scheduled | null = null;
  /** items fading out under the next one (a crossfade's outgoing item): Stop and Pause silence them too */
  private tails = new Set<Scheduled>();
  private adapters: SourceAdapter[];
  private onEvent: (e: EngineEvent) => void;
  private generation = 0;
  private prepared = new Map<number, Promise<PreparedItem>>();
  /** 2026-11: the silent head / tail measured on the decoded audio of each item (file, clip) */
  private silenceKnown = new Map<number, { head: number; tail: number }>();
  private rmsSq = 0;
  private peakHold = { v: 0, at: 0 };
  private meterBuf: Float32Array | null = null;
  private wall: () => number;

  constructor(ctx: AudioContextLike, o: EngineOptions) {
    this.ctx = ctx;
    this.adapters = o.adapters;
    this.settings = { ...DEFAULT_BOOTH_SETTINGS, ...(o.settings ?? {}) };
    this.onEvent = o.onEvent ?? (() => {});
    this.rehearsalSec = o.rehearsalSec ?? null;
    this.wall = o.now ?? (() => Date.now());
    this.whyMissing = o.whyMissing ?? (() => null);
    this.audioHook = o.audioHook ?? (() => false);
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    // the OS can suspend or interrupt the context under a running night (a call, Siri, a Bluetooth route change):
    // take it back as soon as it says so (round20-booth.md "can't hear")
    ctx.addEventListener?.("statechange", () => this.ensureRunning());
  }

  /**
   * 2026-11 (Part B: outputs): where the room goes after the master and the meter — the context's destination, or a
   * router's input (lib/booth/routing.ts: a DJ controller's channel pair, a second speaker set, a delay trim).
   */
  setOutput(node: unknown | null): void {
    this.analyser.disconnect();
    this.analyser.connect(node ?? this.ctx.destination);
  }
  /**
   * 2026-11 (Bluetooth latency): the room output's delay (s) the playhead allows for when the context reports less
   * (Safari reports none; a Bluetooth speaker adds ~200 ms) — the position, the waveform and the transition editor
   * show what the dancers hear.
   */
  outputLatencySec = 0;
  /** a paused item (Pause, not a hold) */
  get paused(): boolean {
    return this.pausedAt !== null;
  }
  /** Resume the context when the night is live and the OS took it away; a no-op otherwise. */
  ensureRunning(): void {
    const live = this.state === "playing" || this.state === "cortina" || this.state === "armed";
    if (live && this.ctx.state && this.ctx.state !== "running" && this.ctx.state !== "closed")
      void this.ctx.resume().catch(() => {});
  }
  /** what the master multiplies everything by (mute, master fader, talk-over) */
  outputGain(): number {
    const lvl = Math.min(6, this.masterDb + this.autoDb);
    return this.muted ? 0 : dbToGain(lvl + (this.ducked ? DUCK_DB : 0));
  }

  /* ---------- plan ---------- */

  load(plan: BoothRows, entities: PlanEntity[], sources: ItemSource[]) {
    this.plan = plan;
    this.entities = entities;
    this.sources = sources;
    this.skipped = new Set(sources.map((s, i) => (s === "missing" ? i : -1)).filter((i) => i >= 0));
    for (let i = 0; i < plan.items.length; i++) if (plan.items[i]!.kind === "break") this.skipped.delete(i);
    this.prepared.clear();
    this.silenceKnown.clear();
  }
  /** A swap ahead of the playhead replaced items: keep the playhead, refresh the rest. */
  replacePlan(plan: BoothRows, entities: PlanEntity[], sources: ItemSource[]) {
    const keepSkipped = new Set([...this.skipped].filter((i) => i <= this.planIndex));
    const was = { plan: this.plan, sources: this.sources };
    // 2026-11 (the owner: back on the Booth, the music paused): a row the new plan left as it was, from the same
    // source, keeps what was prepared for it (a decode of a whole side takes seconds: the next song came late)
    const same = (i: number) =>
      was.sources[i] === sources[i] && JSON.stringify(was.plan?.items[i]) === JSON.stringify(plan.items[i]);
    const kept = [...this.prepared].filter(([i]) => same(i));
    const keptSilence = [...this.silenceKnown].filter(([i]) => same(i));
    this.load(plan, entities, sources);
    for (const i of keepSkipped) this.skipped.add(i);
    for (const [i, p] of kept) this.prepared.set(i, p);
    for (const [i, s] of keptSilence) this.silenceKnown.set(i, s);
    // the queued item has not sounded yet (its start is ahead): rebuild it from the new plan (a swap, a cortina's
    // new fades or stop second, round 20) — unless the plan left the running item, the queued one and the order
    // between them as they were: then it stays as scheduled (nothing is stopped, re-prepared or moved)
    const q = this.queued;
    if (q && (!q.started || q.when > this.ctx.currentTime + 0.05)) {
      const c = this.current;
      const unchanged =
        !!c && same(c.planIndex) && same(q.planIndex) && this.nextPlayable(c.planIndex) === q.planIndex;
      if (unchanged) return;
      this.cancelQueued();
      if (this.state === "playing" || this.state === "cortina") void this.scheduleNext();
    }
  }

  item(i = this.planIndex): BoothRow | null {
    return this.plan?.items[i] ?? null;
  }
  private adapterFor(i: number): SourceAdapter | null {
    const k = this.sources[i];
    return (k && this.adapters.find((a) => a.kind === k)) ?? null;
  }
  /** round 21: the item the DJ asked to play next ("Play next"); the night continues from it */
  forcedNext: number | null = null;
  /** round 21: the items of the tandas the DJ bypasses tonight ("skip tonight", the last-four-tango setting) */
  bypassed = new Set<number>();
  private whyMissing: (planIndex: number) => string | null;
  private audioHook: (it: BoothRow) => boolean;
  setBypass(items: Iterable<number>): void {
    this.bypassed = new Set(items);
    // (the queued item is now bypassed: rebuild it)
    if (this.queued && this.bypassed.has(this.queued.planIndex) && !this.queued.started) {
      this.cancelQueued();
      if (this.state === "playing" || this.state === "cortina") void this.scheduleNext();
    }
  }
  private passes(i: number): boolean {
    return !this.skipped.has(i) && !this.bypassed.has(i);
  }
  /** The next index after `from` that will play (not skipped or bypassed; breaks count; "Play next" first). */
  nextPlayable(from: number): number | null {
    if (!this.plan) return null;
    const f = this.forcedNext;
    if (f !== null && f !== from && f >= 0 && f < this.plan.items.length && !this.skipped.has(f)) return f;
    for (let i = from + 1; i < this.plan.items.length; i++) if (this.passes(i)) return i;
    return null;
  }
  /** the closing La Cumparsita's plan index (the last item when it is the closing) */
  closingIndex(): number | null {
    const items = this.plan?.items ?? [];
    const k = items.length - 1;
    return k >= 0 && items[k]!.kind === "closing" && items[k]!.tanda > 0 ? k : null;
  }
  /**
   * Round 21 — "Jump to La Cumparsita now" (`now`: the running item fades and the closing starts) or "Play the rest,
   * then La Cumparsita" (the rest of the running tanda plays, then the closing: every item between is left out).
   */
  async jumpToClosing(now: boolean): Promise<void> {
    const c = this.closingIndex();
    if (c === null) return;
    if (now) return this.playNow(c);
    this.clearSkip();
    const cur = this.item();
    const tanda = cur?.kind === "track" ? cur.tanda : -1;
    for (let i = this.planIndex + 1; i < c; i++) {
      const it = this.plan!.items[i]!;
      if (!(it.kind === "track" && it.tanda === tanda)) this.skipped.add(i);
    }
    this.skipped.delete(c);
    this.forcedNext = null;
    if (this.queued && !this.queued.started) this.cancelQueued();
    this.transition(this.state, "cumparsita next");
    if (this.state === "playing" || this.state === "cortina") void this.scheduleNext();
  }

  /**
   * Round 21 — "Play now": the running item fades out over `fadeSec` and item `i` starts once the fade is through;
   * the night continues from `i`. Before anything plays (armed, paused, stopped) the playhead moves to `i` and it starts.
   */
  async playNow(i: number, fadeSec = this.settings.fadeNowSec): Promise<void> {
    if (!this.plan?.items[i] || this.item(i)?.kind === "break") return;
    // 2026-11: Spotify Connect switches tracks itself and cannot fade: no pause, no wait, one play (coalesced)
    if (this.live && this.instantSwitch(i)) return this.queueSwitch(i);
    this.clearSkip();
    this.forcedNext = null;
    this.skipped.delete(i);
    if (this.state === "playing" || this.state === "cortina") {
      // Spotify plays one track at a time: the outgoing play's pause (at the end of its fade) goes out before the
      // new play, or it would pause the jump (2026-11)
      const ext = !!this.current?.external || isExternalKind(this.sources[i]);
      this.stop("play now", fadeSec);
      this.pausedAt = null;
      this.planIndex = i;
      this.transition("armed", "play now");
      await this.play(Math.max(START_AHEAD, fadeSec) + (ext ? SEEK_EXTERNAL_DELAY : 0));
      return;
    }
    this.pausedAt = null;
    this.planIndex = i;
    if (this.state === "stopped" || this.state === "paused") this.transition("armed", "play now");
    await this.play();
  }

  /** Round 21 — "Play next": item `i` follows the running one at the gap (then the night continues from it). */
  playNext(i: number): void {
    if (!this.plan?.items[i] || this.item(i)?.kind === "break") return;
    this.skipped.delete(i);
    if (this.state === "playing" || this.state === "cortina") {
      this.forcedNext = i;
      this.picked = i;
      this.cancelQueued();
      this.transition(this.state, "play next");
      void this.scheduleNext();
      return;
    }
    this.forcedNext = null;
    this.pausedAt = null;
    this.planIndex = i;
    this.transition(this.state === "idle" ? "idle" : "armed", "play next");
    void this.prepare(i).catch((e) => this.markMissing(i, e));
  }

  /** 2026-11: the item "Play next" picked, while it still waits after the running one */
  private picked: number | null = null;
  /**
   * The item "Play next" put after the running one, while it is still to come (the forced pointer, or the queued
   * item that has not started); null once it plays or another jump replaced it. The Up Next card and the set list
   * show it (the owner: "Play next doesn't work" — nothing on screen changed).
   */
  pickedNext(): number | null {
    const p = this.picked;
    if (p === null) return null;
    const q = this.queued;
    const waiting =
      this.live &&
      (this.forcedNext === p ||
        (!!q && q.planIndex === p && !(q.started && q.when <= this.ctx.currentTime + 0.05)));
    if (!waiting || this.current?.planIndex === p) {
      this.picked = null;
      return null;
    }
    return p;
  }
  /** Undo of "Play next": the planned next item follows the running one again. */
  undoPlayNext(): void {
    const p = this.pickedNext();
    if (p === null) return;
    this.picked = null;
    this.forcedNext = null;
    if (this.queued && this.queued.planIndex === p) this.cancelQueued();
    this.transition(this.state, "play next undone");
    void this.scheduleNext();
  }

  /* ---------- seek: start from any row, one ahead / one back, a point inside the song ---------- */

  /** the night is sounding (an item plays or is queued to) */
  get live(): boolean {
    return this.state === "playing" || this.state === "cortina";
  }
  /** Whether row `i` can be the playhead: a song or cortina with a source, not left out tonight. */
  canPlay(i: number): boolean {
    const it = this.item(i);
    return !!it && it.kind !== "break" && this.sources[i] !== "missing" && !this.bypassed.has(i);
  }
  /** The playable index before `from` (songs and cortinas; missing, bypassed and skipped rows are passed over). */
  prevPlayable(from: number): number | null {
    if (!this.plan) return null;
    for (let i = Math.min(from, this.plan.items.length) - 1; i >= 0; i--)
      if (this.passes(i) && this.item(i)?.kind !== "break") return i;
    return null;
  }
  /**
   * Fix 2026-11 ("can't start on the song I want") — move the playhead to row `i` while nothing sounds (before the
   * night, stopped, paused or armed): `start` / `play` then begin there. During the night use `playNow` / `playNext`.
   * False when the row cannot play (no source, a break, bypassed tonight).
   */
  select(i: number): boolean {
    if (!this.plan || this.live || !this.canPlay(i)) return false;
    this.skipped.delete(i);
    this.forcedNext = null;
    this.pausedAt = null;
    this.holding = false;
    this.planIndex = i;
    this.transition(this.state === "idle" ? "idle" : "armed", "select");
    void this.prepare(i).catch((e) => this.markMissing(i, e));
    return true;
  }
  /** Next now: the next playable item starts at once (the night's short fade); before the night it is selected. */
  async nextNow(): Promise<void> {
    if (!this.plan) return;
    const from = this.skipTarget ?? (this.live && this.current ? this.current.planIndex : this.planIndex);
    // 2026-11: after "Play next" the picked song is the next one (once queued, the forced pointer is spent)
    const n = (this.skipTarget === null ? this.pickedNext() : null) ?? this.nextPlayable(from);
    if (n === null) return;
    if (this.live) return this.playNow(n);
    this.select(n);
  }
  /** seconds in after which Previous restarts the current item instead of going back */
  static readonly RESTART_SEC = 3;
  /**
   * Previous: more than 3 s into the item it restarts; otherwise the previous playable item (missing and bypassed
   * rows passed over) plays now, or, before the night, is selected.
   */
  async previous(): Promise<void> {
    if (!this.plan) return;
    if (this.skipTarget !== null && this.live) {
      // a skip is on its way (Connect): one back from where it goes
      const p = this.prevPlayable(this.skipTarget);
      return this.playNow(p ?? this.skipTarget);
    }
    const cur = this.live && this.current ? this.current.planIndex : this.planIndex;
    if ((this.live || this.paused) && this.position() > BoothEngine.RESTART_SEC) {
      if (this.live && this.instantSwitch(cur)) return this.queueSwitch(cur, true);
      if (this.live) return this.playNow(cur);
      if (this.pausedAt) this.pausedAt = { ...this.pausedAt, at: 0 };
      this.transition(this.state, "restart");
      return;
    }
    const p = this.prevPlayable(cur);
    if (p === null) {
      if (this.live) return this.playNow(cur);
      return;
    }
    if (this.live) return this.playNow(p);
    this.select(p);
  }
  /**
   * Seek inside the current item to `sec` seconds (as it plays: from its cue, within its cap). The item is rebuilt
   * from there — files and clips at the new offset, Spotify with the new position — so its end fade, the gap and the
   * next item's schedule follow the new end. Paused: Resume starts from `sec`.
   */
  async seek(sec: number): Promise<void> {
    if (!this.plan) return;
    if (this.skipTarget !== null) return;
    if (!this.live) {
      if (this.pausedAt) {
        const len = Math.max(0, this.pausedAt.runtime.endsAt - this.pausedAt.runtime.startedAt);
        this.pausedAt = { ...this.pausedAt, at: clamp(sec, 0, Math.max(0, len - 0.5)) };
        this.transition(this.state, "seek");
      }
      return;
    }
    const c = this.current;
    if (!c || c.kind === "break" || c.cancelled) return;
    const len = Math.max(0, c.endsAt - c.startedAt);
    const to = clamp(sec, 0, Math.max(0, len - 0.5));
    const now = this.ctx.currentTime;
    // 2026-11 (the owner: "the slider goes to zero for a second, then the song plays late"): an external player that
    // can seek in place (the SDK's seek, Connect's PUT /me/player/seek) jumps there — no new play, no Starting…
    if (c.external?.seek && c.started) {
      const pos = (c.extStart ?? 0) + to;
      const rest = len - to;
      if (c.external.seek(pos, { durationSec: c.extTimed ? rest : undefined })) {
        this.cancelQueued();
        c.startedAt = now - to;
        c.endsAt = now + rest;
        c.interrupted = true;
        this.transition(this.state, "seek");
        await this.scheduleNext();
        return;
      }
    }
    // the clock reads the target from here on: while the item is rebuilt and until its new clock gets there
    this.seekHold = { planIndex: c.planIndex, at: to };
    // 2026-11: Connect plays the new position with one play (no pause first: it would be a gap)
    const instant = !!c.external && !this.externalFor(c.planIndex)?.capabilities.fade;
    this.cancelQueued();
    c.cancelled = true;
    c.interrupted = true;
    this.silenceTails(now, DECLICK_OUT);
    if (c.external) c.external.cancel(instant);
    else if (c.when > now) {
      c.node?.stop(now);
      c.node?.disconnect();
    } else {
      this.fadeNodes(c, now, SEEK_FADE);
      c.node?.stop(now + SEEK_FADE);
    }
    this.current = null;
    const i = c.planIndex;
    // Spotify: its pause of the old play goes out first, then the new play at the new position
    const delay = instant ? 0 : c.external ? SEEK_EXTERNAL_DELAY : SEEK_FADE;
    if (c.external) this.setStarting(true);
    const gen = ++this.generation;
    const s = await this.schedule(i, now + delay, { from: to, fadeIn: SEEK_FADE, headCut: c.headCut });
    if (this.seekHold?.at === to) this.seekHold = null;
    // a Stop, Pause, Play now or another seek came in while the item was rebuilt
    if (gen !== this.generation || !this.live || this.current) {
      if (s) {
        s.cancelled = true;
        s.external?.cancel();
        s.node?.stop(this.ctx.currentTime);
        s.node?.disconnect();
      }
      return;
    }
    if (!s) {
      this.setStarting(false);
      this.transition("paused", "seek failed");
      return;
    }
    s.interrupted = true;
    s.seekFloor = to;
    this.current = s;
    this.planIndex = i;
    this.transition(this.state, "seek");
    await this.scheduleNext();
  }

  /* ---------- 2026-11: Spotify Connect — instant, coalesced skips ---------- */

  /** presses closer than this make one skip (the latest target wins, one play request) */
  static SKIP_COALESCE_MS = 250;
  /** where a coalesced skip goes (null: none pending) */
  skipTarget: number | null = null;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  /** the pending skip restarts the running song (Previous past 3 s); otherwise landing on it is "never mind" */
  private skipRestart = false;
  /** an external item was asked to start and its device has not confirmed it ("Starting…") */
  starting = false;
  /** 2026-11: a seek in flight: the item and the seconds the clock reads until the rebuilt item runs */
  private seekHold: { planIndex: number; at: number } | null = null;

  private externalFor(i: number) {
    return this.adapterFor(i)?.external ?? null;
  }
  /**
   * The running item plays on a device that switches tracks itself and cannot fade (Spotify Connect), and so does
   * the target: a skip is one play request — no pause, no fade, no wait.
   */
  private instantSwitch(target: number): boolean {
    const c = this.current;
    if (!c?.external || c.kind === "break") return false;
    const a = this.externalFor(c.planIndex);
    return !!a && !a.capabilities.fade && this.sources[target] === this.sources[c.planIndex];
  }
  setStarting(on: boolean) {
    if (this.starting === on) return;
    this.starting = on;
    this.onEvent({ type: "starting", on });
  }
  private clearSkip() {
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
    this.skipTarget = null;
  }
  /** the playhead shows the target at once; the play goes out once the presses stop (~250 ms) */
  private queueSwitch(i: number, restart = false) {
    this.skipTarget = i;
    this.skipRestart = restart;
    this.planIndex = i;
    this.forcedNext = null;
    this.pausedAt = null;
    this.skipped.delete(i);
    this.cancelQueued();
    this.setStarting(true);
    this.transition(this.state, "skip");
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = setTimeout(() => void this.switchNow(), BoothEngine.SKIP_COALESCE_MS);
  }
  /** the coalesced skip: the running item hands the device over (no pause) and the target plays now */
  private async switchNow(): Promise<void> {
    this.skipTimer = null;
    const i = this.skipTarget;
    this.skipTarget = null;
    if (i === null || !this.live) return;
    const c = this.current;
    if (c && i === c.planIndex && !this.skipRestart && !c.cancelled) {
      // Next then Previous: back where the room is — nothing to send, the song plays on
      this.planIndex = i;
      this.setStarting(false);
      this.transition(this.state, "skip cancelled");
      await this.scheduleNext();
      return;
    }
    const gen = ++this.generation;
    this.cancelQueued();
    if (c) {
      c.cancelled = true;
      c.interrupted = true;
      if (c.external) c.external.cancel(true);
      else {
        const now = this.ctx.currentTime;
        this.fadeNodes(c, now, SEEK_FADE);
        c.node?.stop(now + SEEK_FADE);
      }
    }
    this.current = null;
    this.planIndex = i;
    const s = await this.schedule(i, this.ctx.currentTime);
    if (gen !== this.generation || !this.live || this.current) {
      if (s) {
        s.cancelled = true;
        s.external?.cancel();
      }
      return;
    }
    if (!s) {
      this.setStarting(false);
      this.transition("paused", "skip failed");
      return;
    }
    s.interrupted = true;
    this.current = s;
    this.anchors.push({ planIndex: i, at: new Date(this.wall()).toISOString() });
    this.transition(s.kind === "cortina" ? "cortina" : "playing", "skip");
    this.onEvent({ type: "item", planIndex: i });
    await this.scheduleNext();
  }

  /**
   * 2026-11 (a reload while Spotify kept playing on Connect): the item at `i` already plays on the device at
   * `trackSec` seconds into the recording — the night takes its timeline back without a play request.
   */
  async attach(i: number, trackSec: number): Promise<boolean> {
    if (!this.plan?.items[i] || this.sources[i] !== "spotify") return false;
    this.clearSkip();
    this.pausedAt = null;
    this.planIndex = i;
    this.skipped.delete(i);
    const s = await this.schedule(i, this.ctx.currentTime, { attachAt: trackSec });
    if (!s) return false;
    this.current = s;
    this.anchors.push({ planIndex: i, at: new Date(this.wall()).toISOString() });
    this.transition(s.kind === "cortina" ? "cortina" : "playing", "re-attached");
    this.onEvent({ type: "item", planIndex: i });
    await this.scheduleNext();
    return true;
  }

  /* ---------- transitions ---------- */

  private transition(to: BoothState, reason?: string) {
    const from = this.state;
    if (from === to && !reason) return;
    this.state = to;
    const entry: BoothLogEntry = {
      at: new Date(this.wall()).toISOString(),
      from,
      to,
      planIndex: this.planIndex,
      reason,
    };
    this.log.push(entry);
    this.onEvent({ type: "state", from, to, planIndex: this.planIndex, reason });
  }
  private banner(text: string, key?: string, action?: { label: string; run: () => void }) {
    this.onEvent({ type: "banner", text, key, action });
  }

  /* ---------- public API ---------- */

  /** idle/stopped → armed: decode the item at the playhead (a user gesture resumes the context first). */
  async start(): Promise<void> {
    if (!this.plan) throw new Error("No plan loaded");
    await this.ctx.resume().catch(() => {});
    if (!this.startedWall) this.startedWall = this.wall();
    if (this.state !== "idle" && this.state !== "stopped") return;
    if (!this.passes(this.planIndex) || this.item()?.kind === "break") {
      const n = this.nextPlayable(this.planIndex);
      if (n === null) return this.finish();
      this.planIndex = n;
    }
    this.transition("armed", "start");
    try {
      await this.prepare(this.planIndex);
    } catch (e) {
      this.markMissing(this.planIndex, e);
      const n = this.nextPlayable(this.planIndex);
      if (n === null) return this.finish();
      this.planIndex = n;
      await this.prepare(this.planIndex).catch((e2) => this.markMissing(this.planIndex, e2));
    }
  }

  /** armed/paused/stopped → playing | cortina: the item at the playhead starts at now + 0.05 (or `delay`). */
  async play(delaySec = START_AHEAD): Promise<void> {
    if (!this.plan) return;
    if (this.state === "idle") await this.start();
    if (this.state === "playing" || this.state === "cortina") {
      // a hold that has not happened yet: lift it
      if (this.holding) {
        this.holding = false;
        this.breakUntil = null;
        if (!this.queued) await this.scheduleNext();
        this.transition(this.state, "hold lifted");
      }
      return;
    }
    if (this.state === "stopped") {
      this.transition("armed", "restart");
    }
    if (this.item()?.kind === "break") {
      // the break is over (or cut short): the playhead moves to what follows it
      const n = this.nextPlayable(this.planIndex);
      if (n === null) return this.finish();
      this.planIndex = n;
    }
    this.holding = false;
    this.breakUntil = null;
    if (this.holdBefore === this.planIndex) this.holdBefore = null;
    let i = this.planIndex;
    const resume = this.pausedAt?.planIndex === i ? this.pausedAt : null;
    this.pausedAt = null;
    let s = await this.schedule(
      i,
      this.ctx.currentTime + delaySec,
      resume
        ? { from: resume.at, fadeIn: this.settings.pauseFadeSec, headCut: resume.runtime.headCut }
        : undefined,
    );
    // 2026-11 (QA: one undecodable file matched to two sides in a row — the banner said "the night moves on", the
    // Booth stayed armed in silence): an item passed over (`markMissing`) hands the start to the next playable one
    while (!s && this.skipped.has(i) && this.state === "armed") {
      const n = this.nextPlayable(i);
      if (n === null) return this.finish();
      this.planIndex = i = n;
      s = await this.schedule(i, this.ctx.currentTime + delaySec);
    }
    if (!s) return;
    this.current = s;
    if (!resume) this.anchors.push({ planIndex: i, at: new Date(this.wall()).toISOString() });
    this.transition(s.kind === "cortina" ? "cortina" : "playing", resume ? "resume" : "play");
    this.onEvent({ type: "item", planIndex: i });
    await this.scheduleNext();
  }

  /** Finish the current item, do not start the next (never a cut). */
  hold(): void {
    if (this.state === "armed") {
      this.holding = false;
      this.transition("paused", "hold");
      return;
    }
    if (this.state !== "playing" && this.state !== "cortina") return;
    this.holding = true;
    this.cancelQueued();
    this.transition(this.state, "hold");
  }

  /**
   * "Skip the next song" (the transport's old "Next at gap"): the running song plays to its end, the queued item is
   * left out and what follows it plays at the gap; the left-out index (for Undo), null when nothing changed. From
   * `stopped` / `paused` / `armed`: the playhead moves to the next item (null: the room is not affected).
   */
  next(): number | null {
    if (!this.plan) return null;
    if (this.state === "stopped" || this.state === "paused" || this.state === "armed") {
      const n = this.nextPlayable(this.planIndex);
      if (n === null) return null;
      this.pausedAt = null;
      this.planIndex = n;
      this.transition("armed", "next");
      void this.prepare(n).catch((e) => this.markMissing(n, e));
      return null;
    }
    const n = this.nextPlayable(this.current?.planIndex ?? this.planIndex);
    if (n === null) return null;
    this.skipped.add(n);
    if (this.forcedNext === n) this.forcedNext = null;
    this.cancelQueued();
    this.transition(this.state, "next at gap");
    void this.scheduleNext();
    return n;
  }
  /** Undo of "Skip the next song": item `i` plays again where it was (if it has not been passed yet). */
  unskip(i: number): void {
    if (!this.skipped.has(i) || i <= (this.current?.planIndex ?? this.planIndex)) return;
    this.skipped.delete(i);
    if (this.live && this.queued && this.queued.planIndex > i) {
      if (!this.queued.started || this.queued.when > this.ctx.currentTime + 0.05) {
        this.cancelQueued();
        void this.scheduleNext();
      }
    }
    this.transition(this.state, "undo skip");
  }

  /**
   * 2026-11 (the owner: "every Booth action should have a Cmd+Z"): what the DJ decided about what comes next — the
   * left-out items, the hold, the hold before a tanda, the break, the forced next item, the birthday marks — so the
   * Booth's undo history (lib/booth/undo.ts) can put them back. Additive: nothing else reads it.
   */
  marks(): BoothMarks {
    return {
      skipped: [...this.skipped].sort((a, b) => a - b),
      holdBefore: this.holdBefore,
      holding: this.holding,
      breakUntil: this.breakUntil,
      forcedNext: this.forcedNext,
      birthday: (this.plan?.items ?? []).flatMap((it, i) => (it.birthday ? [i] : [])),
    };
  }
  /**
   * Puts `m` back for what has not played yet: an item already reached keeps what happened to it (it was heard, or
   * left out, in the room). The queued next item is re-chosen when it has not started.
   */
  restoreMarks(m: BoothMarks): void {
    const here = this.current?.planIndex ?? this.planIndex;
    const ahead = (i: number) => i > here;
    for (const i of [...this.skipped]) if (ahead(i)) this.skipped.delete(i);
    for (const i of m.skipped) if (ahead(i)) this.skipped.add(i);
    this.holdBefore = m.holdBefore !== null && ahead(m.holdBefore) ? m.holdBefore : null;
    this.holding = m.holding;
    this.breakUntil = m.breakUntil;
    this.forcedNext = m.forcedNext !== null && ahead(m.forcedNext) ? m.forcedNext : null;
    this.plan?.items.forEach((it, i) => {
      if (!ahead(i)) return;
      if (m.birthday.includes(i)) it.birthday = true;
      else delete it.birthday;
    });
    if (this.live && this.queued && (!this.queued.started || this.queued.when > this.ctx.currentTime + 0.05))
      this.cancelQueued();
    if (this.live) void this.scheduleNext();
    this.transition(this.state, "undo");
  }

  /**
   * Stop: everything fades to silence in `fadeSec` (1 s by default; the strip's confirm offers "Fade out and stop",
   * `settings.stopFadeSec`, and "Stop now", 0.1 s); the position is kept so `play` restarts the same item.
   */
  stop(reason = "stop", fadeSec = EMERGENCY_FADE): void {
    if (this.state === "idle") return;
    this.clearSkip();
    this.setStarting(false);
    const now = this.ctx.currentTime;
    const fade = Math.max(STOP_NOW_SEC / 2, fadeSec);
    for (const s of [this.current, this.queued]) {
      if (!s) continue;
      s.cancelled = true;
      if (s.external) {
        s.started ? s.external.stop(fade) : s.external.cancel();
        continue;
      }
      if (s.when > now) {
        // not audible yet: dropped without a fade
        s.node?.stop(now);
        s.node?.disconnect();
        continue;
      }
      this.fadeNodes(s, now, fade);
      s.node?.stop(now + fade);
      const node = s.node;
      if (node) node.onended = () => node.disconnect();
    }
    this.silenceTails(now, fade);
    this.current = null;
    this.queued = null;
    this.holding = false;
    this.breakUntil = null;
    this.pausedAt = null;
    this.transition("stopped", reason);
  }

  /**
   * Pause (round 20): the running item fades out over `fadeSec` and waits where it was; `play` resumes it from
   * there with the same fade in. Unlike a hold it acts now; the queued item is dropped.
   */
  pause(fadeSec = this.settings.pauseFadeSec): void {
    if (this.state === "armed") {
      this.hold();
      return;
    }
    if (this.state !== "playing" && this.state !== "cortina") return;
    const c = this.current;
    if (!c || c.kind === "break") return;
    this.clearSkip();
    this.setStarting(false);
    const now = this.ctx.currentTime;
    const len = Math.max(0, c.endsAt - c.startedAt);
    const at = c.external
      ? Math.max(0, c.external.position() - (c.extStart ?? 0))
      : Math.max(0, now - c.startedAt);
    c.interrupted = true;
    this.cancelQueued();
    c.cancelled = true;
    const fade = Math.max(0, fadeSec);
    this.silenceTails(now, Math.max(DECLICK_OUT, fade));
    if (c.external) c.external.stop(fade);
    else if (c.when > now) {
      c.node?.stop(now);
      c.node?.disconnect();
    } else {
      for (const g of [c.gain]) {
        if (!g) continue;
        this.cancelAutomation(g.gain, now);
        // from wherever the envelope is (mid fade-in or fade-out too): an exponential approach, no jump
        g.gain.setTargetAtTime(0, now, Math.max(0.005, fade / 6));
        g.gain.setValueAtTime(0, now + Math.max(DECLICK_OUT, fade));
      }
      c.node?.stop(now + Math.max(DECLICK_OUT, fade));
    }
    this.current = null;
    this.holding = false;
    const runtime: BoothItemRuntime = {
      planIndex: c.planIndex,
      startedAt: c.startedAt,
      endsAt: c.endsAt,
      source: c.source,
      gainDb: c.gainDb,
      peakCapped: c.peakCapped,
      gainFrom: c.gainFrom,
      started: c.started,
      headCut: c.headCut,
      srcStart: c.srcStart,
    };
    this.pausedAt = { planIndex: c.planIndex, at: Math.min(at, Math.max(0, len - 0.5)), runtime };
    this.planIndex = c.planIndex;
    this.transition("paused", "pause");
  }

  /**
   * 2026-11 (the owner: "Fade and Crossfade can't be reversed"): the fade or crossfade running now — the button
   * says "Cancel fade · 3 s" and `cancelFade` takes it back while it runs.
   */
  fading: {
    kind: "fade" | "crossfade";
    /** ctx time the fade is through */
    until: number;
    out: Scheduled;
    /** where the outgoing would have ended on its own */
    origEnd: number;
    wasInterrupted: boolean;
    incoming?: Scheduled;
  } | null = null;

  /** Fade out now (round 20): the running item fades over `sec` and ends; the next item follows at the gap. */
  fadeOutNow(sec = this.settings.fadeNowSec, kind: "fade" | "crossfade" = "fade"): void {
    if (this.state !== "playing" && this.state !== "cortina") return;
    const c = this.current;
    if (!c || c.kind === "break" || c.cancelled) return;
    const now = this.ctx.currentTime;
    if (c.when > now) return;
    const fade = Math.max(DECLICK_OUT, sec);
    if (now + fade >= c.endsAt) return; // it ends sooner on its own
    this.fading = { kind, until: now + fade, out: c, origEnd: c.endsAt, wasInterrupted: !!c.interrupted };
    c.interrupted = true;
    c.endsAt = now + fade;
    if (c.external) c.external.stop(fade);
    else {
      this.fadeNodes(c, now, fade, true);
      c.node?.stop(now + fade);
    }
    this.cancelQueued();
    this.transition(this.state, "fade out now");
    void this.scheduleNext();
  }

  /**
   * Next with crossfade (round 20): the next item starts now while the running one fades out over `sec`. Spotify
   * plays one track at a time, so there it is "fade out now" (the next item follows at the gap).
   */
  async crossfadeNext(sec = this.settings.crossfadeSec): Promise<void> {
    if (this.state !== "playing" && this.state !== "cortina") return;
    const c = this.current;
    if (!c || c.cancelled) return;
    const n = this.nextPlayable(c.planIndex);
    if (n === null || this.item(n)?.kind === "break" || c.external || isExternalKind(this.sources[n]))
      return this.fadeOutNow(sec, "crossfade");
    const now = this.ctx.currentTime;
    const fade = Math.max(DECLICK_OUT, sec);
    const run = {
      kind: "crossfade" as const,
      until: now + fade,
      out: c,
      origEnd: c.endsAt,
      wasInterrupted: !!c.interrupted,
    };
    this.fading = run;
    c.interrupted = true;
    this.cancelQueued();
    this.holding = false;
    if (this.holdBefore === n) this.holdBefore = null;
    c.cancelled = true;
    if (c.when > now) {
      c.node?.stop(now);
      c.node?.disconnect();
    } else {
      this.fadeNodes(c, now, fade, true);
      c.node?.stop(now + fade);
      this.tails.add(c);
      const node = c.node;
      if (node) {
        const prev = node.onended;
        node.onended = (ev) => {
          this.tails.delete(c);
          prev?.call(node, ev);
        };
      }
    }
    this.planIndex = n;
    const s = await this.schedule(n, this.ctx.currentTime + START_AHEAD);
    if (!s) {
      this.current = null;
      this.fading = null;
      this.transition("paused", "crossfade failed");
      return;
    }
    if (this.fading === run) this.fading = { ...run, incoming: s };
    this.current = s;
    this.anchors.push({ planIndex: n, at: new Date(this.wall()).toISOString() });
    this.transition(s.kind === "cortina" ? "cortina" : "playing", "crossfade");
    this.onEvent({ type: "item", planIndex: n });
    await this.scheduleNext();
  }

  /**
   * 2026-11: take back the fade or crossfade running now (true when it did). A fade: the gain comes back and the song
   * keeps its own end (the next item at its gap again). A crossfade: the outgoing is the current item again to its own
   * end and the incoming leaves with a short fade. On Spotify in the browser a fade's volume steps are called off.
   */
  cancelFade(): boolean {
    const f = this.fading;
    this.fading = null;
    if (!f) return false;
    const now = this.ctx.currentTime;
    if (now >= f.until || (this.state !== "playing" && this.state !== "cortina")) return false;
    const c = f.out;
    const restore = () => {
      if (c.external) return c.external.unfade?.() ?? false;
      if (!c.gain) return false;
      this.cancelAutomation(c.gain.gain, now);
      c.gain.gain.setTargetAtTime(c.base, now, 0.05);
      c.node?.stop(f.origEnd);
      return true;
    };
    if (f.kind === "fade" || !f.incoming) {
      if (this.current !== c || !restore()) return false;
      c.endsAt = f.origEnd;
      c.interrupted = f.wasInterrupted;
      this.cancelQueued();
      if (c.gain && !c.external) this.endEnvelope(c, now);
      this.transition(this.state, "fade cancelled");
      void this.scheduleNext();
      return true;
    }
    const s = f.incoming;
    if (this.current !== s || !restore()) return false;
    c.cancelled = false;
    c.interrupted = f.wasInterrupted;
    c.endsAt = f.origEnd;
    this.tails.delete(c);
    this.cancelQueued();
    s.cancelled = true;
    this.fadeNodes(s, now, 0.15);
    s.node?.stop(now + 0.15);
    s.external?.stop(0.15);
    this.current = c;
    this.planIndex = c.planIndex;
    if (c.gain && !c.external) this.endEnvelope(c, now);
    this.transition(c.kind === "cortina" ? "cortina" : "playing", "crossfade cancelled");
    this.onEvent({ type: "item", planIndex: c.planIndex });
    void this.scheduleNext();
    return true;
  }
  /** an item's own end again (the night's song end fade, or the declick), after its fade was taken back */
  private endEnvelope(c: Scheduled, now: number) {
    const it = this.item(c.planIndex);
    const w = transitionWindow(null, {
      outLen: c.endsAt - c.startedAt,
      inLen: 0,
      gapSec: 0,
      songFadeOutSec: this.settings.songFadeOutSec,
      outKind: it?.kind,
      cortinaFadeOutSec: it?.fadeOutSec ?? this.settings.cortinaFadeOutSec,
    });
    applyOutgoing(c.gain!.gain, {
      endsAt: c.endsAt,
      base: c.base,
      window: w,
      curve: "equalPower",
      now,
      notBefore: now + 0.3,
    });
  }
  /**
   * 2026-11 (Undo after a fade or crossfade went through): item `i` plays again from `at` seconds in (a short fade
   * out of what plays now).
   */
  async returnTo(i: number, at: number): Promise<void> {
    if (!this.plan?.items[i] || this.item(i)?.kind === "break") return;
    this.fading = null;
    const live = this.live;
    const ext = !!this.current?.external || isExternalKind(this.sources[i]);
    if (live) this.stop("undo", 0.3);
    this.planIndex = i;
    this.pausedAt = {
      planIndex: i,
      at: Math.max(0, at),
      runtime: {
        planIndex: i,
        startedAt: 0,
        endsAt: this.itemLength(i),
        source: (this.sources[i] === "missing" ? "file" : this.sources[i]) as SourceKind,
        gainDb: 0,
        peakCapped: false,
        gainFrom: "none",
        started: false,
      },
    };
    this.transition("armed", "undo");
    await this.play(live ? 0.35 + (ext ? SEEK_EXTERNAL_DELAY : 0) : undefined);
  }

  /** Stop now, then play the next item once the fade is through. */
  async skipNow(): Promise<void> {
    if (this.state !== "playing" && this.state !== "cortina") return;
    const n = this.nextPlayable(this.skipTarget ?? this.current?.planIndex ?? this.planIndex);
    if (n !== null && this.instantSwitch(n)) return this.queueSwitch(n);
    this.stop("skip now");
    this.next();
    if ((this.state as BoothState) === "armed")
      await this.play(EMERGENCY_FADE + this.gapAfter(this.planIndex));
  }

  /** "c": the remaining tracks of the running tanda are left out; the cortina is next at the gap. */
  cueCortina(): void {
    if (!this.plan || (this.state !== "playing" && this.state !== "cortina")) return;
    const cur = this.item();
    if (cur?.kind !== "track") return;
    let i = this.planIndex + 1;
    while (
      i < this.plan.items.length &&
      this.plan.items[i]!.kind === "track" &&
      this.plan.items[i]!.tanda === cur.tanda
    ) {
      this.skipped.add(i);
      i++;
    }
    this.cancelQueued();
    this.transition(this.state, "cortina cued");
    void this.scheduleNext();
  }

  /** "b": the next tanda is a vals → mark it and hold before it; else the page offers a swap. */
  birthdayVals(): void {
    if (!this.plan) return;
    const cur = this.item();
    const first = this.plan.items.findIndex(
      (it, i) => i > this.planIndex && it.kind === "track" && it.tanda > (cur?.tanda ?? 0),
    );
    if (first < 0) {
      this.onEvent({ type: "birthday", result: "needs-swap" });
      return;
    }
    const tanda = this.plan.items[first]!.tanda;
    const items = this.plan.items.filter((it) => it.tanda === tanda && it.kind === "track");
    if (items[0]?.rhythm !== "vals") {
      this.onEvent({ type: "birthday", result: "needs-swap" });
      return;
    }
    for (const it of items) it.birthday = true;
    this.holdBefore = first;
    if (this.queued?.planIndex === first) this.cancelQueued();
    this.transition(this.state, "birthday vals");
    this.onEvent({ type: "birthday", result: "marked" });
  }

  startBreak(minutes: number): void {
    this.breakUntil = this.wall() + Math.max(1, minutes) * 60_000;
    if (this.state === "playing" || this.state === "cortina") {
      this.holding = true;
      this.cancelQueued();
      this.transition(this.state, `break ${minutes} min`);
    } else if (this.state === "armed") this.transition("paused", `break ${minutes} min`);
  }
  async endBreak(): Promise<void> {
    this.breakUntil = null;
    await this.play();
  }

  /** 0…1; reaching 0 during a cortina ends it early (the next tanda starts gapSec after the silence). */
  setCortinaFader(v: number): void {
    this.cortinaFader = clamp(v, 0, 1);
    const now = this.ctx.currentTime;
    for (const s of [this.current, this.queued])
      s?.fader?.gain.setTargetAtTime(this.cortinaFader, now, PAUSE_RAMP);
    if (
      this.cortinaFader === 0 &&
      this.state === "cortina" &&
      this.current?.started &&
      !this.current.cancelled
    ) {
      const c = this.current;
      const endsAt = now + PAUSE_RAMP * 5;
      c.interrupted = true;
      c.endsAt = endsAt;
      if (c.external) c.external.stop(0);
      else c.node?.stop(endsAt);
      this.cancelQueued();
      void this.scheduleNext();
    }
  }
  /** −30…+6 dB; 20 ms time constant (no zipper noise). */
  setMaster(db: number): void {
    this.masterDb = clamp(db, -30, 6);
    this.applyMaster();
  }
  /**
   * 2026-11 (Auto master): the boost the room meter asks for, on top of the master (never past +6 dB in all). The
   * caller limits the rate (≤ 0.5 dB/s); `tc` smooths each step on the graph. External players follow `setMaster`.
   */
  setAutoDb(db: number, tc = 0.3): void {
    const v = clamp(Number.isFinite(db) ? db : 0, 0, 6);
    if (v === this.autoDb) return;
    this.autoDb = v;
    this.applyMaster(tc);
  }
  setMuted(m: boolean): void {
    this.muted = m;
    // (an external device's own level is read again first: the DJ may have moved it there)
    this.applyMaster(PAUSE_RAMP, m);
  }
  /** Talk-over (round 20): the master dips 12 dB over 0.5 s while the DJ speaks, and comes back the same way. */
  setDucked(on: boolean): void {
    this.ducked = on;
    this.applyMaster(DUCK_SEC / 3, on);
  }
  private applyMaster(tc = PAUSE_RAMP, resync = false) {
    const g = this.outputGain();
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, tc);
    for (const a of this.adapters) a.external?.setMaster(g, resync ? { resync: true } : undefined);
  }
  /** The DJ's per-item trim: applied to the running item at once (20 ms), to the queued one at its start. */
  setTrim(id: string, db: number): void {
    this.trims[id] = clamp(db, -12, 12);
    for (const s of [this.current, this.queued]) {
      if (!s?.gain || this.item(s.planIndex)?.id !== id) continue;
      const g = gainFor(this.item(s.planIndex)!, s.measured, this.settings, this.trims[id]);
      if (s.started && s.kind !== "cortina") {
        s.gain.gain.setTargetAtTime(g.base, this.ctx.currentTime, PAUSE_RAMP);
        s.base = g.base;
        s.gainDb = g.gainDb;
        s.peakCapped = g.peakCapped;
      }
    }
  }
  setSettings(s: Partial<BoothSettings>): void {
    const gapChanged = s.gapSec !== undefined && s.gapSec !== this.settings.gapSec;
    this.settings = { ...this.settings, ...s };
    if (gapChanged && this.queued && !this.queued.started && this.current) {
      this.cancelQueued();
      void this.scheduleNext();
    }
    this.applyMaster();
  }

  /** −20 dBFS 440 Hz for 0.5 s through the master: the room before the first tanda. */
  testTone(): void {
    if (!this.ctx.createOscillator) return;
    const now = this.ctx.currentTime + 0.02;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(440, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(dbToGain(-20), now + DECLICK_IN);
    g.gain.setValueAtTime(dbToGain(-20), now + 0.5 - DECLICK_OUT);
    g.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.5);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /* ---------- clock ---------- */

  /** seconds into the current item, latency-compensated; 0 before it starts */
  position(): number {
    // a Connect skip on its way: the new song starts from its beginning
    if (this.skipTarget !== null) return 0;
    const c = this.current;
    if (!c) {
      // 2026-11: a seek is rebuilding the item: the clock already reads where the DJ let go
      if (this.live && this.seekHold?.planIndex === this.planIndex) return this.seekHold.at;
      return this.pausedAt?.planIndex === this.planIndex ? this.pausedAt.at : 0;
    }
    let p: number;
    // Spotify reports the track position: the item's own clock starts at its cue (extStart)
    if (c.external) p = c.started ? Math.max(0, c.external.position() - (c.extStart ?? 0)) : 0;
    else {
      const latency = Math.max(this.ctx.outputLatency ?? 0, this.outputLatencySec);
      p = Math.max(0, this.ctx.currentTime - c.startedAt - latency);
    }
    // 2026-11: after a seek the clock never goes back (the new play's report, the fade-in's few ms, the latency)
    if (c.seekFloor !== undefined) {
      if (p >= c.seekFloor) c.seekFloor = undefined;
      else return c.seekFloor;
    }
    return p;
  }
  /**
   * 2026-11: the second in the current item's recording that is playing (its cue in and head cut plus the position):
   * "Song ends early" stores it as the side's stop. Null when nothing plays.
   */
  sourcePosition(): number | null {
    const c = this.current ?? (this.pausedAt?.planIndex === this.planIndex ? this.pausedAt.runtime : null);
    if (!c) return null;
    return Math.round(((c.srcStart ?? 0) + this.position()) * 1000) / 1000;
  }
  /** the current item's length as it will actually play (rehearsal cap, early fader) */
  currentLength(): number {
    if (this.skipTarget !== null) return this.itemLength(this.skipTarget);
    const c = this.current ?? (this.pausedAt?.planIndex === this.planIndex ? this.pausedAt.runtime : null);
    return c ? Math.max(0, c.endsAt - c.startedAt) : this.itemLength(this.planIndex);
  }
  /** 30 s when the whole night is a rehearsal or this item plays from a preview */
  capFor(i: number): number | null {
    if (this.rehearsalSec) return this.rehearsalSec;
    return this.sources[i] === "preview" ? PREVIEW_CAP_SEC : null;
  }
  itemLength(i: number): number {
    const it = this.item(i);
    if (!it) return 0;
    if (it.kind === "break") return it.lengthSec;
    const cap = this.capFor(i);
    return cap ? Math.min(cap, it.lengthSec) : it.lengthSec;
  }
  remaining(): { remainingSec: number; timeToCumparsita: number } {
    if (!this.plan) return { remainingSec: 0, timeToCumparsita: 0 };
    const pos = this.position();
    return remainingFrom(this.plan, this.planIndex, pos, {
      // a tanda skipped tonight (and its cortina) leaves the night's time too (wave 2)
      skipped: this.bypassed.size ? new Set([...this.skipped, ...this.bypassed]) : this.skipped,
      currentLength: this.current || this.pausedAt ? this.currentLength() : undefined,
      capFor: (i) => this.capFor(i),
    });
  }
  /** seconds late (+) or early (−) against the plan */
  drift(): number {
    if (!this.plan || !this.startedWall || this.state === "idle") return 0;
    const it = this.item();
    if (!it) return 0;
    const elapsed = (this.wall() - this.startedWall) / 1000;
    return elapsed - (it.startSec + this.position());
  }
  /** 30 fps meter: RMS (300 ms integration) and a 1.5 s peak hold, dBFS. */
  meter(): { rms: number; peak: number } {
    const n = this.analyser.fftSize;
    if (!this.meterBuf || this.meterBuf.length !== n) this.meterBuf = new Float32Array(n);
    const b = this.meterBuf;
    this.analyser.getFloatTimeDomainData(b);
    let sq = 0;
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const v = b[i]!;
      sq += v * v;
      pk = Math.max(pk, Math.abs(v));
    }
    const frame = sq / n;
    // 300 ms integration at ~30 fps
    this.rmsSq = this.rmsSq * 0.89 + frame * 0.11;
    const now = this.wall();
    if (pk >= this.peakHold.v || now - this.peakHold.at > 1500) this.peakHold = { v: pk, at: now };
    const db = (x: number) => (x > 0 ? 10 * Math.log10(x) : -100);
    return { rms: db(this.rmsSq), peak: this.peakHold.v > 0 ? 20 * Math.log10(this.peakHold.v) : -100 };
  }

  /** The night's record for persistence and History. */
  snapshot() {
    return {
      planIndex: this.planIndex,
      state: this.state,
      startedAt: this.startedWall,
      settings: { ...this.settings },
      trims: { ...this.trims },
      master: this.masterDb,
      cortinaFader: this.cortinaFader,
      log: [...this.log],
      anchors: [...this.anchors],
    };
  }
  /** Resume after a reload: the playhead and the log come back, the audio starts from `play`. */
  restore(r: {
    planIndex: number;
    log?: BoothLogEntry[];
    anchors?: Array<{ planIndex: number; at: string }>;
    trims?: Record<string, number>;
    startedAt?: number;
  }) {
    this.planIndex = Math.max(0, Math.min((this.plan?.items.length ?? 1) - 1, r.planIndex));
    this.log = r.log ? [...r.log] : [];
    this.anchors = r.anchors ? [...r.anchors] : [];
    this.trims = r.trims ? { ...r.trims } : {};
    this.startedWall = r.startedAt ?? 0;
  }

  dispose(): void {
    this.generation++;
    this.clearSkip();
    for (const s of [this.current, this.queued]) {
      s?.external?.cancel();
      s?.node?.stop();
      s?.node?.disconnect();
    }
    this.current = null;
    this.queued = null;
  }

  /* ---------- scheduler ---------- */

  gapAfter(i: number): number {
    const it = this.item(i);
    if (!it) return 0;
    if (it.kind === "break" || i === (this.plan?.items.length ?? 0) - 1) return 0;
    return this.plan?.gapOverrides?.[it.tanda] ?? this.settings.gapSec;
  }

  /* ---------- 2026-11: a side's own silence and the gap ---------- */

  /** Settings → Booth → Gaps: the plan's silence mode ("off" for a plan made before it existed). */
  silenceMode(): SilenceMode {
    return this.plan?.settings.silenceMode ?? "off";
  }
  /**
   * A song's silent head / tail as it will play: what the decoded audio measured (a file, a clip), else the plan's
   * (Spotify: a measurement of the same recording, a table, the opt-in estimate). A cue in drops the head and a stop
   * drops the tail (the DJ placed them on the music); a cortina or a break has none.
   */
  silenceOf(i: number, prepared?: PreparedItem): { head: number; tail: number } {
    const it = this.item(i);
    if (!it || (it.kind !== "track" && it.kind !== "closing")) return { head: 0, tail: 0 };
    const m = prepared && !isExternalKind(prepared.kind) ? prepared.measured : undefined;
    const known =
      m && (m.headSilenceSec !== undefined || m.tailSilenceSec !== undefined)
        ? { head: m.headSilenceSec ?? 0, tail: m.tailSilenceSec ?? 0 }
        : this.silenceKnown.get(i);
    const s = known ?? { head: it.headSilenceSec ?? 0, tail: it.tailSilenceSec ?? 0 };
    const cueIn = !!it.cued && (it.trimInSec ?? 0) > 0;
    const cueOut = !!it.cued && it.stopSec !== undefined;
    return {
      head: cueIn ? 0 : clamp(s.head, 0, SILENCE_MAX_SEC),
      tail: cueOut ? 0 : clamp(s.tail, 0, SILENCE_MAX_SEC),
    };
  }
  /** The transition the engine will really run from `i` into `n` (Spotify cannot overlap: none there). */
  private effectiveTransition(i: number, n: number, external = false): PlannedTransition | null {
    const tr = this.transitionAfter(i, n);
    if (
      tr &&
      tr.overlapSec > 0 &&
      (external || isExternalKind(this.sources[i]) || isExternalKind(this.sources[n]))
    )
      return null;
    return tr;
  }
  /** A join that runs from the audible moments: a fade, a blend or a rise, or the night's song end fade. */
  private fadedJoin(i: number, tr: PlannedTransition | null): boolean {
    if (tr) return tr.overlapSec > 0 || tr.fadeOutSec > 0 || tr.fadeInSec > 0;
    const k = this.item(i)?.kind;
    return k !== "cortina" && k !== "break" && this.settings.songFadeOutSec > 0;
  }
  /** The silence mode of the join from `i` into `n`: the transition's own (a template's), else the night's. */
  private joinMode(i: number, n: number): SilenceMode {
    return this.transitionAfter(i, n)?.silence ?? this.silenceMode();
  }
  /** Seconds of item `i`'s silent tail to cut, given what follows it (decided when `i` is scheduled). */
  private tailCutFor(i: number, tail: number): number {
    if (tail <= 0) return 0;
    const n = this.nextPlayable(i);
    if (n === null) return silenceJoin(this.silenceMode(), { gapSec: 0, tailSec: tail }).tailCutSec;
    const tr = this.effectiveTransition(i, n);
    // 2026-11 (templates): the transition's own silence mode for this join
    return silenceJoin(this.joinMode(i, n), {
      gapSec: tr ? tr.gapSec : this.gapAfter(i),
      tailSec: tail,
      headSec: this.silenceOf(n).head,
      faded: this.fadedJoin(i, tr),
    }).tailCutSec;
  }
  /** Seconds of a side's silent head to skip when it starts with nothing before it (Play, Play now, a jump). */
  private headCutAlone(head: number): number {
    return silenceJoin(this.silenceMode(), { gapSec: 0, headSec: head }).headCutSec;
  }

  private prepare(i: number): Promise<PreparedItem> {
    const hit = this.prepared.get(i);
    if (hit) return hit;
    const it = this.item(i);
    const a = this.adapterFor(i);
    if (!it) return Promise.reject(new Error("No such item"));
    if (it.kind === "break") return Promise.resolve({ kind: "file", durationSec: it.lengthSec });
    if (!a) return Promise.reject(new Error("No source"));
    this.onEvent({ type: "decoding", planIndex: i, busy: true });
    const p = a
      .prepare(it, this.entities[i] ?? null)
      .finally(() => this.onEvent({ type: "decoding", planIndex: i, busy: false }));
    this.prepared.set(i, p);
    p.then(
      (r) => {
        const m = !isExternalKind(r.kind) ? r.measured : undefined;
        if (m && (m.headSilenceSec !== undefined || m.tailSilenceSec !== undefined))
          this.silenceKnown.set(i, { head: m.headSilenceSec ?? 0, tail: m.tailSilenceSec ?? 0 });
      },
      () => this.prepared.delete(i),
    );
    return p;
  }
  private markMissing(i: number, e: unknown) {
    this.skipped.add(i);
    const it = this.item(i);
    // plain words (wave 2: "La Cumparsita: No source (skipped)" said nothing a DJ could act on)
    const why =
      this.whyMissing(i) ??
      (e instanceof Error && e.message && !/^no source$/i.test(e.message)
        ? e.message
        : tx("booth.engine.there_is_no_file_spotify_recording"));
    this.banner(
      tx("booth.engine.is_passed_over_the_night_moves", { p1: it?.title ?? tx("booth.engine.an_item"), why }),
      `missing-${i}`,
    );
  }
  private release(before: number) {
    for (const [i, p] of this.prepared) {
      if (i >= before) continue;
      this.prepared.delete(i);
      const it = this.item(i);
      if (it?.id) this.adapterFor(i)?.release(it.id);
      void p.catch(() => {});
    }
  }

  private cancelAutomation(p: AudioParamLike, t: number) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else p.cancelScheduledValues(t);
  }
  /** Fade the outgoing items of a crossfade out within `sec` (never later than they would have ended). */
  private silenceTails(now: number, sec: number) {
    for (const t of this.tails) {
      this.fadeNodes(t, now, sec);
      t.node?.stop(now + sec);
    }
    this.tails.clear();
  }
  /**
   * The −60 dB log fade from `now` over `sec` on an item's gain (and the cortina fader unless `itemOnly`). A curve
   * that would overlap an automation still running (a browser without `cancelAndHoldAtTime`) throws: then an
   * exponential approach to 0 does the same job.
   */
  private fadeNodes(s: Scheduled, now: number, sec: number, itemOnly = false) {
    for (const g of itemOnly ? [s.gain] : [s.gain, s.fader]) {
      if (!g) continue;
      this.cancelAutomation(g.gain, now);
      try {
        g.gain.setValueCurveAtTime(fadeOutCurve(64, g === s.fader ? this.cortinaFader : s.base), now, sec);
      } catch {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setTargetAtTime(0, now, sec / 6);
        } catch {}
      }
    }
  }

  private cancelQueued() {
    const q = this.queued;
    if (!q) return;
    this.queued = null;
    q.cancelled = true;
    // wave 4: the transition into it no longer happens: the running item gets its own end back
    if (this.current) this.restoreTail(this.current);
    const now = this.ctx.currentTime;
    if (q.external) q.external.cancel();
    else if (q.when < now && q.gain) {
      // already sounding (an overlap): a short fade, never a click
      this.fadeNodes(q, now, 0.05);
      q.node?.stop(now + 0.05);
    } else {
      q.node?.stop(now);
      q.node?.disconnect();
      q.gain?.disconnect();
      q.fader?.disconnect();
    }
  }

  /**
   * Wave 4 — the DJ's edited transition from item `i` into `n`: only between plan neighbours (a skip or "play next"
   * in between makes it the night's gap again).
   */
  transitionAfter(i: number, n: number): PlannedTransition | null {
    if (n !== i + 1) return null;
    return this.item(i)?.transitionAfter ?? null;
  }
  private windowFor(c: Scheduled, n: number, tr: PlannedTransition | null): TransitionWindow {
    const it = this.item(c.planIndex);
    return transitionWindow(tr, {
      outLen: Math.max(0, (c.tail?.end ?? c.endsAt) - c.startedAt),
      inLen: this.itemLength(n),
      gapSec: this.gapAfter(c.planIndex),
      songFadeOutSec: this.settings.songFadeOutSec,
      outKind: it?.kind,
      cortinaFadeOutSec: it?.fadeOutSec ?? this.settings.cortinaFadeOutSec,
    });
  }
  /** Rewrite the running item's tail for the transition into the queued one (its fade, an early stop, its EQ). */
  private applyTail(c: Scheduled, w: TransitionWindow) {
    if (c.external && !c.interrupted && !c.cancelled) {
      // 2026-11: Spotify in this browser fades with volume steps: the transition's fade out ends the item (a device
      // that cannot fade — Connect — keeps its plain end; the editor says so)
      const a = this.externalFor(c.planIndex);
      if (!a?.capabilities.fade || !c.external.retime || w.outFade.len <= 0) return;
      const end = c.tail?.end ?? c.endsAt;
      c.tail = { end };
      c.extRetimed = true;
      c.external.retime({ endsInSec: Math.max(0, end - this.ctx.currentTime), fadeOutSec: w.outFade.len });
      return;
    }
    if (!c.gain || c.external || c.interrupted || c.cancelled) return;
    const end = c.tail?.end ?? c.endsAt;
    const now = this.ctx.currentTime;
    const it = this.item(c.planIndex);
    const lead = it?.kind === "cortina" ? (it.fadeInSec ?? 0) : 0;
    applyOutgoing(c.gain.gain, {
      endsAt: end,
      base: c.base,
      window: w,
      curve: w.curveOut,
      now,
      notBefore: c.when + Math.max(DECLICK_IN, lead) + 0.01,
    });
    c.tail = { end };
    if (w.outStop < 0) {
      c.endsAt = end + w.outStop;
      c.node?.stop(c.endsAt);
    }
    const eq = eqLanes(w);
    if (eq && c.eqLow && c.eqHigh) {
      applyEqPoints(c.eqLow.gain, eq.out.low, end, now);
      applyEqPoints(c.eqHigh.gain, eq.out.high, end, now);
      if (c.eqMid) applyEqPoints(c.eqMid.gain, eq.out.mid, end, now);
    }
  }
  /** Give an item whose transition was cancelled its own end back (the night's fade, its natural stop, a flat EQ). */
  private restoreTail(c: Scheduled) {
    if (c.external && c.extRetimed && c.tail && !c.cancelled) {
      const end = c.tail.end;
      c.tail = undefined;
      c.extRetimed = false;
      c.external.retime?.({
        endsInSec: Math.max(0, end - this.ctx.currentTime),
        fadeOutSec: c.extFadeOut ?? 0,
      });
      return;
    }
    const end = c.tail?.end;
    if (end === undefined || c.interrupted || c.cancelled || !c.gain) return;
    c.tail = undefined;
    const now = this.ctx.currentTime;
    const it = this.item(c.planIndex);
    const w = transitionWindow(null, {
      outLen: end - c.startedAt,
      inLen: 0,
      gapSec: 0,
      songFadeOutSec: this.settings.songFadeOutSec,
      outKind: it?.kind,
      cortinaFadeOutSec: it?.fadeOutSec ?? this.settings.cortinaFadeOutSec,
    });
    applyOutgoing(c.gain.gain, { endsAt: end, base: c.base, window: w, curve: "equalPower", now });
    if (c.endsAt !== end) {
      c.endsAt = end;
      c.node?.stop(end);
    }
    for (const f of [c.eqLow, c.eqMid, c.eqHigh]) {
      if (!f) continue;
      this.cancelAutomation(f.gain, now);
      f.gain.setValueAtTime(0, now);
    }
  }

  /** Item n is running: decode n+1 and schedule it at its absolute time; prefetch n+2. */
  private async scheduleNext(): Promise<void> {
    const c = this.current;
    if (!c || this.holding || this.queued || this.skipTarget !== null) return;
    const n = this.nextPlayable(c.planIndex);
    if (n === null) return;
    if (this.holdBefore === n) return;
    const gen = this.generation;
    // wave 4: the DJ's edited transition (Spotify plays one track at a time: an overlap is the night's gap there)
    const tr = c.interrupted ? null : this.effectiveTransition(c.planIndex, n, !!c.external);
    // 2026-11: the silence the outgoing still plays and the incoming head share the gap (Settings → Booth → Gaps)
    let failed: unknown = null;
    const prep = await this.prepare(n).catch((e) => {
      failed = e ?? new Error("No source");
      return undefined;
    });
    if (gen !== this.generation || this.current !== c || this.holding || this.queued) return;
    if (failed) {
      // the next item failed to decode: try the one after it
      this.markMissing(n, failed);
      await this.scheduleNext();
      return;
    }
    const join = joinAfterTail(this.joinMode(c.planIndex, n), {
      gapSec: tr ? tr.gapSec : this.gapAfter(c.planIndex),
      keptTailSec: c.keptTail ?? 0,
      headSec: this.silenceOf(n, prep).head,
      faded: this.fadedJoin(c.planIndex, tr),
    });
    let w = tr ? this.windowFor(c, n, tr) : null;
    if (w && w.overlapSec === 0 && join.gapSec !== w.inStart) {
      const shift = join.gapSec - w.inStart;
      w = {
        ...w,
        inStart: join.gapSec,
        inFade: { ...w.inFade, start: w.inFade.start + shift },
        box: { ...w.box, end: w.box.end + shift },
        gapSec: join.gapSec,
      };
    }
    const end = c.tail?.end ?? c.endsAt;
    const when = w ? Math.max(this.ctx.currentTime + START_AHEAD, end + w.inStart) : c.endsAt + join.gapSec;
    const s = await this.schedule(n, when, {
      headCut: join.headCutSec,
      ...(w ? { transitionIn: { window: w, outEnd: when - w.inStart } } : {}),
    });
    if (gen !== this.generation || this.current !== c || this.holding) {
      if (s) {
        s.cancelled = true;
        s.external?.cancel();
        s.node?.stop(this.ctx.currentTime);
        s.node?.disconnect();
      }
      return;
    }
    if (!s) {
      // the next item failed to decode: try the one after it
      await this.scheduleNext();
      return;
    }
    this.queued = s;
    if (w) this.applyTail(c, w);
    if (this.forcedNext === n) this.forcedNext = null;
    const after = this.nextPlayable(n);
    if (after !== null) void this.prepare(after).catch(() => {});
  }

  /** Build the nodes for item `i` and start them at `when`; null when the item has no playable source. */
  private async schedule(
    i: number,
    when: number,
    o: {
      from?: number;
      fadeIn?: number;
      transitionIn?: { window: TransitionWindow; outEnd: number };
      /** 2026-11: seconds of the side's silent head to skip (default: as when nothing plays before it) */
      headCut?: number;
      /** an external item that already plays, this many seconds into its recording (a reload) */
      attachAt?: number;
    } = {},
  ): Promise<Scheduled | null> {
    const it = this.item(i);
    if (!it) return null;
    if (it.kind === "break") {
      // a break is silence with a countdown: the next item is scheduled after it ends
      const s: Scheduled = {
        planIndex: i,
        kind: "break",
        when,
        startedAt: when,
        endsAt: when + it.lengthSec,
        source: "file",
        gainDb: 0,
        peakCapped: false,
        gainFrom: "none",
        started: true,
        base: 1,
      };
      return s;
    }
    let prepared: PreparedItem;
    try {
      prepared = await this.prepare(i);
    } catch (e) {
      this.markMissing(i, e);
      return null;
    }
    const trim = this.trims[it.id ?? ""] ?? 0;
    const g = gainFor(it, prepared.measured, this.settings, trim);
    const base: Scheduled = {
      planIndex: i,
      kind: it.kind,
      when,
      startedAt: when,
      endsAt: when,
      source: prepared.kind,
      gainDb: g.gainDb,
      peakCapped: g.peakCapped,
      gainFrom: g.from,
      started: false,
      base: g.base,
      measured: prepared.measured,
    };
    if (isExternalKind(prepared.kind)) return this.scheduleExternal(base, it, prepared, g.gainDb, o);
    const buffer = prepared.buffer;
    if (!buffer) return null;
    const ctx = this.ctx;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    const gain = ctx.createGain();
    // wave 4: a lowshelf and a highshelf per item, flat (0 dB) unless a transition's bass swap automates them
    const low = ctx.createBiquadFilter?.();
    const mid = low ? ctx.createBiquadFilter?.() : undefined;
    const high = low ? ctx.createBiquadFilter?.() : undefined;
    if (low && mid && high) {
      low.type = "lowshelf";
      low.frequency.value = BASS_SHELF_HZ;
      low.gain.value = 0;
      // 2026-11: the three-band swap's mids, flat (0 dB) unless a transition automates them
      mid.type = "peaking";
      mid.frequency.value = MID_PEAK_HZ;
      mid.gain.value = 0;
      high.type = "highshelf";
      high.frequency.value = HIGH_SHELF_HZ;
      high.gain.value = 0;
      node.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(gain);
      base.eqLow = low;
      base.eqMid = mid;
      base.eqHigh = high;
    } else node.connect(gain);
    let last: GainNodeLike = gain;
    if (it.kind === "cortina") {
      const fader = ctx.createGain();
      fader.gain.setValueAtTime(this.cortinaFader, when);
      gain.connect(fader);
      last = fader;
      base.fader = fader;
    }
    last.connect(this.master);
    base.gain = gain;
    base.node = node;

    // where in the clip we start and how long we play
    let offset = 0;
    // round 22: a song the DJ cued (Song info → waveform) starts at its cue and stops at its stop second
    const cued = it.kind !== "cortina" && isCued(it);
    if (it.kind === "cortina" && prepared.kind === "preview")
      // 2026-11: a 30 s clip is Deezer's cut of the song's highlight, at an offset Deezer does not publish: the
      // chorus start (seconds into the full recording) cannot be placed in it, so the clip plays from its start
      offset = 0;
    else if (it.kind === "cortina") {
      // the chorus start, validated against the real file: start + the cortina's length stays inside it; a cue the
      // lyrics could not place starts at the loud part of the file's energy (audio fallback)
      let start = it.trimInSec ?? 0;
      if (!start && prepared.kind === "file" && this.audioHook(it)) start = fileHookSec(buffer) ?? 0;
      offset = Math.max(0, Math.min(start, buffer.duration - it.lengthSec, buffer.duration - 1));
    } else if (cued) offset = Math.min(it.trimInSec ?? 0, Math.max(0, buffer.duration - 1));
    else if (this.settings.trimLeadingSilence && this.silenceMode() === "off")
      offset = Math.min(prepared.measured?.introSec ?? 0, TRIM_MAX_SEC, buffer.duration / 2);
    // 2026-11: the side's own silence (Settings → Booth → Gaps): skip into its head, cut inside its tail
    const song = it.kind === "track" || it.kind === "closing";
    const sil = song ? this.silenceOf(i, prepared) : { head: 0, tail: 0 };
    const headCut = song
      ? clamp(
          o.headCut ?? this.headCutAlone(sil.head),
          0,
          Math.min(sil.head, Math.max(0, buffer.duration / 2 - offset)),
        )
      : 0;
    offset += headCut;
    // a cued side stops at its stop second (else at the file's end)
    const spanEnd =
      cued && it.stopSec !== undefined ? Math.min(it.stopSec, buffer.duration) : buffer.duration;
    let duration: number | undefined;
    if (it.kind === "cortina") duration = Math.min(it.lengthSec, buffer.duration - offset);
    else if (cued) duration = Math.max(0.5, spanEnd - offset);
    const cap = this.capFor(i) ?? (prepared.kind === "preview" ? PREVIEW_CAP_SEC : null);
    const natural = duration ?? buffer.duration - offset;
    // a cap (a 30 s clip, a rehearsal) that ends the side before its tail leaves no tail to cut
    const effTail = song
      ? Math.max(0, sil.tail - Math.max(0, natural - (cap ?? Number.POSITIVE_INFINITY)))
      : 0;
    const tailCut = effTail > 0 ? Math.min(this.tailCutFor(i, effTail), Math.max(0, natural - 1)) : 0;
    if (tailCut > 0) duration = natural - tailCut;
    if (cap) duration = Math.min(duration ?? natural, cap);
    base.headCut = headCut;
    base.srcStart = offset;
    base.keptTail = Math.max(0, effTail - tailCut);
    const full = duration ?? buffer.duration - offset;
    // a resume after Pause starts `from` seconds into the item
    const from = clamp(o.from ?? 0, 0, Math.max(0, full - 0.5));
    if (from > 0) {
      offset += from;
      duration = full - from;
    }
    const length = full - from;
    const endsAt = when + length;
    base.endsAt = endsAt;
    base.startedAt = when - from;

    // envelopes: declick in (or the resume fade), fades for cortinas, the song end fade, declick out at the end
    const resumeFade = o.fadeIn !== undefined ? Math.min(o.fadeIn, length / 2) : null;
    // wave 4: an edited transition's rise replaces the item's own start (the declick, a cortina's fade in)
    const trIn = o.transitionIn && from === 0 ? o.transitionIn : null;
    const rise = trIn ? Math.min(trIn.window.inFade.len, length / 2) : 0;
    const fadeIn =
      resumeFade === null && it.kind === "cortina" && from === 0 && rise === 0
        ? Math.min(it.fadeInSec ?? this.settings.cortinaFadeInSec, length / 2)
        : 0;
    if (trIn && rise > 0)
      applyIncoming(gain.gain, {
        when,
        base: g.base,
        window: { ...trIn.window, inFade: { ...trIn.window.inFade, len: rise } },
        curve: trIn.window.curveIn,
      });
    else if (fadeIn > 0) gain.gain.setValueCurveAtTime(fadeInCurve(64, g.base), when, fadeIn);
    else {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(g.base, when + Math.max(DECLICK_IN, resumeFade ?? 0));
    }
    const eq = trIn ? eqLanes(trIn.window) : null;
    if (trIn && eq && low) applyEqPoints(low.gain, eq.in.low, trIn.outEnd, ctx.currentTime);
    if (trIn && eq && mid) applyEqPoints(mid.gain, eq.in.mid, trIn.outEnd, ctx.currentTime);
    if (trIn && eq && high) applyEqPoints(high.gain, eq.in.high, trIn.outEnd, ctx.currentTime);
    const lead = Math.max(fadeIn, resumeFade ?? 0, rise);
    const wantOut =
      it.kind === "cortina"
        ? (it.fadeOutSec ?? this.settings.cortinaFadeOutSec)
        : this.settings.songFadeOutSec;
    const fadeOut = Math.min(Math.max(0, wantOut), Math.max(0, length - lead - 0.1));
    if (fadeOut > 0) gain.gain.setValueCurveAtTime(fadeOutCurve(64, g.base), endsAt - fadeOut, fadeOut);
    else {
      // a cut inside the silent tail ends with a short fade (≤ 150 ms): the surface noise never clicks
      const out =
        tailCut > 0
          ? Math.max(DECLICK_OUT, Math.min(SILENCE_CUT_FADE_SEC, (length - lead) / 2))
          : DECLICK_OUT;
      gain.gain.setValueAtTime(g.base, endsAt - out);
      gain.gain.linearRampToValueAtTime(0, endsAt);
    }
    node.start(when, offset, duration);
    base.started = true;
    node.onended = () => {
      node.disconnect();
      setTimeoutSafe(() => {
        gain.disconnect();
        base.fader?.disconnect();
        low?.disconnect();
        mid?.disconnect();
        high?.disconnect();
      }, 1000);
      if (!base.cancelled) this.onEnded(base);
    };
    return base;
  }

  private scheduleExternal(
    base: Scheduled,
    it: BoothRow,
    prepared: PreparedItem,
    gainDb: number,
    o: {
      from?: number;
      fadeIn?: number;
      headCut?: number;
      attachAt?: number;
      transitionIn?: { window: TransitionWindow; outEnd: number };
    } = {},
  ): Scheduled | null {
    const i = base.planIndex;
    const a = this.adapterFor(i)?.external;
    // Spotify's track uri, or another external player's id (YouTube: `youtube:video:<id>`)
    const uri = prepared.spotifyUri ?? prepared.externalUri;
    if (!a || !uri) return null;
    const delay = Math.max(0, base.when - this.ctx.currentTime);
    // 2026-11: Spotify cannot be heard by the browser: the silence is the plan's (a measurement of the same
    // recording, a table, the opt-in estimate, or the DJ's "Song ends early" stop)
    const song = it.kind === "track" || it.kind === "closing";
    const sil = song ? this.silenceOf(i) : { head: 0, tail: 0 };
    // the side from its cue in (or 0) to its stop (or end), before the plan's own silence cuts
    const span = it.lengthSec + (it.headCutSec ?? 0) + (it.tailCutSec ?? 0);
    const headCut = song
      ? clamp(o.headCut ?? this.headCutAlone(sil.head), 0, Math.min(sil.head, span / 2))
      : 0;
    const natural = span - headCut;
    const cap = this.capFor(i);
    const effTail = song
      ? Math.max(0, sil.tail - Math.max(0, natural - (cap ?? Number.POSITIVE_INFINITY)))
      : 0;
    const tailCut = effTail > 0 ? Math.min(this.tailCutFor(i, effTail), Math.max(0, natural - 1)) : 0;
    const full = cap ? Math.min(cap, natural - tailCut) : natural - tailCut;
    const cued = it.kind !== "cortina" && isCued(it);
    const start0 = (it.kind === "cortina" || cued ? (it.trimInSec ?? 0) : 0) + headCut;
    base.extStart = start0;
    base.srcStart = start0;
    base.headCut = headCut;
    base.keptTail = Math.max(0, effTail - tailCut);
    const attached = o.attachAt !== undefined;
    const from = clamp(attached ? o.attachAt! - start0 : (o.from ?? 0), 0, Math.max(0, full - 0.5));
    const length = full - from;
    base.startedAt = base.when - from;
    base.endsAt = base.when + length;
    // "Starting…" until the device confirms an item started now (a natural change at the gap says nothing)
    const userStart = !attached && delay < 1;
    if (userStart) this.setStarting(true);
    const songFade = it.kind === "cortina" ? 0 : this.settings.songFadeOutSec;
    base.extFadeOut = it.kind === "cortina" ? (it.fadeOutSec ?? 0) : songFade;
    // 2026-11: an edited transition's rise (a player that fades: the SDK; Connect starts at its level)
    const rise = o.transitionIn && from === 0 && a.capabilities.fade ? o.transitionIn.window.inFade.len : 0;
    const timed = it.kind === "cortina" || cued || !!cap || songFade > 0 || from > 0 || tailCut > 0;
    base.extTimed = timed;
    base.external = a.startItem({
      uri,
      delaySec: delay,
      positionSec: start0 + from,
      durationSec: timed ? length : undefined,
      fadeInSec: o.fadeIn ?? (rise > 0 ? rise : it.kind === "cortina" ? it.fadeInSec : 0),
      fadeOutSec: it.kind === "cortina" ? it.fadeOutSec : songFade,
      gainDb: Math.min(0, gainDb),
      attached,
      onStarted: () => {
        if (userStart && !base.cancelled) this.setStarting(false);
      },
      onEnded: () => {
        if (!base.cancelled) this.onEnded(base);
      },
      onError: (msg) => {
        const who = prepared.kind === "youtube" ? "YouTube" : "Spotify";
        this.banner(`${who}: ${msg}`, prepared.kind);
        if (!base.cancelled) this.onEnded(base);
      },
    });
    base.started = true;
    return base;
  }

  /** The running item reached its end: the queued one is already playing (or not, on hold). */
  private onEnded(s: Scheduled) {
    if (this.current !== s) return;
    if (this.state === "stopped") return;
    // a Connect skip is on its way: it plays next
    if (this.skipTarget !== null) return;
    const q = this.queued;
    this.queued = null;
    this.release(s.planIndex - 1);
    if (q && !this.holding && !q.cancelled) {
      this.current = q;
      this.planIndex = q.planIndex;
      this.anchors.push({ planIndex: q.planIndex, at: new Date(this.wall()).toISOString() });
      this.transition(q.kind === "cortina" ? "cortina" : "playing", q.kind === "break" ? "break" : undefined);
      this.onEvent({ type: "item", planIndex: q.planIndex });
      if (q.kind === "break") {
        // a break is a timed pause at the break item: the DJ ends it early with endBreak or the page ends it
        this.breakUntil = this.wall() + (q.endsAt - q.startedAt) * 1000;
        this.current = null;
        this.transition("paused", "break");
        const n = this.nextPlayable(q.planIndex);
        if (n !== null) void this.prepare(n).catch((e) => this.markMissing(n, e));
        return;
      }
      void this.scheduleNext();
      return;
    }
    // hold, break, the end of the night, or a next item that was not ready in time
    this.current = null;
    const n = this.nextPlayable(s.planIndex);
    if (n === null) return this.finish();
    this.planIndex = n;
    if (!this.holding && this.holdBefore !== n && !this.breakUntil) {
      // late: the decode outran the song; start it now rather than stopping the floor
      this.transition("armed", "late");
      void this.play();
      return;
    }
    this.holding = false;
    this.transition("paused", this.breakUntil ? "break" : this.holdBefore === n ? "birthday vals" : "hold");
    void this.prepare(n).catch((e) => this.markMissing(n, e));
  }

  private finish() {
    this.current = null;
    this.queued = null;
    this.transition("stopped", "end of the night");
    this.onEvent({ type: "ended" });
  }
}

/** A track the DJ cued (round 22): the plan's cue-in and stop second, not the leading-silence trim. */
function isCued(it: BoothRow): boolean {
  return !!it.cued;
}

function setTimeoutSafe(fn: () => void, ms: number) {
  if (typeof setTimeout === "function") setTimeout(fn, ms);
  else fn();
}
