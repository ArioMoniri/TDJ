import { readFileSync } from "node:fs";
import { ERA_PRESETS } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { autoSetName } from "./changes";
import { coverData, coverEra, coverTitle, nightCoverSvg, nightHash } from "./cover";
import { FEATURED } from "./featured";
import { eraLabel, snapshotMeta, snapshotTitle } from "./history";
import { ERA_YEARS, eraName, lengthText, nightEraLabel, nightSub, nightTitle } from "./nightName";
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

/** a night with the given options and one tanda per list of song years (an opening and a closing set apart) */
const night = (options: Record<string, unknown>, years: number[][] = []) => ({
  name: "",
  options: { hours: 4, ...options },
  tandas: years.map((ys) => ({
    rhythm: "tango",
    songs: ys.map((year, i) => ({ id: `s${year}-${i}`, year })),
  })),
  opening: { id: "open", year: 1912 },
  closing: { id: "close", year: 1963 },
  stats: { durationSec: 4 * 3600 },
});
const featured = () =>
  JSON.parse(readFileSync(new URL("../../public/featured/golden-double-peak.json", import.meta.url), "utf8"));

describe("the era label follows the night, never Golden Age by default (owner: dynamic in the image and the title)", () => {
  const cases: Array<[string, ReturnType<typeof night>, string, string]> = [
    ["nuevo only", night({ eras: ["nuevo"] }), "Nuevo", "Nuevo"],
    [
      "golden + nuevo, in chronological order whatever the order chosen",
      night({ eras: ["nuevo", "golden"] }),
      "Golden Age + Nuevo",
      "Altın Çağ + Nuevo",
    ],
    [
      "three eras: the first to the last",
      night({ eras: ["nuevo", "guardia-vieja", "golden"] }),
      "Guardia Vieja → Nuevo",
      "Guardia Vieja → Nuevo",
    ],
    [
      "golden inside golden-extended reads as the wider one",
      night({ eras: ["golden", "golden-extended"] }),
      "Golden Age, extended",
      "Altın Çağ, geniş",
    ],
    [
      "a year range outside the era",
      night({ eras: ["golden"], yearRange: [1950, 1960] }),
      "1950–1960",
      "1950–1960",
    ],
    ["a year range with no era", night({ yearRange: [1950, 1960] }), "1950–1960", "1950–1960"],
    [
      "a year range inside the era",
      night({ eras: ["golden"], yearRange: [1935, 1945] }),
      "Golden Age 1935–1945",
      "Altın Çağ 1935–1945",
    ],
    [
      "no era, the songs 1955–1959: the post-golden label (1955 is the two eras' shared year)",
      night({}, [
        [1955, 1956, 1957],
        [1958, 1959, 1957],
      ]),
      "Post-golden",
      "Altın çağ sonrası",
    ],
    [
      "no era, mixed years: the years the songs span (the opening and closing left out)",
      night({ eras: [] }, [
        [1938, 1941, 1942],
        [1950, 1956, 1953],
      ]),
      "1938–1956",
      "1938–1956",
    ],
    ["no era, the songs all golden", night({}, [[1938, 1941, 1944]]), "Golden Age", "Altın Çağ"],
    ["all", night({ eras: ["all"] }), "All eras", "Tüm dönemler"],
    ["no era and no songs", night({}), "All eras", "Tüm dönemler"],
  ];
  for (const [what, n, en, tr] of cases)
    it(what, () => {
      expect(nightEraLabel(n, "en")).toBe(en);
      expect(nightEraLabel(n, "tr")).toBe(tr);
      // the sub-line, History and the cover read the same label
      expect(nightSub(n as never)).toBe(`4 h · ${en}`);
      expect(eraLabel(n as never)).toBe(en);
      expect(coverEra(coverData(n), "en")).toBe(en);
      expect(coverEra(coverData(n), "tr")).toBe(tr);
    });

  it("a nuevo night's cover never says Golden", () => {
    const n = night({ eras: ["nuevo"] }, [[1975, 1978, 1980]]);
    expect(snapshotMeta(n as never)).not.toMatch(/Golden/);
    for (const locale of ["en", "tr"] as const)
      for (const size of [640, "og"] as const) {
        const svg = nightCoverSvg(n, { size, locale });
        expect(svg).not.toMatch(/Golden|Altın/);
        // the era line is outlined, so compare with the same night labelled golden: the words differ
        expect(svg).not.toBe(
          nightCoverSvg({ ...n, options: { hours: 4, eras: ["golden"] } }, { size, locale }),
        );
      }
    // a night with no era and nuevo songs draws the nuevo line (it drew the golden one before)
    const none = night({}, [[1975, 1980]]);
    const asNuevo = night({ eras: ["nuevo"] }, [[1975, 1980]]);
    // (the two hashes differ by the first era, which also names the gradients: set them aside)
    const drawn = (x: unknown) => nightCoverSvg(x).split(nightHash(x)).join("#");
    expect(drawn(none)).toBe(drawn(asNuevo));
  });

  it("the cover keeps every era, the year range and the songs' years; its seed and hash do not move", () => {
    const n = night({ eras: ["golden", "nuevo"], yearRange: [1940, 1980] }, [[1941, 1975]]);
    const d = coverData(n);
    expect(d.eras).toEqual(["golden", "nuevo"]);
    expect(d.yearRange).toEqual([1940, 1980]);
    expect(d.songYears).toEqual([1941, 1975]);
    // the hash reads what it always read: an existing night's cover key is the one it had
    expect(nightHash(d)).toBe(nightHash({ ...d, eras: ["golden"], yearRange: null, songYears: [] }));
    // pinned to the shipped featured night: they move only when its songs do (round 25: Canaro valses, Gómez Llámale H)
    const f = featured();
    expect(coverData(f).seed).toBe("a20b7433");
    expect(nightHash(f)).toBe("949c32ee");
    expect(nightHash({ ...f, options: { ...f.options, eras: ["nuevo", "golden"] } })).toBe("cb63d9ee");
  });

  it("the featured night keeps the DJ's title, and its era comes from the same helper", () => {
    // pinned to the shipped featured night: they move only when its songs do (round 25: Canaro valses, Gómez Llámale H)
    const f = featured();
    expect(nightTitle(f)).toBe("Golden 1935–45");
    expect(coverTitle(coverData(f), "en")).toBe("Golden 1935–45");
    expect(nightEraLabel(f, "en")).toBe("Golden Age 1935–1945");
    expect(nightEraLabel(f, "tr")).toBe("Altın Çağ 1935–1945");
    expect(coverEra(coverData(f), "tr")).toBe("Altın Çağ 1935–1945");
    expect(FEATURED[0].sub).toContain("Golden Age 1935–1945");
  });

  it("the era years here are the engine's presets", () => {
    for (const [k, v] of Object.entries(ERA_YEARS)) expect(ERA_PRESETS[k]?.years).toEqual(v);
  });
});
