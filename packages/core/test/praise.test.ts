/**
 * The DJ's praise of a tanda (2026-11-15, from the night: "The 14th Troilo tanda was amazing. It finished so nicely,
 * the tanda started and connected so nicely." — then the owner's correction: "The Troilo praise was just feedback of
 * greatness, not a rule."). A praise is positive feedback and nothing more: it counts exactly as one "Floor full ♥"
 * tapped on that tanda in the dancer-favourites tracker — one unit of evidence for each of its songs and for its
 * family, in its slot role, bounded and decaying like a tap (favourites.ts withPraise). It sets no order, no
 * connection and no cortina, and adds nothing to the learned family / side weights. The entry stays a record of what
 * the DJ said (data/knowledge/dj_preferences.json `praise`, the DJ's memory `learned.praise`). Written before the code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as core from "../src/index";
import {
  compose,
  type DancerFavourites,
  emptyMemory,
  FAVOURITE_LIMITS,
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
  praiseFromNight,
  rankProbe,
  recordFloor,
  SLOT_ROLES,
  setFavouritesOff,
  type Tanda,
  type TandaPraise,
  tandaFamily,
  templateIdOf,
  templateMix,
  withPraise,
  yearBand,
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
/** one "Floor full ♥" tapped on tanda `index` of a night, at `at` */
const fullTap = (night: Pick<Playlist, "id" | "tandas">, index: number, at: string, F?: DancerFavourites) =>
  recordFloor(F, {
    nightId: night.id,
    scope: "tanda",
    tanda: night.tandas[index]!,
    tandaIndex: index,
    reaction: "full",
    at,
  });
/** every favourite factor of the praised tanda's family and sides, in every role */
const factors = (tbl: ReturnType<typeof withPraise>, p: TandaPraise) =>
  SLOT_ROLES.flatMap((role) => [
    favouriteFamilyFactor(tbl, p.family, role, p.years),
    ...p.songIds.map((id) => favouriteSideFactor(tbl, id, role)),
  ]);
/** a night as its tandas' sides (the order kept) and cortinas */
const shape = (n: Playlist) => ({
  tandas: n.tandas.map((t) => t.songs.map((s) => s.id).join()),
  cortinas: n.tandas.map((t) => t.cortina?.id ?? ""),
});

describe("the praise entry (a record of what the DJ said)", () => {
  it("records the featured night's 14th tanda: its sides, its role, the DJ's words, and its neighbours for context", () => {
    expect(P).toBeDefined();
    expect(P.songIds).toEqual(T.songs.map((s) => s.id));
    expect(P.role).toBe("build");
    expect(P.role).toBe(T.phase);
    expect(P.family).toBe(fam(T));
    expect(P.reason).toBe(QUOTE);
    expect(P.at).toMatch(/^2026-11-15/);
    expect(P.prevFamily).toBe(fam(featured.tandas[12]!));
    expect(P.nextFamily).toBe(fam(featured.tandas[14]!));
    expect(P.prevCortinaId).toBe(featured.tandas[12]!.cortina!.id);
    expect(P.nextCortinaId).toBe(T.cortina!.id);
    // the same entry the Booth's "Praise this tanda" records for any night (praiseFromNight): data, not code
    expect(praiseFromNight(featured, 13, QUOTE, { at: P.at, source: P.source })).toEqual(P);
  });
  it("is listed as a learned rule (kind praise) the DJ can delete; the store still keeps the mixed tanda as a one-night exception", () => {
    const r = learnedRules(store).find((x) => x.id === `praise:${P.id}`);
    expect(r?.kind).toBe("praise");
    expect(r?.label).toContain(QUOTE.slice(0, 20));
    const gone = mergeLearned(store, { repo: { deleted: [`praise:${P.id}`] } });
    expect((gone.praise ?? []).some((x) => x.id === P.id)).toBe(false);
    expect(forgetLearned(only(P), `praise:${P.id}`).praise ?? []).toHaveLength(0);
    expect(nightExceptionKeys(store, featured.id).has(templateIdOf(T))).toBe(true);
    expect(learnedRules(only(P)).filter((x) => x.kind === "template")).toHaveLength(0);
  });
  it("recording praise from the Booth toggles: the same tanda praised again takes it back; a note is kept", () => {
    const once = learnFromPraise(undefined, P);
    expect(once.praise).toHaveLength(1);
    expect(learnFromPraise(once, P).praise ?? []).toHaveLength(0);
    expect(learnFromPraise(undefined, { ...P, note: "the floor sang along" }).praise?.[0]?.note).toBe(
      "the floor sang along",
    );
  });
});

describe("a praise is one Floor full ♥ on the tanda", () => {
  it("the same table as one Floor full tap on that tanda: its family and each of its songs, in its role, with a tap's fame prior", () => {
    const at = Date.parse(P.at);
    const praised = withPraise(undefined, [P], { at, songs: deps.catalog.songs })!;
    const tapped = favouriteTable(fullTap(featured, 13, P.at), at);
    expect(`${P.family}|${yearBand(P.years)}`).toBe(tandaFamily(T));
    expect(praised).toEqual(tapped);
    expect(favouriteFamilyFactor(praised, P.family, "build", P.years)).toBeGreaterThan(1);
    expect(favouriteFamilyFactor(praised, P.family, "build", P.years)).toBeLessThanOrEqual(familyFactorOf(1));
    for (const role of SLOT_ROLES.filter((r) => r !== "build")) {
      expect(favouriteFamilyFactor(praised, P.family, role, P.years)).toBe(1);
      for (const id of P.songIds) expect(favouriteSideFactor(praised, id, role)).toBe(1);
    }
  });
  it("on top of the DJ's own taps it adds exactly what one more tap (on another night) would add", () => {
    const at = Date.parse("2026-12-01T00:00:00.000Z");
    const earlier = fullTap({ ...featured, id: "another-night" }, 13, "2026-10-01T00:00:00.000Z");
    const before = JSON.stringify(favouriteTable(earlier, at));
    const base = favouriteTable(earlier, at);
    const praised = withPraise(base, [P], { at, songs: deps.catalog.songs });
    const twoTaps = favouriteTable(fullTap(featured, 13, P.at, earlier), at);
    const a = factors(praised, P);
    const b = factors(twoTaps, P);
    a.forEach((f, i) => expect(f).toBeCloseTo(b[i]!, 3));
    // the table given is never changed
    expect(JSON.stringify(base)).toBe(before);
  });
  it("decays like a tap (half-life 180 days) and stays bounded however often it is given", () => {
    const later = Date.parse(P.at) + FAVOURITE_LIMITS.halfLifeDays * 864e5;
    const old = withPraise(undefined, [P], { at: later })!;
    expect(old.sides[P.songIds[0]!]!.build![0]).toBeCloseTo(0.5, 4);
    const tapOld = favouriteTable(fullTap(featured, 13, P.at), later);
    expect(old.sides[P.songIds[0]!]!.build![0]).toBe(tapOld.sides[P.songIds[0]!]!.build![0]);
    const many = Array.from({ length: 400 }, (_, i) => ({ ...P, id: `${P.id}-${i}`, nightId: `n${i}` }));
    const tbl = withPraise(undefined, many, { at: Date.parse(P.at) })!;
    expect(tbl.sides[P.songIds[0]!]!.build![2]).toBe(FAVOURITE_LIMITS.maxPraise);
    expect(favouriteFamilyFactor(tbl, P.family, "build", P.years)).toBeLessThanOrEqual(
      FAVOURITE_LIMITS.familyMax,
    );
    expect(favouriteSideFactor(tbl, P.songIds[0]!, "build")).toBeLessThanOrEqual(FAVOURITE_LIMITS.sideMax);
  });
  it("adds nothing to the learned family or side weights (the DJ's edits)", () => {
    const L = only(P);
    expect(learnedFamilyFactor(L, P.family, P.years)).toBe(1);
    for (const id of P.songIds) expect(learnedSideFactor(L, id)).toBe(1);
  });
  it("compose weighs the praised family up in build slots only", () => {
    const base = compose({ hours: 2, seed: 7 }, deps);
    const k = base.tandas.findIndex((t, i) => t.phase === "build" && i > 0 && t.rhythm === "tango");
    expect(k).toBeGreaterThan(0);
    const p = praiseFromNight(base, k, "a test praise", { at: new Date().toISOString(), source: "dj" });
    const rows: Array<{ key: string; fav: number; phase: string }> = [];
    rankProbe.on = (_s, rs, phase) => {
      for (const r of rs) rows.push({ key: r.key, fav: r.fav, phase });
    };
    compose({ hours: 2, seed: 7, learned: { repo: { off: true }, praise: [p] } }, deps);
    const mine = rows.filter((r) => r.key === p.family);
    expect(mine.some((r) => r.phase === "build" && r.fav > 1)).toBe(true);
    expect(mine.filter((r) => r.phase !== "build").every((r) => r.fav === 1)).toBe(true);
  }, 600000);
});

describe("compose: the praise acts only through the favourite weights", () => {
  // (the repo store's own praise switched off on both sides, so only the praise under test differs)
  const noRepo = { repo: { off: true } } as const;
  let night: Playlist;
  let p: TandaPraise;
  beforeAll(() => {
    night = compose({ hours: 2, seed: 11, learned: noRepo }, deps);
    const k = night.tandas.findIndex((t, i) => t.phase === "build" && i > 0 && t.rhythm === "tango");
    p = praiseFromNight(night, k, "a test praise", { at: new Date().toISOString(), source: "dj" });
  }, 600000);
  it("a night with the praise is the night with one Floor full tap on that tanda instead", () => {
    const withIt = compose({ hours: 2, seed: 11, learned: { ...noRepo, praise: [p] } }, deps);
    const k = p.tanda;
    const tapped = compose(
      { hours: 2, seed: 11, learned: noRepo, favourites: fullTap(night, k, p.at) },
      deps,
    );
    expect(shape(withIt)).toEqual(shape(tapped));
  }, 600000);
  it("with vs without the praise: the same night as without it, given the praise's favourite table", () => {
    const withIt = compose({ hours: 2, seed: 11, learned: { ...noRepo, praise: [p] } }, deps);
    const table = withPraise(undefined, [p], { songs: deps.catalog.songs });
    const viaTable = compose({ hours: 2, seed: 11, learned: noRepo, favourites: table }, deps);
    expect(shape(withIt)).toEqual(shape(viaTable));
  }, 600000);
  it("no effect on order, links or cortinas: the record's order, neighbours and cortinas change nothing", () => {
    const a = compose({ hours: 2, seed: 11, learned: { ...noRepo, praise: [p] } }, deps);
    const scrambled: TandaPraise = {
      ...p,
      songIds: [...p.songIds].reverse(),
      prevFamily: "x|y|tango",
      nextFamily: "z||vals",
      prevRole: "peak",
      nextRole: "close",
      prevCortinaId: night.tandas.at(-2)?.cortina?.id ?? "c-x",
      nextCortinaId: night.tandas.at(-3)?.cortina?.id ?? "c-y",
    };
    const b = compose({ hours: 2, seed: 11, learned: { ...noRepo, praise: [scrambled] } }, deps);
    expect(shape(b)).toEqual(shape(a));
    // and nothing of the old rule-like layer is left to call
    for (const name of [
      "templateOrder",
      "applyPraisedOrders",
      "praiseTemplateFor",
      "praiseLinkFactor",
      "praiseCortinaFactor",
      "praisedFamilyPoints",
      "praisedSidePoints",
      "PRAISE_LIMITS",
    ])
      expect(name in core).toBe(false);
  }, 600000);
  it("favourites switched off: the praise has no effect, as a tap has none", () => {
    const off = setFavouritesOff(undefined, true);
    const withIt = compose(
      { hours: 2, seed: 11, learned: { ...noRepo, praise: [p] }, favourites: off },
      deps,
    );
    const without = compose({ hours: 2, seed: 11, learned: noRepo, favourites: off }, deps);
    expect(shape(withIt)).toEqual(shape(without));
    expect(withPraise({ v: 1, off: true, sides: {}, families: {} }, [p])).toEqual({
      v: 1,
      off: true,
      sides: {},
      families: {},
    });
  }, 600000);
  it("learning switched off: no praise is sent, and the store's praise goes with the store's own switch", () => {
    const memory = { ...emptyMemory(), learned: learnFromPraise(undefined, p) };
    expect(learnedForRequest(memory, false)).toBeUndefined();
    expect(mergeLearned(store, { repo: { off: true } }).praise ?? []).toHaveLength(0);
    const ids = (learned?: LearnedPreferences) => shape(compose({ hours: 2, seed: 11, learned }, deps));
    expect(ids(learnedForRequest(memory, false))).toEqual(ids(undefined));
  }, 600000);
  it("composed nights with the praise never mix vocal and instrumental in a tanda", () => {
    const memory = { ...emptyMemory(), learned: learnFromPraise(undefined, P) };
    const n = compose({ hours: 2, seed: 5, learned: learnedForRequest(memory, true) }, deps);
    for (const t of n.tandas.filter((x) => !x.pinned))
      expect(templateMix(t.songs, t.rhythm)).not.toContain("mode");
  }, 600000);
});
