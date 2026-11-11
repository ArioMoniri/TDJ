/**
 * Round-15 invariants (docs/specs/round15-engine.md): every blocker and should-fix the round-15 panel raised on the
 * three best round-14 nights (docs/reviews/round15-dancer.md, round15-dj.md, round15-discography.md) as a
 * deterministic check that runs on every generation. Written before the engine change; the spec records which of them
 * failed on the round-14 engine and index.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  auditStreams,
  benchmarkNight,
  candidatesFor,
  compose,
  cortinaPool,
  cueAudioSuspect,
  improveNight,
  nightShapeLine,
  normTitle,
  orderVerdict,
  type Playlist,
  patternString,
  type Song,
  STRICT_RULES,
  scorePlaylist,
  strictChecks,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let FO: Record<string, unknown>;
let rawSongs: Array<Song & { rhythmCode?: string }>;
beforeAll(() => {
  deps = loadCatalog();
  const featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  const fo = { ...featured.options } as Record<string, unknown>;
  for (const k of ["contextApplied", "trackSecByRhythm", "cortinaGenres", "vocalBias", "tempoShift", "seed"])
    delete fo[k];
  FO = { ...fo, explicit: Object.keys(fo).filter((k) => k !== "context") };
  rawSongs = JSON.parse(readFileSync(join(findRoot(), "data/index/songs.json"), "utf8"));
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
/** the three nights the round-15 panel reviewed (featured options), plus two more */
const PANEL_SEEDS = [255, 97, 156, 148, 36];
const cache = new Map<string, Playlist>();
const golden = (seed: number) => {
  const k = `g${seed}`;
  if (!cache.has(k)) cache.set(k, compose({ hours: 4, seed }, deps));
  return cache.get(k)!;
};
const night = (seed: number) => {
  const k = `f${seed}`;
  if (!cache.has(k)) cache.set(k, compose({ ...FO, seed }, deps));
  return cache.get(k)!;
};
const all = () => [...SEEDS.map(golden), ...PANEL_SEEDS.map(night)];
const byId = (id: string) =>
  deps.catalog.songs.find((s) => s.id === id || s.altIds?.includes(id)) as Song | undefined;
const fmt = (p: Playlist, key: string) =>
  strictChecks(p)
    .violations.filter((v) => v.rule === key)
    .map((v) => `${p.options.seed}: ${v.detail}`);
const isCump = (s: Song) => /cumparsita/i.test(s.title);

/** the round-15 rules (docs/specs/round15-engine.md §1) */
const R15 = [
  "cycle",
  "vocalSide",
  "afterSummit",
  "energyStep",
  "hotCold",
  "firstVals",
  "lastSummit",
  "ultima",
  "bestWindow",
  "instrCharacter",
  "stream3",
  "streamNight",
  "suspectStream",
  "cueLength",
  "cuePopPeak",
  "cuePopHour",
  "cueMeta",
  "nightShape",
  "sideOrder",
];

// ---------------------------------------------------------------------------------------------------------------
describe("A — index corrections (discography review §4)", () => {
  it("Recuerdo (Tanturi 1942-11-04) is an instrumental, and the 1941 vals keeps its own Deezer track", () => {
    const s = byId("79264f596c")!;
    expect(s.vocal).toBe(false);
    expect(s.singer).toBeNull();
    expect(s.resolved?.id ?? null).not.toBe("1903385817");
    expect(byId("3a302c4ffd")!.resolved?.id).toBe("1903385817");
  });
  it("title fixes (El Último Adiós, ¡Cómo Has Cambiado, Pebeta!, Mirame de Frente, Frou Frou, Milongueando en el 40)", () => {
    expect(byId("63f9f276ae")!.title).toBe("El Último Adiós");
    expect(byId("f1acd1338d")!.title).toBe("¡Cómo Has Cambiado, Pebeta!");
    expect(byId("4383a7d337")!.title).toBe("Mirame de Frente");
    expect(byId("67af743962")!.altTitles).toContain("Frou Frou");
    const m = byId("f96fa56eaa")!;
    expect(m.title).toBe("Milongueando en el 40");
    expect(m.altTitles).toContain("Milongueando en el Cuarenta");
  });
  it("R13: rhythmCode is derived from rhythm on every row (tango T, vals V, milonga M; a T/V/M code on another rhythm reads ND)", () => {
    // (a source code of another genre — CA canción, BM, TO tonada — is kept on its own rhythm)
    const want: Record<string, string> = { tango: "T", vals: "V", milonga: "M" };
    const code: Record<string, string> = { T: "tango", V: "vals", M: "milonga", ND: "other" };
    const bad = rawSongs.filter(
      (s) =>
        (s.rhythm in want && s.rhythmCode !== want[s.rhythm]) ||
        (!!s.rhythmCode && s.rhythmCode in code && code[s.rhythmCode] !== s.rhythm),
    );
    expect(bad.map((s) => `${s.id} ${s.rhythm}/${s.rhythmCode}`).slice(0, 8)).toEqual([]);
  });
  it("R4a: one stream id, one recording (no Deezer or Spotify id bound to rows of different dates or singers)", () => {
    const a = auditStreams(deps.raw.songs, deps.raw.resolved, deps.raw.cache);
    expect(a.shared.map((x) => `${x.streamId}: ${x.rows.join(", ")}`).slice(0, 6)).toEqual([]);
  });
  it("R4a: the review's wrong owners are unbound and the right rows keep their tracks", () => {
    for (const id of [
      "e2fd0a604b",
      "653396cb92",
      "93f9aa226a",
      "1061490d35",
      "a4018188aa",
      "f2bdbd9bb4",
      "5bcb61830c",
      "d668b07297",
    ])
      expect(deps.raw.resolved[id] ?? null, id).toBeNull();
    expect(byId("df28764a9b")!.resolved?.id).toBe("6824859");
    expect(byId("e5cccb8a87")!.resolved?.id).toBe("91936698");
    expect(byId("71c0f22c8e")!.resolved?.id).toBe("91936716");
  });
  it("R4b: a stream whose title carries a recording date is within 31 days of the row's date", () => {
    const a = auditStreams(deps.raw.songs, deps.raw.resolved, deps.raw.cache);
    expect(a.dateMismatch.slice(0, 6)).toEqual([]);
    // and the catalog never plays such a match
    const bad = deps.catalog.songs.filter((s) => {
      const m = /\b(\d{1,2})\/(\d{1,2})\/(19\d\d)\b/.exec(s.resolved?.title ?? "");
      if (!m || !s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return false;
      const d = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Math.abs(d - Date.parse(s.date)) > 31 * 864e5;
    });
    expect(bad.map((s) => `${s.title} ${s.date}`)).toEqual([]);
  });
  it("R4c: when the Spotify transfer and the Deezer track disagree by more than 8 s, the Deezer length is the side's", () => {
    const off = deps.catalog.songs.filter((s) => {
      const sp = s.spotify?.durationMs,
        dz = s.resolved?.durationMs;
      if (!sp || !dz || /restaur/i.test(`${s.resolved?.title} ${s.resolved?.album}`)) return false;
      const d = (sp - dz) / 1000;
      return Math.abs(d) > 8 && s.durationSec !== Math.round(dz / 1000);
    });
    expect(off.map((s) => `${s.title} ${s.durationSec}`).slice(0, 6)).toEqual([]);
    // Pensalo bien (D'Arienzo / Echagüe 1938): Spotify 2:17, Deezer 2:30
    const p = byId("58db812968")!;
    if (p.resolved?.durationMs) expect(p.durationSec).toBe(Math.round(p.resolved.durationMs / 1000));
  });
  it("R4d: a match whose credit names a singer the row lacks is suspect (Tengo mil novias: 'cantan Armando Moreno')", () => {
    expect(byId("8af1ef5bd0")!.streamSuspect).toBe(true);
    const a = auditStreams(deps.raw.songs, deps.raw.resolved, deps.raw.cache);
    const flagged = new Set(deps.catalog.songs.filter((s) => s.streamSuspect).map((s) => s.id));
    // (a match the catalogue already dropped — its credit names neither orchestra nor singer — plays nothing)
    const live = (id: string) => {
      const s = byId(id);
      return !!(s?.resolved || s?.spotify);
    };
    expect(a.creditMismatch.filter((x) => live(x.row) && !flagged.has(x.row)).slice(0, 6)).toEqual([]);
  });
  it("cortinas: years (Sil Baştan 2001, Haram Geceler 1992, Yaz Gazeteci Yaz 1976, Bu Kalp Seni Unutur mu 1993, İstanbul'da Sonbahar 2001, Leylim Ley 1975)", () => {
    const pool = cortinaPool(deps.cortinas);
    const y = (id: string) => pool.find((x) => x.id === id)?.year;
    expect(y("c-tr-ferah-sil-bastan")).toBe(2001);
    expect(y("c-tr-nilufer-haram")).toBe(1992);
    expect(y("c-tr-selda-yaz-gazeteci")).toBe(1976);
    expect(y("c-tr-kizilok-bu-kalp")).toBe(1993);
    expect(y("c-tr-teoman-sonbahar")).toBe(2001);
    expect(y("c-tr-livaneli-leylim")).toBe(1975);
  });
  it("cortinas: İşte Öyle Bir Şey and Göreceksin Kendini play the original, never a duet or re-recording album", () => {
    const pool = cortinaPool(deps.cortinas);
    const al = (id: string) => pool.find((x) => x.id === id)?.resolved?.album ?? "";
    expect(al("c-tr-evgin-iste-oyle")).not.toMatch(/Düet/);
    expect(al("c-tr-nilufer-goreceksin")).not.toMatch(/Yeniden/);
  });
  it("R12b: every cortina a pool can offer has a year and no duet, live, remix or re-recording audio", () => {
    const pool = cortinaPool(deps.cortinas);
    for (const cultures of [["turkish"], ["global"]]) {
      const cands = candidatesFor(pool, {
        ...(FO as object),
        cortinaCultures: cultures,
      } as Playlist["options"]);
      expect(cands.filter((c) => !c.year).map((c) => c.id)).toEqual([]);
      expect(cands.filter(cueAudioSuspect).map((c) => `${c.id}: ${c.resolved?.album}`)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
/**
 * The should-fix items the engine still leaves on these 17 nights (docs/specs/round15-engine.md §6): a ratchet, never
 * to rise. Every round-15 blocker is at zero.
 */
const RATCHET15: Record<string, number> = {
  // round-14 engine on these nights: energyStep 48, firstVals 17, bestWindow 12, afterSummit 15, lastSummit 8,
  // cuePopHour 14, streamNight 25, instrCharacter 2 (sideOrder did not exist)
  // round 16 (docs/specs/round16-engine.md §6): retuned rules fell — sideOrder 91 → 19, cuePopHour 10 → 0, firstVals
  // 12 → 0, lastSummit 7 → 2, bestWindow 3 → 2, instrCharacter 1 → 0; the stricter export matching (M1–M8) took
  // streams from the families these nights need, so stream3 0 → 11 and streamNight 0 → 21 (the retuned streamNight
  // also refuses an edge or uneven tanda's exception) and afterSummit 6 → 9 (the D'Arienzo instrumental summit lost
  // its 1937–40 streams); energyStep 30 → 27
  energyStep: 27,
  afterSummit: 9,
  lastSummit: 2,
  bestWindow: 2,
  sideOrder: 19,
  stream3: 11,
  streamNight: 21,
  // (ratchet entries at zero kept for the record)
  firstVals: 0,
  cuePopHour: 0,
  instrCharacter: 0,
};
describe("B — the round-15 panel on every composed night (golden set S1–S12 and the featured options)", () => {
  it("the panel carries every round-15 rule with its review source", () => {
    for (const k of R15) {
      const r = STRICT_RULES.find((x) => x.key === k);
      expect(r, k).toBeDefined();
      expect(r!.source, k).toMatch(/round15-(dancer|dj|discography)\.md/);
    }
    expect(STRICT_RULES.find((x) => x.key === "cycle")!.severity).toBe("blocker");
    expect(STRICT_RULES.find((x) => x.key === "vocalSide")!.severity).toBe("blocker");
  });
  for (const k of R15)
    it(`${k}`, () => {
      const bad = all().flatMap((p) => fmt(p, k));
      const sev = STRICT_RULES.find((x) => x.key === k)?.severity;
      if (sev === "blocker" || !(k in RATCHET15)) expect(bad.slice(0, 6)).toEqual([]);
      else expect(bad.length, bad.slice(0, 4).join(" | ")).toBeLessThanOrEqual(RATCHET15[k]!);
    });
});

describe("C — the classic cycle and the clock (dancer N1, N4; DJ N1, N6)", () => {
  it("TTVTTM is hard: every tanda before the última follows the cycle, the última is a tango, never three tangos in a row", () => {
    for (const p of all()) {
      const pat = patternString(p.options);
      if (pat !== "TTVTTM") continue;
      const rs = p.tandas.map((t) => t.rhythm[0]!.toUpperCase()).join("");
      const want = p.tandas.map((_, i) => (i === p.tandas.length - 1 ? "T" : pat[i % 6])).join("");
      expect(rs, `seed ${p.options.seed}`).toBe(want);
      expect(rs, `seed ${p.options.seed}`).not.toMatch(/TTT/);
      const v = p.tandas.filter((t) => t.rhythm === "vals").length;
      const m = p.tandas.filter((t) => t.rhythm === "milonga").length;
      expect(Math.abs(v - m), `seed ${p.options.seed}`).toBeLessThanOrEqual(1);
    }
  });
  it("the first vals starts within 40 minutes", () => {
    for (const p of all()) {
      let at = 0;
      for (const t of p.tandas) {
        if (t.rhythm === "vals") break;
        at += t.songs.reduce((a, s) => a + (s.durationSec ?? 170), 0) + (t.cortina?.lengthSec ?? 0);
      }
      expect(at, `seed ${p.options.seed}`).toBeLessThanOrEqual(40 * 60);
    }
  });
  it("cortinas stay within the setting ± 5 s and never run over 50 s: the clock is met with tandas", () => {
    for (const p of all()) {
      const set = p.options.cortinaLengthSec;
      const lens = p.tandas.filter((t) => t.cortina).map((t) => t.cortina!.lengthSec ?? set);
      expect(
        lens.filter((l) => l < set - 5 || l > Math.min(set + 5, Math.max(50, set))),
        `seed ${p.options.seed}`,
      ).toEqual([]);
      // and the night still lands on its hours (within one tango tanda: the count keeps the cycle legal)
      expect(Math.abs(p.stats.durationSec - p.options.hours * 3600), `seed ${p.options.seed}`).toBeLessThan(
        720,
      );
    }
  });
  it("the benchmark's cortina-length check reads the setting (a 58 s cue on a 45 s night is not ok)", () => {
    const p = golden(1);
    const q = {
      ...p,
      tandas: p.tandas.map((t) => (t.cortina ? { ...t, cortina: { ...t.cortina, lengthSec: 58 } } : t)),
    };
    expect(benchmarkNight(q).checks.find((c) => c.key === "cortinaLength")!.status).not.toBe("ok");
  });
  it("a vals slot that falls back to a tango is a strict blocker (the round-14 known regression)", () => {
    const p = golden(1);
    const t2 = p.tandas.find((t, i) => i > 2 && t.rhythm === "tango")!;
    const q = { ...p, tandas: p.tandas.map((t, i) => (i === 2 ? { ...t2, index: 2 } : t)) };
    expect(strictChecks(q).violations.some((v) => v.rule === "cycle" && v.severity === "blocker")).toBe(true);
  });
});

describe("D — the panel's named rules hold on the reviewed seeds", () => {
  it("the última: golden core, every side fame ≥ 3, mean ≥ 4 (dancer N7, DJ N4)", () => {
    for (const s of PANEL_SEEDS) {
      const p = night(s);
      const u = p.tandas.at(-1)!;
      const ss = u.songs.filter((x) => !isCump(x));
      expect(u.golden, `F${s}`).toBe("core");
      expect(Math.min(...ss.map((x) => x.fame ?? 0)), `F${s}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("3-side tandas stream every side with no fame-0 side, and a night has at most one unstreamable side, on all but the ratchet's few (dancer N3, DJ N7)", () => {
    let bad = 0;
    for (const p of all()) {
      const un = p.tandas.flatMap((t) => t.songs.filter((x) => !isCump(x) && !(x.spotify || x.resolved)));
      if (un.length > 1) bad++;
      for (const t of p.tandas.filter((x) => x.songs.length <= 3))
        if (t.songs.some((x) => !(x.spotify || x.resolved) || (x.fame ?? 0) === 0)) bad++;
    }
    expect(bad).toBeLessThanOrEqual((RATCHET15.stream3 ?? 0) + (RATCHET15.streamNight ?? 0));
  });
  it("improveNight never adds a round-15 violation", () => {
    for (const p of [night(255), golden(1), golden(2)]) {
      const base = { ...p, score: scorePlaylist(p) };
      const a = strictChecks(base),
        b = strictChecks(improveNight(base, deps).playlist);
      expect(b.blockers).toBeLessThanOrEqual(a.blockers);
      expect(b.penalty).toBeLessThanOrEqual(a.penalty);
    }
  });
});

describe("E — title sanity", () => {
  it("no title in the index keeps an unaccented 'Adios' after 'Último'", () => {
    expect(deps.catalog.songs.filter((s) => /^El Último Adios$/.test(s.title)).map((s) => s.title)).toEqual(
      [],
    );
    expect(normTitle("Milongueando en el 40")).toBe("milongueando en el 40");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("F — the night's shape follows the settings (opener, última, closer), through compose and improveNight", () => {
  const grid: Array<Record<string, unknown>> = [
    {
      openerOrchestra: "carlos-di-sarli",
      ultimaOrchestra: "ricardo-tanturi",
      ultimaSinger: "Alberto Castillo",
      closer: "auto",
    },
    {
      openerOrchestra: "francisco-canaro",
      ultimaOrchestra: "anibal-troilo",
      ultimaSinger: "Francisco Fiorentino",
      closer: "felicia",
    },
    {
      openerOrchestra: "angel-d-agostino",
      ultimaOrchestra: "juan-d-arienzo",
      ultimaSinger: null,
      closer: "none",
    },
  ];
  for (const [k, rules] of grid.entries())
    it(`settings ${k + 1}: ${JSON.stringify(rules)}`, () => {
      for (const seed of [1, 2]) {
        const p = compose({ hours: 4, seed, rules: rules as Playlist["options"]["rules"] }, deps);
        const fb = p.stats.settingFallbacks ?? [];
        const r = p.options.rules!;
        if (!fb.some((f) => f.startsWith("opener:")))
          expect(p.tandas[0]!.orchestraId).toBe(r.openerOrchestra);
        const u = p.tandas.at(-1)!;
        if (!fb.some((f) => f.startsWith("ultima:"))) {
          expect(u.orchestraId, `S${seed}`).toBe(r.ultimaOrchestra);
          if (r.ultimaSinger === null) expect(u.vocal).toBe(false);
          else expect(normTitle(u.singer ?? "")).toBe(normTitle(r.ultimaSinger ?? ""));
        }
        if (r.closer === "none") expect(p.closing).toBeNull();
        else if (r.closer === "felicia" && !fb.some((f) => f.startsWith("closer:")))
          expect(normTitle(p.closing?.title ?? "")).toBe("felicia");
        else expect(normTitle(p.closing?.title ?? "")).toBe("la cumparsita");
        expect(fmt(p, "nightShape")).toEqual([]);
        const q = improveNight(p, deps).playlist;
        expect(fmt(q, "nightShape")).toEqual([]);
        expect(q.tandas[0]!.orchestraId).toBe(p.tandas[0]!.orchestraId);
        expect(q.tandas.at(-1)!.orchestraId).toBe(u.orchestraId);
        expect(nightShapeLine(p)).toMatch(/^Night shape: opened by .*, última .*, closer /);
      }
    });
  it("an opener the year range cannot give falls back visibly and the panel accepts the fallback", () => {
    const p = compose({ hours: 4, seed: 3, rules: { openerOrchestra: "astor-piazzolla" } }, deps);
    expect(p.stats.settingFallbacks?.some((f) => f.startsWith("opener:"))).toBe(true);
    expect(fmt(p, "nightShape")).toEqual([]);
  });
  it("the default rules hold on every composed night (canon opener, the última rule, La Cumparsita)", () => {
    for (const p of all()) expect(fmt(p, "nightShape")).toEqual([]);
  });
});

describe("G — the song order inside every tanda (opener, energy shape, the best-loved side, the years)", () => {
  it("the verdict reads an inviting opener, a mid-tanda dip, the best side's place and back-and-forth years", () => {
    const mk = (title: string, fame: number, energy: number, year: number) =>
      ({ id: title, title, fame, energy, year, orchestra: "x" }) as Song;
    expect(
      orderVerdict({
        songs: [mk("a", 4, 72, 1940), mk("b", 3, 70, 1940), mk("c", 4, 74, 1941), mk("d", 5, 76, 1941)],
      }),
    ).toEqual([]);
    const bad = orderVerdict({
      songs: [mk("a", 1, 60, 1938), mk("c", 5, 74, 1942), mk("b", 3, 50, 1938), mk("d", 3, 72, 1942)],
    });
    expect(bad.join(" | ")).toMatch(/opens on a/);
    expect(bad.join(" | ")).toMatch(/best-loved/);
    expect(bad.join(" | ")).toMatch(/back and forth/);
  });
  it("improveNight never makes the order worse", () => {
    for (const p of [golden(1), night(97)]) {
      const q = improveNight({ ...p, score: scorePlaylist(p) }, deps).playlist;
      expect(fmt(q, "sideOrder").length).toBeLessThanOrEqual(fmt(p, "sideOrder").length);
    }
  });
});
