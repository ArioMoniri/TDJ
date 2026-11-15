import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Playlist, planBooth, type Song } from "@tdj/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoothRow } from "../plan";
import { decorate, planEntities } from "../plan";
import { isTrackUri, type SdkPlayer, type SdkPlayerCtor, SpotifyAdapter } from "./spotify";
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
