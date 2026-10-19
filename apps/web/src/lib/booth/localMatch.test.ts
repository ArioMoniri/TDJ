import { describe, expect, it } from "vitest";
import type { BoothRow } from "./plan";
import { candidateFor, type FolderEntry, matchAll, matchOne, parseName } from "./sources/localMatch";
import { readId3v1, readId3v2, readTags } from "./sources/tags";

const row = (o: Partial<BoothRow> & { title: string; artist: string }): BoothRow => ({
  n: 1,
  kind: "track",
  id: o.id ?? "s1",
  tanda: 1,
  startSec: 0,
  lengthSec: 165,
  gapAfterSec: 2.5,
  rhythm: "tango",
  year: 1936,
  ...o,
});
const entry = (name: string, tags?: FolderEntry["tags"], path = name): FolderEntry => ({
  path,
  name,
  size: 1000,
  lastModified: 1,
  tags,
});

/** A minimal ID3v2.3 tag with TIT2 / TPE1 / TYER. */
function id3v2(title: string, artist: string, year: string): Uint8Array {
  const frames: number[] = [];
  const frame = (id: string, text: string) => {
    const body = [0, ...Array.from(new TextEncoder().encode(text))];
    frames.push(
      ...Array.from(new TextEncoder().encode(id)),
      0,
      0,
      (body.length >> 8) & 255,
      body.length & 255,
      0,
      0,
      ...body,
    );
  };
  frame("TIT2", title);
  frame("TPE1", artist);
  frame("TYER", year);
  const size = frames.length;
  const head = [
    0x49,
    0x44,
    0x33,
    3,
    0,
    0,
    (size >> 21) & 127,
    (size >> 14) & 127,
    (size >> 7) & 127,
    size & 127,
  ];
  return new Uint8Array([...head, ...frames, 0, 0, 0, 0]);
}

describe("folder matcher (round7-booth.md §8.1, §12.1)", () => {
  const flete = row({ title: "El flete", artist: "Juan D'Arienzo", year: 1936 });
  it("\"Juan D'Arienzo - El Flete.mp3\" matches El flete / D'Arienzo 1936 from the file name", () => {
    const r = matchOne(flete, [
      entry("Juan D'Arienzo - El Flete.mp3"),
      entry("Aníbal Troilo - Toda mi vida.mp3"),
    ]);
    expect(r.record?.path).toBe("Juan D'Arienzo - El Flete.mp3");
    expect(r.record!.score).toBeGreaterThanOrEqual(0.6);
  });
  it('"01 - el_flete (1936).m4a" matches via its tags, not its name', () => {
    const byName = matchOne(flete, [entry("01 - el_flete (1936).m4a")]);
    expect(byName.record).toBeNull();
    const tagged = matchOne(flete, [
      entry("01 - el_flete (1936).m4a", { title: "El flete", artist: "Juan D'Arienzo", year: 1936 }),
    ]);
    expect(tagged.record?.path).toBe("01 - el_flete (1936).m4a");
  });
  it("a Troilo \"El flete\" does not match D'Arienzo's (not found beats a wrong song), but is suggested", () => {
    const r = matchOne(flete, [entry("Aníbal Troilo - El flete.mp3")]);
    expect(r.record).toBeNull();
    expect(r.suggestions.map((s) => s.name)).toContain("Aníbal Troilo - El flete.mp3");
  });
  it("the exact exporter name wins before any fuzzy pass (case and accents ignored)", () => {
    const r = matchOne(row({ title: "Poema", artist: "Francisco Canaro / Roberto Maida", year: 1935 }), [
      entry("francisco canaro - roberto maida - poéma.MP3"),
      entry("Francisco Canaro - Poema (1935).mp3"),
    ]);
    expect(r.record?.path).toBe("francisco canaro - roberto maida - poéma.MP3");
    expect(r.record?.score).toBe(1);
    const plain = matchOne(row({ title: "Poema", artist: "Francisco Canaro / Roberto Maida", year: 1935 }), [
      entry("Francisco Canaro - Poema.mp3"),
      entry("Francisco Canaro - Poema (1935).mp3"),
    ]);
    expect(plain.record?.path).toBe("Francisco Canaro - Poema.mp3");
  });
  it("manual picks survive a re-index; cortinas and breaks are handled", () => {
    const items = [
      flete,
      row({
        n: 2,
        id: "c1",
        kind: "cortina",
        title: "Cortina X",
        artist: "Some Band",
        rhythm: "cortina",
        year: null,
      }),
      row({ n: 3, id: undefined, kind: "break", title: "Break", artist: "10 min", rhythm: "break" }),
    ];
    const entries = [
      entry("Juan D'Arienzo - El Flete.mp3"),
      entry("odd name.mp3", undefined, "cortinas/odd name.mp3"),
    ];
    const prev = {
      c1: { path: "cortinas/odd name.mp3", size: 1000, lastModified: 1, score: 1, manual: true },
    };
    const { matches } = matchAll(items, entries, prev);
    expect(matches.s1?.path).toBe("Juan D'Arienzo - El Flete.mp3");
    expect(matches.c1?.manual).toBe(true);
    expect(matches.c1?.path).toBe("cortinas/odd name.mp3");
    expect(Object.keys(matches)).toHaveLength(2);
  });
  it("parseName and candidateFor", () => {
    expect(parseName("01 - el_flete (1936).m4a")).toEqual({ title: "el flete", year: 1936 });
    expect(parseName("Juan D'Arienzo - El Flete.mp3")).toEqual({
      title: "El Flete",
      artist: "Juan D'Arienzo",
      year: undefined,
    });
    expect(candidateFor(entry("Juan D'Arienzo - El Flete.mp3")).artists).toEqual(["Juan D'Arienzo"]);
  });
});

describe("tag reader", () => {
  it("reads ID3v2.3 text frames", () => {
    const t = readId3v2(id3v2("El flete", "Juan D'Arienzo", "1936"));
    expect(t).toEqual({ title: "El flete", artist: "Juan D'Arienzo", year: 1936 });
  });
  it("reads an ID3v1 trailer and merges head and tail", () => {
    const tail = new Uint8Array(128);
    const put = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) tail[o + i] = s.charCodeAt(i);
    };
    put(0, "TAG");
    put(3, "Poema");
    put(33, "Francisco Canaro");
    put(93, "1935");
    expect(readId3v1(tail)).toMatchObject({ title: "Poema", artist: "Francisco Canaro", year: 1935 });
    const merged = readTags(new Uint8Array([0xff, 0xfb, 0, 0]), tail);
    expect(merged.title).toBe("Poema");
    expect(readTags(new Uint8Array(4))).toEqual({});
  });
});
