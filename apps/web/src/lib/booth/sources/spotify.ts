"use client";
import type { Cortina, Song } from "@tdj/core";
import { t as tx } from "@/lib/i18n";
import { openExternal } from "@/lib/openLink";
import { dbToGain, fadeOutCurve, VOLUME_STEP_SEC, volumeSteps } from "../envelope";
import type { BoothRow } from "../plan";
import { PauseWatch } from "./spotifyHold";
import type {
  ExternalCapabilities,
  ExternalHandle,
  ExternalPlayer,
  ExternalStart,
  PlanEntity,
  PreparedItem,
  SourceAdapter,
} from "./types";

/* ---- the subset of the Web Playback SDK the adapter uses ---- */
export interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  track_window?: { current_track?: { uri?: string } };
}
export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (e: unknown) => void): void;
  getCurrentState(): Promise<SdkState | null>;
  setVolume(v: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** the SDK's in-place seek (ms); optional: a player without it seeks through the Web API */
  seek?(ms: number): Promise<void>;
}
export interface SdkPlayerCtor {
  new (o: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }): SdkPlayer;
}
declare global {
  interface Window {
    Spotify?: { Player: SdkPlayerCtor };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const API = "https://api.spotify.com/v1";
export const NOT_PREMIUM = () => tx("booth.sources.spotify.your_spotify_account_is_not_premium");
export const NOT_LOGGED_IN = () => tx("booth.sources.spotify.not_logged_in_with_spotify");
export const NEEDS_RECONNECT = () => tx("booth.sources.spotify.reconnect_spotify_to_play_full_songs");
/** the Web Playback SDK and the Web API's play endpoints need these */
export const STREAMING_SCOPES = ["streaming", "user-modify-playback-state", "user-read-playback-state"];
export const LICENCE_NOTE = () => tx("booth.sources.spotify.spotify_s_sdk_terms_restrict_commercial");
export const NO_FADES_IPAD = () => tx("booth.sources.spotify.no_fades_on_ipad_with_spotify");

export const isAppleMobile = (ua = typeof navigator !== "undefined" ? navigator.userAgent : "") =>
  /iPad|iPhone|iPod/.test(ua) ||
  (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
/**
 * A phone browser (iPhone Safari, Android): Spotify does not support the Web Playback SDK there, so the night plays
 * through the Spotify app (Spotify Connect) instead. An iPad tries the SDK first and falls back the same way.
 */
export const isPhone = (ua = typeof navigator !== "undefined" ? navigator.userAgent : "") =>
  /iPhone|iPod|Android.*Mobile|Mobile.*Android/.test(ua);

/** T-DJ's own app (Tauri: the Mac, iPhone and iPad apps), not a browser */
export const inNativeApp = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

/**
 * Can this web view run the Web Playback SDK at all? It needs Widevine (EME `com.widevine.alpha`): Chrome, Edge and
 * Firefox have it; the Mac app's WebKit view does not (nor does any iOS / iPadOS web view), so there the night plays
 * through Spotify Connect from the start, with no 10 s wait for an SDK that cannot come up.
 */
export async function sdkPlayable(
  nav: Pick<Navigator, "requestMediaKeySystemAccess"> | undefined = typeof navigator !== "undefined"
    ? navigator
    : undefined,
): Promise<boolean> {
  if (!nav?.requestMediaKeySystemAccess) return false;
  try {
    await nav.requestMediaKeySystemAccess("com.widevine.alpha", [
      { initDataTypes: ["cenc"], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] },
    ]);
    return true;
  } catch {
    return false;
  }
}

/** a Spotify track uri the Web API accepts: `spotify:track:` and a 22-character base62 id */
export const isTrackUri = (uri: unknown): uri is string =>
  typeof uri === "string" && /^spotify:track:[0-9A-Za-z]{22}$/.test(uri);

/** The SDK's volume steps for a fade: the −60 dB log curve sampled every 50 ms (a 4 s fade ≈ 80 calls). */
export function fadeVolumes(sec: number, from = 1): number[] {
  return Array.from(fadeOutCurve(volumeSteps(sec) + 1, from)).slice(1);
}

/* ---- errors, said plainly ---- */

/** One Spotify Web API failure as the booth log keeps it (status, Spotify's reason and message, what was asked). */
export interface SpotifyLogEntry {
  at: string;
  op: string;
  status: number;
  reason?: string;
  message?: string;
  device?: string | null;
  uri?: string;
  title?: string;
  note?: string;
}

export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | undefined,
    readonly apiMessage: string | undefined,
    readonly op: string,
  ) {
    super(
      tx("booth.sources.spotify.spotify_answered_detail", {
        status,
        detail: apiMessage ? `: ${apiMessage}` : "",
      }),
    );
  }
  /** Spotify named the device as the problem ("Device not found", NO_ACTIVE_DEVICE) */
  get namesDevice(): boolean {
    return this.reason === "NO_ACTIVE_DEVICE" || /device/i.test(this.apiMessage ?? "");
  }
  /** Spotify said the track itself cannot play (an invalid / unknown uri, a market restriction) */
  get aboutTrack(): boolean {
    if (this.status === 400) return /uri|base62|track|id\b/i.test(this.apiMessage ?? "");
    if (this.status === 403)
      return this.reason !== "PREMIUM_REQUIRED" && !/device/i.test(this.apiMessage ?? "");
    if (this.status === 404) return /track|uri|resource|non existing id/i.test(this.apiMessage ?? "");
    return false;
  }
}
/** the track can't be played: the night moves on to the next item */
export class TrackUnplayable extends Error {
  constructor(
    readonly uri: string,
    readonly title: string | undefined,
  ) {
    super(
      title
        ? tx("booth.sources.spotify.track_unplayable", { title })
        : tx("booth.sources.spotify.track_unplayable_untitled"),
    );
  }
}
/** no Spotify device to play on: the item waits (with a banner) until one appears or the DJ picks one */
export class NoDevice extends Error {
  constructor(text = noDeviceText(isPhone() || isAppleMobile())) {
    super(text);
  }
}
const noDeviceText = (phone: boolean) =>
  phone
    ? tx("booth.sources.spotify.device_not_found_phone")
    : tx("booth.sources.spotify.device_not_found_browser");

/** A Spotify Connect device (`/me/player/devices`). */
export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  restricted: boolean;
  supportsVolume: boolean;
  /** the TDJ Booth player in this browser (the Web Playback SDK) */
  isThis: boolean;
}
/** What the ROOM picker shows: the account's devices and where the night plays. */
export interface SpotifyRoomState {
  devices: SpotifyDevice[];
  /** null: this browser (the SDK player); else the Connect device id the night plays on */
  remote: string | null;
  remoteName: string | null;
  /** this browser can't play Spotify itself (a phone, or the SDK never registered) */
  browserUnusable: boolean;
  /** an item waits for a device */
  waiting: boolean;
  loading: boolean;
  /** the latest Spotify errors, newest first */
  errors: SpotifyLogEntry[];
}

let currentAdapter: SpotifyAdapter | null = null;
const roomListeners = new Set<() => void>();
/** the booth's Spotify adapter (once the booth made one), for the ROOM picker */
export const spotifyRoom = () => currentAdapter;
export function onSpotifyRoom(f: () => void): () => void {
  roomListeners.add(f);
  return () => roomListeners.delete(f);
}
const emitRoom = () => {
  for (const f of roomListeners) f();
};
/** the booth banner's "Pick a device" opens the ROOM sheet through this event */
export const OPEN_ROOM_EVENT = "tdj:booth-open-room";

interface Options {
  fetchImpl?: typeof fetch;
  loadSdk?: () => Promise<SdkPlayerCtor>;
  /** iOS / iPadOS: the SDK exposes no volume control there */
  noFades?: boolean;
  /** a phone browser: no SDK, the night plays through the Spotify app (Connect) */
  phone?: boolean;
  onBanner?: (text: string, action?: { label: string; run: () => void }) => void;
  /** every Spotify error (also kept in `log` and written to the console) */
  onLog?: (e: SpotifyLogEntry) => void;
  /** how long to wait for a device to register on Spotify's side (ms) */
  deviceWaitMs?: number;
  /** how often to look for a device while an item waits for one (ms) */
  waitPollMs?: number;
  /** T-DJ's own app (Tauri): the SDK is probed before it is tried, and the local Spotify app is preferred */
  app?: boolean;
  /** the Widevine probe (`sdkPlayable`), for the tests */
  probeSdk?: () => Promise<boolean>;
}

function defaultLoadSdk(): Promise<SdkPlayerCtor> {
  if (window.Spotify?.Player) return Promise.resolve(window.Spotify.Player);
  return new Promise((ok, fail) => {
    window.onSpotifyWebPlaybackSDKReady = () => ok(window.Spotify!.Player);
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => fail(new Error(tx("booth.sources.spotify.could_not_load_the_spotify_player")));
    document.head.appendChild(s);
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// the wall clock (fake timers in the tests drive it too)
const now = () => Date.now();

/**
 * Spotify Web Playback SDK (round7-booth.md §8.2): Premium hosted sessions only. The browser becomes a Spotify
 * Connect device ("TDJ Booth"); items start through the Web API with the short-lived token from
 * `/api/spotify/access`; the engine's timeline for these items follows `getCurrentState()` polled every 250 ms;
 * fades are `setVolume()` steps every 50 ms along the same curve as the graph's.
 *
 * Round 23 (the "Spotify answered 404" night): a 404 from `/me/player/play` is almost always the device, not the
 * track — the SDK's `ready` fires before Spotify has registered the device, the device went away (`not_ready`: a
 * background tab, iOS Safari), or the id is an old session's. So: wait for the device to appear in
 * `/me/player/devices` (≤ 5 s) before the first transfer; on a 404, re-transfer, wait, reconnect the SDK if it went
 * away, and play again; a track Spotify can't play is passed over (with its title) and the next item starts; with
 * no device the item waits with a banner. Where the SDK can't play (a phone browser, or a device that never
 * registers) the night plays through a Spotify Connect device — the Spotify app on the phone, a computer, a speaker
 * — picked under ROOM: start, pause, next and the position (polled every second) work there; fades do not.
 */
export class SpotifyAdapter implements SourceAdapter, ExternalPlayer {
  readonly kind = "spotify" as const;
  /**
   * 2026-11: what the night's device can do — fades (the SDK's volume steps), the volume at all (a Connect device's
   * `supports_volume`: the iOS Spotify app has none) and the per-item gain (only the SDK applies it).
   */
  capabilities: Required<ExternalCapabilities> = { fade: true, volume: true, gain: true };
  external: ExternalPlayer = this;
  /** the latest Spotify errors (newest last), for diagnosis */
  readonly log: SpotifyLogEntry[] = [];
  private fetchImpl: typeof fetch;
  private loadSdk: () => Promise<SdkPlayerCtor>;
  private player: SdkPlayer | null = null;
  private deviceId: string | null = null;
  private sdkReady = false;
  private readyWaiters: Array<(r: string | Error) => void> = [];
  private sdkFades: boolean;
  private phone: boolean;
  /** the SDK can't play here: a phone, an initialization error, a device Spotify never registered */
  private sdkUnusable: boolean;
  /** the Connect device the night plays on (null: this browser) */
  private remote: string | null = null;
  private devices: SpotifyDevice[] = [];
  private master = 1;
  /** the engine's output gain (mute, master, talk) as asked; > 1 above 0 dB */
  private outGain = 1;
  /* 2026-11 — the Connect device's volume, relative to its own level (never 100 % out of nowhere) */
  /** the device's level (%) that the master's 0 dB stands for; null until read from `GET /me/player` */
  private baseVolume: number | null = null;
  /** the gain the device's level reflects now, and the level (%) last set or read */
  private appliedGain = 1;
  private appliedPct: number | null = null;
  /** what `supports_volume` said for the night's device on its last read (null: not read yet) */
  private remoteVolumeOk: boolean | null = null;
  private wantResync = false;
  private volumeRun: Promise<void> | null = null;
  private premium: boolean | null = null;
  private onBanner: Options["onBanner"];
  private onLog: Options["onLog"];
  private deviceWaitMs: number;
  private waitPollMs: number;
  private tokenCache: { access: string; until: number } | null = null;
  private connecting: Promise<void> | null = null;
  private reconnecting: Promise<boolean> | null = null;
  private titles = new Map<string, string>();
  /** every item handed to `startItem` that has not ended */
  private lives = new Set<Live>();
  /** how long a Connect start waits for Spotify to confirm the new track (ms), and how often it asks */
  confirmMs = 3000;
  confirmPollMs = 300;
  /** the item that last started playing (it owns the volume and the SDK's state events) */
  private owner: Live | null = null;
  /** seconds the night runs ahead of the engine's plan after a passed-over track (see `pullForward`) */
  private shiftSec = 0;
  /** consecutive 403s on play: a device that refuses everything, not a run of unplayable tracks */
  private refusedRun = 0;
  private waitTimer: ReturnType<typeof setInterval> | null = null;
  private loading = false;
  private snap: SpotifyRoomState;
  /** 2026-11: the Mac / iPad / iPhone app (see `Options.app`) */
  private app: boolean;
  private probeSdk: () => Promise<boolean>;
  private probed: Promise<boolean> | null = null;

  constructor(o: Options = {}) {
    this.fetchImpl = o.fetchImpl ?? ((...a) => fetch(...a));
    this.loadSdk = o.loadSdk ?? defaultLoadSdk;
    this.sdkFades = !(o.noFades ?? isAppleMobile());
    // 2026-11: an iPad too (iPadOS Safari reports a Mac; isAppleMobile checks its touch points): Safari on iOS and
    // iPadOS has no Web Playback SDK (no Widevine), so the night plays through the Spotify app from the start
    this.phone = o.phone ?? (isPhone() || isAppleMobile());
    this.sdkUnusable = this.phone;
    this.app = o.app ?? inNativeApp();
    this.probeSdk = o.probeSdk ?? (() => sdkPlayable());
    this.syncCaps();
    this.onBanner = o.onBanner;
    this.onLog = o.onLog;
    this.deviceWaitMs = o.deviceWaitMs ?? 5000;
    this.waitPollMs = o.waitPollMs ?? 2500;
    this.snap = this.makeSnap();
    currentAdapter = this;
    emitRoom();
    if (typeof document !== "undefined")
      document.addEventListener?.("visibilitychange", () => {
        if (document.visibilityState === "visible") this.onVisible();
      });
    // the Mac app stays visible while the DJ opens Spotify beside it: coming back is a focus, not a visibility change
    if (this.app && typeof window !== "undefined") window.addEventListener?.("focus", () => this.onVisible());
  }

  /**
   * Round 21 (the "I have Premium, why rehearsal?" bug): the booth used to require `product === "premium"` from
   * `/v1/me`, so a Premium account whose profile came back without `product` (Spotify only returns it with the
   * `user-read-private` scope, and leaves it out of some app modes) was told it is not Premium and the night fell back
   * to 30 s clips. Now: a session without the `streaming` scope is asked to reconnect (one tap, re-consent); an
   * explicit non-Premium product says so; an unknown product is tried — the Web Playback SDK itself reports a
   * non-Premium account (`account_error`) when the night connects.
   */
  async available(): Promise<{
    ok: boolean;
    reason?: string;
    reconnect?: boolean;
    premium?: boolean | null;
  }> {
    const j = await this.fetchImpl("/api/spotify/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!j?.user) {
      this.premium = null;
      return { ok: false, reason: NOT_LOGGED_IN() };
    }
    const scopes: string[] | undefined = Array.isArray(j.scopes) ? j.scopes : undefined;
    if (scopes && !STREAMING_SCOPES.every((x) => scopes.includes(x))) {
      this.premium = null;
      return { ok: false, reason: NEEDS_RECONNECT(), reconnect: true };
    }
    const product = typeof j.user.product === "string" ? j.user.product : null;
    this.premium = product === null ? null : product === "premium";
    if (this.premium === false) return { ok: false, reason: NOT_PREMIUM(), premium: false };
    return { ok: true, premium: this.premium };
  }

  async resolve(item: BoothRow, entity: PlanEntity) {
    const uri = uriOf(entity);
    if (uri && item?.title) this.titles.set(uri, item.title);
    return uri ? ("ready" as const) : ("missing" as const);
  }
  async prepare(item: BoothRow, entity: PlanEntity): Promise<PreparedItem> {
    const uri = uriOf(entity);
    if (!uri) throw new Error(tx("booth.sources.spotify.no_spotify_track_for_this_item"));
    if (item?.title) this.titles.set(uri, item.title);
    return { kind: "spotify", spotifyUri: uri, durationSec: item.lengthSec };
  }
  release() {}

  /* ---------- diagnosis ---------- */

  private record(e: Omit<SpotifyLogEntry, "at">) {
    const entry: SpotifyLogEntry = { at: new Date().toISOString(), ...e };
    this.log.push(entry);
    if (this.log.length > 100) this.log.shift();
    if (typeof console !== "undefined") console.warn("[booth] spotify", JSON.stringify(entry));
    this.onLog?.(entry);
    this.emit();
  }

  /* ---------- the token ---------- */

  private async token(fresh = false): Promise<string> {
    const c = this.tokenCache;
    if (!fresh && c && c.until > Date.now()) return c.access;
    const j = await this.fetchImpl("/api/spotify/access")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!j?.access) {
      this.tokenCache = null;
      throw new Error(tx("booth.sources.spotify.spotify_session_expired_log_in_again"));
    }
    const exp = typeof j.expires === "number" ? j.expires : Date.now() + 5 * 60_000;
    this.tokenCache = { access: j.access as string, until: Math.min(exp - 60_000, Date.now() + 10 * 60_000) };
    return j.access as string;
  }

  /* ---------- the Web API ---------- */

  /**
   * One Web API call. 401: once more with a fresh token; 429: once more after Retry-After (≤ 5 s); 5xx: once more
   * after 0.4 s. Any other failure is logged and thrown as a SpotifyApiError (status, reason, message).
   */
  private async api(
    method: "GET" | "PUT" | "POST",
    path: string,
    body?: unknown,
    ctx: { op?: string; uri?: string; quiet?: boolean } = {},
  ): Promise<Response> {
    let fresh = false;
    for (let attempt = 0; ; attempt++) {
      const t = await this.token(fresh);
      const r = await this.fetchImpl(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.ok || r.status === 204) return r;
      const j = await r
        .clone()
        .json()
        .catch(() => null);
      const err = new SpotifyApiError(
        r.status,
        typeof j?.error?.reason === "string" ? j.error.reason : undefined,
        typeof j?.error?.message === "string"
          ? j.error.message
          : typeof j?.error === "string"
            ? j.error
            : undefined,
        ctx.op ?? `${method} ${path.split("?")[0]}`,
      );
      if (!ctx.quiet || attempt > 0)
        this.record({
          op: err.op,
          status: err.status,
          reason: err.reason,
          message: err.apiMessage,
          device: deviceOf(path),
          uri: ctx.uri,
          title: ctx.uri ? this.titles.get(ctx.uri) : undefined,
        });
      if (attempt > 0) throw err;
      if (r.status === 401) {
        fresh = true;
        continue;
      }
      if (r.status === 429) {
        const after = Number(r.headers.get("retry-after") ?? "1");
        await sleep(Math.min(5, Number.isFinite(after) ? after : 1) * 1000);
        continue;
      }
      if (r.status >= 500) {
        await sleep(400);
        continue;
      }
      throw err;
    }
  }

  /** The account's Spotify Connect devices (and refreshes the ROOM picker). */
  async listDevices(): Promise<SpotifyDevice[]> {
    this.loading = true;
    this.emit();
    try {
      const r = await this.api("GET", "/me/player/devices", undefined, { op: "devices" });
      const j = r.status === 204 ? null : await r.json().catch(() => null);
      const list: unknown[] = Array.isArray(j?.devices) ? j.devices : [];
      this.devices = list
        .map((d) => d as Record<string, unknown>)
        .filter((d) => typeof d.id === "string" && d.id)
        .map((d) => ({
          id: d.id as string,
          name: typeof d.name === "string" ? d.name : "Spotify",
          type: typeof d.type === "string" ? d.type : "Unknown",
          isActive: d.is_active === true,
          restricted: d.is_restricted === true,
          supportsVolume: d.supports_volume !== false,
          isThis: d.id === this.deviceId,
        }));
    } catch {
      // the list stays as it was; the error is in the log
    } finally {
      this.loading = false;
      this.syncCaps();
      this.emit();
    }
    return this.devices;
  }

  /** Poll `/me/player/devices` until `id` is listed (Spotify registers a new SDK device a moment after `ready`). */
  private async waitForDevice(id: string, ms = this.deviceWaitMs): Promise<boolean> {
    const until = now() + ms;
    for (;;) {
      const list = await this.listDevices();
      if (list.some((d) => d.id === id)) return true;
      if (now() >= until) return false;
      await sleep(500);
    }
  }

  /** Transfer playback to `id` without playing; a 404 waits for the device to register and tries once more. */
  private async transferTo(id: string, play = false): Promise<boolean> {
    for (let i = 0; i < 2; i++) {
      try {
        await this.api("PUT", "/me/player", { device_ids: [id], play }, { op: "transfer", quiet: i === 0 });
        return true;
      } catch (e) {
        if (!(e instanceof SpotifyApiError) || e.status !== 404 || i > 0) return false;
        if (!(await this.waitForDevice(id))) return false;
      }
    }
    return false;
  }

  /* ---------- the SDK player ---------- */

  private waitReady(ms: number): Promise<string> {
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== done);
        fail(new Error(tx("booth.sources.spotify.could_not_connect_to_spotify")));
      }, ms);
      const done = (r: string | Error) => {
        clearTimeout(timer);
        if (r instanceof Error) fail(r);
        else ok(r);
      };
      this.readyWaiters.push(done);
    });
  }
  private settleReady(r: string | Error) {
    const ws = this.readyWaiters;
    this.readyWaiters = [];
    for (const w of ws) w(r);
  }

  private async makePlayer(): Promise<SdkPlayer> {
    const Player = await this.loadSdk();
    const p = new Player({
      name: tx("booth.sources.spotify.tdj_booth"),
      getOAuthToken: (cb) =>
        this.token(true).then(cb, () =>
          this.onBanner?.(tx("booth.sources.spotify.spotify_session_expired_log_in_again")),
        ),
      volume: this.master,
    });
    // every `ready` (the first and each reconnect) names the device id Spotify plays on
    p.addListener("ready", (e) => {
      const id = (e as { device_id?: string }).device_id;
      if (!id) return;
      this.deviceId = id;
      this.sdkReady = true;
      this.emit();
      this.settleReady(id);
    });
    p.addListener("not_ready", (e) => {
      this.sdkReady = false;
      this.record({ op: "sdk not_ready", status: 0, device: (e as { device_id?: string })?.device_id });
      // the device went offline (a background tab, the network): connect again, quietly when it works
      if (!this.remote) void this.reconnect();
    });
    p.addListener("authentication_error", (e) => {
      this.record({ op: "sdk authentication_error", status: 401, message: msgOf(e) });
      this.settleReady(new Error(tx("booth.sources.spotify.spotify_session_expired_log_in_again")));
    });
    p.addListener("account_error", (e) => {
      this.record({ op: "sdk account_error", status: 403, message: msgOf(e) });
      this.settleReady(new Error(NOT_PREMIUM()));
    });
    p.addListener("initialization_error", (e) => {
      this.record({ op: "sdk initialization_error", status: 0, message: msgOf(e) });
      this.settleReady(new Error(tx("booth.sources.spotify.this_browser_cannot_run_the_spotify")));
    });
    p.addListener("playback_error", (e) => {
      this.record({ op: "sdk playback_error", status: 0, message: msgOf(e), uri: this.owner?.uri });
      // a track that never got going: pass it over like a track Spotify refused
      if (this.owner && !this.remote && this.owner.justStarted()) this.owner.trackFailed();
    });
    p.addListener("autoplay_failed", () =>
      this.onBanner?.(tx("booth.sources.spotify.spotify_needs_a_tap_press_play")),
    );
    p.addListener("player_state_changed", (s) => {
      if (this.remote) return;
      const st = s as SdkState | null;
      if (st === null && this.owner?.isPlaying()) {
        // playback was moved to another device (the Spotify app took over)
        this.onBanner?.(tx("booth.sources.spotify.spotify_moved_to_another_device"), {
          label: tx("booth.sources.spotify.take_back"),
          run: () => void (this.deviceId && this.transferTo(this.deviceId, true)),
        });
        return;
      }
      this.owner?.onState(st);
    });
    return p;
  }

  /** The SDK player connected and its device registered on Spotify's side; the device id. */
  private async ensureSdk(): Promise<string> {
    if (this.player && this.sdkReady && this.deviceId) return this.deviceId;
    if (!this.player) this.player = await this.makePlayer();
    const ready = this.waitReady(10_000);
    const ok = await this.player.connect();
    if (!ok) {
      ready.catch(() => {});
      throw new Error(tx("booth.sources.spotify.could_not_connect_to_spotify"));
    }
    return ready;
  }

  /** `not_ready` or a device Spotify lost: disconnect and connect the SDK again; true when it is back and listed. */
  reconnect(): Promise<boolean> {
    if (this.reconnecting) return this.reconnecting;
    this.reconnecting = (async () => {
      try {
        this.sdkReady = false;
        this.player?.disconnect();
        const id = await this.ensureSdk();
        const listed = await this.waitForDevice(id);
        this.record({ op: "sdk reconnect", status: listed ? 200 : 0, device: id });
        if (listed) this.retryWaiting();
        return listed;
      } catch (e) {
        this.record({ op: "sdk reconnect", status: 0, message: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        this.reconnecting = null;
        this.emit();
      }
    })();
    return this.reconnecting;
  }

  /** From the `Start the night` gesture: create the player, connect, transfer playback here without playing. */
  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
  private async doConnect(): Promise<void> {
    if (this.remote) {
      await this.listDevices();
      // the device's own level, when the night starts (a re-attach, a device picked before the night)
      if (this.baseVolume === null) await this.readVolume();
      return;
    }
    // 2026-11: the app's WebKit view has no Widevine: Connect at once, the Spotify app on this Mac first
    if (!this.sdkUnusable && this.app && !this.player) {
      this.probed ??= this.probeSdk().catch(() => false);
      if (!(await this.probed)) {
        this.record({ op: "connect", status: 0, note: "no Widevine in this view: Spotify Connect" });
        this.fallBackToConnect();
      }
    }
    if (!this.sdkUnusable) {
      try {
        if (this.player && this.sdkReady && this.deviceId) return;
        const id = await this.ensureSdk();
        // round 23: Spotify registers the device a moment after `ready`; a transfer before that is a 404
        let listed = await this.waitForDevice(id);
        if (!listed) listed = await this.reconnect();
        if (listed) {
          await this.transferTo(this.deviceId ?? id);
          return;
        }
        this.record({ op: "connect", status: 404, device: id, note: "the SDK device never registered" });
        this.fallBackToConnect();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === NOT_PREMIUM() || msg === tx("booth.sources.spotify.spotify_session_expired_log_in_again"))
          throw e;
        this.fallBackToConnect();
      }
    }
    // Spotify Connect: the Spotify app on this phone (or another device of the account)
    const list = await this.listDevices();
    const pick = this.remote ? null : this.pick(list);
    if (pick) this.selectRemote(pick);
    else if (!this.remote) this.bannerNoDevice();
    // 2026-11: the device's own level, read when the night starts (the master and Mute work relative to it)
    if (this.remote) await this.readVolume();
  }
  /** this browser can't play Spotify: fades off, the night plays on a Connect device */
  private fallBackToConnect() {
    this.sdkUnusable = true;
    this.syncCaps();
    this.emit();
  }
  /** the night's device decides what the booth may promise (fades, volume, gain) */
  private syncCaps() {
    const connect = !!this.remote || this.sdkUnusable;
    this.capabilities.fade = this.sdkFades && !connect;
    this.capabilities.gain = !connect;
    if (!connect) this.capabilities.volume = true;
    else {
      const d = this.remote ? this.devices.find((x) => x.id === this.remote) : this.pick(this.devices);
      this.capabilities.volume = this.remote
        ? (this.remoteVolumeOk ?? d?.supportsVolume ?? true)
        : (d?.supportsVolume ?? false);
    }
  }
  private selectRemote(d: SpotifyDevice) {
    if (this.remote !== d.id) {
      this.baseVolume = null;
      this.appliedPct = null;
      this.appliedGain = 1;
      this.remoteVolumeOk = null;
    }
    this.remote = d.id;
    this.syncCaps();
    this.emit();
    this.onBanner?.(tx("booth.sources.spotify.plays_on_device", { name: d.name }), {
      label: tx("booth.sources.spotify.change_device"),
      run: openRoom,
    });
  }

  /**
   * The ROOM picker: null plays on this browser (the SDK player), an id on that Spotify Connect device. A track
   * playing now moves there at its position (Spotify's transfer); an item waiting for a device starts.
   */
  async selectDevice(id: string | null): Promise<void> {
    const playing = this.owner?.isPlaying() ?? false;
    if (id === null || id === this.deviceId) {
      this.remote = null;
      this.sdkUnusable = this.phone && !this.deviceId;
      this.syncCaps();
      this.emit();
      if (this.sdkUnusable) return this.bannerNoDevice();
      try {
        await this.connect();
        if (this.deviceId) await this.transferTo(this.deviceId, playing);
        this.retryWaiting();
      } catch (e) {
        this.onBanner?.(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    const d = this.devices.find((x) => x.id === id) ?? {
      id,
      name: "Spotify",
      type: "Unknown",
      isActive: false,
      restricted: false,
      supportsVolume: true,
      isThis: false,
    };
    if (playing && !this.remote) void this.player?.pause().catch(() => {});
    this.selectRemote(d);
    if (playing) await this.transferTo(id, true);
    await this.readVolume();
    this.retryWaiting();
  }

  /**
   * 2026-11 (a reload while Spotify kept playing on the iPad): the night plays on this Connect device — no transfer,
   * no play; the booth takes its timeline back.
   */
  adopt(id: string, name?: string | null) {
    if (!this.devices.some((d) => d.id === id))
      this.devices = [
        ...this.devices,
        {
          id,
          name: name ?? "Spotify",
          type: "Unknown",
          isActive: true,
          restricted: false,
          supportsVolume: true,
          isThis: id === this.deviceId,
        },
      ];
    this.sdkUnusable = this.sdkUnusable || this.phone;
    this.selectRemote(this.devices.find((d) => d.id === id)!);
  }
  /** what plays on the account now (`GET /me/player`): the reload check */
  nowPlaying(): Promise<RemoteState | null> {
    return this.remoteState();
  }

  private onPhone() {
    return this.phone || isAppleMobile();
  }
  /** the device to play on when this view can't (the Mac app: the Spotify app on this computer first) */
  private pick(list: SpotifyDevice[]): SpotifyDevice | null {
    return autoPick(list, this.phone, this.app && !this.phone ? "computer" : undefined);
  }
  /** why no device plays, in this device's words (the Mac app: open the Spotify app on this Mac) */
  private noDevice(): string {
    if (this.app && !this.onPhone()) return tx("booth.sources.spotify.device_not_found_mac_app");
    return noDeviceText(this.onPhone());
  }
  private bannerNoDevice(text = this.noDevice()) {
    // the apps can wake the Spotify app themselves (the Mac's, or the one on this iPhone / iPad)
    const phone = this.onPhone() || (this.app && this.sdkUnusable);
    this.onBanner?.(text, {
      label: phone ? tx("booth.sources.spotify.open_spotify") : tx("booth.sources.spotify.try_again"),
      run: phone ? openSpotifyApp : () => void this.retryNow(),
    });
  }
  /** the banner's "Try again": reconnect this browser, list the devices, start an item that waits */
  async retryNow(): Promise<void> {
    if (!this.remote && !this.sdkUnusable) await this.reconnect();
    else await this.listDevices();
    if (!this.remote && this.sdkUnusable) {
      const pick = this.pick(this.devices);
      if (pick) this.selectRemote(pick);
    }
    this.retryWaiting();
  }
  private onVisible() {
    // back from the Spotify app (or a background tab): the device may be there now
    if (!this.remote && !this.sdkUnusable && this.player && !this.sdkReady) void this.reconnect();
    else if (this.waitingLive()) void this.retryNow();
    else if (this.sdkUnusable || this.remote) void this.listDevices();
  }

  /* ---------- playing ---------- */

  /** The device to play on: the chosen Connect device, else this browser's SDK device (connected); null: none. */
  private async target(): Promise<string | null> {
    if (this.remote) return this.remote;
    if (this.sdkUnusable) {
      const pick = this.pick(await this.listDevices());
      if (pick) {
        this.selectRemote(pick);
        return pick.id;
      }
      return null;
    }
    if (!this.player || !this.sdkReady || !this.deviceId) {
      await this.connect().catch(() => {});
      if (this.remote) return this.remote;
    }
    return this.sdkReady ? this.deviceId : null;
  }

  /**
   * A 404 on `dev`: on this browser, reconnect the SDK if it went away, wait for the device to be listed, transfer
   * to it; on a Connect device, check it is still listed and wake it with a transfer. The id to play on, or null.
   */
  private async recover(dev: string): Promise<string | null> {
    if (this.remote && dev === this.remote) {
      const list = await this.listDevices();
      if (!list.some((d) => d.id === dev)) return null;
      await this.transferTo(dev);
      return dev;
    }
    let listed = this.sdkReady && (await this.waitForDevice(dev));
    if (!listed) listed = await this.reconnect();
    const id = this.deviceId;
    if (listed && id) {
      await this.transferTo(id);
      return id;
    }
    // this browser's player never came back: play through Spotify Connect
    this.fallBackToConnect();
    const pick = this.pick(await this.listDevices());
    if (!pick) return null;
    this.selectRemote(pick);
    return pick.id;
  }

  /**
   * Play `uri` from `positionMs` on the night's device, recovering a lost device on the way (round 23). Throws
   * TrackUnplayable (pass the item over), NoDevice (wait for one) or another Error.
   */
  async playUri(uri: string, positionMs: number): Promise<void> {
    const title = this.titles.get(uri);
    if (!isTrackUri(uri)) {
      this.record({ op: "play", status: 0, uri, title, note: "not a spotify:track uri" });
      throw new TrackUnplayable(uri, title);
    }
    let dev = await this.target();
    if (!dev) throw new NoDevice(this.noDevice());
    let deviceVerified = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.api(
          "PUT",
          `/me/player/play?device_id=${encodeURIComponent(dev)}`,
          { uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) },
          { op: "play", uri },
        );
        this.refusedRun = 0;
        return;
      } catch (e) {
        if (!(e instanceof SpotifyApiError)) throw e;
        if (e.status === 403 && e.reason === "PREMIUM_REQUIRED") throw new Error(NOT_PREMIUM());
        if (e.status === 403 && ++this.refusedRun >= 3) {
          this.refusedRun = 0;
          throw new NoDevice(tx("booth.sources.spotify.device_refuses"));
        }
        if (e.status === 401)
          throw new Error(tx("booth.sources.spotify.spotify_session_expired_log_in_again"));
        if (e.aboutTrack) throw new TrackUnplayable(uri, title);
        if (e.status !== 404) throw e;
        // the device is listed and Spotify still says 404 without naming the device: it is the track
        if (deviceVerified && !e.namesDevice) throw new TrackUnplayable(uri, title);
        const next = await this.recover(dev);
        if (!next) throw new NoDevice(this.noDevice());
        deviceVerified = true;
        dev = next;
      }
    }
    throw new NoDevice(this.noDevice());
  }

  /**
   * Round 21 — audition a track (a tap on a row before the night, or "Preview only"): connect this device if needed
   * and play the recording from its start; `pauseAudition` stops it.
   */
  async audition(uri: string): Promise<void> {
    await this.connect();
    await this.playUri(uri, 0);
    if (!this.remote) await this.player?.setVolume(this.master).catch(() => {});
  }
  async pauseAudition(): Promise<void> {
    await this.pauseDevice();
  }

  /**
   * 2026-11 (seek): jump inside what plays now — this browser's player with the SDK's `seek`, a Connect device (or a
   * player without `seek`) with `PUT /me/player/seek`. Never a new play: the track keeps its buffer, the jump is
   * immediate.
   */
  async seekDevice(ms: number): Promise<void> {
    const at = Math.max(0, Math.round(ms));
    const p = this.remote ? null : this.player;
    if (p?.seek) {
      await p.seek(at).catch(() => {});
      return;
    }
    const dev = this.remote ?? this.deviceId;
    await this.api(
      "PUT",
      `/me/player/seek?position_ms=${at}${dev ? `&device_id=${encodeURIComponent(dev)}` : ""}`,
      undefined,
      { op: "seek" },
    ).catch(() => {});
  }

  /** pause whatever plays on the night's device */
  async pauseDevice(): Promise<void> {
    if (this.remote)
      await this.api("PUT", `/me/player/pause?device_id=${encodeURIComponent(this.remote)}`, undefined, {
        op: "pause",
        quiet: true,
      }).catch(() => {});
    else await this.player?.pause().catch(() => {});
  }
  /** the Connect device's playback state (`GET /me/player`), null when nothing plays */
  async remoteState(): Promise<RemoteState | null> {
    const r = await this.api("GET", "/me/player", undefined, { op: "state", quiet: true }).catch(() => null);
    if (!r || r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!j) return null;
    const d = j.device as Record<string, unknown> | undefined;
    return {
      playing: j.is_playing === true,
      positionMs: typeof j.progress_ms === "number" ? j.progress_ms : 0,
      durationMs: typeof j.item?.duration_ms === "number" ? j.item.duration_ms : 0,
      deviceId: typeof d?.id === "string" ? d.id : null,
      deviceName: typeof d?.name === "string" ? d.name : null,
      volume: typeof d?.volume_percent === "number" ? d.volume_percent : null,
      supportsVolume: d ? d.supports_volume !== false : null,
      uri: typeof j.item?.uri === "string" ? j.item.uri : null,
      hasItem: !!j.item,
    };
  }

  setMaster(gain: number, o: { resync?: boolean } = {}) {
    this.outGain = Math.max(0, gain);
    this.master = Math.max(0, Math.min(1, gain));
    if (this.remote) {
      if (o.resync) this.wantResync = true;
      void this.flushVolume();
      return;
    }
    if (this.owner) this.owner.applyVolume();
    else void this.player?.setVolume(this.master).catch(() => {});
  }
  /**
   * 2026-11 — read the Connect device's own level (`GET /me/player`). The device reflects `appliedGain`: a level
   * other than the one last set means the DJ moved it on the device, and the master's 0 dB follows it.
   */
  private async readVolume(): Promise<number | null> {
    const s = await this.remoteState();
    const dev = this.remote;
    if (!s || !dev || (s.deviceId && s.deviceId !== dev)) return null;
    if (s.supportsVolume !== null && s.supportsVolume !== this.remoteVolumeOk) {
      this.remoteVolumeOk = s.supportsVolume;
      this.syncCaps();
      this.emit();
    }
    if (s.supportsVolume === false || s.volume === null) return null;
    const v = s.volume;
    if (this.appliedPct === null || Math.abs(v - this.appliedPct) > 1) {
      this.baseVolume =
        this.appliedGain > 0.001 ? Math.min(100, v / this.appliedGain) : (this.baseVolume ?? v);
      this.appliedPct = v;
    }
    return v;
  }
  /**
   * The master on a Connect device: its level × the output gain (mute 0, talk −12 dB ≈ 25 %), never above 100 % and
   * never above the device's own level unless the DJ raises the master. One request at a time, the latest value
   * wins; the first change is never dropped; nothing is sent before the device's level is known.
   */
  private flushVolume(): Promise<void> {
    if (this.volumeRun) return this.volumeRun;
    this.volumeRun = (async () => {
      try {
        for (let i = 0; i < 50; i++) {
          const dev = this.remote;
          if (!dev || !this.capabilities.volume) return;
          const g = this.outGain;
          if (this.baseVolume === null || this.wantResync) {
            this.wantResync = false;
            await this.readVolume();
            if (!this.capabilities.volume) return;
          }
          if (this.baseVolume === null) return;
          const pct = Math.max(0, Math.min(100, Math.round(this.baseVolume * g)));
          if (pct !== this.appliedPct) {
            const ok = await this.api(
              "PUT",
              `/me/player/volume?volume_percent=${pct}&device_id=${encodeURIComponent(dev)}`,
              undefined,
              { op: "volume", quiet: true },
            ).then(
              () => true,
              () => false,
            );
            if (!ok) return;
            this.appliedPct = pct;
          }
          this.appliedGain = g;
          if (this.outGain === g && !this.wantResync) return;
        }
      } finally {
        this.volumeRun = null;
      }
    })();
    return this.volumeRun;
  }
  /** the device's level the master's 0 dB stands for (null until read) */
  deviceBaseVolume(): number | null {
    return this.baseVolume;
  }
  /** the volume work in flight (tests, and Mute's state follows the request) */
  volumeSettled(): Promise<void> {
    return this.volumeRun ?? Promise.resolve();
  }

  startItem(req: ExternalStart): ExternalHandle {
    if (![...this.lives].some((l) => !l.done)) this.shiftSec = 0;
    // the shift applies to the items the engine chains from its planned clock (a minute or more ahead), not to one
    // it starts from now (Next, a restart: a few seconds)
    const shift = req.delaySec > this.shiftSec + 5 ? this.shiftSec : 0;
    const live = new Live(this, req, Math.max(0, req.delaySec - shift));
    this.lives.add(live);
    return live;
  }

  /* ---------- the items' bookkeeping (internal for `Live`) ---------- */

  _player() {
    return this.player;
  }
  _master() {
    return this.master;
  }
  _remote() {
    return this.remote;
  }
  _isOwner(l: Live) {
    return this.owner === l;
  }
  /** `l` started playing: it owns the device; an earlier item still running or waiting is over */
  _began(l: Live) {
    this.owner = l;
    for (const o of [...this.lives]) if (o !== l && o.seq < l.seq && o.due) o.superseded();
    this.syncWaitPoll();
    this.emit();
  }
  _ended(l: Live) {
    this.lives.delete(l);
    if (this.owner === l) this.owner = null;
    this.syncWaitPoll();
    this.emit();
  }
  /**
   * A track was passed over: the next item (already scheduled by the engine at the planned second) starts now,
   * and the rest of the night follows it (`shiftSec`) so the floor never hears the skipped song's length in silence.
   */
  _pullForward(l: Live) {
    const next = [...this.lives]
      .filter((o) => o.seq > l.seq && !o.due && !o.done)
      .sort((a, b) => a.seq - b.seq);
    const first = next[0];
    if (!first) return;
    const ahead = first.dueIn() - 0.5;
    if (ahead <= 0) return;
    this.shiftSec += ahead;
    for (const o of next) o.reschedule(Math.max(0, o.dueIn() - ahead));
  }
  /**
   * 2026-11 (the night never stops by accident): Spotify stopped mid-song on the night's device without the Booth
   * asking (a call, Siri, another app) — the store holds the night there and offers Resume (lib/booth/continuity.ts)
   */
  onInterrupted: ((device: string | null) => void) | null = null;
  _interrupted() {
    this.record({ op: "interrupted", status: 0, uri: this.owner?.uri, note: "paused on the device" });
    this.onInterrupted?.(this.snap.remoteName ?? null);
  }
  _trackFailed(e: TrackUnplayable) {
    this.record({ op: "skip", status: 0, uri: e.uri, title: e.title, note: "passed over" });
    this.onBanner?.(e.message);
  }
  _waiting(text: string) {
    this.bannerNoDevice(text);
    this.syncWaitPoll();
    this.emit();
  }
  private waitingLive(): Live | null {
    const w = [...this.lives].filter((l) => l.waiting && !l.done).sort((a, b) => b.seq - a.seq);
    return w[0] ?? null;
  }
  /** the newest item waiting for a device tries again (the older ones are over: the night keeps its clock) */
  retryWaiting() {
    const w = this.waitingLive();
    if (w) void w.retry();
  }
  private syncWaitPoll() {
    const want = !!this.waitingLive();
    if (want && !this.waitTimer)
      this.waitTimer = setInterval(() => {
        if (this.reconnecting || this.connecting) return;
        void this.listDevices().then((list) => {
          const w = this.waitingLive();
          if (!w) return;
          const there = this.remote
            ? list.some((d) => d.id === this.remote)
            : this.sdkUnusable
              ? !!this.pick(list)
              : list.some((d) => d.id === this.deviceId);
          if (there) void this.retryNow();
        });
      }, this.waitPollMs);
    else if (!want && this.waitTimer) {
      clearInterval(this.waitTimer);
      this.waitTimer = null;
    }
  }

  /* ---------- the ROOM picker ---------- */

  private makeSnap(): SpotifyRoomState {
    const remote = this.remote;
    return {
      devices: this.devices,
      remote,
      remoteName: remote ? (this.devices.find((d) => d.id === remote)?.name ?? null) : null,
      browserUnusable: this.sdkUnusable,
      waiting: !!this.waitingLive?.(),
      loading: this.loading,
      errors: this.log.slice(-3).reverse(),
    };
  }
  private emit() {
    this.snap = this.makeSnap();
    if (currentAdapter === this) emitRoom();
  }
  /** for `useSyncExternalStore`: the same object until something changes */
  roomState(): SpotifyRoomState {
    return this.snap;
  }
  thisDeviceId() {
    return this.deviceId;
  }
}

export interface RemoteState {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  deviceId: string | null;
  deviceName: string | null;
  /** the device's `volume_percent` (null: not reported) */
  volume: number | null;
  /** the device's `supports_volume` (null: no device in the answer) */
  supportsVolume: boolean | null;
  /** the playing item's uri */
  uri: string | null;
  hasItem: boolean;
}

let liveSeq = 0;

/** One item on the Spotify timeline: start after the delay, poll the state, fade with volume steps, report the end. */
class Live implements ExternalHandle {
  readonly seq = ++liveSeq;
  readonly uri: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dueAt: number;
  private poll: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** the start time came (playing, or trying to) */
  due = false;
  private started = false;
  private startedAt = 0;
  done = false;
  /** waiting for a Spotify device */
  waiting = false;
  private busy = false;
  /** Spotify reported this track playing (or the confirmation gave up) */
  private confirmed = false;
  private playing = false;
  private pos = 0;
  private posAt = 0;
  private lastPos = 0;
  private duration = 0;
  /** 0…1 fade multiplier on top of the master */
  private level: number;
  private gain: number;
  /** 2026-11: a mid-song pause the Booth did not ask for (lib/booth/sources/spotifyHold.ts) */
  private hold = new PauseWatch();

  constructor(
    private a: SpotifyAdapter,
    private req: ExternalStart,
    delaySec: number,
  ) {
    this.uri = req.uri;
    this.gain = dbToGain(Math.min(0, req.gainDb));
    this.level = req.fadeInSec && a.capabilities.fade ? 0 : 1;
    this.dueAt = now() + delaySec * 1000;
    if (req.attached) {
      // 2026-11: it already plays on the device (a reload): take the timeline back, no play request
      this.due = true;
      this.begin(true);
      return;
    }
    this.timer = setTimeout(() => void this.start(), Math.max(0, delaySec * 1000));
  }

  dueIn(): number {
    return Math.max(0, (this.dueAt - now()) / 1000);
  }
  reschedule(sec: number) {
    if (this.due || this.done || !this.timer) return;
    clearTimeout(this.timer);
    this.dueAt = now() + sec * 1000;
    this.timer = setTimeout(() => void this.start(), sec * 1000);
  }
  justStarted() {
    return this.started && !this.done && now() - this.startedAt < 10_000 && this.position() < 1.5;
  }
  isPlaying() {
    return this.started && !this.done;
  }

  private async start() {
    this.timer = null;
    this.due = true;
    if (this.done) return;
    this.busy = true;
    try {
      if (!this.a._remote()) this.applyVolume();
      await this.a.playUri(this.req.uri, this.req.positionSec * 1000);
      if (this.done) return;
      this.begin(false);
    } catch (e) {
      if (this.done) return;
      if (e instanceof TrackUnplayable) return this.trackFailed(e);
      // no device, an expired session, Spotify down: the item waits with the reason and a one-tap retry — passing
      // it over would run the same failure through the rest of the night in seconds
      this.waiting = true;
      this.a._waiting(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
    }
  }
  /** the play went out (or, `attached`, it already plays): the item's timeline runs from here */
  private begin(attached: boolean) {
    this.waiting = false;
    this.started = true;
    this.playing = true;
    this.startedAt = now() - (attached ? 3500 : 0);
    this.posAt = now();
    this.pos = this.req.positionSec;
    this.a._began(this);
    if (!this.a._remote()) this.applyVolume();
    if (!attached && this.req.fadeInSec && this.a.capabilities.fade) this.fade(this.req.fadeInSec, true);
    const remote = !!this.a._remote();
    this.poll = setInterval(() => void this.tick(), remote ? 1000 : 250);
    if (this.req.durationSec !== undefined) {
      const fade = this.a.capabilities.fade ? (this.req.fadeOutSec ?? 0) : 0;
      const at = Math.max(0, this.req.durationSec - fade) * 1000;
      this.stopTimer = setTimeout(() => {
        if (this.done) return;
        this.stop(fade);
      }, at);
    }
    // 2026-11: on Connect the booth says "Starting…" until Spotify reports the new track (≤ 3 s)
    if (remote && !attached) void this.confirm();
    else this.confirmed = true;
    if (this.confirmed) this.req.onStarted?.(true);
  }
  /** Spotify Connect: poll `/me/player` until it plays this uri, or give up after `confirmMs` */
  private async confirm() {
    const until = now() + this.a.confirmMs;
    for (;;) {
      if (this.done) return;
      const s = await this.a.remoteState();
      if (this.done) return;
      if (s?.uri === this.uri && s.playing) {
        this.confirmed = true;
        this.onRemote(s);
        this.req.onStarted?.(true);
        return;
      }
      if (now() >= until) {
        this.confirmed = true;
        this.req.onStarted?.(false);
        return;
      }
      await sleep(this.a.confirmPollMs);
    }
  }
  /** a device appeared (or the DJ picked one): try again */
  async retry() {
    if (!this.waiting || this.done || this.busy) return;
    await this.start();
  }

  /** Spotify can't play this track: say so with its title, end it, start the next item now */
  trackFailed(e?: TrackUnplayable) {
    if (this.done) return;
    const err = e ?? new TrackUnplayable(this.uri, undefined);
    const msg = err.message;
    this.end(false);
    this.req.onError(msg);
    // after the engine's banner: the adapter's (the same words, without the "Spotify:" prefix)
    this.a._trackFailed(err);
    this.a._pullForward(this);
  }
  applyVolume() {
    if (this.a._remote() || (!this.a._isOwner(this) && this.started)) return;
    void this.a
      ._player()
      ?.setVolume(this.level * this.gain * this.a._master())
      .catch(() => {});
  }

  onState(s: SdkState | null) {
    if (!s || this.done) return;
    if (this.stale(s.position / 1000)) return;
    this.pos = s.position / 1000;
    this.posAt = now();
    this.playing = !s.paused;
    this.duration = s.duration / 1000;
    if (s.paused && s.position === 0 && this.lastPos > this.duration - 1.5 && this.started)
      this.finish(false);
    this.lastPos = this.pos;
    this.watchHold();
  }
  /** paused mid-song for a moment, not by the Booth (a pause it asks for ends the item first) */
  private watchHold() {
    if (this.done || !this.confirmed || !this.a._isOwner(this)) return;
    if (
      this.hold.observe({ playing: this.playing, positionSec: this.pos, durationSec: this.duration }, now())
    )
      this.a._interrupted();
  }
  private onRemote(s: RemoteState | null) {
    if (this.done) return;
    // (until Spotify switched, `/me/player` still reports the track before: not this item's clock)
    if (!this.confirmed && s?.uri && s.uri !== this.uri) return;
    const settled = now() - this.startedAt > 3000;
    if (s?.hasItem && this.stale(s.positionMs / 1000)) return;
    if (!s?.hasItem) {
      if (settled) this.finish(false);
      return;
    }
    this.pos = s.positionMs / 1000;
    this.posAt = now();
    this.playing = s.playing;
    this.duration = s.durationMs / 1000;
    // the track played to its end: Spotify stops (the request held one uri) at 0 or at the end
    if (settled && !s.playing && (s.positionMs === 0 || s.positionMs >= s.durationMs - 2500))
      this.finish(false);
    this.lastPos = this.pos;
    if (settled) this.watchHold();
  }
  private async tick() {
    if (this.done) return;
    if (this.a._remote()) {
      const s = await this.a.remoteState();
      this.onRemote(s);
      return;
    }
    const s = await this.a._player()?.getCurrentState();
    if (s) this.onState(s);
  }

  position() {
    if (!this.started) return 0;
    return this.pos + (this.playing ? (now() - this.posAt) / 1000 : 0);
  }

  /** a seek went out at this time to this position: reports that disagree for a moment are the old position */
  private seekGuard: { until: number; at: number; sentAt: number } | null = null;
  /** a state report from before the seek took effect (Spotify applies it ~0.3–1 s later): ignore it */
  private stale(posSec: number): boolean {
    const g = this.seekGuard;
    if (!g) return false;
    if (now() > g.until) {
      this.seekGuard = null;
      return false;
    }
    const expected = g.at + (now() - g.sentAt) / 1000;
    if (Math.abs(posSec - expected) > 1.5) return true;
    this.seekGuard = null;
    return false;
  }
  /** 2026-11: an edited transition's end: stop `endsInSec` from now with its fade (volume steps where it can fade) */
  retime(o: { endsInSec: number; fadeOutSec: number }) {
    if (this.done) return;
    if (!this.started) {
      // not playing yet: its request carries the new end
      this.req = { ...this.req, durationSec: o.endsInSec, fadeOutSec: o.fadeOutSec };
      return;
    }
    if (this.stopTimer) clearTimeout(this.stopTimer);
    const fade = this.a.capabilities.fade ? Math.max(0, o.fadeOutSec) : 0;
    this.stopTimer = setTimeout(
      () => {
        if (!this.done) this.stop(fade);
      },
      Math.max(0, o.endsInSec - fade) * 1000,
    );
  }
  /** 2026-11: jump inside the playing track in place (no new play); false before the play went out */
  seek(positionSec: number, o: { durationSec?: number }): boolean {
    if (!this.started || this.done || !this.a._isOwner(this)) return false;
    const at = Math.max(0, positionSec);
    this.pos = at;
    this.posAt = now();
    this.playing = true;
    this.seekGuard = { until: now() + 2500, at, sentAt: now() };
    this.hold.reset();
    // a fade out in progress (the item was about to end) is called off: it plays at its level from the new point
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
      this.level = 1;
      this.applyVolume();
    }
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (o.durationSec !== undefined) {
      const fade = this.a.capabilities.fade ? (this.req.fadeOutSec ?? 0) : 0;
      this.stopTimer = setTimeout(
        () => {
          if (!this.done) this.stop(fade);
        },
        Math.max(0, o.durationSec - fade) * 1000,
      );
    }
    void this.a.seekDevice(at * 1000);
    return true;
  }

  private fade(sec: number, up: boolean) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const vols = fadeVolumes(sec);
    let i = 0;
    this.fadeTimer = setInterval(() => {
      const v = vols[i++];
      if (v === undefined) {
        clearInterval(this.fadeTimer!);
        this.fadeTimer = null;
        this.level = up ? 1 : 0;
        this.applyVolume();
        if (!up) this.finish(true);
        return;
      }
      this.level = up ? 1 - v : v;
      this.applyVolume();
    }, VOLUME_STEP_SEC * 1000);
  }

  cancel(keepPlaying = false) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const wasPlaying = this.started && this.a._isOwner(this);
    this.end(wasPlaying && !keepPlaying);
  }
  stop(fadeSec: number) {
    if (this.done) return;
    if (!this.started) return this.cancel();
    if (fadeSec > 0 && this.a.capabilities.fade) this.fade(fadeSec, false);
    else this.finish(true);
  }
  /** a later item started playing: this one is over (without pausing: the device plays the next one now) */
  superseded() {
    if (this.done) return;
    this.end(false);
    this.req.onEnded();
  }
  private finish(pause: boolean) {
    if (this.done) return;
    this.end(pause && this.a._isOwner(this));
    this.req.onEnded();
  }
  private end(pause: boolean) {
    if (this.done) return;
    this.done = true;
    this.waiting = false;
    if (pause) void this.a.pauseDevice();
    if (this.timer) clearTimeout(this.timer);
    if (this.poll) clearInterval(this.poll);
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.timer = null;
    this.poll = null;
    this.fadeTimer = null;
    this.stopTimer = null;
    this.a._ended(this);
  }
}

/** The device to play on when the browser can't: the active one, else on a phone the phone itself, else the only one. */
export function autoPick(list: SpotifyDevice[], phone: boolean, prefer?: "computer"): SpotifyDevice | null {
  const usable = list.filter((d) => !d.restricted && !d.isThis);
  const computers = usable.filter((d) => d.type === "Computer");
  return (
    usable.find((d) => d.isActive) ??
    (phone ? usable.find((d) => d.type === "Smartphone" || d.type === "Tablet") : undefined) ??
    // 2026-11: the Mac app plays through the Spotify app on the same Mac: the one computer of the account
    (prefer === "computer" && computers.length === 1 ? computers[0]! : undefined) ??
    (usable.length === 1 ? usable[0]! : null)
  );
}

/**
 * "Open Spotify": the Spotify app on this device (its own `spotify:` scheme; in T-DJ's apps through the native
 * opener, never by navigating the app's view away), else open.spotify.com — a universal link iOS gives the app.
 * Back in the booth (focus / visibility) the devices are looked up again and the app is picked.
 */
export function openSpotifyApp() {
  if (typeof window === "undefined") return;
  if (inNativeApp()) void openExternal("spotify:", { fallback: "https://open.spotify.com" });
  else window.location.href = "spotify:";
}
function openRoom() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_ROOM_EVENT));
}
function msgOf(e: unknown): string | undefined {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : undefined;
}
function deviceOf(path: string): string | null {
  const m = /device_id=([^&]+)/.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}

function uriOf(entity: PlanEntity): string | null {
  if (!entity) return null;
  const uri = (entity as Song | Cortina).spotify?.uri;
  return isTrackUri(uri) ? uri : null;
}
