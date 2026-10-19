import { type Playlist, planBooth } from "@tdj/core";
import { beforeEach, describe, expect, it } from "vitest";
import { makeNightLog, nightLogSummary } from "@/lib/history";
import {
  type AnalyserLike,
  type AudioContextLike,
  type AudioParamLike,
  BoothEngine,
  type EngineEvent,
  type GainNodeLike,
  gainFor,
  type SourceNodeLike,
} from "./engine";
import { DECLICK_IN, dbToGain, EMERGENCY_FADE } from "./envelope";
import { type BoothRows, decorate, remainingFrom } from "./plan";
import type { PlanEntity, PreparedItem, SourceAdapter } from "./sources/types";

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
  async resume() {}
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
    const cg = ctx.gains.find((g) => g.gain.of("setValueCurveAtTime").length)!;
    const curve = cg.gain.of("setValueCurveAtTime")[0]!;
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
    expect(ctx.sources.at(-1)!.starts[0]![2]).toBe(35); // a cortina (45 − 10)
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
    expect(nightLogSummary(log)).toMatch(/^played \d{4}-\d{2}-\d{2} · 0:\d{2} h · 0 holds$/);
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
