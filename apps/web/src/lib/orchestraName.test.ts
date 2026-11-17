import { buildSongIndex, type Song, searchSongs } from "@tdj/core";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { creditName, creditSpans, isCredit, orchestraName, orchestraQuery } from "./orchestraName";
import { completionsFor } from "./smartSearch";

/**
 * 2026-11 (the owner: "J.ricardo-G.barbieri-J.m.aguilar / Carlos Gardel" on the Library's rows): a raw accompanists'
 * credit reads as names, display only — the catalogue keeps the credit and the search still finds and marks it.
 */
afterEach(() => setLocale("en"));

describe("creditName", () => {
  it("Gardel's guitarists read as names, with (guitars)", () => {
    expect(creditName("J.ricardo-G.barbieri-J.m.aguilar")).toBe(
      "José Ricardo, Guillermo Barbieri, José María Aguilar (guitars)",
    );
    expect(creditName("G.barbieri-Riverol-Pettorossi-Vivas")).toBe(
      "Guillermo Barbieri, Domingo Riverol, Horacio Pettorossi, Julio Vivas (guitars)",
    );
  });

  it("a duo with a non-guitarist: names, no (guitars)", () => {
    expect(creditName("A.troilo-R.grela")).toBe("Aníbal Troilo, Roberto Grela");
  });

  it("unknown musicians: the initials spaced, the surname capitalised", () => {
    expect(creditName("E.baffa-O.berlinghieri")).toBe("E. Baffa, O. Berlinghieri");
    expect(creditName("R.pansera-L.uribe Bueno")).toBe("R. Pansera, L. Uribe Bueno");
    expect(creditName("J.libertella-O.berlinghieri-K.díaz")).toBe("J. Libertella, O. Berlinghieri, K. Díaz");
  });

  it("every other name reads as it is", () => {
    for (const n of [
      "Carlos Di Sarli",
      "Francini-Pontier",
      "Ricardo Tanturi",
      "Orq.típica Criolla V.greco",
      "Guitarras - Conjunto Típico",
      "",
    ]) {
      expect(isCredit(n)).toBe(false);
      expect(creditName(n)).toBe(n);
    }
  });

  it("Turkish: the guitars word is Turkish", () => {
    setLocale("tr");
    expect(creditName("J.ricardo-G.barbieri")).toBe("José Ricardo, Guillermo Barbieri (gitarlar)");
  });

  it("orchestraName formats a credit and keeps the solo-singer label rule", () => {
    expect(orchestraName({ orchestra: "J.ricardo-G.barbieri", singer: "Carlos Gardel" })).toBe(
      "José Ricardo, Guillermo Barbieri (guitars)",
    );
    expect(orchestraName({ orchestra: "Ricardo Tanturi", singer: "Alberto Castillo" })).toBe(
      "Ricardo Tanturi",
    );
  });
});

describe("the search on a credit", () => {
  const gardel = {
    id: "gardel-1",
    title: "Mi Buenos Aires querido",
    orchestra: "J.ricardo-G.barbieri-J.m.aguilar",
    orchestraId: "j-ricardo-g-barbieri-j-m-aguilar",
    singer: "Carlos Gardel",
    year: 1934,
    rhythm: "tango",
  } as unknown as Song;
  const other = {
    id: "other-1",
    title: "Poema",
    orchestra: "Francisco Canaro",
    orchestraId: "francisco-canaro",
    singer: "Roberto Maida",
    year: 1935,
    rhythm: "tango",
  } as unknown as Song;
  const index = buildSongIndex([gardel, other]);

  it("still finds the side by the credit's surnames, and the marks land on the shown names", () => {
    for (const q of ["barbieri", "aguilar gardel", "ricardo"]) {
      const res = searchSongs(index, q);
      const hit = res.items.find((h) => h.song.id === "gardel-1");
      expect(hit, q).toBeTruthy();
      const shown = creditName(gardel.orchestra);
      const spans = creditSpans(gardel.orchestra, shown, hit!.highlights.orchestra) ?? [];
      const marked = spans.map(([a, b]) => shown.slice(a, b).toLowerCase());
      const word = q.split(" ")[0]!;
      expect(
        marked.some((m) => word.startsWith(m) || m.startsWith(word)),
        `${q}: ${marked}`,
      ).toBe(true);
    }
  });

  it("creditSpans: accents and case aside, a piece not found is dropped, a plain name is left alone", () => {
    const raw = "J.ricardo-G.barbieri-J.m.aguilar";
    const shown = creditName(raw);
    expect(creditSpans(raw, shown, [[12, 16]])).toEqual([[shown.indexOf("Barb"), shown.indexOf("Barb") + 4]]);
    expect(creditSpans("Francisco Canaro", "Francisco Canaro", [[0, 4]])).toEqual([[0, 4]]);
    expect(creditSpans(raw, shown, [[0, 1]])?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('a search never shows the raw credit (QA 2026-11: a tap on the Library\'s list or a completion filled the field with "J.ricardo-G.barbieri")', () => {
  const side = (id: string, orchestra: string, orchestraId: string, title: string): Song =>
    ({
      id,
      title,
      orchestra,
      orchestraId,
      singer: "Carlos Gardel",
      year: 1927,
      rhythm: "tango",
      durationSec: 170,
    }) as Song;
  const songs = [
    side("a", "J.ricardo-G.barbieri", "j-ricardo-g-barbieri", "A Media Luz"),
    side("b", "J.ricardo-G.barbieri", "j-ricardo-g-barbieri", "A Medianoche"),
    side("c", "Francisco Canaro", "francisco-canaro", "Sentimiento Gaucho"),
  ];
  const ix = buildSongIndex(songs);

  it("an orchestra's query is its people by name; any other name as it is", () => {
    expect(orchestraQuery("J.ricardo-G.barbieri")).toBe("José Ricardo Guillermo Barbieri");
    expect(orchestraQuery("Francisco Canaro")).toBe("Francisco Canaro");
  });

  it("the names find the credit's sides", () => {
    const hits = searchSongs(ix, orchestraQuery("J.ricardo-G.barbieri"), { limit: 10 }).items;
    expect(hits.map((h) => h.song.id).sort()).toEqual(["a", "b"]);
  });

  it("the orchestra completion fills in the names, never the credit", () => {
    const q = "guillermo barb";
    const c = completionsFor(q, { ...searchSongs(ix, q, { limit: 50 }) }).filter(
      (x) => x.kind === "orchestra",
    );
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) {
      expect(x.query).not.toMatch(/[A-Z]\.[a-z]+-/);
      expect(x.query).toContain("Guillermo Barbieri");
    }
  });
});
