/**
 * 2026-11 (the owner: "Fill the rest" becomes a menu — Fill the next tanda / one cycle / to the target length /
 * everything — each previewed before it applies). Written before the code: the scopes stop where they say, the DJ's
 * tandas are kept, every new tanda keeps the composer's rules (one orchestra, no repeated side), and the cycle
 * follows the night's rhythm pattern.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ComposeOptions,
  draftMinutesOf,
  FILL_SCOPES,
  fillDraft,
  nextRhythm,
  nightOptions,
  patternString,
  planSlots,
  type Song,
  suggestNext,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
const OPTS: Partial<ComposeOptions> = { hours: 4 };
let o: ComposeOptions;
/** a draft built from the engine's own first picks: `n` whole tandas, and an unfinished one when `open` */
let two: Song[][];
let openDraft: Song[][];
beforeAll(() => {
  deps = loadCatalog();
  o = nightOptions(OPTS);
  two = [];
  for (let k = 0; k < 2; k++) {
    const n = suggestNext(two, deps, { ...OPTS, limit: 3 });
    two.push(n.suggestions[0]!.songs.slice());
  }
  openDraft = [...two.map((t) => t.slice()), two[0]!.slice(0, 0)];
  const n3 = suggestNext(two, deps, { ...OPTS, limit: 3 });
  openDraft[2] = n3.suggestions[0]!.songs.slice(0, 1);
}, 600000);

const size = (t: Song[]) =>
  t[0]!.rhythm === "tango"
    ? o.tangoTandaSize
    : t[0]!.rhythm === "vals"
      ? o.valsTandaSize
      : o.milongaTandaSize;
const rules = (d: Song[][]) => {
  const ids = d.flat().map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const t of d) {
    expect(new Set(t.map((s) => s.orchestraId)).size).toBe(1);
    expect(new Set(t.map((s) => s.rhythm)).size).toBe(1);
  }
};

describe("fill scopes", () => {
  it("lists the four scopes in menu order", () => {
    expect(FILL_SCOPES).toEqual(["tanda", "cycle", "target", "all"]);
  });

  it("the next tanda: one new whole tanda on a finished draft; the DJ's tandas untouched", () => {
    const r = fillDraft(two, deps, OPTS, "tanda");
    expect(r.draft.length).toBe(3);
    expect(r.added).toBe(1);
    expect(r.draft.slice(0, 2)).toEqual(two);
    expect(r.draft[2]!.length).toBe(size(r.draft[2]!));
    expect(r.rhythms).toHaveLength(1);
    rules(r.draft);
  });

  it("the next tanda on an open tanda: finishes it and adds none", () => {
    const r = fillDraft(openDraft, deps, OPTS, "tanda");
    expect(r.draft.length).toBe(3);
    expect(r.added).toBe(0);
    expect(r.draft[2]![0]!.id).toBe(openDraft[2]![0]!.id);
    expect(r.draft[2]!.length).toBe(size(r.draft[2]!));
    expect(r.sides).toBe(size(r.draft[2]!) - 1);
    rules(r.draft);
  });

  it("one cycle: the pattern's length of new tandas, in the cycle's rhythms", () => {
    const L = patternString(o).length;
    const r = fillDraft(two, deps, OPTS, "cycle");
    expect(r.added).toBe(L);
    // each new tanda's rhythm is the one the cycle asks for after what came before
    const rh = (t: Song[]) => t[0]!.rhythm as "tango" | "vals" | "milonga";
    for (let k = 2; k < r.draft.length; k++)
      expect(rh(r.draft[k]!)).toBe(nextRhythm(r.draft.slice(0, k).map(rh), o));
    expect(r.rhythms.filter((x) => x === "T").length).toBeGreaterThanOrEqual(L / 2);
    for (const t of r.draft) expect(t.length).toBe(size(t));
    rules(r.draft);
  });

  it("to the target length: stops once the night is as long as its hours, never past the plan", () => {
    const r = fillDraft(two, deps, OPTS, "target");
    const target = (o.hours ?? 4) * 60;
    expect(r.minutes).toBe(draftMinutesOf(r.draft, o));
    expect(r.draft.length).toBeLessThanOrEqual(Math.max(planSlots(o).length, 2));
    if (r.draft.length < planSlots(o).length) expect(r.minutes).toBeGreaterThanOrEqual(target);
    // and not a tanda more than needed: without the last one it was short of the target
    expect(draftMinutesOf(r.draft.slice(0, -1), o)).toBeLessThan(target);
    rules(r.draft);
  });

  it("everything: every slot of the plan", () => {
    const r = fillDraft(openDraft, deps, OPTS, "all");
    expect(r.draft.length).toBe(planSlots(o).length);
    expect(r.draft.slice(0, 2)).toEqual(two);
    for (const t of r.draft) expect(t.length).toBe(size(t));
    rules(r.draft);
  });

  it("is deterministic: the same draft fills the same way (the preview is what applies)", () => {
    const a = fillDraft(two, deps, OPTS, "cycle");
    const b = fillDraft(two, deps, OPTS, "cycle");
    expect(a.draft.map((t) => t.map((s) => s.id))).toEqual(b.draft.map((t) => t.map((s) => s.id)));
  });
});
