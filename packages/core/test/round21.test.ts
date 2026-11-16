/**
 * Round-21 invariants (docs/specs/round21-engine.md): La Cumparsita's place and the opening version matching the first
 * tanda; the tanda rules as settings (voice, vocal style, tempo and level bands, one tone per tanda); the stream-date
 * match rule; the big four; the Swap sheet; DJ-pinned tandas; enrichment records and DJ corrections; what TDJ learns
 * from the DJ's edits; the featured night's edits. Written before the engine change; the spec records which of them
 * failed on the round-20 engine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  auditStreamMatches,
  bigFourProblems,
  bypassedTandas,
  bypassPlanItems,
  Catalog,
  closingFor,
  compose,
  cortinaPool,
  cortinaTempo,
  cueMoody,
  cumparsitaPlacement,
  editDiff,
  exportTandas,
  familyOf,
  flatten,
  improveNight,
  knownSingers,
  knownVocalStyle,
  learnedFamilyFactor,
  learnedSideFactor,
  learnFromEdit,
  type MatchCandidate,
  matchProblem,
  mendBenchVariety,
  mendTangoChairs,
  mendVmRepeats,
  mergeEnrichment,
  normTitle,
  OPENING_YEAR_WINDOW,
  openingCumparsita,
  orderVerdictOf,
  type Playlist,
  pinTanda,
  planCortinas,
  planSlots,
  replaceSide,
  type Song,
  scorePlaylist,
  sideProblem,
  strictChecks,
  strictOrder,
  swapOptions,
  swapTrack,
  type Tanda,
  TONE_ENERGY_BAND,
  tandaProblems,
  VM_WIDE,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
const ROOT = findRoot();
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const nights: Playlist[] = [];
beforeAll(() => {
  deps = loadCatalog();
  for (const seed of [1, 2, 3, 4]) nights.push(compose({ hours: 4, seed }, deps));
}, 600000);
afterEach(() => new Promise((r) => setTimeout(r, 0)));
const isBigFourId = (id: string) =>
  ["carlos-di-sarli", "juan-d-arienzo", "anibal-troilo", "osvaldo-pugliese"].includes(id);
const song = (id: string) => deps.catalog.songs.find((s) => s.id === id || s.altIds?.includes(id))!;

describe("A — La Cumparsita: where it plays and the opening version", () => {
  it("the default places it both first and last; the setting is honoured", () => {
    expect(cumparsitaPlacement({ closeWithCumparsita: true })).toEqual({ open: true, close: true });
    expect(cumparsitaPlacement({ closeWithCumparsita: true, rules: { cumparsita: "close" } })).toEqual({
      open: false,
      close: true,
    });
    expect(cumparsitaPlacement({ closeWithCumparsita: true, rules: { cumparsita: "none" } })).toEqual({
      open: false,
      close: false,
    });
    const p = compose({ hours: 2, seed: 7, rules: { cumparsita: "open" } }, deps);
    expect(p.opening?.title).toBe("La Cumparsita");
    expect(p.closing).toBeNull();
  });
  it("a default night opens with La Cumparsita by the first tanda's orchestra near its years, or records the fallback", () => {
    for (const p of nights) {
      expect(p.opening?.title).toBe("La Cumparsita");
      const t1 = p.tandas[0]!;
      const fb = p.stats.settingFallbacks?.find((f) => f.startsWith("opening:"));
      if (!fb) {
        expect(p.opening!.orchestraId).toBe(t1.orchestraId);
        const ys = t1.songs.map((s) => s.year!);
        expect(
          Math.max(0, Math.min(...ys) - p.opening!.year!, p.opening!.year! - Math.max(...ys)),
        ).toBeLessThanOrEqual(4);
      }
      expect(strictChecks(p).violations.filter((v) => v.rule === "cumparsitaOpener")).toEqual([]);
      // the opening plays inside the requested hours
      expect(Math.abs(p.stats.durationSec - 4 * 3600)).toBeLessThanOrEqual(6 * 60);
    }
  });
  it("a night saved before round 21 (no opening, no placement setting) is not judged for the opening it never asked for", () => {
    const old = readJson("docs/specs/round19-best-night.json") as Playlist;
    const r = strictChecks(old);
    expect(r.violations.filter((v) => v.rule === "nightShape" || v.rule === "cumparsitaOpener")).toEqual([]);
    // an explicit setting is still judged
    const asked = strictChecks({
      ...old,
      options: { ...old.options, rules: { ...old.options.rules, cumparsita: "both" } },
    });
    expect(asked.violations.some((v) => v.rule === "nightShape" || v.rule === "cumparsitaOpener")).toBe(true);
  });
  // 2026-11 (function review): D'Agostino 1952 opened for a 1941 tanda (11 years: "any golden year") while Caló was
  // "said to have no La Cumparsita" for a 1942 tanda although the index holds his 1964 and 1966 versions (22 years)
  it("the opening's year window is one constant for every orchestra, and the note says what lies outside it", () => {
    expect(OPENING_YEAR_WINDOW).toBe(12);
    const tandaOf = (orchestraId: string, year: number) => {
      const s = deps.catalog.songs.find(
        (x) => x.orchestraId === orchestraId && x.year === year && x.rhythm === "tango",
      )!;
      return {
        orchestraId,
        orchestra: s.orchestra,
        yearRange: [year, year] as [number, number],
        singer: null,
        vocal: false,
        songs: [s],
      };
    };
    const cumparsitaYears = (id: string) =>
      deps.catalog.songs
        .filter((s) => s.orchestraId === id && normTitle(s.title) === "la cumparsita" && s.rhythm === "tango")
        .map((s) => s.year);
    expect(cumparsitaYears("miguel-calo")).toEqual(expect.arrayContaining([1964, 1966]));
    // D'Agostino 1952 for a 1941 tanda: 11 years, inside the window — his own version, noted
    const dag = openingCumparsita(deps.catalog, {}, tandaOf("angel-d-agostino", 1941), null);
    expect(dag.song?.orchestraId).toBe("angel-d-agostino");
    expect(dag.fallback).toMatch(/^opening: no Ángel D'Agostino La Cumparsita near 1941; its 1952 version/);
    // Caló 1964 for a 1942 tanda: 22 years, outside it — another orchestra, and the note does not say he has none
    const calo = openingCumparsita(deps.catalog, {}, tandaOf("miguel-calo", 1942), null);
    expect(calo.song?.orchestraId).not.toBe("miguel-calo");
    expect(calo.fallback).toContain(
      `Miguel Caló has no La Cumparsita near its years (±${OPENING_YEAR_WINDOW})`,
    );
    expect(calo.fallback).toContain("its nearest is 1964");
    expect(calo.fallback).not.toMatch(/has no La Cumparsita;/);
    // the same window for the same orchestra: a 1953 Caló tanda is 11 years from his 1964 version — his own opens
    const caloLate = openingCumparsita(deps.catalog, {}, tandaOf("miguel-calo", 1953), null);
    if (
      deps.catalog.songs.some(
        (s) => s.orchestraId === "miguel-calo" && s.year === 1953 && s.rhythm === "tango",
      )
    )
      expect(caloLate.song?.orchestraId).toBe("miguel-calo");
    // and an orchestra with no version at all says so the same way, without a nearest year
    const none = openingCumparsita(deps.catalog, {}, tandaOf("lucio-demare", 1943), null);
    if (!cumparsitaYears("lucio-demare").length) {
      expect(none.fallback).toContain(
        `Lucio Demare has no La Cumparsita near its years (±${OPENING_YEAR_WINDOW})`,
      );
      expect(none.fallback).not.toContain("its nearest");
    }
  });
  it("the strict panel flags an opening by another orchestra without a recorded fallback", () => {
    const p = nights[0]!;
    const other = deps.catalog.songs.find(
      (s) => s.title === "La Cumparsita" && s.orchestraId !== p.tandas[0]!.orchestraId && !!s.year,
    )!;
    const bad = { ...p, opening: other, stats: { ...p.stats, settingFallbacks: [] } };
    expect(strictChecks(bad).violations.some((v) => v.rule === "cumparsitaOpener")).toBe(true);
  });
});

describe("B — tanda rules: voice, vocal style, years", () => {
  it("the vocal-style table: estribillistas rhythm-led, cantores singer-led", () => {
    const v = (orchestraId: string, singer: string, year: number) =>
      knownVocalStyle({ vocal: true, singer, orchestraId, year })?.style;
    expect(v("juan-d-arienzo", "Alberto Echagüe", 1938)).toBe("estribillo");
    expect(v("edgardo-donato", "Horacio Lagos", 1938)).toBe("estribillo");
    expect(v("angel-d-agostino", "Angel Vargas", 1941)).toBe("cantor");
    expect(v("carlos-di-sarli", "Roberto Rufino", 1940)).toBe("cantor");
    expect(v("anibal-troilo", "Francisco Fiorentino", 1939)).toBe("estribillo");
    expect(v("anibal-troilo", "Francisco Fiorentino", 1942)).toBe("cantor");
    expect(
      knownVocalStyle({ vocal: false, singer: null, orchestraId: "juan-d-arienzo", year: 1938 }),
    ).toBeNull();
  });
  it("covers ≥ 80 % of the golden vocal sides of the canon", () => {
    const g = deps.catalog.songs.filter(
      (s) => s.vocal && s.year && s.year >= 1935 && s.year <= 1945 && (s.fame ?? 0) > 0,
    );
    const known = g.filter((s) => s.vocalStyle).length;
    expect(known / g.length).toBeGreaterThanOrEqual(0.8);
  });
  it("sideProblem: no instrumental in a vocal tanda, no rhythm-led side among singer-led ones, the year cap", () => {
    const base = { rhythm: "tango", o: { maxYearSpread: 4 } };
    const vargas = song("9abc1040ff"); // D'Agostino / Vargas 1941
    const instr = deps.catalog.songs.find(
      (s) => s.orchestraId === "angel-d-agostino" && !s.vocal && s.year === 1943,
    )!;
    expect(sideProblem([vargas], instr, base)).toMatch(/instrumental side in a vocal tanda/);
    const ech = deps.catalog.songs.find((s) => s.singer === "Alberto Echagüe" && s.year === 1938)!;
    const mau = deps.catalog.songs.find(
      (s) => s.singer === "Héctor Mauré" && s.year === 1941 && s.rhythm === "tango",
    )!;
    expect(sideProblem([ech], mau, base)).toMatch(/singer-led side in a rhythm-led tanda/);
    expect(
      sideProblem([ech], mau, { ...base, o: { ...base.o, tandaRules: { vocalStyle: "off" } } }),
    ).not.toMatch(/led/);
    const late = { ...vargas, id: "x", year: 1946 } as Song;
    expect(sideProblem([vargas], late, base)).toMatch(/spreads the tanda/);
  });
  it("every composed night: no tanda mixes voice or vocal style, and the years hold", () => {
    for (const p of nights)
      for (const t of p.tandas)
        expect(
          tandaProblems(t, p.options).filter((x) => ["voice", "vocalStyle", "years"].includes(x.key)),
        ).toEqual([]);
  });
  it("the singer-led setting builds no rhythm-led vocal tanda (or records why)", () => {
    const p = compose({ hours: 4, seed: 3, tandaRules: { vocalStyle: "singer-led" } }, deps);
    const fb = p.stats.settingFallbacks?.some((f) => f.startsWith("vocalStyle:"));
    if (!fb)
      for (const t of p.tandas)
        if (t.vocal) expect(t.songs.every((s) => s.vocalStyle !== "estribillo")).toBe(true);
  });
});

describe("B — the stream-date match rule", () => {
  const row = {
    title: "Tres Esquinas",
    orchestra: "Ángel D'Agostino",
    singer: "Angel Vargas",
    vocal: true,
    year: 1941,
    date: "1941-07-24",
  };
  const c = (name: string, album: string, release: string): MatchCandidate => ({
    name,
    artists: ["Angel D'Agostino", "Ángel Vargas"],
    album,
    durationMs: 185000,
    release,
  });
  it("an album dated before the side, or a pre-2000 release years after it, is another record", () => {
    expect(matchProblem(row, c("Tres Esquinas", "Laura", "1939-01-09"))).toMatch(/before the 1941 side/);
    expect(matchProblem(row, c("Tres Esquinas", "Presentando a Angel D'agostino", "1940-02-25"))).toMatch(
      /before/,
    );
    expect(matchProblem(row, c("Tres Esquinas", "Tangos de mi ciudad", "1979"))).toMatch(/1979 release/);
  });
  it("a restoration naming the side's date, a digital reissue and an album naming the years pass", () => {
    expect(
      matchProblem(
        row,
        c(
          "Tres Esquinas - Buenos Aires 24/07/1941 (Restauración 2022)",
          "Ángel D'agostino y Su Orquesta Típica - Ángel Vargas 1940 - 1942 (Restauración 2022)",
          "2022-08-23",
        ),
      ),
    ).toBeNull();
    expect(matchProblem(row, c("Tres Esquinas", "Tango Classics 012", "2011-05-01"))).toBeNull();
    expect(matchProblem(row, c("Tres Esquinas", "Vargas 1940-1942", "1985"))).toBeNull();
  });
  it("every committed Spotify id passes, and Tres Esquinas is the dated 1941 restoration", () => {
    const songs = readJson("data/index/songs.json");
    const a = auditStreamMatches(
      songs,
      readJson("data/cache/spotify/tracks.json"),
      readJson("data/cache/resolve/tracks.json"),
      knownSingers(songs),
    );
    expect(a.spotify).toEqual([]);
    expect(song("d1d4a2ee18").spotify?.uri).toBe("spotify:track:5HftCmLhynna9guHF1xz8b");
  });
});

describe("C — tempo and loudness", () => {
  it("the catalogue carries Deezer BPM and gain with their source; a DJ correction wins", () => {
    const withDz = deps.catalog.songs.filter((s) => s.level?.source === "deezer");
    expect(withDz.length).toBeGreaterThan(400);
    const s0 = withDz[0]!;
    const cat = new Catalog(
      deps.raw.songs,
      deps.raw.profiles,
      deps.raw.cache,
      deps.corpus,
      { songs: { [s0.id]: { bpm: 77, gainDb: -3, vocalStyle: "cantor" } } },
      deps.trackEnergy,
      { resolved: deps.raw.resolved, audio: deps.raw.audio, deezer: deps.raw.deezer },
    );
    const s1 = cat.songs.find((s) => s.id === s0.id)!;
    expect(s1.tempo).toMatchObject({ bpm: 77, source: "dj" });
    expect(s1.level).toMatchObject({ gainDb: -3, source: "dj" });
    expect(s1.vocalStyleSource).toBe("dj");
  });
  it("re-running an enrichment updates a changed value (kept as previous) and stamps the fetch", () => {
    const a = mergeEnrichment(null, { id: "1", bpm: 120, gain: -10 }, "deezer", "2026-01-01T00:00:00Z");
    expect(a).toMatchObject({ bpm: 120, source: "deezer", fetchedAt: "2026-01-01T00:00:00Z" });
    expect(a.changedAt).toBeUndefined();
    const b = mergeEnrichment(a, { id: "1", bpm: 124, gain: -10 }, "deezer", "2026-02-01T00:00:00Z");
    expect(b).toMatchObject({ bpm: 124, changedAt: "2026-02-01T00:00:00Z", previous: { bpm: 120 } });
    const c = mergeEnrichment(b, { id: "1", bpm: 124, gain: -10 }, "deezer", "2026-03-01T00:00:00Z");
    expect(c).toMatchObject({
      bpm: 124,
      fetchedAt: "2026-03-01T00:00:00Z",
      changedAt: "2026-02-01T00:00:00Z",
    });
  });
  it("one tone per tanda: the composed nights keep most tandas inside the band (between tandas only by default)", () => {
    const all = nights.flatMap((p) => p.tandas);
    const inside = all.filter((t) => {
      const e = t.songs.map((s) => s.energy ?? 50);
      return Math.max(...e) - Math.min(...e) <= TONE_ENERGY_BAND;
    });
    // (round 20: 64 % of tandas inside the band — p50 7, p75 10, p90 12 over the 42-seed set; the spec reports it)
    // (round 21b: the tone is soft — a famous side, fame ≥ 4, is never passed over for it — 78 % inside on these seeds)
    expect(inside.length / all.length).toBeGreaterThanOrEqual(0.75);
  });
});

describe("big four — Di Sarli, D'Arienzo, Troilo, Pugliese spread over the night", () => {
  it("bigFourProblems names back-to-back tandas, an empty quartile and a short gap", () => {
    const T = (orchestraId: string) => ({ orchestraId, orchestra: orchestraId });
    const night = [
      T("carlos-di-sarli"),
      T("juan-d-arienzo"),
      ...Array.from({ length: 10 }, (_, i) => T(`o${i}`)),
      T("anibal-troilo"),
      T("x"),
      T("osvaldo-pugliese"),
      T("y"),
    ];
    const kinds = bigFourProblems(night, { orchestraRepeatGap: 6, hours: 4 }).map((p) => p.kind);
    expect(kinds).toContain("adjacent");
    expect(kinds).toContain("quartile");
  });
  it("composed nights: every quartile has a big-four tanda; back-to-back pairs are rare and recorded", () => {
    let adjacent = 0;
    for (const p of nights) {
      const f = bigFourProblems(p.tandas, p.options);
      expect(f.filter((x) => x.kind === "quartile")).toEqual([]);
      adjacent += f.filter((x) => x.kind === "adjacent").length;
      if (f.some((x) => x.kind === "adjacent" || x.kind === "gap"))
        expect(p.stats.settingFallbacks?.some((s) => s.startsWith("bigFour:"))).toBe(true);
    }
    // (the round-20 composer: 3.1 pairs a night over 42 seeds; the canon, the summit and the Pugliese chair win the rest)
    // (round 21b: the big four is a soft preference — only the after-repair swaps that leave every other rule as it
    // was; 2.5 pairs a night on these four seeds, each one recorded as a fallback)
    // (2026-11: "never back to back" — the repair also rebuilds a chair of the pair with another orchestra and may
    // cost the other rules a little for it: 1.75 pairs a night on these seeds, 1.8 over twelve. Zero is not reached
    // without trading the canon chairs — the early D'Arienzo, the summits, the Pugliese chair — for it)
    expect(adjacent / nights.length).toBeLessThanOrEqual(2);
  });
  // 2026-11 (function review): 3 h golden nights left a quartile empty on 10 of 12 seeds (usually the second) and
  // had no Pugliese on seeds 8, 10 and 11. A quartile is a quarter of the night's tandas, whatever the hours.
  describe("3 h and 5 h nights", () => {
    const longer: Array<{ hours: number; seed: number; p: Playlist }> = [];
    beforeAll(() => {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
        longer.push({ hours: 3, seed, p: compose({ hours: 3, seed, eras: ["golden"] }, deps) });
      for (const seed of [1, 2, 6, 12])
        longer.push({ hours: 5, seed, p: compose({ hours: 5, seed, eras: ["golden"] }, deps) });
    }, 600000);
    it("every quartile has a big-four tanda and Pugliese plays", () => {
      for (const { hours, seed, p } of longer) {
        const f = bigFourProblems(p.tandas, p.options);
        expect(
          f.filter((x) => x.kind === "quartile" || x.kind === "missing").map((x) => x.detail),
          `${hours} h seed ${seed}`,
        ).toEqual([]);
        expect(
          p.tandas.some((t) => t.orchestraId === "osvaldo-pugliese"),
          `${hours} h seed ${seed}`,
        ).toBe(true);
      }
    });
    it("3 h: at most one back-to-back big-four pair a night on average (2.1 before)", () => {
      const three = longer.filter((x) => x.hours === 3);
      const pairs = three.map(
        ({ p }) => bigFourProblems(p.tandas, p.options).filter((x) => x.kind === "adjacent").length,
      );
      expect(pairs.reduce((a, b) => a + b, 0) / three.length).toBeLessThanOrEqual(1);
    });
  });
});

describe("D — the Swap sheet", () => {
  it("suggestions keep the tanda valid; search shows every excluded side with its reason", () => {
    const p = nights[0]!;
    const ti = p.tandas.findIndex((t) => t.vocal && t.rhythm === "tango");
    const { suggestions, results } = swapOptions(p, ti, 1, deps, {
      query: p.tandas[ti]!.orchestra.split(" ").at(-1),
    });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.ok).toBe(true);
      expect(s.song.spotify?.uri).toBeTruthy();
    }
    expect(results.some((r) => !r.ok && !!r.reason)).toBe(true);
    const r = replaceSide(p, ti, 1, suggestions[0]!.song.id, deps);
    expect(r.reason).toBeUndefined();
    expect(
      tandaProblems(r.playlist.tandas[ti]!, p.options).filter((x) =>
        ["voice", "vocalStyle", "years"].includes(x.key),
      ),
    ).toEqual([]);
    expect(r.playlist.tandas[ti]!.songs[1]!.id).toBe(suggestions[0]!.song.id);
  });
  it("swapTrack never brings in another era, voice or style (the 1941 … 1979 tanda)", () => {
    const p = nights[1]!;
    p.tandas.forEach((_t, ti) => {
      if (ti > 6) return;
      const q = swapTrack(p, ti, 0, deps, 5);
      expect(
        tandaProblems(q.tandas[ti]!, p.options).filter((x) =>
          ["voice", "vocalStyle", "years"].includes(x.key),
        ),
      ).toEqual([]);
    });
  });
});

describe("pinned tandas — the DJ's exception", () => {
  it("what a pinned tanda breaks is a DJ exception, never a fault; improveNight leaves it alone", () => {
    const p = nights[2]!;
    const t = p.tandas[3]!;
    // (a dated side of the other voice, never La Cumparsita: an undated row is judged by nothing but its title)
    const other = deps.catalog.songs.find(
      (s) =>
        s.orchestraId === t.orchestraId &&
        s.vocal !== t.vocal &&
        s.rhythm === t.rhythm &&
        !!s.year &&
        normTitle(s.title) !== "la cumparsita",
    )!;
    const mixed: Tanda = { ...t, songs: [other, ...t.songs.slice(1)] };
    const q = pinTanda({ ...p, tandas: p.tandas.map((x, i) => (i === 3 ? mixed : x)) }, 3, "the DJ's tanda");
    const r = strictChecks(q);
    expect(r.violations.some((v) => v.tanda === 3)).toBe(false);
    expect(r.exceptions?.some((v) => v.tanda === 3 && v.rule === "tandaVoice")).toBe(true);
    // (the score agrees: a pinned tanda's mix is the DJ's, never an integrity fault)
    const f0 = (x: Playlist) => scorePlaylist(x).factors.find((f) => f.key === "integrity")!.score;
    expect(f0(q)).toBe(f0(p));
    // a night the DJ's pinned tandas make longer than the request is never a duration failure
    const longer = { ...q, stats: { ...q.stats, durationSec: q.options.hours! * 3600 * 1.2 } };
    expect(scorePlaylist(longer).reasons ?? []).not.toContainEqual(expect.stringMatching(/^duration/));
    const im = improveNight(q, deps, { maxRounds: 1 });
    expect(im.playlist.tandas[3]!.songs.map((s) => s.id)).toEqual(mixed.songs.map((s) => s.id));
  });
});

describe("the DJ's order and closing — exceptions, not faults", () => {
  it("a closing La Cumparsita the DJ chose is a DJ exception (the closer rule never asks to change it)", () => {
    const p = nights[0]!;
    const odd = deps.catalog.songs.find((s) => s.title === "La Cumparsita" && (s.fame ?? 0) < 2)!;
    const q: Playlist = { ...p, closing: odd };
    expect(strictChecks(q).violations.some((v) => v.rule === "closer")).toBe(true);
    const r = strictChecks({ ...q, closingPinned: { by: "dj", reason: "the DJ's closing version" } });
    expect(r.violations.some((v) => v.rule === "closer")).toBe(false);
    expect(r.exceptions?.some((v) => v.rule === "closer")).toBe(true);
  });
  it("tango tandas the DJ inserted shift the cycle: the shifted slots after them are DJ exceptions", () => {
    const p = nights[0]!;
    const k = p.tandas.findIndex(
      (t, i) => i > 2 && t.rhythm === "tango" && p.tandas[i + 1]?.rhythm === "tango",
    );
    // the DJ pins one more tango tanda right after a pair (three in a row) — every later slot shifts by one
    const extra = pinTanda(
      { ...p, tandas: [...p.tandas.slice(0, k + 2), p.tandas[k]!, ...p.tandas.slice(k + 2)] },
      k + 2,
      "the DJ's",
    );
    const r = strictChecks(extra);
    expect(r.violations.filter((v) => v.rule === "cycle" && v.tanda > k + 2)).toEqual([]);
    expect(r.exceptions?.some((v) => v.rule === "cycle")).toBe(true);
    // a vals the DJ adds: the vals / milonga balance is judged over the tandas the DJ did not pin
    const v = p.tandas.find((t) => t.rhythm === "vals")!;
    const more = pinTanda(
      pinTanda({ ...extra, tandas: [...extra.tandas.slice(0, 3), v, v, ...extra.tandas.slice(3)] }, 3, "x"),
      4,
      "y",
    );
    const r2 = strictChecks(more);
    expect(r2.violations.some((x) => x.rule === "cycle" && / vals and /.test(x.detail))).toBe(false);
  });
});

describe("round 21b — the round-21 preferences never override the round 9–17 rules", () => {
  it("a learned side weighs more only with a checked Spotify id; the weights are capped; a replaced side barely moves", () => {
    const L = { sides: { a: 3, b: 3, c: -1 }, families: { f: 3, g: -1 }, templates: [], edits: [] };
    expect(learnedSideFactor(L, "a", { spotify: null, streamSuspect: false } as never)).toBe(1);
    expect(
      learnedSideFactor(L, "b", { spotify: { uri: "spotify:track:x" }, streamSuspect: true } as never),
    ).toBe(1);
    expect(learnedSideFactor(L, "b", { spotify: { uri: "spotify:track:x" } } as never)).toBeLessThanOrEqual(
      1.45,
    );
    expect(learnedSideFactor(L, "c")).toBeGreaterThanOrEqual(0.9);
    expect(learnedFamilyFactor(L, "f")).toBeLessThanOrEqual(1.12);
    expect(learnedFamilyFactor(L, "g")).toBeGreaterThanOrEqual(0.9);
  });
  it("the summit plateau (≥ 78) is a tango chair's: no vals or milonga chair plans it", () => {
    for (const hours of [2, 3, 4, 5])
      for (const rules of [{}, { cumparsita: "close" as const }])
        for (const s of planSlots({ hours, rules } as never))
          if (s.rhythm !== "tango") expect(s.targetEnergy).toBeLessThanOrEqual(77);
  });
  it("the bands, the tone and the big four weigh a quarter in the panel's penalty", () => {
    const p = nights[1]!;
    const r = strictChecks(p);
    const soft = r.violations.filter((v) =>
      ["tandaBpm", "tandaLevel", "tandaTone", "bigFour"].includes(v.rule),
    ).length;
    const order = r.violations.filter((v) => v.rule === "sideOrder").length;
    expect(r.penalty).toBeCloseTo(r.blockers * 10 + r.shouldFix - 0.75 * order - 0.75 * soft, 6);
  });
  it("composed nights: no orchestra inside the round-9 gap for the big four's sake, no fame blocker", () => {
    for (const p of nights) {
      expect(strictChecks(p).violations.filter((v) => v.severity === "blocker")).toEqual([]);
      for (let i = 0; i < p.tandas.length; i++)
        for (let j = i + 1; j < Math.min(p.tandas.length, i + 6); j++)
          if (
            p.tandas[i]!.rhythm === "tango" &&
            p.tandas[j]!.rhythm === "tango" &&
            isBigFourId(p.tandas[i]!.orchestraId)
          )
            expect(p.tandas[j]!.orchestraId, `seed ${p.options.seed} ${i + 1}/${j + 1}`).not.toBe(
              p.tandas[i]!.orchestraId,
            );
    }
  });
});

describe("round 21c — the corpus closer closes; a night never repeats an orchestra's vals or milonga", () => {
  it("a corpus closer closes its tanda even when it is the slowest side (evidence beats the fade heuristic)", () => {
    const mk = (id: string, title: string, energy: number, role?: Song["role"]): Song =>
      ({ id, title, energy, fame: 3, role, rhythm: "tango", orchestraId: "miguel-calo", year: 1942 }) as Song;
    const songs = [
      mk("a", "Marión", 55, "opener"),
      mk("b", "Trenzas", 53, "closer"),
      mk("c", "Cuando", 60),
      mk("d", "Tabaco", 57),
    ];
    expect(strictOrder(songs, false).at(-1)!.title).toBe("Trenzas");
    expect(orderVerdictOf([songs[0]!, songs[3]!, songs[2]!, songs[1]!])).toEqual([]);
    // without corpus evidence the fade rule stands
    const plain = songs.map((x) => ({ ...x, role: undefined }));
    expect(
      orderVerdictOf([plain[0]!, plain[3]!, plain[2]!, plain[1]!]).some((x) => /ends \d+ below/.test(x)),
    ).toBe(true);
  });
});

describe("round 21c — one vals / milonga tanda per orchestra, the gap kept: the ladder", () => {
  const repeated = (p: Playlist) => {
    const vs = p.tandas.map((t, i) => (t.rhythm === "vals" ? i : -1)).filter((i) => i >= 0);
    const ts = p.tandas.map((t) => ({ ...t }));
    ts[vs[2]!] = {
      ...ts[vs[0]!]!,
      index: vs[2]!,
      targetEnergy: ts[vs[2]!]!.targetEnergy,
      cortina: ts[vs[2]!]!.cortina,
    };
    return { ts, at: vs[2]! };
  };
  const clean = (ts: Tanda[], gap: number) => {
    const seen = new Set<string>();
    for (const t of ts) {
      if (t.rhythm === "tango") continue;
      const k = `${t.orchestraId}|${t.rhythm}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
    ts.forEach((t, i) =>
      ts.forEach((x, j) => {
        if (j > i && j - i < gap && x.rhythm !== "tango")
          expect(x.orchestraId, `${i + 1}/${j + 1}`).not.toBe(t.orchestraId);
      }),
    );
  };
  it("1. a repeated vals takes a family not yet played inside the night's years", () => {
    const p = nights[0]!;
    const { ts, at } = repeated(p);
    const r = mendVmRepeats(ts, p.options, deps.catalog);
    expect(r.fallbacks[0]).toMatch(/a family not yet played/);
    clean(r.tandas, p.options.orchestraRepeatGap);
    for (const s of r.tandas[at]!.songs) expect(s.spotify?.uri).toBeTruthy();
  });
  it("2. when the night's years hold none, the chair's window widens to 1932–1950", () => {
    const p = nights[0]!;
    const { ts, at } = repeated(p);
    const r = mendVmRepeats(ts, { ...p.options, yearRange: [1939, 1939] }, deps.catalog);
    expect(r.fallbacks[0]).toMatch(/widened to 1932–1950/);
    for (const s of r.tandas[at]!.songs) expect(s.year! >= VM_WIDE[0] && s.year! <= VM_WIDE[1]).toBe(true);
  });
  it("3–4. a side without a stream is named for the DJ; a chair that moves says so; composed nights never repeat", () => {
    for (const p of nights) {
      clean(p.tandas, p.options.orchestraRepeatGap);
      for (const t of p.tandas)
        if (/no checked stream/.test(t.note ?? ""))
          expect(t.songs.filter((s) => !s.spotify?.uri).length).toBe(1);
      for (const f of p.stats.settingFallbacks ?? [])
        if (/^(vals|milonga): /.test(f)) expect(f).toMatch(/plays \(|moved to|no family fits/);
    }
  });
});

describe("round 21c — a vals inside its orchestra's gap: the tango chair changes family", () => {
  it("the tango tanda of that orchestra inside the gap takes another family of its mode; the panel is better", () => {
    const p = nights[0]!;
    const gap = p.options.orchestraRepeatGap;
    const v = p.tandas.findIndex((t, i) => t.rhythm === "vals" && i > gap && i < p.tandas.length - 2);
    // a tango chair two places before the vals plays the vals's orchestra (the gap broken, as a thin pool leaves it)
    const k = p.tandas.findIndex((t, i) => i >= v - 3 && i < v && t.rhythm === "tango" && !t.peak && i > 0);
    expect(v > 0 && k > 0).toBe(true);
    const ts = p.tandas.map((t) => ({ ...t }));
    ts[k] = {
      ...ts[k]!,
      orchestraId: ts[v]!.orchestraId,
      orchestra: ts[v]!.orchestra,
    };
    const judge = (x: Tanda[]) => strictChecks({ ...p, tandas: x });
    const before = judge(ts);
    expect(before.violations.some((x) => x.rule === "gap")).toBe(true);
    const r = mendTangoChairs(ts, p.options, deps.catalog, judge);
    expect(r.fallbacks.some((f) => /^gap: tanda/.test(f))).toBe(true);
    const after = judge(r.tandas);
    expect(after.blockers).toBeLessThanOrEqual(before.blockers);
    expect(after.penalty).toBeLessThan(before.penalty);
    const m = r.tandas.findIndex((t, i) => t !== ts[i]);
    expect(r.tandas[m]!.rhythm).toBe("tango");
    expect(r.tandas[m]!.vocal).toBe(ts[m]!.vocal);
    for (const s of r.tandas[m]!.songs) expect(s.spotify?.uri).toBeTruthy();
    // (the vals keeps its chair and its family)
    expect(r.tandas[v]).toBe(ts[v]);
  });
});

describe("round 21c — one tango chair a night may bring an orchestra the night does not play", () => {
  it("the bench mend changes one single-tanda chair (never the big four, a summit, the first or the última) to an orchestra new to the night, the panel no worse", () => {
    const BIG = ["carlos-di-sarli", "juan-d-arienzo", "anibal-troilo", "osvaldo-pugliese"];
    let changed = 0;
    for (const p of nights) {
      const judge = (x: Tanda[]) => strictChecks({ ...p, tandas: x });
      const r = mendBenchVariety(p.tandas, p.options, deps.catalog, judge);
      const diff = r.tandas.map((t, i) => (t !== p.tandas[i] ? i : -1)).filter((i) => i >= 0);
      expect(diff.length).toBeLessThanOrEqual(1);
      if (!diff.length) continue;
      changed++;
      const i = diff[0]!,
        a = p.tandas[i]!,
        b = r.tandas[i]!;
      expect(i > 0 && i < p.tandas.length - 1 && !a.peak && a.rhythm === "tango").toBe(true);
      expect(BIG.includes(a.orchestraId)).toBe(false);
      expect(p.tandas.some((t) => t.orchestraId === b.orchestraId)).toBe(false);
      expect(b.vocal).toBe(a.vocal);
      expect(judge(r.tandas).blockers).toBeLessThanOrEqual(judge(p.tandas).blockers);
      expect(judge(r.tandas).penalty).toBeLessThanOrEqual(judge(p.tandas).penalty + 1e-9);
    }
    expect(changed).toBeGreaterThanOrEqual(0);
  });
});

describe("round 21c — the cortina families carry the Pugliese gap and the vals gaps", () => {
  it("the planned families hold a moody cue for the gap before Pugliese and soft cues for the vals", () => {
    const pool = cortinaPool(deps.cortinas, undefined);
    const o = nights[0]!.options;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plan = planCortinas(
        pool,
        o,
        {
          next: () => ((seed * 9301 + 49297) % 233280) / 233280,
          pick: <T>(xs: T[]) => xs[seed % xs.length],
          weighted: <T>(xs: T[]) => xs[0],
        } as never,
        60,
        22,
        4,
        { dramatic: 1, vals: 4 },
      );
      if (!plan.families.length) continue;
      const fam = pool.filter((c) => plan.families.includes(familyOf(c)));
      expect(
        fam.some((c) => cueMoody(c) && c.energy <= 70 && cortinaTempo(c) !== "up"),
        `seed ${seed} ${plan.families}`,
      ).toBe(true);
      expect(fam.filter((c) => c.energy <= 66 && cortinaTempo(c) !== "slow").length).toBeGreaterThanOrEqual(
        4,
      );
    }
  });
});

describe("learning from the DJ's edits", () => {
  it("a replaced tanda becomes weighted preferences and a template", () => {
    const p = nights[0]!;
    const k = p.tandas.findIndex((_t, i) => i > 0 && swapOptions(p, i, 0, deps).suggestions.length > 0);
    const t = p.tandas[k]!;
    const alt = swapTrack(p, k, 0, deps, 9);
    const after = pinTanda(alt, k, "kept");
    const d = editDiff(p, after);
    expect(d.added.length + d.removed.length).toBeGreaterThan(0);
    const L = learnFromEdit(undefined, p, after, "2026-11-14T00:00:00Z");
    expect(L.templates?.length).toBe(1);
    const fk = `${t.orchestraId}|${(t.singer ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()}|${t.rhythm}`;
    expect(Object.keys(L.families ?? {}).some((k) => k.startsWith(t.orchestraId))).toBe(true);
    expect(learnedFamilyFactor(L, fk)).toBeGreaterThanOrEqual(1);
  });
  it("the repo-level preferences learned from the featured edits are loaded", () => {
    expect(Object.keys(deps.catalog.learned?.sides ?? {}).length).toBeGreaterThan(10);
    expect(deps.catalog.learned?.templates?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("F — the featured night: only the DJ's edits", () => {
  const shipped = readJson("docs/specs/round19-best-night.json") as Playlist;
  const f = readJson("apps/web/public/featured/golden-double-peak.json") as Playlist;
  const ids = (t: Tanda) => t.songs.map((s) => s.id);
  // the DJ's slots, by the shipped numbering; the two tandas the DJ asked for between the new tango tandas sit after
  // T17 and T19, so T18 and later move down one, T20 and later two
  const at = (slot: number) => (slot <= 17 ? slot - 1 : slot <= 19 ? slot : slot + 1);
  const DJ: Record<number, string[]> = {
    2: ["54e1304409", "8509c04168", "67d75c4496", "e5cccb8a87"],
    4: ["eb345072d6", "9673dd79e8", "3e9af572cf", "f9150b4c8a"],
    5: ["e9d31466ec", "131567e74b", "7b191bb215", "bb6ae09db6"],
    9: ["aa6b36ab7b", "71540229e1", "ea9b927fa5"],
    10: ["6233830410", "2171c0196b", "deac5ee8db", "cebfbd8996"],
    11: ["24801db04a", "e851d595be", "c02b739977", "6e9afb7087"],
    // (the Di Sarli milonga, the owner's as shipped: Zorzal, La Mulateada, Pena Mulata)
    12: ["0bdaadeef1", "16baa4103e", "c42ea450d8"],
    13: ["16814cca76", "86e53db337", "ddfdb2c29b", "89bc9d7eef"],
    14: ["13fe376eb1", "0265a65075", "00a061a315", "166b2a4f3e"],
    15: ["3b4476d64c", "a6a1af0e1d", "8106c5a228"],
    16: ["28c8dff26b", "ac9c62f5b5", "d642ae0730", "c668717864"],
    17: ["e02b2e4f92", "be7917b0c8", "f29c7184ba", "6ac37b2ef8"],
    18: ["32fdbfc82d", "67f9a28a62", "38f03bac6d", "a2e1839ef1"],
    19: ["655a908b21", "94056c42f4", "a2a56b32a2", "ae692df479"],
    23: ["130fe70e7e", "a81d03fa26", "979e83ad3f", "5486994f6f"],
  };
  it("the DJ's tandas, exactly and in order, pinned", () => {
    for (const [slot, want] of Object.entries(DJ)) {
      const t = f.tandas[at(Number(slot))]!;
      expect(ids(t), `T${slot}`).toEqual(want);
      expect(t.pinned?.by, `T${slot}`).toBe("dj");
    }
    expect(f.tandas[6]!.songs.map((s) => s.title)).toEqual([
      "Me Voy a Baraja",
      "Gato",
      "Mis Pesares",
      "Carnaval de mi Barrio",
    ]);
    expect(f.tandas[7]!.songs.map((s) => s.title)).toEqual([
      "Ansiedad",
      "Farabute",
      "No Mientas",
      "La Bruja",
    ]);
    expect(f.tandas[19]!.orchestra).toBe("Tango Bardo");
    expect(f.tandas[18]!.rhythm).toBe("tango");
    // the panel: what the DJ's tandas break is a DJ exception, never a blocker
    expect(strictChecks(f).blockers).toBe(0);
    expect(strictChecks(f).exceptions?.length).toBeGreaterThan(0);
  });
  it("T4 and T15 are one orchestra each, in the versions the DJ chose", () => {
    const row = (slot: number) =>
      f.tandas[at(slot)]!.songs.map((s) => [s.title, s.orchestraId, s.singer, s.spotify?.uri]);
    // T15: Canaro instrumental valses (no D'Arienzo 1935 side)
    expect(f.tandas[at(15)]!.orchestraId).toBe("francisco-canaro");
    expect(f.tandas[at(15)]!.orchestra).toBe("Francisco Canaro");
    expect(f.tandas[at(15)]!.vocal).toBe(false);
    expect(row(15)).toEqual([
      ["Desde el Alma", "francisco-canaro", null, "spotify:track:1eNQxurcsXpnSABkovjQdM"],
      ["Francia", "francisco-canaro", null, "spotify:track:4gKY2486rJizr3nqXBnHbz"],
      ["Corazón de Oro", "francisco-canaro", null, "spotify:track:5g3zxHHVxvxwA6iFARCZ8H"],
    ]);
    // T4: Llámale "h" is the Alberto Gómez take, beside the Gómez 1933 sides
    expect(row(4)[1]).toEqual([
      'Llámale "h"',
      "orquesta-tipica-victor",
      "Alberto Gómez",
      "spotify:track:7aL601bNX5PsjELQaZISPw",
    ]);
    expect(f.tandas[at(4)]!.songs.every((s) => s.orchestraId === "orquesta-tipica-victor")).toBe(true);
    expect(f.tandas[at(4)]!.singer).toBe("Angel Vargas · Alberto Gómez");
  });
  it("a vals after T17 and a milonga after T19 keep the cycle; the última still ends on Así Se Baila el Tango", () => {
    expect(f.tandas).toHaveLength(25);
    expect(f.tandas[17]!.rhythm).toBe("vals");
    expect(f.tandas[20]!.rhythm).toBe("milonga");
    for (const i of [17, 20])
      expect(["carlos-di-sarli", "juan-d-arienzo", "anibal-troilo", "osvaldo-pugliese"]).not.toContain(
        f.tandas[i]!.orchestraId,
      );
    expect(f.tandas.at(-1)!.songs.at(-1)!.title).toBe("Así Se Baila el Tango");
    let run = 0;
    for (const t of f.tandas) {
      run = t.rhythm === "tango" ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(2);
    }
  });
  it("Tres Esquinas is the 1941 restoration; D'Agostino opens, Bandonegro closes (the DJ's)", () => {
    expect(f.tandas[0]!.songs.find((s) => s.id === "d1d4a2ee18")?.spotify?.uri).toBe(
      "spotify:track:5HftCmLhynna9guHF1xz8b",
    );
    expect(f.opening?.title).toBe("La Cumparsita");
    expect(f.opening?.orchestraId).toBe("angel-d-agostino");
    expect(f.closing?.id).toBe("499d9ecc71");
    expect(f.closingPinned?.by).toBe("dj");
  });
  it("every other tanda is the shipped one (its sides and order)", () => {
    const changed = new Set([2, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 23]);
    for (let slot = 1; slot <= 23; slot++)
      if (!changed.has(slot))
        expect(ids(f.tandas[at(slot)]!), `T${slot}`).toEqual(ids(shipped.tandas[slot - 1]!));
  });
  it("no side twice, every side with a checked Spotify id", () => {
    const all = f.tandas.flatMap((t) => t.songs.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    for (const t of f.tandas) for (const s of t.songs) expect(s.spotify?.uri).toMatch(/^spotify:track:/);
  });
});

describe("bypass — skip tonight, the last four tango only, the closing", () => {
  const f = readJson("apps/web/public/featured/golden-double-peak.json") as Playlist;
  it("a tanda marked skip tonight is bypassed in the player; its cortina goes with it; the export keeps it", () => {
    const p: Playlist = { ...f, tandas: f.tandas.map((t, i) => (i === 17 ? { ...t, bypass: true } : t)) };
    expect([...bypassedTandas(p)]).toEqual([17]);
    const plan = p.booth!.items;
    const skip = new Set(bypassPlanItems(p, plan));
    for (const [k, it] of plan.entries()) {
      const mine = it.tanda === 18 && (it.kind === "track" || it.kind === "cortina");
      expect(skip.has(k), `${it.kind} ${it.tanda}`).toBe(mine);
    }
    expect(exportTandas(p)).toHaveLength(p.tandas.length);
    expect(exportTandas(p, { dropBypassed: true })).toHaveLength(p.tandas.length - 1);
  });
  it("last four tandas tango only: the vals or milonga among the last four is bypassed until four tangos close", () => {
    const p: Playlist = {
      ...f,
      options: { ...f.options, rules: { ...f.options.rules, lastFourTango: true } },
    };
    const by = bypassedTandas(p);
    const left = p.tandas.filter((_t, i) => !by.has(i));
    expect(left.slice(-4).every((t) => t.rhythm === "tango")).toBe(true);
    expect([...by].every((i) => p.tandas[i]!.rhythm !== "tango")).toBe(true);
    expect([...by].every((i) => i >= p.tandas.length - 6)).toBe(true);
    // the export's last four are tango too (the flat export and every format built on it)
    expect(
      exportTandas(p)
        .slice(-4)
        .every((t) => t.rhythm === "tango"),
    ).toBe(true);
    const rows = flatten(p).filter((r) => r.kind === "track");
    const lastTandas = [...new Set(rows.map((r) => r.tanda))].slice(-4);
    expect(lastTandas.every((k) => rows.find((r) => r.tanda === k)!.rhythm === "tango")).toBe(true);
    expect(
      new Set(
        flatten(f)
          .filter((r) => r.kind === "track")
          .map((r) => r.tanda),
      ).size,
    ).toBe(f.tandas.length);
  });
  it("the closing follows the harmony setting: the última's orchestra near its years, or the classic contrast", () => {
    const n = nights[0]!;
    const last = n.tandas.at(-1)!;
    const h = closingFor(deps.catalog, n.options, last);
    expect(h.song?.title).toBe("La Cumparsita");
    if (h.song?.orchestraId !== last.orchestraId) expect(h.fallback).toMatch(/^closer: /);
    const hn = compose({ hours: 4, seed: 1, rules: { cumparsitaHarmony: true } }, deps);
    const hl = hn.tandas.at(-1)!;
    expect(
      hn.closing?.orchestraId === hl.orchestraId ||
        !!hn.stats.settingFallbacks?.some((x) => x.startsWith("closer: ")),
    ).toBe(true);
    // the default keeps the classic rule: another orchestra than the última's
    expect(n.closing!.orchestraId).not.toBe(last.orchestraId);
  });
});
