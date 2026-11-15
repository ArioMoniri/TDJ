import { describe, expect, it } from "vitest";
import { autoSetName } from "./changes";
import { eraLabel, snapshotMeta, snapshotTitle } from "./history";
import { eraName, lengthText, nightSub, nightTitle } from "./nightName";
import type { Playlist } from "./types";

const p = (x: Partial<Playlist>) =>
  ({
    name: "Sunday milonga",
    options: { hours: 4, eras: ["golden"] },
    tandas: new Array(22).fill({}),
    stats: { durationSec: 4 * 3600 + 36 * 60 + 10 },
    ...x,
  }) as unknown as Playlist;

describe("one title, one era label, the actual length (wave 2, item 13)", () => {
  it("the length is what the night runs", () => {
    expect(lengthText(4 * 3600 + 36 * 60 + 10)).toBe("4 h 36 min");
    expect(lengthText(3 * 3600)).toBe("3 h");
    expect(lengthText(45 * 60)).toBe("45 min");
    expect(nightSub(p({}))).toBe("4 h 36 min · Golden Age");
  });
  it("one era label everywhere", () => {
    expect(eraName("golden")).toBe("Golden Age");
    expect(eraLabel(p({}))).toBe("Golden Age");
    expect(autoSetName({ hours: 4, eras: ["golden"] })).not.toMatch(/Golden/);
  });
  it("History, Share and the result header read the same title", () => {
    const night = p({ name: "Sunday milonga" });
    expect(nightTitle(night)).toBe("Sunday milonga");
    expect(snapshotTitle(night)).toBe("Sunday milonga");
    // an older name with its details after " · " keeps only the title
    expect(nightTitle(p({ name: "Golden 1935–45 · 4 h · Turkish cortinas · double peak" }))).toBe(
      "Golden 1935–45",
    );
    expect(snapshotMeta(night)).toBe("4 h 36 min · 22 tandas · Golden Age");
  });
  it("the auto name is the title alone (the day and the event)", () => {
    expect(autoSetName({ hours: 4, context: { event: "milonga", dayOfWeek: "sunday" } })).toBe(
      "Sunday milonga",
    );
    expect(autoSetName({ hours: 4, context: { event: "practica" } }, new Date("2026-11-17T20:00:00"))).toBe(
      "Tuesday práctica",
    );
  });
});
