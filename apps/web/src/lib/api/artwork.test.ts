import { describe, expect, it } from "vitest";
import { artwork, CoverLru, SHIPPED_COVERS, spotifyTrackOf } from "./artwork";
import type { ApiDeps } from "./deps";

const TRACK = "4u5p9iR9Ll8QjLkmogApFA";
const THUMB = "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e024408396ffb348c82a1af966b";
const DZ = "https://cdn-images.dzcdn.net/images/cover/7aa5/250x250-000000-80-0-0.jpg";

/** a fake runtime whose fetch answers like Spotify's oEmbed and Deezer's track API, and records every call */
function deps(answer: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const d = {
    fetch: async (url: string, init?: RequestInit) => {
      calls.push(url);
      // never a user's token: the lookups are anonymous
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return answer(url);
    },
  } as unknown as ApiDeps;
  return { d, calls };
}
const j = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const get = (qs: string) => new Request(`http://localhost/api/artwork${qs}`);

describe("GET /api/artwork (mocked oEmbed)", () => {
  it("no parameters: the shipped cache, cacheable", async () => {
    const { d, calls } = deps(() => j({}));
    const r = await artwork(get(""), d, new CoverLru());
    expect(r.headers.get("cache-control")).toMatch(/public, max-age=\d+/);
    const body = (await r.json()) as { covers: Record<string, string> };
    expect(Object.keys(body.covers).length).toBe(Object.keys(SHIPPED_COVERS).length);
    expect(Object.keys(body.covers).length).toBeGreaterThan(500);
    expect(calls).toEqual([]);
  });
  it("?id= answers from the shipped cache without a lookup", async () => {
    const [id, url] = Object.entries(SHIPPED_COVERS)[0]!;
    const { d, calls } = deps(() => j({}));
    expect(await (await artwork(get(`?id=${id}`), d, new CoverLru())).json()).toEqual({
      url,
      source: "shipped",
    });
    expect(calls).toEqual([]);
  });
  it("?uri=spotify:track:… → oEmbed's thumbnail_url, then from the LRU", async () => {
    const { d, calls } = deps((u) => {
      expect(u).toBe(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${TRACK}`)}`,
      );
      return j({ thumbnail_url: THUMB, title: "Agua Florida" });
    });
    const lru = new CoverLru();
    const r = await artwork(get(`?uri=spotify:track:${TRACK}`), d, lru);
    expect(await r.json()).toEqual({ url: THUMB, source: "spotify" });
    expect(r.headers.get("cache-control")).toMatch(/max-age=86400/);
    await artwork(get(`?uri=https://open.spotify.com/track/${TRACK}?si=x`), d, lru);
    expect(calls).toHaveLength(1);
  });
  it("?deezer=<id> → the album cover; Spotify first when both are given", async () => {
    const { d, calls } = deps((u) =>
      u.includes("oembed") ? j({}, 404) : j({ id: 85217988, album: { cover_medium: DZ } }),
    );
    const r = await artwork(get(`?uri=spotify:track:${TRACK}&deezer=85217988`), d, new CoverLru());
    expect(await r.json()).toEqual({ url: DZ, source: "deezer" });
    expect(calls.map((c) => new URL(c).host)).toEqual(["open.spotify.com", "api.deezer.com"]);
  });
  it("no cover: { url: null }, cached for a while; an unreachable provider: retry, never cached", async () => {
    const lru = new CoverLru();
    const missing = deps(() => j({}, 404));
    const r = await artwork(get(`?uri=spotify:track:${TRACK}`), missing.d, lru);
    expect(await r.json()).toEqual({ url: null });
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
    await artwork(get(`?uri=spotify:track:${TRACK}`), missing.d, lru);
    expect(missing.calls).toHaveLength(1);

    const fresh = new CoverLru();
    const down = deps(() => {
      throw new Error("offline");
    });
    const r2 = await artwork(get(`?uri=spotify:track:${TRACK}`), down.d, fresh);
    expect(await r2.json()).toEqual({ url: null, retry: true });
    expect(r2.headers.get("cache-control")).toBe("no-store");
    expect(fresh.size).toBe(0);
    const busy = deps(() => j({}, 503));
    expect(await (await artwork(get(`?uri=spotify:track:${TRACK}`), busy.d, fresh)).json()).toEqual({
      url: null,
      retry: true,
    });
  });
  it("refuses anything that is not a Spotify track or a Deezer id (no open proxy)", async () => {
    const { d, calls } = deps(() => j({ thumbnail_url: THUMB }));
    for (const qs of ["?uri=https://evil.test/x", `?uri=spotify:album:${TRACK}`, "?deezer=1;rm", "?id=a%20b"])
      expect((await artwork(get(qs), d, new CoverLru())).status).toBe(400);
    expect(calls).toEqual([]);
    expect(spotifyTrackOf(`spotify:track:${TRACK}`)).toBe(TRACK);
    expect(spotifyTrackOf("spotify:track:x")).toBeNull();
  });
  it("the LRU keeps the newest entries and expires them", () => {
    let now = 0;
    const lru = new CoverLru(2, () => now);
    lru.set("a", THUMB);
    lru.set("b", null);
    lru.get("a");
    lru.set("c", DZ);
    expect(lru.get("b")).toBeUndefined();
    expect(lru.get("a")).toEqual({ url: THUMB });
    now += 8 * 24 * 3600_000;
    expect(lru.get("a")).toBeUndefined();
  });
});
