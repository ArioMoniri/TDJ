import { type AgentMemory, type Playlist, rateNight } from "@tdj/core";

/**
 * Thumbs up / down on the composed night (Composer's result header). Tapping the pressed thumb again takes the rating
 * back; tapping the other one replaces it. The memory change is `rateNight` (packages/core/src/memory.ts): the set's
 * entry records the rating, and with Settings → Learn from my edits on, the night's tanda families and shape feed
 * the learned preferences (likes.ts), per night id, so an undo removes exactly what the rating added.
 */
export type Rating = boolean | undefined;

export type RateMessage =
  | "composer.like_toast_towards"
  | "composer.like_toast_away"
  | "composer.like_toast_cleared"
  | "composer.like_toast_off";

/** the rating after a tap on a thumb (true = up, false = down) */
export const nextRating = (current: Rating, tapped: boolean): Rating =>
  current === tapped ? undefined : tapped;

/** the night's current rating in memory */
export const ratingOf = (memory: AgentMemory, id: string | undefined): Rating =>
  id ? memory.sets.find((s) => s.id === id)?.liked : undefined;

/** what the toast says after a rating */
export function rateMessage(liked: Rating, learn: boolean): RateMessage {
  if (liked === undefined) return "composer.like_toast_cleared";
  if (!learn) return "composer.like_toast_off";
  return liked ? "composer.like_toast_towards" : "composer.like_toast_away";
}

/** one tap: the next memory, the rating it holds, the toast's message and the rating an undo goes back to */
export function rateTap(
  memory: AgentMemory,
  playlist: Playlist,
  tapped: boolean,
  learn: boolean,
): { memory: AgentMemory; liked: Rating; previous: Rating; message: RateMessage } {
  const previous = ratingOf(memory, playlist.id);
  const liked = nextRating(previous, tapped);
  return {
    memory: rateNight(memory, playlist, liked, { learn }),
    liked,
    previous,
    message: rateMessage(liked, learn),
  };
}

/** the undo of a tap: back to the rating before it */
export const undoRate = (memory: AgentMemory, playlist: Playlist, previous: Rating, learn: boolean) =>
  rateNight(memory, playlist, previous, { learn });
