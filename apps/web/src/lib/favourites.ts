import {
  type AgentMemory,
  type DancerFavourites,
  type FavouriteTable,
  type FloorReaction,
  favouritesActive,
  favouriteTable,
  isFavouriteSide,
  normalizeFavourites,
  type Playlist,
  reactionOf,
  recordFloor,
  recordHearts,
  recordPlays,
  resetFavourite,
  type SlotRole,
  type Song,
  setFavouritesOff,
  type Tanda,
} from "@tdj/core";

/**
 * Dancer favourites on the web (2026-11): the tracker lives in the DJ's memory (AgentMemory.favourites: this device,
 * and the DJ's own database row when Settings → storage is the server), never in the repo. The Booth writes floor
 * reactions, room hearts and the night's plays into it; every compose request carries its decayed table
 * (`favouritesForRequest`), and the switch "Use dancer favourites when composing" sends it switched off. Pure
 * functions of the memory, so vitest checks the store logic without a browser.
 */

/** one evening of a set: the same night played on another day is another night */
export function nightIdOf(p: Pick<Playlist, "id">, at: Date = new Date()): string {
  const d = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return `${p.id}@${d}`;
}

export const favouritesOf = (m: AgentMemory | null | undefined): DancerFavourites | undefined =>
  m?.favourites ? normalizeFavourites(m.favourites) : undefined;

/** "Use dancer favourites when composing" (default on) */
export const favouritesOn = (m: AgentMemory | null | undefined) => !m?.favourites?.off;

/** the table a compose (or swap, rule check) request carries: off when switched off, none without evidence */
export function favouritesForRequest(
  m: AgentMemory | null | undefined,
  at: number = Date.now(),
): FavouriteTable | undefined {
  const F = favouritesOf(m);
  if (!F) return undefined;
  const T = favouriteTable(F, at);
  if (F.off) return { v: 1, off: true, sides: {}, families: {} };
  return favouritesActive(T) ? T : undefined;
}

const withFav = (m: AgentMemory, F: DancerFavourites): AgentMemory => ({
  ...m,
  favourites: F,
  updatedAt: F.updatedAt ?? new Date().toISOString(),
});

/** the tanda a plan item belongs to (1-based plan tanda → the night's tanda) */
const tandaAt = (p: Playlist, tanda: number): Tanda | undefined =>
  tanda >= 1 ? p.tandas[tanda - 1] : undefined;

/** a floor reaction from the booth: on the playing song (scope song) or on a set-list tanda (scope tanda) */
export function floorTap(
  m: AgentMemory,
  p: Playlist,
  o: { scope: "song" | "tanda"; tanda: number; song?: Song | null; reaction: FloorReaction; at?: Date },
): AgentMemory {
  const t = tandaAt(p, o.tanda);
  if (!t) return m;
  if (o.scope === "song" && !o.song) return m;
  const at = o.at ?? new Date();
  return withFav(
    m,
    recordFloor(favouritesOf(m), {
      nightId: nightIdOf(p, at),
      scope: o.scope,
      song: o.song ?? undefined,
      tanda: t,
      tandaIndex: o.tanda - 1,
      reaction: o.reaction,
      at: at.toISOString(),
    }),
  );
}

/** the reaction this night already holds on a song or a tanda (the pressed button) */
export function floorReactionOf(
  m: AgentMemory,
  p: Playlist | null | undefined,
  o: { scope: "song" | "tanda"; tanda: number; songId?: string; at?: Date },
): FloorReaction | undefined {
  if (!p) return undefined;
  return reactionOf(favouritesOf(m), {
    nightId: nightIdOf(p, o.at),
    scope: o.scope,
    songId: o.songId,
    tanda: o.tanda - 1,
  });
}

/** where each of the night's sides sits: its tanda's role */
export function sideRoles(p: Playlist): Map<string, { song: Song; role: SlotRole }> {
  const out = new Map<string, { song: Song; role: SlotRole }>();
  for (const t of p.tandas) for (const s of t.songs) out.set(s.id, { song: s, role: t.phase });
  return out;
}

/** the room's heart counts for tonight */
export function heartsIn(
  m: AgentMemory,
  p: Playlist,
  counts: Record<string, number>,
  at?: Date,
): AgentMemory {
  const roles = sideRoles(p);
  const F0 = favouritesOf(m);
  const F = recordHearts(F0, nightIdOf(p, at), counts, (id) => roles.get(id));
  return F === F0 ? m : withFav(m, F);
}

/** the night's plays (repeat evidence): the sides played and kept, those skipped or swapped out */
export function playsIn(
  m: AgentMemory,
  p: Playlist,
  played: string[],
  skipped: string[] = [],
  at?: Date,
): AgentMemory {
  const roles = sideRoles(p);
  const pick = (ids: string[]) =>
    ids.map((id) => roles.get(id)).filter((x): x is { song: Song; role: SlotRole } => !!x);
  const k = pick(played);
  const s = pick(skipped);
  if (!k.length && !s.length) return m;
  return withFav(m, recordPlays(favouritesOf(m), nightIdOf(p, at), k, s));
}

export const setFavouritesUse = (m: AgentMemory, on: boolean): AgentMemory =>
  withFav(m, setFavouritesOff(favouritesOf(m), !on));

export const resetFavouriteRow = (m: AgentMemory, key: `song:${string}` | `family:${string}`) =>
  withFav(m, resetFavourite(favouritesOf(m), key));

/** the song ids that carry a ♥ (any role; with `role`, that role only) */
export function favouriteIds(m: AgentMemory | null | undefined, ids: string[], role?: SlotRole): Set<string> {
  const F = favouritesOf(m);
  if (!F) return new Set();
  const T = favouriteTable({ ...F, off: false });
  return new Set(ids.filter((id) => isFavouriteSide(T, id, role)));
}
