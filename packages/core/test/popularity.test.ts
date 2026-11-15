/**
 * Dancer popularity from databases (2026-11: "track favourites from databases too, not only from me clicking the love
 * button"). An offline prior per recording from DJ sets, canonical tandas, the famous recordings, public set lists and
 * listening ranks (data/knowledge/dancer_popularity.json, scripts/build_popularity.ts), normalised by rank percentile
 * within orchestra and era, role-aware, read by the favourites tracker in place of the fame prior: bounded (prior
 * ≤ 0.4, pseudo-count K = 2), so the DJ's own taps outweigh it after a few nights; switched off, nothing changes.
 * Written before the code.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanFavouriteTable,
  combineScore,
  compose,
  type DancerFavourites,
  type DancerPopularity,
  databasePrior,
  emptyFavourites,
  FAVOURITE_LIMITS,
  favouriteSideFactor,
  favouritesActive,
  favouriteTable,
  midRankPercentile,
  normalizeFavourites,
  type Playlist,
  POPULARITY_LIMITS,
  POPULARITY_SOURCES,
  POPULARITY_WEIGHTS,
  popularityLine,
  popularityPrior,
  popularityRows,
  rankPercentiles,
  recordFloor,
  roleOfFamous,
  roleOfPhase,
  roleOfPosition,
  roleScores,
  type Song,
  scorePlaylist,
  setDancerPopularity,
  sideFactorOf,
  spreadCap,
  strictChecks,
  withPopularity,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

const FILE = join(findRoot(), "data/knowledge/dancer_popularity.json");
const committed = (): DancerPopularity => JSON.parse(readFileSync(FILE, "utf8"));
let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
}, 600000);
afterAll(() => setDancerPopularity(committed()));

const ids = (p: Playlist) => p.tandas.map((t) => t.songs.map((s) => s.id).join(","));

/** a fake file: `top` scores 1 everywhere, `closer` is a closer */
function fake(songs: DancerPopularity["songs"]): DancerPopularity {
  return {
    version: 1,
    asOf: "2026-11-15",
    weights: { ...POPULARITY_WEIGHTS },
    sources: Object.fromEntries(
      POPULARITY_SOURCES.map((s) => [s, { status: "ok" }]),
    ) as DancerPopularity["sources"],
    songs,
  };
}

describe("percentile normalisation: within orchestra and era", () => {
  it("mid-rank percentile: the top of n is 1, ties share their mid rank", () => {
    expect(midRankPercentile([1, 2, 3, 4], 4)).toBe(1);
    expect(midRankPercentile([1, 2, 3, 4], 1)).toBe(0.25);
    expect(midRankPercentile([1, 2, 2, 4], 2)).toBe(0.625);
    expect(midRankPercentile([], 3)).toBe(0);
  });
  it("no evidence is 0; a small orchestra's top recording beats a big orchestra's bottom one", () => {
    const items = [
      ...[50, 40, 30, 20, 10].map((v, i) => ({ key: `big${i}`, group: "juan-d-arienzo|golden", value: v })),
      { key: "small0", group: "ricardo-tanturi|golden", value: 3 },
      { key: "small1", group: "ricardo-tanturi|golden", value: 2 },
      { key: "none", group: "ricardo-tanturi|golden", value: 0 },
    ];
    const p = rankPercentiles(items);
    expect(p.get("none")).toBe(0);
    for (const v of p.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // by raw count the small orchestra's top (3 plays) sits under every big one (10–50); in its own group it leads
    expect(p.get("small0")!).toBeGreaterThan(p.get("big4")!);
    expect(p.get("small0")!).toBeGreaterThan(p.get("small1")!);
    expect(p.get("big0")!).toBeGreaterThan(p.get("big1")!);
    // a group of one is not the top of anything: shrunk by n / (n + 1)
    const lone = rankPercentiles([{ key: "a", group: "x", value: 1 }]);
    expect(lone.get("a")!).toBeLessThan(1);
  });
});

describe("the weights", () => {
  it("DJ sets and canonical tandas most, then public play data (set lists, tango.info), then listening", () => {
    const w = POPULARITY_WEIGHTS;
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(w.djSets).toBeGreaterThanOrEqual(w.canonicalTandas);
    expect(w.canonicalTandas).toBeGreaterThan(w.famous);
    expect(w.famous).toBeGreaterThanOrEqual(w.tangoInfo);
    expect(w.tangoInfo).toBe(w.setlists);
    expect(w.tangoInfo).toBeGreaterThan(w.deezer);
    expect(w.tangoInfo).toBeGreaterThan(w.spotify);
  });
  it("the score is the weighted mean over the sources that worked; a blocked one leaves the mean", () => {
    const all = POPULARITY_SOURCES;
    expect(combineScore(Object.fromEntries(all.map((s) => [s, 1])), all)).toBe(1);
    expect(combineScore({}, all)).toBe(0);
    // listening alone (top on Deezer and Spotify) stays a weak score
    const listening = combineScore({ deezer: 1, spotify: 1 }, all);
    expect(listening).toBeCloseTo(POPULARITY_WEIGHTS.deezer + POPULARITY_WEIGHTS.spotify, 4);
    expect(listening).toBeLessThan(combineScore({ djSets: 1 }, all));
    // Spotify blocked: a song top everywhere else still scores 1
    const noSpotify = all.filter((s) => s !== "spotify");
    expect(combineScore(Object.fromEntries(noSpotify.map((s) => [s, 1])), noSpotify)).toBe(1);
  });
});

describe("role mapping: set positions, tanda phases and famous roles → slot roles", () => {
  it("the first tanda opens (warm-up), the last closes; the middle is the peak", () => {
    expect(roleOfPosition(1, 20)).toBe("warmup");
    expect(roleOfPosition(20, 20)).toBe("close");
    expect(roleOfPosition(3, 20)).toBe("warmup");
    expect(roleOfPosition(7, 20)).toBe("build");
    expect(roleOfPosition(11, 20)).toBe("peak");
    expect(roleOfPosition(17, 20)).toBe("cooldown");
    expect(roleOfPosition(19, 20)).toBe("close");
    expect(roleOfFamous("opener")).toBe("warmup");
    expect(roleOfFamous("closer")).toBe("close");
    expect(roleOfFamous("anytime")).toBeUndefined();
    expect(roleOfPhase("peak")).toBe("peak");
    expect(roleOfPhase("whatever")).toBeUndefined();
  });
  it("role scores: the placed role keeps the score, the others keep 60 %; too little placed → one score", () => {
    const r = roleScores(0.8, { close: 4, peak: 1 })!;
    expect(r.close).toBe(0.8);
    expect(r.warmup).toBeCloseTo(0.8 * POPULARITY_LIMITS.roleFloor, 4);
    expect(r.peak!).toBeGreaterThan(r.warmup!);
    expect(r.peak!).toBeLessThan(r.close!);
    expect(roleScores(0.8, { close: 1 })).toBeUndefined();
  });
  it("the prior reads the slot's role", () => {
    setDancerPopularity(fake({ c: { s: 0.5, roles: { close: 1, warmup: 0.5 }, ev: {} } }));
    expect(popularityPrior("c", "close")).toBe(0.4);
    expect(popularityPrior("c", "warmup")).toBe(0.2);
    expect(popularityPrior("c")).toBe(0.2);
    expect(popularityPrior("unknown", "peak")).toBe(0);
    setDancerPopularity(undefined);
    expect(popularityPrior("c", "close")).toBeUndefined();
  });
});

describe("the prior is bounded: the DJ's own floor outweighs it", () => {
  const song = (id: string): Song =>
    ({
      id,
      title: `Song ${id}`,
      orchestra: "Juan D'Arienzo",
      orchestraId: "juan-d-arienzo",
      singer: null,
      vocal: false,
      year: 1937,
      rhythm: "tango",
      era: "golden-early",
      fame: 5,
    }) as unknown as Song;
  const tanda = (s: Song) =>
    ({
      index: 4,
      phase: "peak",
      rhythm: "tango",
      orchestraId: s.orchestraId,
      songs: [s],
      yearRange: [1937, 1937],
    }) as never;
  const tap = (F: DancerFavourites, s: Song, reaction: "full" | "emptied", k: number) =>
    recordFloor(F, {
      nightId: `n${k}`,
      scope: "song",
      song: s,
      tanda: tanda(s),
      tandaIndex: 4,
      reaction,
      at: new Date(Date.now() - k * 864e5).toISOString(),
    });

  it("pseudo-count ≤ 2, prior ≤ 0.4", () => {
    expect(FAVOURITE_LIMITS.k).toBeLessThanOrEqual(2);
    expect(POPULARITY_LIMITS.priorMax).toBeLessThanOrEqual(0.4);
  });
  it("3 'emptied' taps outweigh a top-popular prior; with none, the top side lifts at most ×1.4", () => {
    setDancerPopularity(fake({ top: { s: 1, ev: {} }, other: { s: 1, ev: {} } }));
    let F = emptyFavourites();
    for (let k = 0; k < 3; k++) F = tap(F, song("top"), "emptied", k);
    const T = withPopularity(favouriteTable(F), F);
    expect(T.pop).toBe(1);
    expect(favouriteSideFactor(T, "top", "peak")).toBeLessThan(1);
    // the database alone: a bounded lift, below what the DJ's own ♥ reaches
    const dbOnly = favouriteSideFactor(T, "other", "peak");
    expect(dbOnly).toBeCloseTo(sideFactorOf(0.4), 6);
    expect(dbOnly).toBeLessThanOrEqual(1.4);
    let G = emptyFavourites();
    for (let k = 0; k < 3; k++) G = tap(G, song("other"), "full", k);
    expect(favouriteSideFactor(withPopularity(favouriteTable(G), G), "other", "peak")).toBeGreaterThan(
      dbOnly,
    );
    // an unknown side: nothing
    expect(favouriteSideFactor(T, "nobody", "peak")).toBe(1);
  });
  it("the popularity prior replaces the fame prior of the DJ's evidence", () => {
    setDancerPopularity(fake({ top: { s: 0, ev: {} } }));
    let F = emptyFavourites();
    F = tap(F, song("top"), "full", 0);
    const on = favouriteSideFactor(withPopularity(favouriteTable(F), F), "top", "peak");
    const G = { ...F, popularityOff: true };
    const off = favouriteSideFactor(withPopularity(favouriteTable(G), G), "top", "peak");
    // fame 5 gave prior 0.4; the databases say 0 here
    expect(on).toBeLessThan(off);
  });
});

describe("the switch 'Use popularity from databases'", () => {
  it("off: the table carries no popularity and every factor is as without the databases", () => {
    setDancerPopularity(fake({ top: { s: 1, ev: {} } }));
    const F: DancerFavourites = { ...emptyFavourites(), popularityOff: true };
    const T = withPopularity(favouriteTable(F), F);
    expect(T.pop).toBeUndefined();
    expect(favouritesActive(T)).toBe(false);
    expect(databasePrior(T, "top", "peak")).toBe(0);
    expect(favouriteSideFactor(T, "top", "peak")).toBe(1);
    // the switch survives the memory and the request
    expect(normalizeFavourites(F)?.popularityOff).toBe(true);
    expect(cleanFavouriteTable(withPopularity(favouriteTable(emptyFavourites())))?.pop).toBe(1);
    // a table nobody asked popularity for (the CLI, older requests) stays as before
    expect(favouriteTable(emptyFavourites()).pop).toBeUndefined();
    expect(cleanFavouriteTable(T)?.pop).toBeUndefined();
    // favourites switched off: popularity is off with them
    const offF = { ...emptyFavourites(), off: true };
    expect(databasePrior(withPopularity(favouriteTable(offF), offF), "top", "peak")).toBe(0);
  });
  it("off, the night is exactly the night composed without the databases", () => {
    setDancerPopularity(committed());
    const base = compose({ hours: 2, seed: 12 }, deps);
    const F = { ...emptyFavourites(), popularityOff: true };
    const off = compose({ hours: 2, seed: 12, favourites: withPopularity(favouriteTable(F), F) }, deps);
    expect(ids(off)).toEqual(ids(base));
    setDancerPopularity(undefined);
    const unloaded = compose(
      { hours: 2, seed: 12, favourites: withPopularity(favouriteTable(emptyFavourites())) },
      deps,
    );
    expect(ids(unloaded)).toEqual(ids(base));
    setDancerPopularity(committed());
  });
});

describe("compose with the databases on: rule-safe, golden ≥ 85", () => {
  it("one orchestra and the spread cap per tanda, no title twice, no new blocker; golden scores ≥ 85", () => {
    setDancerPopularity(committed());
    let lifted = 0;
    let base = 0;
    for (const seed of [1, 2, 3]) {
      const p = compose(
        { hours: 4, seed, favourites: withPopularity(favouriteTable(emptyFavourites())) },
        deps,
      );
      const q = compose({ hours: 4, seed }, deps);
      const titles = new Set<string>();
      for (const t of p.tandas) {
        const dance = t.songs.filter((s) => s.title !== "La Cumparsita");
        expect(new Set(dance.map((s) => s.orchestraId)).size).toBe(1);
        const ys = dance.map((s) => s.year).filter((y): y is number => !!y);
        if (ys.length)
          expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(spreadCap(t.rhythm, t.vocal, 4) + 1);
        for (const s of dance) {
          expect(titles.has(s.title.toLowerCase())).toBe(false);
          titles.add(s.title.toLowerCase());
        }
      }
      expect(strictChecks(p).blockers).toBeLessThanOrEqual(strictChecks(q).blockers);
      expect(scorePlaylist(p).total).toBeGreaterThanOrEqual(85);
      const pop = (x: Playlist) =>
        x.tandas.flatMap((t) => t.songs).reduce((a, s) => a + (popularityPrior(s.id) ?? 0), 0);
      lifted += pop(p);
      base += pop(q);
    }
    // the databases are used: the nights lean to the popular recordings
    expect(lifted).toBeGreaterThan(base);
  }, 600000);
});

describe("the committed file", () => {
  it("holds a 0–1 score and the evidence per source for each song id; every source reports its status", () => {
    expect(existsSync(FILE)).toBe(true);
    const P = committed();
    expect(P.version).toBe(1);
    for (const s of POPULARITY_SOURCES)
      expect(["ok", "blocked", "no-data", "skipped"]).toContain(P.sources[s].status);
    const songIds = new Set(deps.catalog.songs.map((s) => s.id));
    const entries = Object.entries(P.songs);
    expect(entries.length).toBeGreaterThan(1000);
    for (const [id, e] of entries) {
      expect(songIds.has(id)).toBe(true);
      expect(e.s).toBeGreaterThan(0);
      expect(e.s).toBeLessThanOrEqual(1);
      expect(Object.keys(e.ev).length).toBeGreaterThan(0);
    }
    const top = popularityRows(P, { limit: 20 });
    expect(top).toHaveLength(20);
    for (const r of top) expect(popularityLine(P.songs[r.id])).toMatch(/DJ sets|Canonical|Set lists/);
  });
});
