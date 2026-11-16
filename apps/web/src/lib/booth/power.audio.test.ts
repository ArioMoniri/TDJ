import { type Playlist, planBooth } from "@tdj/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePower } from "@/lib/power";
import {
  type AnalyserLike,
  type AudioContextLike,
  type AudioParamLike,
  BoothEngine,
  type GainNodeLike,
  type SourceNodeLike,
} from "./engine";
import { type BoothRows, decorate } from "./plan";
import { SpotifyAdapter } from "./sources/spotify";
import type { PlanEntity, PreparedItem, SourceAdapter } from "./sources/types";

/**
 * 2026-11 — Battery saver never touches playback (lib/power.ts): the same night, played with the saver off and on,
 * schedules exactly the same sound — every AudioContext start, stop and gain automation of the engine (gaps, fades,
 * a crossfade, a seek), while the UI reads the engine at 30 fps or at 4 fps; and every Spotify command (play, volume
 * steps of the fade, pause) at the same millisecond. Only the reads of /me/player become rarer.
 */

const saver = (on: boolean) => usePower.setState({ active: on, reason: on ? "manual" : null });
afterEach(() => {
  saver(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ---------- a recording AudioContext (as engine.test.ts) ---------- */
type Call = [string, ...unknown[]];
class Param implements AudioParamLike {
  value = 1;
  constructor(private log: Call[]) {}
  setValueAtTime(v: number, t: number) {
    this.log.push(["setValueAtTime", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.log.push(["linearRamp", v, t]);
  }
  setValueCurveAtTime(c: Float32Array, t: number, d: number) {
    this.log.push(["curve", Array.from(c), t, d]);
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    this.log.push(["target", v, t, tc]);
  }
  cancelScheduledValues(t: number) {
    this.log.push(["cancel", t]);
  }
}
class Gain implements GainNodeLike {
  gain: Param;
  constructor(log: Call[]) {
    this.gain = new Param(log);
  }
  connect() {}
  disconnect() {}
}
class Source implements SourceNodeLike {
  buffer: AudioBuffer | null = null;
  onended: ((ev: Event) => unknown) | null = null;
  endsAt: number | null = null;
  fired = false;
  started = false;
  constructor(
    private log: Call[],
    private n: number,
  ) {}
  connect() {}
  disconnect() {}
  start(when?: number, offset?: number, duration?: number) {
    this.started = true;
    this.log.push(["start", this.n, when, offset, duration]);
    this.endsAt = (when ?? 0) + (duration ?? (this.buffer?.duration ?? 0) - (offset ?? 0));
  }
  stop(when?: number) {
    this.log.push(["stop", this.n, when]);
    if (when !== undefined) this.endsAt = this.endsAt === null ? when : Math.min(this.endsAt, when);
  }
}
class Ctx implements AudioContextLike {
  currentTime = 0;
  sampleRate = 48000;
  outputLatency = 0;
  destination = {};
  state = "running";
  log: Call[] = [];
  sources: Source[] = [];
  createGain() {
    return new Gain(this.log);
  }
  createBufferSource() {
    const s = new Source(this.log, this.sources.length);
    this.sources.push(s);
    return s;
  }
  createAnalyser(): AnalyserLike {
    return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData() {} };
  }
  addEventListener() {}
  async resume() {}
  advance(to: number) {
    this.currentTime = to;
    for (const s of [...this.sources].sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0)))
      if (!s.fired && s.started && s.endsAt !== null && s.endsAt <= to) {
        s.fired = true;
        s.onended?.(new Event("ended"));
      }
  }
}
const file: SourceAdapter = {
  kind: "file",
  async available() {
    return { ok: true };
  },
  async resolve() {
    return "ready";
  },
  async prepare(item): Promise<PreparedItem> {
    const dur = item.kind === "cortina" ? (item.stopSec ?? 45) + 30 : item.lengthSec;
    const buffer = { duration: dur, length: dur * 48000, sampleRate: 48000, numberOfChannels: 1 };
    return { kind: "file", buffer: buffer as unknown as AudioBuffer, durationSec: dur };
  },
  release() {},
};
const song = (id: string, durationSec: number) =>
  ({
    id,
    title: id,
    rhythm: "tango",
    orchestra: "O",
    orchestraId: "o",
    singer: null,
    vocal: false,
    durationSec,
    era: "x",
    year: 1940,
  }) as unknown as Playlist["tandas"][number]["songs"][number];
function night(): BoothRows {
  const tanda = (index: number, ids: string[]) => ({
    index,
    rhythm: "tango",
    orchestra: "O",
    orchestraId: "o",
    singer: null,
    vocal: false,
    yearRange: null,
    era: "x",
    songs: ids.map((id) => song(id, 170)),
    energy: 50,
    energyCurve: [],
    targetEnergy: 50,
    phase: "build",
    durationSec: 510,
    cortina: {
      id: `c${index}`,
      title: "C",
      artist: "B",
      genre: "x",
      culture: "g",
      energy: 50,
      startSec: 10,
      lengthSec: 45,
    },
  });
  const p = {
    id: "n",
    name: "n",
    createdAt: "2026-11-01T20:00:00.000Z",
    options: {},
    tandas: [tanda(0, ["a1", "a2", "a3"]), tanda(1, ["b1", "b2", "b3"])],
    closing: song("cump", 180),
    stats: {},
    score: { total: 90, factors: [], verdict: "" },
  } as unknown as Playlist;
  return decorate(p, planBooth(p, {}));
}

/** play 25 minutes of the night: gaps, a fade-out now, a crossfade, a seek; the UI reads the engine every frame */
async function playNight(uiFps: number): Promise<Call[]> {
  const ctx = new Ctx();
  const plan = night();
  const e = new BoothEngine(ctx, {
    adapters: [file],
    onEvent: () => {},
    now: () => 1e6 + ctx.currentTime * 1000,
  });
  e.load(
    plan,
    plan.items.map((): PlanEntity => null),
    plan.items.map(() => "file"),
  );
  ctx.currentTime = 0.5;
  await e.start();
  await e.play();
  const frame = 1 / uiFps;
  let next = 0;
  const reads: unknown[] = [];
  const runTo = async (t: number) => {
    // the UI's tick (lib/booth/store.ts): position, remaining, drift, meter — reads only
    for (; next <= t; next += frame) {
      ctx.advance(next);
      reads.push(e.position(), e.remaining(), e.drift(), e.meter());
      await Promise.resolve();
    }
    ctx.advance(t);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  await runTo(400);
  e.fadeOutNow(4);
  await runTo(420);
  await e.crossfadeNext(6);
  await runTo(700);
  await e.seek(120);
  await runTo(1500);
  expect(reads.length).toBeGreaterThan(1000);
  return ctx.log;
}

describe("Battery saver never moves a sound", () => {
  it("the engine schedules the same starts, stops and gain automation (AudioContext time) with the saver off and on", async () => {
    saver(false);
    const off = await playNight(30);
    saver(true);
    const on = await playNight(4);
    expect(off.filter((c) => c[0] === "start").length).toBeGreaterThan(5);
    expect(off.some((c) => c[0] === "linearRamp" || c[0] === "curve")).toBe(true);
    expect(on).toEqual(off);
  });

  it("Spotify Connect: play, the fade's volume steps and the pause go out at the same millisecond; /me/player is read far less", async () => {
    const URI = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
    async function run(on: boolean) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-16T21:00:00Z"));
      saver(on);
      const t0 = Date.now();
      let playAt = 0;
      const log: string[] = [];
      let gets = 0;
      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/spotify/access") return new Response(JSON.stringify({ access: "tok" }));
        const path = url.replace("https://api.spotify.com/v1", "");
        const method = init?.method ?? "GET";
        if (method === "GET" && path.startsWith("/me/player/devices"))
          return new Response(
            JSON.stringify({
              devices: [
                {
                  id: "ipad",
                  name: "iPad",
                  type: "Tablet",
                  is_active: true,
                  is_restricted: false,
                  supports_volume: true,
                },
              ],
            }),
          );
        if (method === "GET" && path.split("?")[0] === "/me/player") {
          gets++;
          return new Response(
            JSON.stringify({
              is_playing: playAt > 0,
              progress_ms: playAt ? Date.now() - playAt : 0,
              item: { uri: URI, duration_ms: 170_000 },
              device: { id: "ipad", name: "iPad", volume_percent: 80, supports_volume: true },
            }),
          );
        }
        if (method === "PUT" && path.startsWith("/me/player/play")) playAt = Date.now();
        log.push(`${Date.now() - t0} ${method} ${path}`);
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch;
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const a = new SpotifyAdapter({ fetchImpl, loadSdk: vi.fn(), phone: true, noFades: false });
      await a.connect();
      let ended = 0;
      const h = a.startItem({
        uri: URI,
        delaySec: 2,
        positionSec: 0,
        gainDb: 0,
        durationSec: 90,
        fadeInSec: 2,
        fadeOutSec: 4,
        onEnded: () => ended++,
        onError: () => {},
      });
      await vi.advanceTimersByTimeAsync(30_000);
      a.setMaster(0.5); // the DJ moves the master: a volume command
      await vi.advanceTimersByTimeAsync(10_000);
      h.seek?.(20, { durationSec: 60 }); // a seek: a seek command, the end re-timed
      await vi.advanceTimersByTimeAsync(80_000);
      vi.useRealTimers();
      return { log, gets, ended };
    }
    const off = await run(false);
    const on = await run(true);
    expect(off.log.some((l) => l.includes("PUT /me/player/play"))).toBe(true);
    expect(off.log.some((l) => l.includes("/me/player/volume"))).toBe(true);
    expect(off.log.some((l) => l.includes("/me/player/seek"))).toBe(true);
    expect(off.log.some((l) => l.includes("/me/player/pause"))).toBe(true);
    expect(on.log).toEqual(off.log);
    expect(on.ended).toBe(off.ended);
    // ~100 s of a song: a read a second; with the saver the start, the seek and the last 15 s each second, else every 10 s
    expect(off.gets).toBeGreaterThan(80);
    expect(on.gets).toBeLessThan(off.gets / 2);
  });
});
