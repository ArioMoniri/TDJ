import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Playlist, planBooth, type Song } from "@tdj/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoothRow } from "../plan";
import { decorate, planEntities } from "../plan";
import {
  autoPick,
  isAppleMobile,
  isTrackUri,
  type SdkPlayer,
  type SdkPlayerCtor,
  SpotifyAdapter,
  sdkPlayable,
} from "./spotify";
import type { ExternalStart } from "./types";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../../../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

/** a fake Web Playback SDK: each player connects and reports its device id; the tests fire events on it */
function fakeSdk(ids: string[] = ["dev-1"]) {
  const players: Array<{
    ls: Record<string, (e: unknown) => void>;
    connects: number;
    disconnects: number;
    fire: (ev: string, e?: unknown) => void;
  }> = [];
  let n = 0;
  const Ctor = class implements SdkPlayer {
    ls: Record<string, (e: unknown) => void> = {};
    connects = 0;
    disconnects = 0;
    constructor() {
      players.push(this as unknown as (typeof players)[number]);
    }
    fire(ev: string, e?: unknown) {
      this.ls[ev]?.(e);
    }
    async connect() {
      this.connects++;
      const id = ids[Math.min(n++, ids.length - 1)]!;
      setTimeout(() => this.ls.ready?.({ device_id: id }), 0);
      return true;
    }
    disconnect() {
      this.disconnects++;
    }
    addListener(ev: string, cb: (e: unknown) => void) {
      this.ls[ev] = cb;
    }
    async getCurrentState() {
      return null;
    }
    async setVolume() {}
    async pause() {}
    async resume() {}
  } as unknown as SdkPlayerCtor;
  return { Ctor, players };
}

interface Call {
  url: string;
  method?: string;
  body?: string;
}
type Handler = (c: Call, n: number) => Response | undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const dev = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  name: id,
  type: "Computer",
  is_active: false,
  is_restricted: false,
  supports_volume: true,
  ...o,
});
const spotifyError = (status: number, message: string, reason?: string) =>
  json({ error: { status, message, ...(reason ? { reason } : {}) } }, status);

/**
 * A mocked Spotify: `/api/spotify/access` answers a token, `/me/player/devices` the listed devices (a function of
 * the call number), every other call 204 unless a handler answers it.
 */
function spotify(o: { devices?: (n: number) => unknown[]; handlers?: Record<string, Handler> } = {}) {
  const calls: Call[] = [];
  const count: Record<string, number> = {};
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method, body: init?.body as string | undefined };
    calls.push(c);
    const path = url.replace("https://api.spotify.com/v1", "").split("?")[0]!;
    const key = `${init?.method ?? "GET"} ${path}`;
    const n = (count[key] ?? 0) + 1;
    count[key] = n;
    if (url === "/api/spotify/access") return json({ access: "tok" });
    const h = o.handlers?.[key]?.(c, n);
    if (h) return h;
    if (key === "GET /me/player/devices") return json({ devices: (o.devices ?? (() => [dev("dev-1")]))(n) });
    return new Response(null, { status: 204 });
  });
  return {
    calls,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    plays: () => calls.filter((x) => x.url.includes("/me/player/play")),
  };
}

function req(uri: string, o: Partial<ExternalStart> = {}) {
  const ev = { ended: 0, errors: [] as string[] };
  const r: ExternalStart = {
    uri,
    delaySec: 0,
    positionSec: 0,
    gainDb: 0,
    onEnded: () => ev.ended++,
    onError: (m) => ev.errors.push(m),
    ...o,
  };
  return { r, ev };
}

const songs = featured.tandas.flatMap((t) => t.songs);
const URI_A = songs[0]!.spotify!.uri;
const URI_B = songs[1]!.spotify!.uri;
const row = (title: string) => ({ title, lengthSec: 180 }) as unknown as BoothRow;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
// the adapter writes every Spotify error to the console for diagnosis; keep the test output clean
const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

describe("round 18: logged into Spotify, the booth plays exactly the checked recording", () => {
  it("prepare hands the engine the side's stored spotify.uri for every item of the featured night", async () => {
    const plan = decorate(featured, planBooth(featured));
    const ents = planEntities(featured, plan);
    const a = new SpotifyAdapter({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      noFades: false,
      phone: false,
    });
    let n = 0;
    for (let i = 0; i < plan.items.length; i++) {
      const e = ents[i] as Song | null;
      if (!e?.spotify?.uri) {
        if (e) expect(await a.resolve(plan.items[i]!, e)).toBe("missing");
        continue;
      }
      expect(await a.resolve(plan.items[i]!, e)).toBe("ready");
      const p = await a.prepare(plan.items[i]!, e);
      expect(p.spotifyUri).toBe(e.spotify.uri);
      n++;
    }
    // every item with a checked Spotify id (round 19: all 108, İşte Öyle Bir Şey included)
    expect(n).toBe(ents.filter((e) => !!(e as Song | null)?.spotify?.uri).length);
    expect(n).toBeGreaterThanOrEqual(107);
  });

  it("round 23: every song and cortina of the featured night has a valid spotify:track: uri", () => {
    const bad: string[] = [];
    let n = 0;
    for (const t of featured.tandas) {
      for (const s of t.songs) {
        n++;
        if (!isTrackUri(s.spotify?.uri)) bad.push(`song ${s.title}: ${s.spotify?.uri}`);
      }
      const c = t.cortina as { title: string; spotify?: { uri?: string } } | undefined;
      if (c) {
        n++;
        if (!isTrackUri(c.spotify?.uri)) bad.push(`cortina ${c.title}: ${c.spotify?.uri}`);
      }
    }
    expect(bad).toEqual([]);
    expect(n).toBe(116);
  });

  it("startItem PUTs /me/player/play with that uri and nothing else: no search, no re-match", async () => {
    vi.useFakeTimers();
    const sp = spotify();
    const { Ctor } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const uri = featured.tandas[22]!.songs[0]!.spotify!.uri; // Recuerdo Malevo, the checked 153 s transfer
    const { r, ev } = req(uri);
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(50);
    const play = sp.plays();
    expect(ev.errors).toEqual([]);
    expect(play).toHaveLength(1);
    expect(play[0]!.url).toBe("https://api.spotify.com/v1/me/player/play?device_id=dev-1");
    expect(play[0]!.method).toBe("PUT");
    expect(JSON.parse(play[0]!.body!)).toEqual({ uris: [uri], position_ms: 0 });
    // the only endpoints: the token, the device list (registration), the transfer to this device, the play call
    for (const c of sp.calls)
      expect(c.url).toMatch(
        /^(\/api\/spotify\/access|https:\/\/api\.spotify\.com\/v1\/me\/player(\/devices|\/play\?device_id=dev-1)?)$/,
      );
  });
});

describe("2026-11: a cortina starts at its chorus on Spotify too", () => {
  it("the featured night's cortinas: /me/player/play carries position_ms at the plan's start (the chorus)", async () => {
    vi.useFakeTimers();
    const plan = decorate(featured, planBooth(featured));
    const cortinas = plan.items.filter((it) => it.kind === "cortina" && (it.trimInSec ?? 0) > 0);
    expect(cortinas.length).toBeGreaterThan(15);
    const sp = spotify();
    const { Ctor } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const it = cortinas[0]!;
    const uri = featured.tandas[it.tanda - 1]!.cortina!.spotify!.uri;
    const { r, ev } = req(uri, { positionSec: it.trimInSec!, durationSec: it.lengthSec });
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(50);
    expect(ev.errors).toEqual([]);
    const body = JSON.parse(sp.plays().at(-1)!.body!);
    expect(body).toEqual({ uris: [uri], position_ms: Math.round(it.trimInSec! * 1000) });
    expect(body.position_ms).toBeGreaterThan(0);
  });
});

describe("round 23: a 404 from Spotify never stops the night", () => {
  it("connect waits for the SDK device to be registered before the transfer", async () => {
    vi.useFakeTimers();
    // Spotify lists the new device only on the third look
    const sp = spotify({ devices: (n) => (n < 3 ? [] : [dev("dev-1")]) });
    const { Ctor } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(2000);
    await connecting;
    const order = sp.calls.map((c) => `${c.method ?? "GET"} ${c.url}`).filter((x) => !x.includes("/api/"));
    const transfer = order.indexOf("PUT https://api.spotify.com/v1/me/player");
    expect(transfer).toBeGreaterThan(-1);
    expect(order.slice(0, transfer).filter((x) => x.endsWith("/devices"))).toHaveLength(3);
  });

  it("404 Device not found → re-transfer, wait for the device, play again: it plays", async () => {
    vi.useFakeTimers();
    const warn = quiet();
    let listed = true;
    const sp = spotify({
      devices: () => (listed ? [dev("dev-1")] : []),
      handlers: {
        "PUT /me/player/play": (_c, n) => {
          if (n === 1) {
            // the device dropped off Spotify's side; it comes back two looks later
            listed = false;
            setTimeout(() => {
              listed = true;
            }, 900);
            return spotifyError(404, "Device not found");
          }
          return undefined;
        },
      },
    });
    const { Ctor } = fakeSdk();
    const log: unknown[] = [];
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
      onLog: (e) => log.push(e),
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const { r, ev } = req(URI_A);
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(6000);
    expect(ev.errors).toEqual([]);
    expect(sp.plays()).toHaveLength(2);
    expect(sp.plays()[1]!.url).toContain("device_id=dev-1");
    // between the two plays: the device list was polled and playback transferred back to this device
    const i1 = sp.calls.indexOf(sp.plays()[0]!);
    const i2 = sp.calls.indexOf(sp.plays()[1]!);
    const between = sp.calls.slice(i1, i2).map((c) => c.url);
    expect(between.filter((u) => u.endsWith("/me/player/devices")).length).toBeGreaterThan(1);
    expect(between).toContain("https://api.spotify.com/v1/me/player");
    // the error JSON is in the booth's Spotify log (and the console)
    expect(log).toContainEqual(
      expect.objectContaining({ op: "play", status: 404, message: "Device not found" }),
    );
    expect(a.log.some((e) => e.status === 404 && e.message === "Device not found")).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("a 404 on the track (the device is there) passes it over with its title and starts the next item now", async () => {
    vi.useFakeTimers();
    quiet();
    const sp = spotify({
      handlers: {
        "PUT /me/player/play": (c) => (c.body?.includes(URI_A) ? spotifyError(404, "Not found.") : undefined),
      },
    });
    const { Ctor } = fakeSdk();
    const banners: string[] = [];
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
      onBanner: (t) => banners.push(t),
    });
    await a.prepare(row("Agua Florida"), songs[0] as never);
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const first = req(URI_A);
    a.startItem(first.r);
    // the engine already scheduled the next item at the planned second, three minutes on
    const next = req(URI_B, { delaySec: 180 });
    a.startItem(next.r);
    await vi.advanceTimersByTimeAsync(3000);
    expect(first.ev.errors).toHaveLength(1);
    expect(first.ev.errors[0]).toContain("Agua Florida");
    expect(banners.at(-1)).toContain("Agua Florida");
    expect(banners.at(-1)).not.toMatch(/answered 404/);
    // the next item did not wait out the skipped song's three minutes
    expect(sp.plays().filter((c) => c.body?.includes(URI_B))).toHaveLength(1);
    expect(next.ev.errors).toEqual([]);
  });

  it("an invalid uri (400 Invalid track uri, or a malformed one) is passed over at once, never retried", async () => {
    vi.useFakeTimers();
    quiet();
    const sp = spotify({
      handlers: { "PUT /me/player/play": () => spotifyError(400, "Invalid track uri: spotify:track:x") },
    });
    const { Ctor } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const one = req(URI_A);
    a.startItem(one.r);
    await vi.advanceTimersByTimeAsync(100);
    expect(one.ev.errors).toHaveLength(1);
    expect(sp.plays()).toHaveLength(1);
    const bad = req("spotify:track:nope");
    a.startItem(bad.r);
    await vi.advanceTimersByTimeAsync(100);
    expect(bad.ev.errors).toHaveLength(1);
    expect(sp.plays()).toHaveLength(1);
  });

  it("Spotify down (5xx twice) holds the item with a retry banner instead of skipping the rest of the night", async () => {
    vi.useFakeTimers();
    quiet();
    let down = true;
    const sp = spotify({
      handlers: {
        "PUT /me/player/play": () => (down ? spotifyError(503, "Service unavailable") : undefined),
      },
    });
    const { Ctor } = fakeSdk();
    const banners: Array<{ text: string; run?: () => void }> = [];
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
      onBanner: (text, action) => banners.push({ text, run: action?.run }),
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const { r, ev } = req(URI_A);
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ev.errors).toEqual([]);
    expect(ev.ended).toBe(0);
    expect(banners.at(-1)!.text).toContain("503");
    down = false;
    banners.at(-1)!.run!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sp.plays().at(-1)!.body).toContain(URI_A);
    expect(a.roomState().waiting).toBe(false);
  });

  it("not_ready → the SDK player reconnects and the night plays on the new device id", async () => {
    vi.useFakeTimers();
    quiet();
    const { Ctor, players } = fakeSdk(["dev-1", "dev-2"]);
    const sp = spotify({ devices: () => [dev("dev-1"), dev("dev-2")] });
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    players[0]!.fire("not_ready", { device_id: "dev-1" });
    await vi.advanceTimersByTimeAsync(100);
    expect(players[0]!.disconnects).toBe(1);
    expect(players[0]!.connects).toBe(2);
    const { r, ev } = req(URI_A);
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(100);
    expect(ev.errors).toEqual([]);
    expect(sp.plays().at(-1)!.url).toContain("device_id=dev-2");
  });
});

describe("round 23: Spotify Connect where the browser can't play (iPhone Safari)", () => {
  it("a phone lists the account's devices and plays on the Spotify app, without loading the SDK", async () => {
    vi.useFakeTimers();
    const sp = spotify({
      devices: () => [dev("tv", { type: "TV" }), dev("iphone", { type: "Smartphone", name: "iPhone" })],
      handlers: {
        "GET /me/player": () =>
          json({ is_playing: true, progress_ms: 5000, item: { uri: URI_A, duration_ms: 170_000 } }),
      },
    });
    const loadSdk = vi.fn();
    const banners: string[] = [];
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk,
      phone: true,
      onBanner: (t) => banners.push(t),
    });
    await a.connect();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(a.roomState().devices.map((d) => d.id)).toEqual(["tv", "iphone"]);
    expect(a.roomState().remote).toBe("iphone");
    expect(a.roomState().remoteName).toBe("iPhone");
    expect(banners.at(-1)).toContain("iPhone");
    expect(a.capabilities.fade).toBe(false);
    const { r, ev } = req(URI_A, { durationSec: 45 });
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(100);
    expect(sp.plays()).toHaveLength(1);
    expect(sp.plays()[0]!.url).toContain("device_id=iphone");
    // a cortina's planned stop: a pause on that device, and the night moves on
    await vi.advanceTimersByTimeAsync(45_000);
    expect(ev.ended).toBe(1);
    expect(sp.calls.some((c) => c.url.includes("/me/player/pause?device_id=iphone"))).toBe(true);
  });

  it("no device at all: a human banner, the item waits, and plays once the Spotify app shows up", async () => {
    vi.useFakeTimers();
    let devices: unknown[] = [];
    const sp = spotify({ devices: () => devices });
    const banners: Array<{ text: string; action?: string }> = [];
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: vi.fn(),
      phone: true,
      waitPollMs: 1000,
      onBanner: (text, action) => banners.push({ text, action: action?.label }),
    });
    await a.connect();
    expect(banners.at(-1)?.text).toBe(
      "Spotify couldn't find this device. Open Spotify on this phone or pick a device under Room.",
    );
    expect(banners.at(-1)?.action).toBe("Open Spotify");
    const { r, ev } = req(URI_A);
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ev.errors).toEqual([]);
    expect(sp.plays()).toHaveLength(0);
    expect(a.roomState().waiting).toBe(true);
    devices = [dev("iphone", { type: "Smartphone", name: "iPhone" })];
    await vi.advanceTimersByTimeAsync(2500);
    expect(sp.plays()).toHaveLength(1);
    expect(sp.plays()[0]!.url).toContain("device_id=iphone");
    expect(a.roomState().waiting).toBe(false);
  });

  it("the ROOM pick moves the night to a Connect device; its end is read from /me/player", async () => {
    vi.useFakeTimers();
    let state: unknown = { is_playing: true, progress_ms: 1000, item: { uri: URI_A, duration_ms: 170_000 } };
    const sp = spotify({
      devices: () => [dev("dev-1"), dev("speaker", { type: "Speaker", name: "Salon" })],
      handlers: { "GET /me/player": () => json(state) },
    });
    const { Ctor } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    await a.selectDevice("speaker");
    expect(a.roomState().remote).toBe("speaker");
    const { r, ev } = req(URI_A);
    const h = a.startItem(r);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sp.plays()[0]!.url).toContain("device_id=speaker");
    expect(h.position()).toBeGreaterThan(0.9);
    state = { is_playing: false, progress_ms: 0, item: { uri: URI_A, duration_ms: 170_000 } };
    await vi.advanceTimersByTimeAsync(3000);
    expect(ev.ended).toBe(1);
  });

  it("an SDK device that never registers on Spotify falls back to the account's active device", async () => {
    vi.useFakeTimers();
    quiet();
    const sp = spotify({ devices: () => [dev("mac-app", { is_active: true, name: "MacBook" })] });
    const { Ctor } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
      deviceWaitMs: 1000,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(5000);
    await connecting;
    expect(a.roomState().browserUnusable).toBe(true);
    expect(a.roomState().remote).toBe("mac-app");
    const { r } = req(URI_A);
    a.startItem(r);
    await vi.advanceTimersByTimeAsync(100);
    expect(sp.plays()[0]!.url).toContain("device_id=mac-app");
  });
});

describe("round 21: Premium plays full tracks (the booth no longer falls back to clips for a Premium login)", () => {
  const me = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  const ALL = ["streaming", "user-modify-playback-state", "user-read-playback-state", "user-read-private"];
  it("a Premium profile is available", async () => {
    const a = new SpotifyAdapter({ fetchImpl: me({ user: { id: "u", product: "premium" }, scopes: ALL }) });
    expect(await a.available()).toMatchObject({ ok: true, premium: true });
  });
  it("a profile without `product` (no user-read-private, app mode) is tried, not called free", async () => {
    const a = new SpotifyAdapter({ fetchImpl: me({ user: { id: "u" } }) });
    expect(await a.available()).toMatchObject({ ok: true, premium: null });
  });
  it("a login without the streaming scope asks to reconnect", async () => {
    const a = new SpotifyAdapter({
      fetchImpl: me({ user: { id: "u", product: "premium" }, scopes: ["playlist-modify-private"] }),
    });
    expect(await a.available()).toMatchObject({ ok: false, reconnect: true });
  });
  it("a free account says so", async () => {
    const a = new SpotifyAdapter({ fetchImpl: me({ user: { id: "u", product: "free" }, scopes: ALL }) });
    expect(await a.available()).toMatchObject({ ok: false, premium: false });
  });
});

describe("2026-11: an iPad in Safari plays through the Spotify app (Spotify Connect)", () => {
  const IPAD_SAFARI =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  afterEach(() => vi.unstubAllGlobals());
  const me = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  const ALL = ["streaming", "user-modify-playback-state", "user-read-playback-state", "user-read-private"];
  it("iPadOS Safari reports a Mac: its touch points tell it apart, a real Mac stays a Mac", () => {
    vi.stubGlobal("navigator", { userAgent: IPAD_SAFARI, maxTouchPoints: 5 });
    expect(isAppleMobile(IPAD_SAFARI)).toBe(true);
    vi.stubGlobal("navigator", { userAgent: IPAD_SAFARI, maxTouchPoints: 0 });
    expect(isAppleMobile(IPAD_SAFARI)).toBe(false);
  });
  it("on an iPad the browser is never the player: no SDK, the iPad's own Spotify app is picked, no fades", async () => {
    vi.stubGlobal("navigator", { userAgent: IPAD_SAFARI, maxTouchPoints: 5 });
    const sp = spotify({
      devices: () => [dev("tv", { type: "TV" }), dev("ipad", { type: "Tablet", name: "iPad" })],
    });
    const loadSdk = vi.fn();
    const a = new SpotifyAdapter({ fetchImpl: sp.fetchImpl, loadSdk });
    expect(a.roomState().browserUnusable).toBe(true);
    await a.connect();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(a.roomState().remote).toBe("ipad");
    expect(a.capabilities.fade).toBe(false);
  });
  it("Premium with no device: availability stays Spotify (the booth asks for a device, never 30 s clips)", async () => {
    vi.stubGlobal("navigator", { userAgent: IPAD_SAFARI, maxTouchPoints: 5 });
    const a = new SpotifyAdapter({
      fetchImpl: me({ user: { id: "u", product: "premium" }, scopes: ALL }),
      loadSdk: vi.fn(),
    });
    expect(await a.available()).toMatchObject({ ok: true, premium: true });
    expect(a.roomState().remote).toBeNull();
    expect(a.roomState().browserUnusable).toBe(true);
  });
});

/**
 * 2026-11 — the DJ-user review on an iPad (the Booth plays through the Spotify app via Connect): Mute / Talk / the
 * master change the device's own level relative to where it was, the first change is never dropped, a device without
 * volume control is said so; a skip is one play; Spotify confirms the new track before "Playing".
 */
describe("2026-11: Spotify Connect — volume, confirmation, re-attach", () => {
  const ipad = (o: Record<string, unknown> = {}) =>
    dev("ipad", { type: "Tablet", name: "iPad", is_active: true, ...o });
  /** a Connect account whose iPad reports `volume_percent` (it follows what the booth sets) */
  function connect(o: { supports?: boolean; volume?: number } = {}) {
    let volume = o.volume ?? 80;
    let uri = URI_A;
    const sp = spotify({
      devices: () => [ipad({ supports_volume: o.supports !== false })],
      handlers: {
        "GET /me/player": () =>
          json({
            is_playing: true,
            progress_ms: 4000,
            item: { uri, duration_ms: 170_000 },
            device: {
              id: "ipad",
              name: "iPad",
              volume_percent: o.supports === false ? null : volume,
              supports_volume: o.supports !== false,
            },
          }),
        "PUT /me/player/volume": (c) => {
          volume = Number(/volume_percent=(\d+)/.exec(c.url)![1]);
          return undefined;
        },
      },
    });
    const a = new SpotifyAdapter({ fetchImpl: sp.fetchImpl, loadSdk: vi.fn(), phone: true });
    const vols = () =>
      sp.calls
        .filter((c) => c.url.includes("/me/player/volume"))
        .map((c) => Number(/volume_percent=(\d+)/.exec(c.url)![1]));
    return {
      sp,
      a,
      vols,
      setDeviceVolume: (v: number) => {
        volume = v;
      },
      setUri: (u: string) => {
        uri = u;
      },
    };
  }

  it("the device's level is read when the night starts; Mute sends 0 and unmute restores 80 (never 100)", async () => {
    const { a, vols } = connect();
    await a.connect();
    expect(a.capabilities).toEqual({ fade: false, volume: true, gain: false });
    expect(a.deviceBaseVolume()).toBe(80);
    a.setMaster(0, { resync: true });
    await a.volumeSettled();
    expect(vols()).toEqual([0]);
    a.setMaster(1);
    await a.volumeSettled();
    expect(vols()).toEqual([0, 80]);
  });

  it("Talk dips to ≈ 25 % of the current level and restores it; a level changed on the iPad is honoured", async () => {
    const { a, vols, setDeviceVolume } = connect();
    await a.connect();
    a.setMaster(10 ** (-12 / 20), { resync: true });
    await a.volumeSettled();
    expect(vols()).toEqual([20]);
    a.setMaster(1);
    await a.volumeSettled();
    expect(vols()).toEqual([20, 80]);
    // the DJ turns the iPad down to 60 by hand: Talk dips from there and comes back to 60
    setDeviceVolume(60);
    a.setMaster(10 ** (-12 / 20), { resync: true });
    await a.volumeSettled();
    a.setMaster(1);
    await a.volumeSettled();
    expect(vols().slice(2)).toEqual([15, 60]);
  });

  it("the master maps relative to the device's level; the first change is never dropped; +6 dB caps at 100", async () => {
    const { a, vols } = connect({ volume: 50 });
    await a.connect();
    a.setMaster(10 ** (-6 / 20));
    await a.volumeSettled();
    expect(vols()).toEqual([25]);
    a.setMaster(10 ** (6 / 20));
    await a.volumeSettled();
    expect(vols()).toEqual([25, 100]);
  });

  it("a slider dragged fast sends the latest value, one request at a time", async () => {
    const { a, vols } = connect();
    await a.connect();
    for (const db of [-1, -2, -3, -4, -5, -6]) a.setMaster(10 ** (db / 20));
    await a.volumeSettled();
    expect(vols().at(-1)).toBe(40);
    expect(vols().length).toBeLessThanOrEqual(2);
  });

  it("no volume control (the iOS Spotify app): capabilities say so and no volume request is ever sent", async () => {
    const { a, vols } = connect({ supports: false });
    await a.connect();
    expect(a.capabilities.volume).toBe(false);
    a.setMaster(0, { resync: true });
    await a.volumeSettled();
    a.setMaster(1);
    await a.volumeSettled();
    expect(vols()).toEqual([]);
  });

  it("a start on Connect is confirmed once /me/player reports the new uri (Starting… until then)", async () => {
    vi.useFakeTimers();
    const { a, sp, setUri } = connect();
    await a.connect();
    const started: boolean[] = [];
    const { r } = req(URI_B, { onStarted: (c) => started.push(c) });
    // the device keeps answering the old uri for a moment
    const h = a.startItem(r);
    await vi.advanceTimersByTimeAsync(50);
    expect(sp.plays()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(started).toEqual([]);
    setUri(URI_B);
    await vi.advanceTimersByTimeAsync(400);
    expect(started).toEqual([true]);
    h.cancel(true);
  });

  it("an unconfirmed start gives up after ~3 s (the status leaves Starting…)", async () => {
    vi.useFakeTimers();
    const { a } = connect();
    await a.connect();
    const started: boolean[] = [];
    const h = a.startItem(req(URI_B, { onStarted: (c) => started.push(c) }).r);
    await vi.advanceTimersByTimeAsync(2500);
    expect(started).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toEqual([false]);
    h.cancel(true);
  });

  it("a skip hands the device over without a pause (cancel(true)); a plain cancel still pauses", async () => {
    vi.useFakeTimers();
    const { a, sp } = connect();
    await a.connect();
    const one = a.startItem(req(URI_A).r);
    await vi.advanceTimersByTimeAsync(500);
    one.cancel(true);
    expect(sp.calls.some((c) => c.url.includes("/me/player/pause"))).toBe(false);
    const two = a.startItem(req(URI_B).r);
    await vi.advanceTimersByTimeAsync(500);
    two.cancel();
    await vi.advanceTimersByTimeAsync(10);
    expect(sp.calls.some((c) => c.url.includes("/me/player/pause"))).toBe(true);
  });

  it("re-attach after a reload: no play request, the clock runs from Spotify's position", async () => {
    vi.useFakeTimers();
    const { a, sp } = connect();
    const now = await a.nowPlaying();
    expect(now).toMatchObject({ playing: true, uri: URI_A, deviceId: "ipad", deviceName: "iPad" });
    a.adopt("ipad", "iPad");
    expect(a.roomState().remote).toBe("ipad");
    const h = a.startItem(req(URI_A, { attached: true, positionSec: 4 }).r);
    expect(h.position()).toBeCloseTo(4, 1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(sp.plays()).toHaveLength(0);
    expect(h.position()).toBeGreaterThan(4);
    h.cancel(true);
  });
});

describe("2026-11: seek inside the playing song (the owner: the slider went to 0, the song started late)", () => {
  const ipad = () => dev("ipad", { type: "Tablet", name: "iPad", is_active: true });
  it("Connect: one PUT /me/player/seek at the new position — no new play — and the clock reads it at once", async () => {
    vi.useFakeTimers();
    const sp = spotify({
      devices: () => [ipad()],
      handlers: {
        // the device keeps reporting where it was for a moment (Spotify applies the seek ~0.5 s later)
        "GET /me/player": () =>
          json({
            is_playing: true,
            progress_ms: 4000,
            item: { uri: URI_A, duration_ms: 170_000 },
            device: { id: "ipad", name: "iPad", volume_percent: 80, supports_volume: true },
          }),
      },
    });
    const a = new SpotifyAdapter({ fetchImpl: sp.fetchImpl, loadSdk: vi.fn(), phone: true });
    await a.connect();
    const h = a.startItem(req(URI_A).r);
    await vi.advanceTimersByTimeAsync(600);
    expect(sp.plays()).toHaveLength(1);
    expect(h.seek?.(60, {})).toBe(true);
    expect(h.position()).toBeCloseTo(60, 1);
    await vi.advanceTimersByTimeAsync(20);
    const seeks = sp.calls.filter((c) => c.url.includes("/me/player/seek"));
    expect(seeks).toHaveLength(1);
    expect(seeks[0]!.method).toBe("PUT");
    expect(seeks[0]!.url).toBe("https://api.spotify.com/v1/me/player/seek?position_ms=60000&device_id=ipad");
    expect(sp.plays()).toHaveLength(1);
    // a stale report (4 s) right after the seek never pulls the clock back
    await vi.advanceTimersByTimeAsync(1200);
    expect(h.position()).toBeGreaterThanOrEqual(60);
    h.cancel(true);
  });

  it("Web Playback SDK: player.seek(ms) on this browser's player, no play request; a timed item re-arms its stop", async () => {
    vi.useFakeTimers();
    const sp = spotify();
    const { Ctor, players } = fakeSdk();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      noFades: false,
      phone: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const seeks: number[] = [];
    (players[0] as unknown as { seek: (ms: number) => Promise<void> }).seek = async (ms) => {
      seeks.push(ms);
    };
    const { r, ev } = req(URI_A, { durationSec: 100 });
    const h = a.startItem(r);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.seek?.(80, { durationSec: 20 })).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(seeks).toEqual([80000]);
    expect(sp.plays()).toHaveLength(1);
    expect(h.position()).toBeGreaterThanOrEqual(80);
    // it now ends 20 s after the seek, not 100 s after its start
    await vi.advanceTimersByTimeAsync(19_000);
    expect(ev.ended).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(ev.ended).toBe(1);
  });

  it("Connect: the slider follows the device, not the plan — 0.8 s off at the start, < 0.3 s after its reports", async () => {
    vi.useFakeTimers();
    let t0 = 0;
    const sp = spotify({
      devices: () => [ipad()],
      handlers: {
        // the device started 0.8 s further in than the play asked (buffering, its own latency)
        "GET /me/player": () =>
          json({
            is_playing: true,
            progress_ms: t0 ? Date.now() - t0 + 800 : 0,
            item: { uri: URI_A, duration_ms: 170_000 },
            device: { id: "ipad", name: "iPad", volume_percent: 80, supports_volume: true },
          }),
        "PUT /me/player/play": () => {
          t0 = Date.now();
          return undefined;
        },
      },
    });
    const a = new SpotifyAdapter({ fetchImpl: sp.fetchImpl, loadSdk: vi.fn(), phone: true });
    await a.connect();
    const h = a.startItem(req(URI_A).r);
    await vi.advanceTimersByTimeAsync(5000);
    const device = (Date.now() - t0 + 800) / 1000;
    expect(Math.abs(h.position() - device)).toBeLessThan(0.3);
    h.cancel(true);
  });

  it("before the play went out there is nothing to seek: false (the engine restarts it)", async () => {
    vi.useFakeTimers();
    const sp = spotify({ devices: () => [ipad()] });
    const a = new SpotifyAdapter({ fetchImpl: sp.fetchImpl, loadSdk: vi.fn(), phone: true });
    await a.connect();
    const h = a.startItem(req(URI_A, { delaySec: 30 }).r);
    expect(h.seek?.(60, {})).toBe(false);
    h.cancel();
  });
});

describe("2026-11: the Mac app (no Widevine in its WebKit view) plays through the Spotify app on the Mac", () => {
  it("probes the SDK first: without Widevine no SDK is loaded and the one computer of the account is picked", async () => {
    vi.useFakeTimers();
    const sp = spotify({
      devices: () => [
        dev("speaker", { type: "Speaker" }),
        dev("mac", { type: "Computer", name: "Ario's Mac" }),
      ],
    });
    const loadSdk = vi.fn();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk,
      app: true,
      probeSdk: async () => false,
    });
    await a.connect();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(a.roomState().browserUnusable).toBe(true);
    expect(a.roomState().remote).toBe("mac");
    expect(a.capabilities.fade).toBe(false);
    expect(a.capabilities.gain).toBe(false);
  });

  it("no Spotify app open on the Mac: the banner offers Open Spotify (the app wakes it), then picks it", async () => {
    vi.useFakeTimers();
    let open = false;
    const sp = spotify({ devices: () => (open ? [dev("mac", { type: "Computer" })] : []) });
    const banners: Array<{ text: string; label?: string }> = [];
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: vi.fn(),
      app: true,
      probeSdk: async () => false,
      onBanner: (text, action) => banners.push({ text, label: action?.label }),
    });
    await a.connect();
    expect(banners.at(-1)?.label).toBe("Open Spotify");
    expect(banners.at(-1)?.text).toMatch(/Mac/);
    open = true;
    await a.retryNow();
    expect(a.roomState().remote).toBe("mac");
  });

  it("a view with Widevine still uses the SDK", async () => {
    vi.useFakeTimers();
    const { Ctor } = fakeSdk(["dev-1"]);
    const sp = spotify();
    const a = new SpotifyAdapter({
      fetchImpl: sp.fetchImpl,
      loadSdk: async () => Ctor,
      app: true,
      probeSdk: async () => true,
    });
    const done = a.connect();
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(a.roomState().browserUnusable).toBe(false);
  });

  it("autoPick: the active device wins; the Mac app prefers the single computer; two computers ask", () => {
    const d = (id: string, type: string, isActive = false) => ({
      id,
      name: id,
      type,
      isActive,
      restricted: false,
      supportsVolume: true,
      isThis: false,
    });
    expect(autoPick([d("tv", "TV"), d("mac", "Computer")], false, "computer")?.id).toBe("mac");
    expect(autoPick([d("tv", "TV"), d("mac", "Computer")], false)).toBeNull();
    expect(autoPick([d("tv", "TV", true), d("mac", "Computer")], false, "computer")?.id).toBe("tv");
    expect(autoPick([d("a", "Computer"), d("b", "Computer")], false, "computer")).toBeNull();
  });

  it("sdkPlayable: false without EME or when Widevine is refused", async () => {
    expect(await sdkPlayable(undefined)).toBe(false);
    expect(await sdkPlayable({} as Navigator)).toBe(false);
    const refuse = { requestMediaKeySystemAccess: () => Promise.reject(new Error("no")) };
    expect(await sdkPlayable(refuse as unknown as Navigator)).toBe(false);
    const ok = { requestMediaKeySystemAccess: async () => ({}) };
    expect(await sdkPlayable(ok as unknown as Navigator)).toBe(true);
  });
});

describe("2026-11: the Spotify app interrupted (a call, Siri, another app) — the Booth notices, never drifts", () => {
  it("a Connect device paused mid-song for a moment reports an interruption once, and the item does not end", async () => {
    vi.useFakeTimers();
    let state: Record<string, unknown> = {
      is_playing: true,
      progress_ms: 4000,
      item: { uri: URI_A, duration_ms: 170_000 },
      device: { id: "phone", name: "iPhone" },
    };
    const sp = spotify({
      devices: () => [dev("phone", { type: "Smartphone", name: "iPhone", is_active: true })],
      handlers: { "GET /me/player": () => json(state) },
    });
    const a = new SpotifyAdapter({ fetchImpl: sp.fetchImpl, loadSdk: vi.fn(), phone: true });
    const said: Array<string | null> = [];
    a.onInterrupted = (d) => said.push(d);
    quiet();
    await a.connect();
    const { r, ev } = req(URI_A);
    const h = a.startItem(r);
    await vi.advanceTimersByTimeAsync(5000);
    expect(said).toEqual([]);
    // a call comes in: the Spotify app pauses at 1:00
    state = { ...state, is_playing: false, progress_ms: 60_000 };
    await vi.advanceTimersByTimeAsync(1500);
    expect(said).toEqual([]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(said).toEqual(["iPhone"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(said).toHaveLength(1);
    expect(ev.ended).toBe(0);
    h.cancel(true);
  });
});
