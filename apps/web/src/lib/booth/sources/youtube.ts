"use client";
import { t as tx } from "@/lib/i18n";
import { loadMatches, type YoutubeMatches } from "@/lib/youtubeMatches";
import { dbToGain, VOLUME_STEP_SEC } from "../envelope";
import type { BoothRow } from "../plan";
import { ensureSideLevel, type LevelEntity, preparedLevel } from "../sideLevel";
import { fadeVolumes, isAppleMobile, isPhone } from "./spotify";
import type {
  ExternalCapabilities,
  ExternalHandle,
  ExternalPlayer,
  ExternalStart,
  PlanEntity,
  PreparedItem,
  SourceAdapter,
} from "./types";

/**
 * 2026-11 — YouTube as a Booth source: the official IFrame Player API in a visible player (YouTube's terms: the
 * player stays on screen, at least 200 × 200 px, nothing extracted from it). The video of each side is the one the
 * YouTube export found and read back (lib/youtubeMatches.ts); a side without one plays from another source.
 *
 * The engine treats it like Spotify (an external player, `ExternalPlayer`): the adapter starts each item at its
 * planned second (the engine's gap and silence plan), stops it at its planned length, and fades with `setVolume`
 * where the platform has a volume: iOS and iPadOS ignore `setVolume` (the hardware buttons only), so there the
 * capabilities say no fades, no volume and no per-item gain, and cortinas stop at their planned second.
 */

/** the subset of `YT.Player` the adapter uses */
export interface YtPlayerLike {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
}
/** YT.PlayerState */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;
export type YtFactory = (events: {
  onState: (s: number) => void;
  onError: (code: number) => void;
}) => Promise<YtPlayerLike>;

export const YOUTUBE_URI = /^youtube:video:([A-Za-z0-9_-]{1,64})$/;
export const youtubeUri = (id: string) => `youtube:video:${id}`;
export const IFRAME_API = "https://www.youtube.com/iframe_api";
export const DOCK_ID = "tdj-youtube-dock";

/** a player error YouTube reports (2 bad id, 5 HTML5 error, 100 removed / private, 101 / 150 / 153 no embedding) */
export function youtubeErrorText(code: number, title?: string): string {
  const what = title ? `“${title}”` : tx("booth.sources.youtube.this_video");
  if (code === 101 || code === 150) return tx("booth.sources.youtube.not_embeddable", { what });
  if (code === 153) return tx("booth.sources.youtube.needs_a_referrer", { what });
  if (code === 100) return tx("booth.sources.youtube.removed", { what });
  return tx("booth.sources.youtube.cannot_play", { what });
}

interface Options {
  factory?: YtFactory;
  matches?: () => YoutubeMatches;
  /** iOS / iPadOS: `setVolume` is ignored */
  noVolume?: boolean;
  onBanner?: (text: string, action?: { label: string; run: () => void }) => void;
  /** how long a start waits for YouTube's PLAYING before it asks for a tap (ms) */
  confirmMs?: number;
}

const now = () => Date.now();

export class YoutubeAdapter implements SourceAdapter, ExternalPlayer {
  readonly kind = "youtube" as const;
  capabilities: Required<ExternalCapabilities>;
  external: ExternalPlayer = this;
  private factory: YtFactory;
  private matches: () => YoutubeMatches;
  private player: Promise<YtPlayerLike> | null = null;
  private owner: YtLive | null = null;
  private master = 1;
  private titles = new Map<string, string>();
  readonly onBanner: Options["onBanner"];
  readonly confirmMs: number;

  constructor(o: Options = {}) {
    this.factory = o.factory ?? defaultFactory;
    this.matches = o.matches ?? loadMatches;
    const noVolume = o.noVolume ?? (isAppleMobile() || isPhone());
    this.capabilities = { fade: !noVolume, volume: !noVolume, gain: !noVolume };
    this.onBanner = o.onBanner;
    this.confirmMs = o.confirmMs ?? 4000;
  }

  /** the video for a side (null: no match) */
  videoFor(entity: PlanEntity): string | null {
    const id = (entity as { id?: string } | null)?.id;
    return (id && this.matches()[id]) || null;
  }

  async available() {
    const n = Object.keys(this.matches()).length;
    return n ? { ok: true } : { ok: false, reason: tx("booth.sources.youtube.no_matches_yet") };
  }
  async resolve(item: BoothRow, entity: PlanEntity) {
    const v = this.videoFor(entity);
    if (v && item?.title) this.titles.set(youtubeUri(v), item.title);
    if (v) void ensureSideLevel(entity as LevelEntity);
    return v ? ("ready" as const) : ("missing" as const);
  }
  async prepare(item: BoothRow, entity: PlanEntity): Promise<PreparedItem> {
    const v = this.videoFor(entity);
    if (!v) throw new Error(tx("booth.sources.youtube.no_video_for_this_item"));
    if (item?.title) this.titles.set(youtubeUri(v), item.title);
    // 2026-11: the side's level known from data: the gain toward the night's target reads it (lib/booth/sideLevel.ts)
    const measured = preparedLevel(entity as LevelEntity);
    return {
      kind: "youtube",
      externalUri: youtubeUri(v),
      durationSec: item.lengthSec,
      ...(measured ? { measured } : {}),
    };
  }
  release() {}

  /** the one player, made on first use (in the dock: visible, never hidden) */
  _player(): Promise<YtPlayerLike> {
    this.player ??= this.factory({
      onState: (s) => this.owner?.onState(s),
      onError: (c) => this.owner?.onError(c),
    }).catch((e) => {
      this.player = null;
      throw e;
    });
    return this.player;
  }
  _own(l: YtLive) {
    const prev = this.owner;
    this.owner = l;
    if (prev && prev !== l) prev.superseded();
  }
  _release(l: YtLive) {
    if (this.owner === l) this.owner = null;
  }
  _isOwner(l: YtLive) {
    return this.owner === l;
  }
  _master() {
    return this.master;
  }
  _title(uri: string) {
    return this.titles.get(uri);
  }

  startItem(req: ExternalStart): ExternalHandle {
    return new YtLive(this, req);
  }
  setMaster(gain: number) {
    this.master = Math.max(0, Math.min(1, gain));
    this.owner?.applyVolume();
  }
}

class YtLive implements ExternalHandle {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private p: YtPlayerLike | null = null;
  private started = false;
  private playing = false;
  private confirmed = false;
  private done = false;
  private level: number;
  private gain: number;
  private pos = 0;
  private posAt = 0;
  private readonly videoId: string | null;

  constructor(
    private a: YoutubeAdapter,
    private req: ExternalStart,
  ) {
    this.videoId = YOUTUBE_URI.exec(req.uri)?.[1] ?? null;
    this.gain = a.capabilities.gain ? dbToGain(Math.min(0, req.gainDb)) : 1;
    this.level = req.fadeInSec && a.capabilities.fade ? 0 : 1;
    this.timer = setTimeout(() => void this.start(), Math.max(0, req.delaySec * 1000));
  }

  private async start() {
    this.timer = null;
    if (this.done) return;
    if (!this.videoId) return this.fail(100);
    let p: YtPlayerLike;
    try {
      p = await this.a._player();
    } catch {
      if (this.done) return;
      this.end(false);
      this.req.onError(tx("booth.sources.youtube.could_not_load_the_player"));
      return;
    }
    if (this.done) return;
    this.p = p;
    this.a._own(this);
    this.applyVolume();
    p.loadVideoById({ videoId: this.videoId, startSeconds: Math.max(0, this.req.positionSec) });
    this.started = true;
    this.pos = this.req.positionSec;
    this.posAt = now();
    if (this.req.fadeInSec && this.a.capabilities.fade) this.fade(this.req.fadeInSec, true);
    if (this.req.durationSec !== undefined) {
      const fade = this.a.capabilities.fade ? (this.req.fadeOutSec ?? 0) : 0;
      this.stopTimer = setTimeout(() => this.stop(fade), Math.max(0, this.req.durationSec - fade) * 1000);
    }
    // iOS starts a video only from a tap until the player has played once: say so instead of "Playing" over silence
    this.confirmTimer = setTimeout(() => {
      if (this.done || this.confirmed) return;
      this.confirmed = true;
      this.req.onStarted?.(false);
      this.a.onBanner?.(tx("booth.sources.youtube.tap_the_player"), {
        label: tx("booth.sources.youtube.play"),
        run: () => this.p?.playVideo(),
      });
    }, this.a.confirmMs);
  }

  onState(s: number) {
    if (this.done || !this.started) return;
    if (s === YT_STATE.PLAYING) {
      this.syncPos();
      this.playing = true;
      if (!this.confirmed) {
        this.confirmed = true;
        this.req.onStarted?.(true);
      }
    } else if (s === YT_STATE.ENDED) this.finish(false);
    else if (s === YT_STATE.PAUSED || s === YT_STATE.BUFFERING) {
      this.syncPos();
      this.playing = false;
    }
  }
  onError(code: number) {
    if (this.done) return;
    this.fail(code);
  }
  private fail(code: number) {
    const msg = youtubeErrorText(code, this.a._title(this.req.uri));
    this.end(false);
    this.req.onError(msg);
  }
  private syncPos() {
    const t = this.p?.getCurrentTime();
    if (typeof t === "number" && Number.isFinite(t)) {
      this.pos = t;
      this.posAt = now();
    }
  }

  applyVolume() {
    if (!this.a.capabilities.volume || !this.a._isOwner(this)) return;
    this.p?.setVolume(Math.round(100 * this.level * this.gain * this.a._master()));
  }
  private fade(sec: number, up: boolean) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const vols = fadeVolumes(sec);
    let i = 0;
    this.fadeTimer = setInterval(() => {
      const v = vols[i++];
      if (v === undefined) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
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

  position() {
    if (!this.started) return 0;
    return this.pos + (this.playing ? (now() - this.posAt) / 1000 : 0);
  }
  cancel(keepPlaying = false) {
    this.end(this.started && !keepPlaying);
  }
  stop(fadeSec: number) {
    if (this.done) return;
    if (!this.started) return this.cancel();
    if (fadeSec > 0 && this.a.capabilities.fade) this.fade(fadeSec, false);
    else this.finish(true);
  }
  /** the next item took the player: this one is over, without a pause */
  superseded() {
    if (this.done) return;
    this.end(false);
    this.req.onEnded();
  }
  private finish(pause: boolean) {
    if (this.done) return;
    this.end(pause);
    this.req.onEnded();
  }
  private end(pause: boolean) {
    if (this.done) return;
    this.done = true;
    for (const t of [this.timer, this.stopTimer, this.confirmTimer]) if (t) clearTimeout(t);
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    if (pause && this.a._isOwner(this)) this.p?.pauseVideo();
    this.a._release(this);
  }
}

/* ---- the IFrame Player API in the dock (a visible player above the tab bar) ---- */

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    o: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: Record<string, (e: { data: number; target: YtPlayerLike }) => void>;
    },
  ) => YtPlayerLike;
}
declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadApi(): Promise<YtNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((ok, fail) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      ok(window.YT!);
    };
    const s = document.createElement("script");
    s.src = IFRAME_API;
    s.async = true;
    s.onerror = () => fail(new Error("iframe_api"));
    document.head.appendChild(s);
  });
}

/** The dock: fixed above the tab bar, 16:9 at 356 × 200 (YouTube's minimum is 200 × 200 CSS px of player). */
export function ensureDock(): HTMLElement {
  let dock = document.getElementById(DOCK_ID);
  if (!dock) {
    dock = document.createElement("div");
    dock.id = DOCK_ID;
    dock.setAttribute("data-testid", "booth-youtube-dock");
    dock.setAttribute("role", "region");
    dock.setAttribute("aria-label", tx("booth.sources.youtube.player"));
    Object.assign(dock.style, {
      position: "fixed",
      right: "16px",
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
      width: "356px",
      maxWidth: "calc(100vw - 32px)",
      height: "200px",
      zIndex: "40",
      borderRadius: "12px",
      overflow: "hidden",
      background: "#000",
      boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    });
    const slot = document.createElement("div");
    dock.appendChild(slot);
    document.body.appendChild(dock);
  }
  return dock;
}

const defaultFactory: YtFactory = async (events) => {
  const YT = await loadApi();
  const dock = ensureDock();
  const slot = dock.firstElementChild as HTMLElement;
  const origin = /^https?:$/.test(location.protocol) ? location.origin : undefined;
  return new Promise<YtPlayerLike>((ok) => {
    new YT.Player(slot, {
      width: "100%",
      height: "100%",
      playerVars: { playsinline: 1, rel: 0, controls: 1, ...(origin ? { origin } : {}) },
      events: {
        onReady: (e) => ok(e.target),
        onStateChange: (e) => events.onState(e.data),
        onError: (e) => events.onError(e.data),
      },
    });
  });
};
