import { describe, expect, it } from "vitest";
import { changeLabel, historyAfter, makeSnapshot, restoreVersion, SOURCE_WORDS, versionsOf } from "./history";
import type { HistorySnapshot, Playlist } from "./types";

/** a night small enough to read: `n` marks which version it is (its score and its first song) */
function night(n: number, id = "night-1"): Playlist {
  return {
    id,
    name: "Sunday milonga",
    createdAt: "2026-11-15T20:00:00.000Z",
    options: { hours: 4, eras: ["golden"], seed: 1, arc: "classic-two-peaks" },
    tandas: [{ index: 0, songs: [{ id: `s${n}`, title: `Song ${n}` }], energy: 50, targetEnergy: 50 }],
    closing: null,
    score: { total: 80 + n, factors: [], verdict: "" },
    stats: { durationSec: 4 * 3600, orchestras: {} },
  } as unknown as Playlist;
}

describe("History: one entry per night, its edits kept inside it (wave 2)", () => {
  it("compose, a chip, five AI edits and a swap: one entry, eight versions, one current", () => {
    let list: HistorySnapshot[] = [];
    let current: string | null = null;
    const step = (ev: Parameters<typeof historyAfter>[2]) => {
      const r = historyAfter(list, current, ev);
      list = r.list;
      current = r.currentId;
    };
    step({ kind: "new", snap: makeSnapshot(night(0), {}, "compose") });
    step({ kind: "edit", playlist: night(1), label: "Calmer", options: {} });
    for (let k = 2; k <= 6; k++)
      step({ kind: "edit", playlist: night(k), label: `“make tanda ${k} calmer”`, options: {} });
    step({ kind: "edit", playlist: night(7), label: "Changed a song", options: {} });
    expect(list).toHaveLength(1);
    const e = list[0]!;
    expect(current).toBe(e.id);
    expect(e.score).toBe(87);
    expect(changeLabel(e)).toBe("Changed a song");
    const vs = versionsOf(e);
    expect(vs).toHaveLength(8);
    expect(vs.filter((v) => v.current)).toHaveLength(1);
    expect(vs.map((v) => v.label)).toEqual([
      "Changed a song",
      "“make tanda 6 calmer”",
      "“make tanda 5 calmer”",
      "“make tanda 4 calmer”",
      "“make tanda 3 calmer”",
      "“make tanda 2 calmer”",
      "Calmer",
      "Composed",
    ]);
    // a version's night is the one it was
    expect(vs.at(-1)!.playlist.tandas[0]!.songs[0]!.id).toBe("s0");
  });

  it("a new compose is a new entry and the only current one", () => {
    let r = historyAfter([], null, { kind: "new", snap: makeSnapshot(night(0, "a"), {}, "compose") });
    r = historyAfter(r.list, r.currentId, {
      kind: "edit",
      playlist: night(1, "a"),
      label: "Calmer",
      options: {},
    });
    const first = r.currentId;
    r = historyAfter(r.list, r.currentId, { kind: "new", snap: makeSnapshot(night(2, "b"), {}, "compose") });
    expect(r.list).toHaveLength(2);
    expect(r.currentId).not.toBe(first);
    expect(r.list[0]!.id).toBe(r.currentId);
    expect(r.list[1]!.versions).toHaveLength(1);
  });

  it("restoring a version makes it current and keeps the one it replaces", () => {
    let r = historyAfter([], null, { kind: "new", snap: makeSnapshot(night(0), {}, "compose") });
    r = historyAfter(r.list, r.currentId, { kind: "edit", playlist: night(1), label: "Calmer", options: {} });
    const e = r.list[0]!;
    const composed = e.versions![0]!;
    const back = restoreVersion(e, composed.id)!;
    expect(back.score).toBe(80);
    expect(back.change).toBe("Back to “Composed”");
    expect(versionsOf(back).map((v) => v.label)).toEqual(["Back to “Composed”", "Calmer", "Composed"]);
  });

  it("an edit with no current entry starts one, labelled", () => {
    const r = historyAfter([], null, {
      kind: "edit",
      playlist: night(3),
      label: "Changed a song",
      options: {},
    });
    expect(r.list).toHaveLength(1);
    expect(changeLabel(r.list[0]!)).toBe("Changed a song");
  });

  it("the stored tags read as plain words", () => {
    expect(SOURCE_WORDS.swap).toBe("Changed a song");
    expect(SOURCE_WORDS.refine).toBe("Adjusted");
    for (const w of Object.values(SOURCE_WORDS)) expect(w).not.toMatch(/^(swap|refine|compose)$/);
  });
});
