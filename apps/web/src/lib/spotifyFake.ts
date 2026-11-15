import type { SpotifyCall } from "./spotifyWrite";

/**
 * A fake Spotify Web API for the write and read-back tests (unit tests and the checker script's self-test): one
 * playlist store, `/items` writes (PUT replaces ≤ 100, POST appends ≤ 100), paged reads with `next`, snapshot ids,
 * the `/tracks` lookup with a market, and knobs to drop a chunk, answer 429 or mark tracks unplayable.
 */
export interface FakeSpotify {
  call: SpotifyCall;
  playlists: Map<string, { uris: string[]; snapshot: number }>;
  log: Array<{ method: string; path: string; count?: number }>;
  /** POST calls (1-based, counted over the fake's life) answered 429 with this Retry-After, once each */
  rateLimitPosts: Map<number, number>;
  /** POST calls (1-based) that answer 201 but store nothing */
  dropPosts: Set<number>;
  /** uris the listener's market cannot play */
  unplayable: Set<string>;
  /** original uri → the version Spotify relinks it to in this market */
  relink: Map<string, string>;
  /** the `/tracks` lookup answers 403 (Spotify did not offer it to this app) */
  noLookup: boolean;
}

class FakeError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, retryAfter?: number) {
    super(`fake: ${status}${retryAfter ? `, retry after ${retryAfter} s` : ""}`);
    this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

export function fakeSpotify(): FakeSpotify {
  const f: FakeSpotify = {
    playlists: new Map(),
    log: [],
    rateLimitPosts: new Map(),
    dropPosts: new Set(),
    unplayable: new Set(),
    relink: new Map(),
    noLookup: false,
    call: async () => undefined as never,
  };
  let posts = 0;
  const track = (uri: string, market: boolean) => {
    const to = market ? f.relink.get(uri) : undefined;
    const shown = to ?? uri;
    return {
      uri: shown,
      name: `name of ${shown}`,
      artists: [{ name: "Artist" }],
      ...(market ? { is_playable: !f.unplayable.has(shown) } : {}),
      ...(to ? { linked_from: { uri } } : {}),
    };
  };
  f.call = (async (method: string, path: string, body?: unknown) => {
    const u = new URL(path, "https://fake.test/v1/");
    const uris = (body as { uris?: string[] } | undefined)?.uris;
    f.log.push({ method, path, ...(uris ? { count: uris.length } : {}) });
    const pl = /^\/playlists\/([^/?]+)(\/items)?$/.exec(u.pathname);
    if (pl) {
      const p = f.playlists.get(pl[1]!) ?? { uris: [], snapshot: 0 };
      f.playlists.set(pl[1]!, p);
      if (!pl[2]) return { snapshot_id: `snap${p.snapshot}` };
      if (method === "GET") {
        const limit = Number(u.searchParams.get("limit") ?? 100);
        const offset = Number(u.searchParams.get("offset") ?? 0);
        const market = !!u.searchParams.get("market");
        const page = p.uris.slice(offset, offset + limit);
        const next =
          offset + limit < p.uris.length
            ? `https://fake.test/v1${u.pathname}?offset=${offset + limit}`
            : null;
        return {
          items: page.map((x) => ({ is_local: false, track: track(x, market) })),
          total: p.uris.length,
          next,
        };
      }
      if (!uris || uris.length > 100) throw new FakeError(400);
      if (method === "PUT") {
        p.uris = [...uris];
        p.snapshot++;
        return { snapshot_id: `snap${p.snapshot}` };
      }
      posts++;
      const ra = f.rateLimitPosts.get(posts);
      if (ra !== undefined) {
        f.rateLimitPosts.delete(posts);
        throw new FakeError(429, ra);
      }
      if (!f.dropPosts.has(posts)) {
        p.uris.push(...uris);
        p.snapshot++;
      }
      return { snapshot_id: `snap${p.snapshot}` };
    }
    if (u.pathname === "/tracks") {
      if (f.noLookup) throw new FakeError(403);
      const ids = (u.searchParams.get("ids") ?? "").split(",");
      if (ids.length > 50) throw new FakeError(400);
      return { tracks: ids.map((id) => track(`spotify:track:${id}`, !!u.searchParams.get("market"))) };
    }
    throw new FakeError(404);
  }) as SpotifyCall;
  return f;
}

/** `n` distinct track uris, `spotify:track:t0…`, or with a prefix */
export const trackUris = (n: number, prefix = "t") =>
  Array.from({ length: n }, (_, i) => `spotify:track:${prefix}${i}`);
