/**
 * 2026-11 — "Sexteto Cristal is not in the database or the library": the contemporary-orchestra importer
 * (scripts/import_orchestra.ts, `pnpm orchestra:import "Sexteto Cristal"`) and what it adds to the catalogue. The
 * importer's rules (rhythm, dedupe, ids, singer) are pure and tested here; the committed import is checked through
 * the loaded catalogue, the Library search, the Database's orchestra list and the composer's era filter.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSUMED_NOTE,
  classicRhythms,
  dedupeRecordings,
  type FoundTrack,
  rhythmFor,
  sideId,
  singerOf,
  slug,
  titleCase,
  toSide,
  uniqueSideId,
} from "../../../scripts/import_orchestra";
import { compose, type EraPreset, searchSongs } from "../src/index";
import { loadCatalog } from "../src/load";
import { ERA_PRESETS } from "../src/profiles";

const track = (over: Partial<FoundTrack>): FoundTrack => ({
  uri: "spotify:track:0000000000000000000000",
  title: "X",
  artists: ["Sexteto Cristal"],
  durationMs: 160_000,
  album: "A",
  albumUri: "spotify:album:a",
  albumType: "album",
  release: "2018-05-01",
  playable: true,
  ...over,
});

describe("the importer's rules", () => {
  const classic = classicRhythms(
    [
      { title: "Desde el Alma", rhythm: "vals", orchestraId: "a" },
      { title: "Desde el alma", rhythm: "vals", orchestraId: "b" },
      { title: "Desde el Alma", rhythm: "tango", orchestraId: "c" },
      { title: "Milonga de Mis Amores", rhythm: "milonga", orchestraId: "a" },
      { title: "Ríe Payaso", rhythm: "tango", orchestraId: "a" },
      { title: "Empate", rhythm: "vals", orchestraId: "a" },
      { title: "Empate", rhythm: "tango", orchestraId: "b" },
      { title: "Own Title", rhythm: "vals", orchestraId: "sexteto-cristal" },
    ],
    "sexteto-cristal",
  );

  it("rhythm: the classic repertoire's rhythm for the title, accent- and case-insensitive", () => {
    expect(rhythmFor("Desde el alma", null, classic)).toEqual({ rhythm: "vals", how: "classic" });
    expect(rhythmFor("MILONGA DE MIS AMORES", null, classic)).toEqual({ rhythm: "milonga", how: "classic" });
    expect(rhythmFor("Rie payaso", null, classic)).toEqual({ rhythm: "tango", how: "classic" });
  });
  it("rhythm: else the title or album words, else tango assumed (a tie or the orchestra's own rows are no evidence)", () => {
    expect(rhythmFor("Vals del recuerdo", null, classic)).toEqual({ rhythm: "vals", how: "title" });
    expect(rhythmFor("La milonga que hacía falta", null, classic)).toEqual({
      rhythm: "milonga",
      how: "title",
    });
    expect(rhythmFor("Nuevo", "Milongas de hoy", classic)).toEqual({ rhythm: "milonga", how: "album" });
    expect(rhythmFor("Empate", null, classic)).toEqual({ rhythm: "tango", how: "assumed" });
    expect(rhythmFor("Own Title", null, classic)).toEqual({ rhythm: "tango", how: "assumed" });
    const side = toSide(
      track({ title: "Viento Norte" }),
      "Sexteto Cristal",
      classic,
      () => false,
      "t",
      "2026-11-15T00:00:00Z",
    );
    expect(side.song.rhythm).toBe("tango");
    expect(side.song.notes).toContain(ASSUMED_NOTE);
  });
  it("dedupe: one recording on two releases (same title, within 2 s) is kept once, from the original release", () => {
    const orig = track({
      uri: "spotify:track:orig",
      title: "Mentira",
      release: "2018-05-01",
      durationMs: 168_671,
    });
    const comp = track({
      uri: "spotify:track:comp",
      title: "Mentira",
      release: "2021-01-01",
      albumType: "compilation",
      albumUri: "spotify:album:c",
      durationMs: 169_900,
    });
    const other = track({
      uri: "spotify:track:other",
      title: "Mentira",
      release: "2022-01-01",
      durationMs: 190_000,
    });
    const { kept, dropped } = dedupeRecordings([comp, other, orig]);
    expect(kept.map((t) => t.uri).sort()).toEqual(["spotify:track:orig", "spotify:track:other"]);
    expect(dropped.map((t) => t.uri)).toEqual(["spotify:track:comp"]);
  });
  it("ids: sha1(title|orchestra|singer|uri) cut to 10, re-hashed on a collision", () => {
    const want = createHash("sha1")
      .update("Caricias|Sexteto Cristal|Guillermo Rozenthuler|spotify:track:x")
      .digest("hex");
    expect(sideId("Caricias", "Sexteto Cristal", "Guillermo Rozenthuler", "spotify:track:x")).toBe(
      want.slice(0, 10),
    );
    const first = sideId("Caricias", "Sexteto Cristal", null, "spotify:track:x");
    const id = uniqueSideId("Caricias", "Sexteto Cristal", null, "spotify:track:x", (i) => i === first);
    expect(id).not.toBe(first);
    expect(id).toHaveLength(10);
  });
  it("singer: the performer credited beside the orchestra; none → instrumental", () => {
    expect(singerOf(["Sexteto Cristal", "Guillermo Rozenthuler"], "Sexteto Cristal")).toBe(
      "Guillermo Rozenthuler",
    );
    expect(singerOf(["Sexteto Cristal"], "Sexteto Cristal")).toBeNull();
    const s = toSide(
      track({ title: "El amanacer" }),
      "Sexteto Cristal",
      classic,
      () => false,
      "t",
      "2026-11-15T00:00:00Z",
    );
    expect(s.song).toMatchObject({
      vocal: false,
      singer: null,
      era: "contemporary",
      year: 2018,
      source: "orchestra-import",
    });
    expect(slug("Sexteto Cristal")).toBe("sexteto-cristal");
    expect(titleCase("la vida es una milonga")).toBe("La Vida Es una Milonga");
    expect(titleCase("S.O.S.")).toBe("S.O.S.");
  });
});

describe("Sexteto Cristal in the catalogue", () => {
  let deps: ReturnType<typeof loadCatalog>;
  beforeAll(() => {
    deps = loadCatalog();
  }, 600000);
  const mine = () => deps.catalog.songs.filter((s) => s.orchestraId === "sexteto-cristal");

  it("the loaded catalogue holds its sides: contemporary, dated, with valid Spotify track uris", () => {
    const sides = mine();
    expect(sides.length).toBeGreaterThanOrEqual(20);
    expect(new Set(sides.map((s) => s.id)).size).toBe(sides.length);
    for (const s of sides) {
      expect(s.era).toBe("contemporary");
      expect(s.source).toBe("orchestra-import");
      expect(s.year).toBeGreaterThanOrEqual(2018);
      expect(["tango", "vals", "milonga"]).toContain(s.rhythm);
      expect(s.spotify?.uri).toMatch(/^spotify:track:[A-Za-z0-9]{22}$/);
      expect(s.spotify?.durationMs).toBeGreaterThan(90_000);
    }
    for (const r of ["tango", "vals", "milonga"]) expect(sides.some((s) => s.rhythm === r)).toBe(true);
    expect(sides.some((s) => s.singer === "Guillermo Rozenthuler" && s.vocal)).toBe(true);
    expect(sides.some((s) => !s.vocal && s.singer === null)).toBe(true);
  });
  it("every imported side (any orchestra) is contemporary, dated from its release, and outside the listado's 2008 check", () => {
    const added = JSON.parse(
      readFileSync(new URL("../../../data/knowledge/added_songs.json", import.meta.url), "utf8"),
    ) as {
      songs: Array<{ id: string; source?: string; era: string; year: number | null; release?: string }>;
    };
    const imported = added.songs.filter((s) => s.source === "orchestra-import");
    expect(imported.length).toBeGreaterThanOrEqual(mine().length);
    const byId = new Map(deps.catalog.songs.map((s) => [s.id, s]));
    for (const raw of imported) {
      expect(raw.era).toBe("contemporary");
      expect(raw.release).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
      expect(raw.year).toBe(Number(raw.release!.slice(0, 4)));
      const loaded = byId.get(raw.id);
      expect(loaded?.era).toBe("contemporary");
      expect(loaded?.year).toBe(raw.year);
      expect(loaded?.source).toBe("orchestra-import");
    }
  });
  it("the Library search and the Database's orchestra list find it", () => {
    expect(deps.catalog.search("Sexteto Cristal", 100).length).toBe(mine().length);
    expect(searchSongs(deps.catalog.songs, { orchestra: "Sexteto Cristal", limit: 100 }).length).toBe(
      mine().length,
    );
    expect(searchSongs(deps.catalog.songs, { text: "cristal", limit: 100 }).length).toBeGreaterThan(0);
    expect(deps.catalog.byOrchestra.get("sexteto-cristal")?.length).toBe(mine().length);
  });
  it("the composer's era filters: never on a golden-era night; the contemporary eras can draw it", () => {
    for (const eras of [["golden"], ["golden-extended"]] as EraPreset[][])
      for (const seed of [1, 2]) {
        const p = compose({ hours: 4, seed, eras }, deps);
        expect(p.tandas.length).toBeGreaterThan(10);
        expect(p.tandas.some((t) => t.orchestraId === "sexteto-cristal")).toBe(false);
      }
    const pool = deps.catalog.songs.filter(
      (s) => s.orchestraId === "sexteto-cristal" && ERA_PRESETS.contemporary!.eras.includes(s.era),
    );
    expect(pool.length).toBe(mine().length);
    const drawn = [1, 2, 3].flatMap((seed) =>
      compose({ hours: 4, seed, eras: ["contemporary"] }, deps).tandas.filter(
        (t) => t.orchestraId === "sexteto-cristal",
      ),
    );
    expect(drawn.length).toBeGreaterThan(0);
  });
});
