import { emptyMemory } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { setFavouritesUse } from "./favourites";
import { normalizeMemory } from "./memory";
import { popularityText, popularityUse, requestFavourites, setPopularityUse } from "./popularity";

/**
 * 2026-11, "Use popularity from databases" (Settings, Database → Memory; default on): a request carries `pop: 1`
 * over the DJ's own table; switched off (or with dancer favourites off) it is exactly the request of before.
 */
describe("popularity from databases on the web", () => {
  it("default on: even a DJ with no floor evidence asks for it", () => {
    const m = emptyMemory();
    expect(popularityUse(m)).toBe(true);
    expect(requestFavourites(m)).toEqual({ v: 1, pop: 1, sides: {}, families: {} });
  });
  it("switched off: the request is what it was before (none without evidence), and the switch is remembered", () => {
    const m = setPopularityUse(emptyMemory(), false);
    expect(popularityUse(m)).toBe(false);
    expect(requestFavourites(m)).toBeUndefined();
    // the memory keeps it through normalisation (this device, the DJ's own database row)
    expect(popularityUse(normalizeMemory(JSON.parse(JSON.stringify(m))))).toBe(false);
    expect(popularityUse(setPopularityUse(m, true))).toBe(true);
  });
  it("dancer favourites switched off: popularity is off with them", () => {
    const m = setFavouritesUse(emptyMemory(), false);
    expect(popularityUse(m)).toBe(false);
    expect(requestFavourites(m)).toEqual({ v: 1, off: true, sides: {}, families: {} });
  });
  it("the source line: counts and tiers by source", () => {
    expect(
      popularityText([
        { source: "djSets", value: 14 },
        { source: "setlists", value: 9 },
        { source: "deezer", value: "high" },
      ]),
    ).toBe("DJ sets: 14 · Set lists: 9 · Deezer: high");
  });
});
