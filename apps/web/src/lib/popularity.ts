import {
  type AgentMemory,
  emptyFavourites,
  type FavouriteTable,
  normalizeFavourites,
  type PopularityPart,
  withPopularity,
} from "@tdj/core";
import { favouritesForRequest } from "./favourites";
import { t } from "./i18n";

/**
 * Popularity from databases on the web (2026-11, "track favourites from databases too"): the committed prior
 * (data/knowledge/dancer_popularity.json) stays on the server (src/data.ts registers it; /api/popularity lists it),
 * so a request only says "use it" (`pop: 1`). The switch "Use popularity from databases" (Settings, Database →
 * Memory; default on) is DancerFavourites.popularityOff in the DJ's memory; switched off — or with dancer favourites
 * off — the request is exactly what it was before.
 */

/** "Use popularity from databases" (default on; off with the dancer favourites too) */
export const popularityUse = (m: AgentMemory | null | undefined) =>
  !m?.favourites?.popularityOff && !m?.favourites?.off;

/** the favourites a compose (swap, rule check) request carries: the DJ's own table, with popularity when on */
export function requestFavourites(
  m: AgentMemory | null | undefined,
  at: number = Date.now(),
): FavouriteTable | undefined {
  const T = favouritesForRequest(m, at);
  if (T?.off || !popularityUse(m)) return T;
  return withPopularity(T ?? { v: 1, sides: {}, families: {} });
}

export function setPopularityUse(m: AgentMemory, on: boolean): AgentMemory {
  const F = (m.favourites ? normalizeFavourites(m.favourites) : undefined) ?? emptyFavourites();
  const { popularityOff: _, ...rest } = F;
  const at = new Date().toISOString();
  return {
    ...m,
    favourites: { ...rest, ...(on ? {} : { popularityOff: true }), updatedAt: at },
    updatedAt: at,
  };
}

/** "DJ sets: 14 · Set lists: 9 · Deezer: high" in the app's language */
export function popularityText(parts: readonly PopularityPart[]): string {
  return parts
    .map((p) =>
      t("pop.part", {
        source: t(`pop.source.${p.source}`),
        value: typeof p.value === "number" ? p.value : t(`pop.tier.${p.value}`),
      }),
    )
    .join(" · ");
}
