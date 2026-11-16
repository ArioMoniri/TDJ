/**
 * 2026-11 (Part B §5 of the owner's request): the room's signal path after the engine's master, in Web Audio.
 *
 * - **DJ controller / 4-channel interface** (one USB device, ≥ 4 output channels): the room goes to one stereo pair
 *   (ch 1–2) and the pre-listen to another (ch 3–4) of the same device — a ChannelMergerNode into a destination
 *   opened at `channelCount` = the channels needed (≤ `maxChannelCount`), `discrete`. Each input goes through a
 *   2-channel "speakers" gain first so a mono side reaches both speakers of its pair (a splitter alone would put it
 *   left only).
 * - **two speaker sets** (Chromium): the room also plays on a second output — a MediaStream bridge into a second
 *   AudioContext sent to that device with `setSinkId` — each with a delay trim so both line up.
 * - a delay on the room itself, so the earlier output can wait for the later one.
 *
 * The Mac app's web view (WebKit) opens the default output's channels the same way; where it cannot (or on iOS, where
 * the system routes), the Outputs view says so and the room stays on ch 1–2.
 */
export interface RNode {
  connect(n: unknown, output?: number, input?: number): unknown;
  disconnect(): void;
  channelCount?: number;
  channelCountMode?: string;
  channelInterpretation?: string;
}
export interface RDelay extends RNode {
  delayTime: { value: number };
}
export interface RDestination {
  channelCount: number;
  maxChannelCount: number;
  channelCountMode?: string;
  channelInterpretation?: string;
}
export interface RCtx {
  destination: RDestination;
  createGain(): RNode;
  createChannelMerger(n: number): RNode;
  createChannelSplitter(n: number): RNode;
  createDelay(maxSec?: number): RDelay;
  createMediaStreamDestination?(): RNode & { stream: unknown };
  createMediaStreamSource?(stream: unknown): RNode;
  close?(): Promise<void>;
  resume?(): Promise<void>;
}

export interface RouteConfig {
  /** the room's pair on its output (0 = ch 1–2) */
  roomPair: number;
  /** the pre-listen's pair on the same output (null: not mapped) */
  cuePair: number | null;
  /** ms the room output waits (to line up with a slower second output) */
  roomDelayMs: number;
  /** a second output that also plays the room */
  mirror: { sinkId: string; delayMs: number } | null;
}
export interface RouteResult {
  /** channels the destination is opened with */
  channels: number;
  mapped: boolean;
  mirrored: boolean;
  /** why a part could not be set up */
  limits: Array<"channels" | "mirror">;
}

/** A second context on the mirror's device (Chromium: `new AudioContext()` + `setSinkId`), or null when it can't. */
export type MirrorFactory = (sinkId: string) => Promise<RCtx | null>;

const MAX_DELAY_SEC = 1;

export class RoomRouter {
  /** the engine's output connects here */
  readonly input: RNode;
  /** a pre-listen on the room device's other pair connects here */
  readonly cueInput: RNode;
  private roomDelay: RDelay;
  private parts: RNode[] = [];
  private mirrorCtx: RCtx | null = null;
  private mirrorKey: string | null = null;
  private mirrorDelay: RDelay | null = null;
  private bridge: (RNode & { stream: unknown }) | null = null;
  current: RouteResult = { channels: 2, mapped: false, mirrored: false, limits: [] };

  constructor(
    private ctx: RCtx,
    private makeMirror: MirrorFactory = async () => null,
  ) {
    this.input = stereo(ctx);
    this.cueInput = stereo(ctx);
    this.roomDelay = ctx.createDelay(MAX_DELAY_SEC);
    this.input.connect(this.roomDelay);
    this.roomDelay.connect(ctx.destination);
  }

  async apply(c: RouteConfig): Promise<RouteResult> {
    const ctx = this.ctx;
    const dest = ctx.destination;
    const limits: RouteResult["limits"] = [];
    for (const p of this.parts) p.disconnect();
    this.parts = [];
    this.roomDelay.disconnect();
    this.cueInput.disconnect();
    this.roomDelay.delayTime.value = clampMs(c.roomDelayMs) / 1000;
    const want = Math.max(c.roomPair, c.cuePair ?? 0) * 2 + 2;
    const max = Math.max(2, dest.maxChannelCount || 2);
    let mapped = false;
    let channels = 2;
    if (want > 2 && want <= max) {
      channels = want;
      dest.channelCount = channels;
      dest.channelCountMode = "explicit";
      dest.channelInterpretation = "discrete";
      const merger = ctx.createChannelMerger(channels);
      const roomSplit = ctx.createChannelSplitter(2);
      this.roomDelay.connect(roomSplit);
      roomSplit.connect(merger, 0, c.roomPair * 2);
      roomSplit.connect(merger, 1, c.roomPair * 2 + 1);
      this.parts.push(merger, roomSplit);
      if (c.cuePair !== null) {
        const cueSplit = ctx.createChannelSplitter(2);
        this.cueInput.connect(cueSplit);
        cueSplit.connect(merger, 0, c.cuePair * 2);
        cueSplit.connect(merger, 1, c.cuePair * 2 + 1);
        this.parts.push(cueSplit);
        mapped = true;
      }
      merger.connect(dest);
    } else {
      if (want > max) limits.push("channels");
      dest.channelCount = 2;
      dest.channelCountMode = "explicit";
      dest.channelInterpretation = "speakers";
      this.roomDelay.connect(dest);
    }
    const mirrored = await this.applyMirror(c.mirror);
    if (c.mirror && !mirrored) limits.push("mirror");
    this.current = { channels, mapped, mirrored, limits };
    return this.current;
  }

  private async applyMirror(m: RouteConfig["mirror"]): Promise<boolean> {
    const key = m?.sinkId ?? null;
    if (key !== this.mirrorKey) {
      this.closeMirror();
      if (m && this.ctx.createMediaStreamDestination) {
        const mc = await this.makeMirror(m.sinkId).catch(() => null);
        if (mc?.createMediaStreamSource) {
          this.bridge = this.ctx.createMediaStreamDestination();
          this.input.connect(this.bridge);
          const src = mc.createMediaStreamSource(this.bridge.stream);
          this.mirrorDelay = mc.createDelay(MAX_DELAY_SEC);
          src.connect(this.mirrorDelay);
          this.mirrorDelay.connect(mc.destination);
          this.mirrorCtx = mc;
          this.mirrorKey = key;
        } else void mc?.close?.();
      }
    }
    if (this.mirrorDelay && m) this.mirrorDelay.delayTime.value = clampMs(m.delayMs) / 1000;
    return !!this.mirrorCtx && this.mirrorKey === key && key !== null;
  }
  private closeMirror() {
    this.bridge?.disconnect();
    this.bridge = null;
    this.mirrorDelay = null;
    void this.mirrorCtx?.close?.().catch(() => {});
    this.mirrorCtx = null;
    this.mirrorKey = null;
  }
  /** resume the second output's context with the first (a gesture, an interruption ended) */
  resume() {
    void this.mirrorCtx?.resume?.().catch(() => {});
  }
  dispose() {
    this.closeMirror();
    for (const p of this.parts) p.disconnect();
    this.parts = [];
  }
}

function stereo(ctx: RCtx): RNode {
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = "explicit";
  g.channelInterpretation = "speakers";
  return g;
}
const clampMs = (ms: number) => Math.max(0, Math.min(MAX_DELAY_SEC * 1000, Number.isFinite(ms) ? ms : 0));

/**
 * The two delays that line the room's outputs up: each output waits for the slowest one. `latencyMs` per output
 * (reported or estimated) plus the DJ's trim for it.
 */
export function alignDelays(
  outputs: Array<{ id: string; latencyMs: number; trimMs?: number }>,
): Record<string, number> {
  const total = outputs.map((o) => ({ id: o.id, at: Math.max(0, o.latencyMs) }));
  const slowest = Math.max(0, ...total.map((x) => x.at));
  const out: Record<string, number> = {};
  for (const o of outputs)
    out[o.id] = Math.round(Math.max(0, slowest - Math.max(0, o.latencyMs)) + Math.max(0, o.trimMs ?? 0));
  return out;
}
