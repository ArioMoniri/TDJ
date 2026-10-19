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
  resume(): Promise<void>;
  suspend?(): Promise<void>;
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
}
export const DEFAULT_BOOTH_SETTINGS: BoothSettings = {
  gapSec: 2.5,
  cortinaFadeInSec: 0,
  cortinaFadeOutSec: 4,
  cortinaLevelDb: -4,
  loudnessTargetLUFS: -16,
  trimLeadingSilence: false,
  mediaKeys: true,
};
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
}
export type EngineEvent =
  | { type: "state"; from: BoothState; to: BoothState; planIndex: number; reason?: string }
  | { type: "item"; planIndex: number }
  | { type: "banner"; text: string; key?: string; action?: { label: string; run: () => void } }
  | { type: "ended" }
  | { type: "birthday"; result: "marked" | "needs-swap" }
  | { type: "decoding"; planIndex: number; busy: boolean };

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
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The first start is this far ahead of "now": enough for the graph to settle, inaudible as a delay. */
export const START_AHEAD = 0.05;
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

export interface EngineOptions {
  adapters: SourceAdapter[];
  settings?: Partial<BoothSettings>;
  onEvent?: (e: EngineEvent) => void;
  /** 30 in rehearsal mode: every item is capped there */
  rehearsalSec?: number | null;
  now?: () => number;
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
  current: Scheduled | null = null;
  rehearsalSec: number | null;
  private queued: Scheduled | null = null;
  private adapters: SourceAdapter[];
  private onEvent: (e: EngineEvent) => void;
  private generation = 0;
  private prepared = new Map<number, Promise<PreparedItem>>();
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
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  /* ---------- plan ---------- */

  load(plan: BoothRows, entities: PlanEntity[], sources: ItemSource[]) {
    this.plan = plan;
    this.entities = entities;
    this.sources = sources;
    this.skipped = new Set(sources.map((s, i) => (s === "missing" ? i : -1)).filter((i) => i >= 0));
    for (let i = 0; i < plan.items.length; i++) if (plan.items[i]!.kind === "break") this.skipped.delete(i);
    this.prepared.clear();
  }
  /** A swap ahead of the playhead replaced items: keep the playhead, refresh the rest. */
  replacePlan(plan: BoothRows, entities: PlanEntity[], sources: ItemSource[]) {
    const keepSkipped = new Set([...this.skipped].filter((i) => i <= this.planIndex));
    this.load(plan, entities, sources);
    for (const i of keepSkipped) this.skipped.add(i);
    if (this.queued && !this.queued.started) {
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
  /** The next index after `from` that will play (not skipped; breaks count). */
  nextPlayable(from: number): number | null {
    if (!this.plan) return null;
    for (let i = from + 1; i < this.plan.items.length; i++) if (!this.skipped.has(i)) return i;
    return null;
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
    if (this.skipped.has(this.planIndex) || this.item()?.kind === "break") {
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
    const i = this.planIndex;
    const s = await this.schedule(i, this.ctx.currentTime + delaySec);
    if (!s) return;
    this.current = s;
    this.anchors.push({ planIndex: i, at: new Date(this.wall()).toISOString() });
    this.transition(s.kind === "cortina" ? "cortina" : "playing", "play");
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

  /** The queued item is left out; what follows it plays at the next gap. From `stopped`: arm the next item. */
  next(): void {
    if (!this.plan) return;
    if (this.state === "stopped" || this.state === "paused" || this.state === "armed") {
      const n = this.nextPlayable(this.planIndex);
      if (n === null) return;
      this.planIndex = n;
      this.transition("armed", "next");
      void this.prepare(n).catch((e) => this.markMissing(n, e));
      return;
    }
    const n = this.nextPlayable(this.planIndex);
    if (n === null) return;
    this.skipped.add(n);
    this.cancelQueued();
    this.transition(this.state, "next at gap");
    void this.scheduleNext();
  }

  /** Emergency: everything fades to silence in 1 s; the position is kept so `play` restarts the same item. */
  stop(reason = "stop"): void {
    if (this.state === "idle") return;
    const now = this.ctx.currentTime;
    for (const s of [this.current, this.queued]) {
      if (!s) continue;
      s.cancelled = true;
      if (s.external) {
        s.started ? s.external.stop(EMERGENCY_FADE) : s.external.cancel();
        continue;
      }
      if (s.when > now) {
        // not audible yet: dropped without a fade
        s.node?.stop(now);
        s.node?.disconnect();
        continue;
      }
      for (const g of [s.gain, s.fader]) {
        if (!g) continue;
        this.cancelAutomation(g.gain, now);
        g.gain.setValueCurveAtTime(
          fadeOutCurve(64, g === s.fader ? this.cortinaFader : s.base),
          now,
          EMERGENCY_FADE,
        );
      }
      s.node?.stop(now + EMERGENCY_FADE);
      const node = s.node;
      if (node) node.onended = () => node.disconnect();
    }
    this.current = null;
    this.queued = null;
    this.holding = false;
    this.breakUntil = null;
    this.transition("stopped", reason);
  }

  /** Stop now, then play the next item once the fade is through. */
  async skipNow(): Promise<void> {
    if (this.state !== "playing" && this.state !== "cortina") return;
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
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }
  private applyMaster() {
    const g = this.muted ? 0 : dbToGain(this.masterDb);
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, PAUSE_RAMP);
    for (const a of this.adapters) a.external?.setMaster(g);
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
    const c = this.current;
    if (!c) return 0;
    if (c.external) return c.started ? c.external.position() : 0;
    return Math.max(0, this.ctx.currentTime - c.startedAt - (this.ctx.outputLatency ?? 0));
  }
  /** the current item's length as it will actually play (rehearsal cap, early fader) */
  currentLength(): number {
    const c = this.current;
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
      skipped: this.skipped,
      currentLength: this.current ? this.currentLength() : undefined,
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
    p.catch(() => this.prepared.delete(i));
    return p;
  }
  private markMissing(i: number, e: unknown) {
    this.skipped.add(i);
    const it = this.item(i);
    this.banner(
      `${it?.title ?? "An item"}: ${e instanceof Error ? e.message : "no source"} (skipped)`,
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

  private cancelQueued() {
    const q = this.queued;
    if (!q) return;
    this.queued = null;
    q.cancelled = true;
    if (q.external) q.external.cancel();
    else {
      q.node?.stop(this.ctx.currentTime);
      q.node?.disconnect();
      q.gain?.disconnect();
      q.fader?.disconnect();
    }
  }

  /** Item n is running: decode n+1 and schedule it at its absolute time; prefetch n+2. */
  private async scheduleNext(): Promise<void> {
    const c = this.current;
    if (!c || this.holding || this.queued) return;
    const n = this.nextPlayable(c.planIndex);
    if (n === null) return;
    if (this.holdBefore === n) return;
    const gen = this.generation;
    const when = c.endsAt + this.gapAfter(c.planIndex);
    const s = await this.schedule(n, when);
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
    const after = this.nextPlayable(n);
    if (after !== null) void this.prepare(after).catch(() => {});
  }

  /** Build the nodes for item `i` and start them at `when`; null when the item has no playable source. */
  private async schedule(i: number, when: number): Promise<Scheduled | null> {
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
    if (prepared.kind === "spotify") return this.scheduleExternal(base, it, prepared, g.gainDb);
    const buffer = prepared.buffer;
    if (!buffer) return null;
    const ctx = this.ctx;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    const gain = ctx.createGain();
    node.connect(gain);
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
    if (it.kind === "cortina") offset = Math.min(it.trimInSec ?? 0, Math.max(0, buffer.duration - 1));
    else if (this.settings.trimLeadingSilence)
      offset = Math.min(prepared.measured?.introSec ?? 0, TRIM_MAX_SEC, buffer.duration / 2);
    let duration: number | undefined;
    if (it.kind === "cortina") duration = Math.min(it.lengthSec, buffer.duration - offset);
    const cap = this.capFor(i) ?? (prepared.kind === "preview" ? PREVIEW_CAP_SEC : null);
    if (cap) duration = Math.min(duration ?? buffer.duration - offset, cap);
    const length = duration ?? buffer.duration - offset;
    const endsAt = when + length;
    base.endsAt = endsAt;

    // envelopes: declick in, fades for cortinas, declick out before the natural end
    const fadeIn =
      it.kind === "cortina" ? Math.min(it.fadeInSec ?? this.settings.cortinaFadeInSec, length / 2) : 0;
    if (fadeIn > 0) gain.gain.setValueCurveAtTime(fadeInCurve(64, g.base), when, fadeIn);
    else {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(g.base, when + DECLICK_IN);
    }
    if (it.kind === "cortina") {
      const fadeOut = Math.min(
        it.fadeOutSec ?? this.settings.cortinaFadeOutSec,
        Math.max(0, length - fadeIn - 0.1),
      );
      if (fadeOut > 0) gain.gain.setValueCurveAtTime(fadeOutCurve(64, g.base), endsAt - fadeOut, fadeOut);
      else {
        gain.gain.setValueAtTime(g.base, endsAt - DECLICK_OUT);
        gain.gain.linearRampToValueAtTime(0, endsAt);
      }
    } else {
      gain.gain.setValueAtTime(g.base, endsAt - DECLICK_OUT);
      gain.gain.linearRampToValueAtTime(0, endsAt);
    }
    node.start(when, offset, duration);
    base.started = true;
    node.onended = () => {
      node.disconnect();
      setTimeoutSafe(() => {
        gain.disconnect();
        base.fader?.disconnect();
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
  ): Scheduled | null {
    const a = this.adapterFor(base.planIndex)?.external;
    if (!a || !prepared.spotifyUri) return null;
    const delay = Math.max(0, base.when - this.ctx.currentTime);
    const length = this.itemLength(base.planIndex);
    base.endsAt = base.when + length;
    base.external = a.startItem({
      uri: prepared.spotifyUri,
      delaySec: delay,
      positionSec: it.kind === "cortina" ? (it.trimInSec ?? 0) : 0,
      durationSec: it.kind === "cortina" || this.capFor(base.planIndex) ? length : undefined,
      fadeInSec: it.kind === "cortina" ? it.fadeInSec : 0,
      fadeOutSec: it.kind === "cortina" ? it.fadeOutSec : 0,
      gainDb: Math.min(0, gainDb),
      onEnded: () => {
        if (!base.cancelled) this.onEnded(base);
      },
      onError: (msg) => {
        this.banner(`Spotify: ${msg}`, "spotify");
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

function setTimeoutSafe(fn: () => void, ms: number) {
  if (typeof setTimeout === "function") setTimeout(fn, ms);
  else fn();
}
