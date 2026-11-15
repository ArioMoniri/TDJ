/**
 * The repo-level learned store (data/knowledge/dj_preferences.json: the DJ's edits of the featured night) as the DJ
 * sees and controls it in Database → Memory: it covers every DJ edit of the featured night (scripts/featured_learned.ts
 * audits it against git history), and the DJ's overrides — the store switched off, a rule reweighted or deleted,
 * recorded in the DJ's memory — reach compose through `learned.repo`. Written before the code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applyMemory,
  compose,
  emptyMemory,
  familyKey,
  type LearnedPreferences,
  learnedForRequest,
  learnedRules,
  mergeLearned,
  nightExceptionKeys,
  nightExceptions,
  type Playlist,
  rankProbe,
  strictChecks,
  tandaTitleKeyOf,
  templateIdOf,
  templateMix,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let store: LearnedPreferences;
let featured: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  store = deps.catalog.learned!;
  featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
}, 600000);
afterEach(() => {
  rankProbe.on = null;
});

describe("the featured night's store covers the DJ's edits", () => {
  it("every tanda the DJ pinned teaches its family and is a template, or a one-night exception (never both); the Cumparsitas are chosen sides", () => {
    // (a tanda pinned only to keep a slot the engine filled says so in its reason: "(TDJ's pick)", it teaches nothing)
    const pinned = featured.tandas.filter(
      (t) => t.pinned?.by === "dj" && !/TDJ's pick/i.test(t.pinned.reason ?? ""),
    );
    expect(pinned.length).toBeGreaterThan(10);
    const keys = nightExceptionKeys(store, featured.id);
    for (const t of pinned) {
      const id = templateIdOf(t);
      const isTemplate = !!store.templates?.some((x) => x.id === id);
      const isException = keys.has(id) || keys.has(tandaTitleKeyOf(t));
      expect(isTemplate !== isException).toBe(true);
      const fams = t.songs.map((s) => familyKey(s));
      expect(fams.some((k) => (store.families?.[k] ?? 0) > 0)).toBe(true);
    }
    expect(store.sides?.[featured.closing!.id]).toBeGreaterThan(0);
    expect(store.sides?.[featured.opening!.id]).toBeGreaterThan(0);
  });
  it("records the night-level choices: the Cumparsita by T1's orchestra, Bandonegro closing, big four, last 4 tango, Turkish cortinas", () => {
    const n = store.night!;
    expect(n.cumparsita).toBe("both");
    expect(n.openingCumparsita?.orchestraId).toBe(featured.tandas[0]!.orchestraId);
    expect(n.openingCumparsita?.matchesFirstTanda).toBe(true);
    expect(n.closingCumparsita?.orchestraId).toBe("bandonegro");
    expect(n.bigFourQuartiles).toBe(true);
    expect(n.lastFourTango).toBe(true);
    expect(n.cortinaCultures).toEqual(["turkish"]);
    expect(n.cortinas).toContain("Dağlar Dağlar");
  });
  it("lists as rules the DJ can read: families, sides and templates", () => {
    const rules = learnedRules(store);
    for (const k of ["family", "side", "template"]) expect(rules.some((r) => r.kind === k)).toBe(true);
  });
});

describe("the DJ's overrides of the store reach compose", () => {
  const fam = () => Object.keys(store.families!)[0]!;
  it("a deleted rule is gone, a reweighted one carries the DJ's weight (inside the limits), the file is untouched", () => {
    const before = JSON.stringify(store);
    const k = fam();
    const del = mergeLearned(store, { repo: { deleted: [`family:${k}`] } });
    expect(del.families?.[k]).toBeUndefined();
    const w = mergeLearned(store, { repo: { weights: { [`family:${k}`]: -0.5 } } });
    expect(w.families?.[k]).toBe(-0.5);
    expect(mergeLearned(store, { repo: { weights: { [`family:${k}`]: 99 } } }).families?.[k]).toBe(3);
    expect(Object.keys(mergeLearned(store, { repo: { off: true } }).families ?? {})).toHaveLength(0);
    // the DJ's own learned rules stay when the store is off
    expect(mergeLearned(store, { families: { x: 1 }, repo: { off: true } }).families).toEqual({ x: 1 });
    expect(JSON.stringify(store)).toBe(before);
  });
  it("the overrides travel with every request, also with learning off", () => {
    const m = { ...emptyMemory(), learned: { families: { a: 1 } }, repoLearned: { off: true } };
    expect(learnedForRequest(m, false)).toEqual({ repo: { off: true } });
    expect(learnedForRequest(m, true)).toEqual({ families: { a: 1 }, repo: { off: true } });
    expect(applyMemory({}, m).learned?.repo?.off).toBe(true);
    expect(learnedForRequest(emptyMemory(), false)).toBeUndefined();
  });
  it("switched off, compose weighs families exactly as with no store; on, the store moves the draw", () => {
    const probe = (learned: LearnedPreferences | undefined, noStore = false) => {
      const calls: number[][] = [];
      rankProbe.on = (_s, rows) => calls.push(rows.map((r) => r.w));
      const saved = deps.catalog.learned;
      if (noStore) (deps.catalog as { learned?: LearnedPreferences }).learned = undefined;
      try {
        const p = compose({ hours: 2, seed: 7, learned }, deps);
        return { calls, ids: p.tandas.map((t) => t.songs.map((s) => s.id).join()) };
      } finally {
        (deps.catalog as { learned?: LearnedPreferences }).learned = saved;
        rankProbe.on = null;
      }
    };
    const none = probe(undefined, true);
    const off = probe({ repo: { off: true } });
    const on = probe(undefined);
    expect(off.calls).toEqual(none.calls);
    expect(off.ids).toEqual(none.ids);
    expect(JSON.stringify(on.calls)).not.toBe(JSON.stringify(none.calls));
  });
});

describe("the DJ's approvals of mixed tandas are exceptions for the featured night only", () => {
  it("are scoped to the featured night's id, carry the DJ's reason, and are no templates", () => {
    const ex = nightExceptions(store, featured.id);
    expect(ex.length).toBeGreaterThanOrEqual(7);
    for (const x of ex) {
      expect(x.reason.length).toBeGreaterThan(5);
      expect(x.mixed?.length).toBeGreaterThan(0);
      expect(store.templates?.some((t) => t.id === x.tandaId)).toBe(false);
    }
    expect(nightExceptionKeys(store, featured.id).size).toBeGreaterThanOrEqual(7);
    expect(nightExceptionKeys(store, "another-night").size).toBe(0);
    expect(nightExceptionKeys(store, undefined).size).toBe(0);
  });
  it("the strict panel accepts them in the featured night only; the same tandas in another night stay DJ exceptions", () => {
    const keys = nightExceptionKeys(store, featured.id);
    const r = strictChecks(featured, { approved: keys });
    const plain = strictChecks(featured);
    const accepted = r.accepted ?? [];
    expect(accepted.length).toBeGreaterThan(0);
    // nothing the panel counts changes: an acceptance only moves a DJ exception out of the list
    expect(r.penalty).toBe(plain.penalty);
    expect((r.exceptions?.length ?? 0) + accepted.length).toBe(plain.exceptions?.length ?? 0);
    for (const v of accepted) {
      const t = featured.tandas[v.tanda]!;
      expect(keys.has(templateIdOf(t)) || keys.has(tandaTitleKeyOf(t))).toBe(true);
    }
    const other = { ...featured, id: "another-night" };
    expect(strictChecks(other, { approved: nightExceptionKeys(store, other.id) }).accepted).toBeUndefined();
  });
  it("a new night composed with the store and the DJ's memory never mixes mode or singers because of them", () => {
    const memory = { ...emptyMemory(), learned: { families: {}, sides: {} } };
    const noEx: LearnedPreferences = { ...store, night: { ...store.night, exceptions: [] } };
    for (const seed of [3, 41]) {
      const opts = applyMemory({ hours: 2, seed }, memory);
      const withEx = compose(opts, deps);
      const saved = deps.catalog.learned;
      (deps.catalog as { learned?: LearnedPreferences }).learned = noEx;
      let without: Playlist;
      try {
        without = compose(opts, deps);
      } finally {
        (deps.catalog as { learned?: LearnedPreferences }).learned = saved;
      }
      // the exceptions are no compose signal: the night is the same without them
      expect(withEx.tandas.map(templateIdOf)).toEqual(without.tandas.map(templateIdOf));
      for (const t of withEx.tandas.filter((x) => !x.pinned)) {
        const mix = templateMix(t.songs, t.rhythm);
        expect(mix).not.toContain("mode");
        expect(mix).not.toContain("singer");
      }
    }
  });
});
