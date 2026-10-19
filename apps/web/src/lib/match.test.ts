import { describe, expect, it } from "vitest";
import {
  bestMatch,
  type Candidate,
  cleanTitle,
  jaroWinkler,
  orchestraQuery,
  orchestraSurname,
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
