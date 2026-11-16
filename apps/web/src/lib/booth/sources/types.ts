import { t } from "@/lib/i18n";
import type { Measurement } from "../loudness";
import type { BoothRow, PlanEntity } from "../plan";

export type SourceKind = "file" | "spotify" | "preview" | "youtube";
/** sources the engine cannot route through its audio graph: the adapter's own player owns their timeline */
export const EXTERNAL_KINDS: readonly SourceKind[] = ["spotify", "youtube"];
export const isExternalKind = (k: unknown): boolean => EXTERNAL_KINDS.includes(k as SourceKind);
export type ItemSource = SourceKind | "missing";

/** What an adapter hands the engine for one item: a decoded buffer (file / preview) or a Spotify URI. */
export interface PreparedItem {
  kind: SourceKind;
  buffer?: AudioBuffer;
  measured?: Pick<Measurement, "lufs" | "peakDbFS" | "introSec"> & Partial<Measurement>;
  spotifyUri?: string;
  /** 2026-11: another external player's item (YouTube: `youtube:video:<id>`) */
  externalUri?: string;
  durationSec: number;
  /** a short note for the Now card ("estimated from a preview", "peak-capped" is the engine's) */
  note?: string;
}

export type { PlanEntity };

export interface ExternalStart {
  uri: string;
  /** seconds from now until the item must start (the engine's gap) */
  delaySec: number;
  positionSec: number;
  /** stop (fading) after this many seconds; undefined = play to the end */
  durationSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** the engine's normalisation; external players only ever reduce */
  gainDb: number;
  onEnded: () => void;
  onError: (msg: string) => void;
  /**
   * 2026-11 (Connect): the device confirmed it plays this item (`true`), or the confirmation did not come within ~3 s
   * (`false`). The booth says "Starting…" until then.
   */
  onStarted?: (confirmed: boolean) => void;
  /**
   * 2026-11 (a reload while Spotify kept playing): the item already plays on the device at `positionSec` — no play
   * request, only the timeline is taken back.
   */
  attached?: boolean;
}
export interface ExternalHandle {
  /**
   * before it started: forget it; after: stop at once. `keepPlaying`: the device is about to play another track
   * (a skip on Spotify Connect): send no pause, the next play replaces it.
   */
  cancel(keepPlaying?: boolean): void;
  /** fade to silence over `fadeSec` then stop */
  stop(fadeSec: number): void;
  /** seconds into the item (best effort) */
  position(): number;
}
/** A player the engine cannot route through the graph (Spotify): the adapter owns the timeline for its items. */
export interface ExternalPlayer {
  capabilities: ExternalCapabilities;
  startItem(req: ExternalStart): ExternalHandle;
  /** `resync`: read the device's own level first (before Mute / Talk: the DJ may have moved it on the device) */
  setMaster(gain: number, o?: { resync?: boolean }): void;
}
/**
 * What an external player can do to the room (2026-11, Spotify Connect on an iPad): fade (volume steps), change the
 * volume at all (the iOS Spotify app reports `supports_volume: false`), and apply the night's per-item gain.
 */
export interface ExternalCapabilities {
  fade: boolean;
  volume?: boolean;
  gain?: boolean;
}

export interface SourceAdapter {
  kind: SourceKind;
  /** e.g. { ok: false, reason: "Not Premium" } / "No folder linked" */
  available(): Promise<{ ok: boolean; reason?: string }>;
  resolve(item: BoothRow, entity: PlanEntity): Promise<"ready" | "missing">;
  /** decode (file / preview) or no-op (spotify); may be called ahead of time and cached */
  prepare(item: BoothRow, entity: PlanEntity): Promise<PreparedItem>;
  release(itemId: string): void;
  external?: ExternalPlayer;
}

/** Badge text per source. */
export const SOURCE_LABEL: Record<ItemSource, string> = {
  get file() {
    return t("booth.sources.types.file");
  },
  get spotify() {
    return t("booth.sources.types.spotify_0_5_s_gaps");
  },
  get preview() {
    return t("booth.sources.types.30_s_rehearsal");
  },
  get youtube() {
    return t("booth.sources.types.youtube");
  },
  get missing() {
    return t("booth.sources.types.no_source");
  },
};
