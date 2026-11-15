import { readFileSync } from "node:fs";
import {
  emptyMemory,
  type LearnedPreferences,
  learnedForRequest,
  mergeLearned,
  type Playlist,
  praiseFromNight,
} from "@tdj/core";
import { describe, expect, it } from "vitest";
import { featuredRuleList, forgetFeatured } from "./featuredLearned";
import { en } from "./i18n/en";
import { tr } from "./i18n/tr";
import { isPraised, praiseTanda } from "./praise";

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const store = read("../../../../data/knowledge/dj_preferences.json") as LearnedPreferences;
const night = read("../../public/featured/golden-double-peak.json") as Playlist;
const at = new Date("2026-11-15T22:00:00.000Z");

describe("Praise this tanda (the Booth, store logic)", () => {
  it("records the same entry as the featured night's store, in the DJ's memory, with an optional note; again takes it back", () => {
    const m = praiseTanda(emptyMemory(), night, 14, "  the floor sang  ", at);
    expect(isPraised(m, night, 14)).toBe(true);
    expect(isPraised(m, night, 13)).toBe(false);
    const p = m.learned!.praise![0]!;
    const repo = store.praise!.find((x) => x.id === p.id)!;
    // the same shape and the same tanda facts as the store's entry; only the words, note, date and source differ
    const { reason: _r, note, at: when, source, ...facts } = p;
    const { reason: _r2, at: _a, source: _s, ...repoFacts } = repo;
    expect(facts).toEqual(repoFacts);
    expect(note).toBe("the floor sang");
    expect(when).toBe(at.toISOString());
    expect(source).toBe("dj");
    expect(praiseFromNight(night, 13, p.reason, { at: when, source, note })).toEqual(p);
    const back = praiseTanda(m, night, 14);
    expect(isPraised(back, night, 14)).toBe(false);
    expect(back.learned?.praise ?? []).toHaveLength(0);
  });
  it("rides with `learned`: the learning switch decides whether compose reads it", () => {
    const m = praiseTanda(emptyMemory(), night, 3, undefined, at);
    expect(mergeLearned(undefined, learnedForRequest(m, true)).praise).toHaveLength(1);
    expect(mergeLearned(undefined, learnedForRequest(m, false)).praise ?? []).toHaveLength(0);
  });
  it("Database → Memory: the store's praise is listed as feedback and can be deleted as an override", () => {
    expect(featuredRuleList(store, undefined).some((r) => r.kind === "praise")).toBe(true);
    const p = store.praise![0]!;
    const repo = forgetFeatured(undefined, `praise:${p.id}`);
    expect(featuredRuleList(store, repo).some((r) => r.kind === "praise")).toBe(false);
    expect(mergeLearned(store, { repo }).praise ?? []).toHaveLength(0);
  });
  it("says plainly what a praise is, in en and tr: feedback, a ♥ for these songs (no order, no connections)", () => {
    expect(en["praise.feedback"]).toBe("Feedback: this tanda was great. It counts as a ♥ for these songs.");
    expect(tr["praise.feedback"]).toContain("♥");
    for (const dict of [en, tr] as Array<Partial<Record<string, string>>>) {
      const keys = Object.keys(dict).filter((k) => k.startsWith("praise."));
      expect(keys.some((k) => /teaches|links|after|before/.test(k))).toBe(false);
    }
    for (const k of ["praise.footer", "praise.sheet_footer", "praise.saved_toast"] as const)
      expect(en[k]).not.toMatch(/order|connect|neighbour|learns/i);
  });
});
