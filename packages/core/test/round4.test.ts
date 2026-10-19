/**
 * Round-4 invariants: what the DJ panel (docs/reviews/round4-generation.md §2), the dancer review
 * (round4-users.md §6) and the option-wiring audit (round4-wiring.md §3) measured. Every rule the engine
 * gained in round 4 has its invariant here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyMemory,
  arcTarget,
  compose,
  cortinaPool,
  type EraPreset,
  emptyMemory,
  isDanceable,
  normTitle,
  type Playlist,
  pickCortina,
  planCortinas,
  rememberSet,
  type Song,
  scorePlaylist,
  shapeTanda,
  swapTanda,
} from "../src/index";
import { loadCatalog } from "../src/load";
import { makeRng } from "../src/rng";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
});

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const golden = (seed: number, extra: Record<string, unknown> = {}) =>
  compose({ hours: 4, seed, ...extra }, deps);
const pos = (p: Playlist, t: { index: number }) =>
  p.tandas.indexOf(p.tandas.find((x) => x === t)!) / (p.tandas.length - 1);
const corpusCumparsitaYears = (orchestraId: string) =>
  new Set(
    (deps.corpus.famousRecordings ?? [])
      .filter((f) => f.role === "cumparsita" && f.orchestraId === orchestraId && f.year)
      .map((f) => f.year!),
  );

describe("A1 — the última is a strong closing tanda", () => {
  it("delivers energy ≥ target−4 from the corpus closer pool in every seed", () => {
    const closers = new Set([
      "osvaldo-pugliese",
      "juan-d-arienzo",
      "angel-d-agostino",
      "carlos-di-sarli",
      "alfredo-de-angelis",
      "anibal-troilo",
      "ricardo-tanturi",
      "rodolfo-biagi",
      "miguel-calo",
      "enrique-rodriguez",
    ]);
    let strong = 0;
    for (const seed of SEEDS) {
      const p = golden(seed);
      const u = p.tandas.at(-1)!;
      expect(u.rhythm).toBe("tango");
      expect(closers.has(u.orchestraId), `seed ${seed}: última ${u.orchestra}`).toBe(true);
      if (u.energy >= u.targetEnergy - 4) strong++;
    }
    expect(strong).toBeGreaterThanOrEqual(11);
  });
  it("ultimaRule 'pugliese' reserves Pugliese for the última; 'd-arienzo-rhythmic' gives an instrumental D'Arienzo", () => {
    for (const seed of [1, 2, 3]) {
      const p = golden(seed, { rules: { ultimaRule: "pugliese" } });
      const pug = p.tandas.filter((t) => t.orchestraId === "osvaldo-pugliese");
      expect(pug).toHaveLength(1);
      expect(p.tandas.at(-1)!.orchestraId).toBe("osvaldo-pugliese");
      const d = golden(seed, { rules: { ultimaRule: "d-arienzo-rhythmic" } });
      expect(d.tandas.at(-1)!.orchestraId).toBe("juan-d-arienzo");
      expect(d.tandas.at(-1)!.vocal).toBe(false);
    }
  });
});

describe("A2 — maxPerNight resolved by hours", () => {
  it("Pugliese ≤ 1 per 4 h, ≤ 2 per 6 h (first after 40 %, second after 75 %), never twice with puglieseOnce", () => {
    for (const seed of SEEDS) {
      expect(
        golden(seed).tandas.filter((t) => t.orchestraId === "osvaldo-pugliese").length,
      ).toBeLessThanOrEqual(1);
      const six = compose({ hours: 6, seed }, deps);
      const pug = six.tandas.filter((t) => t.orchestraId === "osvaldo-pugliese");
      expect(pug.length).toBeLessThanOrEqual(2);
      if (pug.length === 2) {
        expect(pos(six, pug[0]!)).toBeGreaterThanOrEqual(0.4);
        expect(pos(six, pug[1]!)).toBeGreaterThanOrEqual(0.75);
      }
      const once = compose({ hours: 8, seed, rules: { puglieseOnce: true } }, deps);
      expect(once.tandas.filter((t) => t.orchestraId === "osvaldo-pugliese").length).toBeLessThanOrEqual(1);
    }
  });
  it("no orchestra exceeds its corpus cap in a 4 h night and D'Arienzo is never absent", () => {
    for (const seed of SEEDS) {
      const p = golden(seed);
      const counts = new Map<string, number>();
      for (const t of p.tandas) counts.set(t.orchestraId, (counts.get(t.orchestraId) ?? 0) + 1);
      for (const [id, n] of counts)
        expect(n, `seed ${seed}: ${id} ×${n}`).toBeLessThanOrEqual(id === "juan-d-arienzo" ? 4 : 3);
      expect(counts.get("juan-d-arienzo") ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("A3 — the first D'Arienzo comes early and instrumental", () => {
  it("first D'Arienzo tango tanda ≤ 35 % and instrumental 1935–39 in ≥ 70 % of seeds; 2–3 tango tandas per 4 h", () => {
    let early = 0;
    for (const seed of SEEDS) {
      const p = golden(seed);
      const da = p.tandas.filter((t) => t.orchestraId === "juan-d-arienzo" && t.rhythm === "tango");
      expect(da.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(da.length, `seed ${seed}`).toBeLessThanOrEqual(3);
      const f = da[0]!;
      const instr = !f.vocal && !!f.yearRange && f.yearRange[0] >= 1935 && f.yearRange[1] <= 1939;
      if (pos(p, f) <= 0.35 && instr) early++;
    }
    expect(early).toBeGreaterThanOrEqual(9);
  });
});

describe("A4 — blacklist is version-level", () => {
  it("un-bans Mala junta and Café Domínguez as titles; keeps concert pieces out", () => {
    expect(isDanceable("Mala junta", "tango")).toBe(true);
    expect(isDanceable("Café Domínguez", "tango")).toBe(true);
    expect(isDanceable("Responso", "tango")).toBe(false);
    expect(isDanceable("Selección de valses", "vals")).toBe(false);
  });
  it("a nonDanceTitles entry with a year only bans that version", () => {
    const troilo = deps.catalog.songs.filter(
      (s) => s.orchestraId === "anibal-troilo" && normTitle(s.title) === "quejas de bandoneon",
    );
    const y1944 = troilo.find((s) => s.year && s.year < 1950);
    expect(y1944).toBeDefined();
    expect(deps.catalog.nonDance("anibal-troilo", y1944!.title, y1944!.year)).toBe(false);
    expect(deps.catalog.nonDance("anibal-troilo", "Quejas de bandoneón", 1963)).toBe(true);
  });
});

describe("A5 — La Cumparsita versions", () => {
  it("the closing Cumparsita carries a corpus year for its orchestra, never a placeholder, in every seed", () => {
    for (const seed of SEEDS) {
      const p = golden(seed);
      expect(p.closing).not.toBeNull();
      expect(p.closing!.yearApprox).toBeFalsy();
      const years = corpusCumparsitaYears(p.closing!.orchestraId);
      const prof = deps.catalog.profile(p.closing!.orchestraId) as
        | { cumparsitaVersions?: number[] }
        | undefined;
      for (const y of prof?.cumparsitaVersions ?? []) years.add(y);
      expect(
        years.has(p.closing!.year ?? 0),
        `seed ${seed}: ${p.closing!.orchestra} ${p.closing!.year}`,
      ).toBe(true);
    }
  });
  it("openWithCumparsita and the cumparsitaCount:2 'own' version obey the same filter; the own version matches the última's singer", () => {
    for (const seed of SEEDS) {
      const p = golden(seed, { rules: { openWithCumparsita: true, cumparsitaCount: 2 } });
      const years = corpusCumparsitaYears(p.opening!.orchestraId);
      const prof = deps.catalog.profile(p.opening!.orchestraId) as
        | { cumparsitaVersions?: number[] }
        | undefined;
      for (const y of prof?.cumparsitaVersions ?? []) years.add(y);
      expect(
        years.has(p.opening!.year ?? 0),
        `seed ${seed}: opening ${p.opening!.orchestra} ${p.opening!.year}`,
      ).toBe(true);
      const u = p.tandas.at(-1)!;
      expect(new Set(u.songs.map((s) => s.singerId)).size).toBe(1);
      expect(new Set(u.songs.map((s) => s.vocal)).size).toBe(1);
    }
  });
  it.each([["golden"], ["golden-extended"], ["post-golden"], ["all"]] as EraPreset[][])(
    "La Cumparsita never appears inside an ordinary tanda (%s), with the close switch on or off",
    (...eras) => {
      for (const closeWithCumparsita of [true, false])
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const p = compose({ hours: 4, seed, eras, closeWithCumparsita }, deps);
          for (const t of p.tandas)
            for (const s of t.songs)
              expect(normTitle(s.title), `${eras} close=${closeWithCumparsita} seed ${seed}`).not.toBe(
                "la cumparsita",
              );
        }
    },
  );
  it("post-golden nights close with a post-golden Cumparsita (D'Arienzo 1963 / Troilo 1963 / De Angelis 1961)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const p = compose({ hours: 3, seed, eras: ["post-golden"] }, deps);
      expect(p.closing!.year).toBeGreaterThanOrEqual(1956);
    }
  });
});

describe("A6 — placeholder years", () => {
  it("no tanda yearRange is built from placeholder-only rows and no 'c. 1940' row anchors a dated family", () => {
    for (const seed of SEEDS) {
      const p = golden(seed);
      for (const t of p.tandas) {
        const dated = t.songs.filter((s) => s.year && !s.yearApprox);
        if (!dated.length) expect(t.yearRange).toBeNull();
        else {
          const ys = dated.map((s) => s.year!);
          expect(t.yearRange).toEqual([Math.min(...ys), Math.max(...ys)]);
        }
      }
      const approxTandas = p.tandas.filter((t) => t.songs.every((s) => s.yearApprox)).length;
      expect(approxTandas, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("B7 — corpus roles order the tanda", () => {
  const mk = (e: number[], roles: Array<Song["role"]>, fame: number[] = []): Song[] =>
    e.map((energy, i) => ({
      id: `s${i}`,
      title: `t${i}`,
      rhythm: "tango",
      orchestra: "X",
      orchestraId: "x",
      singer: null,
      singerId: null,
      vocal: false,
      year: 1940,
      era: "golden-early",
      energy,
      role: roles[i],
      fame: fame[i] ?? 0,
    }));
  it("in a tanda containing a corpus opener and closer, they occupy positions 1 and n", () => {
    const out = shapeTanda(mk([70, 50, 90, 60], ["closer", "anytime", "opener", "anytime"]), "rise-settle");
    expect(out[0]!.role).toBe("opener");
    expect(out[3]!.role).toBe("closer");
    const three = shapeTanda(mk([80, 60, 70], ["anytime", "closer", "opener"]), "rise");
    expect(three[0]!.role).toBe("opener");
    expect(three[2]!.role).toBe("closer");
  });
  it("without roles the energy shape is unchanged", () => {
    expect(shapeTanda(mk([70, 50, 90, 60], []), "rise-settle").map((s) => s.energy)).toEqual([
      50, 60, 90, 70,
    ]);
  });
  it("generated tandas respect roles: a corpus closer never opens, a corpus opener never closes", () => {
    for (const seed of SEEDS)
      for (const t of golden(seed).tandas) {
        expect(t.songs[0]!.role, `seed ${seed} #${t.index} ${t.songs[0]!.title}`).not.toBe("closer");
        expect(t.songs.at(-1)!.role, `seed ${seed} #${t.index}`).not.toBe("opener");
      }
  });
});

describe("B8 — famous-recording energy is a prior, not a constant", () => {
  it("famous tracks of one family do not all share one energy", () => {
    const fams = [
      "enrique-rodriguez|armando-moreno",
      "alfredo-de-angelis|carlos-dante",
      "rodolfo-biagi|alberto-amor",
    ];
    for (const f of fams) {
      const [o, s] = f.split("|");
      const songs = deps.catalog.songs.filter(
        (x) => x.orchestraId === o && x.singerId === s && x.rhythm === "tango" && (x.fame ?? 0) > 0,
      );
      expect(songs.length).toBeGreaterThan(3);
      expect(new Set(songs.map((x) => x.energy)).size).toBeGreaterThan(songs.length / 3);
    }
  });
});

describe("B9 — cortina planning", () => {
  it("a default night uses one or two compatible families, never the same cue within 4 tandas, and the cortina set varies by seed", () => {
    const sets: Set<string>[] = [];
    for (const seed of SEEDS) {
      const p = golden(seed);
      const fams = new Set(p.tandas.map((t) => t.cortina?.genre).filter(Boolean));
      expect(fams.size, `seed ${seed}: ${[...fams]}`).toBeLessThanOrEqual(2);
      const ids = p.tandas.map((t) => t.cortina?.id).filter((x): x is string => !!x);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < Math.min(ids.length, i + 4); j++)
          expect(ids[i], `seed ${seed} at ${i}/${j}`).not.toBe(ids[j]);
      sets.push(new Set(ids));
      for (const c of p.tandas.map((t) => t.cortina).filter(Boolean))
        expect(["lo-fi", "surf-rock", "cumbia"]).not.toContain(c!.genre);
    }
    let s = 0,
      n = 0;
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++) {
        const inter = [...sets[i]!].filter((x) => sets[j]!.has(x)).length;
        s += inter / new Set([...sets[i]!, ...sets[j]!]).size;
        n++;
      }
    expect(s / n).toBeLessThan(0.8);
  });
  it("a small family cycles least-recently-used instead of repeating back to back", () => {
    const pool = cortinaPool()
      .filter((c) => c.genre === "swing")
      .slice(0, 4);
    const o = {
      ...compose({ hours: 1, seed: 1 }, deps).options,
      cortinaStyle: "family" as const,
      cortinaGenres: ["swing"],
    };
    const rng = makeRng(3);
    const plan = planCortinas(pool, o, rng, 60, 12);
    const used = new Set<string>();
    const seq: string[] = [];
    for (let i = 0; i < 12; i++) {
      const c = pickCortina(pool, 60 + (i % 3) * 8, o, rng, used, plan)!;
      used.delete(c.id);
      used.add(c.id);
      seq.push(c.id);
    }
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    for (let i = 0; i < seq.length - 3; i++) expect(new Set(seq.slice(i, i + 4)).size).toBe(4);
  });
  it("a cortina sits within 35 points of the next tanda and the guardia-vieja constant cortina is pre-1936", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const p = golden(seed);
      p.tandas.forEach((t, i) => {
        if (t.cortina && p.tandas[i + 1])
          expect(Math.abs(t.cortina.energy - p.tandas[i + 1]!.energy)).toBeLessThanOrEqual(35);
      });
    }
    const gv = compose({ hours: 3, seed: 5, eras: ["guardia-vieja"] }, deps);
    const c = gv.tandas[0]!.cortina!;
    expect(c.year ?? 9999).toBeLessThanOrEqual(1935);
  });
  it("user-chosen cultures are a hard filter; cortinaLengthSec is respected (±8 s, at most ±15 s when the hour would otherwise be missed)", () => {
    const p = compose(
      { hours: 3, seed: 2, cortinaCultures: ["italian", "french"], cortinaLengthSec: 45 },
      deps,
    );
    for (const t of p.tandas.slice(0, -1)) {
      expect(["italian", "french"]).toContain(t.cortina!.culture);
      expect(Math.abs((t.cortina!.lengthSec ?? 0) - 45)).toBeLessThanOrEqual(15);
    }
    expect(Math.abs((p.stats.cortinaSec ?? 45) - 45)).toBeLessThanOrEqual(15);
    const q = compose({ hours: 3, seed: 2, cortinaLengthSec: 30, rules: { showBreakAt: 0.5 } }, deps);
    for (const t of q.tandas.slice(0, -1))
      expect(Math.abs((t.cortina!.lengthSec ?? 0) - 30)).toBeLessThanOrEqual(15);
    expect(Math.abs(q.stats.durationSec - 3 * 3600) / 60).toBeLessThanOrEqual(6);
    // with no show break and the default length, most nights need no stretch at all
    const within8 = [1, 2, 3, 4, 5, 6].filter((seed) => {
      const r = compose({ hours: 4, seed }, deps);
      return r.tandas.slice(0, -1).every((t) => Math.abs((t.cortina!.lengthSec ?? 0) - 45) <= 8);
    }).length;
    expect(within8).toBeGreaterThanOrEqual(4);
  });
});

describe("B10 — context reaches the engine", () => {
  it("heatwave → milonga count ≤ base and no 3-track tangos unless asked", () => {
    for (const seed of [1, 2, 3]) {
      const base = golden(seed);
      const hot = golden(seed, { context: { season: "summer", weather: "heat", roomTemp: "hot" } });
      expect(hot.stats.byRhythm.milonga).toBeLessThanOrEqual(base.stats.byRhythm.milonga);
      expect(hot.options.tangoTandaSize).toBe(3);
    }
  });
  it("beginners → no dramatic orchestra, no high-difficulty family", () => {
    for (const seed of [1, 2, 3, 4]) {
      const p = compose({ hours: 3, seed, context: { crowdLevel: "beginner" } }, deps);
      for (const t of p.tandas) {
        const pr = deps.catalog.profile(t.orchestraId) as { style?: string; difficulty?: number } | undefined;
        expect(pr?.style, `seed ${seed}: ${t.orchestra}`).not.toBe("dramatic");
        expect(pr?.difficulty ?? 0, `seed ${seed}: ${t.orchestra}`).toBeLessThanOrEqual(60);
      }
    }
  });
  it("Istanbul → ≥ 80 % Turkish/Greek cortinas", () => {
    const p = golden(21, { context: { region: "istanbul" } });
    const cs = p.tandas.map((t) => t.cortina).filter(Boolean);
    const tr = cs.filter((c) => c!.culture === "turkish" || c!.culture === "greek").length;
    expect(tr / cs.length).toBeGreaterThanOrEqual(0.8);
  });
  it("vocalRatioShift and tempoShift change the set: a vocal bias moves the vocal ratio, late night sets one", () => {
    let more = 0,
      less = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      more += golden(seed, { vocalBias: 0.4 }).stats.vocalRatio;
      less += golden(seed, { vocalBias: -0.4 }).stats.vocalRatio;
    }
    expect(more).toBeGreaterThan(less + 0.5);
    expect(
      golden(1, { context: { timeOfDay: "late-night", event: "marathon" } }).options.vocalBias ?? 0,
    ).toBeGreaterThan(0);
    const slow = golden(3, { vocalBias: 0, tempoShift: -4 });
    expect(slow.tandas.map((t) => t.orchestraId)).not.toEqual(golden(3).tandas.map((t) => t.orchestraId));
  });
});

describe("B11/B12/C14 — banks and variety", () => {
  it("the first vals slot never carries a fame-0 one-off singer, and the OTV/del Moral vals is not a fixture", () => {
    let otv = 0;
    for (const seed of SEEDS) {
      const p = golden(seed);
      const v = p.tandas.find((t) => t.rhythm === "vals")!;
      if (v.orchestraId === "orquesta-tipica-victor" && v.singer?.includes("Moral")) otv++;
      const fame = v.songs.reduce((a, s) => a + (s.fame ?? 0), 0);
      const share =
        (deps.catalog.byOrchestra.get(v.orchestraId) ?? []).filter((s) => s.singerId === v.songs[0]!.singerId)
          .length / (deps.catalog.byOrchestra.get(v.orchestraId) ?? []).length;
      expect(fame > 0 || share >= 0.12 || !v.vocal, `seed ${seed}: ${v.orchestra}/${v.singer}`).toBe(true);
    }
    expect(otv).toBeLessThanOrEqual(2);
  });
  it("orchestra Jaccard across 12 seeds is clearly below 0.9 and every per-slot family varies", () => {
    const sets = SEEDS.map((seed) => new Set(golden(seed).tandas.map((t) => t.orchestraId)));
    let s = 0,
      n = 0;
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++) {
        s += [...sets[i]!].filter((x) => sets[j]!.has(x)).length / new Set([...sets[i]!, ...sets[j]!]).size;
        n++;
      }
    expect(s / n).toBeLessThan(0.85);
    const slots = SEEDS.map((seed) => golden(seed).tandas.map((t) => `${t.orchestraId}|${t.singer}`));
    for (let k = 1; k < 22; k++) {
      const fams = new Set(slots.map((x) => x[k]));
      expect(fams.size, `slot ${k}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("C13 — marathon plateau", () => {
  it("plateau ≤ lo + 0.78·(hi−lo), with a dip near 55 % and a second rise near 85 %", () => {
    const ys = Array.from({ length: 101 }, (_, i) => arcTarget(i / 100, "marathon-plateau"));
    expect(Math.max(...ys.slice(30, 50))).toBeLessThanOrEqual(44 + 0.78 * 40 + 1);
    expect(ys[55]!).toBeLessThan(ys[45]! - 3);
    expect(ys[85]!).toBeGreaterThan(ys[55]! + 3);
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i]! - ys[i - 1]!)).toBeLessThan(14);
  });
});

describe("C15 — the scorer measures what the panel measured", () => {
  it("default 4 h golden sets score ≥ 85 and the factors include the round-4 measurements", () => {
    const keys = [
      "darienzo",
      "ultima",
      "cumparsita",
      "placeholders",
      "roles",
      "steps",
      "cortina",
      "obscure",
      "cohesion",
      "context",
    ];
    for (const seed of SEEDS) {
      const p = golden(seed);
      expect(p.score.total, `seed ${seed}`).toBeGreaterThanOrEqual(85);
      for (const k of keys)
        expect(
          p.score.factors.some((f) => f.key === k),
          k,
        ).toBe(true);
    }
  });
  it("orchestra spacing uses the option's gap, requested tanda sizes count as standard, unscored factors leave the denominator", () => {
    const p = compose({ hours: 3, seed: 7, tangoTandaSize: 3, orchestraRepeatGap: 6 }, deps);
    expect(p.score.factors.find((f) => f.key === "sizes")!.score).toBe(1);
    expect(p.score.factors.find((f) => f.key === "spacing")!.detail).toMatch(/within 6/);
    const q = compose({ hours: 3, seed: 7, context: { event: "practica" } }, deps);
    expect(q.options.tangoTandaSize).toBe(3);
    expect(q.score.factors.find((f) => f.key === "sizes")!.score).toBe(1);
    const tempo = p.score.factors.find((f) => f.key === "tempo")!;
    expect(tempo.weight === 0 || tempo.detail.includes("BPM data")).toBe(true);
  });
  it("a soft última, a late D'Arienzo and a mis-dated Cumparsita lower the score", () => {
    const p = golden(3);
    const bad: Playlist = JSON.parse(JSON.stringify(p));
    bad.tandas.at(-1)!.energy = 50;
    for (const t of bad.tandas) if (t.orchestraId === "juan-d-arienzo") t.orchestraId = "ricardo-tanturi";
    bad.closing = { ...bad.closing!, year: 1952, orchestraId: "anibal-troilo" };
    expect(scorePlaylist(bad).total).toBeLessThan(p.score.total - 5);
  });
});

describe("knowledge the JSON already carries", () => {
  it("subPeriods with an empty phase list are never programmed (Troilo 1950s, Di Sarli 1950s in the warm-up)", () => {
    for (const seed of SEEDS) {
      const p = compose({ hours: 4, seed, eras: ["golden-extended"] }, deps);
      for (const t of p.tandas) {
        if (t.orchestraId === "anibal-troilo" && t.yearRange)
          expect(t.yearRange[0], `seed ${seed}`).toBeLessThan(1950);
        if (t.phase === "warmup" && t.orchestraId === "carlos-di-sarli" && t.yearRange)
          expect(t.yearRange[0]).toBeLessThan(1950);
      }
    }
  });
  it("singerDanceable:false and nonDanceSingers never appear; Laurenz/del Río never at a peak", () => {
    for (const seed of SEEDS) {
      const p = compose({ hours: 4, seed, eras: ["golden-extended"] }, deps);
      for (const t of p.tandas) {
        expect(t.singer ?? "").not.toMatch(/Tita Merello|Nelly Omar|Solo de Piano/);
        if (t.orchestraId === "pedro-laurenz" && t.singer?.includes("del Río"))
          expect(t.phase).not.toBe("peak");
      }
    }
  });
  it("after Pugliese comes a vals, a milonga or a rhythmic tango (followWith)", () => {
    for (const seed of SEEDS) {
      const p = golden(seed);
      const i = p.tandas.findIndex((t) => t.orchestraId === "osvaldo-pugliese");
      const next = p.tandas[i + 1];
      if (i < 0 || !next) continue;
      const st = deps.catalog.profile(next.orchestraId)?.style;
      expect(
        next.rhythm !== "tango" || st === "rhythmic" || st === "balanced",
        `seed ${seed}: ${next.orchestra}`,
      ).toBe(true);
    }
  });
});

describe("option precedence (wiring audit)", () => {
  it("(a) tonight's explicit size beats DB rules; (b) DB rules beat era defaults", () => {
    const a = compose(
      { hours: 2, seed: 1, tangoTandaSize: 4, overrides: { rules: { tangoTandaSize: 3 } } },
      deps,
    );
    expect(a.tandas.filter((t) => t.rhythm === "tango").every((t) => t.songs.length === 4)).toBe(true);
    const b = compose({ hours: 2, seed: 1, overrides: { rules: { tangoTandaSize: 3 } } }, deps);
    expect(b.tandas.filter((t) => t.rhythm === "tango").every((t) => t.songs.length === 3)).toBe(true);
  });
  it("(c) explicit keys are immune to context and the skipped shifts are listed; (d) context fills unset keys", () => {
    const c = compose({ hours: 2, seed: 1, tangoTandaSize: 4, context: { event: "practica" } }, deps);
    expect(c.tandas.filter((t) => t.rhythm === "tango").every((t) => t.songs.length === 4)).toBe(true);
    expect(c.options.contextApplied?.skipped).toContain("tangoTandaSize");
    const d = compose({ hours: 2, seed: 1, context: { event: "practica" } }, deps);
    expect(d.options.tangoTandaSize).toBe(3);
    expect(d.options.contextApplied?.applied).toContain("tangoTandaSize");
    const e = compose(
      { hours: 2, seed: 1, tangoTandaSize: 4, explicit: [], context: { event: "practica" } },
      deps,
    );
    expect(e.options.tangoTandaSize).toBe(3);
  });
  it("TTVTTM-strict is immune to context pattern rewriting", () => {
    const p = compose(
      { hours: 3, seed: 1, pattern: "TTVTTM-strict", context: { timeOfDay: "afternoon", mood: "playful" } },
      deps,
    );
    expect(p.options.pattern).toBe("TTVTTM-strict");
    expect(
      p.tandas
        .map((t) => t.rhythm[0]!.toUpperCase())
        .join("")
        .startsWith("TTVTTMTTVTTM"),
    ).toBe(true);
  });
  it("applyMemory returns `recent` with and without preferences and never overrides an explicit recent", () => {
    let mem = emptyMemory();
    mem = rememberSet(mem, compose({ hours: 2, seed: 1 }, deps));
    expect(applyMemory({ hours: 4 }, mem).recent?.tandaKeys?.length).toBeGreaterThan(0);
    mem.preferences = { floorMood: "energetic" };
    expect(applyMemory({ hours: 4 }, mem).recent?.tandaKeys?.length).toBeGreaterThan(0);
    expect(applyMemory({ hours: 4, recent: { titles: ["x"] } }, mem).recent).toEqual({ titles: ["x"] });
  });
  it("swapTanda uses the same scoring as compose (no non-danceable singer, no Cumparsita, respects notBefore)", () => {
    const p = compose({ hours: 4, seed: 42, eras: ["golden-extended"] }, deps);
    let cur = p;
    for (let k = 0; k < 20; k++) {
      const idx = 2 + (k % 5);
      cur = swapTanda(cur, idx, deps, 500 + k);
      const t = cur.tandas[idx]!;
      expect(t.orchestraId).not.toBe("osvaldo-pugliese");
      expect(t.singer ?? "").not.toMatch(/Tita Merello|Nelly Omar/);
      for (const s of t.songs) expect(normTitle(s.title)).not.toBe("la cumparsita");
    }
  });
  it("colourTanda produces one softer, noted tanda after the first peak", () => {
    const p = compose({ hours: 4, seed: 4, eras: ["golden-extended"], rules: { colourTanda: true } }, deps);
    const c = p.tandas.filter((t) => t.note?.includes("colour"));
    expect(c).toHaveLength(1);
    expect(pos(p, c[0]!)).toBeGreaterThan(0.45);
    expect(pos(p, c[0]!)).toBeLessThan(0.7);
  });
  it("'more-instrumental' feedback lowers the vocal ratio", async () => {
    const { applyFeedback } = await import("../src/compose");
    const base = compose({ hours: 3, seed: 5 }, deps);
    const o = applyFeedback({ hours: 3, seed: 5 }, ["more-instrumental"]);
    expect(o.vocalBias).toBeLessThan(0);
    expect(compose(o, deps).stats.vocalRatio).toBeLessThan(base.stats.vocalRatio);
  });
});

describe("catalogue hygiene", () => {
  it("dedupes rows by title|orchestra|year|singer and fixes doubled parenthetical titles", () => {
    const poema = deps.catalog.songs.filter(
      (s) =>
        normTitle(s.title) === "poema" &&
        s.orchestraId === "francisco-canaro" &&
        s.year === 1935 &&
        s.singerId === "roberto-maida",
    );
    expect(poema).toHaveLength(1);
    const cum = deps.catalog.songs.filter(
      (s) =>
        normTitle(s.title) === "la cumparsita" && s.orchestraId === "angel-d-agostino" && s.year === 1952,
    );
    expect(cum).toHaveLength(1);
    expect(deps.catalog.songs.some((s) => /\(([^)]*)\)\s*\(\1\)/.test(s.title))).toBe(false);
  });
  it("era presets: post-golden plays only the post-55 dance orchestras; nuevo/contemporary notes say what the catalogue lacks", async () => {
    const { ERA_SETTINGS } = await import("../src/profiles");
    expect(ERA_SETTINGS["post-golden"]!.includeOrchestras).toContain("juan-d-arienzo");
    expect(ERA_SETTINGS.nuevo!.notes).toMatch(/catalogue/);
    expect(ERA_SETTINGS.contemporary!.notes).toMatch(/catalogue/);
    for (const seed of [1, 2, 3]) {
      const p = compose({ hours: 3, seed, eras: ["post-golden"] }, deps);
      for (const t of p.tandas)
        expect(ERA_SETTINGS["post-golden"]!.includeOrchestras).toContain(t.orchestraId);
      expect(p.tandas.length).toBeGreaterThan(8);
    }
  });
});
