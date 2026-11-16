import { describe, expect, it } from "vitest";
import { deletePlan, isFeaturedEntry, protectedReason, restoreEntries, withoutEntries } from "./nightDelete";
import type { HistorySnapshot } from "./types";

const entry = (id: string, night = `n-${id}`, title = `Night ${id}`) =>
  ({
    id,
    title,
    createdAt: "2026-11-16T20:00:00Z",
    options: {},
    playlist: { id: night, name: title, tandas: [] },
    score: 90,
    source: "compose",
  }) as unknown as HistorySnapshot;

describe("deleting nights (lib/nightDelete.ts)", () => {
  const list = ["a", "b", "c", "d"].map((x) => entry(x));

  it("never the night the Booth has open: it is kept with the reason", () => {
    const booth = { id: "n-b", playing: true };
    expect(protectedReason(list[1]!, booth)).toMatch(/Booth/);
    expect(protectedReason(list[0]!, booth)).toBeNull();
    expect(protectedReason(list[0]!, null)).toBeNull();
    const plan = deletePlan(list, ["a", "b", "zz"], booth);
    expect(plan.go.map((h) => h.id)).toEqual(["a"]);
    expect(plan.kept.map((k) => k.entry.id)).toEqual(["b"]);
  });

  it("Undo puts them back where they were; a night made since stays on top", () => {
    const gone = new Set(["b", "d"]);
    const after = withoutEntries(list, gone);
    expect(after.map((h) => h.id)).toEqual(["a", "c"]);
    const fresh = entry("new");
    const back = restoreEntries([fresh, ...after], list, [list[1]!, list[3]!]);
    expect(back.map((h) => h.id)).toEqual(["new", "a", "b", "c", "d"]);
  });

  it("the featured night only leaves the recents", () => {
    expect(isFeaturedEntry(entry("f", "tdj-5j"))).toBe(true);
    expect(isFeaturedEntry(list[0]!)).toBe(false);
  });
});
