import { type SongFilters, type SongSearchResult, searchSongs } from "@tdj/core";
import { songWire } from "@/lib/songWire";
import type { ApiDeps } from "./deps";
import { bad, bodyJson, json } from "./http";

/**
 * POST /api/search — the shared song search (core `searchSongs` over the catalogue's prebuilt index): one query string
 * with inline filters (`di sarli 1941 instrumental`, `rhythm:vals`, `40s`), the chips as `filters`, a page
 * (`offset`, `limit`), and back `{ items, total, facets, suggestion?, corrected?, groups? }` with each item's matched
 * spans for highlighting. GET /api/search?q= (engine.ts) still answers a plain list of songs, now from the same
 * engine. The same handler runs in the apps (lib/app/routes.ts).
 */

const strs = (v: unknown, max = 200, len = 120): string[] | undefined =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .slice(0, max)
        .map((x) => x.slice(0, len))
    : undefined;
const nums = (v: unknown): number[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).slice(0, 50)
    : undefined;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

/** the chips as the request carries them, every field checked */
export function filtersOf(v: unknown): SongFilters {
  const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: SongFilters = {};
  const rhythms = strs(f.rhythms, 20);
  if (rhythms?.length) out.rhythms = rhythms;
  const decades = nums(f.decades);
  if (decades?.length) out.decades = decades;
  const orch = strs(f.orchestraIds, 50);
  if (orch?.length) out.orchestraIds = orch;
  const singers = strs(f.singers, 50);
  if (singers?.length) out.singers = singers;
  const vocal = bool(f.vocal);
  if (vocal !== undefined) out.vocal = vocal;
  const yf = num(f.yearFrom);
  const yt = num(f.yearTo);
  if (yf !== undefined) out.yearFrom = yf;
  if (yt !== undefined) out.yearTo = yt;
  if (f.hasSpotify === true) out.hasSpotify = true;
  if (f.hasStream === true) out.hasStream = true;
  const fav = strs(f.favourites, 5000, 64);
  if (fav?.length) out.favourites = fav;
  if (f.favouritesOnly === true) out.favouritesOnly = true;
  return out;
}

export type SearchWire = Omit<SongSearchResult, "items"> & {
  items: Array<Omit<SongSearchResult["items"][number], "score"> & { score: number }>;
  tookMs: number;
};

export async function searchQuery(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Body must be an object");
  const q = typeof body.q === "string" ? body.q.slice(0, 400) : "";
  const limit = Math.max(1, Math.min(200, num(body.limit) ?? 50));
  const offset = Math.max(0, Math.min(20000, num(body.offset) ?? 0));
  const index = d.catalog().catalog.searchIndex();
  const t0 = performance.now();
  const r = searchSongs(index, q, {
    filters: filtersOf(body.filters),
    limit,
    offset,
    ...(body.group === "orchestra" ? { group: "orchestra" as const } : {}),
  });
  const tookMs = Math.round((performance.now() - t0) * 100) / 100;
  const wire: SearchWire = {
    ...r,
    items: r.items.map((h) => ({ ...h, song: songWire(h.song), score: Math.round(h.score * 100) / 100 })),
    tookMs,
  };
  return json(wire, { headers: { "server-timing": `search;dur=${tookMs}` } });
}
