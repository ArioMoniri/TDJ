import { mergeScraped, type Playlist, type Song } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { artworkFor, coverFor, djDataOf, orchestraPlaceholder, placeholderFor } from "./artwork";
import { coverageWith, DEFAULT_COVERAGE, editGrade, eraOf, eraOfSong, nextGrade } from "./era";
import { clampPanel, PANEL_MAX, PANEL_MIN, targetsFor } from "./searchPanel";
import { songWire } from "./songWire";

const song = (p: Partial<Song> = {}): Song => ({
  id: "s1",
  title: "Corazón",
  rhythm: "tango",
  orchestra: "Carlos Di Sarli",
  orchestraId: "carlos-di-sarli",
  singer: null,
  singerId: null,
  vocal: false,
  year: 1955,
  era: "golden-late",
  ...p,
});

describe("artwork", () => {
  it("the DJ's image, then the user's sources, then the shipped match", () => {
    const s = song({
      resolved: { provider: "deezer", id: "1", title: "", artist: "", artwork: "idx" } as never,
    });
    expect(artworkFor(s)).toBe("idx");
    const scraped = mergeScraped(null, { artwork: "src" }, "coverart", "caa:1");
    expect(artworkFor(s, scraped)).toBe("src");
    expect(artworkFor(s, scraped, { artwork: "mine" })).toBe("mine");
    expect(artworkFor(song())).toBeUndefined();
  });
  it("djDataOf keeps only the DJ's data fields", () => {
    expect(djDataOf({ bpm: 120, year: 1940, key: "Am" })).toEqual({ bpm: 120, key: "Am" });
    expect(djDataOf(undefined)).toBeNull();
  });
  it("a placeholder per orchestra: stable colours and initials", () => {
    const a = orchestraPlaceholder("carlos-di-sarli", "Carlos Di Sarli");
    expect(a.initials).toBe("CS");
    expect(orchestraPlaceholder("carlos-di-sarli", "Carlos Di Sarli")).toEqual(a);
    expect(orchestraPlaceholder("juan-d-arienzo", "Juan D'Arienzo").initials).toBe("JA");
    expect(orchestraPlaceholder("otv", "Orquesta Típica Victor").initials).toBe("V");
    expect(orchestraPlaceholder("x", "Guitarras (solo singer)").initials).toBe("G");
    expect(orchestraPlaceholder("juan-d-arienzo", "Juan D'Arienzo").from).not.toBe(a.from);
  });
});

describe("era indicator in the browser", () => {
  it("reads the shipped grades; the DJ's edit wins and returning to the shipped grade drops the edit", () => {
    const row = DEFAULT_COVERAGE.find((r) => r.orchestraId === "carlos-di-sarli")!;
    const year = Number(Object.keys(row.instrumental).find((y) => row.instrumental[y] === 4));
    const s = song({ year });
    expect(eraOfSong(s)?.mark).toBe("best");
    const edits = editGrade(undefined, "carlos-di-sarli", "instrumental", year, 0);
    expect(eraOfSong(s, edits)?.mark).toBe("outside");
    expect(editGrade(edits, "carlos-di-sarli", "instrumental", year, 4)).toEqual({});
    expect(coverageWith(edits)).toBe(coverageWith(edits));
  });
  it("one era module: the Booth's glyph and Compose's badge read the same grade for a dated side", () => {
    const row = DEFAULT_COVERAGE.find((r) => r.orchestraId === "carlos-di-sarli")!;
    for (const [y, g] of Object.entries(row.instrumental)) {
      const s = song({ year: Number(y) });
      expect(eraOf(s)?.grade).toBe(g);
      expect(eraOf(s)?.cls).toBe(eraOfSong(s)?.mark);
    }
    // the Booth trusts the grade stamped on the side; a cortina has none
    expect(eraOf(song({ heat: 0 }))?.cls).toBe("outside");
    expect(eraOf({ id: "c", title: "x", artist: "y" } as never)).toBeNull();
  });
  it("one artwork module: both placeholders stay as they were (Compose tiles and Booth tiles)", () => {
    expect(orchestraPlaceholder("carlos-di-sarli", "Carlos Di Sarli").initials).toBe("CS");
    expect(placeholderFor("Carlos Di Sarli").initials).toBe("DS");
    expect(coverFor(song(), { s1: "https://i.scdn.co/image/a" })).toBe("https://i.scdn.co/image/a");
  });
  it("a cell cycles none → 4 → … → 0 → none", () => {
    const seq = [undefined, 4, 3, 2, 1, 0].map((g) => nextGrade(g));
    expect(seq).toEqual([4, 3, 2, 1, 0, null]);
  });
});

describe("search panel", () => {
  const night = {
    tandas: [
      { rhythm: "tango", orchestra: "A", singer: null, yearRange: [1940, 1942], songs: [song({ id: "a" })] },
      { rhythm: "vals", orchestra: "B", singer: "X", yearRange: null, songs: [song({ id: "b" })] },
      { rhythm: "tango", orchestra: "C", singer: "Y", yearRange: [1941, 1941], songs: [song({ id: "c" })] },
    ],
  } as unknown as Playlist;
  it("a side goes only to a tanda of its rhythm; played tandas are closed in the Booth", () => {
    expect(targetsFor(night, "tango").map((t) => t.tanda)).toEqual([0, 2]);
    expect(targetsFor(night, "vals")[0]!.label).toBe("Tanda 2 · B");
    const booth = targetsFor(night, "tango", { closedBefore: 0 });
    expect(booth[0]!.closed).toBeTruthy();
    expect(booth[1]!.closed).toBeUndefined();
    expect(targetsFor(null, "tango")).toEqual([]);
  });
  it("the panel width stays in its bounds", () => {
    expect(clampPanel(10)).toBe(PANEL_MIN);
    expect(clampPanel(9999)).toBe(PANEL_MAX);
    expect(clampPanel(Number.NaN)).toBeGreaterThanOrEqual(PANEL_MIN);
  });
  it("the wire drops the chroma vector and discography notes", () => {
    const w = songWire(
      song({
        audio: { chroma: [1, 2, 3], key: "A" } as never,
        laterTakes: [{ year: 1950 }],
        vocalTwins: [1],
      }),
    );
    expect(w.audio?.chroma).toEqual([]);
    expect(w.laterTakes).toBeUndefined();
    expect(w.vocalTwins).toBeUndefined();
  });
});
