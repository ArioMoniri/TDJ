/**
 * 2026-11 (the owner: "covers for the solo-singer-with-guitars sides — Héctor Mauré, Carlos Dante…"). The catalogue
 * files them under "Guitarras (solo singer)", a label no service credits, and they have no Spotify recording to ask
 * about: the live lookup searches for them with the same query ladder as "Find on services" (lib/findMatch.ts — the
 * singer first, the leader's surname, the aliases, the normalised title), judges every candidate with the core match
 * rules, caches what it found, and the page asks only for rows on screen, at most six at a time. Mocked services, a
 * sample of the catalogue's real sides. The label reads "Héctor Mauré with guitars" (display only).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { artwork, CoverLru, SEARCH_MIN, searchKey, searchSide } from "./api/artwork";
import type { ApiDeps } from "./api/deps";
import {
  artworkCache,
  createLimiter,
  LIVE_CONCURRENCY,
  liveQuery,
  lookupCover,
  resetArtworkState,
} from "./artwork";
import { fold, queryLadder } from "./findMatch";
import { orchestraName } from "./orchestraName";

interface Side {
  id: string;
  title: string;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  vocal: boolean;
  year: number | null;
  durationSec?: number | null;
  spotify?: { uri: string } | null;
  altTitles?: string[];
}
const SONGS = JSON.parse(
  readFileSync(new URL("../../../../data/index/songs.json", import.meta.url), "utf8"),
) as Side[];
/** a sample of the singers' own sides with guitars: every tenth one, up to 24, from several singers */
const GUITARS = SONGS.filter((s) => s.orchestraId === "guitarras-solo-singer" && s.singer && s.title);
const SAMPLE = GUITARS.filter((_, i) => i % 10 === 0).slice(0, 24);

const COVER = (id: string) => `https://cdn-images.dzcdn.net/images/cover/${id}/250x250-000000-80-0-0.jpg`;
const j = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
/**
 * Deezer's search, mocked: for any query naming the side's singer it answers the singer's own recording (credited to
 * the singer, as Deezer credits a solo singer) beside a stranger's recording of the same title; a query without the
 * singer finds only the stranger's.
 */
function deezerFor(s: Side) {
  const calls: string[] = [];
  const own = {
    id: 1,
    title: s.title,
    duration: Math.round(s.durationSec ?? 170),
    artist: { name: s.singer! },
    album: { title: `${s.singer} con guitarras`, cover_medium: COVER("own") },
  };
  const other = {
    id: 2,
    title: s.title,
    duration: 200,
    artist: { name: "Orquesta Típica Contemporánea" },
    album: { title: "Tango Hoy", cover_medium: COVER("other") },
  };
  const surname = fold(s.singer!).split(" ").pop()!.toLowerCase();
  const d = {
    fetch: async (url: string) => {
      calls.push(url);
      const q = new URL(url).searchParams.get("q")?.toLowerCase() ?? "";
      return j({ data: q.includes(surname) ? [other, own] : [other] });
    },
    catalog: () => ({ catalog: { songs: SONGS, profiles: new Map() } }),
  } as unknown as ApiDeps;
  return { d, calls };
}
const req = (qs: string) => new Request(`http://localhost/api/artwork?${qs}`);

beforeEach(() => resetArtworkState());

describe("covers for a solo singer's sides with guitars", () => {
  it("the sample is real: the catalogue files them under the guitars label, most with no recording to ask about", () => {
    expect(SAMPLE.length).toBeGreaterThanOrEqual(8);
    expect(new Set(SAMPLE.map((s) => s.singer)).size).toBeGreaterThanOrEqual(3);
    for (const s of SAMPLE) expect(s.orchestra).toBe("Guitarras (solo singer)");
  });

  it("the page asks the route to search by the side (its catalogue id first)", () => {
    for (const s of SAMPLE.filter((x) => !x.spotify?.uri)) {
      const q = liveQuery(s as never)!;
      expect(q.search).toBe(true);
      const p = new URLSearchParams(q.qs);
      expect(p.get("id")).toBe(s.id);
      expect(p.get("singer")).toBe(s.singer);
    }
  });

  it("the route climbs the Find-on-services ladder: the singer first, never the word 'Guitarras'", async () => {
    for (const s of SAMPLE) {
      const side = searchSide(new URLSearchParams({ search: "1", id: s.id }), deezerFor(s).d)!;
      expect(side.title).toBe(s.title);
      const ladder = queryLadder("deezer", side);
      expect(ladder[0]!.why).toBe("title_singer");
      expect(ladder.some((r) => /guitarra/i.test(r.q))).toBe(false);
      const { d, calls } = deezerFor(s);
      const r = await artwork(req(`search=1&id=${s.id}`), d, new CoverLru());
      expect(await r.json(), s.title).toEqual({ url: COVER("own"), source: "deezer" });
      // the first rung is title + singer (the ladder goes on only while no candidate is certain, at most 4 queries)
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls.length).toBeLessThanOrEqual(4);
      expect(new URL(calls[0]!).searchParams.get("q")).toContain(fold(s.singer!));
    }
  });

  it("a stranger's recording of the title is never taken for the singer's: no cover rather than a wrong one", async () => {
    const s = SAMPLE[0]!;
    const d = {
      fetch: async () =>
        j({
          data: [
            {
              id: 9,
              title: s.title,
              duration: 200,
              artist: { name: "Orquesta Típica Contemporánea" },
              album: { title: "Tango Hoy", cover_medium: COVER("other") },
            },
          ],
        }),
      catalog: () => ({ catalog: { songs: SONGS, profiles: new Map() } }),
    } as unknown as ApiDeps;
    expect(await (await artwork(req(`search=1&id=${s.id}`), d, new CoverLru())).json()).toEqual({
      url: null,
    });
    expect(SEARCH_MIN).toBeGreaterThan(0.4);
  });

  it("caches: the route answers a repeat from its LRU; the page keeps the cover and asks once per side", async () => {
    const s = SAMPLE[1]!;
    const { d, calls } = deezerFor(s);
    const lru = new CoverLru();
    await artwork(req(`search=1&id=${s.id}`), d, lru);
    const first = calls.length;
    await artwork(req(`search=1&id=${s.id}`), d, lru);
    expect(calls).toHaveLength(first);
    const side = searchSide(new URLSearchParams({ id: s.id }), d)!;
    expect(lru.get(searchKey(side))).toEqual({ url: COVER("own") });

    let asked = 0;
    const f = (async (url: string) => {
      asked++;
      expect(url).toMatch(/^\/api\/artwork\?search=1&id=/);
      return j({ url: COVER("own"), source: "deezer" });
    }) as typeof fetch;
    const page = { ...s, spotify: null };
    const [a, b] = await Promise.all([
      lookupCover(page as never, { fetch: f }),
      lookupCover(page as never, { fetch: f }),
    ]);
    expect([a, b]).toEqual([COVER("own"), COVER("own")]);
    expect(await lookupCover(page as never, { fetch: f })).toBe(COVER("own"));
    expect(asked).toBe(1);
    expect(artworkCache()[s.id]).toBe(COVER("own"));
  });

  it("an unreachable search is not asked again this session (no page-side fallback to hammer)", async () => {
    const s = { ...SAMPLE[2]!, spotify: null };
    let asked = 0;
    const down = (async () => {
      asked++;
      return j({ url: null, retry: true });
    }) as typeof fetch;
    expect(await lookupCover(s as never, { fetch: down })).toBeNull();
    expect(await lookupCover(s as never, { fetch: down })).toBeNull();
    expect(asked).toBe(1);
  });

  it("the visible rows ask at most six at a time", async () => {
    expect(LIVE_CONCURRENCY).toBe(6);
    const limit = createLimiter(LIVE_CONCURRENCY);
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const f = (() => {
      running++;
      peak = Math.max(peak, running);
      return new Promise<Response>((ok) =>
        release.push(() => {
          running--;
          ok(j({ url: COVER("own") }));
        }),
      );
    }) as unknown as typeof fetch;
    const all = SAMPLE.slice(0, 14).map((s) =>
      lookupCover({ ...s, spotify: null } as never, { fetch: f, limit }),
    );
    for (let k = 0; k < 40 && release.length; k++) {
      await new Promise((r) => setTimeout(r, 0));
      release.shift()?.();
    }
    while (release.length) release.shift()?.();
    await Promise.all(all);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it("reads as the singer with guitars (display only)", () => {
    const s = SAMPLE.find((x) => x.singer === "Héctor Mauré") ?? SAMPLE[0]!;
    expect(orchestraName(s)).toBe(`${s.singer} with guitars`);
    expect(
      orchestraName({
        orchestra: "Carlos Di Sarli",
        orchestraId: "carlos-di-sarli",
        singer: "Roberto Rufino",
      }),
    ).toBe("Carlos Di Sarli");
    // the data keeps its label
    expect(s.orchestra).toBe("Guitarras (solo singer)");
  });
});
