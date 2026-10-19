"use client";
import type { Cortina, Song } from "@tdj/core";
import { dbToGain, fadeOutCurve, VOLUME_STEP_SEC, volumeSteps } from "../envelope";
import type { BoothRow } from "../plan";
import type {
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
export const NOT_PREMIUM =
  "Your Spotify account is not Premium: Spotify does not allow playback in the browser.";
export const NOT_LOGGED_IN = "Not logged in with Spotify.";
export const LICENCE_NOTE = "Spotify's SDK terms restrict commercial use; check them for paid events.";
export const NO_FADES_IPAD = "No fades on iPad with Spotify: cortinas stop at their planned second instead.";

export const isAppleMobile = (ua = typeof navigator !== "undefined" ? navigator.userAgent : "") =>
  /iPad|iPhone|iPod/.test(ua) ||
  (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);

/** The SDK's volume steps for a fade: the −60 dB log curve sampled every 50 ms (a 4 s fade ≈ 80 calls). */
export function fadeVolumes(sec: number, from = 1): number[] {
  return Array.from(fadeOutCurve(volumeSteps(sec) + 1, from)).slice(1);
}

interface Options {
  fetchImpl?: typeof fetch;
  loadSdk?: () => Promise<SdkPlayerCtor>;
  /** iOS / iPadOS: the SDK exposes no volume control there */
  noFades?: boolean;
  onBanner?: (text: string, action?: { label: string; run: () => void }) => void;
}

function defaultLoadSdk(): Promise<SdkPlayerCtor> {
  if (window.Spotify?.Player) return Promise.resolve(window.Spotify.Player);
  return new Promise((ok, fail) => {
    window.onSpotifyWebPlaybackSDKReady = () => ok(window.Spotify!.Player);
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => fail(new Error("Could not load the Spotify player"));
    document.head.appendChild(s);
  });
}

/**
 * Spotify Web Playback SDK (round7-booth.md §8.2): Premium hosted sessions only. The browser becomes a Spotify
 * Connect device ("TDJ Booth"); items start through the Web API with the short-lived token from
 * `/api/spotify/access`; the engine's timeline for these items follows `getCurrentState()` polled every 250 ms;
 * fades are `setVolume()` steps every 50 ms along the same curve as the graph's.
 */
export class SpotifyAdapter implements SourceAdapter, ExternalPlayer {
  readonly kind = "spotify" as const;
  capabilities = { fade: true };
  external: ExternalPlayer = this;
  private fetchImpl: typeof fetch;
  private loadSdk: () => Promise<SdkPlayerCtor>;
  private player: SdkPlayer | null = null;
  private deviceId: string | null = null;
  private master = 1;
  private premium: boolean | null = null;
  private onBanner: Options["onBanner"];
  private live: Live | null = null;

  constructor(o: Options = {}) {
    this.fetchImpl = o.fetchImpl ?? ((...a) => fetch(...a));
    this.loadSdk = o.loadSdk ?? defaultLoadSdk;
    this.capabilities.fade = !(o.noFades ?? isAppleMobile());
    this.onBanner = o.onBanner;
  }

  async available() {
    const j = await this.fetchImpl("/api/spotify/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!j?.user) {
      this.premium = null;
      return { ok: false, reason: NOT_LOGGED_IN };
    }
    this.premium = j.user.product === "premium";
    return this.premium ? { ok: true } : { ok: false, reason: NOT_PREMIUM };
  }

  async resolve(_item: BoothRow, entity: PlanEntity) {
    return uriOf(entity) ? ("ready" as const) : ("missing" as const);
  }
  async prepare(item: BoothRow, entity: PlanEntity): Promise<PreparedItem> {
    const uri = uriOf(entity);
    if (!uri) throw new Error("No Spotify track for this item");
    return { kind: "spotify", spotifyUri: uri, durationSec: item.lengthSec };
  }
  release() {}

  private async token(): Promise<string> {
    const j = await this.fetchImpl("/api/spotify/access").then((r) => (r.ok ? r.json() : null));
    if (!j?.access) throw new Error("Spotify session expired: log in again");
    return j.access as string;
  }

  /** From the `Start the night` gesture: create the player, connect, transfer playback here without playing. */
  async connect(): Promise<void> {
    if (this.player && this.deviceId) return;
    const Player = await this.loadSdk();
    const p = new Player({
      name: "TDJ Booth",
      getOAuthToken: (cb) =>
        this.token().then(cb, () => this.onBanner?.("Spotify session expired: log in again")),
      volume: this.master,
    });
    this.player = p;
    const ready = new Promise<string>((ok, fail) => {
      p.addListener("ready", (e) => ok((e as { device_id: string }).device_id));
      p.addListener("not_ready", () =>
        this.onBanner?.("Spotify moved to another device", {
          label: "Take back",
          run: () => void this.transfer(),
        }),
      );
      p.addListener("authentication_error", () => fail(new Error("Spotify session expired: log in again")));
      p.addListener("account_error", () => fail(new Error(NOT_PREMIUM)));
      p.addListener("initialization_error", () =>
        fail(new Error("This browser cannot run the Spotify player")),
      );
      p.addListener("playback_error", (e) =>
        this.onBanner?.(`Spotify: ${(e as { message?: string }).message ?? "playback error"}`),
      );
      p.addListener("autoplay_failed", () => this.onBanner?.("Spotify needs a tap: press play again"));
      p.addListener("player_state_changed", (s) => this.live?.onState(s as SdkState | null));
    });
    const ok = await p.connect();
    if (!ok) throw new Error("Could not connect to Spotify");
    this.deviceId = await ready;
    await this.transfer();
  }

  private async api(path: string, body?: unknown) {
    const t = await this.token();
    const r = await this.fetchImpl(`https://api.spotify.com/v1${path}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok && r.status !== 204) throw new Error(`Spotify answered ${r.status}`);
  }
  async transfer() {
    if (!this.deviceId) return;
    await this.api("/me/player", { device_ids: [this.deviceId], play: false }).catch(() => {});
  }

  setMaster(gain: number) {
    this.master = Math.max(0, Math.min(1, gain));
    if (this.live) this.live.applyVolume();
    else void this.player?.setVolume(this.master).catch(() => {});
  }

  startItem(req: ExternalStart): ExternalHandle {
    const live = new Live(this, req);
    this.live = live;
    return live;
  }

  /** internal for `Live` */
  _player() {
    return this.player;
  }
  _deviceId() {
    return this.deviceId;
  }
  _master() {
    return this.master;
  }
  async _play(uri: string, positionMs: number) {
    const dev = this.deviceId ? `?device_id=${encodeURIComponent(this.deviceId)}` : "";
    await this.api(`/me/player/play${dev}`, {
      uris: [uri],
      position_ms: Math.max(0, Math.round(positionMs)),
    });
  }
  _clearLive(l: Live) {
    if (this.live === l) this.live = null;
  }
}

/** One item on the Spotify timeline: start after the delay, poll the state, fade with volume steps, report the end. */
class Live implements ExternalHandle {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private ended = false;
  private pos = 0;
  private posAt = 0;
  private lastPos = 0;
  private duration = 0;
  /** 0…1 fade multiplier on top of the master */
  private level: number;
  private gain: number;

  constructor(
    private a: SpotifyAdapter,
    private req: ExternalStart,
  ) {
    this.gain = dbToGain(Math.min(0, req.gainDb));
    this.level = req.fadeInSec && a.capabilities.fade ? 0 : 1;
    this.timer = setTimeout(() => void this.start(), Math.max(0, req.delaySec * 1000));
  }

  private async start() {
    this.timer = null;
    try {
      this.applyVolume();
      await this.a._play(this.req.uri, this.req.positionSec * 1000);
      this.started = true;
      this.posAt = performance.now();
      this.pos = this.req.positionSec;
      if (this.req.fadeInSec && this.a.capabilities.fade) this.fade(this.req.fadeInSec, true);
      this.poll = setInterval(() => void this.tick(), 250);
      if (this.req.durationSec !== undefined) {
        const fade = this.req.fadeOutSec ?? 0;
        const at = Math.max(0, this.req.durationSec - (this.a.capabilities.fade ? fade : 0)) * 1000;
        setTimeout(() => {
          if (this.ended) return;
          if (this.a.capabilities.fade && fade > 0) this.stop(fade);
          else this.stop(0);
        }, at);
      }
    } catch (e) {
      this.req.onError(e instanceof Error ? e.message : String(e));
    }
  }

  applyVolume() {
    void this.a
      ._player()
      ?.setVolume(this.level * this.gain * this.a._master())
      .catch(() => {});
  }

  onState(s: SdkState | null) {
    if (!s) return;
    this.pos = s.position / 1000;
    this.posAt = performance.now();
    this.duration = s.duration / 1000;
    if (s.paused && s.position === 0 && this.lastPos > this.duration - 1.5 && this.started) this.finish();
    this.lastPos = this.pos;
  }
  private async tick() {
    const s = await this.a._player()?.getCurrentState();
    if (s) this.onState(s);
  }

  position() {
    if (!this.started) return 0;
    return this.pos + (performance.now() - this.posAt) / 1000;
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
        if (!up) this.finish();
        return;
      }
      this.level = up ? 1 - v : v;
      this.applyVolume();
    }, VOLUME_STEP_SEC * 1000);
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.started)
      void this.a
        ._player()
        ?.pause()
        .catch(() => {});
    this.cleanup();
  }
  stop(fadeSec: number) {
    if (this.ended) return;
    if (!this.started) return this.cancel();
    if (fadeSec > 0 && this.a.capabilities.fade) this.fade(fadeSec, false);
    else this.finish();
  }
  private finish() {
    if (this.ended) return;
    this.ended = true;
    void this.a
      ._player()
      ?.pause()
      .catch(() => {});
    this.cleanup();
    this.req.onEnded();
  }
  private cleanup() {
    if (this.poll) clearInterval(this.poll);
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.poll = null;
    this.fadeTimer = null;
    this.a._clearLive(this);
  }
}

function uriOf(entity: PlanEntity): string | null {
  if (!entity) return null;
  const uri = (entity as Song | Cortina).spotify?.uri;
  return uri && /^spotify:track:/.test(uri) ? uri : null;
}
