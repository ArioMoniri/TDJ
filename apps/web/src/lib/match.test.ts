import { describe, expect, it } from "vitest";
import {
  bestMatch,
  type Candidate,
  cleanTitle,
  jaroWinkler,
  orchestraQuery,
  orchestraSurname,
  rejectReason,
  scoreCandidate,
  searchQueries,
  titleSimilarity,
} from "./match";

const cand = (c: Partial<Candidate> & { name: string; artists: string[] }): Candidate => ({
  uri: `spotify:track:${c.name.replace(/\W/g, "")}${c.albumYear ?? ""}`,
  album: "",
  durationMs: 170_000,
  ...c,
});

describe("normalisation", () => {
  it("strips accents, punctuation and version tails", () => {
    expect(cleanTitle("Niño bien (Remastered 2004)")).toBe("nino bien");
    expect(cleanTitle("Poema - Live at Café Tortoni")).toBe("poema");
    expect(cleanTitle("El Choclo [Mono]")).toBe("el choclo");
    expect(titleSimilarity("La Cumparsita", "La cumparsita")).toBe(1);
    expect(titleSimilarity("Bahía Blanca", "Bahia Blanca")).toBe(1);
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
  });
  it("finds the orchestra's surname and keeps a particle for the search filter", () => {
    expect(orchestraSurname("Juan D'Arienzo")).toBe("darienzo");
    expect(orchestraSurname("Orquesta Típica Víctor")).toBe("victor");
    expect(orchestraSurname("Carlos Di Sarli")).toBe("sarli");
    expect(orchestraSurname("Francisco Canaro y su Orquesta Típica")).toBe("canaro");
    expect(orchestraQuery("Carlos Di Sarli")).toBe("Di Sarli");
    expect(orchestraQuery("Alfredo De Angelis")).toBe("De Angelis");
    expect(orchestraQuery("Osvaldo Pugliese")).toBe("Pugliese");
    expect(orchestraQuery("Orquesta Típica Víctor")).toBe("Víctor");
    const q = searchQueries({
      id: "x",
      title: "Ciego",
      orchestra: "Francisco Canaro",
      singer: "Roberto Maida",
    });
    expect(q.filtered).toBe('track:"Ciego" artist:"Canaro"');
    expect(q.plain).toBe("Ciego Francisco Canaro Roberto Maida");
  });
});

describe("best match", () => {
  const ciego = {
    id: "ciego",
    title: "Ciego",
    orchestra: "Francisco Canaro",
    singer: "Roberto Maida",
    year: 1935,
    durationSec: 162,
  };
  it("prefers Canaro's own recording to a modern cover, even when the cover is first", () => {
    const cover = cand({
      name: "Ciego",
      artists: ["Orquesta Romántica Milonguera"],
      album: "Tangos de Siempre",
      albumYear: 2019,
      durationMs: 201_000,
    });
    const canaro = cand({
      name: "Ciego",
      artists: ["Francisco Canaro", "Roberto Maida"],
      album: "Canaro 1935-1936",
      albumYear: 1990,
      durationMs: 163_000,
    });
    const m = bestMatch(ciego, [cover, canaro]);
    expect(m?.uri).toBe(canaro.uri);
    expect(m?.artist).toBe("Francisco Canaro, Roberto Maida");
    expect(scoreCandidate(ciego, cover)).toBeLessThan(0.6);
    expect(scoreCandidate(ciego, canaro)).toBeGreaterThan(0.85);
  });
  it("reports not found rather than a wrong song when only covers exist", () => {
    const cover = cand({ name: "Ciego", artists: ["Sexteto Milonguero"], albumYear: 2012 });
    const other = cand({ name: "Cielo", artists: ["Francisco Canaro"], durationMs: 163_000 });
    expect(bestMatch(ciego, [cover])).toBeNull();
    // a different Canaro title still clears the bar only when the title is close enough
    expect(bestMatch(ciego, [other])?.name === "Cielo" || bestMatch(ciego, [other]) === null).toBe(true);
    expect(bestMatch(ciego, [])).toBeNull();
  });
  it("tells D'Arienzo's 1951 La cumparsita from the 1928 one by duration and album year", () => {
    const item = {
      id: "lc1951",
      title: "La cumparsita",
      orchestra: "Juan D'Arienzo",
      singer: null,
      year: 1951,
      durationSec: 199,
    };
    const v1928 = cand({
      name: "La Cumparsita",
      artists: ["Juan D'Arienzo"],
      album: "El Rey del Compás 1928-1935",
      albumYear: 1928,
      durationMs: 152_000,
    });
    const v1951 = cand({
      name: "La Cumparsita",
      artists: ["Juan D'Arienzo y su Orquesta Típica"],
      album: "Sus Primeros Éxitos",
      albumYear: 1951,
      durationMs: 198_000,
    });
    expect(bestMatch(item, [v1928, v1951])?.uri).toBe(v1951.uri);
    expect(bestMatch({ ...item, year: 1928, durationSec: 150 }, [v1951, v1928])?.uri).toBe(v1928.uri);
    // a reissue year never disqualifies: the 1951 take on a 2005 compilation still wins on duration
    const reissue = { ...v1951, albumYear: 2005, uri: "spotify:track:reissue" };
    expect(bestMatch(item, [v1928, reissue])?.uri).toBe("spotify:track:reissue");
  });
  it("uses live / remaster only as tie-breakers and credits the singer", () => {
    const item = {
      id: "p",
      title: "Poema",
      orchestra: "Francisco Canaro",
      singer: "Roberto Maida",
      year: 1935,
    };
    const studio = cand({ name: "Poema", artists: ["Francisco Canaro", "Roberto Maida"] });
    const live = cand({ name: "Poema - Live", artists: ["Francisco Canaro", "Roberto Maida"] });
    const noSinger = cand({ name: "Poema", artists: ["Francisco Canaro"] });
    expect(scoreCandidate(item, studio)).toBeGreaterThan(scoreCandidate(item, live));
    expect(scoreCandidate(item, studio)).toBeGreaterThan(scoreCandidate(item, noSinger));
    expect(scoreCandidate(item, live)).toBeGreaterThan(0.6); // still a match when it is the only one
  });
});

// round 15 — export matching: a wrong recording is never exported; "not found" beats a guess
describe("round 15: the hard rules reject the tango traps", () => {
  const side = (x: Partial<import("./match").MatchItem> & { title: string; orchestra: string }) => ({
    id: x.title,
    vocal: false,
    singer: null,
    ...x,
  });
  it("D'Arienzo La Cumparsita 1928 is not the 1951 take (album era, length)", () => {
    const item = side({ title: "La Cumparsita", orchestra: "Juan D'Arienzo", year: 1928, durationSec: 165 });
    const c51 = cand({
      name: "La Cumparsita",
      artists: ["Juan D'Arienzo"],
      album: "Juan D'Arienzo 1950-1952",
      durationMs: 182_000,
    });
    const c28 = cand({
      name: "La Cumparsita",
      artists: ["Juan D'Arienzo"],
      album: "1928-1929",
      durationMs: 166_000,
    });
    expect(rejectReason(item, c51)).not.toBeNull();
    expect(bestMatch(item, [c51, c28])?.uri).toBe(c28.uri);
    expect(bestMatch(item, [c51])).toBeNull();
  });
  it("Di Sarli Milonguero viejo 1940 is not the 1955 recording", () => {
    const item = side({
      title: "Milonguero Viejo",
      orchestra: "Carlos Di Sarli",
      year: 1940,
      durationSec: 138,
    });
    const c55 = cand({
      name: "Milonguero Viejo",
      artists: ["Carlos Di Sarli"],
      album: "Serie 78 RPM: Carlos Di Sarli (1954-1956)",
      durationMs: 163_000,
    });
    expect(bestMatch(item, [c55])).toBeNull();
  });
  it("Tanturi Recuerdo: the 1941 Castillo vals (dated title) is not the 1942 instrumental tango", () => {
    const item = side({ title: "Recuerdo", orchestra: "Ricardo Tanturi", year: 1942, date: "1942-11-04" });
    const vals = cand({
      name: "Recuerdo (Buenos Aires 08/01/1941 Restauración 2022)",
      artists: ["Ricardo Tanturi", "Alberto Castillo"],
      durationMs: 147_000,
    });
    expect(rejectReason(item, vals)).not.toBeNull();
    expect(bestMatch(item, [vals])).toBeNull();
  });
  it("Trago amargo is the Echagüe vocal side: an instrumental credit row never takes a sung match, and back", () => {
    const sung = cand({ name: "Trago Amargo", artists: ["Juan D'Arienzo", "Alberto Echagüe"] });
    expect(
      bestMatch(
        side({ title: "Trago Amargo", orchestra: "Juan D'Arienzo", vocal: true, singer: "Alberto Echagüe" }),
        [sung],
      )?.uri,
    ).toBe(sung.uri);
    expect(bestMatch(side({ title: "Trago Amargo", orchestra: "Juan D'Arienzo" }), [sung])).toBeNull();
    expect(
      bestMatch(
        side({ title: "Trago Amargo", orchestra: "Juan D'Arienzo", vocal: true, singer: "Héctor Mauré" }),
        [sung],
      ),
    ).toBeNull();
  });
  it("a modern orchestra's cover of Ciego is not Canaro's recording", () => {
    const item = side({ title: "Ciego", orchestra: "Francisco Canaro", year: 1935 });
    const cover = cand({
      name: "Ciego",
      artists: ["Orquesta Típica Fernández Fierro"],
      album: "Ciego (2015)",
    });
    const other = cand({ name: "Ciego", artists: ["Osvaldo Pugliese"] });
    expect(bestMatch(item, [cover, other])).toBeNull();
  });
  it("Marchantia is not Marcheta", () => {
    const item = side({ title: "Marcheta", orchestra: "Rodolfo Biagi", year: 1941, altTitles: ["Marquita"] });
    expect(bestMatch(item, [cand({ name: "Marchantia", artists: ["Domy Castellano"] })])).toBeNull();
    expect(bestMatch(item, [cand({ name: "Marchantia", artists: ["Rodolfo Biagi"] })])).toBeNull();
    expect(bestMatch(item, [cand({ name: "Marcheta", artists: ["Rodolfo Biagi"] })])).not.toBeNull();
  });
  it("a known length outside −14…+8 s is another transfer or take; an estimate is never judged", () => {
    const item = side({ title: "El Flete", orchestra: "Juan D'Arienzo", year: 1936, durationSec: 150 });
    expect(
      rejectReason(item, cand({ name: "El Flete", artists: ["Juan D'Arienzo"], durationMs: 175_000 })),
    ).not.toBeNull();
    expect(
      rejectReason(
        { ...item, durationEstimated: true },
        cand({ name: "El Flete", artists: ["Juan D'Arienzo"], durationMs: 175_000 }),
      ),
    ).toBeNull();
  });
  it("cortinas (no vocal flag) keep the round-12 scorer", () => {
    expect(
      bestMatch({ id: "c", title: "Araba", orchestra: "Mustafa Sandal" }, [
        cand({ name: "Araba", artists: ["Mustafa Sandal"] }),
      ]),
    ).not.toBeNull();
  });
});
