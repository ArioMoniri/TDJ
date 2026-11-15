import { emptyMemory, familyKey, learnedFamilyFactor, learnFromLock, type Playlist } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { nextRating, rateMessage, rateTap, ratingOf, undoRate } from "./likes";

const song = (id: string, orchestraId: string, singer: string | null, rhythm: string, year: number) => ({
  id,
  title: `Song ${id}`,
  orchestra: orchestraId,
  orchestraId,
  singer,
  rhythm,
  year,
});
const tanda = (orch: string, singer: string | null, rhythm: string, year: number, pinned = false) => ({
  rhythm,
  orchestraId: orch,
  singer,
  yearRange: [year, year + 1] as [number, number],
  songs: [0, 1, 2].map((i) => song(`${orch}-${rhythm}-${i}`, orch, singer, rhythm, year + (i % 2))),
  ...(pinned ? { pinned: { by: "dj" as const } } : {}),
});
const night = {
  id: "night-1",
  name: "Friday",
  options: { hours: 4, eras: ["golden"], arc: "classic-two-peaks", cortinaCultures: ["global"], seed: 1 },
  score: { total: 90 },
  tandas: [
    tanda("carlos-di-sarli", "Roberto Rufino", "tango", 1941),
    tanda("juan-d-arienzo", null, "tango", 1937, true),
    tanda("francisco-canaro", null, "vals", 1938),
  ],
} as unknown as Playlist;
const fam = (i: number) => {
  const t = night.tandas[i]!;
  return { key: familyKey({ ...t.songs[0]!, rhythm: t.rhythm }), years: t.yearRange };
};
const factor = (m: ReturnType<typeof emptyMemory>, i: number) =>
  learnedFamilyFactor(m.learned, fam(i).key, fam(i).years);

describe("thumbs up / down on a night (store logic)", () => {
  it("a tap sets the rating, the same tap again takes it back, the other thumb replaces it", () => {
    expect(nextRating(undefined, true)).toBe(true);
    expect(nextRating(true, true)).toBeUndefined();
    expect(nextRating(true, false)).toBe(false);
    expect(nextRating(false, false)).toBeUndefined();
  });

  it("a like makes the night's families weigh more in later nights; a dislike a little less; the toast says so", () => {
    const up = rateTap(emptyMemory(), night, true, true);
    expect(up.liked).toBe(true);
    expect(up.message).toBe("composer.like_toast_towards");
    expect(ratingOf(up.memory, night.id)).toBe(true);
    for (const i of [0, 1, 2]) expect(factor(up.memory, i)).toBeGreaterThan(1);
    // the pinned tanda counts more
    expect(factor(up.memory, 1)).toBeGreaterThan(factor(up.memory, 0));
    const down = rateTap(up.memory, night, false, true);
    expect(down.message).toBe("composer.like_toast_away");
    expect(factor(down.memory, 0)).toBeLessThan(1);
    expect(factor(down.memory, 0)).toBeGreaterThan(0.9);
  });

  it("un-liking and Undo take back exactly what the rating added", () => {
    const start = { ...emptyMemory(), learned: learnFromLock(undefined, night.tandas[0]!, true) };
    const before = [0, 1, 2].map((i) => factor(start, i));
    const up = rateTap(start, night, true, true);
    const off = rateTap(up.memory, night, true, true);
    expect(off.liked).toBeUndefined();
    expect(off.message).toBe("composer.like_toast_cleared");
    expect([0, 1, 2].map((i) => factor(off.memory, i))).toEqual(before);
    expect(off.memory.learned?.families).toEqual(start.learned.families);
    expect(off.memory.learned?.likes).toBeUndefined();
    const undone = undoRate(up.memory, night, up.previous, true);
    expect([0, 1, 2].map((i) => factor(undone, i))).toEqual(before);
    expect(ratingOf(undone, night.id)).toBeUndefined();
  });

  it("with learning off the like is recorded but changes nothing, and the toast says so", () => {
    const r = rateTap(emptyMemory(), night, true, false);
    expect(ratingOf(r.memory, night.id)).toBe(true);
    expect(r.message).toBe("composer.like_toast_off");
    expect(r.memory.learned?.likes?.[night.id]).toBeUndefined();
    expect(factor(r.memory, 0)).toBe(1);
    expect(rateMessage(false, false)).toBe("composer.like_toast_off");
  });
});
