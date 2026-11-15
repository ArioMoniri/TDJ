import { describe, expect, it } from "vitest";
import { addSongsTo, type Draft, type DraftSong, moveAligned, moveSong, newTanda } from "./build";
import { cycleText, guideLines } from "./buildGuide";

const side = (id: string, o = "carlos-di-sarli", rhythm = "tango"): DraftSong => ({
  id,
  title: id,
  orchestra: o,
  orchestraId: o,
  singer: null,
  singerId: null,
  vocal: false,
  year: 1940,
  rhythm: rhythm as DraftSong["rhythm"],
  energy: 60,
  fame: 1,
});
const plan = {
  minutes: 240,
  slots: ["tango", "tango", "vals", "tango", "tango", "milonga"].map((rhythm, i) => ({
    rhythm,
    targetEnergy: [55, 60, 62, 66, 70, 72][i]!,
  })),
  bigFour: ["carlos-di-sarli", "juan-d-arienzo", "anibal-troilo", "osvaldo-pugliese"],
};

describe("the guided builder's draft edits", () => {
  it("adds sides to the selected tanda, or starts a new one; never a side twice", () => {
    const d: Draft = [[side("a")], [side("b", "anibal-troilo")]];
    expect(addSongsTo(d, 0, [side("c"), side("a")])[0]!.map((s) => s.id)).toEqual(["a", "c"]);
    expect(addSongsTo(d, 7, [side("x")])).toHaveLength(3);
    expect(newTanda(d, [side("x"), side("y")], 1).map((t) => t[0]!.id)).toEqual(["a", "x", "b"]);
    expect(newTanda(d, [side("a")])).toBe(d);
  });
  it("moves a side inside its tanda, and a per-tanda list with a tanda", () => {
    const d: Draft = [[side("a"), side("b"), side("c"), side("d")]];
    expect(moveSong(d, 0, 3, 0)[0]!.map((s) => s.id)).toEqual(["d", "a", "b", "c"]);
    expect(moveSong(d, 0, 0, 9)).toBe(d);
    expect(moveAligned(["c1", null, "c3"], 0, 2)).toEqual([null, "c3", "c1"]);
  });
});

describe("the guidance lines", () => {
  it("the rhythm cycle reads in threes", () => {
    expect(cycleText(["tango", "tango", "vals", "tango", "tango", "milonga"])).toBe("TTV TTM");
  });
  it("short of the target: Fill the rest; the big four missing: add one; the cycle asks for a vals", () => {
    const lines = guideLines(
      [
        { rhythm: "tango", orchestraId: "carlos-di-sarli", energy: 56 },
        { rhythm: "tango", orchestraId: "miguel-calo", energy: 61 },
      ],
      plan,
      { minutes: 24, cortinas: [null] },
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.length!.ok).toBe(false);
    expect(by.length!.fix).toEqual({ kind: "fill" });
    expect(by.bigfour!.vals.have).toBe(1);
    expect(by.bigfour!.fix).toEqual({ kind: "orchestra", id: "juan-d-arienzo" });
    expect(by.energy!.ok).toBe(true);
    expect(by.cycle!.ok).toBe(true);
    expect(by.cycle!.fix).toEqual({ kind: "rhythm", rhythm: "vals" });
    expect(by.cortinas!.vals).toMatchObject({ picked: 0, auto: 1 });
  });
  it("a tanda off the cycle, one far off its energy, too long a night", () => {
    const lines = guideLines(
      [
        { rhythm: "tango", orchestraId: "carlos-di-sarli", energy: 56 },
        { rhythm: "milonga", orchestraId: "juan-d-arienzo", energy: 90 },
      ],
      plan,
      { minutes: 300, cortinas: [] },
    );
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.length!.fix).toEqual({ kind: "remove-last" });
    expect(by.cycle!.ok).toBe(false);
    expect(by.cycle!.vals.n).toBe(2);
    expect(by.cycle!.fix).toEqual({ kind: "rhythm", rhythm: "tango" });
    expect(by.energy!.ok).toBe(false);
    expect(by.energy!.vals).toMatchObject({ n: 2, dir: "hot" });
  });
  it("one tanda: no cortina line yet", () => {
    const lines = guideLines([{ rhythm: "tango", orchestraId: "x", energy: 55 }], plan, {
      minutes: 12,
      cortinas: [],
    });
    expect(lines.some((l) => l.key === "cortinas")).toBe(false);
  });
});
