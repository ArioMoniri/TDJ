import { emptyMemory, favouriteRows, type Playlist } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  favouriteIds,
  favouritesForRequest,
  favouritesOn,
  floorReactionOf,
  floorTap,
  heartsIn,
  nightIdOf,
  playsIn,
  resetFavouriteRow,
  setFavouritesUse,
} from "./favourites";
import { normalizeMemory } from "./memory";

const song = (id: string, orchestraId: string, singer: string | null, rhythm: string, year: number) => ({
  id,
  title: `Song ${id}`,
  orchestra: orchestraId,
  orchestraId,
  singer,
  rhythm,
  year,
});
const tanda = (orch: string, singer: string | null, rhythm: string, year: number, phase: string) => ({
  rhythm,
  orchestraId: orch,
  orchestra: orch,
  singer,
  phase,
  yearRange: [year, year + 1] as [number, number],
  songs: [0, 1, 2].map((i) => song(`${orch}-${rhythm}-${i}`, orch, singer, rhythm, year + (i % 2))),
});
const night = {
  id: "night-1",
  name: "Friday",
  options: { hours: 4, eras: ["golden"], seed: 1 },
  tandas: [
    tanda("carlos-di-sarli", "Roberto Rufino", "tango", 1941, "warmup"),
    tanda("juan-d-arienzo", null, "tango", 1937, "peak"),
    tanda("francisco-canaro", null, "vals", 1938, "build"),
  ],
} as unknown as Playlist;
const AT = new Date("2026-11-14T23:00:00");

describe("the dancer-favourites tracker (the DJ's memory)", () => {
  it("a floor tap on the playing song is kept with the night id, its role and the time; tapping it again takes it back", () => {
    const s = night.tandas[1]!.songs[0]!;
    let m = floorTap(emptyMemory(), night, { scope: "song", tanda: 2, song: s, reaction: "full", at: AT });
    expect(m.favourites?.taps).toHaveLength(1);
    expect(m.favourites?.taps[0]).toMatchObject({
      nightId: nightIdOf(night, AT),
      role: "peak",
      songIds: [s.id],
      reaction: "full",
    });
    expect(floorReactionOf(m, night, { scope: "song", tanda: 2, songId: s.id, at: AT })).toBe("full");
    m = floorTap(m, night, { scope: "song", tanda: 2, song: s, reaction: "full", at: AT });
    expect(m.favourites?.taps).toHaveLength(0);
  });
  it("a tanda row's tap counts for the tanda's family and each side; survives the memory round trip", () => {
    const m = floorTap(emptyMemory(), night, { scope: "tanda", tanda: 1, reaction: "full", at: AT });
    const back = normalizeMemory(JSON.parse(JSON.stringify(m)));
    const rows = favouriteRows(back.favourites, AT.getTime());
    expect(rows.filter((r) => r.kind === "song" && r.role === "warmup")).toHaveLength(3);
    expect(rows.some((r) => r.kind === "family" && r.role === "warmup")).toBe(true);
  });
  it("the request carries the decayed table; switched off it carries `off`; without evidence nothing", () => {
    expect(favouritesForRequest(emptyMemory())).toBeUndefined();
    let m = floorTap(emptyMemory(), night, { scope: "tanda", tanda: 2, reaction: "full", at: AT });
    const T = favouritesForRequest(m, AT.getTime())!;
    expect(T.off).toBeUndefined();
    expect(Object.keys(T.sides)).toHaveLength(3);
    expect(favouritesOn(m)).toBe(true);
    m = setFavouritesUse(m, false);
    expect(favouritesOn(m)).toBe(false);
    expect(favouritesForRequest(m, AT.getTime())).toEqual({ v: 1, off: true, sides: {}, families: {} });
    // the evidence is kept: on again, it is back
    m = setFavouritesUse(m, true);
    expect(Object.keys(favouritesForRequest(m, AT.getTime())!.sides)).toHaveLength(3);
  });
  it("room hearts and the night's plays add evidence; a reset row starts again", () => {
    const s = night.tandas[0]!.songs[1]!;
    let m = heartsIn(emptyMemory(), night, { [s.id]: 5, "not-tonight": 9 }, AT);
    m = heartsIn(m, night, { [s.id]: 3 }, AT);
    expect(m.favourites?.hearts[nightIdOf(night, AT)]?.[s.id]?.n).toBe(5);
    expect(favouriteIds(m, [s.id, "x"])).toEqual(new Set([s.id]));
    expect(favouriteIds(m, [s.id], "peak").size).toBe(0);
    m = playsIn(
      m,
      night,
      night.tandas[0]!.songs.map((x) => x.id),
      [night.tandas[2]!.songs[0]!.id],
      AT,
    );
    const p = m.favourites?.plays[nightIdOf(night, AT)];
    expect(Object.keys(p?.kept ?? {})).toHaveLength(3);
    expect(Object.keys(p?.skipped ?? {})).toHaveLength(1);
    m = resetFavouriteRow(m, `song:${s.id}`);
    expect(favouriteIds(m, [s.id]).size).toBe(0);
  });
  it("only counts: nothing about a dancer is in the memory", () => {
    const s = night.tandas[0]!.songs[1]!;
    const m = heartsIn(emptyMemory(), night, { [s.id]: 2 }, AT);
    expect(Object.keys(m.favourites?.hearts[nightIdOf(night, AT)]?.[s.id] ?? {}).sort()).toEqual([
      "at",
      "n",
      "role",
    ]);
  });
});
