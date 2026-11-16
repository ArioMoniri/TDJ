/**
 * 2026-11 (function review) — the DJ's learned tandas repeated word for word in new nights: the Di Sarli / Rufino
 * milonga the DJ pinned in the featured night played as it is in 41 of 48 nights. The variety cap (learn.ts): a learned
 * template plays as it is in about one night in three (a stable draw of the seed), its family otherwise with another
 * selection of its sides; a template heard in the recent nights rests. Written before the engine change.
 *
 * What it cannot change (measured over 24 seeds, 2026-11-16): the three side sets that recur — the Di Sarli / Rufino
 * milonga (21 of 24 nights, 22 without the cap), the Donato / Lagos milonga (23) and the Biagi / Falgás valses (8) — are families with
 * exactly three sides on Spotify, and the late vals / milonga chairs of a golden night ask for a known family that
 * streams (the panel's fame floor, a blocker): there is no other selection to draw, and resting the family trades the
 * blocker for it. The cap moves them only when the catalogue holds a fourth side that streams.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  compose,
  emptyMemory,
  type LearnedPreferences,
  learnedSideSets,
  type Playlist,
  recentFromMemory,
  rememberSet,
  sideSetKey,
  type Tanda,
  TEMPLATE_SHARE,
  templateNight,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
const nights: Playlist[] = [];
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
beforeAll(() => {
  deps = loadCatalog();
  for (const seed of SEEDS) nights.push(compose({ hours: 4, seed }, deps));
}, 900000);
afterEach(() => new Promise((r) => setTimeout(r, 0)));
const setsOf = (p: Playlist) => p.tandas.map((t) => sideSetKey(t.songs.map((s) => s.id)));
const templateOf = (t: Tanda): LearnedPreferences => ({
  sides: {},
  families: {},
  edits: [],
  templates: [
    {
      id: `${t.rhythm}:${t.songs.map((s) => s.id).join(",")}`,
      rhythm: t.rhythm,
      name: "t",
      songIds: t.songs.map((s) => s.id),
      at: "2026-11-16",
    },
  ],
});
/** a tanda of the night whose family has another side on Spotify it could play (the cap has a selection to offer) */
function variableTanda(p: Playlist): Tanda {
  const t = p.tandas.find((x, i) => {
    // (never the first D'Arienzo: its seeded draw is the night's variety already, and the cap leaves it alone)
    if (i === 0 || i === p.tandas.length - 1 || x.peak || x.rhythm !== "tango") return false;
    if (x.orchestraId === "juan-d-arienzo") return false;
    const fam = deps.catalog.songs.filter(
      (s) =>
        s.orchestraId === x.orchestraId &&
        s.rhythm === x.rhythm &&
        (s.singer ?? "") === (x.singer ?? "") &&
        !!s.spotify?.uri &&
        !!s.year &&
        x.yearRange &&
        s.year >= x.yearRange[0] - 1 &&
        s.year <= x.yearRange[1] + 1,
    );
    return fam.length >= x.songs.length + 3;
  });
  expect(t).toBeTruthy();
  return t!;
}

describe("the variety cap on the DJ's learned tandas", () => {
  it("the draw: about one night in three, stable per seed and template", () => {
    expect(TEMPLATE_SHARE).toBeCloseTo(1 / 3);
    const hits = Array.from({ length: 3000 }, (_, s) => templateNight(s, "template:x")).filter(
      Boolean,
    ).length;
    expect(hits / 3000).toBeGreaterThan(0.28);
    expect(hits / 3000).toBeLessThan(0.39);
    expect(templateNight(7, "template:x")).toBe(templateNight(7, "template:x"));
    expect(Array.from({ length: 50 }, (_, s) => templateNight(s, "a", 0)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 50 }, (_, s) => templateNight(s, "a", 1)).every(Boolean)).toBe(true);
  });
  it("on a night that is not the template's, its family plays with another selection of its sides", () => {
    const seed = 2;
    const p = nights[seed - 1]!;
    const t = variableTanda(p);
    const key = sideSetKey(t.songs.map((s) => s.id));
    // the share 1: every night is the template's — the night is the one composed without it
    const on = compose({ hours: 4, seed, learned: templateOf(t), rules: { templateShare: 1 } }, deps);
    expect(setsOf(on)).toContain(key);
    // the share 0: never as it is
    const off = compose({ hours: 4, seed, learned: templateOf(t), rules: { templateShare: 0 } }, deps);
    expect(setsOf(off)).not.toContain(key);
  });
  it("a template heard in the recent nights rests tonight (memory: the last sets' side sets)", () => {
    const seed = 2;
    const p = nights[seed - 1]!;
    const t = variableTanda(p);
    const key = sideSetKey(t.songs.map((s) => s.id));
    const memory = rememberSet(emptyMemory(), p);
    expect(memory.sets[0]!.sideSets).toEqual(setsOf(p));
    const recent = recentFromMemory(memory)!;
    expect(recent.sideSets).toContain(key);
    const again = compose(
      { hours: 4, seed, learned: templateOf(t), recent, rules: { templateShare: 1 } },
      deps,
    );
    expect(setsOf(again)).not.toContain(key);
  });
  it("over 24 seeds no learned template whose family can vary plays word for word in more than 40 % of the nights", () => {
    const templates = learnedSideSets(deps.catalog.learned);
    expect(templates.size).toBeGreaterThan(5);
    const counts = new Map<string, number>();
    for (const p of nights)
      for (const k of new Set(setsOf(p))) if (templates.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const [k, v] of counts) {
      const ids = k.split(",");
      const one = deps.catalog.songs.find((s) => s.id === ids[0])!;
      const streams = deps.catalog.songs.filter(
        (s) =>
          s.orchestraId === one.orchestraId &&
          s.rhythm === one.rhythm &&
          (s.singer ?? "") === (one.singer ?? "") &&
          !!s.spotify?.uri,
      ).length;
      // (a family of exactly its template's sides on Spotify has nothing else to play: see the note on top)
      if (streams > ids.length) expect(v / nights.length, templates.get(k)).toBeLessThanOrEqual(0.4);
    }
  });
  it("the golden set holds: every night of the 24 at 85 or more", () => {
    for (const p of nights) expect(p.score.total, p.id).toBeGreaterThanOrEqual(85);
  });
});
