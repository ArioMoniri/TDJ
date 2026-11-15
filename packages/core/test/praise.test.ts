/**
 * Learned DJ praise (2026-11-15, from the night: "The 14th Troilo tanda was amazing. It finished so nicely, the tanda
 * started and connected so nicely. Have that also in the learned things."). A praised tanda teaches three things,
 * bounded like the rest of the learning and never against a rule:
 *   (a) the tanda: its family and sides in its slot role, like a "Floor full ♥" (favourites.ts) and in the learned
 *       family / side weights — in that role only;
 *   (b) its order: when compose draws the family with these sides, the praised order is the template (opening and
 *       closing side first, then the order as a whole), through the sideOrder logic, only when it breaks no rule;
 *   (c) its connections: previous family → this family → next family in adjacent slots of the same roles, and the
 *       cortinas in those gaps, a mild bonus capped.
 * The night's mixed vocal / instrumental tanda stays that night's exception: praise never makes a composed tanda mix.
 * The entry lives in data (data/knowledge/dj_preferences.json `praise`, the DJ's memory `learned.praise`); no title or
 * orchestra is named in code. Written before the code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applyPraisedOrders,
  compose,
  costOfOrder,
  emptyMemory,
  familyFactorOf,
  familyKey,
  favouriteFamilyFactor,
  favouriteSideFactor,
  favouriteTable,
  forgetLearned,
  type LearnedPreferences,
  learnedFamilyFactor,
  learnedForRequest,
  learnedRules,
  learnedSideFactor,
  learnFromPraise,
  mergeLearned,
  nightExceptionKeys,
  type Playlist,
  PRAISE_LIMITS,
  praiseCortinaFactor,
  praisedFamilyPoints,
  praiseFromNight,
  praiseLinkFactor,
  praiseTemplateFor,
  rankProbe,
  recordFloor,
  type Song,
  strictOrder,
  type Tanda,
  type TandaPraise,
  tandaFamily,
  templateIdOf,
  templateMix,
  templateOrder,
  withPraise,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let store: LearnedPreferences;
let featured: Playlist;
/** the store's praise entry for the featured night (the DJ's 14th tanda) */
let P: TandaPraise;
let T: Tanda;
const QUOTE =
  "The 14th Troilo tanda was amazing. It finished so nicely, the tanda started and connected so nicely. Have that also in the learned things.";
beforeAll(() => {
  deps = loadCatalog();
  store = deps.catalog.learned!;
  featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  P = store.praise!.find((p) => p.nightId === featured.id && p.tanda === 13)!;
  T = featured.tandas[13]!;
}, 600000);
afterEach(() => {
  rankProbe.on = null;
});
const only = (p: TandaPraise): LearnedPreferences => ({ praise: [p] });
const fam = (t: Tanda) => familyKey({ ...t.songs[0]!, rhythm: t.rhythm });

describe("the praise entry (data)", () => {
  it("records the featured night's 14th tanda: its sides in order, its neighbours and cortinas, its role, the DJ's words", () => {
    expect(P).toBeDefined();
    expect(P.songIds).toEqual(T.songs.map((s) => s.id));
    expect(P.role).toBe(T.phase);
    expect(P.role).toBe("build");
    expect(P.prevCortinaId).toBe(featured.tandas[12]!.cortina!.id);
    expect(P.nextCortinaId).toBe(T.cortina!.id);
    expect(P.reason).toBe(QUOTE);
    expect(P.at).toMatch(/^2026-11-15/);
    // the same entry the Booth's "Praise this tanda" records for any night (praiseFromNight): data, not code
    const fresh = praiseFromNight(featured, 13, QUOTE, { at: P.at, source: P.source });
    expect(fresh).toEqual(P);
    expect(P.prevFamily).toBe(fam(featured.tandas[12]!));
    expect(P.nextFamily).toBe(fam(featured.tandas[14]!));
    expect(P.family).toBe(fam(T));
    expect(P.prevRole).toBe(featured.tandas[12]!.phase);
    expect(P.nextRole).toBe(featured.tandas[14]!.phase);
  });
  it("is listed as a learned rule (kind praise) the DJ can delete; the store also keeps it as a one-night exception", () => {
    const rules = learnedRules(store);
    const r = rules.find((x) => x.id === `praise:${P.id}`);
    expect(r?.kind).toBe("praise");
    expect(r?.label).toContain(QUOTE.slice(0, 20));
    const gone = mergeLearned(store, { repo: { deleted: [`praise:${P.id}`] } });
    expect((gone.praise ?? []).some((x) => x.id === P.id)).toBe(false);
    expect(nightExceptionKeys(store, featured.id).has(templateIdOf(T))).toBe(true);
    expect(nightExceptionKeys(store, "another-night").size).toBe(0);
    expect(forgetLearned(only(P), `praise:${P.id}`).praise ?? []).toHaveLength(0);
  });
});

describe("(a) the tanda: its family and sides in its role only", () => {
  it("raises the learned family and side weights in the praised role, nowhere else", () => {
    const L = only(P);
    for (const role of ["warmup", "peak", "cooldown", "close"] as const) {
      expect(learnedFamilyFactor(L, P.family, P.years, role)).toBe(1);
      for (const id of P.songIds) expect(learnedSideFactor(L, id, undefined, role)).toBe(1);
    }
    expect(learnedFamilyFactor(L, P.family, P.years, "build")).toBeGreaterThan(1);
    for (const id of P.songIds) expect(learnedSideFactor(L, id, undefined, "build")).toBeGreaterThan(1);
    // a caller that names no role (the night-wide weights) is unchanged
    expect(learnedFamilyFactor(L, P.family, P.years)).toBe(1);
  });
  it("is DJ evidence in the dancer-favourites tracker: the same as a Floor full ♥ on the tanda, in its role only", () => {
    const tbl = withPraise(undefined, [P])!;
    const tap = favouriteTable(
      recordFloor(undefined, {
        nightId: P.nightId,
        scope: "tanda",
        tanda: T,
        tandaIndex: 13,
        reaction: "full",
        at: P.at,
      }),
      Date.parse(P.at),
    );
    const years = T.yearRange ?? null;
    const key = tandaFamily(T).split("|").slice(0, 3).join("|");
    expect(favouriteFamilyFactor(tbl, key, "build", years)).toBeCloseTo(
      favouriteFamilyFactor(tap, key, "build", years),
      6,
    );
    expect(favouriteFamilyFactor(tbl, key, "build", years)).toBeGreaterThan(1);
    expect(favouriteFamilyFactor(tbl, key, "build", years)).toBeLessThanOrEqual(familyFactorOf(1));
    expect(favouriteFamilyFactor(tbl, key, "peak", years)).toBe(1);
    for (const id of P.songIds) {
      expect(favouriteSideFactor(tbl, id, "build")).toBeGreaterThan(1);
      expect(favouriteSideFactor(tbl, id, "warmup")).toBe(1);
    }
    // the DJ's own tracker evidence stays, the praise is added to it (never mutated in place)
    const before = JSON.stringify(tap);
    const both = withPraise(tap, [P])!;
    expect(JSON.stringify(tap)).toBe(before);
    expect(favouriteFamilyFactor(both, key, "build", years)).toBeGreaterThan(
      favouriteFamilyFactor(tap, key, "build", years),
    );
  });
  it("compose weighs the praised family up in build slots only", () => {
    const base = compose({ hours: 2, seed: 7 }, deps);
    const k = base.tandas.findIndex((t, i) => t.phase === "build" && i > 0 && t.rhythm === "tango");
    expect(k).toBeGreaterThan(0);
    const p = praiseFromNight(base, k, "a test praise", { at: "2026-11-15T00:00:00.000Z", source: "dj" });
    const rows: Array<{ key: string; fav: number; phase: string }> = [];
    rankProbe.on = (_s, rs, phase) => {
      for (const r of rs) rows.push({ key: r.key, fav: r.fav, phase });
    };
    compose({ hours: 2, seed: 7, learned: only(p) }, deps);
    const mine = rows.filter((r) => r.key === p.family);
    expect(mine.some((r) => r.phase === "build" && r.fav > 1)).toBe(true);
    expect(mine.filter((r) => r.phase !== "build").every((r) => r.fav === 1)).toBe(true);
  }, 600000);
});

describe("(b) its order is the template", () => {
  it("the praised order wins over the composer's own order when it breaks no rule", () => {
    // (the sides a composed tanda can hold: one mode — the night's instrumental closer was its own exception)
    const vocal = T.songs.filter((s) => s.vocal);
    const shuffled = [vocal[2]!, vocal[0]!, vocal[1]!];
    const out = templateOrder(shuffled, P.songIds, false)!;
    expect(out.map((s) => s.id)).toEqual(vocal.map((s) => s.id));
    // (no rule the composer's own order keeps is broken for it)
    expect(Math.floor(costOfOrder(out) / 10)).toBeLessThanOrEqual(
      Math.floor(costOfOrder(strictOrder(shuffled)) / 10),
    );
  });
  it("opens and closes on the praised sides, the rest in the praised order (a side it did not hold fits between)", () => {
    const vocal = T.songs.filter((s) => s.vocal);
    const peer = deps.catalog.byOrchestra
      .get(T.orchestraId)!
      .find(
        (s) =>
          s.vocal &&
          s.singer === vocal[0]!.singer &&
          s.year === vocal[0]!.year &&
          s.rhythm === "tango" &&
          !P.songIds.includes(s.id),
      )!;
    expect(peer).toBeDefined();
    const out = templateOrder([vocal[2]!, peer, vocal[1]!, vocal[0]!], P.songIds, false)!;
    const ids = out.map((s) => s.id);
    const tpl = P.songIds.filter((id) => ids.includes(id));
    expect(ids[0]).toBe(tpl[0]);
    expect(ids.at(-1)).toBe(tpl.at(-1));
    expect(ids.filter((id) => tpl.includes(id))).toEqual(tpl);
  });
  it("a template that would break an order rule is not applied (nothing here breaks a rule)", () => {
    // a tanda of famous sides: a template opening on its one unknown side breaks the fame rule of the first side
    const t = featured.tandas.find(
      (x) => x.songs.filter((s) => (s.fame ?? 0) >= 4).length >= 3 && x.songs.some((s) => !s.fame),
    )!;
    const unknown = t.songs.find((s) => !s.fame)!;
    const tpl = [unknown.id, ...t.songs.filter((s) => s !== unknown).map((s) => s.id)];
    const out = templateOrder(t.songs, tpl, false);
    expect(out === null || out[0]!.id !== unknown.id).toBe(true);
    if (out)
      expect(Math.floor(costOfOrder(out) / 10)).toBeLessThanOrEqual(
        Math.floor(costOfOrder(strictOrder(t.songs)) / 10),
      );
    // as the template asks, it would break a rule
    const asked = tpl.map((id) => t.songs.find((s) => s.id === id)!);
    expect(Math.floor(costOfOrder(asked) / 10)).toBeGreaterThan(
      Math.floor(costOfOrder(strictOrder(t.songs)) / 10),
    );
  });
  it("applyPraisedOrders reorders a matching tanda of a night and leaves the others as they are", () => {
    const ts = featured.tandas.map((t) => ({ ...t, pinned: undefined, locked: undefined }));
    const k = 13;
    const vocal = ts[k]!.songs.filter((s) => s.vocal);
    ts[k] = { ...ts[k]!, songs: [vocal[1]!, vocal[2]!, vocal[0]!] };
    const out = applyPraisedOrders(ts, only(P));
    expect(out[k]!.songs.map((s) => s.id)).toEqual(vocal.map((s) => s.id));
    out.forEach((t, i) => {
      if (i !== k) expect(t).toBe(ts[i]);
    });
    // a DJ's pinned or locked tanda is never reordered
    const pinned = ts.map((t, i) => (i === k ? { ...t, locked: true } : t));
    expect(applyPraisedOrders(pinned, only(P))[k]).toBe(pinned[k]);
  });
  it("praiseTemplateFor needs two of the praised sides in a tanda of the praised rhythm", () => {
    expect(praiseTemplateFor(only(P), T.songs.slice(0, 2), T.rhythm)).toEqual(P.songIds);
    expect(praiseTemplateFor(only(P), T.songs.slice(0, 1), T.rhythm)).toBeUndefined();
    expect(praiseTemplateFor(only(P), T.songs.slice(0, 2), "vals")).toBeUndefined();
  });
});

describe("(c) its connections: a mild bonus, bounded", () => {
  it("previous family → this family and this family → next family, in adjacent slots of the same roles", () => {
    const L = only(P);
    const prev = { family: P.prevFamily!, role: P.prevRole! };
    const cur = { family: P.family, role: P.role };
    const next = { family: P.nextFamily!, role: P.nextRole! };
    const into = praiseLinkFactor(L, prev, cur);
    const out = praiseLinkFactor(L, cur, next);
    for (const f of [into, out]) {
      expect(f).toBeGreaterThan(1);
      expect(f).toBeLessThanOrEqual(PRAISE_LIMITS.linkMax);
    }
    // another role, another family, no previous tanda: nothing
    expect(praiseLinkFactor(L, { ...prev, role: "peak" }, cur)).toBe(1);
    expect(praiseLinkFactor(L, prev, { ...cur, role: "peak" })).toBe(1);
    expect(praiseLinkFactor(L, { family: "x|y|tango", role: "build" }, cur)).toBe(1);
    expect(praiseLinkFactor(L, null, cur)).toBe(1);
    // the cortinas in those two gaps
    expect(praiseCortinaFactor(L, prev, cur, P.prevCortinaId!)).toBeGreaterThan(1);
    expect(praiseCortinaFactor(L, cur, next, P.nextCortinaId!)).toBeGreaterThan(1);
    expect(praiseCortinaFactor(L, cur, next, P.prevCortinaId!)).toBe(1);
    expect(praiseCortinaFactor(L, prev, cur, "another-cue")).toBe(1);
    expect(praiseCortinaFactor(L, prev, cur, P.prevCortinaId!)).toBeLessThanOrEqual(PRAISE_LIMITS.cortinaMax);
  });
  it("many praises of the same tanda stay inside the caps", () => {
    const many: LearnedPreferences = {
      praise: Array.from({ length: 40 }, (_, i) => ({ ...P, id: `${P.id}-${i}`, nightId: `n${i}` })),
    };
    const prev = { family: P.prevFamily!, role: P.prevRole! };
    const cur = { family: P.family, role: P.role };
    expect(praiseLinkFactor(many, prev, cur)).toBeLessThanOrEqual(PRAISE_LIMITS.linkMax);
    expect(praiseCortinaFactor(many, prev, cur, P.prevCortinaId!)).toBeLessThanOrEqual(
      PRAISE_LIMITS.cortinaMax,
    );
    expect(praisedFamilyPoints(many, P.family, "build")).toBeLessThanOrEqual(PRAISE_LIMITS.familyMax);
    expect(learnedFamilyFactor(many, P.family, P.years, "build")).toBeLessThanOrEqual(1.12);
    expect(learnedSideFactor(many, P.songIds[0]!, undefined, "build")).toBeLessThanOrEqual(1.45);
    const tbl = withPraise(undefined, many.praise)!;
    expect(favouriteFamilyFactor(tbl, P.family, "build", P.years)).toBeLessThanOrEqual(1.8);
    expect(favouriteSideFactor(tbl, P.songIds[0]!, "build")).toBeLessThanOrEqual(2);
  });
});

describe("the mixed tanda stays a this-night-only exception", () => {
  it("the template orders only the sides the draw holds: never adds the instrumental side to a vocal tanda", () => {
    const vocal = T.songs.filter((s) => s.vocal);
    expect(vocal.length).toBe(3);
    expect(templateMix(T.songs, T.rhythm)).toContain("mode");
    const out = templateOrder([vocal[1]!, vocal[2]!, vocal[0]!], P.songIds, false)!;
    expect(out).toHaveLength(3);
    expect(out.every((s: Song) => s.vocal)).toBe(true);
    expect(out.map((s) => s.id)).toEqual(P.songIds.filter((id) => vocal.some((s) => s.id === id)));
    expect(templateMix(out, T.rhythm)).not.toContain("mode");
  });
  it("praise is no template and no exception of another night, and composed nights with it never mix mode", () => {
    const L = only(P);
    expect(learnedRules(L).filter((r) => r.kind === "template")).toHaveLength(0);
    const memory = { ...emptyMemory(), learned: learnFromPraise(undefined, P) };
    for (const seed of [5, 23]) {
      const p = compose({ hours: 2, seed, learned: learnedForRequest(memory, true) }, deps);
      for (const t of p.tandas.filter((x) => !x.pinned))
        expect(templateMix(t.songs, t.rhythm)).not.toContain("mode");
    }
  }, 600000);
});

describe("the learning switch", () => {
  it("off: the DJ's praise has no effect; the store's praise goes with the store's own switch", () => {
    const memory = { ...emptyMemory(), learned: learnFromPraise(undefined, P) };
    expect(learnedForRequest(memory, false)).toBeUndefined();
    expect(mergeLearned(store, { repo: { off: true } }).praise ?? []).toHaveLength(0);
    const ids = (learned?: LearnedPreferences) =>
      compose({ hours: 2, seed: 11, learned }, deps).tandas.map((t) => t.songs.map((s) => s.id).join());
    // learning off sends no praise: the night is the night without it
    expect(ids(learnedForRequest(memory, false))).toEqual(ids(undefined));
  }, 600000);
  it("recording praise from the Booth toggles: the same tanda praised again takes it back", () => {
    const once = learnFromPraise(undefined, P);
    expect(once.praise).toHaveLength(1);
    expect(learnFromPraise(once, P).praise ?? []).toHaveLength(0);
    const note = learnFromPraise(undefined, { ...P, note: "the floor sang along" });
    expect(note.praise?.[0]?.note).toBe("the floor sang along");
  });
});
