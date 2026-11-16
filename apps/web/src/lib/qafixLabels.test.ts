/**
 * QA fix (2026-11), the featured night's labels in Compose: the header's era claims only what the night plays
 * ("mostly Golden Age 1935–1945" over sides from 1933 to 1963), one length everywhere (the night's music as it plays,
 * the same number the sidebar and "plays" print), a vocal tanda with an instrumental side reads "Vocal &
 * instrumental", a tango tanda with a vals in it carries "+ Vals", a duet reads in full.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modeWords, otherRhythms, tandaTypeWords } from "@/components/ui/TandaTypeBadge";
import { nightMusicSec } from "./lengths";
import { lengthText, nightEraLabel, nightSub } from "./nightName";
import type { Playlist } from "./types";

const featured = JSON.parse(
  readFileSync(new URL("../../public/featured/golden-double-peak.json", import.meta.url), "utf8"),
) as Playlist;

describe("the featured night's header", () => {
  it("says “mostly” when sides fall outside its year range (it never claims 1935–1945 alone)", () => {
    expect(nightEraLabel(featured)).toBe("mostly Golden Age 1935–1945");
    const inside = {
      options: { eras: ["golden"], yearRange: [1935, 1945] },
      tandas: [{ songs: [{ year: 1940 }, { year: 1941 }] }],
    };
    expect(nightEraLabel(inside)).toBe("Golden Age 1935–1945");
    const outside = {
      options: { eras: ["golden"], yearRange: [1935, 1945] },
      tandas: [{ songs: [{ year: 1950 }, { year: 1952 }, { year: 1940 }] }],
    };
    expect(nightEraLabel(outside)).toBe("1940–1952");
  });
  it("prints the same length as the sidebar and “plays” (the night's music)", () => {
    const sec = nightMusicSec(featured)!;
    expect(nightSub(featured, sec).startsWith(lengthText(sec))).toBe(true);
    // (before: the engine's planned 4 h 35 min beside "plays 4:37:07")
    expect(lengthText(sec)).toBe("4 h 37 min");
  });
});

describe("a tanda's type says what its sides are", () => {
  const t2 = featured.tandas[1]!;
  const t7 = featured.tandas[6]!;
  const t11 = featured.tandas[10]!;
  it("T2 Di Sarli with an instrumental side and T11 Federico ending instrumental: “Vocal & instrumental”", () => {
    for (const t of [t2, t11]) {
      expect(t.songs.some((s) => !s.vocal)).toBe(true);
      expect(modeWords({ vocal: t.vocal, singer: t.singer, songs: t.songs })).toBe("Vocal & instrumental");
    }
  });
  it("T7 Donato, a tango tanda with a vals: the “+ Vals” chip", () => {
    expect(t7.rhythm).toBe("tango");
    expect(otherRhythms(t7.rhythm, t7.songs)).toEqual(["vals"]);
    expect(
      tandaTypeWords({ rhythm: t7.rhythm, vocal: t7.vocal, singer: t7.singer, songs: t7.songs }),
    ).toMatch(/\+ Vals/);
  });
  it("a duet in full (De Angelis / Dante–Martel)", () => {
    const t9 = featured.tandas[8]!;
    expect(modeWords({ vocal: t9.vocal, singer: t9.singer })).toBe("Vocal · Carlos Dante & Julio Martel");
  });
});
