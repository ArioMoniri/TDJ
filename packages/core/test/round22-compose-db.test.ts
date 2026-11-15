/**
 * Round 22 — Compose and Database invariants (docs/ROADMAP.md "Round 22 onward" §2, §3, §4, §12), written before the
 * modules: the song search (filters, where each side sits in tonight's night), adding a side, the era indicator (the
 * user's heatmap grades as best / good / weak / outside, the DJ's grade edits winning over the shipped defaults),
 * scraped data (stored with its source, refreshed when the source changes, the DJ's edit always winning), the missing
 * fields a fill run asks the sources for, a tone per tanda and every version of a title together.
 */
import { describe, expect, it } from "vitest";
import {
  addSide,
  bestYears,
  type CoverageRow,
  DEFAULT_HEATMAP,
  eraMark,
  Heatmap,
  mergeCoverage,
  mergeScraped,
  missingFields,
  needsRefresh,
  type Playlist,
  placements,
  type ScrapedRecord,
  type Song,
  scrapedCaches,
  searchSongs,
  songData,
  songEra,
  tandaTone,
  versionsOf,
  yearRanges,
} from "../src/index";

let n = 0;
const song = (p: Partial<Song> = {}): Song => ({
  id: `s${++n}`,
  title: "Corazón",
  rhythm: "tango",
  orchestra: "Carlos Di Sarli",
  orchestraId: "carlos-di-sarli",
  singer: "Roberto Rufino",
  singerId: "roberto-rufino",
  vocal: true,
  year: 1939,
  era: "golden-early",
  ...p,
});

const SONGS: Song[] = [
  song({ id: "a", title: "Corazón", year: 1939, fame: 4 }),
  song({
    id: "b",
    title: "Corazón",
    orchestra: "Juan D'Arienzo",
    orchestraId: "juan-d-arienzo",
    singer: null,
    singerId: null,
    vocal: false,
    year: 1950,
  }),
  song({ id: "c", title: "Milonga Vieja Milonga", rhythm: "milonga", year: 1941 }),
  song({
    id: "d",
    title: "Corazón de Oro",
    rhythm: "vals",
    orchestra: "Francisco Canaro",
    orchestraId: "francisco-canaro",
    singer: null,
    singerId: null,
    vocal: false,
    year: 1938,
  }),
  song({ id: "e", title: "Bahía Blanca", singer: null, singerId: null, vocal: false, year: 1957 }),
  song({ id: "f", title: "Lo Pasado Pasó", singer: "Jorge Durán", singerId: "jorge-duran", year: 1945 }),
];

const tanda = (i: number, songs: Song[], phase: "warmup" | "build" | "peak" = "build") => ({
  index: i,
  rhythm: songs[0]!.rhythm as "tango",
  orchestra: songs[0]!.orchestra,
  orchestraId: songs[0]!.orchestraId,
  singer: songs[0]!.singer,
  vocal: songs[0]!.vocal,
  yearRange: [1939, 1945] as [number, number],
  era: "golden-early" as const,
  songs,
  energy: 50,
  energyCurve: songs.map(() => 50),
  targetEnergy: 50,
  phase,
  durationSec: songs.length * 170,
  cortina: null,
});
const NIGHT = {
  name: "Test",
  tandas: [tanda(0, [SONGS[0]!, SONGS[5]!], "warmup"), tanda(1, [SONGS[2]!], "peak")],
  opening: null,
  closing: null,
} as unknown as Playlist;

describe("song search: filters and where each side sits tonight", () => {
  it("finds by title, orchestra and singer words in any order, accent-blind", () => {
    const hits = searchSongs(SONGS, { text: "corazon sarli" });
    expect(hits.map((h) => h.song.id)).toEqual(["a"]);
    expect(searchSongs(SONGS, { text: "rufino" }).map((h) => h.song.id)).toContain("c");
  });
  it("filters by orchestra, singer, a year range and rhythm", () => {
    expect(searchSongs(SONGS, { orchestra: "arienzo" }).map((h) => h.song.id)).toEqual(["b"]);
    expect(searchSongs(SONGS, { singer: "duran" }).map((h) => h.song.id)).toEqual(["f"]);
    expect(searchSongs(SONGS, { singer: "instrumental" }).every((h) => !h.song.singer)).toBe(true);
    const y = searchSongs(SONGS, { yearFrom: 1939, yearTo: 1941 });
    expect(y.every((h) => (h.song.year ?? 0) >= 1939 && (h.song.year ?? 0) <= 1941)).toBe(true);
    expect(y.length).toBe(2);
    expect(searchSongs(SONGS, { rhythms: ["vals"] }).map((h) => h.song.id)).toEqual(["d"]);
    expect(searchSongs(SONGS, { rhythms: ["milonga", "vals"] }).length).toBe(2);
  });
  it("a title that starts with the words ranks first", () => {
    const hits = searchSongs(SONGS, { text: "corazon" });
    expect(hits[0]!.song.title.startsWith("Corazón")).toBe(true);
    expect(hits.map((h) => h.song.id)).toContain("d");
  });
  it("each hit says which tanda, chair and part of the night it is in", () => {
    const hits = searchSongs(SONGS, { text: "lo pasado" }, NIGHT);
    expect(hits[0]!.placement).toMatchObject({ tanda: 0, track: 1, phase: "warmup" });
    expect(hits[0]!.placement!.label).toBe("Tanda 1 · song 2 · warm-up");
    const free = searchSongs(SONGS, { text: "bahia" }, NIGHT);
    expect(free[0]!.placement).toBeUndefined();
    expect(placements(NIGHT).get("c")!.label).toBe("Tanda 2 · song 1 · peak");
  });
  it("only in tonight's night, and a limit", () => {
    expect(
      searchSongs(SONGS, { inNight: true }, NIGHT)
        .map((h) => h.song.id)
        .sort(),
    ).toEqual(["a", "c", "f"]);
    expect(searchSongs(SONGS, { rhythms: ["tango"], limit: 2 }).length).toBe(2);
  });
  it("no filters at all returns nothing (the panel asks for a word or a filter first)", () => {
    expect(searchSongs(SONGS, {})).toEqual([]);
  });
});

describe("add a side to a tanda", () => {
  it("appends, re-times and pins the tanda as the DJ's", () => {
    const deps = { catalog: { songs: SONGS } } as never;
    const r = addSide(NIGHT, 0, "e", deps);
    expect(r.playlist.tandas[0]!.songs.map((s) => s.id)).toEqual(["a", "f", "e"]);
    expect(r.playlist.tandas[0]!.durationSec).toBeGreaterThan(NIGHT.tandas[0]!.durationSec);
    expect(r.playlist.tandas[0]!.pinned?.by).toBe("dj");
    expect(NIGHT.tandas[0]!.songs.length).toBe(2);
  });
  it("refuses a side already in the night and an unknown id", () => {
    const deps = { catalog: { songs: SONGS } } as never;
    expect(addSide(NIGHT, 0, "c", deps).reason).toMatch(/already/);
    expect(addSide(NIGHT, 0, "zz", deps).playlist).toBe(NIGHT);
  });
});

describe("era indicator: the user's heatmap as best / good / weak / outside", () => {
  it("grades map to marks; no cell in a graded orchestra is outside; an ungraded orchestra has no badge", () => {
    expect(eraMark(4, true)).toBe("best");
    expect(eraMark(3, true)).toBe("good");
    expect(eraMark(2, true)).toBe("weak");
    expect(eraMark(1, true)).toBe("weak");
    expect(eraMark(0, true)).toBe("outside");
    expect(eraMark(undefined, true)).toBe("outside");
    expect(eraMark(undefined, false)).toBeUndefined();
  });
  it("songEra reads the shipped heatmap (Di Sarli instrumental 1955 differs from 1925)", () => {
    const di = song({ orchestraId: "carlos-di-sarli", vocal: false, singer: null, year: 1955 });
    const e = songEra(di, DEFAULT_HEATMAP);
    expect(e).toBeDefined();
    expect(["best", "good", "weak", "outside"]).toContain(e!.mark);
    expect(songEra(song({ orchestraId: "nobody-x" }), DEFAULT_HEATMAP)).toBeUndefined();
    expect(songEra(song({ year: null }), DEFAULT_HEATMAP)).toBeUndefined();
  });
  it("the DJ's grade edits win over the shipped defaults, a null clears a cell, other cells stay", () => {
    const rows: CoverageRow[] = [
      { orchestraId: "o1", instrumental: { "1940": 4, "1941": 3 }, vocal: { "1940": 2 } },
      { orchestraId: "o2", instrumental: { "1950": 1 }, vocal: {} },
    ];
    const merged = mergeCoverage(rows, {
      o1: { instrumental: { "1941": 1, "1940": null }, vocal: { "1942": 4 } },
      o3: { vocal: { "1960": 3 } },
    });
    const h = new Heatmap(merged);
    expect(h.grade("o1", false, 1941)).toBe(1);
    expect(h.grade("o1", false, 1940)).toBeUndefined();
    expect(h.grade("o1", true, 1940)).toBe(2);
    expect(h.grade("o1", true, 1942)).toBe(4);
    expect(h.grade("o2", false, 1950)).toBe(1);
    expect(h.grade("o3", true, 1960)).toBe(3);
    // the shipped rows are not mutated
    expect(rows[0]!.instrumental["1941"]).toBe(3);
    expect(mergeCoverage(rows, undefined)).toBe(rows);
  });
  it("best years are the runs of top grades", () => {
    expect(yearRanges([1940, 1941, 1942, 1945, 1947, 1948])).toEqual([
      [1940, 1942],
      [1945, 1945],
      [1947, 1948],
    ]);
    const row: CoverageRow = {
      orchestraId: "o",
      instrumental: { "1939": 3, "1940": 4, "1941": 4, "1942": 2, "1944": 4 },
      vocal: {},
    };
    expect(bestYears(row, "instrumental")).toEqual([
      [1940, 1941],
      [1944, 1944],
    ]);
    expect(bestYears(row, "instrumental", 3)).toEqual([
      [1939, 1941],
      [1944, 1944],
    ]);
  });
});

describe("scraped data: stored with its source, refreshed when the source changes, the DJ's edit wins", () => {
  const now = "2026-11-14T12:00:00.000Z";
  it("a fetch is stored with where it came from; a later different value replaces it and keeps the old one", () => {
    const r1 = mergeScraped(null, { bpm: 124, artwork: "https://a/1.jpg" }, "deezer", "deezer:1", now);
    expect(r1.bpm).toBe(124);
    expect(r1.fields.bpm).toBe("deezer");
    expect(r1.sources.deezer).toMatchObject({ fetchedAt: now, ref: "deezer:1" });
    const r2 = mergeScraped(r1, { release: "1941-03-02" }, "musicbrainz", "mb:x", now);
    expect(r2.bpm).toBe(124);
    expect(r2.release).toBe("1941-03-02");
    expect(r2.fields.release).toBe("musicbrainz");
    const r3 = mergeScraped(r2, { bpm: 126 }, "deezer", "deezer:2", "2026-12-01T00:00:00.000Z");
    expect(r3.bpm).toBe(126);
    expect(r3.sources.deezer!.previous).toEqual({ bpm: 124 });
  });
  it("needs a refresh when never fetched, when the source's track changed, or when old", () => {
    const r = mergeScraped(null, { bpm: 124 }, "deezer", "deezer:1", now);
    const t = Date.parse(now);
    expect(needsRefresh(null, "deezer", "deezer:1", t)).toBe(true);
    expect(needsRefresh(r, "deezer", "deezer:1", t)).toBe(false);
    expect(needsRefresh(r, "deezer", "deezer:9", t)).toBe(true);
    expect(needsRefresh(r, "deezer", "deezer:1", t + 200 * 86_400_000)).toBe(true);
    expect(needsRefresh(r, "musicbrainz", undefined, t)).toBe(true);
  });
  it("the DJ's edit wins over scraped values, which win over the index", () => {
    const s = song({
      tempo: { bpm: 120, source: "deezer" },
      level: { gainDb: -11, source: "deezer" },
      audio: { key: "A", mode: "minor", camelot: "8A", bpm: 121 } as never,
      resolved: { provider: "deezer", id: "1", title: "x", artist: "y", artwork: "https://idx.jpg" } as never,
    });
    const scraped = mergeScraped(
      null,
      { bpm: 124, gainDb: -9, artwork: "https://scr.jpg", key: "Dm" },
      "deezer",
      "deezer:1",
      now,
    );
    const v = songData(s, scraped, { bpm: 130, key: "Em" });
    expect(v.bpm).toEqual({ value: 130, source: "dj" });
    expect(v.key).toEqual({ value: "Em", source: "dj" });
    expect(v.gainDb).toEqual({ value: -9, source: "deezer" });
    expect(v.artwork).toEqual({ value: "https://scr.jpg", source: "deezer" });
    const idx = songData(s, null, null);
    expect(idx.bpm).toEqual({ value: 120, source: "deezer" });
    expect(idx.key).toEqual({ value: "Am", source: "audio" });
    expect(idx.artwork).toEqual({ value: "https://idx.jpg", source: "deezer" });
  });
  it("missing fields are the ones no source and no edit has", () => {
    const bare = song({ date: undefined });
    expect(missingFields(songData(bare, null, null)).sort()).toEqual([
      "artwork",
      "bpm",
      "gainDb",
      "key",
      "release",
    ]);
    const filled = mergeScraped(
      null,
      { bpm: 1, gainDb: -1, key: "C", artwork: "x", release: "1939-01-01" },
      "deezer",
      "d",
      now,
    );
    expect(missingFields(songData(bare, filled, null))).toEqual([]);
    // a dated index row has its date
    expect(missingFields(songData(song({ date: "1939-05-11" }), null, null))).not.toContain("release");
  });
  it("scraped records feed the engine's caches (Deezer BPM / gain, artwork on the resolved track)", () => {
    const rec: ScrapedRecord = mergeScraped(
      null,
      { bpm: 124, gainDb: -9, deezerId: "77", artwork: "https://a.jpg" },
      "deezer",
      "deezer:77",
      now,
    );
    const c = scrapedCaches({ x: rec, y: mergeScraped(null, { release: "1940" }, "musicbrainz", "mb", now) });
    expect(c.deezer.x).toMatchObject({ id: "77", bpm: 124, gain: -9 });
    expect(c.deezer.y).toBeUndefined();
    expect(c.artwork.x).toBe("https://a.jpg");
  });
});

describe("tone per tanda and every version of a title", () => {
  it("the tone names the mode, the keys, the feel and the mean tempo", () => {
    const a = (key: string, mode: "major" | "minor", bpm: number) =>
      song({ audio: { key, mode, camelot: "1A", bpm } as never, energy: 70 });
    const t = tandaTone([a("A", "minor", 120), a("D", "minor", 124), a("A", "minor", 122)]);
    expect(t).toMatchObject({ mode: "minor", keys: ["Am", "Dm"], bpm: 122, feel: "lively" });
    expect(t!.label).toBe("Minor · lively · 122 BPM");
    const mixed = tandaTone([a("C", "major", 0), a("A", "minor", 0)]);
    expect(mixed!.mode).toBe("mixed");
    expect(mixed!.bpm).toBeNull();
    expect(tandaTone([song({ energy: 30 })])).toMatchObject({ mode: null, feel: "calm", label: "Calm" });
    expect(tandaTone([])).toBeNull();
  });
  it("versions of a title are every recording of it, oldest first, the side itself included", () => {
    const v = versionsOf(SONGS, SONGS[1]!);
    expect(v.map((s) => s.id)).toEqual(["a", "b"]);
    expect(versionsOf(SONGS, SONGS[4]!).map((s) => s.id)).toEqual(["e"]);
  });
});
