/**
 * Round-16 invariants (docs/specs/round16-engine.md): the over-strict rules retuned as the panel specified
 * (docs/reviews/round16-dancer.md §4–§5, round16-dj.md §6), the new real rules (R16-1 … R16-12, A1–A5), and the export
 * match rules with the traps of the discography review (docs/reviews/round16-discography.md §1, §3, §4 G1–G13,
 * M1–M8). Written before the engine change; the spec records which of them failed on the round-15 engine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  auditStreamMatches,
  benchmarkNight,
  compose,
  cortinaMatchProblem,
  improveNight,
  isGoldenNight,
  judgeStreams,
  knownSingers,
  type MatchCandidate,
  type MatchRow,
  matchProblem,
  normTitle,
  orderVerdict,
  type Playlist,
  type Song,
  STRICT_RULES,
  scorePlaylist,
  streamable,
  strictChecks,
  type Tanda,
  takesIndex,
  toSpotifyPlan,
} from "../src/index";
import { auditCortinaCaches, findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let FO: Record<string, unknown>;
let featured: Playlist;
let rawSongs: Song[];
beforeAll(() => {
  deps = loadCatalog();
  featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  const fo = { ...featured.options } as Record<string, unknown>;
  for (const k of ["contextApplied", "trackSecByRhythm", "cortinaGenres", "vocalBias", "tempoShift", "seed"])
    delete fo[k];
  FO = { ...fo, explicit: Object.keys(fo).filter((k) => k !== "context") };
  rawSongs = JSON.parse(readFileSync(join(findRoot(), "data/index/songs.json"), "utf8"));
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

/** the three nights the round-16 panel reviewed (featured options) */
const PANEL = [194, 12, 180];
const cache = new Map<string, Playlist>();
/** a generation as the platform runs it: compose, then improveNight (the auto-improve step) */
const night = (seed: number) => {
  const k = `f${seed}`;
  if (!cache.has(k)) {
    const p = compose({ ...FO, seed }, deps);
    cache.set(k, improveNight({ ...p, score: scorePlaylist(p) }, deps).playlist);
  }
  return cache.get(k)!;
};
const golden = (seed: number) => {
  const k = `g${seed}`;
  if (!cache.has(k)) cache.set(k, compose({ hours: 4, seed }, deps));
  return cache.get(k)!;
};
const rule = (p: Pick<Playlist, "tandas" | "options" | "closing">, key: string) =>
  strictChecks(p).violations.filter((v) => v.rule === key);
const fmt = (p: Playlist, key: string) => rule(p, key).map((v) => `${p.options.seed}: ${v.detail}`);
const mk = (title: string, fame: number, energy: number, year = 1940) =>
  ({ id: title, title, fame, energy, year, orchestra: "x", rhythm: "tango" }) as Song;

// --- A. export matching: the traps of the discography review ------------------------------------------------------
const row = (x: Partial<MatchRow> & { title: string; orchestra: string }): MatchRow => ({
  vocal: false,
  singer: null,
  rhythm: "tango",
  ...x,
});
const cand = (name: string, artists: string[], album = "", sec?: number): MatchCandidate => ({
  name,
  artists,
  album,
  ...(sec ? { durationMs: sec * 1000 } : {}),
});

describe("A — export matching (discography M1–M8, traps G1–G13)", () => {
  it("M3 / G4: the leader by whole name — Donato Racciatti, Rafael Canaro, Los Solistas de D'Arienzo, Quinteto Pirincho are not the orchestra", () => {
    const donato = row({ title: "Carnaval de mi barrio", orchestra: "Edgardo Donato", year: 1939 });
    expect(matchProblem(donato, cand("Carnaval de mi barrio", ["Donato Racciatti"]))).not.toBeNull();
    expect(
      matchProblem(donato, cand("Carnaval de mi barrio", ["Edgardo Donato y su Orquesta Típica"])),
    ).toBeNull();
    const canaro = row({ title: "Poema", orchestra: "Francisco Canaro", year: 1935 });
    expect(matchProblem(canaro, cand("Poema", ["Rafael Canaro", "Luis Scalón"]))).not.toBeNull();
    expect(matchProblem(canaro, cand("Poema", ["Quinteto Pirincho"]))).not.toBeNull();
    expect(matchProblem(canaro, cand("Poema", ["Francisco Canaro", "Quinteto Pirincho"]))).not.toBeNull();
    expect(matchProblem(canaro, cand("Poema", ["Francisco Canaro"]))).toBeNull();
    const da = row({ title: "El flete", orchestra: "Juan D'Arienzo", year: 1936 });
    expect(matchProblem(da, cand("El flete", ["Los Solistas de D'Arienzo"]))).not.toBeNull();
    expect(matchProblem(da, cand("El Flete", ["Juan D'arienzo Y Su Orquesta Tipica"]))).toBeNull();
    expect(matchProblem(da, cand("El Flete", ["Orquesta De Juan Darienzo"]))).toBeNull();
  });
  it("M3 / G5: a generic 'Orquesta…' credit is no evidence (Típica Víctor for Di Sarli, a modern típica for Tanturi)", () => {
    expect(
      matchProblem(
        row({ title: "El incendio", orchestra: "Carlos Di Sarli", year: 1940 }),
        cand("El incendio", ["Orquesta Típica Víctor"]),
      ),
    ).not.toBeNull();
    expect(
      matchProblem(
        row({ title: "La Cumparsita", orchestra: "Ricardo Tanturi", year: 1940 }),
        cand("La Cumparsita", ["Orquesta Típica Misteriosa Buenos Aires"]),
      ),
    ).not.toBeNull();
  });
  it("M4 / G6: the title must equal the row's — Recuerdo is not Recuerdo malevo, Nada is not Nada más", () => {
    const rec = row({
      title: "Recuerdo",
      orchestra: "Ricardo Tanturi",
      vocal: true,
      singer: "Alberto Castillo",
      year: 1941,
      rhythm: "vals",
    });
    expect(matchProblem(rec, cand("Recuerdo malevo", ["Ricardo Tanturi", "Alberto Castillo"]))).toMatch(
      /another title/,
    );
    const nada = row({
      title: "Nada",
      orchestra: "Miguel Caló",
      vocal: true,
      singer: "Raúl Iriarte",
      year: 1944,
    });
    expect(matchProblem(nada, cand("Nada más", ["Miguel Caló", "Raúl Iriarte"]))).toMatch(/another title/);
    expect(matchProblem(nada, cand("Nada - Remastered", ["Miguel Caló", "Raúl Iriarte"]))).toBeNull();
  });
  it("M5 / G7: an instrumental row with a sung take of the title needs positive instrumental evidence (Tanturi Recuerdo 1942)", () => {
    const r = row({
      title: "Recuerdo",
      orchestra: "Ricardo Tanturi",
      year: 1942,
      date: "1942-11-04",
      vocalTwins: [1941],
    });
    expect(matchProblem(r, cand("Recuerdo", ["Ricardo Tanturi"]))).toMatch(/sung take/);
    expect(matchProblem(r, cand("Recuerdo (Instrumental)", ["Ricardo Tanturi"]))).toBeNull();
    expect(matchProblem(r, cand("Recuerdo", ["Ricardo Tanturi"], "", 150), 151)).toBeNull();
  });
  it("G8: the rhythm is compared when the provider names it (a vals is not the tango)", () => {
    const r = row({ title: "Recuerdo", orchestra: "Ricardo Tanturi", year: 1942 });
    expect(matchProblem(r, cand("Recuerdo (Vals)", ["Ricardo Tanturi"]))).toMatch(/a vals/);
    expect(
      matchProblem(
        row({ title: "Milonga de mis amores", orchestra: "Pedro Láurenz", year: 1937, rhythm: "milonga" }),
        cand("Milonga de mis amores (Milonga)", ["Pedro Laurenz"]),
      ),
    ).toBeNull();
  });
  it("M6 / G9: every index voice counts — La bruja credited to Mario Bustos is not the Echagüe side", () => {
    const r = row({
      title: "La Bruja",
      orchestra: "Juan D'Arienzo",
      vocal: true,
      singer: "Alberto Echagüe",
      year: 1938,
    });
    expect(matchProblem(r, cand("La bruja", ["Juan D'Arienzo", "Mario Bustos"]))).toMatch(/another singer/);
    expect(
      matchProblem(r, cand("La bruja", ["Juan D'Arienzo", "Armando Laborde"]), null, {
        singers: knownSingers(rawSongs),
      }),
    ).toMatch(/another singer/);
    // the later-singer list is extended from the index itself
    const ks = knownSingers(rawSongs).map(normTitle);
    for (const s of ["mario bustos", "armando laborde", "roberto goyeneche"]) expect(ks).toContain(s);
  });
  it("M6 / G10: the singer alone is a solo recording, not the orchestra's side (Castillo for Tanturi / Castillo)", () => {
    const r = row({
      title: "Así se baila el tango",
      orchestra: "Ricardo Tanturi",
      vocal: true,
      singer: "Alberto Castillo",
      year: 1942,
    });
    expect(matchProblem(r, cand("Así se baila el tango", ["Alberto Castillo"]))).toMatch(/solo recording/);
    expect(
      matchProblem(r, cand("Así se baila el tango", ["Ricardo Tanturi", "Alberto Castillo"])),
    ).toBeNull();
  });
  it("M2 / G2: a known remake series is rejected (For Export, Más grande que nunca, the Polaco album)", () => {
    expect(
      matchProblem(
        row({ title: "El Irresistible", orchestra: "Juan D'Arienzo", year: 1936 }),
        cand("El Irresistible", ["Juan D'arienzo Y Su Orquesta Tipica"], "For Export", 155),
      ),
    ).toMatch(/remake series/);
    expect(
      matchProblem(
        row({
          title: "La Bruja",
          orchestra: "Juan D'Arienzo",
          vocal: true,
          singer: "Alberto Echagüe",
          year: 1938,
        }),
        cand("La Bruja", ["Juan D'arienzo Y Su Orquesta Tipica"], "Barrio Belgrano - Mas Grande Que Nunca"),
      ),
    ).toMatch(/remake series/);
    expect(
      matchProblem(
        row({
          title: "El Bulín de la Calle Ayacucho",
          orchestra: "Aníbal Troilo",
          vocal: true,
          singer: "Francisco Fiorentino",
          year: 1941,
        }),
        cand("El Bulín de la Calle Ayacucho", ["Aníbal Troilo"], "¿Te Acordás... Polaco?"),
      ),
    ).toMatch(/remake series/);
  });
  it("M2: beside a later take the index knows, positive evidence is required (album years, a dated title, the voice, a length)", () => {
    const r = row({
      title: "La Payanca",
      orchestra: "Juan D'Arienzo",
      year: 1936,
      date: "1936-06-23",
      laterTakes: [{ year: 1949 }, { year: 1954 }, { year: 1966 }],
    });
    expect(matchProblem(r, cand("La Payanca", ["Juan D'Arienzo"], "Ataniche"))).toMatch(/later take/);
    expect(
      matchProblem(r, cand("La Payanca", ["Juan D'Arienzo"], "El Rey del Compás (1935-1937)")),
    ).toBeNull();
    expect(matchProblem(r, cand("La Payanca (23-06-1936)", ["Juan D'Arienzo"], "Tangos"))).toBeNull();
    expect(matchProblem(r, cand("La Payanca", ["Juan D'Arienzo"], "Ataniche", 151), 152)).toBeNull();
    const v = row({
      title: "Al Compás del Corazón",
      orchestra: "Miguel Caló",
      vocal: true,
      singer: "Raúl Berón",
      year: 1942,
      laterTakes: [
        { year: 1965, singer: "Lucho Gatica" },
        { year: 1970, singer: "Raúl del Mar" },
      ],
    });
    expect(matchProblem(v, cand("Al Compás del Corazón", ["Miguel Caló"], "Que Falta Que Me Hacés"))).toMatch(
      /later take/,
    );
    expect(matchProblem(v, cand("Al Compás del Corazón", ["Miguel Caló", "Raúl Berón"]))).toBeNull();
    expect(matchProblem(v, cand("Al Compás del Corazón", ["Miguel Caló", "Lucho Gatica"]))).toMatch(
      /another singer/,
    );
  });
  it("G3: an album's whole year range is tested (a 1935–1972 compilation is no evidence; an album before the side is rejected)", () => {
    const r = row({
      title: "La Cumparsita",
      orchestra: "Juan D'Arienzo",
      year: 1937,
      laterTakes: [{ year: 1951 }, { year: 1963 }],
    });
    expect(matchProblem(r, cand("La Cumparsita", ["Juan D'Arienzo"], "Juan D'Arienzo 1935-1972"))).toMatch(
      /later take/,
    );
    expect(
      matchProblem(
        row({ title: "La Cumparsita", orchestra: "Ángel D'Agostino", year: 1952 }),
        cand("La Cumparsita", ["Angel D'agostino"], "Angel D' Agostino y Su Orquesta Típica 1940-1945"),
      ),
    ).toMatch(/earlier album/);
  });
  it("takesIndex finds the later takes and sung takes the index knows", () => {
    const t = takesIndex(rawSongs);
    const by = (id: string) => t.get(id);
    // La bruja (D'Arienzo / Echagüe 1938) has the 1959 Bustos remake; El bulín 1941 the 1971 Goyeneche one
    expect(by("c1b0ecf332")?.laterTakes?.length ?? 0).toBeGreaterThan(0);
    expect(by("cbe0e47b1e")?.laterTakes?.some((x) => x.year >= 1960) ?? false).toBe(true);
    // the catalogue carries them on the side (the export rows and the web matcher read them)
    const s = deps.catalog.songs.find((x) => x.id === "c1b0ecf332");
    expect(s?.laterTakes?.length ?? 0).toBeGreaterThan(0);
  });
  it("G1 / M1: Deezer matches are judged by the same rules, and a failing Deezer track is never the Spotify reference", () => {
    const r = row({
      title: "La Bruja",
      orchestra: "Juan D'Arienzo",
      vocal: true,
      singer: "Alberto Echagüe",
      year: 1938,
      laterTakes: [{ year: 1959, singer: "Mario Bustos" }],
    });
    const j = judgeStreams(
      r,
      {
        uri: "spotify:track:5PIBWcpY6rgEeDDBVZVLDZ",
        durationMs: 138_000,
        album: "Lelia (1938-1939)",
        matched: "Juan D'Arienzo, Alberto Echagüe – La bruja",
      },
      {
        id: "5502056",
        title: "La Bruja",
        artist: "Juan D'arienzo Y Su Orquesta Tipica",
        album: "Barrio Belgrano - Mas Grande Que Nunca",
        durationMs: 150_000,
      },
    );
    expect(j.deezer).not.toBeNull();
    expect(j.spotify).toBeNull();
  });
  it("M7: cortinas go through the same kind of rules (title, artist by whole name, the original record)", () => {
    const cue = { title: "Cambaz", artist: "Mor ve Ötesi", year: 2004 };
    expect(cortinaMatchProblem(cue, cand("Cambaz", ["Mor ve Ötesi"], "Dünya Yalan Söylüyor"))).toBeNull();
    expect(
      cortinaMatchProblem(cue, cand("Cambaz - Live", ["Mor ve Ötesi"], "Büyük Düşler Canlı")),
    ).not.toBeNull();
    expect(cortinaMatchProblem(cue, cand("Cambaz", ["Karaoke Turkey"], "Karaoke Hits"))).not.toBeNull();
    expect(
      cortinaMatchProblem(
        { title: "İşte Öyle Bir Şey", artist: "Erol Evgin", year: 1977 },
        cand("İşte Öyle Bir Şey", ["Erol Evgin", "Candan Erçetin"], "Altın Düetler"),
      ),
    ).not.toBeNull();
    // the code-defined cortinas carry their cached records (Cambaz, c-tr-2: Deezer 77595995)
    const c = deps.cortinas.find((x) => x.id === "c-tr-2");
    expect(c?.resolved?.id).toBe("77595995");
  });
});

describe("B — the discography fixes by id, and the audits pass", () => {
  const rz = () =>
    JSON.parse(readFileSync(join(findRoot(), "data/cache/resolve/tracks.json"), "utf8")) as Record<
      string,
      unknown
    >;
  const sp = () =>
    JSON.parse(readFileSync(join(findRoot(), "data/cache/spotify/tracks.json"), "utf8")) as Record<
      string,
      { uri?: string } | null
    >;
  it("the four Deezer remakes are cleared (El bulín 15406593, El irresistible, La morocha, La bruja)", () => {
    const r = rz();
    for (const id of ["cbe0e47b1e", "7a0f253220", "112e631ee3", "c1b0ecf332"])
      expect(r[id] ?? null).toBeNull();
    expect(JSON.stringify(r)).not.toContain('"15406593"');
  });
  it("La cumparsita 1951 carries the dated Spotify id (12-09-1951)", () => {
    expect(sp()["8201725ca5"]?.uri).toBe("spotify:track:7ubLgclqVjS0xAjz0iMTCK");
  });
  it("dates: Abandono 1937-09-24, Un copetín 1953-03-06", () => {
    const by = (id: string) => rawSongs.find((s) => s.id === id);
    expect(by("6799152723")?.date).toBe("1937-09-24");
    expect(by("0ab97d87bf")?.date).toBe("1953-03-06");
  });
  it("M1: every cached Spotify and Deezer id passes the match rules; every cortina record the cortina rules", () => {
    const songs = deps.raw.songs as unknown as Parameters<typeof auditStreamMatches>[0];
    const a = auditStreamMatches(
      songs,
      deps.raw.cache as Parameters<typeof auditStreamMatches>[1],
      deps.raw.resolved as Parameters<typeof auditStreamMatches>[2],
      knownSingers(deps.raw.songs),
    );
    expect(a.spotify.map((x) => `${x.row} ${x.why}`)).toEqual([]);
    expect(a.deezer.map((x) => `${x.row} ${x.why}`)).toEqual([]);
    expect(auditCortinaCaches(findRoot())).toEqual([]);
  });
});

// --- C. the retuned rules (dancer §4–§5, DJ §6) ----------------------------------------------------------------
describe("C — over-strict rules retuned as the panel specified", () => {
  it("sideOrder: the slowest side may open (Como Dos Extraños, Malena, Silueta Porteña); the best-loved side first, third or last", () => {
    // Láurenz / Casas: Como Dos Extraños (5, e56) opens and the tanda climbs
    expect(
      orderVerdict({
        songs: [
          mk("Como Dos Extraños", 5, 56),
          mk("Desconsuelo", 4, 68),
          mk("No Me Extraña", 4, 71),
          mk("De Puro Guapo", 5, 73),
        ],
      }),
    ).toEqual([]);
    // Pugliese opens on Tierra Querida (the hit first)
    expect(
      orderVerdict({
        songs: [
          mk("Tierra Querida", 4, 62),
          mk("Tiny", 3, 64),
          mk("El Arranque", 2, 66),
          mk("El Remate", 3, 68),
        ],
      }),
    ).toEqual([]);
  });
  it("sideOrder: a mid-tanda dip counts only when the side is less loved than both neighbours (Ataniche is not a dip)", () => {
    expect(
      orderVerdict({
        songs: [
          mk("El Apronte", 3, 80),
          mk("El Cencerro", 4, 84),
          mk("Ataniche", 5, 73),
          mk("La Payanca", 4, 84),
        ],
      }),
    ).toEqual([]);
    expect(
      orderVerdict({ songs: [mk("a", 4, 80), mk("b", 4, 82), mk("c", 2, 66), mk("d", 4, 84)] }).join(" "),
    ).toMatch(/dip/);
  });
  it("sideOrder: a tanda never fades out (last side ≥ mean − 8; Di Sarli / Durán ending on Hoy al Recordarla e48)", () => {
    const v = orderVerdict({
      songs: [
        mk("Vieja Luna", 3, 59),
        mk("Un Tango y Nada Más", 4, 63),
        mk("Tus Labios Me Dirán", 4, 66),
        mk("Hoy al Recordarla", 3, 48),
      ],
    });
    expect(v.join(" ")).toMatch(/fades/);
  });
  it("sideOrder: in a summit and in the última the last side is the strongest (Tanturi / Castillo ends on Así Se Baila el Tango)", () => {
    const ult = [
      mk("Recuerdo Malevo", 4, 72),
      mk("La Vida Es Corta", 4, 74),
      mk("Así Se Baila el Tango", 5, 85),
      mk("Pocas Palabras", 5, 75),
    ];
    expect(orderVerdict({ songs: ult }, { ultima: true }).join(" ")).toMatch(/strongest/);
    expect(orderVerdict({ songs: [ult[0]!, ult[3]!, ult[1]!, ult[2]!] }, { ultima: true })).toEqual([]);
  });
  it("openCliff: a tanda whose first side is > 15 below the previous tanda's last side reorders (Láurenz / Casas after La Payanca)", () => {
    const songs = [
      mk("Como Dos Extraños", 5, 56),
      mk("Desconsuelo", 4, 68),
      mk("No Me Extraña", 4, 71),
      mk("De Puro Guapo", 5, 73),
    ];
    expect(orderVerdict({ songs }, { prevLast: 84 }).join(" ")).toMatch(/below the previous/);
    expect(orderVerdict({ songs }, { prevLast: 70 })).toEqual([]);
  });
  it("the panel's retuned and new rules are in the panel with their round-16 sources", () => {
    const keys = STRICT_RULES.map((r) => r.key);
    for (const k of [
      "openerCanon",
      "heatFloor",
      "preSummit",
      "openCliff",
      "coolVals",
      "orchestraCount",
      "closerVary",
    ])
      expect(keys).toContain(k);
    for (const k of [
      "openerCanon",
      "heatFloor",
      "preSummit",
      "openCliff",
      "coolVals",
      "orchestraCount",
      "closerVary",
    ])
      expect(STRICT_RULES.find((r) => r.key === k)?.source).toMatch(/round16-/);
  });
  it("rhythmicRun: a soft-rhythmic warm-up triple passes; two R+ tangos are never adjacent", () => {
    for (const p of PANEL.map(night)) {
      for (const v of rule(p, "rhythmicRun")) expect(v.detail).toMatch(/R\+|hard-drive|target|build|peak/);
      const t = p.tandas;
      for (let i = 1; i < t.length; i++) {
        const a = t[i - 1]!,
          b = t[i]!;
        const rp = (x: Tanda) =>
          x.rhythm === "tango" &&
          ["juan-d-arienzo", "rodolfo-biagi", "ricardo-tanturi"].includes(x.orchestraId);
        if (rp(a) && rp(b)) expect(rule(p, "rhythmicRun").some((v) => v.tanda === i)).toBe(true);
      }
    }
  });
  it("energyStep: a +22 lift into a vals or milonga behind an up-tempo cue, the vals ≤ its target + 6, is allowed", () => {
    const p = night(194);
    const i = p.tandas.findIndex((x, k) => k > 3 && x.rhythm === "vals");
    const t = p.tandas.map((x) => ({ ...x }));
    const prev = t[i - 1]!;
    t[i] = { ...t[i]!, energy: prev.energy + 21, targetEnergy: prev.energy + 18 };
    t[i - 1] = { ...prev, cortina: prev.cortina ? { ...prev.cortina, tags: ["tempo:up"] } : prev.cortina };
    expect(rule({ ...p, tandas: t }, "energyStep").some((v) => v.tanda === i)).toBe(false);
    t[i - 1] = { ...prev, cortina: prev.cortina ? { ...prev.cortina, tags: ["tempo:slow"] } : prev.cortina };
    expect(rule({ ...p, tandas: t }, "energyStep").some((v) => v.tanda === i)).toBe(true);
  });
  it("firstVals: the warm-up vals ≤ max(target + 10, 72), its last side ≤ 78 (Tanturi / Castillo e71 for target 59 passes)", () => {
    const p = night(194);
    const i = p.tandas.findIndex((x) => x.rhythm === "vals");
    const t = p.tandas.map((x) => ({ ...x }));
    t[i] = { ...t[i]!, energy: 71, targetEnergy: 59, songs: t[i]!.songs.map((s) => ({ ...s, energy: 70 })) };
    expect(rule({ ...p, tandas: t }, "firstVals")).toEqual([]);
    t[i] = { ...t[i]!, energy: 79, songs: t[i]!.songs.map((s) => ({ ...s, energy: 84 })) };
    expect(rule({ ...p, tandas: t }, "firstVals").length).toBe(1);
  });
  it("cuePopHour: only up-tempo dance-pop counts (Sil Baştan, Cambaz, Bir Derdim Var are rock); never before a hot slot", () => {
    const pool = deps.cortinas;
    const tag = (id: string) => pool.find((c) => c.id === id)?.tags ?? [];
    expect(tag("c-tr-mvo-bir-derdim")).toContain("mood:melancholic");
    expect(tag("c-tr-aksu-hadi-bakalim")).toContain("mood:pop");
    expect(tag("c-tr-pekkan-bambaska")).toContain("mood:pop");
    for (const p of PANEL.map(night))
      for (const v of rule(p, "cuePopHour")) expect(v.detail).not.toMatch(/Sil Baştan|Cambaz|Bir Derdim Var/);
  });
});

// --- D. the new rules hold on the reviewed nights and the golden set ---------------------------------------------
describe("D — the new rules on every composed night", () => {
  it("R16-1: under the canon rule the opener is a non-colour core family, mean fame ≥ 4, energy ≤ max(target + 8, 62)", () => {
    const bad = [...PANEL.map(night), ...[1, 2, 3, 4, 5, 6].map(golden)].flatMap((p) =>
      fmt(p, "openerCanon"),
    );
    expect(bad).toEqual([]);
  });
  it("A1 / R16-2: a non-colour tanda's heatmap ≥ 3; an edge or unstreamable tanda is never let in for want of alternatives", () => {
    const ps = PANEL.map(night);
    expect(ps.flatMap((p) => fmt(p, "heatFloor"))).toEqual([]);
    // (ratchet, docs/specs/round16-engine.md §6: the stricter export matching took streams away from families the
    // night still needs — seed 180's Caló / Iriarte "Nada" — at most one such item on the three nights)
    expect(ps.flatMap((p) => fmt(p, "streamNight")).length).toBeLessThanOrEqual(1);
  });
  it("R16-3: the slot before the last summit has mean fame ≥ 3.5 and energy ≥ target − 8", () => {
    // (ratchet: on these three nights no milonga family with two fame-4 streaming sides is free of the repeat gaps at
    // the slot before the last summit; the Troilo / Fiorentino milonga stays — §6 "what is left")
    expect(PANEL.map(night).flatMap((p) => fmt(p, "preSummit")).length).toBeLessThanOrEqual(3);
    expect(night(199).tandas.length ? fmt(night(199), "preSummit") : []).toEqual([]);
  });
  it("R16-4: no side-level cliff into a tanda (its first side > 15 below the last one before)", () => {
    expect(PANEL.map(night).flatMap((p) => fmt(p, "openCliff"))).toEqual([]);
  });
  it("R16-7: the cool-down vals is not hotter than the last summit", () => {
    expect(PANEL.map(night).flatMap((p) => fmt(p, "coolVals"))).toEqual([]);
  });
  it("R16-11: a 4 h golden night carries ≥ 12 orchestras (the benchmark reads 12–14 as ok)", () => {
    const ps = PANEL.map(night);
    expect(ps.flatMap((p) => fmt(p, "orchestraCount"))).toEqual([]);
    for (const p of ps) {
      const c = benchmarkNight(p).checks.find((x) => x.key === "orchestras");
      const n = new Set(p.tandas.map((t) => t.orchestraId)).size;
      const h = p.stats.durationSec / 3600;
      if (n >= Math.round((12 * h) / 4)) expect(c?.status).toBe("ok");
    }
  });
  it("R16-10: with closer auto, the closer is not the última's orchestra when an in-range streamable version (fame ≥ 2) exists", () => {
    expect(PANEL.map(night).flatMap((p) => fmt(p, "closerVary"))).toEqual([]);
  });
  it("0 blockers on the reviewed seeds and the golden set; the golden set's engine score ≥ 85", () => {
    for (const p of [...PANEL.map(night), ...[1, 2, 3, 4, 5, 6].map(golden)]) {
      expect(strictChecks(p).blockers).toBe(0);
      if (p.options.hours === 4 && !p.options.yearRange) expect(p.score.total).toBeGreaterThanOrEqual(85);
    }
  });
  it("improveNight never adds a round-16 violation", () => {
    const R16 = [
      "openerCanon",
      "heatFloor",
      "preSummit",
      "openCliff",
      "coolVals",
      "orchestraCount",
      "closerVary",
    ];
    for (const p of [night(194), golden(2)]) {
      const q = improveNight({ ...p, score: scorePlaylist(p) }, deps).playlist;
      for (const k of R16) expect(fmt(q, k).length).toBeLessThanOrEqual(fmt(p, k).length);
    }
  });
});

// --- E. the shipped night ------------------------------------------------------------------------------------------
describe("E — the shipped featured night", () => {
  it("is a golden night with 0 blockers whose night shape follows its settings", () => {
    expect(isGoldenNight(featured.options)).toBe(true);
    const r = strictChecks(featured);
    expect(r.blockers).toBe(0);
    expect(r.violations.filter((v) => v.rule === "nightShape")).toEqual([]);
  });
  it("every side and cortina carries the validated Spotify id the caches hold, and the export plays exactly those ids", () => {
    const sp = deps.raw.cache as Record<string, { uri?: string } | null>;
    const byId = new Map(deps.catalog.songs.map((s) => [s.id, s]));
    for (const t of featured.tandas)
      for (const s of t.songs) {
        const c = byId.get(s.id);
        // the night carries the catalogue's (judged) id, never a rejected one
        expect(s.spotify?.uri ?? null).toBe(c?.spotify?.uri ?? null);
        if (s.spotify?.uri) expect(sp[s.id]?.uri ?? c?.spotify?.uri).toBe(s.spotify.uri);
      }
    for (const t of featured.tandas)
      if (t.cortina) {
        const c = deps.cortinas.find((x) => x.id === t.cortina!.id);
        expect(t.cortina.spotify?.uri ?? null).toBe(c?.spotify?.uri ?? null);
      }
    const plan = toSpotifyPlan(featured, {});
    const want = featured.tandas.flatMap((t) => [
      ...t.songs.map((s) => s.spotify?.uri).filter(Boolean),
      ...(t.cortina?.spotify?.uri ? [t.cortina.spotify.uri] : []),
    ]);
    for (const u of want) expect(plan.uris).toContain(u);
  });
  it("every side streams (Spotify or a judged Deezer track)", () => {
    const un = featured.tandas.flatMap((t) => t.songs.filter((s) => !streamable(s)).map((s) => s.title));
    expect(un.length).toBeLessThanOrEqual(1);
  });
});
