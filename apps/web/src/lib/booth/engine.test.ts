import { bypassPlanItems, type Playlist, planBooth } from "@tdj/core";
import { beforeEach, describe, expect, it } from "vitest";
import { makeNightLog, nightLogSummary } from "@/lib/history";
import {
  type AnalyserLike,
  type AudioContextLike,
  type AudioParamLike,
  BoothEngine,
  DEFAULT_BOOTH_SETTINGS,
  type EngineEvent,
  type GainNodeLike,
  gainFor,
  type SourceNodeLike,
} from "./engine";
import { DECLICK_IN, dbToGain, EMERGENCY_FADE } from "./envelope";
import { type BoothRows, decorate, remainingFrom } from "./plan";
import type { ExternalHandle, ExternalStart, PlanEntity, PreparedItem, SourceAdapter } from "./sources/types";

/* ---------- recording fake context (round7-booth.md §12.1) ---------- */
type Call = { m: string; args: unknown[] };
class FakeParam implements AudioParamLike {
  value = 1;
  calls: Call[] = [];
  setValueAtTime(v: number, t: number) {
    this.calls.push({ m: "setValueAtTime", args: [v, t] });
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push({ m: "linearRampToValueAtTime", args: [v, t] });
  }
  setValueCurveAtTime(c: Float32Array, t: number, d: number) {
    this.calls.push({ m: "setValueCurveAtTime", args: [c, t, d] });
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    this.calls.push({ m: "setTargetAtTime", args: [v, t, tc] });
  }
  cancelScheduledValues(t: number) {
    this.calls.push({ m: "cancelScheduledValues", args: [t] });
  }
  of(m: string) {
    return this.calls.filter((c) => c.m === m);
  }
}
class FakeGain implements GainNodeLike {
  gain = new FakeParam();
  connected: unknown[] = [];
  connect(n: unknown) {
    this.connected.push(n);
  }
  disconnect() {}
}
class FakeSource implements SourceNodeLike {
  buffer: AudioBuffer | null = null;
  onended: ((ev: Event) => unknown) | null = null;
  starts: Array<[number | undefined, number | undefined, number | undefined]> = [];
  stops: Array<number | undefined> = [];
  endsAt: number | null = null;
  fired = false;
  connect() {}
  disconnect() {}
  start(when?: number, offset?: number, duration?: number) {
    this.starts.push([when, offset, duration]);
    const dur = duration ?? (this.buffer?.duration ?? 0) - (offset ?? 0);
    this.endsAt = (when ?? 0) + dur;
  }
  stop(when?: number) {
    this.stops.push(when);
    if (when !== undefined) this.endsAt = this.endsAt === null ? when : Math.min(this.endsAt, when);
  }
}
class FakeCtx implements AudioContextLike {
  currentTime = 0;
  sampleRate = 48000;
  outputLatency = 0;
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createAnalyser(): AnalyserLike {
    return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData() {} };
  }
  state = "running";
  resumes = 0;
  listeners: Record<string, Array<() => void>> = {};
  addEventListener(t: string, cb: () => void) {
    const l = this.listeners[t] ?? [];
    l.push(cb);
    this.listeners[t] = l;
  }
  emit(t: string) {
    for (const cb of this.listeners[t] ?? []) cb();
  }
  async resume() {
    this.resumes++;
    this.state = "running";
  }
  /** move the clock; sources whose end passed fire `onended` in time order */
  advance(to: number) {
    this.currentTime = to;
    for (const s of [...this.sources].sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0))) {
      if (!s.fired && s.endsAt !== null && s.endsAt <= to && s.starts.length) {
        s.fired = true;
        s.onended?.(new Event("ended"));
      }
    }
  }
}
const buffer = (duration: number) =>
  ({
    duration,
    length: Math.round(duration * 48000),
    sampleRate: 48000,
    numberOfChannels: 1,
  }) as unknown as AudioBuffer;

/** A file adapter whose buffers have the plan's lengths and a per-id measurement. */
function fakeAdapter(
  measured: Record<string, { lufs: number; peakDbFS: number; introSec?: number }> = {},
): SourceAdapter {
  return {
    kind: "file",
    async available() {
      return { ok: true };
    },
    async resolve() {
      return "ready";
    },
    async prepare(item): Promise<PreparedItem> {
      const dur = item.kind === "cortina" ? (item.stopSec ?? 45) + 30 : item.lengthSec;
      const m = measured[item.id ?? ""];
      return {
        kind: "file",
        buffer: buffer(dur),
        durationSec: dur,
        measured: m ? { introSec: 0, ...m } : undefined,
      };
    },
    release() {},
  };
}

/* ---------- a small set: 2 tandas (2 + 2 tracks), cortinas of 45 s with cue-in 10, a closing ---------- */
const song = (
  id: string,
  durationSec: number,
  rhythm: "tango" | "vals" = "tango",
  audio?: { loudnessDb: number },
) =>
  ({
    id,
    title: id,
    rhythm,
    orchestra: "O",
    orchestraId: "o",
    singer: null,
    singerId: null,
    vocal: false,
    year: 1940,
    era: "golden-peak",
    durationSec,
    audio: audio ? ({ loudnessDb: audio.loudnessDb } as unknown as never) : undefined,
  }) as unknown as Playlist["tandas"][number]["songs"][number];
function set(o: { gapOverrides?: Record<number, number>; thirdTanda?: boolean } = {}): Playlist {
  const tanda = (index: number, ids: string[], rhythm: "tango" | "vals" = "tango") => ({
    index,
    rhythm,
    orchestra: "O",
    orchestraId: "o",
    singer: null,
    vocal: false,
    yearRange: null,
    era: "golden-peak",
    songs: ids.map((id) => song(id, 170, rhythm)),
    energy: 50,
    energyCurve: [],
    targetEnergy: 50,
    phase: "build",
    durationSec: 340,
    cortina: {
      id: `c${index}`,
      title: `Cortina ${index}`,
      artist: "Band",
      genre: "x",
      culture: "global",
      energy: 50,
      startSec: 10,
      lengthSec: 45,
    },
  });
  const tandas = [tanda(0, ["a1", "a2"]), tanda(1, ["b1", "b2"], "vals")];
  if (o.thirdTanda) tandas.push(tanda(2, ["d1", "d2"]));
  return {
    id: "set-1",
    name: "test",
    createdAt: "2026-10-18T20:00:00.000Z",
    options: {} as Playlist["options"],
    tandas: tandas as unknown as Playlist["tandas"],
    closing: song("cump", 180),
    stats: {} as Playlist["stats"],
    score: { total: 90, factors: [], verdict: "" },
  };
}
function build(p: Playlist, s: Parameters<typeof planBooth>[1] = {}): BoothRows {
  return decorate(p, planBooth(p, s));
}
function engineFor(ctx: FakeCtx, plan: BoothRows, adapter = fakeAdapter(), events: EngineEvent[] = []) {
  const e = new BoothEngine(ctx, {
    adapters: [adapter],
    onEvent: (ev) => events.push(ev),
    now: () => 1_000_000 + ctx.currentTime * 1000,
  });
  const entities: PlanEntity[] = plan.items.map(() => null);
  e.load(
    plan,
    entities,
    plan.items.map(() => "file"),
  );
  return e;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("BoothEngine scheduler (round7-booth.md §6.3, §12.1)", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });

  it("gaps: after a 170 s buffer starting at t=1 the next start(when) is 1 + 170 + 2.5, sample-exact", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    ctx.currentTime = 0.95;
    await e.start();
    expect(e.state).toBe("armed");
    await e.play();
    expect(e.state).toBe("playing");
    expect(ctx.sources[0]!.starts[0]).toEqual([1, 0, undefined]);
    // the next item is scheduled immediately, at its absolute time
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(1 + 170 + 2.5, 9);
    // declick: 0 at `when`, base after 5 ms; a ramp to 0 before the natural end
    const g = ctx.gains[1]!.gain; // gains[0] is the master
    expect(g.of("setValueAtTime")[0]!.args).toEqual([0, 1]);
    expect(g.of("linearRampToValueAtTime")[0]!.args).toEqual([1, 1 + DECLICK_IN]);
    expect(g.of("linearRampToValueAtTime")[1]!.args[1]).toBeCloseTo(171, 9);
  });

  it("round 22: a song's cue in / stop at plays only that span, and the next item follows it by the gap", async () => {
    const plan = build(set(), { songCues: { a1: { inSec: 5, outSec: 150 } } });
    // the file is the whole side (170 s); the plan plays 5 … 150
    const adapter = fakeAdapter();
    const prep = adapter.prepare.bind(adapter);
    adapter.prepare = async (item, ent) => {
      const p = await prep(item, ent);
      return item.id === "a1" ? { ...p, buffer: buffer(170), durationSec: 170 } : p;
    };
    const e = engineFor(ctx, plan, adapter);
    await e.start();
    await e.play();
    expect(ctx.sources[0]!.starts[0]![1]).toBe(5);
    expect(ctx.sources[0]!.starts[0]![2]).toBeCloseTo(145, 9);
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 145 + 2.5, 9);
    // the trim of leading silence never moves a cued start
    const plan2 = build(set(), { trimLeadingSilence: true, songCues: { a1: { inSec: 2 } } });
    const ctx2 = new FakeCtx();
    const e2 = engineFor(ctx2, plan2, fakeAdapter({ a1: { lufs: -16, peakDbFS: -3, introSec: 1.5 } }));
    e2.setSettings({ trimLeadingSilence: true });
    await e2.start();
    await e2.play();
    expect(ctx2.sources[0]!.starts[0]![1]).toBe(2);
  });

  it("gapOverrides[2] = 4: the tracks of tanda 2 are 4 s apart, tanda 1 keeps 2.5", async () => {
    const plan = build(set(), { gapOverrides: { 2: 4 } });
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    // a1 → a2: 2.5
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 170 + 2.5, 9);
    ctx.advance(0.05 + 170); // a1 ends → a2 is current, c0 scheduled
    await flush();
    ctx.advance(0.05 + 170 + 2.5 + 170); // a2 ends → c0 current, b1 scheduled
    await flush();
    ctx.advance(ctx.sources[2]!.endsAt!); // cortina ends → b1 current, b2 scheduled
    await flush();
    const b1 = ctx.sources[3]!;
    const b2 = ctx.sources[4]!;
    expect(b2.starts[0]![0]).toBeCloseTo(b1.endsAt! + 4, 9);
  });

  it("cortina: start(when, cueIn, stop − cueIn), the −60 dB curve on its gain ending at the stop, next tanda at + gap", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    ctx.advance(0.05 + 170);
    await flush();
    const c = ctx.sources[2]!;
    const item = plan.items[2]!;
    expect(item.kind).toBe("cortina");
    const when = 0.05 + 170 + 2.5 + 170 + 2.5;
    expect(c.starts[0]![0]).toBeCloseTo(when, 9);
    expect(c.starts[0]![1]).toBe(item.trimInSec);
    expect(c.starts[0]![2]).toBeCloseTo(item.stopSec! - item.trimInSec!, 9);
    // the fade: a setValueCurveAtTime on the cortina gain at when + length − 4, lasting 4 s, last point 0
    // (2026-11: a cortina cued in at 10 s also fades in over 0.5 s; the fade out is the 4 s curve)
    const curve = ctx.gains.flatMap((g) => g.gain.of("setValueCurveAtTime")).find((c) => c.args[2] === 4)!;
    expect(curve.args[1]).toBeCloseTo(when + item.lengthSec - 4, 9);
    expect(curve.args[2]).toBe(4);
    expect((curve.args[0] as Float32Array).at(-1)).toBe(0);
    // the next tanda starts gapSec after the cortina's silence
    ctx.advance(0.05 + 170 + 2.5 + 170);
    await flush();
    expect(ctx.sources[3]!.starts[0]![0]).toBeCloseTo(when + item.lengthSec + 2.5, 9);
    expect(e.state).toBe("cortina");
  });

  it("time to Cumparsita decreases by exactly the simulated elapsed time; drift stays 0 on plan", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    const t0 = e.remaining().timeToCumparsita;
    expect(t0).toBeCloseTo(plan.wallClockSec - 180, 6);
    ctx.advance(60);
    expect(e.remaining().timeToCumparsita).toBeCloseTo(t0 - (60 - 0.05), 6);
    ctx.advance(0.05 + 170 + 2.5 + 100);
    await flush();
    expect(e.planIndex).toBe(1);
    expect(e.remaining().timeToCumparsita).toBeCloseTo(t0 - (170 + 2.5 + 100), 6);
    expect(Math.abs(e.drift())).toBeLessThan(0.1);
    // the pure helper agrees with the engine before the night starts
    expect(remainingFrom(plan, 0, 0).timeToCumparsita).toBeCloseTo(plan.wallClockSec - 180, 6);
  });
});

describe("normalisation (§5.2)", () => {
  const S = { loudnessTargetLUFS: -16, cortinaLevelDb: -4 };
  it("measured −12 LUFS with target −16 → base 10^(−4/20)", () => {
    const g = gainFor({ kind: "track" }, { lufs: -12, peakDbFS: -10 }, S);
    expect(g.gainDb).toBe(-4);
    expect(g.base).toBeCloseTo(10 ** (-4 / 20), 9);
    expect(g.peakCapped).toBe(false);
    expect(g.from).toBe("measured");
  });
  it("measured −30 LUFS → capped at +12 dB", () => {
    expect(gainFor({ kind: "track" }, { lufs: -30, peakDbFS: -30 }, S).gainDb).toBe(12);
  });
  it("peak at −3 dBFS with +8 dB wanted → gain limited so the peak is −1 dBFS, peakCapped true", () => {
    const g = gainFor({ kind: "track" }, { lufs: -24, peakDbFS: -3 }, S);
    expect(g.gainDb).toBe(2);
    expect(g.peakCapped).toBe(true);
  });
  it("the DJ's trim is never reduced by the cap; a cortina targets −20; a prior is used without a measurement", () => {
    const g = gainFor({ kind: "track" }, { lufs: -24, peakDbFS: -3 }, S, 3);
    expect(g.gainDb).toBeCloseTo(2, 9); // norm −1 + trim 3
    expect(g.peakCapped).toBe(true);
    expect(gainFor({ kind: "cortina" }, { lufs: -16, peakDbFS: -20 }, S).gainDb).toBe(-4);
    const prior = gainFor({ kind: "track", gainDb: -2.5 }, undefined, S);
    expect(prior.gainDb).toBe(-2.5);
    expect(prior.from).toBe("prior");
    expect(gainFor({ kind: "track" }, undefined, S).gainDb).toBe(0);
  });
  it("the engine applies the measured gain as the item's base", async () => {
    const ctx = new FakeCtx();
    const plan = build(set());
    const e = engineFor(ctx, plan, fakeAdapter({ a1: { lufs: -12, peakDbFS: -8 } }));
    await e.start();
    await e.play();
    expect(e.current?.gainDb).toBe(-4);
    expect(ctx.gains[1]!.gain.of("linearRampToValueAtTime")[0]!.args[0]).toBeCloseTo(dbToGain(-4), 9);
  });
});

describe("state machine (§6.2)", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });

  it("emergency stop: a 1 s fadeOutCurve on every live gain and source.stop(now + 1); state stopped, planIndex kept", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    ctx.advance(0.05 + 170); // a2 running, c0 queued
    await flush();
    expect(e.planIndex).toBe(1);
    ctx.advance(200);
    e.stop();
    expect(e.state).toBe("stopped");
    expect(e.planIndex).toBe(1);
    const live = ctx.sources[1]!;
    const g = ctx.gains[2]!.gain;
    const curve = g.of("setValueCurveAtTime").at(-1)!;
    expect(curve.args[1]).toBe(200);
    expect(curve.args[2]).toBe(EMERGENCY_FADE);
    expect(live.stops.at(-1)).toBe(201);
    // the queued cortina was never started: stopped now and dropped
    expect(ctx.sources[2]!.stops.at(-1)).toBe(200);
    // play restarts the same item from 0
    ctx.advance(202);
    await e.play();
    expect(e.state).toBe("playing");
    expect(e.planIndex).toBe(1);
    expect(ctx.sources.at(-2)!.starts[0]).toEqual([202.05, 0, undefined]);
  });

  it("hold: the scheduled next source gets stop() before its when; play() re-schedules from now + 0.05", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    const queued = ctx.sources[1]!;
    ctx.advance(10);
    e.hold();
    expect(e.holding).toBe(true);
    expect(queued.stops).toEqual([10]);
    expect(e.state).toBe("playing"); // the song is never cut
    ctx.advance(0.05 + 170); // the song ends → paused
    await flush();
    expect(e.state).toBe("paused");
    expect(e.planIndex).toBe(1);
    ctx.advance(300);
    await e.play();
    expect(e.state).toBe("playing");
    expect(ctx.sources.at(-2)!.starts[0]![0]).toBeCloseTo(300.05, 9);
    // the item after it is queued again, at the gap
    expect(ctx.sources.at(-1)!.starts[0]![0]).toBeCloseTo(300.05 + 170 + 2.5, 9);
  });

  it("hold while armed pauses at once; next from paused arms the following item", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    e.hold();
    expect(e.state).toBe("paused");
    e.next();
    expect(e.state).toBe("armed");
    expect(e.planIndex).toBe(1);
  });

  it("next at gap skips the queued item; cueCortina skips the rest of the tanda; the log records the transitions", async () => {
    const events: EngineEvent[] = [];
    const e = engineFor(ctx, build(set({ thirdTanda: true })), fakeAdapter(), events);
    await e.start();
    await e.play();
    e.next(); // a2 is left out: the cortina follows a1
    await flush();
    expect(e.skipped.has(1)).toBe(true);
    expect(ctx.sources.at(-1)!.starts[0]![2]).toBe(45); // a cortina: its 45 s from the cue-in (2026-11)
    ctx.advance(0.05 + 170);
    await flush();
    expect(e.state).toBe("cortina");
    ctx.advance(ctx.sources.at(-2)!.endsAt!);
    await flush();
    expect(e.planIndex).toBe(3); // b1
    e.cueCortina(); // b2 is left out
    expect(e.skipped.has(4)).toBe(true);
    const log = e.log.map((l) => `${l.from}→${l.to}${l.reason ? `:${l.reason}` : ""}`);
    expect(log).toContain("idle→armed:start");
    expect(log).toContain("armed→playing:play");
    expect(log).toContain("playing→playing:next at gap");
    expect(log).toContain("playing→playing:cortina cued");
    expect(events.some((x) => x.type === "item")).toBe(true);
  });

  it("birthday vals: the next vals tanda is marked and the booth holds before it", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    e.birthdayVals();
    expect(plan.items[3]!.birthday).toBe(true);
    expect(e.holdBefore).toBe(3);
    ctx.advance(0.05 + 170);
    await flush();
    ctx.advance(0.05 + 170 + 2.5 + 170);
    await flush();
    expect(e.state).toBe("cortina");
    expect(ctx.sources).toHaveLength(3); // b1 is not queued
    ctx.advance(ctx.sources[2]!.endsAt!);
    await flush();
    expect(e.state).toBe("paused");
    expect(e.planIndex).toBe(3);
  });

  it("the cortina fader at 0 ends the cortina now and the next tanda starts gapSec after", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    ctx.advance(0.05 + 170);
    await flush();
    ctx.advance(0.05 + 170 + 2.5 + 170);
    await flush();
    expect(e.state).toBe("cortina");
    const c = ctx.sources[2]!;
    const now = c.starts[0]![0]! + 10;
    ctx.advance(now);
    e.setCortinaFader(0);
    expect(c.stops.at(-1)).toBeCloseTo(now + 0.1, 9);
    await flush();
    expect(ctx.sources.at(-1)!.starts[0]![0]).toBeCloseTo(now + 0.1 + 2.5, 9);
  });

  it("the night ends after the closing: stopped with reason, ended event, History log counts", async () => {
    const events: EngineEvent[] = [];
    const p = set();
    p.tandas = p.tandas.slice(0, 1);
    const e = engineFor(ctx, build(p), fakeAdapter(), events);
    await e.start();
    await e.play();
    let t = 0;
    for (let i = 0; i < 4; i++) {
      t = ctx.sources[i]!.endsAt!;
      ctx.advance(t);
      await flush();
    }
    expect(e.state).toBe("stopped");
    expect(events.some((x) => x.type === "ended")).toBe(true);
    const log = makeNightLog({ ...e.snapshot(), ended: true, now: 1_000_000 + t * 1000 });
    expect(log.itemsPlayed).toBe(4);
    expect(log.holds).toBe(0);
    // a 16 s run is logged as rehearsed, never as "played 0:00 h" (round8-ux.md §2 History)
    expect(nightLogSummary(log)).toMatch(/^rehearsed \d\d:\d\d$/);
  });

  it("master and mute use a 20 ms time constant; the test tone is −20 dBFS for 0.5 s", async () => {
    const e = engineFor(ctx, build(set()));
    e.setMaster(-6);
    expect(ctx.gains[0]!.gain.of("setTargetAtTime").at(-1)!.args).toEqual([dbToGain(-6), 0, 0.02]);
    e.setMuted(true);
    expect(ctx.gains[0]!.gain.of("setTargetAtTime").at(-1)!.args[0]).toBe(0);
    e.testTone(); // no createOscillator on the fake: a no-op, never a throw
  });
});

/* ---------- round 20: pause / resume, fades the DJ can use, stop with a fade, audible defaults ---------- */
describe("round 20: transport and fades (round20-booth.md)", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });

  it("defaults are audible: master at unity, nothing muted or ducked, the cortina fader up, no song fade", () => {
    const e = engineFor(ctx, build(set()));
    expect(DEFAULT_BOOTH_SETTINGS.songFadeOutSec).toBe(0);
    expect(DEFAULT_BOOTH_SETTINGS.pauseFadeSec).toBeGreaterThanOrEqual(0.5);
    expect(DEFAULT_BOOTH_SETTINGS.pauseFadeSec).toBeLessThanOrEqual(1);
    expect(e.masterDb).toBe(0);
    expect(e.muted).toBe(false);
    expect(e.ducked).toBe(false);
    expect(e.cortinaFader).toBe(1);
    // the master gain was never automated below unity at construction
    expect(ctx.gains[0]!.gain.value).toBe(1);
    expect(ctx.gains[0]!.gain.calls.filter((c) => (c.args[0] as number) < 1)).toEqual([]);
    expect(e.outputGain()).toBe(1);
  });

  it("an unmeasured track plays at 0 dB: the item gain ramps to 1 at its start", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    expect(e.current?.gainDb).toBe(0);
    const g = ctx.gains[1]!.gain;
    expect(g.of("linearRampToValueAtTime")[0]!.args[0]).toBe(1);
  });

  it("the context is resumed when the OS suspends or interrupts it while the night plays (Bluetooth, a call)", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    const before = ctx.resumes;
    ctx.state = "interrupted";
    ctx.emit("statechange");
    expect(ctx.resumes).toBe(before + 1);
    // idle: nothing to keep alive
    e.stop();
    ctx.state = "suspended";
    ctx.emit("statechange");
    expect(ctx.resumes).toBe(before + 1);
  });

  it("pause fades the running song out in pauseFadeSec and keeps its position; resume fades it back in from there", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play(); // a1 at 0.05, a2 queued at 172.55
    const queued = ctx.sources[1]!;
    ctx.advance(60.05);
    e.pause();
    expect(e.state).toBe("paused");
    expect(e.paused).toBe(true);
    const fade = DEFAULT_BOOTH_SETTINGS.pauseFadeSec;
    const g = ctx.gains[1]!.gain;
    const tgt = g.of("setTargetAtTime").at(-1)!;
    expect(tgt.args[0]).toBe(0);
    expect(tgt.args[1]).toBe(60.05);
    expect(ctx.sources[0]!.stops.at(-1)).toBeCloseTo(60.05 + fade, 9);
    // the queued item never sounds
    expect(queued.stops.at(-1)).toBe(60.05);
    expect(e.position()).toBeCloseTo(60, 6);
    // the fade-out's end does not advance the night
    ctx.advance(62);
    await flush();
    expect(e.state).toBe("paused");
    expect(e.planIndex).toBe(0);
    // resume: the same song from 60 s, a fade in from 0, the next one at its gap after the rest of the song
    ctx.advance(100);
    await e.play();
    expect(e.state).toBe("playing");
    expect(e.paused).toBe(false);
    const again = ctx.sources[2]!;
    expect(again.starts[0]![0]).toBeCloseTo(100.05, 9);
    expect(again.starts[0]![1]).toBeCloseTo(60, 6);
    // the clock carries on from the pause point (it never jumps back to 0:00)
    expect(e.position()).toBeCloseTo(59.95, 6);
    ctx.advance(101);
    expect(e.position()).toBeCloseTo(60.95, 6);
    const rg = ctx.gains.at(-2)!.gain; // the resumed item (the last gain is the item queued after it)
    expect(rg.of("setValueAtTime")[0]!.args).toEqual([0, 100.05]);
    const rampIn = rg.of("linearRampToValueAtTime")[0]!;
    expect(rampIn.args[0]).toBe(1);
    expect(rampIn.args[1]).toBeCloseTo(100.05 + fade, 9);
    expect(ctx.sources[3]!.starts[0]![0]).toBeCloseTo(100.05 + 110 + 2.5, 6);
    // the log says pause / resume; a pause is not a hold in History
    const log = e.log.map((l) => `${l.to}:${l.reason ?? ""}`);
    expect(log).toContain("paused:pause");
    expect(log).toContain("playing:resume");
    expect(makeNightLog({ ...e.snapshot(), ended: false }).holds).toBe(0);
  });

  it("stop takes a fade length: 3 s 'fade out and stop', a 0.1 s 'stop now'", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    ctx.advance(20);
    e.stop("stop", 3);
    const g = ctx.gains[1]!.gain;
    const c = g.of("setValueCurveAtTime").at(-1)!;
    expect(c.args[1]).toBe(20);
    expect(c.args[2]).toBe(3);
    expect(ctx.sources[0]!.stops.at(-1)).toBe(23);
    expect(e.state).toBe("stopped");
    await e.play();
    ctx.advance(30);
    e.stop("stop", 0.1);
    expect(ctx.sources.at(-2)!.stops.at(-1)).toBeCloseTo(30.1, 9);
  });

  it("fade out now: the running song fades over N s, the next item follows at the gap after the silence", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    ctx.advance(30);
    e.fadeOutNow(4);
    const g = ctx.gains[1]!.gain;
    const c = g.of("setValueCurveAtTime").at(-1)!;
    expect(c.args[1]).toBe(30);
    expect(c.args[2]).toBe(4);
    expect((c.args[0] as Float32Array).at(-1)).toBe(0);
    expect(ctx.sources[0]!.stops.at(-1)).toBe(34);
    expect(ctx.sources[1]!.stops.at(-1)).toBe(30); // the queued a2 at its old time is dropped
    await flush();
    expect(ctx.sources.at(-1)!.starts[0]![0]).toBeCloseTo(34 + 2.5, 9);
    expect(e.state).toBe("playing");
    expect(e.log.at(-1)!.reason).toBe("fade out now");
    ctx.advance(34);
    await flush();
    expect(e.planIndex).toBe(1);
  });

  it("next with crossfade: the next item starts now while the running one fades out over N s", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    ctx.advance(40);
    await e.crossfadeNext(3);
    const old = ctx.sources[0]!;
    expect(old.stops.at(-1)).toBe(43);
    const c = ctx.gains[1]!.gain.of("setValueCurveAtTime").at(-1)!;
    expect(c.args[1]).toBe(40);
    expect(c.args[2]).toBe(3);
    expect(e.planIndex).toBe(1);
    const inc = ctx.sources.find(
      (s, k) => k > 0 && s.starts[0]?.[0] !== undefined && Math.abs(s.starts[0]![0]! - 40.05) < 1e-9,
    );
    expect(inc).toBeDefined();
    // the old one ending does not advance the night a second time
    ctx.advance(43);
    await flush();
    expect(e.planIndex).toBe(1);
    expect(e.state).toBe("playing");
    // the item after the incoming one is queued at its gap
    expect(ctx.sources.at(-1)!.starts[0]![0]).toBeCloseTo(40.05 + 170 + 2.5, 6);
  });

  it("Stop now right after a crossfade silences the outgoing item too (it is no longer current)", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    ctx.advance(40);
    await e.crossfadeNext(3);
    const old = ctx.sources[0]!;
    ctx.currentTime = 41;
    e.stop("stop", 0.1);
    expect(old.stops.at(-1)).toBeCloseTo(41.1, 9);
    const c = ctx.gains[1]!.gain.of("setValueCurveAtTime").at(-1)!;
    expect(c.args[1]).toBe(41);
    expect(c.args[2]).toBeCloseTo(0.1, 9);
  });

  it("song end fade: 0 by default (declick only); a night setting fades every track's last N s", async () => {
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    expect(ctx.gains[1]!.gain.of("setValueCurveAtTime")).toHaveLength(0);
    const ctx2 = new FakeCtx();
    const e2 = engineFor(ctx2, build(set()));
    e2.setSettings({ songFadeOutSec: 3 });
    await e2.start();
    await e2.play();
    const c = ctx2.gains[1]!.gain.of("setValueCurveAtTime")[0]!;
    expect(c.args[1]).toBeCloseTo(0.05 + 170 - 3, 9);
    expect(c.args[2]).toBe(3);
  });

  it("talk-over: ducking dips the master 12 dB and back with a 0.5 s ramp", () => {
    const e = engineFor(ctx, build(set()));
    e.setDucked(true);
    const t = ctx.gains[0]!.gain.of("setTargetAtTime").at(-1)!;
    expect(t.args[0]).toBeCloseTo(dbToGain(-12), 9);
    expect(t.args[2]).toBeCloseTo(0.5 / 3, 9);
    e.setDucked(false);
    expect(ctx.gains[0]!.gain.of("setTargetAtTime").at(-1)!.args[0]).toBe(1);
  });

  it("Spotify: pause fades with volume steps and resume restarts the track at its position", async () => {
    const starts: ExternalStart[] = [];
    const stops: number[] = [];
    let pos = 0;
    const handle = (r: ExternalStart): ExternalHandle => ({
      cancel() {},
      stop(f) {
        stops.push(f);
        r.onEnded();
      },
      position: () => pos,
    });
    const sp: SourceAdapter = {
      kind: "spotify",
      async available() {
        return { ok: true };
      },
      async resolve() {
        return "ready";
      },
      async prepare(item) {
        return { kind: "spotify", spotifyUri: `spotify:track:${item.id}`, durationSec: item.lengthSec };
      },
      release() {},
      external: {
        capabilities: { fade: true },
        startItem(r) {
          starts.push(r);
          return handle(r);
        },
        setMaster() {},
      },
    };
    const plan = build(set());
    const e = new BoothEngine(ctx, { adapters: [sp], now: () => 1_000_000 + ctx.currentTime * 1000 });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "spotify"),
    );
    await e.start();
    await e.play();
    pos = 42;
    e.pause();
    expect(stops.at(-1)).toBe(DEFAULT_BOOTH_SETTINGS.pauseFadeSec);
    expect(e.state).toBe("paused");
    expect(e.planIndex).toBe(0);
    await e.play();
    const r = starts.at(-2)!; // the resumed a1 (a2 is queued after it)
    expect(r.uri).toBe("spotify:track:a1");
    expect(r.positionSec).toBeCloseTo(42, 6);
    expect(r.fadeInSec).toBe(DEFAULT_BOOTH_SETTINGS.pauseFadeSec);
  });

  it("2026-11: YouTube plays through the same external-player path: its id, the plan's gap, a failure moves on", async () => {
    const starts: ExternalStart[] = [];
    const yt: SourceAdapter = {
      kind: "youtube",
      async available() {
        return { ok: true };
      },
      async resolve() {
        return "ready";
      },
      async prepare(item) {
        return {
          kind: "youtube",
          externalUri: `youtube:video:${item.id}xxxxxx`,
          durationSec: item.lengthSec,
        };
      },
      release() {},
      external: {
        capabilities: { fade: false, volume: false, gain: false },
        startItem(r) {
          starts.push(r);
          return { cancel() {}, stop: () => r.onEnded(), position: () => 0 };
        },
        setMaster() {},
      },
    };
    const plan = build(set());
    const e = new BoothEngine(ctx, { adapters: [yt], now: () => 1_000_000 + ctx.currentTime * 1000 });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "youtube"),
    );
    await e.start();
    await e.play();
    expect(starts[0]!.uri).toBe("youtube:video:a1xxxxxx");
    // the next item is queued after the first one's length plus the night's gap
    const first = plan.items[0]!.lengthSec;
    expect(starts[1]!.delaySec).toBeGreaterThanOrEqual(first);
    // a video YouTube refuses: the banner says YouTube and the night moves on to the queued item
    starts[0]!.onError("removed");
    expect(e.planIndex).toBe(1);
  });

  it("a cortina edited while it is queued is rebuilt with its new stop second and fades (replacePlan)", async () => {
    const p = set();
    const plan = build(p);
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    ctx.advance(0.05 + 170); // a2 plays, c0 queued
    await flush();
    const queued = ctx.sources.at(-1)!;
    expect(queued.starts[0]![2]).toBe(45);
    const edited = build(p, { cortinaEdits: { c0: { stopSec: 30, fadeOutSec: 6 } } });
    e.replacePlan(
      edited,
      edited.items.map(() => null),
      edited.items.map(() => "file"),
    );
    await flush();
    expect(queued.stops.at(-1)).toBe(ctx.currentTime);
    const again = ctx.sources.at(-1)!;
    expect(again).not.toBe(queued);
    expect(again.starts[0]![2]).toBe(20); // 30 − cue-in 10
    const curve = ctx.gains.at(-2)!.gain.of("setValueCurveAtTime").at(-1)!;
    expect(curve.args[2]).toBe(6);
  });
});

describe("round 21: a tapped row plays — Play now (with a fade) and Play next", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });
  it("Play now: the running item fades out and the tapped item becomes the current one; the night continues from it", async () => {
    const plan = build(set({ thirdTanda: true }));
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    expect(e.planIndex).toBe(0);
    const target = plan.items.findIndex((it) => it.id === "d1");
    await e.playNow(target, 2);
    expect(e.state).toBe("playing");
    expect(e.planIndex).toBe(target);
    expect(e.current?.planIndex).toBe(target);
    // the next queued item follows the tapped one
    expect(e.nextPlayable(target)).toBe(target + 1);
  });
  it("Play next: the tapped item follows the running one at the gap, then the night continues from it", async () => {
    const plan = build(set({ thirdTanda: true }));
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    const target = plan.items.findIndex((it) => it.id === "d2");
    e.playNext(target);
    await flush();
    // the tapped item is the queued one (the forced pointer is spent once it is queued)
    expect((e as unknown as { queued: { planIndex: number } | null }).queued?.planIndex).toBe(target);
    ctx.advance(0.05 + 170);
    await flush();
    expect(e.planIndex).toBe(target);
    expect(e.forcedNext).toBeNull();
  });
  it("a bypassed tanda is passed over (its tracks and the cortina after it); the export plan keeps it", async () => {
    const p = set({ thirdTanda: true });
    const plan = build(p);
    const e = engineFor(ctx, plan);
    const q = { ...p, tandas: p.tandas.map((t, i) => (i === 1 ? { ...t, bypass: true } : t)) };
    const by = bypassPlanItems(q, plan.items);
    e.setBypass(by);
    const lastOf1 = plan.items.findLastIndex((it) => it.tanda === 1);
    const firstOf3 = plan.items.findIndex((it) => it.tanda === 3);
    expect(e.nextPlayable(lastOf1)).toBe(firstOf3);
    expect(plan.items.length).toBe(build(q).items.length);
  });
  it("Play the rest, then La Cumparsita: the running tanda finishes, then the closing; Jump now plays it at once", async () => {
    const plan = build(set({ thirdTanda: true }));
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    await e.jumpToClosing(false);
    const c = plan.items.length - 1;
    expect(e.nextPlayable(0)).toBe(1);
    expect(e.nextPlayable(1)).toBe(c);
    await e.jumpToClosing(true);
    expect(e.planIndex).toBe(c);
  });
  it("before the night: Play now arms the tapped item and starts it", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.playNow(3);
    expect(e.planIndex).toBe(3);
    expect(e.state === "playing" || e.state === "cortina").toBe(true);
  });
});

describe("wave 2: a skipped tanda leaves the plan; a missing item is explained", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });
  it("time to La Cumparsita and the remaining time leave out a tanda skipped tonight and its cortina", () => {
    const p = set({ thirdTanda: true });
    const plan = build(p);
    const e = engineFor(ctx, plan);
    const before = e.remaining();
    const q = { ...p, tandas: p.tandas.map((t, i) => (i === 1 ? { ...t, bypass: true } : t)) };
    const by = bypassPlanItems(q, plan.items);
    e.setBypass(by);
    const after = e.remaining();
    const out = by.reduce((s, i) => s + plan.items[i]!.lengthSec + plan.items[i]!.gapAfterSec, 0);
    expect(out).toBeGreaterThan(0);
    expect(before.remainingSec - after.remainingSec).toBeCloseTo(out, 3);
    expect(before.timeToCumparsita - after.timeToCumparsita).toBeCloseTo(out, 3);
  });
  it("an item with nothing to play is passed over in plain words, with the reason the booth gives", async () => {
    const plan = build(set());
    const events: EngineEvent[] = [];
    const base = fakeAdapter();
    const adapter: SourceAdapter = {
      ...base,
      async prepare(item, ent) {
        if (item.id === "a1") throw new Error("No source");
        return base.prepare(item, ent);
      },
    };
    const e = new BoothEngine(ctx, {
      adapters: [adapter],
      onEvent: (ev) => events.push(ev),
      now: () => 1_000_000,
      whyMissing: () => "the rehearsal has no 30 s clip of this recording",
    });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "file"),
    );
    await e.start();
    const b = events.find((x) => x.type === "banner") as { text: string } | undefined;
    expect(b?.text).toBe(
      "a1 is passed over: the rehearsal has no 30 s clip of this recording. The night moves on to the next song.",
    );
    expect(b?.text).not.toMatch(/\(skipped\)|No source/);
  });
});

/* ---------- wave 4: the DJ's edited transitions ---------- */
class FakeBiquad {
  type = "peaking";
  frequency = new FakeParam();
  gain = new FakeParam();
  connect() {}
  disconnect() {}
}
class EqCtx extends FakeCtx {
  filters: FakeBiquad[] = [];
  createBiquadFilter() {
    const f = new FakeBiquad();
    this.filters.push(f);
    return f;
  }
}
const tKey = (a: string, b: string) => `${a}→${b}`;

describe("wave 4: edited transitions in the engine", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });

  it("a blend: the next song starts overlapSec before the end; both gains follow setValueCurveAtTime curves", async () => {
    const plan = build(set(), { transitions: { [tKey("a1", "a2")]: { preset: "blend", overlapSec: 6 } } });
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    await flush();
    const end = 0.05 + 170;
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(end - 6, 9);
    const out = ctx.gains[1]!.gain.of("setValueCurveAtTime").at(-1)!;
    expect(out.args[1]).toBeCloseTo(end - 6, 9);
    expect(out.args[2]).toBeCloseTo(6, 9);
    expect((out.args[0] as Float32Array).at(-1)).toBe(0);
    const inn = ctx.gains[2]!.gain.of("setValueCurveAtTime")[0]!;
    expect(inn.args[1]).toBeCloseTo(end - 6, 9);
    expect((inn.args[0] as Float32Array)[0]).toBe(0);
    // the remaining time counts the overlap once: the plan's clock
    expect(e.remaining().remainingSec).toBeCloseTo(plan.wallClockSec, 0);
  });

  it("a gap edit replaces the night's gap for that transition only", async () => {
    const plan = build(set(), { transitions: { [tKey("a1", "a2")]: { preset: "gap", gapSec: 4.5 } } });
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 170 + 4.5, 9);
    ctx.advance(0.05 + 170);
    await flush();
    // a2 → cortina keeps the night's 2.5 s
    expect(ctx.sources[2]!.starts[0]![0]).toBeCloseTo(0.05 + 170 + 4.5 + 170 + 2.5, 9);
  });

  it("a cortina cut: the cortina's fade ends at its stop second with the edited length, then the edited gap", async () => {
    const plan = build(set(), {
      transitions: { [tKey("c0", "b1")]: { preset: "cortinaCut", fadeOutSec: 6, gapSec: 1.5 } },
    });
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    ctx.advance(0.05 + 170);
    await flush();
    ctx.advance(0.05 + 170 + 2.5 + 170);
    await flush();
    const c = ctx.sources[2]!;
    const item = plan.items[2]!;
    expect(item.fadeOutSec).toBe(6);
    const cg = ctx.gains.filter((g) => g.gain.of("setValueCurveAtTime").length).at(-1)!;
    const fade = cg.gain.of("setValueCurveAtTime").at(-1)!;
    expect((fade.args[1] as number) + (fade.args[2] as number)).toBeCloseTo(c.endsAt!, 6);
    expect(fade.args[2]).toBeCloseTo(6, 6);
    expect(ctx.sources[3]!.starts[0]![0]).toBeCloseTo(c.endsAt! + 1.5, 6);
  });

  it("the bass swap: each item gets a lowshelf and a highshelf; at the centre the outgoing loses its lows", async () => {
    const eq = new EqCtx();
    const plan = build(set(), {
      transitions: { [tKey("a1", "a2")]: { preset: "blend", overlapSec: 8, bassSwap: true } },
    });
    const e = engineFor(eq, plan);
    await e.start();
    await e.play();
    await flush();
    expect(eq.filters.map((f) => f.type)).toEqual(["lowshelf", "highshelf", "lowshelf", "highshelf"]);
    const end = 0.05 + 170;
    const outLow = eq.filters[0]!.gain.of("linearRampToValueAtTime").at(-1)!;
    expect(outLow.args).toEqual([-24, expect.closeTo(end - 4, 6)]);
    const inLow = eq.filters[2]!.gain;
    expect(inLow.of("setValueAtTime")[0]!.args[0]).toBe(-24);
    expect(inLow.of("linearRampToValueAtTime").at(-1)!.args).toEqual([0, expect.closeTo(end - 4, 6)]);
  });

  it("Hold before the transition gives the running song its own end back (no fade, its natural stop)", async () => {
    const plan = build(set(), {
      transitions: { [tKey("a1", "a2")]: { preset: "blend", overlapSec: 6, fadeOutSec: 3 } },
    });
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    await flush();
    const end = 0.05 + 170;
    // the blend's outgoing stops once its 3 s fade is through
    expect(ctx.sources[0]!.stops.at(-1)).toBeCloseTo(end - 3, 6);
    e.hold();
    const g = ctx.gains[1]!.gain;
    expect(g.of("linearRampToValueAtTime").at(-1)!.args).toEqual([0, expect.closeTo(end, 6)]);
    expect(e.current?.endsAt).toBeCloseTo(end, 6);
  });

  it("a transition only joins plan neighbours: with the next song skipped, the night's gap applies", async () => {
    const plan = build(set(), { transitions: { [tKey("a1", "a2")]: { preset: "blend", overlapSec: 6 } } });
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    e.next(); // a2 is left out: c0 follows a1 at the gap
    await flush();
    const q = ctx.sources.at(-1)!;
    expect(q.starts[0]![0]).toBeCloseTo(0.05 + 170 + 2.5, 9);
  });
});

/* ---------- 2026-11: start from any row, Previous / Next now, seek inside the song ---------- */
describe("seek: start from a row, Previous / Next now, seek inside the song", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });
  const idx = (plan: BoothRows, id: string) => plan.items.findIndex((it) => it.id === id);
  const withSources = (plan: BoothRows, missing: number[] = []) => {
    const e = new BoothEngine(ctx, {
      adapters: [fakeAdapter()],
      now: () => 1_000_000 + ctx.currentTime * 1000,
    });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map((_, i) => (missing.includes(i) ? "missing" : "file")),
    );
    return e;
  };
  const bypassSecond = (p: Playlist, plan: BoothRows) =>
    bypassPlanItems(
      { ...p, tandas: p.tandas.map((t, i) => (i === 1 ? { ...t, bypass: true } : t)) },
      plan.items,
    );
  const firstCortina = (plan: BoothRows) => plan.items.findIndex((it, i) => i > 0 && it.kind === "cortina");

  it("start from index: select(i) before the night, then start + play begins at i (not item 0)", async () => {
    const plan = build(set({ thirdTanda: true }));
    const e = engineFor(ctx, plan);
    const b2 = idx(plan, "b2");
    expect(e.select(b2)).toBe(true);
    expect(e.state).toBe("idle");
    expect(e.planIndex).toBe(b2);
    await e.start();
    await e.play();
    expect(e.current?.planIndex).toBe(b2);
    expect(e.state).toBe("playing");
    expect(e.nextPlayable(b2)).toBe(b2 + 1);
    expect(e.log.some((l) => l.reason === "select" && l.planIndex === b2)).toBe(true);
  });

  it("select refuses a row that cannot play (missing, bypassed) and never moves a sounding night", async () => {
    const p = set({ thirdTanda: true });
    const plan = build(p);
    const a2 = idx(plan, "a2");
    const e = withSources(plan, [a2]);
    expect(e.select(a2)).toBe(false);
    e.setBypass(bypassSecond(p, plan));
    expect(e.select(idx(plan, "b1"))).toBe(false);
    expect(e.planIndex).toBe(0);
    await e.start();
    await e.play();
    expect(e.select(idx(plan, "d1"))).toBe(false);
    expect(e.current?.planIndex).toBe(0);
  });

  it("Next now: the next playable item starts at once, passing over missing and bypassed rows", async () => {
    const p = set({ thirdTanda: true });
    const plan = build(p);
    const e = withSources(plan, [idx(plan, "a2")]);
    e.setBypass(bypassSecond(p, plan));
    await e.start();
    await e.play();
    expect(e.current?.planIndex).toBe(0);
    await e.nextNow();
    expect(e.current?.planIndex).toBe(firstCortina(plan));
    await e.nextNow();
    expect(e.current?.planIndex).toBe(idx(plan, "d1"));
    expect(e.state).toBe("playing");
  });

  it("Previous: more than 3 s in restarts the item; under 3 s goes back, over missing and bypassed rows", async () => {
    const p = set({ thirdTanda: true });
    const plan = build(p);
    const e = withSources(plan, [idx(plan, "a2")]);
    e.setBypass(bypassSecond(p, plan));
    const d1 = idx(plan, "d1");
    expect(e.select(d1)).toBe(true);
    await e.start();
    await e.play();
    const n0 = ctx.sources.length;
    ctx.advance(10);
    await e.previous();
    expect(e.current?.planIndex).toBe(d1);
    expect(ctx.sources.length).toBeGreaterThan(n0);
    expect(e.position()).toBeLessThan(1);
    ctx.advance(ctx.currentTime + 1.5);
    await e.previous();
    expect(e.current?.planIndex).toBe(firstCortina(plan));
    await e.previous();
    expect(e.current?.planIndex).toBe(0);
    // nothing before the first item: it restarts
    await e.previous();
    expect(e.current?.planIndex).toBe(0);
  });

  it("before the night Previous / Next move the selection without starting anything", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.nextNow();
    expect(e.planIndex).toBe(1);
    expect(e.state).toBe("idle");
    expect(ctx.sources.length).toBe(0);
    await e.previous();
    expect(e.planIndex).toBe(0);
    await e.previous();
    expect(e.planIndex).toBe(0);
  });

  it("seek: the item restarts at the new offset; its end, its end fade and the next item's start follow", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    e.setSettings({ songFadeOutSec: 3 });
    await e.start();
    await e.play();
    await flush();
    ctx.advance(20);
    const before = e.remaining().remainingSec;
    await e.seek(100);
    await flush();
    const src = ctx.sources.find((s) => s.starts.some(([, off]) => (off ?? 0) >= 99));
    expect(src).toBeDefined();
    const [when, offset, dur] = src!.starts[0]!;
    expect(offset).toBeCloseTo(100, 3);
    expect(dur).toBeCloseTo(70, 3);
    expect(e.current!.endsAt).toBeCloseTo(when! + 70, 3);
    expect(e.position()).toBeCloseTo(100 - (when! - 20), 2);
    const q = (e as unknown as { queued: { planIndex: number; when: number } | null }).queued;
    expect(q?.planIndex).toBe(1);
    expect(q!.when).toBeCloseTo(e.current!.endsAt + DEFAULT_BOOTH_SETTINGS.gapSec, 3);
    // the end fade is still there and ends at the new end
    const curve = ctx.gains
      .flatMap((g) => g.gain.of("setValueCurveAtTime"))
      .find((c) => Math.abs((c.args[1] as number) + (c.args[2] as number) - e.current!.endsAt) < 1e-3);
    expect(curve?.args[2]).toBeCloseTo(3, 6);
    // 20 s in → 100 s in: the night has 80 s less to go
    expect(before - e.remaining().remainingSec).toBeCloseTo(80, 0);
  });

  it("seek while paused: Resume starts from the new point", async () => {
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    ctx.advance(10);
    e.pause();
    await e.seek(50);
    expect(e.position()).toBeCloseTo(50, 6);
    await e.play();
    const src = ctx.sources.at(-2)!;
    expect(src.starts[0]![1]).toBeCloseTo(50, 6);
  });

  it("seek on Spotify: play again with the new position (position_ms), the old play cancelled", async () => {
    const starts: ExternalStart[] = [];
    let cancelled = 0;
    const sp: SourceAdapter = {
      kind: "spotify",
      async available() {
        return { ok: true };
      },
      async resolve() {
        return "ready";
      },
      async prepare(item) {
        return { kind: "spotify", spotifyUri: `spotify:track:${item.id}`, durationSec: item.lengthSec };
      },
      release() {},
      external: {
        capabilities: { fade: true },
        startItem(r) {
          starts.push(r);
          return {
            cancel() {
              cancelled++;
            },
            stop() {},
            position: () => r.positionSec,
          };
        },
        setMaster() {},
      },
    };
    const plan = build(set());
    const e = new BoothEngine(ctx, { adapters: [sp], now: () => 1_000_000 });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "spotify"),
    );
    await e.start();
    await e.play();
    await e.seek(60);
    expect(cancelled).toBeGreaterThan(0);
    const r = starts.find((s) => s.uri === "spotify:track:a1" && s.positionSec > 0)!;
    expect(r.positionSec).toBeCloseTo(60, 6);
    expect(r.durationSec).toBeCloseTo(110, 6);
    expect(e.position()).toBeCloseTo(60, 6);
    // a jump: Play now calls play with the new uri at position 0
    await e.playNow(idx(plan, "b1"));
    const j = starts.at(-2)!;
    expect(j.uri).toBe("spotify:track:b1");
    expect(j.positionSec).toBe(0);
  });

  it("a start point (cue in) plays from there; a seek counts from it", async () => {
    const plan = build(set(), { songCues: { a1: { inSec: 12 } } } as never);
    const a1 = plan.items[idx(plan, "a1")]!;
    expect(a1.cued).toBe(true);
    expect(a1.trimInSec).toBe(12);
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    expect(ctx.sources[0]!.starts[0]![1]).toBeCloseTo(12, 6);
    await e.seek(30);
    const last = ctx.sources.find((s) => s.starts.some(([, off]) => (off ?? 0) > 40))!;
    expect(last.starts[0]![1]).toBeCloseTo(42, 6);
  });
});

/* ---------- 2026-11: a cortina starts at its chorus (the owner: "dancers don't recognise them") ---------- */
describe("2026-11: the booth plays a cortina from its start point (its chorus)", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });
  /** the set with every cortina's chorus at 64.5 s of a 278 s recording */
  const hooked = (): Playlist => {
    const p = set();
    return {
      ...p,
      tandas: p.tandas.map((t) => ({
        ...t,
        cortina: t.cortina
          ? {
              ...t.cortina,
              startSec: 64.5,
              spotify: { uri: `spotify:track:${t.cortina.id}`, durationMs: 277916 },
            }
          : null,
      })),
    };
  };
  const firstCortina = (plan: BoothRows) => plan.items.findIndex((it) => it.kind === "cortina");
  const startAtCortina = async (e: BoothEngine, plan: BoothRows) => {
    expect(e.select(firstCortina(plan))).toBe(true);
    await e.start();
    await e.play();
    await flush();
  };

  it("the plan: trimIn = the chorus, the night's length plays from there, a short fade in", () => {
    const plan = build(hooked());
    const c = plan.items[firstCortina(plan)]!;
    expect(c.trimInSec).toBe(64.5);
    expect(c.lengthSec).toBe(45);
    expect(c.stopSec).toBe(109.5);
    expect(c.fadeInSec).toBeGreaterThan(0);
    expect(c.fadeInSec).toBeLessThanOrEqual(1);
  });

  it("a file: start(when, 64.5, 45), a fade in from the chorus and the fade out ending at the stop", async () => {
    const plan = build(hooked());
    const e = engineFor(ctx, plan);
    await startAtCortina(e, plan);
    const [when, offset, dur] = ctx.sources[0]!.starts[0]!;
    expect(offset).toBeCloseTo(64.5, 6);
    expect(dur).toBeCloseTo(45, 6);
    expect(e.state).toBe("cortina");
    const curves = ctx.gains.flatMap((g) => g.gain.of("setValueCurveAtTime"));
    // the fade in starts at the chorus (≤ 1 s), the fade out ends at the stop
    expect(curves.some((c) => c.args[1] === when && (c.args[2] as number) <= 1)).toBe(true);
    expect(
      curves.some((c) => Math.abs((c.args[1] as number) + (c.args[2] as number) - (when! + 45)) < 1e-6),
    ).toBe(true);
  });

  it("a file shorter than chorus + length: the start is pulled back so the cortina ends at the file's end", async () => {
    const plan = build(hooked());
    const adapter = fakeAdapter();
    adapter.prepare = async () => ({ kind: "file", buffer: buffer(90), durationSec: 90 });
    const e = engineFor(ctx, plan, adapter);
    await startAtCortina(e, plan);
    const [, offset, dur] = ctx.sources[0]!.starts[0]!;
    expect(offset).toBeCloseTo(45, 6);
    expect(dur).toBeCloseTo(45, 6);
  });

  it("a 30 s clip (Deezer's highlight, offset unknown) plays from its own start, never 1 s of its tail", async () => {
    const plan = build(hooked());
    const adapter = fakeAdapter();
    adapter.prepare = async () => ({ kind: "preview", buffer: buffer(30), durationSec: 30 });
    const e = engineFor(ctx, plan, adapter);
    await startAtCortina(e, plan);
    const [, offset, dur] = ctx.sources[0]!.starts[0]!;
    expect(offset).toBe(0);
    expect(dur).toBeCloseTo(30, 6);
  });

  it("the audio fallback: a cortina the lyrics could not place starts at its full file's loud part", async () => {
    // a 120 s file: quiet 0–40 s, loud from 40 s
    const rate = 8000;
    const data = new Float32Array(rate * 120).map((_, i) => (i < rate * 40 ? 0.05 : 0.6) * Math.sin(i / 3));
    const file = {
      duration: 120,
      length: data.length,
      sampleRate: rate,
      numberOfChannels: 1,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
    const adapter = fakeAdapter();
    adapter.prepare = async () => ({ kind: "file", buffer: file, durationSec: 120 });
    const s = set();
    const unplaced: Playlist = {
      ...s,
      tandas: s.tandas.map((t) => ({ ...t, cortina: t.cortina ? { ...t.cortina, startSec: 0 } : null })),
    };
    const plan = build(unplaced);
    const e = new BoothEngine(ctx, {
      adapters: [adapter],
      now: () => 1_000_000,
      audioHook: (it) => it.kind === "cortina",
    });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "file"),
    );
    await startAtCortina(e, plan);
    const [, offset] = ctx.sources[0]!.starts[0]!;
    expect(offset).toBeGreaterThan(36);
    expect(offset).toBeLessThan(41);
  });

  it("Spotify: play with position_ms at the chorus (positionSec = 64.5) for the cortina's length", async () => {
    const starts: ExternalStart[] = [];
    const sp: SourceAdapter = {
      kind: "spotify",
      async available() {
        return { ok: true };
      },
      async resolve() {
        return "ready";
      },
      async prepare(item) {
        return { kind: "spotify", spotifyUri: `spotify:track:${item.id}`, durationSec: item.lengthSec };
      },
      release() {},
      external: {
        capabilities: { fade: true },
        startItem(r) {
          starts.push(r);
          return { cancel() {}, stop() {}, position: () => r.positionSec };
        },
        setMaster() {},
      },
    };
    const plan = build(hooked());
    const e = new BoothEngine(ctx, { adapters: [sp], now: () => 1_000_000 });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "spotify"),
    );
    await startAtCortina(e, plan);
    const r = starts.find((x) => x.uri === "spotify:track:c0")!;
    expect(r.positionSec).toBeCloseTo(64.5, 6);
    expect(r.durationSec).toBeCloseTo(45, 6);
    expect(r.fadeInSec).toBeGreaterThan(0);
  });
});

/* ---------- 2026-11: a side's own silence counts as the gap (the owner: "some songs play a lot of silent moments") ---------- */
describe("2026-11: silence modes in the engine (silence counts as the gap / gap after the music / off)", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });
  type Spec = Record<string, { dur?: number; head?: number; tail?: number }>;
  /** files of `dur` (170 s by default, 180 the closing) with a measured silent head / tail per id */
  const silentFiles = (spec: Spec): SourceAdapter => ({
    kind: "file",
    async available() {
      return { ok: true };
    },
    async resolve() {
      return "ready";
    },
    async prepare(item): Promise<PreparedItem> {
      if (item.kind === "cortina") {
        const d = (item.stopSec ?? 45) + 30;
        return { kind: "file", buffer: buffer(d), durationSec: d };
      }
      const s = spec[item.id ?? ""] ?? {};
      const dur = s.dur ?? (item.kind === "closing" ? 180 : 170);
      return {
        kind: "file",
        buffer: buffer(dur),
        durationSec: dur,
        measured: {
          lufs: -16,
          peakDbFS: -3,
          introSec: 0,
          headSilenceSec: s.head ?? 0,
          tailSilenceSec: s.tail ?? 0,
        },
      };
    },
    release() {},
  });
  const measurementsOf = (spec: Spec) =>
    Object.fromEntries(
      Object.entries(spec).map(([id, s]) => [
        id,
        { lufs: -16, headSilenceSec: s.head ?? 0, tailSilenceSec: s.tail ?? 0 },
      ]),
    );
  const run = async (spec: Spec, mode: "gap" | "after" | "off", extra: Parameters<typeof build>[1] = {}) => {
    const plan = build(set(), { silenceMode: mode, measurements: measurementsOf(spec), ...extra });
    const e = engineFor(ctx, plan, silentFiles(spec));
    await e.start();
    await e.play();
    await flush();
    return { e, plan };
  };
  /** what the room hears between a1's last audible moment and a2's first */
  const heard = (spec: Spec) => {
    const a1 = ctx.sources[0]!;
    const a2 = ctx.sources[1]!;
    const [w1, o1] = a1.starts[0]!;
    const [w2, o2] = a2.starts[0]!;
    const audibleEnd = (w1 ?? 0) + ((spec.a1?.dur ?? 170) - (spec.a1?.tail ?? 0) - (o1 ?? 0));
    const audibleStart = (w2 ?? 0) + Math.max(0, (spec.a2?.head ?? 0) - (o2 ?? 0));
    return audibleStart - audibleEnd;
  };

  it("silence counts: a 1.5 s tail and a 0.6 s head leave 0.4 s of inserted gap — the room hears 2.5 s", async () => {
    const spec = { a1: { tail: 1.5 }, a2: { head: 0.6 } };
    await run(spec, "gap");
    expect(ctx.sources[0]!.starts[0]).toEqual([0.05, 0, undefined]);
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 170 + 0.4, 9);
    expect(ctx.sources[1]!.starts[0]![1]).toBe(0);
    expect(heard(spec)).toBeCloseTo(2.5, 9);
  });

  it("silence counts: a 4 s tail is cut 1.5 s early with a short fade (≤ 150 ms); the gap is never below 0", async () => {
    const spec = { a1: { tail: 4 } };
    await run(spec, "gap");
    const a1 = ctx.sources[0]!;
    expect(a1.starts[0]![2]).toBeCloseTo(168.5, 9);
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 168.5, 9);
    expect(heard(spec)).toBeCloseTo(2.5, 9);
    // the cut's fade: the level held until the cut − 0.12 s, a ramp to 0 at the cut
    const g = ctx.gains[1]!.gain;
    expect(g.of("setValueAtTime").at(-1)!.args[1]).toBeCloseTo(0.05 + 168.5 - 0.12, 9);
    const ramp = g.of("linearRampToValueAtTime").at(-1)!.args;
    expect(ramp[0]).toBe(0);
    expect(ramp[1]).toBeCloseTo(0.05 + 168.5, 9);
  });

  it("silence counts: a head longer than the gap starts the next side inside its silence", async () => {
    const spec = { a2: { head: 4 } };
    await run(spec, "gap");
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 170, 9);
    expect(ctx.sources[1]!.starts[0]![1]).toBeCloseTo(1.5, 9);
    expect(heard(spec)).toBeCloseTo(2.5, 9);
  });

  it("the night's first side starts at its music in 'silence counts'; 'gap after the music' keeps its head", async () => {
    await run({ a1: { head: 2 } }, "gap");
    expect(ctx.sources[0]!.starts[0]![1]).toBeCloseTo(2, 9);
    ctx = new FakeCtx();
    await run({ a1: { head: 2 } }, "after");
    expect(ctx.sources[0]!.starts[0]![1]).toBe(0);
  });

  it("gap after the music: the tail goes, the head stays — the gap plus the head is heard", async () => {
    const spec = { a1: { tail: 2 }, a2: { head: 1 } };
    await run(spec, "after");
    expect(ctx.sources[0]!.starts[0]![2]).toBeCloseTo(168, 9);
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 168 + 2.5, 9);
    expect(ctx.sources[1]!.starts[0]![1]).toBe(0);
    expect(heard(spec)).toBeCloseTo(3.5, 9);
  });

  it("off: files play to their edges, then the gap — the room hears tail + gap + head", async () => {
    const spec = { a1: { tail: 2 }, a2: { head: 1 } };
    await run(spec, "off");
    expect(ctx.sources[0]!.starts[0]).toEqual([0.05, 0, undefined]);
    expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 170 + 2.5, 9);
    expect(ctx.sources[1]!.starts[0]![1]).toBe(0);
    expect(heard(spec)).toBeCloseTo(5.5, 9);
  });

  it("a blend measures its overlap from the audible moments (the tail and the head are not part of it)", async () => {
    const spec = { a1: { tail: 2 }, a2: { head: 1 } };
    const transitions = { [tKey("a1", "a2")]: { preset: "blend" as const, overlapSec: 4 } };
    await run(spec, "gap", { transitions });
    const a1 = ctx.sources[0]!;
    const a2 = ctx.sources[1]!;
    expect(a1.endsAt).toBeCloseTo(0.05 + 168, 9);
    expect(a2.starts[0]![0]).toBeCloseTo(0.05 + 168 - 4, 9);
    expect(a2.starts[0]![1]).toBeCloseTo(1, 9);
  });

  it("Pause and Resume keep the head cut: the position counts from the music's start", async () => {
    const { e } = await run({ a1: { head: 2 } }, "gap");
    ctx.currentTime = 10.05;
    e.pause();
    await e.play();
    const resumed = ctx.sources.find((s, k) => k > 0 && (s.starts[0]?.[1] ?? 0) > 5)!;
    expect(resumed.starts[0]![1]).toBeCloseTo(12, 2);
  });

  it("Spotify: the plan's silence (a measurement of the same recording) trims the play; the next follows at the gap", async () => {
    const starts: ExternalStart[] = [];
    const sp: SourceAdapter = {
      kind: "spotify",
      async available() {
        return { ok: true };
      },
      async resolve() {
        return "ready";
      },
      async prepare(item) {
        return { kind: "spotify", spotifyUri: `spotify:track:${item.id}`, durationSec: item.lengthSec };
      },
      release() {},
      external: {
        capabilities: { fade: true },
        startItem(r) {
          starts.push(r);
          return { cancel() {}, stop() {}, position: () => r.positionSec };
        },
        setMaster() {},
      },
    };
    const plan = build(set(), { measurements: measurementsOf({ a1: { tail: 4 }, a2: { head: 1 } }) });
    const e = new BoothEngine(ctx, { adapters: [sp], now: () => 1_000_000 });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "spotify"),
    );
    await e.start();
    await e.play();
    const r1 = starts.find((s) => s.uri === "spotify:track:a1")!;
    const r2 = starts.find((s) => s.uri === "spotify:track:a2")!;
    // 4 s tail + 1 s head > 2.5: a1 stops 2.5 s before its end (1.5 s of tail kept), a2 keeps its 1 s head
    expect(r1.positionSec).toBe(0);
    expect(r1.durationSec).toBeCloseTo(167.5, 6);
    expect(r2.positionSec).toBe(0);
    expect(r2.delaySec).toBeCloseTo(0.05 + 167.5, 6);
    expect(e.sourcePosition()).toBe(0);
  });

  it("the clock: remaining and time to La Cumparsita count the silence once (the plan's cuts and gaps)", () => {
    const spec = { a1: { tail: 1.5 }, a2: { head: 0.6 }, cump: { tail: 3 } };
    const off = build(set(), { silenceMode: "off", measurements: measurementsOf(spec) });
    const on = build(set(), { silenceMode: "gap", measurements: measurementsOf(spec) });
    const rOff = remainingFrom(off, 0, 0);
    const rOn = remainingFrom(on, 0, 0);
    expect(rOn.remainingSec).toBeCloseTo(on.wallClockSec, 6);
    // 2.1 s that no longer doubles up between a1 and a2, and the closing's 3 s tail
    expect(rOff.remainingSec - rOn.remainingSec).toBeCloseTo(2.1 + 3, 6);
    expect(rOff.timeToCumparsita - rOn.timeToCumparsita).toBeCloseTo(2.1, 6);
    // mid-song: the rest of the side is its played length (the cut tail is not waited for)
    const cut = build(set(), { silenceMode: "gap", measurements: measurementsOf({ a1: { tail: 4 } }) });
    expect(cut.items[0]!.lengthSec).toBeCloseTo(168.5, 6);
    expect(remainingFrom(cut, 0, 100).remainingSec).toBeCloseTo(cut.wallClockSec - 100, 6);
  });
});

/**
 * 2026-11 — the DJ-user review on an iPad (Spotify Connect: the device switches tracks itself and cannot fade).
 * Next / Previous are one play request each, at once, with no pause and no wait; rapid presses make one request for
 * the latest target; the status says Starting… until the device confirms; Mute / Talk read the device's level first;
 * "Skip the next song" has an Undo; a reload re-attaches to the playing track.
 */
describe("2026-11: Spotify Connect transport (instant, coalesced skips)", () => {
  type Ext = { r: ExternalStart; cancels: boolean[]; stops: number[] };
  function connectAdapter(fade = false) {
    const starts: Ext[] = [];
    const masters: Array<{ g: number; resync: boolean }> = [];
    const sp: SourceAdapter = {
      kind: "spotify",
      async available() {
        return { ok: true };
      },
      async resolve() {
        return "ready";
      },
      async prepare(item) {
        return { kind: "spotify", spotifyUri: `spotify:track:${item.id}`, durationSec: item.lengthSec };
      },
      release() {},
      external: {
        capabilities: { fade, volume: true, gain: false },
        startItem(r) {
          const x: Ext = { r, cancels: [], stops: [] };
          starts.push(x);
          if (r.delaySec < 1) setTimeout(() => r.onStarted?.(true), 0);
          return {
            cancel: (keep) => x.cancels.push(!!keep),
            stop: (f) => {
              x.stops.push(f);
              r.onEnded();
            },
            position: () => r.positionSec + 5,
          };
        },
        setMaster(g, o) {
          masters.push({ g, resync: !!o?.resync });
        },
      },
    };
    return { sp, starts, masters };
  }
  let ctx: FakeCtx;
  beforeEach(() => {
    ctx = new FakeCtx();
  });
  async function night(fade = false) {
    const { sp, starts, masters } = connectAdapter(fade);
    const plan = build(set({ thirdTanda: true }));
    const events: EngineEvent[] = [];
    const e = new BoothEngine(ctx, {
      adapters: [sp],
      onEvent: (ev) => events.push(ev),
      now: () => 1_000_000 + ctx.currentTime * 1000,
    });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "spotify"),
    );
    await e.start();
    await e.play();
    await new Promise((r) => setTimeout(r, 5));
    return { e, plan, starts, masters, events };
  }
  const nowStarts = (s: Ext[]) => s.filter((x) => x.r.delaySec < 1);

  it("Next: one play of the next song at once — no pause, no fade, no gap — after ~250 ms of no presses", async () => {
    const { e, starts } = await night();
    const first = starts[0]!;
    const before = nowStarts(starts).length;
    await e.nextNow();
    expect(e.planIndex).toBe(1);
    expect(e.starting).toBe(true);
    expect(nowStarts(starts).length).toBe(before); // nothing sent yet
    await new Promise((r) => setTimeout(r, BoothEngine.SKIP_COALESCE_MS + 30));
    const plays = nowStarts(starts).slice(before);
    expect(plays).toHaveLength(1);
    expect(plays[0]!.r.uri).toBe("spotify:track:a2");
    expect(plays[0]!.r.delaySec).toBeLessThan(0.05);
    expect(plays[0]!.r.positionSec).toBe(0);
    // the running item handed the device over: no pause, no fade
    expect(first.cancels).toEqual([true]);
    expect(first.stops).toEqual([]);
    expect(e.current?.planIndex).toBe(1);
    expect(e.state).toBe("playing");
    await new Promise((r) => setTimeout(r, 5));
    expect(e.starting).toBe(false);
  });

  it("Next → Previous → Next within the window sends exactly one play, for the final target", async () => {
    const { e, starts } = await night();
    const before = nowStarts(starts).length;
    await e.nextNow();
    await e.previous();
    await e.nextNow();
    await new Promise((r) => setTimeout(r, BoothEngine.SKIP_COALESCE_MS + 30));
    const plays = nowStarts(starts).slice(before);
    expect(plays.map((x) => x.r.uri)).toEqual(["spotify:track:a2"]);
  });

  it("Next → Previous lands back on the room's song: nothing is sent, it plays on", async () => {
    const { e, starts } = await night();
    const first = starts[0]!;
    const before = nowStarts(starts).length;
    await e.nextNow();
    await e.previous();
    await new Promise((r) => setTimeout(r, BoothEngine.SKIP_COALESCE_MS + 30));
    expect(nowStarts(starts).length).toBe(before);
    expect(first.cancels).toEqual([]); // the room's song was never touched
    expect(e.current?.planIndex).toBe(0);
    expect(e.starting).toBe(false);
  });

  it("Previous past 3 s restarts the song with one play from 0", async () => {
    const { e, starts } = await night();
    const before = nowStarts(starts).length;
    await e.previous();
    await new Promise((r) => setTimeout(r, BoothEngine.SKIP_COALESCE_MS + 30));
    const plays = nowStarts(starts).slice(before);
    expect(plays.map((x) => [x.r.uri, x.r.positionSec])).toEqual([["spotify:track:a1", 0]]);
  });

  it("Next, Next: two ahead with one play; the position reads 0 while the skip is on its way", async () => {
    const { e, starts } = await night();
    const before = nowStarts(starts).length;
    await e.nextNow();
    await e.nextNow();
    expect(e.position()).toBe(0);
    await new Promise((r) => setTimeout(r, BoothEngine.SKIP_COALESCE_MS + 30));
    const plays = nowStarts(starts).slice(before);
    expect(plays.map((x) => x.r.uri)).toEqual(["spotify:track:c0"]);
  });

  it("Stop during the window cancels the skip (no play goes out)", async () => {
    const { e, starts } = await night();
    const before = nowStarts(starts).length;
    await e.nextNow();
    e.stop("stop", 0.1);
    await new Promise((r) => setTimeout(r, BoothEngine.SKIP_COALESCE_MS + 30));
    expect(nowStarts(starts).length).toBe(before);
    expect(e.state).toBe("stopped");
  });

  it("a device that fades (the SDK) keeps the faded Next", async () => {
    const { e, starts } = await night(true);
    const first = starts[0]!;
    await e.nextNow();
    expect(first.stops).toEqual([DEFAULT_BOOTH_SETTINGS.fadeNowSec]);
  });

  it("the gap is kept only between natural song ends (the queued item starts at end + gap)", async () => {
    const { starts, plan } = await night();
    const queued = starts.find((x) => x.r.uri === "spotify:track:a2")!;
    expect(queued.r.delaySec).toBeCloseTo(plan.items[0]!.lengthSec + plan.items[0]!.gapAfterSec + 0.05, 3);
  });

  it("a seek on Connect is one play at the new position (no pause first)", async () => {
    const { e, starts } = await night();
    const first = starts[0]!;
    await e.seek(60);
    expect(first.cancels).toEqual([true]);
    const s = nowStarts(starts).at(-1)!;
    expect(s.r.uri).toBe("spotify:track:a1");
    expect(s.r.positionSec).toBeCloseTo(60, 6);
  });

  it("Mute and Talk ask the device's level first (resync); unmute does not", async () => {
    const { e, masters } = await night();
    e.setMuted(true);
    e.setMuted(false);
    e.setDucked(true);
    e.setDucked(false);
    expect(masters.slice(-4)).toEqual([
      { g: 0, resync: true },
      { g: 1, resync: false },
      { g: dbToGain(-12), resync: true },
      { g: 1, resync: false },
    ]);
  });

  it("Skip the next song: the queued song is left out (the index for Undo); Undo puts it back", async () => {
    const { e, starts } = await night();
    const n = e.next();
    expect(n).toBe(1);
    expect(e.skipped.has(1)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(starts.at(-1)!.r.uri).toBe("spotify:track:c0");
    e.unskip(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(e.skipped.has(1)).toBe(false);
    expect(starts.at(-1)!.r.uri).toBe("spotify:track:a2");
  });

  it("re-attach: the playing item is taken back at Spotify's position without a play request", async () => {
    const { sp, starts } = connectAdapter();
    const plan = build(set({ thirdTanda: true }));
    const e = new BoothEngine(ctx, { adapters: [sp], now: () => 1_000_000 });
    e.load(
      plan,
      plan.items.map(() => null),
      plan.items.map(() => "spotify"),
    );
    await e.start();
    expect(await e.attach(1, 42)).toBe(true);
    expect(e.state).toBe("playing");
    expect(e.current?.planIndex).toBe(1);
    expect(starts[0]!.r.attached).toBe(true);
    expect(starts[0]!.r.uri).toBe("spotify:track:a2");
    expect(starts[0]!.r.positionSec).toBeCloseTo(42, 6);
    // its end and the gap: the next item is queued from the attached clock
    const q = starts.find((x) => x.r.uri === "spotify:track:c0")!;
    expect(q.r.delaySec).toBeCloseTo(plan.items[1]!.lengthSec - 42 + plan.items[1]!.gapAfterSec, 3);
  });
});

describe("2026-11: the night never stops by accident (engine)", () => {
  it("a hidden tab (timers throttled or frozen): every gap is on the AudioContext clock, not on setTimeout", async () => {
    const ctx = new FakeCtx();
    const plan = build(set());
    const e = engineFor(ctx, plan);
    // a background tab: no timer ever fires (Chromium throttles them to once a minute after 5 minutes hidden)
    const realSetTimeout = globalThis.setTimeout;
    const frozen: unknown[] = [];
    globalThis.setTimeout = ((fn: unknown) => {
      frozen.push(fn);
      return 0;
    }) as unknown as typeof setTimeout;
    try {
      await e.start();
      await e.play();
      // the next side is already scheduled at its sample-exact time while the first plays
      expect(ctx.sources[1]!.starts[0]![0]).toBeCloseTo(0.05 + 170 + 2.5, 9);
      ctx.advance(0.05 + 170);
      // promises still run in a hidden tab (only timers are throttled)
      for (let i = 0; i < 50; i++) await Promise.resolve();
      // the clock moved on with no timer: the side after it is queued at the next gap too
      const third = ctx.sources[2]!;
      expect(third.starts[0]![0]).toBeCloseTo(0.05 + 170 + 2.5 + 170 + 2.5, 9);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });

  it("an interruption hold (a call): pause at once keeps the place; play resumes the same item from there", async () => {
    const ctx = new FakeCtx();
    const plan = build(set());
    const e = engineFor(ctx, plan);
    await e.start();
    await e.play();
    ctx.advance(60);
    e.pause(0);
    expect(e.state).toBe("paused");
    expect(e.pausedAt?.planIndex).toBe(0);
    expect(e.pausedAt?.at).toBeCloseTo(60 - 0.05, 6);
    // the queued side was dropped: nothing starts over the silence
    ctx.advance(200);
    expect(e.current).toBeNull();
    await e.play();
    expect(e.state).toBe("playing");
    expect(e.current?.planIndex).toBe(0);
    const last = ctx.sources.at(-2)!;
    expect(last.starts[0]![1]).toBeCloseTo(60 - 0.05, 6);
  });

  it("the room's output: the meter feeds a router's input instead of the destination, and back", () => {
    const ctx = new FakeCtx();
    const links: unknown[] = [];
    let cuts = 0;
    ctx.createAnalyser = () => ({
      fftSize: 256,
      connect: (n: unknown) => links.push(n),
      disconnect: () => cuts++,
      getFloatTimeDomainData() {},
    });
    const e = engineFor(ctx, build(set()));
    expect(links).toEqual([ctx.destination]);
    const router = { id: "router" };
    e.setOutput(router);
    expect(cuts).toBe(1);
    expect(links.at(-1)).toBe(router);
    e.setOutput(null);
    expect(links.at(-1)).toBe(ctx.destination);
  });

  it("Bluetooth latency: the playhead shows what the dancers hear (the larger of the context's and the output's)", async () => {
    const ctx = new FakeCtx();
    const e = engineFor(ctx, build(set()));
    await e.start();
    await e.play();
    ctx.advance(10.05);
    expect(e.position()).toBeCloseTo(10, 6);
    e.outputLatencySec = 0.2;
    expect(e.position()).toBeCloseTo(9.8, 6);
    ctx.outputLatency = 0.25;
    expect(e.position()).toBeCloseTo(9.75, 6);
  });
});
