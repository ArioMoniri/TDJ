/**
 * QA fix (2026-11), the featured night's labels: names as people read them ("C. Dante - J. Martel" → "Carlos Dante &
 * Julio Martel"), stored family keys with their accents ("alberto podesta" → "Alberto Podestá"), a milonga tanda's
 * tempo in the milonga convention like its sides (it said "185" beside sides of 92), and a tanda's BPM that its sides
 * agree with (one 89 BPM side never drags a 129 BPM tanda to 120).
 */
import { describe, expect, it } from "vitest";
import { creditDisplay, normaliseBpm, type Song, singerDisplay, singerOfKey, tandaTone } from "../src/index";

const song = (o: Partial<Song>): Song =>
  ({
    id: Math.random().toString(36).slice(2),
    title: "x",
    rhythm: "tango",
    orchestra: "o",
    orchestraId: "o",
    singer: null,
    vocal: false,
    year: 1940,
    era: "golden-peak",
    energy: 60,
    ...o,
  }) as Song;

describe("names as printed", () => {
  it("duets in full with “&”", () => {
    expect(singerDisplay("C. Dante - J. Martel")).toBe("Carlos Dante & Julio Martel");
    expect(singerDisplay("Lita Morales - H. Lagos")).toBe("Lita Morales & Horacio Lagos");
    expect(singerDisplay("Angel Vargas")).toBe("Angel Vargas");
    expect(singerDisplay(null)).toBeNull();
  });
  it("a stored key reads with its accents, a duet key in full", () => {
    expect(singerOfKey("alberto podesta")).toBe("Alberto Podestá");
    expect(singerOfKey("lita morales h lagos")).toBe("Lita Morales & Horacio Lagos");
    expect(singerOfKey("roberto rufino")).toBe("Roberto Rufino");
  });
  it("a glued credit reads as two names", () => {
    expect(creditDisplay("J.ricardo-G.barbieri")).toBe("J. Ricardo & G. Barbieri");
    expect(creditDisplay("Carlos Di Sarli")).toBe("Carlos Di Sarli");
  });
});

describe("a tanda's tempo and its sides agree", () => {
  const bpm = (b: number, rhythm: Song["rhythm"] = "tango") =>
    song({ rhythm, tempo: { bpm: b, source: "deezer" } });
  it("a milonga tanda counted at 185 reads in the milonga convention, as its sides do", () => {
    const t = tandaTone([bpm(185, "milonga"), bpm(184, "milonga"), bpm(186, "milonga")]);
    expect(t!.bpm).toBe(Math.round(normaliseBpm(185, "milonga")));
    expect(t!.bpm).toBeLessThan(100);
  });
  it("an off side does not drag the tanda's tempo", () => {
    const t = tandaTone([bpm(129), bpm(130), bpm(128), bpm(89)]);
    expect(t!.bpm).toBe(129);
  });
  it("a side counted at double speed is folded to the tanda's beat", () => {
    const t = tandaTone([bpm(120), bpm(240), bpm(122)]);
    expect(t!.bpm).toBe(121);
  });
});
