/**
 * 2026-11 (the owner: "the lower part of the sidebar takes too much space from Compose, Booth…") — the sidebar's
 * docked player shares the sidebar's height with the nav through a handle between them. The DJ's chosen height is
 * kept on the device; what the player gets is that height, never more than leaves the nav its own room. Below
 * `FULL_MIN` the player is its compact row (cover, title, play / pause, next, the progress line); from there up, the
 * whole player (it scrolls inside its height when that is less than it needs).
 */

/** the compact row's height, the least the handle can make it */
export const COMPACT_H = 64;
/** the whole player needs at least this much (the head, the cover and title, a line, the seek bar, the buttons) */
export const FULL_MIN = 220;
/** the nav (Library, Tonight, Recent nights) keeps at least this much above the handle */
export const NAV_MIN = 168;
/** a first visit: the whole player, as tall as it needs */
export const DEFAULT_H = 560;
export const SIDE_PLAYER_KEY = "tdj-side-player";

export type SideMode = "compact" | "full";

/**
 * what the player gets from the DJ's `chosen` height when `room` (the nav's and the player's height together) is
 * what the window gives them
 */
export function sidePlayerFit(chosen: number, room: number): { height: number; mode: SideMode } {
  const most = Math.max(COMPACT_H, room - NAV_MIN);
  const height = Math.round(Math.min(most, Math.max(COMPACT_H, chosen)));
  return { height, mode: height < FULL_MIN ? "compact" : "full" };
}

/** a height let go of: below the whole player's least it settles on the compact row */
export function settleSidePlayer(h: number): number {
  return h < FULL_MIN ? COMPACT_H : Math.round(h);
}

export function readSidePlayer(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? Math.max(COMPACT_H, Math.round(n)) : DEFAULT_H;
}
