import { type Cortina, type Playlist, retimeTanda, type Song } from "@tdj/core";
import { create } from "zustand";
import type { BoothRow } from "./plan";
import { fold } from "./tonightSearch";

/**
 * 2026-11 (the owner: "swapping music while others are playing should be fast and easy, like clicking swap, searching
 * the song and changing"): the Booth's one-tap Swap on every song and cortina row and on Up Next. A row ahead of the
 * playhead swaps at once (the room keeps playing what it plays); the playing row only after a confirm; a played row
 * never. The sheet (components/booth/BoothSwapSheet.tsx) opens through this store, so any row or card can ask for it.
 */
export const useBoothSwap = create<{ i: number | null; open: (i: number) => void; close: () => void }>(
  (set) => ({
    i: null,
    open: (i) => set({ i }),
    close: () => set({ i: null }),
  }),
);

/** where a plan row sits in the night: a chair of a tanda, or the cortina after it */
export type Chair = { kind: "track"; ti: number; si: number } | { kind: "cortina"; ti: number };

export function chairOf(p: Playlist, it: BoothRow | undefined): Chair | null {
  if (!it || it.tanda < 1) return null;
  const ti = it.tanda - 1;
  const t = p.tandas[ti];
  if (!t) return null;
  if (it.kind === "track") {
    const si = t.songs.findIndex((s) => s.id === it.id);
    return si < 0 ? null : { kind: "track", ti, si };
  }
  if (it.kind === "cortina" && t.cortina) return { kind: "cortina", ti };
  return null;
}

/** the row against the playhead: ahead swaps at once, the playing one asks first, a played one is closed */
export function swapWhen(i: number, planIndex: number, started: boolean): "ahead" | "playing" | "played" {
  if (!started || i > planIndex) return "ahead";
  return i === planIndex ? "playing" : "played";
}

/** the night with `song` in chair `si` of tanda `ti` (the tanda re-timed: energy curve, years, length) */
export function withSide(p: Playlist, ti: number, si: number, song: Song): Playlist {
  return {
    ...p,
    tandas: p.tandas.map((t, i) =>
      i === ti
        ? retimeTanda(
            t,
            t.songs.map((x, k) => (k === si ? song : x)),
          )
        : t,
    ),
  };
}

/** the night with `c` as the cortina after tanda `ti` */
export function withCortina(p: Playlist, ti: number, c: Cortina): Playlist {
  return { ...p, tandas: p.tandas.map((t, i) => (i === ti ? { ...t, cortina: c } : t)) };
}

/** two chairs of tonight trade places (a song for a song, a cortina for a cortina); null when they cannot */
export function exchange(p: Playlist, a: Chair, b: Chair): Playlist | null {
  if (a.kind !== b.kind) return null;
  if (a.kind === "track" && b.kind === "track") {
    const sa = p.tandas[a.ti]?.songs[a.si];
    const sb = p.tandas[b.ti]?.songs[b.si];
    if (!sa || !sb || sa.id === sb.id) return null;
    return withSide(withSide(p, a.ti, a.si, sb), b.ti, b.si, sa);
  }
  const ca = p.tandas[a.ti]?.cortina;
  const cb = p.tandas[b.ti]?.cortina;
  if (!ca || !cb || a.ti === b.ti) return null;
  return withCortina(withCortina(p, a.ti, cb), b.ti, ca);
}

/**
 * The cortinas that could take this place: none already tonight, the same culture and genre first, then the closest
 * energy, a checked Spotify recording before one without; with a query, title and artist (accents and case off).
 */
export function cortinaOptions(
  pool: readonly Cortina[],
  current: Cortina,
  tonight: ReadonlySet<string>,
  q = "",
  limit = 12,
): Cortina[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const score = (c: Cortina) =>
    (c.culture === current.culture ? 0 : 30) +
    (c.genre === current.genre ? 0 : 20) +
    Math.abs((c.energy ?? 50) - (current.energy ?? 50)) / 2 +
    (c.spotify?.uri ? 0 : 15);
  return pool
    .filter((c) => c.id !== current.id && !tonight.has(c.id))
    .filter((c) => !words.length || words.every((w) => fold(`${c.title} ${c.artist} ${c.genre}`).includes(w)))
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => a.s - b.s || a.c.id.localeCompare(b.c.id))
    .slice(0, limit)
    .map((x) => x.c);
}
