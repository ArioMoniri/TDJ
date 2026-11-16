import { describe, expect, it } from "vitest";
import { en } from "./i18n/en";
import { addSide, checkDraft, type DraftSide, draftOk, moveSide, removeSide } from "./tandaDraft";

const side = (id: string, o: Partial<DraftSide> = {}): DraftSide => ({
  id,
  title: `Song ${id}`,
  orchestra: "Carlos Di Sarli",
  orchestraId: "carlos-di-sarli",
  singer: null,
  vocal: false,
  year: 1941,
  rhythm: "tango",
  ...o,
});
const four = [side("a"), side("b", { year: 1942 }), side("c", { year: 1944 }), side("d", { year: 1945 })];
const bad = (xs: DraftSide[], rhythm = "tango", size = 4) =>
  checkDraft(xs, { rhythm, size })
    .filter((c) => !c.ok)
    .map((c) => c.key);

describe("the tanda the DJ builds: moves", () => {
  it("moves, removes and adds sides; a side is never there twice", () => {
    expect(moveSide(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveSide(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    const same = ["a", "b"];
    expect(moveSide(same, 1, 1)).toBe(same);
    expect(removeSide(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(addSide([side("a")], side("a"))).toHaveLength(1);
    expect(addSide([side("a")], side("b")).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("the live rule check", () => {
  it("a tanda of one orchestra, rhythm and voice with close years holds every rule", () => {
    expect(draftOk(checkDraft(four, { rhythm: "tango", size: 4 }))).toBe(true);
  });
  it("names each broken rule: another orchestra, another rhythm, two singers, far years, a title twice, the length", () => {
    expect(
      bad([
        ...four.slice(0, 3),
        side("x", { orchestra: "Osvaldo Pugliese", orchestraId: "osvaldo-pugliese" }),
      ]),
    ).toEqual(["orchestra"]);
    expect(bad([...four.slice(0, 3), side("v", { rhythm: "vals" })])).toEqual(["rhythm"]);
    expect(bad(four, "vals")).toEqual(["rhythm"]);
    expect(
      bad([
        side("a", { vocal: true, singer: "Roberto Rufino" }),
        side("b", { vocal: true, singer: "Alberto Podestá" }),
        side("c", { vocal: true, singer: "Roberto Rufino" }),
        side("d", { vocal: true, singer: "Roberto Rufino" }),
      ]),
    ).toEqual(["voice"]);
    expect(bad([...four.slice(0, 3), side("s", { vocal: true, singer: "Roberto Rufino" })])).toEqual([
      "voice",
    ]);
    expect(bad([...four.slice(0, 3), side("y", { year: 1952 })])).toEqual(["years"]);
    expect(bad([...four.slice(0, 3), side("z", { title: "Song a" })])).toEqual(["repeat"]);
    expect(bad(four.slice(0, 3))).toEqual(["size"]);
    expect(bad([])).toEqual(["size"]);
  });
  it("every line it can show has words in English", () => {
    const keys = new Set<string>();
    for (const xs of [
      four,
      [],
      [
        side("a", { vocal: true, singer: "X" }),
        side("b", { orchestra: "Y", rhythm: "vals", year: 1960, title: "Song a" }),
      ],
    ])
      for (const c of checkDraft(xs, { rhythm: "tango", size: 4 })) keys.add(c.msg);
    for (const k of ["tandaSwap.rule_one_singer", "tandaSwap.rule_singers"]) keys.add(k);
    for (const k of keys) expect(en).toHaveProperty([k]);
  });
});
