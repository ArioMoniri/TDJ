import { type LyricLine, lineAt } from "./lyrics";

/**
 * 2026-11 (the owner: "lyrics are not matched with the playing song in real time … I should be able to jump the song
 * from the lyrics by clicking a lyric … from Compose, Booth, Database and Library") — the pure half of following a
 * side's synced lyrics anywhere: which player says where the side is (the Booth's engine while a night plays, else
 * the app's mini player), the line sounding at that second (the LRC shift applied), the second a tapped line starts
 * at, and what a tap on a line does (seek the side that plays; else start it there by the Booth's rules or in the
 * mini player). Everything here is in the recording's own seconds: the Booth's clock already counts a cue in and a
 * cut head silence (`sourcePosition`), and a room seek takes them off again (`roomSeekSec`).
 */

/** who reports the side's second: the Booth's room (its engine), a Booth pre-listen of the file, the mini player */
export type PositionSource = "booth" | "cue" | "player";

export interface Playing {
  source: PositionSource;
  /** sounding now (false: paused where it is) */
  playing: boolean;
  /** the second in the recording */
  positionSec: number;
  /** false: it sounds from a 30 s clip (or a player with no clock): its seconds are not the recording's */
  synced: boolean;
}

/** what the Booth says about one side (read through `window.__tdjBooth`) */
export interface BoothSnap {
  /** the store's `positionOf(songId)`: the room's item or a pre-listen of its file */
  pos: { sec: number; playing: boolean; where: "room" | "cue" } | null;
  /** the side sounds from a 30 s clip (the room's item from a preview, or a pre-listen of its clip) */
  clip: boolean;
}

/** what the mini player says (lib/player.ts) */
export interface PlayerSnap {
  trackId: string | null;
  kind: "spotify" | "preview" | "file" | "spotify-full" | "cue" | null;
  playing: boolean;
  position: number;
  /** the element's length (0 until known) */
  duration: number;
  /** ms since the position was last reported (the element ticks ~4 times a second, Spotify once) */
  sinceMs: number;
}

/** a preview longer than this is a full recording (a mocked or DJ-hosted file); a Deezer / Spotify clip is 30 s */
export const CLIP_MAX_SEC = 40;
/** the longest the mini player's last report is carried forward while it plays */
const CARRY_MAX_SEC = 1.5;

/**
 * The one answer to "is this side playing, and where": the Booth first (its room, or a pre-listen of the file), then
 * the mini player; null when neither plays it. A clip plays its own seconds: `synced` false, never a guessed line.
 */
export function pickPlaying(
  songId: string,
  booth: BoothSnap | null,
  player: PlayerSnap | null,
): Playing | null {
  if (booth?.pos)
    return {
      source: booth.pos.where === "cue" ? "cue" : "booth",
      playing: booth.pos.playing,
      positionSec: Math.max(0, booth.pos.sec),
      synced: true,
    };
  if (booth?.clip) return { source: "booth", playing: true, positionSec: 0, synced: false };
  if (!player?.kind || player.trackId !== songId) return null;
  if (player.kind === "spotify" || player.kind === "cue")
    // the Spotify embed keeps no clock we can read; a headphones pre-listen of a file is the Booth's (above)
    return {
      source: player.kind === "cue" ? "cue" : "player",
      playing: player.playing,
      positionSec: 0,
      synced: false,
    };
  const synced = player.kind !== "preview" || player.duration > CLIP_MAX_SEC;
  const carry = player.playing ? Math.min(Math.max(0, player.sinceMs), CARRY_MAX_SEC * 1000) / 1000 : 0;
  const end = player.duration > 0 ? player.duration : Number.POSITIVE_INFINITY;
  return {
    source: "player",
    playing: player.playing,
    positionSec: Math.min(end, Math.max(0, player.position + carry)),
    synced,
  };
}

const ms = (x: number) => Math.round(x * 1000) / 1000;

/** the line sounding at the recording's second `sec`, the DJ's shift applied (+0.5: the lyrics come 0.5 s later) */
export function activeLine(lines: readonly LyricLine[], sec: number, offsetSec = 0): number {
  return lineAt(lines, ms(sec - offsetSec));
}

/** the recording's second a tapped line starts at (the shift applied; never before the recording) */
export function lineStartSec(line: Pick<LyricLine, "at">, offsetSec = 0): number {
  return Math.max(0, ms(line.at + offsetSec));
}

/**
 * The Booth's room seeks on its item's own clock, which starts at `srcStartSec` of the recording (the side's cue in
 * and its cut head silence): a line inside the cut part plays from the item's start; never past its end.
 */
export function roomSeekSec(recSec: number, srcStartSec: number, lengthSec?: number | null): number {
  const at = Math.max(0, ms(recSec - Math.max(0, srcStartSec)));
  return lengthSec && lengthSec > 0 ? Math.min(at, Math.max(0, lengthSec - 0.5)) : at;
}

/** the Booth as a tap on a line needs it */
export interface BoothTapState {
  /** the Booth's page is the one showing (its sheets) */
  here: boolean;
  /** the night is running (playing, paused or held) */
  started: boolean;
  /** this side's row in tonight's plan, −1 when it is not in it */
  row: number;
  /** why a pre-listen cannot go to the headphones (null: it can) */
  cueBlocked: string | null;
}

export type TapRoute =
  /** it plays in the room: the room seeks (no confirmation, like the Booth's seek bar) */
  | { kind: "seek-room" }
  /** a Booth pre-listen of its file: it starts again at the line */
  | { kind: "seek-cue" }
  /** the mini player plays it: it seeks (and plays on) */
  | { kind: "seek-player" }
  /** it sounds from a 30 s clip or a player without a clock: no line to jump to */
  | { kind: "clip" }
  /** the Booth pre-listens it from the line: the headphones, or before the night this device (the room) */
  | { kind: "prelisten"; row: number | null }
  /** mid-night with no headphones: the DJ confirms playing tonight's row in the room from the line */
  | { kind: "confirm-room"; row: number }
  /** mid-night with no headphones and not tonight's: nothing may reach the room */
  | { kind: "blocked"; why: string }
  /** the mini player starts it at the line (it pre-listens in the headphones itself while a night runs) */
  | { kind: "player" };

/** what a tap on a synced line does, by the Booth's rules (Booth sheet, mini player, any tab) */
export function lyricTapRoute(playing: Playing | null, booth: BoothTapState | null): TapRoute {
  if (playing) {
    if (!playing.synced) return { kind: "clip" };
    return playing.source === "booth"
      ? { kind: "seek-room" }
      : playing.source === "cue"
        ? { kind: "seek-cue" }
        : { kind: "seek-player" };
  }
  if (booth?.started) {
    if (!booth.cueBlocked)
      return booth.here ? { kind: "prelisten", row: booth.row >= 0 ? booth.row : null } : { kind: "player" };
    return booth.row >= 0
      ? { kind: "confirm-room", row: booth.row }
      : { kind: "blocked", why: booth.cueBlocked };
  }
  if (booth?.here) return { kind: "prelisten", row: booth.row >= 0 ? booth.row : null };
  return { kind: "player" };
}

/** the shift after a ±0.5 s nudge (one decimal; ±30 s at most) */
export function nudgeOffset(offsetSec: number, delta: number): number {
  return Math.max(-30, Math.min(30, Math.round((offsetSec + delta) * 10) / 10));
}
