import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeMatches, videoIdOf } from "@/lib/youtubeMatches";
import { bestSource, deviceSources, platformOf } from "../deviceSources";
import type { BoothRow } from "../plan";
import { roomCaps, sourceChain } from "../store";
import type { ExternalStart } from "./types";
import { YoutubeAdapter, YT_STATE, type YtPlayerLike, youtubeErrorText, youtubeUri } from "./youtube";

/** a fake IFrame player: records calls; the test drives its state events */
function fakeYt() {
  const calls: string[] = [];
  let ev: { onState: (s: number) => void; onError: (c: number) => void } | null = null;
  let t = 0;
  const p: YtPlayerLike = {
    loadVideoById: (o) => calls.push(`load ${o.videoId}@${o.startSeconds}`),
    playVideo: () => calls.push("play"),
    pauseVideo: () => calls.push("pause"),
    setVolume: (v) => calls.push(`vol ${v}`),
    getCurrentTime: () => t,
    getDuration: () => 180,
  };
  return {
    calls,
    factory: vi.fn(async (e: typeof ev) => {
      ev = e;
      return p;
    }),
    state: (s: number) => ev!.onState(s),
    error: (c: number) => ev!.onError(c),
    at: (sec: number) => {
      t = sec;
    },
  };
}
function req(uri: string, o: Partial<ExternalStart> = {}) {
  const ev = { ended: 0, errors: [] as string[], started: [] as boolean[] };
  const r: ExternalStart = {
    uri,
    delaySec: 0,
    positionSec: 0,
    gainDb: 0,
    onEnded: () => ev.ended++,
    onError: (m) => ev.errors.push(m),
    onStarted: (c) => ev.started.push(c),
    ...o,
  };
  return { r, ev };
}
const row = (title: string) => ({ title, lengthSec: 180 }) as unknown as BoothRow;

afterEach(() => vi.useRealTimers());

describe("2026-11: YouTube in the Booth (the official IFrame player, visible)", () => {
  const matches = () => ({ s1: "dQw4w9WgXcQ" });

  it("a side with a matched video is ready; without one it is missing (another source plays it)", async () => {
    const a = new YoutubeAdapter({ factory: fakeYt().factory, matches, noVolume: false });
    expect(await a.resolve(row("A"), { id: "s1" } as never)).toBe("ready");
    expect(await a.resolve(row("B"), { id: "s2" } as never)).toBe("missing");
    expect(await a.prepare(row("A"), { id: "s1" } as never)).toEqual({
      kind: "youtube",
      externalUri: youtubeUri("dQw4w9WgXcQ"),
      durationSec: 180,
    });
    expect((await new YoutubeAdapter({ matches: () => ({}) }).available()).ok).toBe(false);
  });

  it("starts at the engine's second after its gap, confirms on PLAYING, stops at the planned length with a fade", async () => {
    vi.useFakeTimers();
    const y = fakeYt();
    const a = new YoutubeAdapter({ factory: y.factory, matches, noVolume: false });
    const { r, ev } = req(youtubeUri("dQw4w9WgXcQ"), {
      delaySec: 2,
      positionSec: 12,
      durationSec: 45,
      fadeOutSec: 4,
      gainDb: -6,
    });
    const h = a.startItem(r);
    await vi.advanceTimersByTimeAsync(1900);
    expect(y.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(y.calls).toContain("load dQw4w9WgXcQ@12");
    // -6 dB on the per-item gain: ≈ 50 % of the player's volume
    expect(y.calls).toContain("vol 50");
    y.at(12);
    y.state(YT_STATE.PLAYING);
    expect(ev.started).toEqual([true]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.position()).toBeCloseTo(22, 0);
    await vi.advanceTimersByTimeAsync(32_000);
    // the fade-out began 4 s before the end: the volume steps down, then the player pauses and the item ends
    expect(y.calls.filter((c) => c.startsWith("vol")).length).toBeGreaterThan(3);
    await vi.advanceTimersByTimeAsync(3_200);
    expect(y.calls.at(-1)).toBe("pause");
    expect(ev.ended).toBe(1);
  });

  it("iOS / iPadOS: no setVolume ever (it is ignored there), no fades, no gain; the cortina stops at its second", async () => {
    vi.useFakeTimers();
    const y = fakeYt();
    const a = new YoutubeAdapter({ factory: y.factory, matches, noVolume: true });
    expect(a.capabilities).toEqual({ fade: false, volume: false, gain: false });
    const { r, ev } = req(youtubeUri("dQw4w9WgXcQ"), { durationSec: 30, fadeInSec: 2, fadeOutSec: 4 });
    a.startItem(r);
    a.setMaster(0.3);
    await vi.advanceTimersByTimeAsync(30_100);
    expect(y.calls.some((c) => c.startsWith("vol"))).toBe(false);
    expect(ev.ended).toBe(1);
  });

  it("a video YouTube refuses (removed, not embeddable) is passed over with its title", async () => {
    vi.useFakeTimers();
    const y = fakeYt();
    const a = new YoutubeAdapter({ factory: y.factory, matches, noVolume: false });
    await a.resolve(row("Gallo ciego"), { id: "s1" } as never);
    const { r, ev } = req(youtubeUri("dQw4w9WgXcQ"));
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(10);
    y.error(150);
    expect(ev.errors).toHaveLength(1);
    expect(ev.errors[0]).toContain("Gallo ciego");
    expect(youtubeErrorText(100)).not.toBe(youtubeErrorText(150));
  });

  it("no PLAYING within the wait (iOS asks for a tap on the player): the start is unconfirmed and a banner says so", async () => {
    vi.useFakeTimers();
    const y = fakeYt();
    const banners: string[] = [];
    const a = new YoutubeAdapter({
      factory: y.factory,
      matches,
      noVolume: true,
      confirmMs: 3000,
      onBanner: (t, act) => {
        banners.push(t);
        act?.run();
      },
    });
    const { r, ev } = req(youtubeUri("dQw4w9WgXcQ"));
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(3100);
    expect(ev.started).toEqual([false]);
    expect(banners).toHaveLength(1);
    expect(y.calls).toContain("play");
  });

  it("the next item takes the player without a pause; the one before ends", async () => {
    vi.useFakeTimers();
    const y = fakeYt();
    const a = new YoutubeAdapter({
      factory: y.factory,
      matches: () => ({ s1: "aaaaaaaaaaa", s2: "bbbbbbbbbbb" }),
    });
    const one = req(youtubeUri("aaaaaaaaaaa"));
    a.startItem(one.r);
    await vi.advanceTimersByTimeAsync(10);
    a.startItem(req(youtubeUri("bbbbbbbbbbb")).r);
    await vi.advanceTimersByTimeAsync(10);
    expect(one.ev.ended).toBe(1);
    expect(y.calls.filter((c) => c === "pause")).toEqual([]);
  });
});

describe("2026-11: the YouTube matches the Booth plays", () => {
  it("come from the export's rows and the videos at those rows (a later export wins)", () => {
    const rows = [{ id: "s1" }, { id: "c1" }, undefined, { id: "s2" }];
    const m = mergeMatches({ s1: "old_video_1" }, rows, [
      { row: 0, videoId: "new_video_1" },
      { row: 3, videoId: "video_two_2" },
      { row: 2, videoId: "orphan_vid1" },
      { row: 1, videoId: "<bad>" },
    ]);
    expect(m).toEqual({ s1: "new_video_1", s2: "video_two_2" });
  });
  it("a pasted link is read as its video id", () => {
    expect(videoIdOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
    expect(videoIdOf("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(videoIdOf("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(videoIdOf("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("2026-11: the source chain and the room's capabilities with YouTube", () => {
  it("YouTube is the night's source when picked, else the fallback before 30 s clips", () => {
    expect(sourceChain("youtube", { spotify: true, youtube: true })).toEqual(["youtube", "preview"]);
    expect(sourceChain("file", { spotify: true, youtube: true })).toEqual([
      "file",
      "spotify",
      "youtube",
      "preview",
    ]);
    expect(sourceChain("file", { spotify: false, youtube: false })).toEqual(["file", "preview"]);
    expect(sourceChain("spotify", { spotify: true, youtube: true })).toEqual([
      "spotify",
      "youtube",
      "preview",
    ]);
    expect(sourceChain("preview", { spotify: true, youtube: true })).toEqual(["preview"]);
  });
  it("an item on YouTube takes YouTube's capabilities (none on iOS); files keep everything", () => {
    const none = { fade: false, volume: false, gain: false };
    const all = { fade: true, volume: true, gain: true };
    const plan = { items: [{ kind: "track" }, { kind: "track" }, { kind: "track" }] } as never;
    const base = { plan, spotifyCaps: all, youtubeCaps: none };
    expect(roomCaps({ ...base, sources: ["youtube", "file", "missing"], planIndex: 0 })).toEqual(none);
    expect(roomCaps({ ...base, sources: ["youtube", "file", "missing"], planIndex: 1 })).toEqual(all);
    expect(roomCaps({ ...base, sources: ["youtube", "youtube", "missing"], planIndex: 2 })).toEqual(none);
    expect(roomCaps({ ...base, sources: ["youtube", "file", "missing"], planIndex: 2 })).toEqual(all);
  });
});

describe("2026-11: on this device", () => {
  const base = {
    spotify: { ok: true, checked: true },
    sdk: true as boolean | null,
    youtube: { ok: false },
    youtubeMatched: 0,
    folderName: null,
    folderMatched: 0,
  };
  it("names the platform", () => {
    expect(platformOf({ app: true, appleMobile: false, phone: false })).toBe("mac-app");
    expect(platformOf({ app: true, appleMobile: true, phone: false })).toBe("ios-app");
    expect(platformOf({ app: false, appleMobile: true, phone: true })).toBe("ios-web");
    expect(platformOf({ app: false, appleMobile: false, phone: true })).toBe("phone-web");
    expect(platformOf({ app: false, appleMobile: false, phone: false })).toBe("desktop-web");
  });
  it("says how Spotify plays here: the SDK, the Spotify app on this Mac, or on this iPhone / iPad", () => {
    const sp = (platform: "mac-app" | "ios-app" | "desktop-web", sdk: boolean | null) =>
      deviceSources({ ...base, platform, sdk }).find((s) => s.kind === "spotify")!.line;
    expect(sp("desktop-web", true)).not.toBe(sp("mac-app", false));
    expect(sp("mac-app", false)).not.toBe(sp("ios-app", false));
    // iOS never uses the SDK, whatever the probe said
    expect(sp("ios-app", true)).toBe(sp("ios-app", false));
  });
  it("picks the best source on Automatic: files, then Spotify, then YouTube, then clips — with a reason for each miss", () => {
    const l = deviceSources({
      ...base,
      platform: "ios-app",
      spotify: { ok: false, checked: true, reason: "No" },
    });
    expect(l.find((s) => s.kind === "spotify")).toMatchObject({ ok: false, line: "No" });
    expect(bestSource(l)).toBe("preview");
    const y = deviceSources({
      ...base,
      platform: "ios-app",
      spotify: { ok: false, checked: true },
      youtube: { ok: true },
      youtubeMatched: 12,
    });
    expect(bestSource(y)).toBe("youtube");
    expect(bestSource(deviceSources({ ...base, platform: "desktop-web" }))).toBe("spotify");
    expect(
      bestSource(deviceSources({ ...base, platform: "desktop-web", folderName: "Tango", folderMatched: 40 })),
    ).toBe("file");
    for (const s of l) expect(s.line.length).toBeGreaterThan(0);
  });
});
