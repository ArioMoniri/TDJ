import { describe, expect, it } from "vitest";
import type { Playlist } from "@/lib/types";
import { sameSetEdits } from "./remount";

const night = (o: Partial<Playlist> = {}): Playlist =>
  ({
    id: "n1",
    name: "Night",
    createdAt: "2026-11-16T20:00:00.000Z",
    options: {},
    tandas: [{ index: 0, songs: [{ id: "a" }, { id: "b" }] }],
    stats: { durationSec: 100 },
    score: { total: 90, factors: [], verdict: "" },
    ...o,
  }) as unknown as Playlist;

describe("sameSetEdits (the Booth page mounted again mid-night)", () => {
  it("the Booth's copy (its plan's times, settings and stats) is the same set as the app's", () => {
    const app = night({ booth: { settings: { gapSec: 2 }, items: [], wallClockSec: 0 } as never });
    const booth = night({
      booth: { settings: { gapSec: 3 }, items: [{ n: 1 }], wallClockSec: 99 } as never,
      stats: { durationSec: 4321 } as never,
    });
    expect(sameSetEdits(booth, app)).toBe(true);
    expect(sameSetEdits(booth, night())).toBe(true);
  });
  it("a swap, a reorder, a bypass or a Booth edit made elsewhere is a change", () => {
    const base = night();
    expect(
      sameSetEdits(base, night({ tandas: [{ index: 0, songs: [{ id: "b" }, { id: "a" }] }] as never })),
    ).toBe(false);
    expect(
      sameSetEdits(
        base,
        night({ tandas: [{ index: 0, bypass: true, songs: [{ id: "a" }, { id: "b" }] }] as never }),
      ),
    ).toBe(false);
    expect(
      sameSetEdits(
        base,
        night({
          booth: { settings: {}, items: [], wallClockSec: 0, songCues: { a: { inSec: 3 } } } as never,
        }),
      ),
    ).toBe(false);
    expect(sameSetEdits(base, night({ id: "n2" }))).toBe(false);
  });
});
