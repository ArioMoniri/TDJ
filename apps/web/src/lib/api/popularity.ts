import {
  dancerPopularity,
  type FavouriteSongMeta,
  metaOf,
  type PopularityRow,
  popularityRows,
  SLOT_ROLES,
  type SlotRole,
  type Song,
  type SourceStatus,
} from "@tdj/core";
import type { ApiDeps } from "./deps";
import { json } from "./http";

/**
 * GET /api/popularity (2026-11): the dancer-popularity prior from databases (data/knowledge/dancer_popularity.json,
 * packages/core/src/popularity.ts) as Database → Memory → Dancer favourites lists it: the top recordings (in a slot
 * role: by its role score) with what the list shows of each song and the sources behind it, or the entries of
 * `ids` (the DJ's own favourites, for their source line). Shared with the macOS and iPadOS apps (lib/app/routes.ts).
 *
 *   ?role=peak&limit=30   ?ids=a,b,c
 */
export interface PopularityApiRow extends PopularityRow {
  song?: FavouriteSongMeta;
}
export interface PopularityApi {
  available: boolean;
  asOf?: string;
  sources: Record<string, SourceStatus>;
  rows: PopularityApiRow[];
}

const songIndex = new WeakMap<object, Map<string, Song>>();

export async function popularity(req: Request, d: ApiDeps): Promise<Response> {
  const { catalog } = d.catalog();
  const P = dancerPopularity();
  if (!P) return json({ available: false, sources: {}, rows: [] } satisfies PopularityApi);
  const u = new URL(req.url);
  const r = u.searchParams.get("role");
  const role = SLOT_ROLES.includes(r as SlotRole) ? (r as SlotRole) : undefined;
  const ids = u.searchParams
    .get("ids")
    ?.split(",")
    .map((x) => x.trim().slice(0, 64))
    .filter(Boolean)
    .slice(0, 500);
  const limit = Math.max(1, Math.min(200, Number(u.searchParams.get("limit")) || 30));
  let byId = songIndex.get(catalog);
  if (!byId) {
    byId = new Map(catalog.songs.map((s) => [s.id, s]));
    songIndex.set(catalog, byId);
  }
  const rows = popularityRows(P, { role, ...(ids ? { ids } : { limit }) }).map((x): PopularityApiRow => {
    const s = byId.get(x.id);
    return s ? { ...x, song: metaOf(s) } : x;
  });
  return json({ available: true, asOf: P.asOf, sources: P.sources, rows } satisfies PopularityApi, {
    headers: { "cache-control": "private, max-age=300" },
  });
}
