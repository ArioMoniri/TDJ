"use client";

/**
 * Wake Lock, Media Session and the keep-alive element (round7-booth.md §10). The muted, looping, silent `<audio>`
 * plays while the booth plays so the OS shows media controls and keeps iOS Safari's audio session alive; the
 * screen lock is re-requested whenever the tab comes back.
 */
export interface MediaHandlers {
  play: () => void;
  /** a headset "pause" is a hold, never a cut */
  pause: () => void;
  next: () => void;
  stop: () => void;
  /** restart the current item */
  previous: () => void;
}

/** 1 s of 8 kHz 8-bit mono silence as a WAV data URI (no binary asset to ship). */
export function silentWav(): string {
  const rate = 8000;
  const n = rate;
  const bytes = new Uint8Array(44 + n);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  const u32 = (o: number, v: number) => {
    bytes[o] = v & 255;
    bytes[o + 1] = (v >> 8) & 255;
    bytes[o + 2] = (v >> 16) & 255;
    bytes[o + 3] = (v >> 24) & 255;
  };
  const u16 = (o: number, v: number) => {
    bytes[o] = v & 255;
    bytes[o + 1] = (v >> 8) & 255;
  };
  w(0, "RIFF");
  u32(4, 36 + n);
  w(8, "WAVE");
  w(12, "fmt ");
  u32(16, 16);
  u16(20, 1);
  u16(22, 1);
  u32(24, rate);
  u32(28, rate);
  u16(32, 1);
  u16(34, 8);
  w(36, "data");
  u32(40, n);
  bytes.fill(128, 44);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

type WakeLockSentinelLike = {
  release(): Promise<void>;
  addEventListener?: (t: string, cb: () => void) => void;
};

export class BoothMedia {
  private lock: WakeLockSentinelLike | null = null;
  private wantLock = false;
  private keepAlive: HTMLAudioElement | null = null;
  private onVisible = () => {
    if (document.visibilityState === "visible" && this.wantLock) void this.acquire();
  };
  readonly supports = {
    wakeLock: typeof navigator !== "undefined" && "wakeLock" in navigator,
    mediaSession: typeof navigator !== "undefined" && "mediaSession" in navigator,
  };

  constructor() {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisible);
  }

  /** Request the screen lock (from a gesture the first time); re-requested on visibility. */
  async acquire(): Promise<boolean> {
    this.wantLock = true;
    if (!this.supports.wakeLock) return false;
    if (this.lock) return true;
    try {
      const nav = navigator as Navigator & {
        wakeLock: { request(t: "screen"): Promise<WakeLockSentinelLike> };
      };
      this.lock = await nav.wakeLock.request("screen");
      this.lock.addEventListener?.("release", () => {
        this.lock = null;
      });
      return true;
    } catch {
      return false;
    }
  }
  async release(): Promise<void> {
    this.wantLock = false;
    const l = this.lock;
    this.lock = null;
    await l?.release().catch(() => {});
  }
  get held() {
    return !!this.lock;
  }

  /** Start / stop the silent keep-alive element (from a gesture the first time). */
  setPlaying(on: boolean) {
    if (typeof document === "undefined") return;
    if (on) {
      if (!this.keepAlive) {
        const a = document.createElement("audio");
        a.src = silentWav();
        a.loop = true;
        a.setAttribute("playsinline", "");
        a.volume = 0.01;
        a.setAttribute("aria-hidden", "true");
        a.dataset.testid = "booth-keepalive";
        document.body.appendChild(a);
        this.keepAlive = a;
      }
      void this.keepAlive.play().catch(() => {});
    } else this.keepAlive?.pause();
    if (this.supports.mediaSession) navigator.mediaSession.playbackState = on ? "playing" : "paused";
  }

  setMetadata(m: { title: string; artist: string; album: string }) {
    if (!this.supports.mediaSession) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: m.title,
        artist: m.artist,
        album: m.album,
        artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
      });
    } catch {}
  }
  setPosition(duration: number, position: number) {
    if (!this.supports.mediaSession || !("setPositionState" in navigator.mediaSession)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        position: Math.max(0, Math.min(duration, position)),
        playbackRate: 1,
      });
    } catch {}
  }
  /** `null` removes the handlers (settings.mediaKeys = false: a headset in the room must not hold the music). */
  setHandlers(h: MediaHandlers | null) {
    if (!this.supports.mediaSession) return;
    const ms = navigator.mediaSession;
    const map: Array<[MediaSessionAction, (() => void) | undefined]> = [
      ["play", h?.play],
      ["pause", h?.pause],
      ["nexttrack", h?.next],
      ["stop", h?.stop],
      ["previoustrack", h?.previous],
    ];
    for (const [action, fn] of map) {
      try {
        ms.setActionHandler(action, fn ? () => fn() : null);
      } catch {}
    }
  }

  /** `devicechange` → the banner "Audio output changed". Returns the unsubscribe. */
  onDeviceChange(cb: () => void): () => void {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return () => {};
    md.addEventListener("devicechange", cb);
    return () => md.removeEventListener("devicechange", cb);
  }
  /** The default output device's label once permission exists, else null. */
  async outputLabel(): Promise<string | null> {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const out = list.find((d) => d.kind === "audiooutput" && d.label);
      return out?.label ?? null;
    } catch {
      return null;
    }
  }

  dispose() {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisible);
    void this.release();
    this.setPlaying(false);
    this.setHandlers(null);
    this.keepAlive?.remove();
    this.keepAlive = null;
  }
}
