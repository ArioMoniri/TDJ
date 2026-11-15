import { readFileSync } from "node:fs";
import {
  emptyMemory,
  type LearnedPreferences,
  learnedFamilyFactor,
  learnedForRequest,
  learnedSideFactor,
  mergeLearned,
  nightExceptions,
} from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  featuredNightLines,
  featuredOn,
  featuredRuleList,
  forgetFeatured,
  restoreFeatured,
  setFeaturedOn,
  weighFeatured,
} from "./featuredLearned";

const store = JSON.parse(
  readFileSync(new URL("../../../../data/knowledge/dj_preferences.json", import.meta.url), "utf8"),
) as LearnedPreferences;
/** what compose reads: the store under the DJ's request (mergeLearned, as compose.ts and suggest.ts do) */
const composed = (m: ReturnType<typeof emptyMemory>, learn = true) =>
  mergeLearned(store, learnedForRequest(m, learn));

describe("Learned from your edits to the featured night (store logic)", () => {
  it("lists the repo store's families, sides and DJ tanda templates, and its night-level choices", () => {
    const rules = featuredRuleList(store, undefined);
    expect(rules.length).toBeGreaterThan(50);
    for (const k of ["family", "side", "template"]) expect(rules.some((r) => r.kind === k)).toBe(true);
    expect(featuredNightLines(store.night, (x) => x).length).toBeGreaterThanOrEqual(4);
    expect(featuredOn(undefined)).toBe(true);
    // the DJ's approvals of mixed tandas are one-night exceptions: listed apart, never a template rule
    const ex = nightExceptions(store);
    expect(ex.length).toBeGreaterThanOrEqual(7);
    for (const x of ex) expect(rules.some((r) => r.id === `template:${x.tandaId}`)).toBe(false);
  });

  it("switched off, compose no longer reads it (also with learning off); on again, it is back", () => {
    const fam = Object.keys(store.families!).find((k) => store.families![k]! > 0)!;
    const side = Object.keys(store.sides!).find((k) => store.sides![k]! > 0)!;
    const m = emptyMemory();
    expect(learnedFamilyFactor(composed(m), fam)).toBeGreaterThan(1);
    const off = { ...m, repoLearned: setFeaturedOn(undefined, false) };
    for (const learn of [true, false]) {
      expect(learnedFamilyFactor(composed(off, learn), fam)).toBe(1);
      expect(learnedSideFactor(composed(off, learn), side)).toBe(1);
    }
    const on = { ...m, repoLearned: setFeaturedOn(off.repoLearned, true) };
    expect(learnedFamilyFactor(composed(on), fam)).toBeGreaterThan(1);
  });

  it("a deleted or reweighted rule is an override in the DJ's memory; compose follows it, the store is untouched", () => {
    const before = JSON.stringify(store);
    const fam = Object.keys(store.families!)[0]!;
    const id = `family:${fam}`;
    const w = weighFeatured(undefined, id, -1);
    expect(composed({ ...emptyMemory(), repoLearned: w }).families?.[fam]).toBe(-1);
    expect(featuredRuleList(store, w).find((r) => r.id === id)?.weight).toBe(-1);
    const d = forgetFeatured(w, id);
    expect(d.weights?.[id]).toBeUndefined();
    expect(composed({ ...emptyMemory(), repoLearned: d }).families?.[fam]).toBeUndefined();
    expect(featuredRuleList(store, d).some((r) => r.id === id)).toBe(false);
    const t = featuredRuleList(store, undefined).find((r) => r.kind === "template")!;
    expect(featuredRuleList(store, weighFeatured(undefined, t.id, 0)).some((r) => r.id === t.id)).toBe(false);
    expect(featuredRuleList(store, restoreFeatured(d)).some((r) => r.id === id)).toBe(true);
    expect(JSON.stringify(store)).toBe(before);
  });
});
