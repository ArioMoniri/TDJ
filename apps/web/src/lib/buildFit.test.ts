import { describe, expect, it } from "vitest";
import { addSongsAt, type DraftSong, draftFit } from "./build";

describe("Build by hand: a version against the tanda it would join (2026-11)", () => {
  const side = (id: string, o: Partial<DraftSong> = {}): DraftSong =>
    ({
      id,
      title: id,
      orchestra: "Carlos Di Sarli",
      orchestraId: "carlos-di-sarli",
      singer: "Roberto Rufino",
      singerId: "roberto-rufino",
      vocal: true,
      year: 1941,
      rhythm: "tango",
      durationSec: 180,
      ...o,
    }) as DraftSong;
  it("says the orchestra, the singer, the years and the tanda's length — information, not a gate", () => {
    const t = [side("a"), side("b", { year: 1942 })];
    const f = draftFit(t, side("c", { singer: "Alberto Podestá", singerId: "podesta", year: 1944 }));
    expect(f.orchestra).toBe("same");
    expect(f.singer).toBe("differs");
    expect(f.singers).toEqual(["Alberto Podestá", "Roberto Rufino"]);
    expect(f.years).toEqual([1941, 1944]);
    expect(f.totalSec).toBe(540);
    expect(draftFit([], side("x")).orchestra).toBe("none");
    expect(draftFit(t, side("y", { orchestraId: "juan-d-arienzo" })).orchestra).toBe("differs");
    expect(draftFit(t, side("z", { vocal: false, singer: null })).singer).toBe("voice");
  });
  it("a side goes in at a place; one already in the night is skipped", () => {
    const d = [[side("a"), side("b")]];
    expect(addSongsAt(d, 0, 1, [side("c")])[0]!.map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(addSongsAt(d, 0, 0, [side("a")])).toBe(d);
  });
});
