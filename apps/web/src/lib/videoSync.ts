/**
 * 2026-11 — a matched YouTube video following the Booth (the play view): muted, on screen, never the room's sound
 * (no audio is ever taken from a video). The Booth's second in the recording is the clock; the video is told to seek
 * only when it has drifted past a threshold (a seek every frame would stutter), and to play or pause with the Booth.
 * Pure, so the drift rules have invariants (videoSync.test.ts).
 */
export interface SyncInput {
  /** the Booth's second in the recording, null when nothing plays this side */
  target: number | null;
  /** the Booth plays (not paused, not holding at a gap) */
  playing: boolean;
  /** the video's own time and whether it plays */
  videoTime: number;
  videoPlaying: boolean;
  /** the DJ's shift of this video against the recording (+ = the video's music starts later) */
  offsetSec?: number;
  /** the video's length (a target past it pauses at its end) */
  videoDuration?: number | null;
  /** ms since the last seek: the player needs a moment to land before drift is judged again */
  sinceSeekMs: number;
}
export interface SyncAction {
  seek?: number;
  play?: boolean;
  pause?: boolean;
  drift: number;
}

/** while playing, a drift above this re-seeks; paused, a smaller one does */
export const DRIFT_PLAYING_SEC = 0.35;
export const DRIFT_PAUSED_SEC = 0.1;
export const SEEK_SETTLE_MS = 900;

export function syncAction(i: SyncInput): SyncAction {
  if (i.target === null) return { drift: 0, ...(i.videoPlaying ? { pause: true } : {}) };
  let want = i.target + (i.offsetSec ?? 0);
  if (want < 0) want = 0;
  const end = i.videoDuration && i.videoDuration > 0 ? i.videoDuration : null;
  const past = end !== null && want >= end - 0.25;
  if (past) want = Math.max(0, end - 0.25);
  const drift = i.videoTime - want;
  const out: SyncAction = { drift: Math.round(drift * 1000) / 1000 };
  const limit = i.playing && !past ? DRIFT_PLAYING_SEC : DRIFT_PAUSED_SEC;
  if (Math.abs(drift) > limit && i.sinceSeekMs >= SEEK_SETTLE_MS) out.seek = Math.round(want * 100) / 100;
  if (i.playing && !past && !i.videoPlaying) out.play = true;
  if ((!i.playing || past) && i.videoPlaying) out.pause = true;
  return out;
}
