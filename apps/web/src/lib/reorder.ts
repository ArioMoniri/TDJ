import { renight, retimeTanda } from "@tdj/core";
import type { Playlist } from "./types";

/** move `list[from]` to index `to` (a copy; out of range → the same array) */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list as T[];
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x as T);
  return out;
}

/**
 * 2026-11 (the owner: "order in each tanda should be changeable in all tabs"): the night with song `from` of tanda
 * `ti` moved to `to` — the tanda re-timed (energy curve, length), the night re-stated, re-timed for the Booth and
 * re-scored, the tanda marked as the DJ's order. The same night when nothing moves.
 */
export function moveSongInNight(p: Playlist, ti: number, from: number, to: number): Playlist {
  const t = p.tandas[ti];
  if (!t) return p;
  const songs = moveItem(t.songs, from, to);
  if (songs === t.songs) return p;
  const tandas = p.tandas.map((x, k) => (k === ti ? { ...retimeTanda(x, songs), djOrder: true } : x));
  return renight(p, tandas);
}
