/**
 * 2026-11 (the owner on "Level not available from Spotify"): a Spotify / YouTube side's level from data, not samples.
 * Invariants: Deezer's `gain` maps to an integrated-loudness estimate (and only a plausible one); the sources rank
 * file > clip > catalogue > Deezer > Spotify; the device cache never lets an estimate replace a measurement and looks
 * a side up once; the gain the Spotify / YouTube source applies toward the night's target is that level's; and
 * GET /api/level answers from the catalogue, Deezer's track API, then Spotify's audio-features (a 403 is quiet).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiDeps } from "../api/deps";
import { LevelLru, level } from "../api/level";
import { DEFAULT_BOOTH_SETTINGS, gainFor } from "./engine";
import {
  DEEZER_GAIN_OFFSET_DB,
  deezerGainToLufs,
  externalGainDb,
  isEstimate,
  songLoudness,
  spotifyLoudnessToLufs,
} from "./level";
import type { BoothRow, PlanEntity } from "./plan";
import {
  _resetSideLevels,
  ensureSideLevel,
  knownSideLevel,
  LEVEL_CACHE_KEY,
  levelCache,
  levelQuery,
  preparedLevel,
  provideFileLevels,
  rememberLevel,
} from "./sideLevel";
import { SpotifyAdapter } from "./sources/spotify";
import { YoutubeAdapter } from "./sources/youtube";

const ROOT = join(__dirname, "../../../../..");
const memStorage = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const j = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

beforeEach(() => _resetSideLevels({ storage: memStorage() }));
afterEach(() => {
  vi.unstubAllGlobals();
  _resetSideLevels();
});

describe("Deezer's gain → an integrated-loudness estimate", () => {
  it("a level in dB below full scale, read as LUFS; Deezer's 0 / null and implausible values are unknown", () => {
    expect(DEEZER_GAIN_OFFSET_DB).toBe(0);
    expect(deezerGainToLufs(-12.7)).toBe(-12.7);
    expect(deezerGainToLufs(-17.94)).toBe(-17.9);
    expect(deezerGainToLufs(-8)).toBe(-8);
    for (const v of [0, null, undefined, Number.NaN, "-12", -0.74, -55, 3])
      expect(deezerGainToLufs(v)).toBeNull();
    expect(spotifyLoudnessToLufs(-9.4)).toBe(-9.4);
    expect(spotifyLoudnessToLufs(0)).toBeNull();
  });

  it("the committed cache agrees: louder previews have a higher Deezer level (it is a level, not a correction)", () => {
    const dz = JSON.parse(readFileSync(join(ROOT, "data/cache/deezer/tracks.json"), "utf8")) as Record<
      string,
      { gain?: number | null } | null
    >;
    const au = JSON.parse(readFileSync(join(ROOT, "data/cache/audio/features.json"), "utf8")) as Record<
      string,
      { loudnessDb?: number } | null
    >;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [k, v] of Object.entries(dz)) {
      const l = deezerGainToLufs(v?.gain);
      const a = au[k]?.loudnessDb;
      if (l !== null && typeof a === "number") {
        xs.push(l);
        ys.push(a);
      }
    }
    expect(xs.length).toBeGreaterThan(200);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) ** 2;
      syy += (ys[i]! - my) ** 2;
    }
    // a correction toward a reference would fall as the side gets louder; Deezer's rises with it
    expect(sxy / Math.sqrt(sxx * syy)).toBeGreaterThan(0.3);
    // and the estimates sit where tango transfers do (−22 … −8 LUFS for the middle of them)
    const sorted = [...xs].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeGreaterThan(-20);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeLessThan(-8);
  });
});

describe("source precedence", () => {
  const all = {
    measured: { lufs: -14 },
    measuredFrom: "clip" as const,
    fileMeasured: { lufs: -15, peakDbFS: -2 },
    cached: { lufs: -16, from: "file" as const },
    catalogueDb: -17,
    deezerGain: -11,
  };
  it("measured now > the DJ's file > cached measurement > catalogue > Deezer > a live estimate", () => {
    expect(songLoudness(all)).toEqual({ lufs: -14, from: "clip" });
    expect(songLoudness({ ...all, measured: null })).toEqual({ lufs: -15, from: "file", peakDbFS: -2 });
    expect(songLoudness({ ...all, measured: null, fileMeasured: null })).toEqual({ lufs: -16, from: "file" });
    expect(songLoudness({ ...all, measured: null, fileMeasured: null, cached: null })).toEqual({
      lufs: -17,
      from: "catalogue",
    });
    expect(songLoudness({ deezerGain: -11, cached: { lufs: -9, from: "spotify" } })).toEqual({
      lufs: -11,
      from: "deezer",
    });
    expect(songLoudness({ cached: { lufs: -9, from: "spotify" } })).toEqual({ lufs: -9, from: "spotify" });
    expect(songLoudness({ deezerGain: 0 })).toBeNull();
    expect(songLoudness({})).toBeNull();
  });
  it("only file and clip are measurements; the rest are estimates", () => {
    expect(isEstimate({ from: "file" })).toBe(false);
    expect(isEstimate({ from: "clip" })).toBe(false);
    for (const f of ["catalogue", "deezer", "spotify"] as const) expect(isEstimate({ from: f })).toBe(true);
  });
  it("a side from data: its catalogue level, else Deezer's (the judged match or the DJ's own Level)", () => {
    expect(knownSideLevel({ id: "a", audio: { loudnessDb: -18.2 }, level: { gainDb: -12 } })).toEqual({
      lufs: -18.2,
      from: "catalogue",
    });
    expect(knownSideLevel({ id: "a", level: { gainDb: -12.4 } })).toEqual({ lufs: -12.4, from: "deezer" });
    expect(knownSideLevel({ id: "a", deezer: { id: "1", gain: -13 } })).toEqual({
      lufs: -13,
      from: "deezer",
    });
    expect(knownSideLevel({ id: "a" })).toBeNull();
    provideFileLevels((id) => (id === "a" ? { lufs: -20.5, peakDbFS: -1.5 } : null));
    expect(knownSideLevel({ id: "a", level: { gainDb: -12.4 } })).toEqual({
      lufs: -20.5,
      from: "file",
      peakDbFS: -1.5,
    });
  });
});

describe("the device cache and the lookup", () => {
  it("an estimate never replaces a measurement; a file outranks a clip; kept in storage", () => {
    const st = memStorage();
    _resetSideLevels({ storage: st });
    expect(rememberLevel("s", { lufs: -14.04, from: "clip" })).toBe(true);
    expect(rememberLevel("s", { lufs: -10, from: "deezer" })).toBe(false);
    expect(rememberLevel("s", { lufs: -15, from: "file" })).toBe(true);
    expect(rememberLevel("s", { lufs: -13, from: "clip" })).toBe(false);
    expect(rememberLevel("t", { lufs: -11, from: "spotify" })).toBe(true);
    expect(rememberLevel("t", { lufs: -12, from: "deezer" })).toBe(true);
    expect(JSON.parse(st.m.get(LEVEL_CACHE_KEY)!)).toEqual({
      s: { lufs: -15, from: "file" },
      t: { lufs: -12, from: "deezer" },
    });
    // a fresh page reads it back
    _resetSideLevels({ storage: st });
    expect(levelCache().t).toEqual({ lufs: -12, from: "deezer" });
    expect(knownSideLevel({ id: "t" })).toEqual({ lufs: -12, from: "deezer" });
  });

  it("a side with nothing known is looked up once (/api/level), kept, and not asked again", async () => {
    vi.stubGlobal("window", {});
    const calls: string[] = [];
    _resetSideLevels({
      storage: memStorage(),
      fetch: async (u) => {
        calls.push(u);
        return j({ lufs: -10.6, from: "deezer" });
      },
    });
    const side = {
      id: "x1",
      resolved: { provider: "deezer", id: "123" },
      spotify: { uri: `spotify:track:${"A".repeat(22)}` },
    };
    expect(levelQuery(side)).toBe(`id=x1&deezer=123&uri=spotify%3Atrack%3A${"A".repeat(22)}`);
    const [a, b] = await Promise.all([ensureSideLevel(side), ensureSideLevel(side)]);
    expect(a).toEqual({ lufs: -10.6, from: "deezer" });
    expect(b).toEqual(a);
    expect(await ensureSideLevel(side)).toEqual(a);
    expect(calls).toEqual([`/api/level?${levelQuery(side)}`]);
    // known from data: no lookup at all
    expect(await ensureSideLevel({ id: "y", level: { gainDb: -12 } })).toEqual({ lufs: -12, from: "deezer" });
    expect(calls.length).toBe(1);
  });

  it("nothing known anywhere: asked once this session; the server unreachable: asked again later", async () => {
    vi.stubGlobal("window", {});
    let n = 0;
    _resetSideLevels({
      storage: memStorage(),
      fetch: async () => {
        n++;
        return n === 1 ? j({ lufs: null }) : j({ lufs: null, retry: true });
      },
    });
    expect(await ensureSideLevel({ id: "z" })).toBeNull();
    expect(await ensureSideLevel({ id: "z" })).toBeNull();
    expect(n).toBe(1);
    expect(await ensureSideLevel({ id: "w" })).toBeNull();
    vi.useFakeTimers({ now: Date.now() + 61_000 });
    try {
      await ensureSideLevel({ id: "w" });
    } finally {
      vi.useRealTimers();
    }
    expect(n).toBe(3);
  });
});

describe("the gain the Spotify / YouTube source applies is the level's", () => {
  const row = { kind: "track", title: "A", lengthSec: 170 } as unknown as BoothRow;
  const S = DEFAULT_BOOTH_SETTINGS;
  it("a loud side known from Deezer is turned down toward the night's target; the meter says the same number", async () => {
    expect(S.loudnessTargetLUFS).toBe(-16);
    const side = {
      id: "loud",
      spotify: { uri: `spotify:track:${"B".repeat(22)}` },
      level: { gainDb: -11.8, source: "deezer" },
    } as unknown as PlanEntity;
    const a = new SpotifyAdapter({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      noFades: false,
      phone: false,
    });
    const p = await a.prepare(row, side);
    expect(p.measured?.lufs).toBe(-11.8);
    const g = gainFor(row, p.measured, S);
    expect(g.gainDb).toBeCloseTo(-4.2, 5);
    expect(g.peakCapped).toBe(false);
    // what the Booth shows for it on the SDK path
    expect(externalGainDb(knownSideLevel(side as never), S.loudnessTargetLUFS, "sdk")).toBe(-4.2);
    // Connect / YouTube on iOS apply none (Spotify's own normalisation, or nothing)
    expect(externalGainDb(knownSideLevel(side as never), S.loudnessTargetLUFS, "spotify")).toBe(0);
    // a quiet side is never turned up on an external player
    expect(externalGainDb({ lufs: -21 }, S.loudnessTargetLUFS, "sdk")).toBe(0);
    // YouTube reads the same level
    const y = new YoutubeAdapter({ matches: () => ({ loud: "dQw4w9WgXcQ" }), noVolume: false });
    expect((await y.prepare(row, side)).measured?.lufs).toBe(-11.8);
  });
  it("the catalogue's level is the plan's prior already (no second number); unknown: nothing to apply", async () => {
    expect(preparedLevel({ id: "c", audio: { loudnessDb: -17 } })).toBeUndefined();
    expect(preparedLevel({ id: "c" })).toBeUndefined();
    // a measured file of the side wins over Deezer, with its peak
    provideFileLevels(() => ({ lufs: -13, peakDbFS: -0.5 }));
    expect(preparedLevel({ id: "c", level: { gainDb: -9 } })).toEqual({
      lufs: -13,
      peakDbFS: -0.5,
      introSec: 0,
    });
    // an estimate has no peak: the engine's peak cap does not apply to it
    provideFileLevels(() => null);
    const m = preparedLevel({ id: "c", level: { gainDb: -9 } })!;
    expect(Number.isNaN(m.peakDbFS)).toBe(true);
    expect(gainFor(row, m, S).gainDb).toBeCloseTo(-7, 5);
  });
});

describe("GET /api/level (mocked Deezer and Spotify)", () => {
  type Side = {
    id: string;
    altIds?: string[];
    audio?: object;
    level?: object;
    resolved?: object;
    spotify?: object;
  };
  function deps(o: {
    songs?: Side[];
    answer?: (url: string, init?: RequestInit) => Response | Promise<Response>;
    session?: boolean;
  }) {
    const calls: string[] = [];
    const d = {
      catalog: () => ({ catalog: { songs: o.songs ?? [], cortinas: [] } }),
      fetch: async (url: string, init?: RequestInit) => {
        calls.push(url);
        return (o.answer ?? (() => j({})))(url, init);
      },
      spotify: {
        enabled: async () => true,
        session: async () => (o.session ? { access: "AT", expires: Date.now() + 1e6 } : null),
      },
    } as unknown as ApiDeps;
    return { d, calls };
  }
  const get = (qs: string) => new Request(`http://localhost/api/level${qs}`);
  const TRACK = "4u5p9iR9Ll8QjLkmogApFA";

  it("the catalogue first (no lookup): its analysed level, else Deezer's gain of the judged match", async () => {
    const { d, calls } = deps({
      songs: [
        { id: "a", audio: { loudnessDb: -18.3 } },
        { id: "b", altIds: ["b2"], level: { gainDb: -12.5 } },
      ],
    });
    expect(await (await level(get("?id=a"), d, new LevelLru())).json()).toEqual({
      lufs: -18.3,
      from: "catalogue",
    });
    const r = await level(get("?id=b2"), d, new LevelLru());
    expect(await r.json()).toEqual({ lufs: -12.5, from: "deezer" });
    expect(r.headers.get("cache-control")).toMatch(/max-age=\d+/);
    expect(calls).toEqual([]);
  });

  it("Deezer's track API (gain → LUFS), kept in the LRU", async () => {
    const { d, calls } = deps({
      songs: [{ id: "c", resolved: { provider: "deezer", id: "777" } }],
      answer: (u) => {
        expect(u).toBe("https://api.deezer.com/track/777");
        return j({ id: 777, gain: -13.6 });
      },
    });
    const lru = new LevelLru();
    expect(await (await level(get("?id=c"), d, lru)).json()).toEqual({ lufs: -13.6, from: "deezer" });
    expect(await (await level(get("?id=c&deezer=777"), d, lru)).json()).toEqual({
      lufs: -13.6,
      from: "deezer",
    });
    expect(calls.length).toBe(1);
  });

  it("Spotify's audio-features with the DJ's session when Deezer has none; a 403 (deprecated) is a quiet unknown", async () => {
    const ok = deps({
      session: true,
      answer: (u, init) => {
        if (u.includes("deezer")) return j({ id: 1, gain: 0 });
        expect(u).toBe(`https://api.spotify.com/v1/audio-features/${TRACK}`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer AT");
        return j({ loudness: -9.2 });
      },
    });
    expect(
      await (await level(get(`?id=s&deezer=1&uri=spotify:track:${TRACK}`), ok.d, new LevelLru())).json(),
    ).toEqual({ lufs: -9.2, from: "spotify" });
    const closed = deps({ session: true, answer: () => j({ error: { status: 403 } }, 403) });
    const lru = new LevelLru();
    const r = await level(get(`?id=s&uri=spotify:track:${TRACK}`), closed.d, lru);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ lufs: null });
    await level(get(`?id=s&uri=spotify:track:${TRACK}`), closed.d, lru);
    expect(closed.calls.length).toBe(1);
    // no session: Spotify is not asked (and the miss is not kept)
    const anon = deps({ session: false });
    expect(
      await (await level(get(`?id=s&uri=spotify:track:${TRACK}`), anon.d, new LevelLru())).json(),
    ).toEqual({
      lufs: null,
    });
    expect(anon.calls).toEqual([]);
  });

  it("Deezer unreachable: retry later, never cached; bad input: 400", async () => {
    const { d } = deps({ answer: () => j({}, 503) });
    const r = await level(get("?id=q&deezer=5"), d, new LevelLru());
    expect(await r.json()).toEqual({ lufs: null, retry: true });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await level(get(""), d, new LevelLru())).status).toBe(400);
    expect((await level(get("?id=a&deezer=x"), d, new LevelLru())).status).toBe(400);
  });
});
