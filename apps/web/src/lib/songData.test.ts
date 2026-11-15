import type { Song } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { bpmChoice, bpmValues, normaliseBpm } from "./songData";

const side = (x: Partial<Song>): Song => ({ id: "x", title: "X", rhythm: "tango", ...x }) as unknown as Song;
const audio = (bpm: number) => ({ bpm }) as unknown as Song["audio"];

describe("one BPM per song (wave 2, item 3)", () => {
  it("priority: the DJ's edit, then the analysed preview, then a source, then the estimate", () => {
    const s = side({ bpm: 128, audio: audio(144), tempo: { bpm: 139, source: "deezer" } });
    expect(bpmChoice(s)!.used.label).toBe("Analysed preview");
    expect(bpmChoice(s)!.value).toBe(144);
    expect(bpmChoice(s, null, { bpm: 130 })!.value).toBe(130);
    expect(bpmChoice(side({ bpm: 128, tempo: { bpm: 139, source: "deezer" } }))!.used.label).toBe("Deezer");
    expect(bpmChoice(side({ bpm: 128 }))!.used.label).toBe("Catalogue estimate");
    expect(bpmChoice(side({}))).toBeNull();
  });
  it("the key chip's 144 and the row's 139 become one number", () => {
    const s = side({ audio: audio(144), tempo: { bpm: 139, source: "deezer" } });
    const c = bpmChoice(s)!;
    expect(c.value).toBe(144);
    // every value is listed with its source, the used one marked
    expect(c.all.map((v) => [v.label, Math.round(v.raw), v.used])).toEqual([
      ["Analysed preview", 144, true],
      ["Deezer", 139, false],
    ]);
  });
  it("half and double time: 165 and 83 are the same tango tempo; 99 is not", () => {
    // 82.5 falls under the tango range and 165 over it: 165 is the nearer octave (the catalogue convention)
    expect(normaliseBpm(82.5, "tango")).toBeCloseTo(165);
    expect(normaliseBpm(66, "tango")).toBeCloseTo(132);
    const same = bpmChoice(side({ audio: audio(83), tempo: { bpm: 165, source: "deezer" } }))!;
    const dz = same.all.find((v) => v.label === "Deezer")!;
    expect(dz.agrees).toBe(true);
    expect(dz.halfDouble).toBe(true);
    expect(same.note).toMatch(/double speed/);
    const apart = bpmChoice(side({ audio: audio(99), tempo: { bpm: 165, source: "deezer" } }))!;
    expect(apart.value).toBe(99);
    expect(apart.all.find((v) => v.label === "Deezer")!.agrees).toBe(false);
    expect(apart.note).toMatch(/Deezer says 165 \(83 at this beat level\)/);
  });
  it("a vals counted at half speed is folded into the vals range before it is shown", () => {
    expect(bpmChoice(side({ rhythm: "vals", audio: audio(93) }))!.value).toBe(186);
    expect(bpmChoice(side({ rhythm: "milonga", audio: audio(230) }))!.value).toBe(115);
  });
  it("lists each source once", () => {
    const vs = bpmValues(side({ bpm: 120, tempo: { bpm: 120, source: "index" } }));
    expect(vs).toHaveLength(1);
  });
});
