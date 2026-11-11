/**
 * Round-17 invariants (docs/specs/round17-engine.md): the three rules the round-17 panel called over-strict, retuned
 * exactly as the DJ and the dancer specified (docs/reviews/round17-dj.md §2, round17-dancer.md §2); the generic
 * energyStep fixer (a boundary cliff cut by reordering the sides of the two adjacent tandas); and the export fixes of
 * the discography review (docs/reviews/round17-discography.md §1, §3, §4). Written before the engine change; the spec
 * records which of them failed on the round-16 engine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  auditStreamMatches,
  CORTINA_BAD_ALBUM,
  cliffOf,
  compose,
  cortinaMatchProblem,
  improveNight,
  isReleaseCut,
  judgeStreams,
  knownSingers,
  type MatchCandidate,
  type MatchRow,
  matchProblem,
  orderVerdict,
  type Playlist,
  type Song,
  scorePlaylist,
  strictChecks,
  strictOrder,
  type Tanda,
  takesIndex,
} from "../src/index";
import { auditCortinaCaches, findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let FO: Record<string, unknown>;
let featured: Playlist;
let rawSongs: Array<MatchRow & { id: string; orchestraId: string; altIds?: string[] }>;
const ROOT = findRoot();
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
beforeAll(() => {
  deps = loadCatalog();
  featured = readJson("apps/web/public/featured/golden-double-peak.json") as Playlist;
  const fo = { ...featured.options } as Record<string, unknown>;
  for (const k of ["contextApplied", "trackSecByRhythm", "cortinaGenres", "vocalBias", "tempoShift", "seed"])
    delete fo[k];
  FO = { ...fo, explicit: Object.keys(fo).filter((k) => k !== "context") };
  rawSongs = readJson("data/index/songs.json");
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const cache = new Map<number, Playlist>();
/** a generation as the platform runs it: compose, then improveNight */
const night = (seed: number) => {
  if (!cache.has(seed)) {
    const p = compose({ ...FO, seed }, deps);
    cache.set(seed, improveNight({ ...p, score: scorePlaylist(p) }, deps).playlist);
  }
  return cache.get(seed)!;
};
const rule = (p: Pick<Playlist, "tandas" | "options" | "closing">, key: string) =>
  strictChecks(p).violations.filter((v) => v.rule === key);
const clone = (p: Playlist): Playlist => JSON.parse(JSON.stringify(p));
const idx = (p: Playlist, pred: (t: Tanda) => boolean) => p.tandas.findIndex(pred);
/** the tanda's sides put in the given title order */
const order = (t: Tanda, titles: string[]) => {
  const by = new Map(t.songs.map((s) => [s.title, s]));
  t.songs = titles.map((x) => by.get(x)!);
  expect(t.songs.every(Boolean)).toBe(true);
};
const DJ20 = ["Viejo Portón", "Loca de Amor", "Lejos de Ti"];
const DJ21 = [
  "Qué Te Importa que Te Llore",
  "Jamás Retornarás",
  "Trasnochando",
  "Tristezas de la Calle Corrientes",
];
const biagiVals = (p: Playlist) => idx(p, (t) => t.orchestraId === "rodolfo-biagi" && t.rhythm === "vals");
const caloBeron = (p: Playlist) =>
  idx(p, (t) => t.orchestraId === "miguel-calo" && /Ber/.test(t.singer ?? ""));
const darienzoSummit = (p: Playlist) =>
  p.tandas.findLastIndex((t) => t.peak && t.orchestraId === "juan-d-arienzo");

// --- A. the retuned rules (DJ §2, dancer §2) ---------------------------------------------------------------------
describe("A — rules retuned as the panel specified", () => {
  it("wedge: a lyrical tanda of mean fame ≥ 4.5 whose sides all stream may sit before the última when the cue into the última is not slow", () => {
    const p = clone(featured);
    const w = p.tandas.length - 2;
    expect(p.tandas[w]!.orchestraId).toBe("miguel-calo");
    expect(rule(p, "wedge")).toEqual([]);
    // the cue into the última slow: the lift is gone, the wedge stands
    const slow = clone(p);
    slow.tandas[w]!.cortina!.tags = ["tempo:slow", "mood:melancholic"];
    expect(rule(slow, "wedge").length).toBe(1);
    // a little-known wedge (mean fame < 4.5): the round-14 S7 case
    const thin = clone(p);
    for (const s of thin.tandas[w]!.songs.slice(0, 2)) s.fame = 3;
    expect(rule(thin, "wedge").length).toBe(1);
  });
  it("darienzoPeak: an instrumental D'Arienzo summit may come from 1935–40 with a fame-5 side and mean fame ≥ 3.75", () => {
    const p = clone(featured);
    const s = darienzoSummit(p);
    expect(Math.min(...p.tandas[s]!.songs.map((x) => x.year ?? 0))).toBe(1935);
    expect(rule(p, "darienzoPeak")).toEqual([]);
    // without its fame-5 hook it is not a 1935–36 summit
    const noHook = clone(p);
    for (const x of noHook.tandas[s]!.songs) if ((x.fame ?? 0) >= 5) x.fame = 4;
    expect(rule(noHook, "darienzoPeak").length).toBe(1);
    // 1934 stays outside
    const early = clone(p);
    early.tandas[s]!.songs[0]!.year = 1934;
    expect(rule(early, "darienzoPeak").length).toBe(1);
  });
  it("rotation: one same sub-period-and-mode pair a night, ≥ 12 tandas apart, no shared title, one of them a summit", () => {
    const p = clone(featured);
    expect(rule(p, "rotation")).toEqual([]);
    const s = darienzoSummit(p);
    // not a summit: the pair is a rotation fault again
    const flat = clone(p);
    flat.tandas[s]!.peak = false;
    expect(rule(flat, "rotation").length).toBeGreaterThan(0);
    // a shared title
    const twice = clone(p);
    const early = idx(twice, (t) => t.orchestraId === "juan-d-arienzo" && !t.vocal && !t.peak);
    twice.tandas[s]!.songs[1]!.title = twice.tandas[early]!.songs[0]!.title;
    expect(rule(twice, "rotation").length).toBeGreaterThan(0);
  });
  it("energyStep: a release cut to ≤ 16 at the sides (the boundary of the two tandas) behind a slow cue passes; the old order does not", () => {
    const p = clone(featured);
    const a = biagiVals(p),
      b = caloBeron(p);
    expect(b).toBe(a + 1);
    order(p.tandas[a]!, ["Lejos de Ti", "Viejo Portón", "Loca de Amor"]);
    order(p.tandas[b]!, [
      "Tristezas de la Calle Corrientes",
      "Jamás Retornarás",
      "Trasnochando",
      "Qué Te Importa que Te Llore",
    ]);
    expect(rule(p, "energyStep").length).toBe(1);
    order(p.tandas[a]!, DJ20);
    order(p.tandas[b]!, DJ21);
    expect(rule(p, "energyStep")).toEqual([]);
    // the DJ's orders break no in-tanda order rule (sideOrder, openCliff, lastSide, opener)
    for (const k of ["sideOrder", "openCliff", "lastSide", "opener"])
      expect(rule(p, k).filter((v) => v.tanda === a || v.tanda === b)).toEqual([]);
    // behind an up-tempo cue the same step is a cliff again
    const up = clone(p);
    up.tandas[a]!.cortina!.tags = ["tempo:up", "mood:festive"];
    expect(rule(up, "energyStep").length).toBe(1);
  });
});

// --- B. the energyStep fixer -------------------------------------------------------------------------------------
describe("B — energyStep: the boundary cliff cut by reordering the two tandas' sides", () => {
  it("the order rule: a tanda before a cooler one may close on its top-fame side that cuts the step to ≤ 16", () => {
    const t = featured.tandas[biagiVals(featured)]!;
    const songs = strictOrder(t.songs, false, { nextFirst: 61, releaseCut: true });
    expect(songs.map((s) => s.title)).toEqual(DJ20);
    // without the next tanda in view the old order rules (a vals never ends on its slowest side, a corpus opener never
    // closes) hold
    expect(strictOrder(t.songs, false).at(-1)!.title).not.toBe("Lejos de Ti");
    expect(strictOrder(t.songs, false, { nextFirst: 61 }).at(-1)!.title).not.toBe("Lejos de Ti");
  });
  it("seed 199 comes out with #20/#21 as the DJ wrote them (or a boundary step ≤ 16), and no in-tanda order rule breaks", () => {
    const p = night(199);
    const a = biagiVals(p),
      b = caloBeron(p);
    expect(b).toBe(a + 1);
    const la = p.tandas[a]!.songs.at(-1)!,
      fb = p.tandas[b]!.songs[0]!;
    expect(Math.abs((la.energy ?? 50) - (fb.energy ?? 50))).toBeLessThanOrEqual(16);
    expect(p.tandas[a]!.songs.map((s) => s.title)).toEqual(DJ20);
    expect(p.tandas[b]!.songs.map((s) => s.title)).toEqual(DJ21);
    expect(rule(p, "energyStep")).toEqual([]);
    for (const k of ["sideOrder", "openCliff", "lastSide", "opener"]) expect(rule(p, k)).toEqual([]);
  });
  it("the dancer's Láurenz / Casas order would open on a cliff after Jueves (the DJ's R16-4), so it is not applied", () => {
    const p = night(199);
    const i = idx(p, (t) => t.orchestraId === "pedro-laurenz" && /Casas/.test(t.singer ?? ""));
    const prevLast = p.tandas[i - 1]!.songs.at(-1)!.energy;
    const by = new Map(p.tandas[i]!.songs.map((s) => [s.title, s]));
    const dancer = ["Como Dos Extraños", "Desconsuelo", "De Puro Guapo", "No Me Extraña"].map(
      (x) => by.get(x)!,
    );
    expect(cliffOf(dancer, prevLast)).not.toBeNull();
    expect(cliffOf(p.tandas[i]!.songs, prevLast)).toBeNull();
  });
  it("seed 199 under the round-17 panel: 0 blockers and at most one should-fix", () => {
    const r = strictChecks(night(199));
    expect(r.blockers).toBe(0);
    expect(r.shouldFix).toBeLessThanOrEqual(1);
  });
});

// --- C. export: the singer rule, the cortina duet and album filter (discography §1, §3, §4) -----------------------
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
describe("C — export matching", () => {
  it("a vocal side's credit must name the singer (artists, title or album); a main-artist-only credit (Deezer) is not judged on it", () => {
    const r = row({
      title: "Así Se Baila el Tango",
      orchestra: "Ricardo Tanturi",
      singer: "Alberto Castillo",
      vocal: true,
      year: 1942,
      date: "1942-12-04",
    });
    expect(
      matchProblem(
        r,
        cand("Asi se baila el tango", ["Ricardo Tanturi"], "Tangos Para Bailar - Documentos Tango"),
      ),
    ).toMatch(/singer/);
    expect(
      matchProblem(
        r,
        cand(
          "Así Se Baila El Tango",
          ["Ricardo Tanturi", "Alberto Castillo"],
          "Serie De Oro Vol 2: Ricardo Tanturi",
        ),
      ),
    ).toBeNull();
    expect(
      matchProblem(
        r,
        cand(
          "Asi se baila el tango",
          ["Ricardo Tanturi con Albert..."],
          "Ricardo Tanturi con Alberto Castillo - Cuatro compases",
        ),
      ),
    ).toBeNull();
    expect(
      matchProblem(r, { ...cand("Así se Baila el Tango", ["Ricardo Tanturi"]), mainArtistOnly: true }),
    ).toBeNull();
  });
  it("Así se baila el tango (5486994f6f) exports a Tanturi + Castillo credited track that passes the rules", () => {
    const sp = readJson("data/cache/spotify/tracks.json");
    const rz = readJson("data/cache/resolve/tracks.json");
    const v = sp["5486994f6f"];
    expect(["spotify:track:6vrz2bxBByWjoi7NAf5BIn", "spotify:track:6orBRgWOJbictIfUimA9IW"]).toContain(v.uri);
    expect(v.matched).toMatch(/Castillo/);
    const r0 = rawSongs.find((s) => s.id === "5486994f6f")!;
    const takes = takesIndex(rawSongs);
    const j = judgeStreams({ ...r0, ...(takes.get(r0.id) ?? {}) }, v, rz["5486994f6f"], {
      singers: knownSingers(rawSongs as never),
    });
    expect(j.spotify).toBeNull();
  });
  it("the Spotify cache audit rejects no cached id (the singer rule included)", () => {
    const sp = readJson("data/cache/spotify/tracks.json");
    const rz = readJson("data/cache/resolve/tracks.json");
    const m = auditStreamMatches(rawSongs, sp, rz, knownSingers(rawSongs as never));
    expect(m.spotify).toEqual([]);
    expect(m.deezer).toEqual([]);
  });
  it("a second credited artist marks a cortina duet unless the cue names both (Bu Kalp Seni Unutur mu)", () => {
    const duet = cand("Bu Kalp Seni Unutur mu", ["Fikret Kızılok", "Sibel Sezal"], "Yana Yana", 275);
    expect(cortinaMatchProblem({ title: "Bu Kalp Seni Unutur mu", artist: "Fikret Kızılok" }, duet)).toMatch(
      /duet/,
    );
    expect(
      cortinaMatchProblem({ title: "Bu Kalp Seni Unutur mu", artist: "Fikret Kızılok & Sibel Sezal" }, duet),
    ).toBeNull();
    const cue = deps.cortinas.find((c) => c.id === "c-tr-kizilok-bu-kalp")!;
    expect(cue.artist).toBe("Fikret Kızılok & Sibel Sezal");
    expect(cue.spotify?.uri).toBe("spotify:track:4Q2t1wFBSwgaPlgV5GpqZp");
    expect(auditCortinaCaches()).toEqual([]);
  });
  it("CORTINA_BAD_ALBUM is Unicode-aware and suffix-tolerant (Konseri, Konserler, Canlı, Canlı Kayıt, Akustikler, Versiyon(u), Sahne Performansı)", () => {
    for (const x of [
      "Harbiye Açıkhava Konseri",
      "Konserler",
      "Canlı",
      "Canlı Kayıt",
      "Sevenlerine Canlı",
      "Akustikler",
      "Sahne Performansı",
      "2006 Versiyon",
      "Yeni Versiyon",
      "Orkestra Versiyonu",
      "Live at the Royal Albert Hall",
      "Düet",
      "Düetler",
      "Yeniden Yetmişe",
      "Akustik",
      "Unplugged",
      "Enstrümantal",
      "Altın Düetler",
    ])
      expect(CORTINA_BAD_ALBUM.test(x), x).toBe(true);
    for (const x of [
      "Yana Yana",
      "Belki Alışman Lazım",
      "Nilüfer LP",
      "Hal Hal",
      "Delivery",
      "Olivia",
      "Her Dem Yeni",
      "Ölümsüzler",
    ])
      expect(CORTINA_BAD_ALBUM.test(x), x).toBe(false);
  });
});

// --- D. the shipped night ------------------------------------------------------------------------------------------
describe("D — the shipped featured night (seed 199, round 17)", () => {
  it("0 blockers, at most one should-fix; #20/#21 in the DJ's order; Así se baila el tango and Bu Kalp as fixed", () => {
    const r = strictChecks(featured);
    expect(r.blockers).toBe(0);
    expect(r.shouldFix).toBeLessThanOrEqual(1);
    expect(featured.tandas[biagiVals(featured)]!.songs.map((s) => s.title)).toEqual(DJ20);
    expect(featured.tandas[caloBeron(featured)]!.songs.map((s) => s.title)).toEqual(DJ21);
    const asi = featured.tandas.flatMap((t) => t.songs).find((s) => s.id === "5486994f6f") as Song;
    expect(asi.spotify?.uri).toBe(deps.catalog.songs.find((s) => s.id === "5486994f6f")!.spotify?.uri);
    expect(featured.tandas.find((t) => t.cortina?.id === "c-tr-kizilok-bu-kalp")?.cortina?.artist).toBe(
      "Fikret Kızılok & Sibel Sezal",
    );
  });
  it("is the night the panel approved: the same families and sides, slot by slot", () => {
    const n = night(199);
    expect(
      n.tandas.map((t) =>
        t.songs
          .map((s) => s.id)
          .sort()
          .join(),
      ),
    ).toEqual(
      featured.tandas.map((t) =>
        t.songs
          .map((s) => s.id)
          .sort()
          .join(),
      ),
    );
    // (round 19: a release cut at its boundary is judged as one — its closer and opener cut the step)
    featured.tandas.forEach((t, i) =>
      expect(orderVerdict(t, { releaseCut: isReleaseCut(featured.tandas, i) })).toEqual([]),
    );
  });
});
