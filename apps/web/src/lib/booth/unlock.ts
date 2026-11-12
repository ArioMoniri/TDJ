/**
 * Audio unlock (round20-booth.md "can't hear"): everything here must run synchronously inside the DJ's Start / Play
 * tap, before the first `await`, or a phone browser treats it as autoplay.
 *
 * - iOS / iPadOS Safari plays Web Audio through the "ambient" session by default, which the ring/silent switch
 *   mutes: `navigator.audioSession.type = "playback"` (Safari 16.4+) moves it to the media session, like a music app.
 * - `ctx.resume()` is called in the gesture (a context created or resumed later stays `suspended` on Safari and
 *   Chromium alike).
 * - A one-sample silent buffer is started in the same gesture: older iOS versions only open the output once a
 *   source has started inside a tap.
 */
export interface UnlockCtx {
  readonly state?: string;
  resume(): Promise<void>;
  createBuffer?(channels: number, length: number, rate: number): AudioBuffer;
  createBufferSource?(): {
    buffer: AudioBuffer | null;
    connect(n: unknown): unknown;
    start(when?: number): void;
  };
  destination?: unknown;
  readonly sampleRate?: number;
}
interface NavLike {
  audioSession?: { type?: string };
}

/** The steps taken, for tests and the spec's analysis. */
export interface UnlockResult {
  session: "playback" | "unsupported";
  resumed: boolean;
  primed: boolean;
}

export function unlockAudio(
  ctx: UnlockCtx,
  nav: NavLike | undefined = typeof navigator === "undefined" ? undefined : (navigator as unknown as NavLike),
): UnlockResult {
  let session: UnlockResult["session"] = "unsupported";
  try {
    if (nav?.audioSession) {
      nav.audioSession.type = "playback";
      session = "playback";
    }
  } catch {}
  let resumed = false;
  try {
    void ctx.resume().catch(() => {});
    resumed = true;
  } catch {}
  let primed = false;
  try {
    if (ctx.createBuffer && ctx.createBufferSource && ctx.destination) {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
      primed = true;
    }
  } catch {}
  return { session, resumed, primed };
}

/** A context the browser has not let run yet (no gesture, or the OS took it away). */
export const isSilentState = (state: string | undefined) => state === "suspended" || state === "interrupted";
