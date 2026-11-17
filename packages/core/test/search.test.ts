import { beforeAll, describe, expect, it } from "vitest";
import {
  buildSongIndex,
  buildTextIndex,
  creditPeople,
  editDistance,
  foldText,
  parseSongQuery,
  type SongIndex,
  type SongSearchOptions,
  searchSongs,
  searchText,
} from "../src/index";
import { loadCatalog } from "../src/load";
import type { Song } from "../src/types";

/**
 * The shared search engine (2026-11, "search in Library doesn't work nicely, and the regex isn't nice either"):
 * accent-, case- and apostrophe-blind, tokenised over title / orchestra / singer / year / album, typo-tolerant,
 * inline filters, ranked by relevance then popularity then a playable stream, over a prebuilt inverted index.
 */

const song = (id: string, p: Partial<Song>): Song =>
  ({
    id,
    title: "Untitled",
    rhythm: "tango",
    orchestra: "Juan D'Arienzo",
    orchestraId: "juan-d-arienzo",
    singer: null,
    singerId: null,
    vocal: false,
    year: 1940,
    era: "golden-peak",
    ...p,
  }) as Song;

const SONGS: Song[] = [
  song("conoces", {
    title: "Ahora No Me Conocés",
    orchestra: "Rodolfo Biagi",
    orchestraId: "rodolfo-biagi",
    singer: "Jorge Ortíz",
    singerId: "jorge-ortiz",
    vocal: true,
    year: 1941,
  }),
  song("derecho", { title: "Derecho Viejo", year: 1945 }),
  song("pensalo", { title: "Pensalo Bien", year: 1938, singer: "Alberto Echagüe", vocal: true }),
  song("ventarron", {
    title: "Ventarrón",
    orchestra: "Orquesta Típica Víctor",
    orchestraId: "orquesta-tipica-victor",
    singer: "Alberto Gómez",
    vocal: true,
    year: 1933,
  }),
  song("recuerdo", {
    title: "Recuerdo",
    orchestra: "Osvaldo Pugliese",
    orchestraId: "osvaldo-pugliese",
    year: 1944,
    fame: 5,
  }),
  song("recuerdo-late", {
    title: "Recuerdo",
    orchestra: "Osvaldo Pugliese",
    orchestraId: "osvaldo-pugliese",
    year: 1966,
    fame: 1,
  }),
  song("yunta", {
    title: "La Yumba",
    orchestra: "Osvaldo Pugliese",
    orchestraId: "osvaldo-pugliese",
    year: 1946,
    fame: 5,
    spotify: { uri: "spotify:track:1" },
  }),
  song("shusheta", {
    title: "Shusheta",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    year: 1940,
  }),
  song("sarli-rufino", {
    title: "Corazón",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    singer: "Roberto Rufino",
    singerId: "roberto-rufino",
    vocal: true,
    year: 1941,
  }),
  song("sarli-rufino-39", {
    title: "Retirao",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    singer: "Roberto Rufino",
    vocal: true,
    year: 1939,
  }),
  song("sarli-inst-41", {
    title: "La Cachila",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    year: 1941,
  }),
  song("sarli-vals", {
    title: "Rosamel",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    rhythm: "vals",
    singer: "Roberto Rufino",
    vocal: true,
    year: 1942,
  }),
  song("laurenz-milonga", {
    title: "Milonga de Mis Amores",
    orchestra: "Pedro Láurenz",
    orchestraId: "pedro-laurenz",
    rhythm: "milonga",
    singer: "Héctor Farrel",
    vocal: true,
    year: 1937,
  }),
  song("nina", {
    title: "Niño Bien",
    orchestra: "Ricardo Tanturi",
    orchestraId: "ricardo-tanturi",
    year: 1948,
  }),
  song("recuerdos", {
    title: "Recuerdos de Bohemia",
    orchestra: "Enrique Rodríguez",
    orchestraId: "enrique-rodriguez",
    year: 1940,
  }),
];

const ALIASES: Record<string, string[]> = {
  "orquesta-tipica-victor": ["OTV", "Típica Victor", "Orquesta Victor"],
  "juan-d-arienzo": ["D'Arienzo", "Darienzo", "El Rey del Compás"],
  "osvaldo-pugliese": ["Pugliese", "San Pugliese"],
};

let idx: SongIndex;
const ids = (q: string, opts?: SongSearchOptions) =>
  searchSongs(idx, q, { limit: 100, ...opts }).items.map((h) => h.song.id);

beforeAll(() => {
  idx = buildSongIndex(SONGS, { aliases: (id) => ALIASES[id] });
});

describe("normalisation", () => {
  it("folds accents, case, ñ and apostrophes", () => {
    expect(foldText("Ahora No Me Conocés")).toBe("ahora no me conoces");
    expect(foldText("Niño")).toBe("nino");
    expect(foldText("D'Arienzo")).toBe("darienzo");
    expect(foldText("D’Arienzo")).toBe("darienzo");
    expect(foldText("ÁNGEL")).toBe("angel");
    expect(foldText("Işık")).toBe("isik");
  });
  it("bounded edit distance (transpositions count once)", () => {
    expect(editDistance("pugliese", "pugliesse", 2)).toBe(1);
    expect(editDistance("ventarron", "ventaron", 2)).toBe(1);
    expect(editDistance("abcd", "abdc", 2)).toBe(1);
    expect(editDistance("tango", "milonga", 2)).toBeGreaterThan(2);
  });
});

describe("matching", () => {
  it("accents and case: 'conoces' finds Ahora No Me Conocés", () => {
    expect(ids("conoces")).toContain("conoces");
    expect(ids("CONOCÉS")).toContain("conoces");
    expect(ids("ahora no me")).toContain("conoces");
  });
  it("apostrophes: darienzo = d'arienzo = d arienzo", () => {
    const a = ids("darienzo");
    expect(a).toContain("derecho");
    expect(ids("d'arienzo")).toEqual(a);
    expect(ids("D’Arienzo")).toEqual(a);
    expect(ids("d arienzo")).toEqual(a);
  });
  it("aliases from the orchestra profiles: OTV, Típica Víctor, Orquesta Tipica Victor", () => {
    expect(ids("otv")).toEqual(["ventarron"]);
    expect(ids("tipica victor")).toEqual(["ventarron"]);
    expect(ids("orquesta tipica victor")).toEqual(["ventarron"]);
    expect(ids("Típica Víctor ventarrón")).toEqual(["ventarron"]);
  });
  it("spelling variants and typos", () => {
    expect(ids("pugliesse")).toEqual(expect.arrayContaining(["recuerdo", "yunta"]));
    expect(ids("puglieze")).toEqual(expect.arrayContaining(["recuerdo", "yunta"]));
    expect(ids("ventaron")).toContain("ventarron");
    expect(ids("shuseta")).toContain("shusheta");
    expect(ids("laurenz")).toEqual(["laurenz-milonga"]);
    // short tokens are not fuzzed: "tan" must not match "tango"-ish noise by edit distance
    expect(ids("xyz")).toEqual([]);
  });
  it("multi-field AND: di sarli rufino 1941", () => {
    expect(ids("di sarli rufino 1941")).toEqual(["sarli-rufino"]);
    expect(ids("rufino di sarli")).toEqual(
      expect.arrayContaining(["sarli-rufino", "sarli-rufino-39", "sarli-vals"]),
    );
    expect(ids("disarli 1941").sort()).toEqual(["sarli-inst-41", "sarli-rufino"]);
  });
  it("prefix matching on the last token as the DJ types", () => {
    expect(ids("di sarli ruf")).toEqual(expect.arrayContaining(["sarli-rufino", "sarli-rufino-39"]));
    expect(ids("pensal")).toEqual(["pensalo"]);
    // a non-final token must match a whole word (or a typo of one)
    expect(ids("pens bien")).toEqual([]);
  });
});

describe("filters", () => {
  it("year ranges: year:1940-1945, 1940-45 and 40s", () => {
    const r = ids("di sarli year:1940-1941");
    expect(r.sort()).toEqual(["sarli-inst-41", "sarli-rufino", "shusheta"]);
    expect(ids("di sarli 1940-41").sort()).toEqual(r);
    expect(ids("pugliese 40s").sort()).toEqual(["recuerdo", "yunta"]);
    expect(ids("pugliese 1960s")).toEqual(["recuerdo-late"]);
    expect(parseSongQuery("40s").filters).toMatchObject({ yearFrom: 1940, yearTo: 1949 });
    expect(parseSongQuery("1940–45").filters).toMatchObject({ yearFrom: 1940, yearTo: 1945 });
  });
  it("rhythm and instrumental tokens", () => {
    expect(ids("di sarli vals")).toEqual(["sarli-vals"]);
    expect(ids("rhythm:milonga")).toEqual(["laurenz-milonga"]);
    expect(ids("di sarli instrumental").sort()).toEqual(["sarli-inst-41", "shusheta"]);
    expect(ids("di sarli inst 1941")).toEqual(["sarli-inst-41"]);
    expect(ids("di sarli vocal").sort()).toEqual(["sarli-rufino", "sarli-rufino-39", "sarli-vals"]);
  });
  it("chips (opts.filters) narrow and the facets count", () => {
    const all = searchSongs(idx, "di sarli", { limit: 100 });
    expect(all.total).toBe(5);
    expect(all.facets.rhythm).toEqual(
      expect.arrayContaining([
        { key: "tango", count: 4 },
        { key: "vals", count: 1 },
      ]),
    );
    expect(all.facets.vocal).toEqual({ vocal: 3, instrumental: 2 });
    const valses = searchSongs(idx, "di sarli", { filters: { rhythms: ["vals"] } });
    expect(valses.total).toBe(1);
    // a facet's own chip does not hide its siblings (disjunctive counts)
    expect(valses.facets.rhythm).toEqual(expect.arrayContaining([{ key: "tango", count: 4 }]));
    expect(searchSongs(idx, "", { filters: { decades: [1930] } }).total).toBe(4);
    expect(
      searchSongs(idx, "pugliese", { filters: { favourites: ["recuerdo"], favouritesOnly: true } }).items.map(
        (h) => h.song.id,
      ),
    ).toEqual(["recuerdo"]);
    expect(
      searchSongs(idx, "pugliese", { filters: { hasStream: true } }).items.map((h) => h.song.id),
    ).toEqual(["yunta"]);
  });
  it("t12 selects a tanda of the night when the caller gives placements", () => {
    const tandaOf = (id: string) => (id === "yunta" ? 12 : id === "recuerdo" ? 3 : undefined);
    expect(ids("t12", { tandaOf })).toEqual(["yunta"]);
    expect(ids("pugliese t3", { tandaOf })).toEqual(["recuerdo"]);
    expect(parseSongQuery("t12").filters.tanda).toBe(12);
  });
  it("special characters never throw and are matched literally", () => {
    for (const q of [
      "(",
      "[",
      "*",
      "?",
      "+",
      "\\",
      "a(b",
      "[di sarli",
      "pugliese*",
      ".*",
      "^$",
      "%",
      "rhythm:",
      "year:abc",
      "t",
      "'",
      "\u0000",
      "a".repeat(5000),
    ])
      expect(() => searchSongs(idx, q)).not.toThrow();
    expect(ids("(pugliese)").length).toBeGreaterThan(0);
    expect(ids(".*")).toEqual([]);
  });
});

describe("ranking", () => {
  it("an exact title beats a prefix and a fuzzy one", () => {
    const r = ids("recuerdo");
    expect(r.slice(0, 2).sort()).toEqual(["recuerdo", "recuerdo-late"]);
    expect(r.indexOf("recuerdos")).toBeGreaterThan(1);
  });
  it("a title match outranks an orchestra / singer match", () => {
    const i2 = buildSongIndex([
      song("o", { title: "Otra Cosa", orchestra: "Biagi", orchestraId: "biagi" }),
      song("t", { title: "Biagi Blues", orchestra: "Canaro", orchestraId: "canaro" }),
    ]);
    expect(searchSongs(i2, "biagi").items.map((h) => h.song.id)).toEqual(["t", "o"]);
  });
  it("fame breaks a tie, then a playable stream", () => {
    expect(ids("recuerdo").slice(0, 2)).toEqual(["recuerdo", "recuerdo-late"]);
    const i3 = buildSongIndex([
      song("a", { title: "Gallo Ciego" }),
      song("b", { title: "Gallo Ciego", spotify: { uri: "spotify:track:x" } }),
    ]);
    expect(searchSongs(i3, "gallo ciego").items.map((h) => h.song.id)).toEqual(["b", "a"]);
  });
  it("highlights the matched words in the original text", () => {
    const h = searchSongs(idx, "conoces biagi").items[0]!;
    expect(h.highlights.title).toEqual([[12, 19]]);
    expect(h.highlights.orchestra).toEqual([[8, 13]]);
  });
  it("groups by orchestra on request", () => {
    const r = searchSongs(idx, "recuerdo", { group: "orchestra" });
    const orchs = r.items.map((h) => h.song.orchestraId);
    expect(orchs).toEqual([...orchs].sort((a, b) => orchs.indexOf(a) - orchs.indexOf(b)));
    expect(r.groups?.map((g) => g.orchestraId)).toEqual(["osvaldo-pugliese", "enrique-rodriguez"]);
  });
  it("did you mean: 0 results and a close word exists", () => {
    const r = searchSongs(idx, "zugliasse yumba");
    expect(r.total).toBe(0);
    expect(r.suggestion).toBe("pugliese yumba");
    expect(searchSongs(idx, "zzzzzz").suggestion).toBeUndefined();
  });
  it("paginates", () => {
    const a = searchSongs(idx, "", { limit: 4 });
    const b = searchSongs(idx, "", { limit: 4, offset: 4 });
    expect(a.total).toBe(SONGS.length);
    expect(a.items).toHaveLength(4);
    expect(b.items.map((h) => h.song.id).some((id) => a.items.some((h) => h.song.id === id))).toBe(false);
  });
});

describe("generic text index (cortinas, orchestras, singers)", () => {
  const rows = [
    { id: "1", title: "Şımarık", artist: "Tarkan", genre: "pop", culture: "turkish" },
    { id: "2", title: "Kuzu Kuzu", artist: "Tarkan", genre: "pop", culture: "turkish" },
    { id: "3", title: "In the Mood", artist: "Glenn Miller", genre: "swing", culture: "global" },
  ];
  const ti = buildTextIndex(rows, [
    { name: "title", weight: 10, get: (r) => r.title },
    { name: "artist", weight: 6, get: (r) => r.artist },
    { name: "genre", weight: 2, get: (r) => r.genre },
    { name: "culture", weight: 2, get: (r) => r.culture },
  ]);
  it("matches every field, folded and typo-tolerant", () => {
    expect(
      searchText(ti, "tarkan")
        .items.map((h) => h.doc.id)
        .sort(),
    ).toEqual(["1", "2"]);
    expect(searchText(ti, "simarik").items.map((h) => h.doc.id)).toEqual(["1"]);
    expect(searchText(ti, "swing").items.map((h) => h.doc.id)).toEqual(["3"]);
    expect(searchText(ti, "glen miler").items.map((h) => h.doc.id)).toEqual(["3"]);
    expect(searchText(ti, "turkish kuzu").items.map((h) => h.doc.id)).toEqual(["2"]);
    expect(() => searchText(ti, "[(*?")).not.toThrow();
  });
});

describe("the real index (19k sides)", () => {
  let real: SongIndex;
  let songs: Song[];
  beforeAll(() => {
    const deps = loadCatalog();
    songs = deps.catalog.songs;
    real = deps.catalog.searchIndex();
  });
  const first = (q: string, n = 20) => searchSongs(real, q, { limit: n }).items.map((h) => h.song);
  it("the owner's queries", () => {
    expect(first("conoces").some((s) => s.title === "Ahora No Me Conocés")).toBe(true);
    expect(first("ventaron").some((s) => s.title === "Ventarrón")).toBe(true);
    expect(first("shuseta").some((s) => s.title === "Shusheta")).toBe(true);
    expect(first("pugliesse").filter((s) => s.orchestraId.includes("pugliese")).length).toBeGreaterThan(15);
    expect(first("otv").every((s) => s.orchestraId === "orquesta-tipica-victor")).toBe(true);
    const r = searchSongs(real, "di sarli rufino 1941", { limit: 50 });
    expect(r.total).toBeGreaterThan(5);
    expect(
      r.items.every(
        (h) => /sarli/.test(h.song.orchestraId) && h.song.year === 1941 && /Rufino/.test(h.song.singer ?? ""),
      ),
    ).toBe(true);
    const inst = searchSongs(real, "di sarli 1941 instrumental", { limit: 50 });
    expect(inst.items.map((h) => h.song.title)).toEqual(expect.arrayContaining(["La Cachila", "Marejada"]));
    expect(inst.items.every((h) => !h.song.singer)).toBe(true);
  });
  it("a singer named with the orchestra finds the singer's sides, not the orchestra's alias ('Troilo-Fiorentino')", () => {
    for (const q of ["fiorentino troilo", "troilo fiorentino"]) {
      const top = first(q, 10);
      expect(top).toHaveLength(10);
      for (const s of top) {
        expect(s.orchestraId, q).toBe("anibal-troilo");
        expect(s.singer ?? "", `${q}: ${s.title} ${s.year}`).toMatch(/Fiorentino/);
      }
    }
    // the other pairings in the profiles: the same rule
    expect(first("donato lagos", 10).every((s) => /Lagos/.test(s.singer ?? ""))).toBe(true);
    expect(first("canaro maida", 10).every((s) => /Maida/.test(s.singer ?? ""))).toBe(true);
    // the alias still finds the orchestra by its own name
    expect(first("troilo-fiorentino", 10).every((s) => s.orchestraId === "anibal-troilo")).toBe(true);
    expect(
      first("pichuco", 10).filter((s) => s.orchestraId === "anibal-troilo").length,
    ).toBeGreaterThanOrEqual(5);
  });
  it("Catalog.search keeps its shape (Song[]) on the new engine", () => {
    const deps = loadCatalog();
    expect(
      deps.catalog
        .search("darienzo 1938", 40)
        .every((s) => s.orchestraId.includes("arienzo") && s.year === 1938),
    ).toBe(true);
  });
  it(`builds once and answers p95 < 15 ms over ${19000}+ sides`, () => {
    expect(songs.length).toBeGreaterThan(18000);
    const qs = [
      "conoces",
      "di sarli rufino 1941",
      "pugliesse",
      "ventaron",
      "d'arienzo 1938",
      "otv",
      "vals",
      "milonga 40s",
      "troilo fiorentino",
      "laurenz",
      "a",
      "la",
      "el",
      "recuerdo",
      "di sarli 1941 instrumental",
      "canaro 1935-38",
      "biagi",
      "tanturi castillo",
      "shuseta",
      "corazon",
      "de angelis",
      "calo",
      "caló berón",
      "poema",
      "nostalgias",
      "yo soy",
      "rhythm:vals year:1940-1945",
      "gallo ciego",
      "invierno",
      "fresedo ray",
    ];
    for (const q of qs) searchSongs(real, q); // warm the JIT
    // wall clock and this process's CPU time per query: on a shared CI box the wall clock also counts the time other
    // processes held the cores, so the budget is held on the CPU the query itself spent
    const wall: number[] = [];
    const cpu: number[] = [];
    for (let k = 0; k < 3; k++)
      for (const q of qs) {
        // as the DJ types: every prefix of the query
        for (let i = 1; i <= q.length; i += Math.max(1, Math.floor(q.length / 4))) {
          const c0 = process.cpuUsage();
          const t0 = performance.now();
          searchSongs(real, q.slice(0, i));
          wall.push(performance.now() - t0);
          const c = process.cpuUsage(c0);
          cpu.push((c.user + c.system) / 1000);
        }
      }
    const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)]!;
    const p95 = pct(cpu, 0.95);
    console.log(
      `search wall p50 ${pct(wall, 0.5).toFixed(2)} ms · p95 ${pct(wall, 0.95).toFixed(2)} ms · cpu p50 ${pct(cpu, 0.5).toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · n=${wall.length}`,
    );
    expect(p95).toBeLessThan(15);
  });
});

describe("a raw accompanists' credit is found by the names it stands for (2026-11)", () => {
  // the catalogue files Gardel's guitar sides under "J.ricardo-G.barbieri-J.m.aguilar"; the Library reads it as
  // "José Ricardo, Guillermo Barbieri, José María Aguilar (guitars)", so a search for those names must find it
  const gardel = song("gardel", {
    title: "Mi Buenos Aires Querido",
    orchestra: "J.ricardo-G.barbieri-J.m.aguilar",
    orchestraId: "j-ricardo-g-barbieri-j-m-aguilar",
    singer: "Carlos Gardel",
    vocal: true,
    year: 1934,
  });
  const idx = buildSongIndex([...SONGS, gardel]);
  it("the full names find the side", () => {
    for (const q of ["Guillermo Barbieri", "José María Aguilar", "jose ricardo", "barbieri"])
      expect(searchSongs(idx, q).items.map((h) => h.song.id)).toContain("gardel");
  });
  it("creditPeople reads the credit as people; any other name has none", () => {
    expect(creditPeople("J.ricardo-G.barbieri-J.m.aguilar")).toEqual([
      "José Ricardo",
      "Guillermo Barbieri",
      "José María Aguilar",
    ]);
    expect(creditPeople("A.troilo-R.grela")).toEqual(["Aníbal Troilo", "Roberto Grela"]);
    expect(creditPeople("E.baffa-O.berlinghieri")).toEqual(["E. Baffa", "O. Berlinghieri"]);
    expect(creditPeople("Carlos Di Sarli")).toEqual([]);
    expect(creditPeople("Francini-Pontier")).toEqual([]);
  });
  it("only the credited side gets the names (a first name finds nothing else)", () => {
    expect(searchSongs(idx, "guillermo").items.map((h) => h.song.id)).toEqual(["gardel"]);
  });
});
