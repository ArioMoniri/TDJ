import { type DancerFavourites, favouriteTable, isFavouriteSide, normTitle } from "@tdj/core";
import type { HistorySnapshot } from "./types";

/**
 * 2026-11 — the DJ's own history with a side (Song DNA → "You and this song"): the nights in History that hold it
 * (or another version of its work), whether the night was played from the Booth, the floor's reactions and room
 * hearts it collected, and whether it is one of the dancers' favourites. All of it is the DJ's own data, on this
 * device or their database: nothing is fetched.
 */
export interface SongHistory {
  nights: Array<{ id: string; title: string; at: string; played: boolean; version: "this" | "other" }>;
  full: number;
  ok: number;
  emptied: number;
  hearts: number;
  favourite: boolean;
}

const sidesOf = (p: HistorySnapshot["playlist"]) => [
  ...(p.opening ? [p.opening] : []),
  ...p.tandas.flatMap((t) => t.songs),
  ...(p.closing ? [p.closing] : []),
];

export function songHistory(
  s: { id: string; title: string },
  history: readonly HistorySnapshot[],
  F?: DancerFavourites | null,
  at = Date.now(),
): SongHistory {
  const key = normTitle(s.title);
  const nights: SongHistory["nights"] = [];
  for (const h of history) {
    const sides = sidesOf(h.playlist);
    const mine = sides.some((x) => x.id === s.id);
    const other = !mine && sides.some((x) => normTitle(x.title) === key);
    if (!mine && !other) continue;
    nights.push({
      id: h.id,
      title: h.title,
      at: h.createdAt,
      played: !!h.nightLog && !h.nightLog.rehearsal && h.nightLog.playedSec >= 600,
      version: mine ? "this" : "other",
    });
  }
  nights.sort((a, b) => b.at.localeCompare(a.at));
  const out: SongHistory = { nights, full: 0, ok: 0, emptied: 0, hearts: 0, favourite: false };
  if (!F) return out;
  for (const tap of F.taps ?? []) if (tap.songIds.includes(s.id)) out[tap.reaction]++;
  for (const night of Object.values(F.hearts ?? {})) out.hearts += night[s.id]?.n ?? 0;
  out.favourite = isFavouriteSide(favouriteTable({ ...F, off: false }, at), s.id);
  return out;
}
