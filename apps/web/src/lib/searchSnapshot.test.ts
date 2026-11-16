import { type SongIndex, type SongSearchOptions, type SongSearchResult, searchSongs } from "@tdj/core";
import { loadCatalog } from "@tdj/core/load";
import { beforeAll, describe, expect, it } from "vitest";
import { SNAPSHOT_PART, type SnapshotPart, searchSnapshot, snapshotOf } from "./api/searchSnapshot";
import { indexFromSnapshot } from "./searchSnapshot";

/**
 * 2026-11 ("the search is so slow"): the browser's search worker answers from its own copy of the index, built from
 * GET /api/search/snapshot. It must rank, count and correct exactly as POST /api/search does over the server's index:
 * same items in the same order, same scores, facets, "did you mean", close spellings, groups and pages.
 */

let server: SongIndex;
let client: SongIndex;
let parts: SnapshotPart[];
let manifest: { v: string; parts: number; count: number };

beforeAll(() => {
  const loaded = loadCatalog();
  server = loaded.catalog.searchIndex();
  const snap = snapshotOf(loaded.catalog, loaded.meta);
  manifest = snap.manifest;
  // what crosses the wire: JSON, part by part
  parts = snap.parts.map((p) => JSON.parse(JSON.stringify(p)) as SnapshotPart);
  client = indexFromSnapshot([...parts].reverse());
}, 120_000);

const shape = (r: SongSearchResult) => ({
  ids: r.items.map((h) => h.song.id),
  scores: r.items.map((h) => Math.round(h.score * 100) / 100),
  popularity: r.items.map((h) => h.popularity),
  favourite: r.items.map((h) => !!h.favourite),
  highlights: r.items.map((h) => h.highlights),
  total: r.total,
  facets: r.facets,
  suggestion: r.suggestion,
  corrected: r.corrected,
  groups: r.groups,
  parsed: r.parsed,
});

const CASES: Array<[string, SongSearchOptions?]> = [
  ["di sarli"],
  ["di sarli 1941 instrumental"],
  ["pugliese 40s"],
  ["la cumparsita"],
  ["d'arienzo instrumental"],
  ["darienzo 1938", { limit: 30 }],
  // the leader + singer alias (core search.test.ts): Fiorentino's sides first, not every Troilo side
  ["fiorentino troilo"],
  ["troilo fiorentino"],
  ["otv vals"],
  ["pichuco"],
  ["conoces"],
  ["ventaron"],
  ["zugliasse yumba"],
  ["pugliese yumba"],
  ["tango"],
  ["ma"],
  ["(pugliese)"],
  ["*"],
  ["di sarli", { filters: { rhythms: ["vals"] } }],
  ["canaro", { filters: { vocal: true, decades: [1930] } }],
  ["", { filters: { rhythms: ["milonga"], yearFrom: 1935, yearTo: 1955 } }],
  ["troilo", { group: "orchestra", limit: 50 }],
  ["d'arienzo", { offset: 50, limit: 50 }],
  ["d'arienzo", { filters: { hasStream: true }, limit: 5 }],
];

describe("the browser's index answers as the server's", () => {
  it("the snapshot holds every side once, in parts small enough for a function's answer", () => {
    expect(manifest.count).toBe(server.songs.length);
    expect(parts.length).toBe(Math.ceil(server.songs.length / SNAPSHOT_PART));
    expect(client.songs.map((s) => s.id)).toEqual(server.songs.map((s) => s.id));
    for (const p of parts) expect(JSON.stringify(p).length).toBeLessThan(4_000_000);
    // the alternative titles the index reads cross too (the plain search wire drops them)
    expect(client.songs.filter((s) => s.altTitles?.length).length).toBe(
      server.songs.filter((s) => s.altTitles?.length).length,
    );
  });

  it("same popularity per side (dancer popularity and fame)", () => {
    expect(Array.from(client.pop)).toEqual(Array.from(server.pop));
  });

  for (const [q, o] of CASES)
    it(`same answer: “${q}” ${o ? JSON.stringify(o) : ""}`, () => {
      expect(shape(searchSongs(client, q, o))).toEqual(shape(searchSongs(server, q, o)));
    });

  it("same answer with the DJ's favourites (the ♥ chip counts and filters them)", () => {
    const fav = server.songs
      .filter((s) => /pugliese/.test(s.orchestraId))
      .slice(0, 25)
      .map((s) => s.id);
    for (const filters of [{ favourites: fav }, { favourites: fav, favouritesOnly: true }])
      expect(shape(searchSongs(client, "pugliese", { filters }))).toEqual(
        shape(searchSongs(server, "pugliese", { filters })),
      );
  });

  it("every prefix of a typed query answers the same (each keystroke)", () => {
    const q = "fiorentino troilo 1944";
    for (let i = 2; i <= q.length; i++)
      expect(shape(searchSongs(client, q.slice(0, i)))).toEqual(shape(searchSongs(server, q.slice(0, i))));
  });
});

describe("GET /api/search/snapshot", () => {
  const deps = () => {
    const loaded = loadCatalog();
    return { catalog: () => loaded } as unknown as Parameters<typeof searchSnapshot>[1];
  };

  it("the manifest is revalidated; a part of that version is immutable, of another never stored", async () => {
    const d = deps();
    const m = await searchSnapshot(new Request("http://x/api/search/snapshot"), d);
    expect(m.headers.get("cache-control")).toMatch(/must-revalidate/);
    const j = (await m.json()) as typeof manifest;
    expect(j.parts).toBeGreaterThan(0);
    const p = await searchSnapshot(new Request(`http://x/api/search/snapshot?v=${j.v}&part=0`), d);
    expect(p.headers.get("cache-control")).toMatch(/immutable/);
    const body = (await p.json()) as SnapshotPart;
    expect(body.v).toBe(j.v);
    expect(body.aliases && Object.keys(body.aliases).length).toBeGreaterThan(0);
    const stale = await searchSnapshot(new Request("http://x/api/search/snapshot?v=old&part=0"), d);
    expect(stale.headers.get("cache-control")).toBe("no-store");
    const none = await searchSnapshot(new Request(`http://x/api/search/snapshot?v=${j.v}&part=999`), d);
    expect(none.status).toBe(404);
  });
});
