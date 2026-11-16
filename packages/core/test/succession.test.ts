/**
 * 2026-11 — the succession model (packages/core/src/succession.ts, docs/MUSICALITY.md "Succession"): which tanda follows
 * which well, from the energy step, the style alternation, the recording-sound jump, the voices, the tempo, the key,
 * the sound family, what real DJs play after what (data/knowledge/succession.json, mined by
 * `pnpm knowledge:succession`) and the DJ's own edits. Written before compose reads it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BIG_FOUR_PAIR,
  COMPOSE_KINDS,
  compose,
  composePoints,
  improveNight,
  type LearnedPreferences,
  learnedPairWeight,
  learnFromEdit,
  lineageOf,
  mergeLearned,
  nightExceptionKeys,
  PAIR_LIMITS,
  type Playlist,
  pairEdits,
  SUCCESSION,
  SUCCESSION_WEIGHT,
  type SuccessionSide,
  succession,
  successionFactor,
  successionLine,
  swapTandaOptions,
  type Tanda,
  tandaSuccession,
  voiceOf,
} from "../src/index";
import { applyRepoOverrides } from "../src/learn";
import { findRoot, loadCatalog } from "../src/load";

const root = findRoot();
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const side = (x: Partial<SuccessionSide> & Pick<SuccessionSide, "orchestraId">): SuccessionSide => ({
  singer: null,
  rhythm: "tango",
  vocal: false,
  energy: 60,
  targetEnergy: 60,
  meanYear: 1941,
  ...x,
});
const DA = side({
  orchestraId: "juan-d-arienzo",
  energy: 82,
  energyClose: 84,
  targetEnergy: 76,
  meanYear: 1937,
});
const DS = side({
  orchestraId: "carlos-di-sarli",
  energy: 62,
  energyOpen: 64,
  targetEnergy: 64,
  meanYear: 1941,
});

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
}, 600000);

describe("the data: transitions mined from public DJ sets", () => {
  it("is generated, consistent and counted (raw and weighted)", () => {
    const D = SUCCESSION;
    expect(D.sources.referenceSets.sets).toBeGreaterThanOrEqual(31);
    expect(D.sources.referenceSets.transitions + D.sources.setlists.transitions).toBe(
      D.totals.transitions[0],
    );
    const raw = Object.values(D.pairs).reduce((a, c) => a + c[0], 0);
    expect(raw).toBe(D.totals.transitions[0]);
    const out = Object.values(D.orchestras).reduce((a, o) => a + o.out[0], 0);
    expect(out).toBe(D.totals.transitions[0]);
    // one DJ's set blog weighs half: the weighted total sits between the reference sets and the raw count
    expect(D.totals.transitions[1]).toBeLessThan(D.totals.transitions[0]);
    expect(D.totals.transitions[1]).toBeGreaterThan(D.sources.referenceSets.transitions);
    for (const c of Object.values(D.families)) expect(c[0]).toBeGreaterThanOrEqual(2);
  });
  it("the curated parts are data: voices, lineages, the style matrix (and no orchestra named in the engine)", () => {
    expect(voiceOf("Roberto Ray")).toBe("high-tenor");
    expect(voiceOf("Héctor Mauré")).toBe("baritone");
    expect(voiceOf("A. Echagüe - A. Laborde")).toBe("high-tenor");
    expect(voiceOf("Nobody Known")).toBeUndefined();
    expect(lineageOf("juan-d-arienzo")).toBe(lineageOf("hector-varela"));
    const src = readFileSync(join(root, "packages/core/src/succession.ts"), "utf8");
    const ids = (readJson("data/knowledge/orchestra_profiles.json") as Array<{ id: string }>).map(
      (p) => p.id,
    );
    for (const id of ids) expect(src.includes(`"${id}"`), id).toBe(false);
  });
});

describe("the pairwise score A → B", () => {
  it("D'Arienzo → Di Sarli follows well: lyrical after driving, common in DJ sets (with its count)", () => {
    const s = succession(DA, DS);
    expect(s.verdict).toBe("good");
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(1);
    const corpus = s.parts.find((p) => p.kind === "corpus")!;
    expect(corpus.points).toBeGreaterThan(0);
    expect(Number(corpus.detail.count)).toBe(SUCCESSION.pairs["juan-d-arienzo>carlos-di-sarli"]![0]);
    expect(s.parts.find((p) => p.kind === "style")!.points).toBeGreaterThan(0);
    expect(successionLine(s, "D'Arienzo")).toMatch(
      /^Follows D'Arienzo well: .*(lyrical after driving|common in DJ sets \(\d+×\))/,
    );
  });
  it("two hard-driving rhythmic tango tandas in a row: a warning (common in some set lists, never a bonus)", () => {
    const s = succession(
      DA,
      side({ orchestraId: "rodolfo-biagi", energy: 80, targetEnergy: 76, meanYear: 1939 }),
    );
    const st = s.parts.find((p) => p.kind === "style")!;
    expect(st.points).toBeLessThan(-3);
    expect(SUCCESSION.pairs["juan-d-arienzo>rodolfo-biagi"]![0]).toBeGreaterThan(5);
    expect(s.parts.find((p) => p.kind === "corpus")!.points).toBeLessThanOrEqual(0);
    expect(s.warning).toBe("two_rhythmic");
    expect(successionLine(s, "D'Arienzo")).toMatch(/^Two rhythmic tandas in a row/);
  });
  it("rhythmic ↔ lyrical alternation beats two of a kind, whatever the orchestras", () => {
    const L = side({ orchestraId: "carlos-di-sarli" });
    const R = side({ orchestraId: "rodolfo-biagi" });
    const L2 = side({ orchestraId: "osvaldo-fresedo" });
    const st = (a: SuccessionSide, b: SuccessionSide) =>
      succession(a, b).parts.find((p) => p.kind === "style")!.points;
    expect(st(R, L)).toBeGreaterThan(st(L2, L));
    expect(st(L, R)).toBeGreaterThan(st(DA, R));
  });
  it("1930s guardia → 1950s dramatic is a big jump in recording sound", () => {
    const g = side({ orchestraId: "francisco-lomuto", meanYear: 1932 });
    const d = side({ orchestraId: "osvaldo-pugliese", meanYear: 1955 });
    const era = succession(g, d).parts.find((p) => p.kind === "era")!;
    expect(era.points).toBeLessThanOrEqual(-10);
    expect(era.detail.big).toBe(1);
    // a vals or milonga in between halves what an era step costs
    const vm = succession(g, { ...d, rhythm: "vals" }).parts.find((p) => p.kind === "era")!;
    expect(vm.points).toBeGreaterThan(era.points);
  });
  it("two similar high tenors back to back cost; a high tenor after a baritone helps", () => {
    const a = side({ orchestraId: "carlos-di-sarli", vocal: true, singer: "Roberto Rufino" });
    const ht = side({ orchestraId: "angel-d-agostino", vocal: true, singer: "Ángel Vargas" });
    const ht2 = side({ orchestraId: "ricardo-tanturi", vocal: true, singer: "Enrique Campos" });
    expect(succession(ht, ht2).parts.find((p) => p.kind === "voice")!.points).toBeLessThan(0);
    expect(succession(ht, ht2).warning === "same_voice" || succession(ht, ht2).verdict !== "warn").toBe(true);
    expect(succession(a, ht).parts.find((p) => p.kind === "voice")!.points).toBeGreaterThan(0);
  });
  it("energy: the step the arc planned fits, a drop against the plan costs", () => {
    const a = side({ orchestraId: "carlos-di-sarli", energy: 70, energyClose: 70, targetEnergy: 70 });
    const fit = side({ orchestraId: "miguel-calo", energy: 76, energyOpen: 76, targetEnergy: 76 });
    const drop = side({ orchestraId: "miguel-calo", energy: 48, energyOpen: 48, targetEnergy: 76 });
    const e = (b: SuccessionSide) => succession(a, b).parts.find((p) => p.kind === "energy")!;
    expect(e(fit).points).toBeGreaterThan(0);
    expect(e(fit).detail).toEqual({ step: 6, plan: 6 });
    expect(e(drop).points).toBeLessThanOrEqual(-6);
  });
  it("tempo, key and brightness where known; one sound family back to back costs", () => {
    const a = side({ orchestraId: "juan-d-arienzo", bpm: 132, close: { camelot: "8A", brightnessHz: 1800 } });
    const near = side({
      orchestraId: "carlos-di-sarli",
      bpm: 128,
      open: { camelot: "9A", brightnessHz: 1900 },
    });
    const far = side({
      orchestraId: "carlos-di-sarli",
      bpm: 110,
      open: { camelot: "2B", brightnessHz: 3000 },
    });
    const k = (b: SuccessionSide, kind: string) =>
      succession(a, b).parts.find((p) => p.kind === kind)!.points;
    expect(k(near, "tempo")).toBeGreaterThan(k(far, "tempo"));
    expect(k(near, "key")).toBeGreaterThan(k(far, "key"));
    const fam = succession(DA, side({ orchestraId: "hector-varela", meanYear: 1937 }));
    expect(fam.parts.find((p) => p.kind === "lineage")!.points).toBeLessThan(0);
    // no lineage, corpus or learned part for the same orchestra (the repeat gap's job)
    expect(succession(DA, DA).parts.some((p) => ["lineage", "corpus"].includes(p.kind))).toBe(false);
  });
  it("is deterministic and bounded", () => {
    expect(succession(DA, DS)).toEqual(succession(DA, DS));
    for (const a of [DA, DS])
      for (const b of [DA, DS]) {
        const s = succession(a, b);
        expect(Math.abs(s.score)).toBeLessThanOrEqual(1);
        expect(s.points).toBeCloseTo(
          s.parts.reduce((x, p) => x + p.points, 0),
          0,
        );
      }
  });
  it("compose weighs only the parts the round-13 pairScore does not carry, as a bounded factor", () => {
    expect(COMPOSE_KINDS.has("energy")).toBe(false);
    expect(COMPOSE_KINDS.has("era")).toBe(false);
    expect(COMPOSE_KINDS.has("tempo")).toBe(false);
    // (D'Arienzo → Caló: no big-four pair, see below)
    const s = succession(DA, { ...DS, orchestraId: "miguel-calo" });
    expect(successionFactor(s)).toBeCloseTo(Math.exp(SUCCESSION_WEIGHT * composePoints(s)), 6);
    expect(SUCCESSION_WEIGHT).toBeLessThanOrEqual(0.05);
    expect(successionFactor(null)).toBe(1);
    expect(successionFactor(s)).toBeGreaterThan(1);
    expect(successionFactor(succession(DA, DA))).toBeLessThan(1);
  });
  it("two big-four orchestras back to back: the explanation keeps the corpus, compose leaves it to the big-four rule", () => {
    const s = succession(DA, DS);
    expect(s.bigFour).toBe(true);
    const positive = s.parts.filter(
      (p) => COMPOSE_KINDS.has(p.kind) && !["style", "corpus"].includes(p.kind),
    );
    expect(composePoints(s)).toBeCloseTo(
      positive.reduce((a, p) => a + p.points, 0) +
        s.parts
          .filter((p) => ["style", "corpus"].includes(p.kind))
          .reduce((a, p) => a + Math.min(0, p.points), 0) -
        BIG_FOUR_PAIR,
      6,
    );
    const L = side({
      orchestraId: "miguel-calo",
      energy: 62,
      energyOpen: 64,
      targetEnergy: 64,
      meanYear: 1941,
    });
    expect(succession(DA, L).bigFour).toBeUndefined();
  });
});

describe("learning: the DJ's edits and praise nudge pairs, inside caps", () => {
  const T = (orchestraId: string, i: number) => ({ orchestraId, index: i, songs: [] }) as unknown as Tanda;
  it("a replaced tanda: the pairs into and out of the new one +1, the broken ones −0.5", () => {
    const before = { tandas: [T("a", 0), T("b", 1), T("c", 2)] };
    const after = { tandas: [T("a", 0), T("x", 1), T("c", 2)] };
    expect(pairEdits(before, after)).toEqual([
      ["a>b", -0.5],
      ["a>x", 1],
      ["b>c", -0.5],
      ["x>c", 1],
    ]);
    expect(pairEdits(before, before)).toEqual([]);
  });
  it("learnFromEdit keeps the pairs, capped at PAIR_LIMITS; mergeLearned and the repo overrides carry them", () => {
    const night = compose({ hours: 2, seed: 3 }, deps);
    const i = 2;
    const other = night.tandas.find((t, k) => Math.abs(k - i) > 2 && t.rhythm === night.tandas[i]!.rhythm)!;
    const after: Playlist = {
      ...night,
      tandas: night.tandas.map((t, k) => (k === i ? { ...other, index: i } : t)),
    };
    let L: LearnedPreferences | undefined;
    for (let k = 0; k < 6; k++) L = learnFromEdit(L, night, after);
    const key = `${night.tandas[i - 1]!.orchestraId}>${other.orchestraId}`;
    expect(L!.pairs![key]).toBe(PAIR_LIMITS.max);
    const merged = mergeLearned({ sides: {}, families: {}, pairs: { "q>r": 1 } }, L);
    expect(merged.pairs!["q>r"]).toBe(1);
    expect(merged.pairs![key]).toBe(PAIR_LIMITS.max);
    const off = applyRepoOverrides(
      { sides: {}, families: {}, pairs: { "q>r": 1 } },
      { deleted: ["pair:q>r"] },
    );
    expect(off!.pairs!["q>r"]).toBeUndefined();
  });
  it("the learned part is a nudge: capped points; a praise is one ♥ (+0.25), never more than +0.5 a pair", () => {
    const L: LearnedPreferences = { sides: {}, families: {}, pairs: { "juan-d-arienzo>carlos-di-sarli": 3 } };
    const s = succession(DA, DS, { learned: L });
    const p = s.parts.find((x) => x.kind === "learned")!;
    expect(p.points).toBe(4.5);
    expect(s.points).toBeGreaterThan(succession(DA, DS).points);
    const praise = (n: number) =>
      Array.from({ length: n }, (_, k) => ({
        id: `n#${k}`,
        nightId: "n",
        tanda: k,
        rhythm: "tango",
        songIds: [],
        family: "carlos-di-sarli||tango",
        years: null,
        role: "build" as const,
        prevFamily: "juan-d-arienzo||tango",
        prevRole: "build" as const,
        prevCortinaId: null,
        nextCortinaId: null,
        nextFamily: null,
        nextRole: null,
        reason: "",
        at: "",
      }));
    expect(
      learnedPairWeight({ praise: praise(1) } as LearnedPreferences, "juan-d-arienzo", "carlos-di-sarli"),
    ).toBe(0.25);
    expect(
      learnedPairWeight({ praise: praise(5) } as LearnedPreferences, "juan-d-arienzo", "carlos-di-sarli"),
    ).toBe(0.5);
    // the repo store's one praised tanda (Troilo T14) is one ♥ on its pair, not a rule
    const repo = deps.catalog.learned!;
    for (const pr of repo.praise ?? []) {
      const a = pr.prevFamily?.split("|")[0];
      const b = pr.family.split("|")[0]!;
      if (a) expect(learnedPairWeight(repo, a, b)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("in the night: compose, the swap choices, the featured night", () => {
  it("the default 4 h golden nights follow what DJs do more often than chance (mean corpus part > 0)", () => {
    const pts: number[] = [];
    for (const seed of [1, 4, 7, 10]) {
      const p = compose({ hours: 4, seed }, deps);
      expect(p.score.total).toBeGreaterThanOrEqual(85);
      for (let i = 1; i < p.tandas.length; i++) {
        const s = tandaSuccession(p, i).fromPrev!;
        const c = s.parts.find((x) => x.kind === "corpus");
        if (c) pts.push(c.points);
      }
    }
    expect(pts.length).toBeGreaterThan(40);
    expect(pts.reduce((a, b) => a + b, 0) / pts.length).toBeGreaterThan(0);
  });
  it("tandaSuccession reads the night in its order; the first has no predecessor, the last no successor", () => {
    const p = compose({ hours: 2, seed: 5 }, deps);
    expect(tandaSuccession(p, 0).fromPrev).toBeNull();
    expect(tandaSuccession(p, p.tandas.length - 1).intoNext).toBeNull();
    expect(tandaSuccession(p, 1).fromPrev).toEqual(tandaSuccession(p, 0).intoNext);
  });
  it("swap choices: nearest the plan first (in 4-point bands), then how they follow the previous and lead into the next", () => {
    const p = compose({ hours: 3, seed: 11 }, deps);
    const i = 4;
    const opts = swapTandaOptions(p, i, deps, 77);
    expect(opts.length).toBeGreaterThan(0);
    const band = (q: Playlist) => Math.round(Math.abs(q.tandas[i]!.energy - p.tandas[i]!.targetEnergy) / 4);
    const flow = (q: Playlist) => {
      const s = tandaSuccession(q, i);
      return (s.fromPrev?.points ?? 0) + (s.intoNext?.points ?? 0);
    };
    for (let k = 1; k < opts.length; k++) {
      expect(band(opts[k]!)).toBeGreaterThanOrEqual(band(opts[k - 1]!));
      if (band(opts[k]!) === band(opts[k - 1]!))
        expect(flow(opts[k]!)).toBeLessThanOrEqual(flow(opts[k - 1]!) + 1e-9);
    }
  });
  it("the featured night 'golden-double-peak': its pinned tandas and one-night exceptions do not change", () => {
    const f = readJson("apps/web/public/featured/golden-double-peak.json") as Playlist;
    const ids = (t: Tanda) => t.songs.map((s) => s.id).join(",");
    const pinned = f.tandas.filter((t) => t.pinned).map((t) => [t.index, ids(t), JSON.stringify(t.pinned)]);
    expect(pinned.length).toBeGreaterThanOrEqual(15);
    const exceptions = [...nightExceptionKeys(deps.catalog.learned, f.id)].sort();
    expect(exceptions.length).toBeGreaterThan(0);
    // the engine's own passes leave them as they are: improveNight, a swap, the swap choices
    const r = improveNight(f, deps);
    for (const [index, want, pin] of pinned) {
      const t = r.playlist.tandas.find((x) => x.index === index)!;
      expect(ids(t), `T${Number(index) + 1}`).toBe(want);
      expect(JSON.stringify(t.pinned)).toBe(pin);
    }
    const k = f.tandas.findIndex((t) => t.pinned);
    expect(swapTandaOptions(f, k, deps, 5)).toEqual([]);
    expect([...nightExceptionKeys(deps.catalog.learned, f.id)].sort()).toEqual(exceptions);
  });
});
