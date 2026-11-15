/**
 * Dancer favourites (2026-11: "a tracker of which songs are liked most by dancers; know them and use them in place").
 * The booth's floor reactions, room hearts and repeat evidence become a per-song and per-family score per slot role:
 * a Bayesian-smoothed rate with a 180-day half-life. Compose uses a favourite in the role where it worked (a peak
 * favourite in peak slots only), bounded (a family ×1.8 at most, a side ×2 within its family, emptied ×0.7 at
 * least: never a ban), breaks no rule, never overrides an explicit setting or a DJ pin, and with the switch off the
 * night is exactly the night without it. Written before the code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  checkEdit,
  compose,
  type DancerFavourites,
  decay,
  emptyFavourites,
  evidenceLine,
  FAVOURITE_LIMITS,
  familyFactorOf,
  familyKey,
  favouriteFamilyFactor,
  favouriteRows,
  favouriteSideFactor,
  favouritesCsv,
  favouriteTable,
  isFavouriteSide,
  type Playlist,
  priorOf,
  rankProbe,
  reactionOf,
  recordFloor,
  recordHearts,
  recordPlays,
  replaceSide,
  resetFavourite,
  type SlotRole,
  type Song,
  setFavouritesOff,
  sideFactorOf,
  smoothedRate,
  spreadCap,
  strictChecks,
  suggestFixes,
  suggestNext,
  swapOptions,
  type Tanda,
  tandaFamily,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let base: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  base = compose({ hours: 2, seed: 12 }, deps);
}, 600000);
afterEach(() => {
  rankProbe.on = null;
});

const DAY = 864e5;
const T0 = Date.parse("2026-11-01T22:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const ids = (p: Playlist) => p.tandas.map((t) => t.songs.map((s) => s.id).join(","));
const famOf = (t: Tanda) => familyKey({ ...t.songs[0]!, rhythm: t.rhythm });

/** a tracker where `n` nights each tapped `reaction` on tanda `t` (scope tanda) */
function tapped(t: Tanda, reaction: "full" | "ok" | "emptied", n = 3, F?: DancerFavourites, at = T0) {
  let out = F ?? emptyFavourites();
  for (let k = 0; k < n; k++)
    out = recordFloor(out, {
      nightId: `night-${k}`,
      scope: "tanda",
      tanda: t,
      tandaIndex: t.index,
      reaction,
      at: iso(at - k * DAY),
    });
  return out;
}

describe("the math: smoothing and decay", () => {
  it("decay halves every 180 days", () => {
    expect(decay(0)).toBe(1);
    expect(decay(180)).toBeCloseTo(0.5, 10);
    expect(decay(360)).toBeCloseTo(0.25, 10);
    expect(decay(-5)).toBe(1);
  });
  it("the smoothed rate is (full − emptied + K·prior) / (n + K)", () => {
    const K = FAVOURITE_LIMITS.k;
    expect(smoothedRate([3, 1, 5, 0.2])).toBeCloseTo((3 - 1 + K * 0.2) / (5 + K), 10);
    expect(smoothedRate(undefined)).toBe(0);
    // fame is a weak prior: fame 5 is 0.4, never more
    expect(priorOf(5)).toBeCloseTo(0.4);
    expect(priorOf(9)).toBeCloseTo(0.4);
    expect(priorOf(0)).toBe(0);
  });
  it("taps decay with their age; a reset row starts again", () => {
    const t = base.tandas[2]!;
    const fresh = tapped(t, "full", 1, undefined, T0);
    const old = tapped(t, "full", 1, undefined, T0 - 360 * DAY);
    const s = t.songs[0]!.id;
    const ef = favouriteTable(fresh, T0).sides[s]![t.phase]!;
    const eo = favouriteTable(old, T0).sides[s]![t.phase]!;
    expect(ef[0]).toBeCloseTo(1);
    expect(eo[0]).toBeCloseTo(0.25, 3);
    expect(eo[2]).toBeCloseTo(0.25, 3);
    // the older evidence lifts less
    expect(favouriteSideFactor(favouriteTable(old, T0), s, t.phase)).toBeLessThan(
      favouriteSideFactor(favouriteTable(fresh, T0), s, t.phase),
    );
    const reset = resetFavourite(fresh, `song:${s}`, iso(T0 + 1000));
    expect(favouriteTable(reset, T0 + 2000).sides[s]).toBeUndefined();
  });
  it("a tap replaces the night's earlier reaction on the same target; the same reaction again takes it back", () => {
    const t = base.tandas[1]!;
    const s = t.songs[0]!;
    let F = recordFloor(undefined, { nightId: "n", scope: "song", song: s, tanda: t, reaction: "full" });
    expect(reactionOf(F, { nightId: "n", scope: "song", songId: s.id })).toBe("full");
    F = recordFloor(F, { nightId: "n", scope: "song", song: s, tanda: t, reaction: "emptied" });
    expect(F.taps).toHaveLength(1);
    expect(reactionOf(F, { nightId: "n", scope: "song", songId: s.id })).toBe("emptied");
    F = recordFloor(F, { nightId: "n", scope: "song", song: s, tanda: t, reaction: "emptied" });
    expect(F.taps).toHaveLength(0);
    // a tap keeps the night, the time and the slot role
    F = recordFloor(F, { nightId: "n", scope: "tanda", tanda: t, tandaIndex: 1, reaction: "full" });
    expect(F.taps[0]).toMatchObject({ nightId: "n", role: t.phase, tanda: 1, family: tandaFamily(t) });
    expect(Date.parse(F.taps[0]!.at)).toBeGreaterThan(0);
  });
  it("a tanda tap counts once for the family per night, and for each of its sides", () => {
    const t = base.tandas[3]!;
    const F = tapped(t, "full", 2);
    const T = favouriteTable(F, T0);
    const fam = T.families[tandaFamily(t)]![t.phase]!;
    expect(fam[2]).toBeCloseTo(1 + decay(1), 3);
    for (const s of t.songs) expect(T.sides[s.id]?.[t.phase]?.[0]).toBeGreaterThan(0);
  });
  it("room hearts count the largest tally per night (a poll counts nothing twice); plays are weak evidence", () => {
    const t = base.tandas[0]!;
    const s = t.songs[0]!;
    const side = (id: string) => (id === s.id ? { song: s, role: t.phase } : undefined);
    let F = recordHearts(undefined, "n", { [s.id]: 2 }, side, iso(T0));
    F = recordHearts(F, "n", { [s.id]: 2 }, side, iso(T0));
    F = recordHearts(F, "n", { [s.id]: 1, unknown: 5 }, side, iso(T0));
    expect(F.hearts.n![s.id]!.n).toBe(2);
    expect(F.hearts.n!.unknown).toBeUndefined();
    F = recordHearts(F, "n", { [s.id]: 7 }, side, iso(T0));
    expect(F.hearts.n![s.id]!.n).toBe(7);
    const e = favouriteTable(F, T0).sides[s.id]![t.phase]!;
    expect(e[0]).toBeCloseTo(1); // seven dancers: one full unit
    const P = recordPlays(undefined, "n", [{ song: s, role: t.phase }], [], iso(T0));
    expect(favouriteTable(P, T0).sides[s.id]![t.phase]![0]).toBeCloseTo(FAVOURITE_LIMITS.play);
  });
  it("the list: per role, with its evidence line, exported as CSV", () => {
    const t = base.tandas[2]!;
    const s = t.songs[0]!;
    let F = tapped(t, "full", 3);
    F = recordHearts(F, "night-0", { [s.id]: 4 }, () => ({ song: s, role: t.phase }), iso(T0));
    const rows = favouriteRows(F, T0);
    const r = rows.find((x) => x.key === `song:${s.id}`)!;
    expect(r).toMatchObject({ kind: "song", role: t.phase, full: 3, emptied: 0, hearts: 4, nights: 3 });
    expect(evidenceLine(r)).toBe("♥ 4 · full 3 · emptied 0 · 3 nights");
    expect(rows.some((x) => x.kind === "family" && x.family === tandaFamily(t))).toBe(true);
    const csv = favouritesCsv(rows).split("\n");
    expect(csv[0]).toMatch(/^kind,role,title,orchestra/);
    expect(csv.length).toBe(rows.length + 1);
    // only counts: no dancer is named anywhere
    expect(JSON.stringify(F)).not.toMatch(/dancer|user|name"/i);
  });
});

describe("the caps: bounded like the learned preferences", () => {
  it("a family lifts to ×1.8 at most, a side to ×2, emptied lowers to ×0.7 at least", () => {
    for (const r of [-1, -0.5, 0, 0.3, 1, 5]) {
      expect(familyFactorOf(r)).toBeLessThanOrEqual(1.8);
      expect(familyFactorOf(r)).toBeGreaterThanOrEqual(0.7);
      expect(sideFactorOf(r)).toBeLessThanOrEqual(2);
      expect(sideFactorOf(r)).toBeGreaterThanOrEqual(0.7);
    }
    const t = base.tandas[2]!;
    const lots = tapped(t, "full", 60);
    const T = favouriteTable(lots, T0);
    const f = favouriteFamilyFactor(T, famOf(t), t.phase, t.yearRange);
    expect(f).toBeGreaterThan(1.5);
    expect(f).toBeLessThanOrEqual(1.8);
    expect(favouriteSideFactor(T, t.songs[0]!.id, t.phase)).toBeLessThanOrEqual(2);
    const bad = favouriteTable(tapped(t, "emptied", 60), T0);
    expect(favouriteFamilyFactor(bad, famOf(t), t.phase, t.yearRange)).toBeGreaterThanOrEqual(0.7);
    expect(favouriteFamilyFactor(bad, famOf(t), t.phase, t.yearRange)).toBeLessThan(1);
    expect(favouriteSideFactor(bad, t.songs[0]!.id, t.phase)).toBeGreaterThanOrEqual(0.7);
  });
});

/** every probed family row of a compose: phase, key, years, weight and favourite factor */
function probe(o: Parameters<typeof compose>[0]) {
  const rows: Array<{ slot: number; phase: SlotRole; key: string; w: number; fav: number }> = [];
  rankProbe.on = (slot, rs, phase) => {
    for (const r of rs) rows.push({ slot, phase, key: r.key, w: r.w, fav: r.fav });
  };
  const night = compose(o, deps);
  rankProbe.on = null;
  return { rows, night };
}

describe("use them in place: the slot role where they worked", () => {
  it("a favourite family weighs more in slots of its role only, and ranks no lower there", () => {
    // the tanda of the base night in the rarest role (a peak if there is one)
    const counts = new Map<SlotRole, number>();
    for (const t of base.tandas) counts.set(t.phase, (counts.get(t.phase) ?? 0) + 1);
    const t =
      base.tandas.find((x) => x.phase === "peak") ??
      base.tandas.slice().sort((a, b) => counts.get(a.phase)! - counts.get(b.phase)!)[0]!;
    const F = tapped(t, "full", 4, undefined, Date.now());
    const { rows, night } = probe({ hours: 2, seed: 12, favourites: F });
    const mine = rows.filter((r) => r.key === famOf(t));
    expect(mine.some((r) => r.phase === t.phase && r.fav > 1)).toBe(true);
    for (const r of mine) if (r.phase !== t.phase) expect(r.fav).toBe(1);
    // within every slot: its rank with the favourite is never worse than without
    const bySlot = new Map<number, typeof rows>();
    for (const r of rows) bySlot.set(r.slot, [...(bySlot.get(r.slot) ?? []), r]);
    for (const r of mine.filter((x) => x.fav > 1)) {
      const slot = bySlot.get(r.slot)!;
      const rank = (w: (x: (typeof rows)[number]) => number) => slot.filter((x) => w(x) > w(r)).length;
      expect(rank((x) => x.w)).toBeLessThanOrEqual(rank((x) => x.w / x.fav));
    }
    // the debug readout says so (the e2e reads it through the API)
    const tr = night.stats.favourites?.find((x) => x.key === famOf(t) && x.role === t.phase);
    expect(tr?.factor).toBeGreaterThan(1);
    expect(tr!.shareWith).toBeGreaterThan(tr!.shareWithout);
    expect(tr!.rankWith).toBeLessThanOrEqual(tr!.rankWithout);
  });
  it("a peak favourite is drawn for peaks: a side favourite rises in its family in its role only", () => {
    const t = base.tandas[2]!;
    const s = t.songs.at(-1)!;
    const F = recordFloor(undefined, {
      nightId: "n",
      scope: "song",
      song: s,
      tanda: t,
      reaction: "full",
      at: iso(Date.now()),
    });
    const T = favouriteTable(F);
    expect(favouriteSideFactor(T, s.id, t.phase)).toBeGreaterThan(1);
    for (const r of ["warmup", "build", "peak", "cooldown", "close"] as SlotRole[])
      if (r !== t.phase) expect(favouriteSideFactor(T, s.id, r)).toBe(1);
  });
  it("emptied lowers but never bans: every family stays in the draw, the night is whole", () => {
    let F: DancerFavourites | undefined;
    for (const t of base.tandas) F = tapped(t, "emptied", 3, F, Date.now());
    const { rows, night } = probe({ hours: 2, seed: 12, favourites: F });
    const low = rows.filter((r) => r.fav < 1);
    expect(low.length).toBeGreaterThan(0);
    for (const r of low) {
      expect(r.fav).toBeGreaterThanOrEqual(0.7);
      expect(r.w).toBeGreaterThan(0);
    }
    expect(night.tandas.length).toBe(base.tandas.length);
  });
  it("no rule is broken: one orchestra and the spread cap per tanda, no title twice, no new blocker", () => {
    let F: DancerFavourites | undefined;
    for (const t of base.tandas.slice(0, 4)) F = tapped(t, "full", 5, F, Date.now());
    for (const seed of [12, 31]) {
      const p = compose({ hours: 2, seed, favourites: F }, deps);
      const q = compose({ hours: 2, seed }, deps);
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
    }
  });
  it("never overrides an explicit setting or a DJ pin", () => {
    const t = base.tandas[2]!;
    const F = tapped(t, "full", 6, undefined, Date.now());
    const p = compose({ hours: 2, seed: 12, favourites: F, excludeOrchestras: [t.orchestraId] }, deps);
    expect(p.tandas.some((x) => x.orchestraId === t.orchestraId)).toBe(false);
    const pinned = { ...base.tandas[4]!, locked: true };
    const q = compose({ hours: 2, seed: 12, favourites: F }, deps, { locked: [pinned] });
    expect(q.tandas[4]!.songs.map((s) => s.id)).toEqual(pinned.songs.map((s) => s.id));
  });
  it("switched off (or empty): the night is exactly the night without", () => {
    let F: DancerFavourites | undefined;
    for (const t of base.tandas) F = tapped(t, "full", 3, F, Date.now());
    const off = compose({ hours: 2, seed: 12, favourites: setFavouritesOff(F, true) }, deps);
    expect(ids(off)).toEqual(ids(base));
    expect(off.stats.favourites).toBeUndefined();
    const empty = compose({ hours: 2, seed: 12, favourites: emptyFavourites() }, deps);
    expect(ids(empty)).toEqual(ids(base));
    const on = compose({ hours: 2, seed: 12, favourites: F }, deps);
    expect(on.stats.favourites?.length).toBeGreaterThan(0);
  });
});

describe("the rule check's and the swap's suggestions rank favourites first, with a ♥", () => {
  let night: Playlist;
  beforeAll(() => {
    night = JSON.parse(
      readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
    ) as Playlist;
  });
  it("swap options: a favourite side of the chair's family comes first", () => {
    const t = night.tandas[0]!;
    const plain = swapOptions(night, 0, 1, deps).suggestions;
    expect(plain.length).toBeGreaterThan(1);
    const last = plain.at(-1)!.song;
    const F = recordFloor(undefined, {
      nightId: "n",
      scope: "song",
      song: last,
      tanda: t,
      reaction: "full",
    });
    const fav = swapOptions(night, 0, 1, deps, { favourites: favouriteTable(F) }).suggestions;
    expect(fav[0]!.song.id).toBe(last.id);
    expect(fav[0]!.favourite).toBe(true);
    expect(fav.slice(1).every((x) => !x.favourite)).toBe(true);
    // the favourite flag is the role's: another role's favourite is no ♥ here
    const other: Tanda = { ...t, phase: t.phase === "peak" ? "warmup" : "peak" };
    const G = recordFloor(undefined, {
      nightId: "n",
      scope: "song",
      song: last,
      tanda: other,
      reaction: "full",
    });
    expect(isFavouriteSide(favouriteTable(G), last.id, t.phase)).toBe(false);
  });
  it("rule-check suggestions: the favourite one first, marked", () => {
    const instr = (deps.catalog.byOrchestra.get("angel-d-agostino") ?? []).find(
      (s) =>
        !s.vocal && s.rhythm === "tango" && !!s.year && s.year >= 1940 && s.year <= 1943 && !s.yearApprox,
    )!;
    const after = replaceSide(night, 0, 1, instr.id, deps, { force: true }).playlist;
    const v = checkEdit(night, after, { catalog: deps.catalog }).violations.find((x) => x.rule === "voice")!;
    const plain = suggestFixes(night, after, v, deps);
    const withSong = plain.filter((x) => x.song);
    expect(withSong.length).toBeGreaterThan(1);
    const pick = withSong.at(-1)!.song as Song;
    const s = deps.catalog.songs.find((x) => x.id === pick.id)!;
    const F = recordFloor(undefined, {
      nightId: "n",
      scope: "song",
      song: s,
      tanda: night.tandas[0]!,
      reaction: "full",
    });
    const fav = suggestFixes(night, after, v, deps, 3, { favourites: favouriteTable(F) });
    expect(fav[0]!.song?.id).toBe(pick.id);
    expect(fav[0]!.favourite).toBe(true);
  });
  it("the manual builder's next-tanda suggestions lift a family the floor filled in that slot's role", () => {
    const plain = suggestNext([], deps, { hours: 2 });
    const target = plain.suggestions.at(-1)!;
    const songs = target.songs as Song[];
    const t: Tanda = {
      ...base.tandas[0]!,
      songs,
      rhythm: target.rhythm,
      phase: "warmup",
      yearRange: target.years,
    };
    const F = tapped(t, "full", 6, undefined, Date.now());
    const fav = suggestNext([], deps, { hours: 2, favourites: favouriteTable(F) });
    const at = fav.suggestions.findIndex((x) => x.key === target.key);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(plain.suggestions.length - 1);
    expect(fav.suggestions[at]!.favourite).toBe(true);
  });
});
