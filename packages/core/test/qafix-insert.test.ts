/**
 * QA fix (2026-11), inserting: a fifth side in a four-side tango tanda said nothing (the guide now says "Tanda 1 has
 * 5 songs: your tango tandas are 4"); the place offered 2 sides, most tandas none (the near misses follow now, each
 * with its reason); the guide lists only what the edit caused (an inserted tanda renumbers the ones after it: their
 * old energy steps and faults are not the edit's); the night's length in units ("4 h 47 min").
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  editGuide,
  insertSong,
  insertSongOptions,
  insertTanda,
  insertTandaOptions,
  moveTanda,
  type Playlist,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let featured: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
}, 600000);

describe("a side into a full tanda", () => {
  it("the guide flags a tanda of 5 when the night's tangos are 4", () => {
    const s = insertSongOptions(featured, 0, 4, deps).suggestions[0]!;
    const r = insertSong(featured, 0, 4, s.song, deps);
    expect(r.reason).toBeUndefined();
    const g = editGuide(featured, r.playlist, deps);
    const size = g.find((x) => x.key === "size");
    expect(size?.message.key).toBe("guide.tanda_size_more");
    expect(size?.text).toBe("Tanda 1 has 5 songs: your tango tandas are 4");
  });
  it("every tango tanda of the featured night is offered sides (the near misses with their reason)", () => {
    featured.tandas.forEach((t, i) => {
      if (t.rhythm !== "tango" || t.orchestraId === "tango-bardo") return;
      const r = insertSongOptions(featured, i, t.songs.length, deps, { limit: 8 });
      expect(r.suggestions.length, `tanda ${i + 1}`).toBeGreaterThanOrEqual(5);
      for (const x of r.suggestions) {
        if (!x.ok) expect(x.reason).toBeTruthy();
        expect(x.song.orchestraId).toBe(t.orchestraId);
        expect(x.song.rhythm).toBe(t.rhythm);
        expect(t.songs.some((y) => y.id === x.song.id)).toBe(false);
      }
      // the sides that keep every rule first
      const firstMiss = r.suggestions.findIndex((x) => !x.ok);
      if (firstMiss >= 0) expect(r.suggestions.slice(firstMiss).every((x) => !x.ok)).toBe(true);
    });
  });
});

describe("the guide lists only what the edit caused", () => {
  it("an inserted tanda: no line names a tanda that only moved down a place", () => {
    const at = 5;
    const opt = insertTandaOptions(featured, at, deps, { n: 1, seed: 7 })[0]!;
    const r = insertTanda(featured, at, { tanda: opt.tanda }, deps);
    const g = editGuide(featured, r.playlist, deps);
    const named = g
      .filter((x) => x.key === "energy")
      .map((x) => Number(x.message.params.n) - 1)
      .filter((i) => Number.isFinite(i));
    // energy lines only for the new tanda and its two neighbours
    for (const i of named) expect([at - 1, at, at + 1]).toContain(i);
    const len = g.find((x) => x.key === "length");
    if (len) expect(String(len.message.params.total)).toMatch(/^\d+ h \d+ min$/);
  });
  it("a locked tanda never moves (QA: Move up / down moved it)", () => {
    const locked = {
      ...featured,
      tandas: featured.tandas.map((t, k) => (k === 3 ? { ...t, locked: true } : t)),
    };
    const r = moveTanda(locked, 3, 5, deps);
    expect(r.reason).toMatch(/locked/);
    expect(r.playlist).toBe(locked);
    const free = { ...featured, tandas: featured.tandas.map((t) => ({ ...t, locked: false })) };
    expect(moveTanda(free, 3, 5, deps).reason).toBeUndefined();
  });
  it("the same night twice: nothing to say", () => {
    expect(editGuide(featured, featured, deps)).toEqual([]);
  });
});
