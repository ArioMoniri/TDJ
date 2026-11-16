/**
 * 2026-11 (the owner: "swap should be a choice: search, pick, reorder, from the catalogue and connected services"):
 * the engine side of the Swap sheets. Written before the change:
 *  - `swapOptions(..., { ids })` judges exactly the sides a search found (the smart search's results), in their order,
 *    with the same reasons as the suggestions;
 *  - `setTandaSides` puts the DJ's own tanda in a place: the sides in the DJ's order (catalogue ids, or a recording from
 *    a connected service), re-timed, the night re-scored, pinned as the DJ's; an empty tanda or a missing place is
 *    refused and the night is left as it was.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { compose, type Playlist, type Song, setTandaSides, swapOptions } from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let p: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  p = compose({ hours: 2, seed: 7 }, deps);
}, 600000);

const firstTango = () => p.tandas.findIndex((t) => t.rhythm === "tango" && t.songs.length >= 3);

describe("swapOptions judges the searched sides", () => {
  it("answers one judgement per id, in the order asked, with a reason for each excluded side", () => {
    const ti = firstTango();
    const t = p.tandas[ti]!;
    const other = deps.catalog.songs.find(
      (s) => s.orchestraId !== t.orchestraId && s.rhythm === t.rhythm && !!s.year,
    )!;
    const same = swapOptions(p, ti, 0, deps).suggestions[0]!.song;
    const r = swapOptions(p, ti, 0, deps, { ids: [other.id, same.id, "no-such-id"] });
    expect(r.judged.map((x) => x.song.id)).toEqual([other.id, same.id]);
    expect(r.judged[0]!.ok).toBe(false);
    expect(r.judged[0]!.reason).toMatch(/another orchestra/);
    expect(r.judged[1]!.ok).toBe(true);
  });
  it("without ids nothing is judged and the lists stay as they were", () => {
    const ti = firstTango();
    const a = swapOptions(p, ti, 0, deps);
    expect(a.judged).toEqual([]);
    expect(a.suggestions.length).toBeGreaterThan(0);
  });
});

describe("setTandaSides: the DJ's own tanda", () => {
  it("puts the sides in the DJ's order, re-timed, pinned as the DJ's, the night re-scored", () => {
    const ti = firstTango();
    const t = p.tandas[ti]!;
    const ids = t.songs.map((s) => s.id).reverse();
    const r = setTandaSides(p, ti, ids, deps);
    expect(r.reason).toBeUndefined();
    const nt = r.playlist.tandas[ti]!;
    expect(nt.songs.map((s) => s.id)).toEqual(ids);
    expect(nt.pinned?.by).toBe("dj");
    expect(nt.locked).toBe(true);
    expect(nt.energyCurve).toEqual(nt.songs.map((s) => s.energy ?? 50));
    expect(r.playlist.score.total).toBeTypeOf("number");
    // the other tandas are untouched
    p.tandas.forEach((x, i) => {
      if (i !== ti) expect(r.playlist.tandas[i]!.songs.map((s) => s.id)).toEqual(x.songs.map((s) => s.id));
    });
    // the night it came from is not changed
    expect(p.tandas[ti]!.songs.map((s) => s.id)).toEqual(t.songs.map((s) => s.id));
  });
  it("takes a recording from a connected service as it is, and names the tanda after its sides", () => {
    const ti = firstTango();
    const t = p.tandas[ti]!;
    const ext: Song = {
      ...t.songs[0]!,
      id: "ext:spotify:abc123",
      title: "A side only Spotify has",
      spotify: { uri: "spotify:track:abc123" },
      source: "spotify",
    };
    const r = setTandaSides(p, ti, [ext, ...t.songs.slice(1).map((s) => s.id)], deps);
    expect(r.reason).toBeUndefined();
    const nt = r.playlist.tandas[ti]!;
    expect(nt.songs[0]!.id).toBe("ext:spotify:abc123");
    expect(nt.songs[0]!.spotify?.uri).toBe("spotify:track:abc123");
    expect(nt.orchestraId).toBe(t.songs[0]!.orchestraId);
  });
  it("a tanda of another orchestra takes that orchestra's name; the rhythm follows the sides", () => {
    const ti = firstTango();
    const vals = deps.catalog.songs.filter(
      (s) => s.rhythm === "vals" && s.year && s.orchestraId === "carlos-di-sarli",
    );
    expect(vals.length).toBeGreaterThanOrEqual(3);
    const r = setTandaSides(
      p,
      ti,
      vals.slice(0, 3).map((s) => s.id),
      deps,
    );
    const nt = r.playlist.tandas[ti]!;
    expect(nt.rhythm).toBe("vals");
    expect(nt.orchestraId).toBe("carlos-di-sarli");
  });
  it("refuses an empty tanda, a missing place or an unknown id, and leaves the night as it was", () => {
    const ti = firstTango();
    expect(setTandaSides(p, ti, [], deps)).toMatchObject({ playlist: p, reason: expect.any(String) });
    expect(setTandaSides(p, 999, [p.tandas[ti]!.songs[0]!.id], deps)).toMatchObject({
      playlist: p,
      reason: expect.any(String),
    });
    expect(setTandaSides(p, ti, ["no-such-id"], deps)).toMatchObject({
      playlist: p,
      reason: expect.any(String),
    });
  });
});
