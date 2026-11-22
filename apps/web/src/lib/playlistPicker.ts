import { fold } from "./findMatch";
import type { PlaylistSummary } from "./playlistSources";

/**
 * 2026-11 — "Import a night": the DJ's own playlists (Spotify, YouTube) in the picker, searched and paged. The service
 * hands every page at once (playlistSources.ts reads them all); the picker shows PICKER_PAGE at a time with "Show
 * more", and a search over the name and the owner, accents and case aside, every word in any order.
 */
export const PICKER_PAGE = 20;

/** the playlists whose name or owner holds every word of `query` (accents and case aside), in the service's order */
export function filterPlaylists(items: readonly PlaylistSummary[], query: string): PlaylistSummary[] {
  const words = fold(query).toLowerCase().split(" ").filter(Boolean);
  if (!words.length) return items.slice();
  return items.filter((p) => {
    const hay = ` ${fold(`${p.name} ${p.owner ?? ""}`).toLowerCase()} `;
    return words.every((w) => hay.includes(w));
  });
}

/** the first `pages` pages of a list: the rows to show and how many more there are */
export function pagePlaylists<T>(
  items: readonly T[],
  pages: number,
  size = PICKER_PAGE,
): { visible: T[]; more: number } {
  const n = Math.max(1, Math.floor(pages)) * size;
  return { visible: items.slice(0, n), more: Math.max(0, items.length - n) };
}

/** "12 songs · DJ Ana": what a picker row says under the name (the count and the owner, when the service gives one) */
export function playlistLine(
  p: Pick<PlaylistSummary, "total" | "owner">,
  songs: (n: number) => string,
): string {
  return [songs(p.total), p.owner].filter(Boolean).join(" · ");
}
