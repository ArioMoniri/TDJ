/**
 * Import a playlist (2026-11): every T-DJ export of the featured night reads back as the same night (sides, cortinas,
 * tandas, opening and closing), a list without stream ids still finds the same sides by the match rules, a pasted
 * list survives accents and typos, the tribute / remake refusals hold, unmatched items stay as recordings of their
 * own, the structure is detected (cortinas, runs, La Cumparsita), the DJ's fixes work, what a tanda breaks is
 * information accepted for that night only, and nothing is learned unless asked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildImportedNight,
  DEFAULT_OPTIONS,
  detectStructure,
  EXPORTERS,
  entriesOfNight,
  exportNight,
  groupsOf,
  type ImportEntry,
  type ImportItem,
  type ImportMatchDeps,
  importNight,
  importPlaylist,
  learnFromImport,
  matchImport,
  matchItem,
  mergeWithNext,
  nightFileText,
  type Playlist,
  PlaylistFormatError,
  parseCsv,
  parsePlaylistFile,
  parseTextList,
  type Song,
  setRole,
  splitBefore,
  toSeratoCSV,
} from "../src/index";
import { findRoot, type Loaded, loadCatalog } from "../src/load";

let cat: Loaded;
let deps: ImportMatchDeps;
let featured: Playlist;
const src = { service: "file" as const, at: "2026-11-16T20:00:00.000Z" };

beforeAll(() => {
  cat = loadCatalog();
  deps = { songs: cat.catalog.songs, cortinas: cat.cortinas, index: cat.catalog.searchIndex() };
  // the shipped night as this catalogue holds it today (its lengths and stream ids as the exports would write them)
  const shipped = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  featured = importNight(exportNight(shipped), { catalog: cat.catalog, cortinas: cat.cortinas }).playlist;
}, 180_000);

/** the night's shape: per tanda its side ids and cortina id, and the two Cumparsitas */
const shape = (p: Pick<Playlist, "tandas" | "opening" | "closing">) => ({
  opening: p.opening?.id ?? null,
  closing: p.closing?.id ?? null,
  tandas: p.tandas.map((t) => ({ sides: t.songs.map((s) => s.id), cortina: t.cortina?.id ?? null })),
});
const reimport = (text: string, file: string) => {
  const parsed = parsePlaylistFile(text, file);
  const entries = importPlaylist(parsed, deps);
  return {
    parsed,
    entries,
    night: buildImportedNight(entries, { name: parsed.name, options: DEFAULT_OPTIONS, source: src }),
  };
};
const stripUris = (p: Playlist): Playlist => ({
  ...p,
  opening: p.opening ? { ...p.opening, spotify: null } : null,
  closing: p.closing ? { ...p.closing, spotify: null } : null,
  tandas: p.tandas.map((t) => ({
    ...t,
    songs: t.songs.map((s) => ({ ...s, spotify: null })),
    cortina: t.cortina ? { ...t.cortina, spotify: null } : null,
  })),
});

describe("the featured night round-trips through every T-DJ export", () => {
  for (const [fmt, file] of [
    ["m3u8", "night.m3u8"],
    ["csv", "night.csv"],
    ["xspf", "night.xspf"],
    ["rekordbox", "night.xml"],
    ["traktor", "night.nml"],
    ["serato", "night-dj.csv"],
    ["json", "night.json"],
  ] as const) {
    it(`${fmt}: the same sides, cortinas, tandas and Cumparsitas`, () => {
      const text = EXPORTERS[fmt](featured);
      const { night } = reimport(text, file);
      expect(shape(night.playlist)).toEqual(shape(featured));
      // every side is the catalogue's (none left as an outside recording)
      expect(night.counts.external).toBe(0);
    });
  }

  it("without ids or stream ids (another DJ app's file): the match rules alone find the same night", () => {
    const accuracy: Record<string, number> = {};
    for (const [fmt, file, floor] of [
      // a DJ CSV / Rekordbox / Traktor carry the recording year: every side
      ["serato", "night.csv", 1],
      ["rekordbox", "night.xml", 1],
      ["traktor", "night.nml", 1],
      // an M3U / XSPF carry no year: a title the orchestra recorded twice may read as the other take (said as
      // "likely", with the other take offered)
      ["m3u8", "night.m3u8", 0.95],
      ["xspf", "night.xspf", 0.95],
    ] as const) {
      const text = EXPORTERS[fmt](stripUris(featured))
        .replace(/^#TDJ:id=.*\n/gm, "")
        .replace(/<identifier>tdj:[^<]*<\/identifier>/g, "");
      const { night, entries } = reimport(text, file);
      const want = shape(featured);
      const got = shape(night.playlist);
      const sides = want.tandas.flatMap((t) => t.sides);
      const gotSides = got.tandas.flatMap((t) => t.sides);
      const same = gotSides.filter((id, i) => id === sides[i]).length;
      accuracy[fmt] = same / sides.length;
      expect(accuracy[fmt], fmt).toBeGreaterThanOrEqual(floor);
      // a side read as another take is never "sure"
      for (const e of entries)
        if (e.role === "side" && e.song && !sides.includes(e.song.id))
          expect(e.match?.level, fmt).not.toBe("sure");
      expect(
        got.tandas.map((t) => t.sides.length),
        fmt,
      ).toEqual(want.tandas.map((t) => t.sides.length));
      expect(
        got.tandas.map((t) => t.cortina),
        fmt,
      ).toEqual(want.tandas.map((t) => t.cortina));
      expect(got.opening, fmt).toBe(want.opening);
      expect(got.closing, fmt).toBe(want.closing);
    }
    console.info("import accuracy without ids (featured night, 92 sides):", accuracy);
  });

  it("a .tdjnight is recognised as a whole night (night.ts importNight takes it) and reviews as it is", () => {
    const parsed = parsePlaylistFile(nightFileText(exportNight(featured)), "x.tdjnight");
    expect(parsed.format).toBe("tdjnight");
    expect(parsed.night?.tandas.length).toBe(featured.tandas.length);
    const p = importNight(parsed.night, { catalog: cat.catalog, cortinas: cat.cortinas }).playlist;
    const night = buildImportedNight(entriesOfNight(p), {
      name: p.name,
      options: DEFAULT_OPTIONS,
      source: src,
    });
    expect(shape(night.playlist)).toEqual(shape(featured));
  });

  it("the imported night is the DJ's: every tanda pinned, the source kept, no rule edits it", () => {
    const { night } = reimport(EXPORTERS.m3u8(featured), "n.m3u8");
    expect(night.playlist.tandas.every((t) => t.pinned?.by === "dj" && t.locked)).toBe(true);
    expect(night.playlist.imported?.service).toBe("file");
    expect(night.playlist.id).toMatch(/^import-/);
  });
});

describe("parsers", () => {
  it("TuneMyMusic, Soundiiz and Exportify CSVs", () => {
    const tmm = parsePlaylistFile(
      'Track name,Artist name,Album,Playlist name,Type,ISRC,Spotify - id\n"Bahía Blanca","Carlos Di Sarli","Bahía Blanca","My milonga","Playlist","","4xVwY1wjp1U4OEmbS3B0rS"\n',
      "tmm.csv",
    );
    expect(tmm.format).toBe("csv-transfer");
    expect(tmm.name).toBe("My milonga");
    expect(tmm.items[0]).toMatchObject({
      title: "Bahía Blanca",
      artists: ["Carlos Di Sarli"],
      spotifyUri: "spotify:track:4xVwY1wjp1U4OEmbS3B0rS",
    });
    const sz = parsePlaylistFile(
      "title,artist,album,isrc,platform,trackId,duration\nPoema,Francisco Canaro,,,spotify,x,3:05\n",
      "s.csv",
    );
    expect(sz.items[0]).toMatchObject({ title: "Poema", artists: ["Francisco Canaro"], durationSec: 185 });
    const ex = parsePlaylistFile(
      '"Track URI","Track Name","Artist Name(s)","Album Name","Album Release Date","Duration (ms)"\n"spotify:track:4xVwY1wjp1U4OEmbS3B0rS","Pensalo bien","Juan D\'Arienzo, Alberto Echagüe","x","1938-05-01","162000"\n',
      "e.csv",
    );
    expect(ex.items[0]).toMatchObject({
      title: "Pensalo bien",
      artists: ["Juan D'Arienzo", "Alberto Echagüe"],
      durationSec: 162,
      year: 1938,
      yearIsRelease: true,
    });
  });

  it("a pasted list: numbering, dashes, years, blank lines as tanda breaks, cortina lines", () => {
    const p = parseTextList(
      "1. Bahía Blanca – Carlos Di Sarli (1957)\n2. Organito de la tarde - Di Sarli\n\nCortina: Yesterday - The Beatles\nTanda 2\nPoema, Francisco Canaro 3:05",
    );
    expect(p.items.map((x) => x.title)).toEqual([
      "Bahía Blanca",
      "Organito de la tarde",
      "Yesterday",
      "Poema",
    ]);
    expect(p.items[0]).toMatchObject({ year: 1957, artists: ["Carlos Di Sarli"] });
    expect(p.items[2]).toMatchObject({ cortina: true, breakBefore: true });
    expect(p.items[3]).toMatchObject({ durationSec: 185, breakBefore: true });
  });

  it("generic Rekordbox / Traktor files without T-DJ's marks, and an M3U of file paths", () => {
    const rb = parsePlaylistFile(
      '<?xml version="1.0"?><DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="2"><TRACK TrackID="7" Name="Pavadita" Artist="Juan D&apos;Arienzo" Genre="Tango" TotalTime="160" Location="file://localhost/M/a.mp3"/><TRACK TrackID="9" Name="El flete" Artist="Juan D&apos;Arienzo" Genre="Tango" TotalTime="150"/></COLLECTION><PLAYLISTS><NODE Type="0" Name="ROOT"><NODE Name="Saturday" Type="1" Entries="2"><TRACK Key="9"/><TRACK Key="7"/></NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>',
      "rb.xml",
    );
    expect(rb.items.map((x) => x.title)).toEqual(["El flete", "Pavadita"]);
    expect(rb.name).toBe("Saturday");
    const m3u = parsePlaylistFile(
      "/Music/Tango/Carlos Di Sarli - Bahía Blanca.mp3\n/Music/Tango/02 Juan D'Arienzo - Pavadita.flac\n",
      "x.m3u",
    );
    expect(m3u.items.map((x) => [x.title, x.artists[0]])).toEqual([
      ["Bahía Blanca", "Carlos Di Sarli"],
      ["Pavadita", "Juan D'Arienzo"],
    ]);
    expect(parseCsv('a;"b;c"\n1;2')).toEqual([
      ["a", "b;c"],
      ["1", "2"],
    ]);
    expect(() => parsePlaylistFile("<html></html>", "x.xml")).toThrow(PlaylistFormatError);
  });
});

describe("matching", () => {
  const find = (title: string, orchestraId: string, year?: number) =>
    cat.catalog.songs.find(
      (s) => s.title === title && s.orchestraId === orchestraId && (!year || s.year === year),
    );

  it("accents, case and typos in a pasted list", () => {
    const want = find("Bahía Blanca", "carlos-di-sarli");
    expect(want).toBeTruthy();
    for (const line of [
      "bahia blanca - di sarli",
      "Bahia Blanka – Carlos Di Sarly",
      "Carlos di Sarli - Bahía Blanca",
    ]) {
      const m = matchImport(parseTextList(line).items, deps)[0]!;
      expect(m.match?.kind, line).toBe("song");
      expect(m.song?.title, line).toBe("Bahía Blanca");
      expect(m.song?.orchestraId, line).toBe("carlos-di-sarli");
    }
    const typo = matchImport(parseTextList("Bahia Blanka – Carlos Di Sarly").items, deps)[0]!;
    expect(typo.match?.corrected).toBe(true);
    expect(typo.match!.confidence).toBeLessThan(
      matchImport(parseTextList("Bahía Blanca – Carlos Di Sarli").items, deps)[0]!.match!.confidence,
    );
  });

  it("a tribute orchestra or album is never the leader's side; another orchestra's take is not this one", () => {
    const side = cat.catalog.songs.find(
      (s) => s.orchestraId === "juan-d-arienzo" && s.rhythm === "tango" && !s.singer,
    )!;
    const tribute: ImportItem = { title: side.title, artists: ["La Juan D'Arienzo"] };
    expect(matchItem(tribute, deps).song?.orchestraId).not.toBe("juan-d-arienzo");
    const pug = cat.catalog.songs.find((s) => s.orchestraId === "osvaldo-pugliese" && !s.singer)!;
    const album: ImportItem = {
      title: pug.title,
      artists: ["Sentimental y Canyengue"],
      album: "Al Estilo de Osvaldo Pugliese",
    };
    expect(matchItem(album, deps).song?.orchestraId).not.toBe("osvaldo-pugliese");
  });

  it("an item the catalogue lacks stays as the service's own recording", () => {
    const m = matchItem(
      {
        title: "Libertango",
        artists: ["Astor Piazzolla Tribute Band"],
        spotifyUri: "spotify:track:0123456789abcdefABCDEF",
      },
      deps,
    );
    expect(m.match).toBeNull();
    expect(m.song?.id).toBe("ext:spotify:0123456789abcdefABCDEF");
    expect(m.song?.spotify?.uri).toBe("spotify:track:0123456789abcdefABCDEF");
  });
});

describe("structure", () => {
  const sides = (orchestraId: string, rhythm: string, n: number, vocal = false) =>
    cat.catalog.songs
      .filter(
        (s) =>
          s.orchestraId === orchestraId &&
          s.rhythm === rhythm &&
          !!s.singer === vocal &&
          s.title !== "La Cumparsita" &&
          s.year,
      )
      .filter((s, i, all) => all.findIndex((x) => x.title === s.title) === i)
      .slice(0, n);
  const asItem = (s: Song): ImportItem => ({
    title: s.title,
    artists: [s.orchestra, ...(s.singer ? [s.singer] : [])],
    year: s.year!,
    ...(s.spotify?.uri ? { spotifyUri: s.spotify.uri } : {}),
    durationSec: s.durationSec,
  });

  it("a list of tangos with no cortina: runs of one orchestra and rhythm, long runs split evenly", () => {
    const items = [...sides("carlos-di-sarli", "tango", 8), ...sides("francisco-canaro", "vals", 3)].map(
      asItem,
    );
    const e = detectStructure(matchImport(items, deps), deps);
    expect(groupsOf(e).map((g) => g.length)).toEqual([4, 4, 3]);
  });

  it("non-tango, short and repeated items are cortinas; a first and last La Cumparsita open and close", () => {
    const cum = cat.catalog.songs.filter((s) => s.title === "La Cumparsita" && s.spotify?.uri).slice(0, 2);
    const pop: ImportItem = { title: "Yesterday", artists: ["The Beatles"], durationSec: 125 };
    const short: ImportItem = { title: "Some intro", artists: ["Unknown"], durationSec: 40 };
    const items = [
      asItem(cum[0]!),
      ...sides("carlos-di-sarli", "tango", 4).map(asItem),
      pop,
      ...sides("juan-d-arienzo", "milonga", 3).map(asItem),
      short,
      ...sides("osvaldo-pugliese", "tango", 3).map(asItem),
      pop,
      asItem(cum[1]!),
    ];
    const e = detectStructure(matchImport(items, deps), deps);
    expect(e[0]!.role).toBe("opening");
    expect(e.at(-1)!.role).toBe("closing");
    expect(e.filter((x) => x.role === "cortina").map((x) => x.why)).toEqual([
      "repeated",
      "short",
      "repeated",
    ]);
    expect(groupsOf(e).map((g) => g.length)).toEqual([4, 3, 3]);
    const night = buildImportedNight(e, { name: "Mine", options: DEFAULT_OPTIONS, source: src });
    expect(night.playlist.tandas.map((t) => t.rhythm)).toEqual(["tango", "milonga", "tango"]);
    expect(night.playlist.tandas.every((t) => t.cortina)).toBe(true);
    expect(night.playlist.opening?.title).toBe("La Cumparsita");
  });

  it("the DJ's fixes: split, merge (the cortina between left out), mark as cortina / side", () => {
    const items = [...sides("carlos-di-sarli", "tango", 4), ...sides("juan-d-arienzo", "tango", 4)].map(
      asItem,
    );
    let e: ImportEntry[] = detectStructure(matchImport(items, deps), deps);
    expect(groupsOf(e).length).toBe(2);
    e = mergeWithNext(e, 0);
    expect(groupsOf(e).map((g) => g.length)).toEqual([8]);
    e = splitBefore(e, 3);
    expect(groupsOf(e).map((g) => g.length)).toEqual([3, 5]);
    e = setRole(e, 3, "cortina");
    expect(groupsOf(e).map((g) => g.length)).toEqual([3, 4]);
    expect(e[3]!.cortina).toBeTruthy();
    e = setRole(e, 3, "side");
    expect(groupsOf(e).map((g) => g.length)).toEqual([8]);
  });

  it("a tanda that breaks a rule is information, accepted as a one-night exception of this night only", () => {
    const items = [...sides("carlos-di-sarli", "tango", 2), ...sides("juan-d-arienzo", "tango", 2)].map(
      asItem,
    );
    const e = detectStructure(matchImport(parseTextList("").items.concat(items), deps), deps);
    // the four in one tanda (as the file had them, with a tanda mark)
    const one = e.map((x) => ({ ...x, split: false }));
    const night = buildImportedNight(one, { name: "Mixed", options: DEFAULT_OPTIONS, source: src });
    expect(night.playlist.tandas.length).toBe(1);
    expect(night.warnings.some((w) => w.rule === "orchestra" && w.tanda === 0)).toBe(true);
    const pin = night.playlist.tandas[0]!.pinned;
    expect(pin?.exception?.nightId).toBe(night.playlist.id);
    expect(pin?.exception?.rules).toContain("orchestra");
    expect(night.exceptions[0]?.nightId).toBe(night.playlist.id);
  });
});

describe("learning", () => {
  it("only on the DJ's word: catalogue sides within the caps, no template from an exception, nothing from outside recordings", () => {
    const { night } = reimport(toSeratoCSV(featured), "n.csv");
    const p = night.playlist;
    const ext: Song = { ...p.tandas[0]!.songs[0]!, id: "ext:spotify:zzzzzzzzzzzzzzzzzzzzzz" };
    const withExt = {
      ...p,
      tandas: p.tandas.map((t, i) => (i === 0 ? { ...t, songs: [...t.songs, ext] } : t)),
    };
    const L = learnFromImport(undefined, withExt, "2026-11-16T21:00:00.000Z");
    expect(Object.keys(L.sides ?? {})).not.toContain(ext.id);
    expect(Object.values(L.sides ?? {}).every((v) => v <= 3)).toBe(true);
    expect(L.sides?.[p.tandas[1]!.songs[0]!.id]).toBe(1);
    const excepted = p.tandas
      .filter((t) => t.pinned?.exception)
      .map((t) => t.songs.map((s) => s.id).join(","));
    expect(L.templates?.some((t) => excepted.includes(t.songIds.join(",")))).toBe(false);
    expect(L.edits?.[0]?.playlistId).toBe(p.id);
  });
});
