/**
 * albumSpan reads an album title's years as an inclusive span. A range written with a two-digit end
 * ("1940-42 Instrumental", "1938/39", "1940–42") ends in that year of the same century, not in the start year.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { albumSpan, judgeStreams } from "../src/index";
import { findRoot } from "../src/load";

describe("albumSpan", () => {
  it("reads four-digit years and ranges", () => {
    expect(albumSpan("(1939-1940), Vol. 4")).toEqual([1939, 1940]);
    expect(albumSpan("Serie 78 RPM 1940-1947")).toEqual([1940, 1947]);
    expect(albumSpan("(1944), Vol. 12")).toEqual([1944, 1944]);
    expect(albumSpan("Grandes Éxitos")).toBeNull();
    expect(albumSpan(null)).toBeNull();
  });
  it("reads a two-digit range end (hyphen, slash, en dash) in the start year's century", () => {
    expect(albumSpan("1940-42 Instrumental")).toEqual([1940, 1942]);
    expect(albumSpan("Recordings 1938/39")).toEqual([1938, 1939]);
    expect(albumSpan("1940–42")).toEqual([1940, 1942]);
    expect(albumSpan("Recordings 1943-46, Vol. 2")).toEqual([1943, 1946]);
  });
  it("does not read a volume, a track number or a backwards end as a year", () => {
    expect(albumSpan("1940-42 Vol. 12")).toEqual([1940, 1942]);
    expect(albumSpan("1944-5 Vol. 3")).toEqual([1944, 1944]);
    expect(albumSpan("1944-12")).toEqual([1944, 1944]);
    expect(albumSpan("1940-42, Vol. 45")).toEqual([1940, 1942]);
    // a spaced "1944 - 20 Grandes Éxitos" is a count, not a year
    expect(albumSpan("Tango 1944 - 20 Grandes Éxitos")).toEqual([1944, 1944]);
  });
});

describe("judgeStreams on a two-digit album range", () => {
  it("a 1942 side on '1940-42 Instrumental' is not rejected as an earlier album", () => {
    const row = {
      title: "Independencia",
      orchestra: "Juan D'Arienzo",
      vocal: false,
      year: 1942,
      date: "1942-12-22",
      rhythm: "tango",
    };
    const sp = {
      uri: "spotify:track:2ZCkzZONq0jfUzhaBy7Vx4",
      durationMs: 154000,
      album: "1940-42 Instrumental",
      matched: "Juan D'Arienzo – Independencia",
    };
    expect(judgeStreams(row, sp, null).spotify).toBeNull();
    // a 1945 side on the same album is still another record
    expect(judgeStreams({ ...row, year: 1945, date: "1945-04-17" }, sp, null).spotify).toMatch(
      /earlier album/,
    );
  });
});

describe("judgeStreams on a tribute album", () => {
  const row = {
    title: "Nochero Soy",
    orchestra: "Osvaldo Pugliese",
    vocal: false,
    year: 1956,
    date: "1956-11-28",
    rhythm: "tango",
  };
  it("an album 'in the style of' the leader, credited to another ensemble, is not the leader's side", () => {
    const dz = {
      id: "2808551672",
      title: "Nochero Soy",
      artist: "Sentimental y Canyengue",
      album: "Al Estilo de Osvaldo Pugliese",
      durationMs: 231000,
    };
    expect(judgeStreams(row, null, dz).deezer).toMatch(/tribute album/);
    expect(
      judgeStreams(
        row,
        { uri: "spotify:track:x", album: "Homenaje a Osvaldo Pugliese", matched: "Los Otros – Nochero soy" },
        null,
      ).spotify,
    ).toMatch(/tribute album/);
  });
  it("the leader's own credit on such an album still stands", () => {
    const sp = {
      uri: "spotify:track:07H6MGl2J73fhNeMW9Imha",
      album: "Tango Classics 114: La guitarrita",
      matched: "Osvaldo Pugliese – Nochero soy",
      durationMs: 213291,
    };
    expect(judgeStreams(row, sp, null).spotify).toBeNull();
    expect(judgeStreams(row, { ...sp, album: "Al estilo de Osvaldo Pugliese" }, null).spotify).toBeNull();
  });
});

describe("the featured nights' Spotify uris", () => {
  type Side = { id: string; title: string; spotify?: { uri?: string } | null; spotifyUri?: string };
  it("every side, cortina, opening and closing uri of a featured night is in the Spotify caches", () => {
    const root = findRoot();
    const dir = join(root, "data/cache/spotify");
    const URI = /spotify:track:[A-Za-z0-9]{22}/g;
    const cached = new Set<string>();
    for (const f of readdirSync(dir))
      for (const u of readFileSync(join(dir, f), "utf8").match(URI) ?? []) cached.add(u);
    const tracks = JSON.parse(readFileSync(join(dir, "tracks.json"), "utf8")) as Record<
      string,
      { uri: string; release?: string } | null
    >;
    const featuredDir = join(root, "apps/web/public/featured");
    const files = readdirSync(featuredDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    const missing: string[] = [];
    let n = 0;
    for (const f of files) {
      const night = JSON.parse(readFileSync(join(featuredDir, f), "utf8")) as {
        tandas: Array<{ songs: Side[]; cortina?: Side | null }>;
        opening?: Side | null;
        closing?: Side | null;
      };
      const items: Array<{ side: Side; song: boolean }> = [];
      for (const t of night.tandas) {
        for (const s of t.songs) items.push({ side: s, song: true });
        if (t.cortina) items.push({ side: t.cortina, song: false });
      }
      for (const s of [night.opening, night.closing]) if (s) items.push({ side: s, song: true });
      for (const { side, song } of items) {
        const uri = side.spotify?.uri ?? side.spotifyUri;
        if (!uri) continue;
        n++;
        if (!cached.has(uri)) missing.push(`${f}: ${side.title} ${uri}`);
        // a side whose record is keyed by its song id holds that same uri there
        else if (song && tracks[side.id]) expect(tracks[side.id]!.uri, side.title).toBe(uri);
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
  it("the three sides that were in no cache (T14 Danzarín, T19 Chiqué, T19 Nochero Soy) sit under their song ids", () => {
    const read = (f: string) => JSON.parse(readFileSync(join(findRoot(), "data/cache/spotify", f), "utf8"));
    const tracks = read("tracks.json") as Record<string, { uri: string; release?: string } | null>;
    // Nochero Soy: proven (the Deezer reference that refused it was a tribute album), so the catalogue plays it
    expect(tracks.a2e1839ef1).toMatchObject({
      uri: "spotify:track:07H6MGl2J73fhNeMW9Imha",
      release: "2011-05-27",
    });
    // Danzarín and Chiqué: the DJ's picks that the match rules cannot prove (a later take exists): cached apart,
    // with the reason, never bound to the catalogue row
    const featured = read("featured.json").tracks as Record<
      string,
      { uri: string; release: string; unproven: string }
    >;
    expect(featured["166b2a4f3e"]).toMatchObject({
      uri: "spotify:track:1TcXgz8vA1gN25RgShGeQl",
      release: "2015-02-25",
    });
    expect(featured["67f9a28a62"]).toMatchObject({
      uri: "spotify:track:3npc4k1OPe3MU3F1hf8y3o",
      release: "2005-01-01",
    });
    for (const id of ["166b2a4f3e", "67f9a28a62"]) {
      expect(featured[id]!.unproven).toMatch(/later take/);
      expect(tracks[id] ?? null).toBeNull();
    }
  });
});
