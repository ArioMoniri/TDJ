/**
 * Thumbs up / down on a composed night (likes.ts): a liked night's tanda families (orchestra + singer + rhythm + year
 * band) weigh a little more in the next nights, a disliked one a little less (scaled down: never a ban), pinned DJ
 * tandas count more, its shape (arc, eras, length, cortina culture) becomes a liked-shape signal, and un-liking takes
 * back exactly what the like added. One like stays below an explicit swap or pin edit; the weights are capped.
 * Written before the code.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applyMemory,
  compose,
  emptyMemory,
  familyKey,
  forgetLearned,
  LEARN_LIMITS,
  type LearnedPreferences,
  LIKE_WEIGHTS,
  learnedFamilyFactor,
  learnedFamilyWeight,
  learnedRules,
  learnFromEdit,
  learnFromLike,
  learnFromLock,
  likedShapeDefaults,
  likeFamilyKey,
  type Playlist,
  rankProbe,
  rateNight,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let liked: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  liked = compose({ hours: 2, seed: 12 }, deps);
}, 600000);
afterEach(() => {
  rankProbe.on = null;
});

type Row = { key: string; years: [number, number] | null; w: number };
/**
 * The next compose with the same seed: the first slot that draws among several families. Every slot before it had
 * a single candidate, so all runs reach it in the same state and only the learned weights differ.
 */
function firstRanking(learned?: LearnedPreferences): { rows: Row[]; night: Playlist } {
  let first: Row[] | null = null;
  let forced = true;
  rankProbe.on = (_slot, rows) => {
    if (first) return;
    if (rows.length > 3) {
      expect(forced).toBe(true);
      first = rows.map((r) => ({ key: r.key, years: r.years, w: r.w }));
    } else if (rows.length > 1) forced = false;
  };
  const night = compose({ hours: 2, seed: 12, learned }, deps);
  rankProbe.on = null;
  return { rows: first ?? [], night };
}
const ids = (p: Playlist) => p.tandas.map((t) => t.songs.map((s) => s.id).join(","));
const id = (r: Row) => `${r.key}@${r.years?.join("-") ?? ""}`;
const rankOf = (rows: Row[], r: Row) => [...rows].sort((a, b) => b.w - a.w).findIndex((x) => id(x) === id(r));
const same = (rows: Row[], r: Row) => rows.find((x) => id(x) === id(r))!;

describe("learnFromLike: what one like or dislike adds", () => {
  it("gives every tanda family of the night a moderate positive weight, pinned DJ tandas more", () => {
    const p: Playlist = structuredClone(liked);
    p.tandas[0]!.pinned = { by: "dj" };
    const L = learnFromLike(undefined, p, true);
    const c = L.likes?.[p.id];
    expect(c?.liked).toBe(true);
    for (const t of p.tandas.filter((x) => x.songs.length)) {
      const k = likeFamilyKey(t);
      expect(k.split("|")).toHaveLength(4);
      expect(c!.families[k]).toBeGreaterThan(0);
    }
    expect(c!.families[likeFamilyKey(p.tandas[0]!)]).toBe(LIKE_WEIGHTS.pinned);
    expect(LIKE_WEIGHTS.pinned).toBeGreaterThan(LIKE_WEIGHTS.like);
    expect(c!.shape).toMatchObject({ hours: 2, eras: p.options.eras, arc: p.options.arc });
    expect(c!.shape!.cortinaCultures).toEqual(p.options.cortinaCultures);
  });
  it("a dislike is negative and scaled down", () => {
    const L = learnFromLike(undefined, liked, false);
    const ws = Object.values(L.likes![liked.id]!.families);
    expect(ws.every((w) => w < 0)).toBe(true);
    expect(Math.abs(LIKE_WEIGHTS.dislike)).toBeLessThan(LIKE_WEIGHTS.like / 2);
  });
  it("one like stays below a DJ's explicit swap or pin (lock) edit", () => {
    const t = liked.tandas[1]!;
    const key = familyKey({ ...t.songs[0]!, rhythm: t.rhythm });
    const like = learnedFamilyWeight(learnFromLike(undefined, liked, true), key, t.yearRange)!;
    const lock = learnFromLock(undefined, t, true).families![key]!;
    const after = structuredClone(liked);
    after.tandas[1] = structuredClone(liked.tandas[3]!);
    const swapKey = familyKey({ ...liked.tandas[3]!.songs[0]!, rhythm: liked.tandas[3]!.rhythm });
    const swap = learnFromEdit(undefined, liked, after).families![swapKey]!;
    expect(like).toBeGreaterThan(0);
    expect(like).toBeLessThan(lock);
    expect(like).toBeLessThan(swap);
    expect(LIKE_WEIGHTS.pinned).toBeLessThan(lock);
  });
  it("toggling replaces the night's contribution; un-liking removes exactly what was added", () => {
    const base = learnFromLock(undefined, liked.tandas[2]!, true);
    const up = learnFromLike(base, liked, true);
    const down = learnFromLike(up, liked, false);
    expect(Object.keys(down.likes!)).toEqual([liked.id]);
    expect(down.likes![liked.id]!.liked).toBe(false);
    const gone = learnFromLike(down, liked, undefined);
    expect(gone.families).toEqual(base.families);
    expect(gone.sides).toEqual(base.sides);
    expect(gone.likes ?? {}).toEqual({});
  });
  it("weights are capped: ten liked nights never outweigh one swap, ten dislikes never ban", () => {
    const t = liked.tandas[0]!;
    const key = familyKey({ ...t.songs[0]!, rhythm: t.rhythm });
    let up: LearnedPreferences | undefined;
    let down: LearnedPreferences | undefined;
    for (let i = 0; i < 10; i++) {
      up = learnFromLike(up, { ...liked, id: `n${i}` }, true);
      down = learnFromLike(down, { ...liked, id: `n${i}` }, false);
    }
    expect(learnedFamilyWeight(up, key, t.yearRange)).toBeLessThanOrEqual(LIKE_WEIGHTS.max);
    expect(LIKE_WEIGHTS.max).toBeLessThan(1);
    expect(learnedFamilyWeight(down, key, t.yearRange)).toBeGreaterThanOrEqual(LIKE_WEIGHTS.min);
    expect(learnedFamilyFactor(down, key, t.yearRange)).toBeGreaterThan(0.9);
    // with the DJ's edits on top the total stays inside the learned limits
    const L = { ...up!, families: { [key]: LEARN_LIMITS.familyMax } };
    expect(learnedFamilyWeight(L, key, t.yearRange)).toBe(LEARN_LIMITS.familyMax);
  });
  it("the year band matters: the same family in other years is not boosted", () => {
    const t = liked.tandas.find((x) => x.yearRange)!;
    const key = familyKey({ ...t.songs[0]!, rhythm: t.rhythm });
    const L = learnFromLike(undefined, liked, true);
    expect(learnedFamilyWeight(L, key, t.yearRange)).toBeGreaterThan(0);
    expect(learnedFamilyWeight(L, key, [1900, 1903])).toBeUndefined();
  });
});

describe("the next compose with the same seed", () => {
  it("a liked night's family ranks higher; a disliked one lower but stays in the draw; un-liking restores it exactly", () => {
    const base = firstRanking();
    expect(base.rows.length).toBeGreaterThan(3);
    const L = learnFromLike(undefined, liked, true);
    const isLiked = (r: Row) => (learnedFamilyWeight(L, r.key, r.years) ?? 0) > 0;
    const likedRows = base.rows.filter(isLiked);
    expect(likedRows.length).toBeGreaterThan(0);
    expect(base.rows.some((r) => !isLiked(r))).toBe(true);

    const up = firstRanking(L);
    expect(up.rows.map(id).sort()).toEqual(base.rows.map(id).sort());
    // every liked family gains against every other family (whose weight is untouched) and none drops a place
    for (const r of likedRows) {
      expect(same(up.rows, r).w).toBeGreaterThan(r.w);
      expect(rankOf(up.rows, r)).toBeLessThanOrEqual(rankOf(base.rows, r));
    }
    for (const r of base.rows.filter((x) => !isLiked(x))) expect(same(up.rows, r).w).toBe(r.w);

    const down = firstRanking(learnFromLike(undefined, liked, false));
    for (const r of likedRows) {
      const d = same(down.rows, r);
      expect(d).toBeTruthy();
      expect(d.w).toBeLessThan(r.w);
      expect(d.w).toBeGreaterThan(r.w * 0.9);
      expect(rankOf(down.rows, r)).toBeGreaterThanOrEqual(rankOf(base.rows, r));
    }

    const undone = firstRanking(learnFromLike(L, liked, undefined));
    expect(undone.rows).toEqual(base.rows);
    expect(ids(undone.night)).toEqual(ids(base.night));
    expect(undone.night.score.total).toBe(base.night.score.total);
  });
});

describe("rateNight / memory", () => {
  it("records the like on the set in place and feeds the learned preferences; learning off records only", () => {
    let m = rateNight(emptyMemory(), liked, undefined);
    m = { ...m, sets: [...m.sets, { ...m.sets[0]!, id: "other" }] };
    const r = rateNight(m, liked, true);
    expect(r.sets.map((s) => s.id)).toEqual(m.sets.map((s) => s.id));
    expect(r.sets[0]!.at).toBe(m.sets[0]!.at);
    expect(r.sets[0]!.liked).toBe(true);
    expect(r.learned?.likes?.[liked.id]?.liked).toBe(true);
    const off = rateNight(m, liked, true, { learn: false });
    expect(off.sets[0]!.liked).toBe(true);
    expect(off.learned?.likes?.[liked.id]).toBeUndefined();
    const undone = rateNight(r, liked, undefined);
    expect(undone.sets[0]!.liked).toBeUndefined();
    expect(undone.learned?.likes?.[liked.id]).toBeUndefined();
  });
  it("two liked nights of the same shape fill the settings the DJ did not set; tonight's explicit ones win", () => {
    let L = learnFromLike(undefined, liked, true);
    expect(likedShapeDefaults(L)).toEqual({});
    L = learnFromLike(L, { ...liked, id: "again" }, true);
    const d = likedShapeDefaults(L);
    expect(d.hours).toBe(2);
    expect(d.arc).toBe(liked.options.arc);
    const mem = { ...emptyMemory(), learned: L };
    expect(applyMemory({}, mem).hours).toBe(2);
    expect(applyMemory({ hours: 4 }, mem).hours).toBe(4);
    // a dislike of the same shape cancels one like
    L = learnFromLike(L, { ...liked, id: "third" }, false);
    expect(likedShapeDefaults(L).hours).toBeUndefined();
  });
  it("Database → Memory lists each preference with its source, and the DJ can delete it", () => {
    let L = learnFromLock(undefined, liked.tandas[0]!, true);
    L = learnFromLike(L, liked, true);
    const rules = learnedRules(L);
    const fromLikes = rules.filter((r) => r.source === "liked");
    expect(fromLikes.length).toBeGreaterThan(0);
    expect(fromLikes.every((r) => /from nights you liked/i.test(r.detail))).toBe(true);
    expect(rules.some((r) => r.kind === "shape" && r.source === "liked")).toBe(true);
    expect(rules.find((r) => r.kind === "family")?.source).toBe("edits");
    const one = fromLikes.find((r) => r.kind === "liked")!;
    const after = forgetLearned(L, one.id);
    expect(learnedRules(after).some((r) => r.id === one.id)).toBe(false);
    const shape = rules.find((r) => r.kind === "shape")!;
    expect(learnedRules(forgetLearned(L, shape.id)).some((r) => r.id === shape.id)).toBe(false);
    const disliked = learnedRules(learnFromLike(undefined, liked, false)).filter((r) => r.kind === "liked");
    expect(disliked.every((r) => r.source === "disliked" && /from nights you disliked/i.test(r.detail))).toBe(
      true,
    );
  });
});
