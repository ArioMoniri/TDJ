import { transitionKey } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  addTemplate,
  applyTargets,
  boundaryOf,
  cleanEdit,
  defaultFor,
  defaultTransitionMap,
  EMPTY_TEMPLATES,
  type JoinRow,
  moveTemplate,
  parseTemplates,
  removeTemplate,
  renameTemplate,
  sameEdit,
  setDefault,
  templateOf,
  updateTemplate,
  withEditAt,
} from "./transitionTemplates";

// two tandas of three (tango, then vals), a cortina after each, the closing La Cumparsita
const rows: JoinRow[] = [
  { id: "a1", kind: "track", tanda: 1 },
  { id: "a2", kind: "track", tanda: 1 },
  { id: "a3", kind: "track", tanda: 1 },
  { id: "c1", kind: "cortina", tanda: 1 },
  { id: "b1", kind: "track", tanda: 2 },
  { id: "b2", kind: "track", tanda: 2 },
  { id: "b3", kind: "track", tanda: 2 },
  { id: "c2", kind: "cortina", tanda: 2 },
  { kind: "break", tanda: 2 },
  { id: "cu", kind: "closing", tanda: 3 },
];
const rhythmOf = (t: number) => (t === 1 ? "tango" : t === 2 ? "vals" : null);
const fade = { preset: "fade" as const, fadeOutSec: 3, fadeInSec: 2, gapSec: 1, curveOut: "sCurve" as const };
const blend = { preset: "blend" as const, overlapSec: 4, eq: "bassSwap" as const, silence: "after" as const };

describe("templates: CRUD", () => {
  it("adds a named template with a clean copy of the edit; a blank name gets a number", () => {
    const r = addTemplate(EMPTY_TEMPLATES, "  Soft   fade ", { ...fade, junk: 1 } as never, "t1");
    expect(r.id).toBe("t1");
    expect(r.state.templates).toEqual([{ id: "t1", name: "Soft fade", edit: fade }]);
    const r2 = addTemplate(r.state, "", blend, "t2");
    expect(r2.state.templates[1]!.name).toBe("Template 2");
    expect(r2.state.templates[1]!.edit).toEqual(blend);
  });
  it("renames (a blank name is refused), updates, reorders and deletes", () => {
    let st = addTemplate(EMPTY_TEMPLATES, "A", fade, "t1").state;
    st = addTemplate(st, "B", blend, "t2").state;
    st = addTemplate(st, "C", { preset: "gap", gapSec: 3 }, "t3").state;
    expect(renameTemplate(st, "t1", "   ").templates[0]!.name).toBe("A");
    st = renameTemplate(st, "t1", "Soft");
    expect(st.templates[0]!.name).toBe("Soft");
    st = updateTemplate(st, "t3", { preset: "gap", gapSec: 4 });
    expect(st.templates[2]!.edit.gapSec).toBe(4);
    st = moveTemplate(st, "t3", -1);
    expect(st.templates.map((t) => t.id)).toEqual(["t1", "t3", "t2"]);
    expect(moveTemplate(st, "t1", -1)).toBe(st);
    st = setDefault(st, { boundary: "toCortina" }, "t2");
    st = setDefault(st, { rhythm: "vals" }, "t2");
    st = removeTemplate(st, "t2");
    expect(st.templates.map((t) => t.id)).toEqual(["t1", "t3"]);
    // the defaults that named it fall back to Auto
    expect(st.defaults).toEqual({ boundary: {}, rhythm: {} });
  });
  it("cleanEdit keeps only valid fields; sameEdit ignores field order", () => {
    expect(
      cleanEdit({ preset: "nope" as never, gapSec: 99, curveIn: "zig" as never, silence: "x" as never }),
    ).toEqual({
      preset: "gap",
      gapSec: 5,
    });
    expect(
      sameEdit({ preset: "fade", gapSec: 1, fadeOutSec: 3 }, { fadeOutSec: 3, gapSec: 1, preset: "fade" }),
    ).toBe(true);
    expect(sameEdit({ preset: "fade", gapSec: 1 }, { preset: "fade", gapSec: 2 })).toBe(false);
  });
  it("a stored state reads back safely (an export, localStorage)", () => {
    const st = parseTemplates({
      templates: [
        { id: "t1", name: "Soft", edit: fade },
        { id: "t1", name: "dup", edit: fade },
        { id: "t2", name: "", edit: fade },
        { name: "no id" },
      ],
      defaults: { boundary: { inTanda: "t1", toCortina: "gone", other: "t1" }, rhythm: { vals: "t1" } },
    });
    expect(st.templates.map((t) => t.id)).toEqual(["t1"]);
    expect(st.defaults).toEqual({ boundary: { inTanda: "t1" }, rhythm: { vals: "t1" } });
    expect(parseTemplates(null)).toEqual(EMPTY_TEMPLATES);
  });
});

describe("templates: defaults per kind of join and per rhythm", () => {
  it("names each join", () => {
    expect(boundaryOf(rows[0], rows[1])).toBe("inTanda");
    expect(boundaryOf(rows[2], rows[3])).toBe("toCortina");
    expect(boundaryOf(rows[3], rows[4])).toBe("fromCortina");
    expect(boundaryOf(rows[7], rows[8])).toBeNull();
    expect(boundaryOf(rows[8], rows[9])).toBeNull();
    expect(boundaryOf(rows[7], rows[9])).toBe("cumparsita");
    // the opening La Cumparsita (tanda 0) into the first song is no kind of join with a default
    expect(boundaryOf({ id: "o", kind: "closing", tanda: 0 }, rows[0])).toBeNull();
  });
  it("inside a tanda the rhythm's default wins over the join kind's; other joins use their kind's", () => {
    let st = addTemplate(EMPTY_TEMPLATES, "Soft", fade, "soft").state;
    st = addTemplate(st, "Vals blend", blend, "vb").state;
    st = setDefault(st, { boundary: "inTanda" }, "soft");
    st = setDefault(st, { boundary: "toCortina" }, "soft");
    st = setDefault(st, { rhythm: "vals" }, "vb");
    expect(defaultFor(st, "inTanda", "tango")?.id).toBe("soft");
    expect(defaultFor(st, "inTanda", "vals")?.id).toBe("vb");
    expect(defaultFor(st, "toCortina", "vals")?.id).toBe("soft");
    expect(defaultFor(st, "fromCortina", "tango")).toBeNull();
    expect(setDefault(st, { boundary: "cumparsita" }, "missing")).toBe(st);
    const map = defaultTransitionMap(rows, rhythmOf, st);
    expect(map[transitionKey("a1", "a2")]).toEqual(fade);
    expect(map[transitionKey("b1", "b2")]).toEqual(blend);
    expect(map[transitionKey("a3", "c1")]).toEqual(fade);
    expect(map[transitionKey("c1", "b1")]).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(6);
    expect(templateOf(st, { ...blend })?.id).toBe("vb");
    expect(templateOf(st, { preset: "gap" })).toBeNull();
  });
});

describe("templates: apply to the whole tanda / the whole night", () => {
  it("targets the joins of the same kind, in the tanda or the night", () => {
    expect(applyTargets(rows, 0, "tanda")).toEqual([0, 1]);
    expect(applyTargets(rows, 4, "tanda")).toEqual([4, 5]);
    expect(applyTargets(rows, 0, "night")).toEqual([0, 1, 4, 5]);
    expect(applyTargets(rows, 2, "night")).toEqual([2, 6]);
    expect(applyTargets(rows, 7, "night")).toEqual([]);
  });
  it("puts the edit on every target and leaves the rest; null takes them back to Auto", () => {
    const own = { [transitionKey("a3", "c1")]: { preset: "gap" as const, gapSec: 3 } };
    const next = withEditAt(own, rows, applyTargets(rows, 0, "night"), fade);
    expect(Object.keys(next).sort()).toEqual(
      [
        transitionKey("a1", "a2"),
        transitionKey("a2", "a3"),
        transitionKey("a3", "c1"),
        transitionKey("b1", "b2"),
        transitionKey("b2", "b3"),
      ].sort(),
    );
    expect(next[transitionKey("b2", "b3")]).toEqual(fade);
    expect(own).toEqual({ [transitionKey("a3", "c1")]: { preset: "gap", gapSec: 3 } });
    const back = withEditAt(next, rows, [0, 1], null);
    expect(back[transitionKey("a1", "a2")]).toBeUndefined();
    expect(back[transitionKey("b1", "b2")]).toEqual(fade);
  });
});
