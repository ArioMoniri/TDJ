import type { Measurement } from "../loudness";
import type { BoothRow, PlanEntity } from "../plan";

export type SourceKind = "file" | "spotify" | "preview";
export type ItemSource = SourceKind | "missing";

/** What an adapter hands the engine for one item: a decoded buffer (file / preview) or a Spotify URI. */
export interface PreparedItem {
  kind: SourceKind;
  buffer?: AudioBuffer;
  measured?: Pick<Measurement, "lufs" | "peakDbFS" | "introSec"> & Partial<Measurement>;
  spotifyUri?: string;
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
}
export interface ExternalHandle {
  /** before it started: forget it; after: stop at once */
  cancel(): void;
  /** fade to silence over `fadeSec` then stop */
  stop(fadeSec: number): void;
  /** seconds into the item (best effort) */
  position(): number;
}
/** A player the engine cannot route through the graph (Spotify): the adapter owns the timeline for its items. */
export interface ExternalPlayer {
  capabilities: { fade: boolean };
  startItem(req: ExternalStart): ExternalHandle;
  setMaster(gain: number): void;
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
  file: "file",
  spotify: "Spotify · ±0.5 s gaps",
  preview: "30 s rehearsal",
  missing: "no source",
};
