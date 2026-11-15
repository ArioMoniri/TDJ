import type { Cortina, Playlist, Song, Tanda } from "@tdj/core";
import { describe, expect, it } from "vitest";
import type { BoothRow } from "./plan";
import { chairOf, cortinaOptions, exchange, swapWhen, withCortina, withSide } from "./swap";

const song = (id: string, o: Partial<Song> = {}): Song =>
  ({ id, title: id, orchestra: "O", orchestraId: "o", singer: null, year: 1940, energy: 50, ...o }) as Song;
const cort = (id: string, o: Partial<Cortina> = {}): Cortina =>
  ({ id, title: id, artist: "A", genre: "pop", culture: "global", energy: 50, ...o }) as Cortina;
const tanda = (songs: Song[], c: Cortina | null): Tanda =>
  ({ rhythm: "tango", orchestra: "O", orchestraId: "o", songs, cortina: c }) as unknown as Tanda;
const night = {
  id: "n",
  tandas: [tanda([song("a"), song("b"), song("c")], cort("c1")), tanda([song("d"), song("e")], cort("c2"))],
} as unknown as Playlist;
const row = (kind: BoothRow["kind"], t: number, id: string) => ({ kind, tanda: t, id }) as BoothRow;

describe("the Booth's one-tap swap (2026-11)", () => {
  it("finds a row's chair: a song's tanda and place, a cortina's tanda; the opening and breaks have none", () => {
    expect(chairOf(night, row("track", 1, "c"))).toEqual({ kind: "track", ti: 0, si: 2 });
    expect(chairOf(night, row("cortina", 2, "c2"))).toEqual({ kind: "cortina", ti: 1 });
    expect(chairOf(night, row("closing", 0, "x"))).toBeNull();
    expect(chairOf(night, row("break", 1, "x"))).toBeNull();
  });
  it("a row ahead of the playhead swaps at once, the playing row asks, a played row is closed", () => {
    expect(swapWhen(5, 3, true)).toBe("ahead");
    expect(swapWhen(3, 3, true)).toBe("playing");
    expect(swapWhen(2, 3, true)).toBe("played");
    expect(swapWhen(0, 3, false)).toBe("ahead");
  });
  it("replaces one side (the tanda re-timed) and one cortina, leaving the rest as it was", () => {
    const p = withSide(night, 0, 2, song("z", { energy: 80, year: 1944 }));
    expect(p.tandas[0]!.songs.map((s) => s.id)).toEqual(["a", "b", "z"]);
    expect(p.tandas[0]!.yearRange).toEqual([1940, 1944]);
    expect(p.tandas[1]).toBe(night.tandas[1]);
    expect(withCortina(night, 1, cort("c9")).tandas[1]!.cortina!.id).toBe("c9");
  });
  it("two chairs of tonight trade places; a song never trades with a cortina", () => {
    const p = exchange(night, { kind: "track", ti: 0, si: 2 }, { kind: "track", ti: 1, si: 0 })!;
    expect(p.tandas[0]!.songs.map((s) => s.id)).toEqual(["a", "b", "d"]);
    expect(p.tandas[1]!.songs.map((s) => s.id)).toEqual(["c", "e"]);
    expect(exchange(night, { kind: "track", ti: 0, si: 0 }, { kind: "cortina", ti: 1 })).toBeNull();
    const q = exchange(night, { kind: "cortina", ti: 0 }, { kind: "cortina", ti: 1 })!;
    expect(q.tandas.map((t) => t.cortina!.id)).toEqual(["c2", "c1"]);
  });
  it("cortina options: none of tonight's, same culture and genre first, then energy; a query by title or artist", () => {
    const pool = [
      cort("c1"),
      cort("c2"),
      cort("far", { energy: 95 }),
      cort("near", { energy: 55, spotify: { uri: "spotify:track:1" } }),
      cort("greek", { culture: "greek", energy: 50 }),
      cort("Bésame", { artist: "Trío Los Panchos", genre: "bolero" }),
    ];
    const ids = cortinaOptions(pool, cort("c1"), new Set(["c1", "c2"])).map((c) => c.id);
    expect(ids[0]).toBe("near");
    expect(ids).not.toContain("c2");
    expect(cortinaOptions(pool, cort("c1"), new Set(), "besame trio").map((c) => c.id)).toEqual(["Bésame"]);
  });
});
