/**
 * Round-19 invariants (docs/specs/round19-engine.md): cortinas always land in Spotify (every cue of the pool has a
 * judged Spotify record or is recorded as having none; a night meant for Spotify draws only Spotify-ready cues), and
 * the song-to-song order the round-19 review asked for. Written before the engine change; the spec records which of
 * them failed on the round-18 engine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type ComposeOptions,
  type Cortina,
  candidatesFor,
  compose,
  cortinaMatchProblem,
  cortinaPool,
  cortinaStandIn,
  familyOf,
  improveNight,
  type MatchCandidate,
  orderVerdictOf,
  type Playlist,
  type Song,
  scorePlaylist,
  strictChecks,
  strictOrder,
} from "../src/index";
import { auditCortinaCaches, findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));
const cuesOf = (p: Pick<Playlist, "tandas">) =>
  p.tandas.map((t) => t.cortina).filter((c): c is Cortina => !!c);

const cand = (name: string, artists: string[], album: string, sec = 200): MatchCandidate => ({
  name,
  artists,
  album,
  durationMs: sec * 1000,
});

describe("round 19 — the cortina match rules", () => {
  it("a duet is any credited performer the cue does not name, first-credited or not (The Count Meets The Duke)", () => {
    const cue = { title: "Jumpin' at the Woodside", artist: "Count Basie", year: 1938 };
    expect(
      cortinaMatchProblem(
        cue,
        cand(
          "Jumpin' at the Woodside",
          ["Duke Ellington", "Count Basie"],
          "First Time! The Count Meets The Duke",
        ),
      ),
    ).toMatch(/duet/);
    expect(
      cortinaMatchProblem(
        cue,
        cand("Jumpin' At The Woodside", ["Count Basie"], "The Complete Decca Recordings"),
      ),
    ).toBeNull();
    // the cue's own band under a longer credit is the cue's artist
    expect(
      cortinaMatchProblem(
        { title: "Woodchopper's Ball", artist: "Woody Herman" },
        cand("Woodchopper's Ball", ["Woody Herman & His Orchestra"], "The Best Of Woody Herman"),
      ),
    ).toBeNull();
  });
  it("a subtitle in brackets is the same record ('Sing, Sing, Sing (With a Swing)'), another song after a slash is not", () => {
    const cue = { title: "Sing, Sing, Sing", artist: "Benny Goodman", year: 1937 };
    expect(
      cortinaMatchProblem(cue, cand("Sing, Sing, Sing (With a Swing)", ["Benny Goodman"], "Ken Burns Jazz")),
    ).toBeNull();
    expect(
      cortinaMatchProblem(
        cue,
        cand(
          "Sing Sing Sing (With A Swing)/Christopher Columbus",
          ["Benny Goodman"],
          "Italian Cooking Music",
        ),
      ),
    ).toMatch(/another title/);
    // a bracket that names a live, remix or re-recording is still not the original
    expect(
      cortinaMatchProblem(cue, cand("Sing, Sing, Sing (Live)", ["Benny Goodman"], "Ken Burns Jazz")),
    ).toMatch(/original/);
  });
});

describe("round 19 — cortinas always land in Spotify", () => {
  it("every cue of the pool has a checked Spotify record, or is recorded as having none and never drawn", () => {
    const cache = JSON.parse(
      readFileSync(join(findRoot(), "data/cache/spotify/cortinas.json"), "utf8"),
    ) as Record<string, unknown>;
    for (const c of deps.cortinas) expect(c.id in cache, `${c.id} ${c.title} was never looked up`).toBe(true);
    const drawable = candidatesFor(cortinaPool(deps.cortinas), {
      cortinaCultures: ["any"],
    } as ComposeOptions);
    for (const c of drawable)
      expect(c.spotify?.uri, `${c.id} ${c.title} is drawable without a Spotify id`).toBeTruthy();
    expect(auditCortinaCaches()).toEqual([]);
  });
  it("a night meant for Spotify (the default) draws only Spotify-ready cues; spotifyCortinas: false lifts the filter", () => {
    const pool = cortinaPool(deps.cortinas).map((c, i) => (i % 5 === 0 ? { ...c, spotify: null } : c));
    const o = { cortinaCultures: ["any"] } as unknown as ComposeOptions;
    const on = candidatesFor(pool, o);
    expect(on.length).toBeGreaterThan(8);
    expect(on.every((c) => !!c.spotify?.uri)).toBe(true);
    const off = candidatesFor(pool, { ...o, spotifyCortinas: false });
    expect(off.some((c) => !c.spotify?.uri)).toBe(true);
  });
  it("a family with no Spotify-ready cue falls back to a compatible family, said in stats.settingFallbacks", () => {
    const stripped = deps.cortinas.map((c) =>
      familyOf(c) === "swing" || c.genre === "swing" ? { ...c, spotify: null } : c,
    );
    const p = compose({ hours: 4, seed: 5, cortinaGenres: ["swing"] }, { ...deps, cortinas: stripped });
    const cues = cuesOf(p);
    expect(cues.length).toBeGreaterThan(15);
    expect(cues.every((c) => !!c.spotify?.uri)).toBe(true);
    expect(cues.some((c) => ["jazz", "crooner"].includes(familyOf(c)))).toBe(true);
    expect(p.stats.settingFallbacks?.some((f) => /^cortinas: swing has no Spotify-ready cue/.test(f))).toBe(
      true,
    );
  });
  it("the strict panel flags a cue without a Spotify id on a Spotify night (cueSpotify), and improveNight re-picks it", () => {
    const p0 = compose({ hours: 4, seed: 3 }, deps);
    const k = p0.tandas.findIndex((t, i) => !!t.cortina && i < p0.tandas.length - 1);
    const p1: Playlist = {
      ...p0,
      tandas: p0.tandas.map((t, i) => (i === k ? { ...t, cortina: { ...t.cortina!, spotify: null } } : t)),
    };
    const v = strictChecks(p1).violations.filter((x) => x.rule === "cueSpotify");
    expect(v.map((x) => x.tanda)).toEqual([k]);
    const fixed = improveNight({ ...p1, score: scorePlaylist(p1) }, deps).playlist;
    expect(cuesOf(fixed).every((c) => !!c.spotify?.uri)).toBe(true);
    expect(
      strictChecks({ ...p1, options: { ...p1.options, spotifyCortinas: false } }).violations.some(
        (x) => x.rule === "cueSpotify",
      ),
    ).toBe(false);
  });
  it("export: a cortina Spotify could not match is stood in for by the nearest Spotify-ready cue of its family", () => {
    const pool = cortinaPool(deps.cortinas);
    const cue = pool.find((c) => c.id === "c-tr-evgin-iste-oyle")!;
    const sub = cortinaStandIn({ ...cue, spotify: null } as Cortina, pool, new Set());
    expect(sub?.spotify?.uri).toBeTruthy();
    expect(familyOf(sub!)).toBe(familyOf(cue));
    expect(sub!.id).not.toBe(cue.id);
    // the nearest in energy among the family's Spotify-ready cues
    const fam = pool.filter((c) => familyOf(c) === familyOf(cue) && c.id !== cue.id && c.spotify?.uri);
    expect(Math.abs(sub!.energy - cue.energy)).toBe(
      Math.min(...fam.map((c) => Math.abs(c.energy - cue.energy))),
    );
    // the neighbours are avoided while another cue fits
    expect(cortinaStandIn(cue, pool, new Set([sub!.id]))!.id).not.toBe(sub!.id);
    // a family with no Spotify-ready cue: a compatible family's
    const swing = pool.find((c) => c.genre === "swing")!;
    const noSwing = pool.map((c) => (familyOf(c) === familyOf(swing) ? { ...c, spotify: null } : c));
    expect(["jazz", "crooner"]).toContain(familyOf(cortinaStandIn(swing, noSwing)!));
  });
  // (the full 30 + 30 measurement is in docs/specs/round19-engine.md §1; a sample here keeps the suite fast)
  it("Turkish-cortina nights and default nights: every cortina carries a Spotify id", () => {
    let miss = 0;
    const seen: string[] = [];
    for (const seed of [1, 9, 17, 26])
      for (const o of [
        { hours: 4, seed, cortinaCultures: ["turkish"] },
        { hours: 4, seed },
      ] as Partial<ComposeOptions>[])
        for (const c of cuesOf(compose(o, deps)))
          if (!c.spotify?.uri) {
            miss++;
            seen.push(`${seed} ${c.id}`);
          }
    expect(seen, seen.join(", ")).toEqual([]);
    expect(miss).toBe(0);
  });
});

// --- B: the song-to-song order (docs/reviews/round19-order.md) ------------------------------------------------------
const side = (
  id: string,
  title: string,
  energy: number,
  fame: number,
  role?: Song["role"],
  orch = "juan-d-arienzo",
) => ({ id, title, energy, fame, role, orchestraId: orch, rhythm: "tango", year: 1937 }) as unknown as Song;
const titles = (xs: Song[]) => xs.map((s) => s.title);

describe("round 19 — inside the tanda: which side comes after which", () => {
  it("O1: a rhythmic tanda never drops a side 8 or more below both neighbours; its one slow hit opens (D'Arienzo 1936–37)", () => {
    const t = [
      side("a", "El Cencerro", 84, 4, "opener"),
      side("b", "El Cachafaz", 84, 2),
      side("c", "Ataniche", 73, 5),
      side("d", "Jueves", 84, 4, "closer"),
    ];
    const o = strictOrder(t);
    expect(titles(o)[0]).toBe("Ataniche");
    expect(orderVerdictOf(o)).toEqual([]);
    // the shipped order is a fault the panel names
    expect(orderVerdictOf(t).join(" ")).toMatch(/dip mid-tanda \(Ataniche/);
  });
  it("O2: the second side never falls more than 8 below the opener (12 for a fame-5 side of a lyrical or balanced tanda)", () => {
    const summit = [
      side("p", "Pensalo Bien", 84, 5, "opener"),
      side("q", "Ansiedad", 72, 5),
      side("r", "La Bruja", 84, 5, "opener"),
      side("s", "No Mientas", 82, 5),
    ];
    expect(orderVerdictOf(summit).join(" ")).toMatch(/falls 12 after the opener/);
    const o = strictOrder(summit, true, { summit: true });
    expect(orderVerdictOf(o, { summit: true })).toEqual([]);
    expect(titles(o)[0]).toBe("Ansiedad");
    // Láurenz / Casas (balanced): De Puro Guapo e71 → Como Dos Extraños e56 falls 15
    const L = "pedro-laurenz";
    const casas = [
      side("1", "De Puro Guapo", 71, 3, undefined, L),
      side("2", "Como Dos Extraños", 56, 5, undefined, L),
      side("3", "Desconsuelo", 68, 3, undefined, L),
      side("4", "No Me Extraña", 73, 5, "closer", L),
    ];
    expect(orderVerdictOf(casas).join(" ")).toMatch(/falls 15 after the opener/);
    expect(orderVerdictOf(strictOrder(casas))).toEqual([]);
  });
  it("O3: the last side is not more than 4 below the hottest of the others when a side of the same standing can close (D'Agostino / Vargas)", () => {
    const D = "angel-d-agostino";
    const t = [
      side("a", "Agua Florida", 56, 5, "opener", D),
      side("b", "Ahora No Me Conocés", 55, 4, undefined, D),
      side("c", "El Yacaré", 62, 4, undefined, D),
      side("d", "Adiós, Arrabal", 56, 5, undefined, D),
    ];
    expect(orderVerdictOf(t).join(" ")).toMatch(/ends 6 below El Yacaré/);
    const o = strictOrder(t);
    expect(titles(o).at(-1)).toBe("El Yacaré");
    expect(orderVerdictOf(o)).toEqual([]);
  });
  it("O4: of two corpus openers the cooler one opens (Di Sarli / Rufino milongas: Zorzal before La Mulateada)", () => {
    const S = "carlos-di-sarli";
    const t = [
      side("a", "La Mulateada", 70, 5, "opener", S),
      side("b", "Zorzal", 62, 5, "opener", S),
      side("c", "Pena Mulata", 72, 5, "closer", S),
    ].map((s) => ({ ...s, rhythm: "milonga" }) as Song);
    expect(titles(strictOrder(t))).toEqual(["Zorzal", "La Mulateada", "Pena Mulata"]);
    // the shipped order is a fault the panel names (so improveNight's strict fixer reorders it wherever it arises)
    expect(orderVerdictOf(t).join(" ")).toMatch(/cooler corpus opener Zorzal/);
  });
});
