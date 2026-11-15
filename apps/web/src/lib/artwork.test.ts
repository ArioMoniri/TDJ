import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  artworkCache,
  artworkSources,
  coverFor,
  createLimiter,
  fetchLiveCover,
  liveQuery,
  loadShippedCovers,
  lookupCover,
  orchestraPlaceholder,
  pickCover,
  placeholderStops,
  resetArtworkState,
  shippedCovers,
  whiteContrast,
} from "./artwork";
import type { Playlist } from "./types";

const featured = JSON.parse(
  readFileSync(new URL("../../public/featured/golden-double-peak.json", import.meta.url), "utf8"),
) as Playlist;
const SHIPPED = JSON.parse(
  readFileSync(new URL("../../../../data/cache/artwork.json", import.meta.url), "utf8"),
) as Record<string, string>;

const TRACK = "4u5p9iR9Ll8QjLkmogApFA";
const side = (o: Record<string, unknown> = {}) => ({
  id: "s1",
  title: "Agua Florida",
  orchestra: "Ángel D'Agostino",
  spotify: { uri: `spotify:track:${TRACK}`, url: `https://open.spotify.com/track/${TRACK}` },
  ...o,
});
const DZ = "https://cdn-images.dzcdn.net/images/cover/aa/250x250.jpg";
const SP = "https://image-cdn-fa.spotifycdn.com/image/ab67";
const LIVE = "https://i.scdn.co/image/live";
const OWN = "https://example.com/own.jpg";
const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => resetArtworkState());

describe("artwork resolver", () => {
  it("orders the sources: the DJ's / source cover, the Deezer match, the shipped Spotify cover, a live one", () => {
    const e = side({ resolved: { provider: "deezer", id: "1", artwork: DZ } });
    const l = artworkSources({ src: OWN, entity: e, shipped: { s1: SP }, device: { s1: LIVE } });
    expect(l.map((c) => c.from)).toEqual(["dj", "deezer", "spotify", "live"]);
    expect(l.map((c) => c.url)).toEqual([OWN, DZ, SP, LIVE]);
    // no repeats (a tile's src is often the Deezer cover itself), nothing that is not an https image
    const same = artworkSources({ src: DZ, entity: e, shipped: { s1: "javascript:alert(1)" } });
    expect(same).toEqual([{ url: DZ, from: "dj" }]);
    expect(artworkSources({ entity: null })).toEqual([]);
  });
  it("onError falls through to the next source, and to the placeholder (null) after the last", () => {
    const l = artworkSources({
      src: OWN,
      entity: side({ resolved: { artwork: DZ } }),
      shipped: { s1: SP },
    });
    const failed = new Set<string>();
    const seen: Array<string | null> = [];
    for (;;) {
      const c = pickCover(l, failed);
      seen.push(c?.url ?? null);
      if (!c) break;
      failed.add(c.url);
    }
    expect(seen).toEqual([OWN, DZ, SP, null]);
  });
  it("the shipped cache gives every featured-night song and cortina a cover", () => {
    const sides = [
      ...featured.tandas.flatMap((t) => t.songs),
      ...featured.tandas.flatMap((t) => (t.cortina ? [t.cortina] : [])),
    ];
    expect(sides.length).toBe(116);
    const before = sides.filter((s) => artworkSources({ entity: s }).length).length;
    const after = sides.filter((s) => artworkSources({ entity: s, shipped: SHIPPED }).length).length;
    expect(before).toBeLessThan(after);
    expect(after).toBe(sides.filter((s) => s.spotify?.uri).length);
    for (const url of Object.values(SHIPPED)) expect(url).toMatch(/^https:\/\//);
    // the Booth's helper reads the same cache
    expect(coverFor(side() as never, SHIPPED)).toBeNull();
    expect(coverFor(side({ id: sides[0]!.id }) as never, SHIPPED)).toMatch(/^https:\/\//);
  });
  it("loads the shipped cache once, through GET /api/artwork", async () => {
    let calls = 0;
    const f = (async (url: string) => {
      calls++;
      expect(url).toBe("/api/artwork");
      return answer({ covers: { s1: SP, bad: "data:x" } });
    }) as typeof fetch;
    const [a, b] = await Promise.all([loadShippedCovers(f), loadShippedCovers(f)]);
    expect(a).toEqual({ s1: SP });
    expect(b).toBe(a);
    expect(shippedCovers()).toEqual({ s1: SP });
    await loadShippedCovers(f);
    expect(calls).toBe(1);
  });
  it("an unreachable server leaves the shipped cache empty, not pending", async () => {
    const m = await loadShippedCovers((async () => {
      throw new Error("offline");
    }) as typeof fetch);
    expect(m).toEqual({});
    expect(shippedCovers()).toEqual({});
  });
});

describe("live lookups", () => {
  it("asks the route by Spotify recording and Deezer match; nothing without either", () => {
    const q = liveQuery(side({ resolved: { provider: "deezer", id: "85217988" } }) as never);
    expect(q?.qs).toBe(`uri=spotify%3Atrack%3A${TRACK}&deezer=85217988`);
    expect(liveQuery({ id: "x" })).toBeNull();
    expect(liveQuery(side({ spotify: { uri: "spotify:track:short" } }) as never)).toBeNull();
  });
  it("keeps a found cover on the device, and asks once per recording", async () => {
    let calls = 0;
    const f = (async (url: string) => {
      calls++;
      expect(url).toMatch(/^\/api\/artwork\?uri=/);
      return answer({ url: LIVE });
    }) as typeof fetch;
    const [a, b] = await Promise.all([
      lookupCover(side() as never, { fetch: f }),
      lookupCover(side() as never, { fetch: f }),
    ]);
    expect([a, b]).toEqual([LIVE, LIVE]);
    expect(calls).toBe(1);
    expect(artworkCache().s1).toBe(LIVE);
    expect(await lookupCover(side() as never, { fetch: f })).toBe(LIVE);
    expect(calls).toBe(1);
  });
  it("a recording with no cover is not asked again this session; an unreachable route falls back to oEmbed", async () => {
    let calls = 0;
    const none = (async () => {
      calls++;
      return answer({ url: null });
    }) as typeof fetch;
    expect(await lookupCover(side() as never, { fetch: none })).toBeNull();
    expect(await lookupCover(side() as never, { fetch: none })).toBeNull();
    expect(calls).toBe(1);
    const q = liveQuery(side() as never)!;
    const down = (async () => answer({ error: "x" }, 404)) as typeof fetch;
    expect(await fetchLiveCover(q, down, async (u) => (u.endsWith(TRACK) ? SP : null))).toEqual({
      url: SP,
      final: false,
    });
    const retry = (async () => answer({ url: null, retry: true })) as typeof fetch;
    expect(await fetchLiveCover(q, retry, async () => null)).toEqual({ url: null, final: false });
  });
  it("runs at most 6 lookups at once; the rest wait their turn", async () => {
    const limit = createLimiter(6);
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const f = (() => {
      running++;
      peak = Math.max(peak, running);
      return new Promise<Response>((ok) =>
        release.push(() => {
          running--;
          ok(answer({ url: LIVE }));
        }),
      );
    }) as unknown as typeof fetch;
    const all = Array.from({ length: 20 }, (_, i) =>
      lookupCover(
        side({ id: `s${i}`, spotify: { uri: `spotify:track:${String(i).padStart(22, "A")}` } }) as never,
        {
          fetch: f,
          limit,
        },
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(limit.active).toBe(6);
    expect(limit.pending).toBe(14);
    while (release.length || limit.active) {
      release.splice(0).forEach((go) => go());
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(await Promise.all(all)).toEqual(Array(20).fill(LIVE));
    expect(peak).toBe(6);
  });
});

describe("placeholder", () => {
  it("white initials are AA-readable on every hue, both stops", () => {
    for (let h = 0; h < 360; h++) {
      const s = placeholderStops(h);
      expect(whiteContrast(h, 55, s.l)).toBeGreaterThanOrEqual(4.5);
      expect(whiteContrast((h + 28) % 360, 60, Math.max(14, s.l - 14))).toBeGreaterThanOrEqual(4.5);
    }
    // stable per orchestra, distinct between orchestras, initials kept
    const a = orchestraPlaceholder("carlos-di-sarli", "Carlos Di Sarli");
    expect(a).toEqual(orchestraPlaceholder("carlos-di-sarli", "Carlos Di Sarli"));
    expect(a.initials).toBe("CS");
    expect(a.from).toMatch(/^hsl\(\d+ 55% \d+%\)$/);
  });
});
