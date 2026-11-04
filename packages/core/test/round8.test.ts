/**
 * Round-8 invariants: what the working DJ measured on the live build (docs/reviews/round8-dj.md §2–§5):
 * refinements that never shrink a night, undated/transcription rows out of every tanda, song-level rhythm,
 * a varied first D'Arienzo, slot-3 vals heat, cortina loops, marathon shape, score caps, hide by title,
 * Traktor file names.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  arcTarget,
  Catalog,
  compose,
  hideKey,
  isTandaEligible,
  normTitle,
  type Playlist,
  refineOptions,
  refineWithGuard,
  type Song,
  scorePlaylist,
  swapTanda,
  type Tanda,
  toTraktorNML,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const golden = (seed: number, extra: Record<string, unknown> = {}) =>
  compose({ hours: 4, seed, ...extra }, deps);
const pos = (p: Playlist, i: number) => i / Math.max(1, p.tandas.length - 1);
const BA_RULES = {
  context: { region: "buenos-aires" as const, event: "milonga" as const, dayOfWeek: "saturday" as const },
  tandaShape: "hammock" as const,
  rules: {
    cumparsitaCount: 2 as const,
    ultimaRule: "emotional-vocal" as const,
    openerRule: "canon" as const,
  },
};
const undatedSong = (s: Song) => s.yearApprox || !s.year || !!s.transcription;

describe("R1 — refinements ('Tell the DJ') never destroy the night", () => {
  it("'more X' prefers, never restricts the pool; 'no X' excludes; a locked tanda that contradicts is called out", () => {
    const locked: Tanda[] = [{ ...golden(1).tandas[0]!, locked: true } as Tanda];
    const r = refineOptions(
      { hours: 4 },
      { more: ["juan-d-arienzo"], no: ["francisco-canaro"] },
      locked.filter((t) => t.orchestraId === "francisco-canaro"),
    );
    expect(r.options.preferOrchestras).toContain("juan-d-arienzo");
    expect(r.options.includeOrchestras ?? []).not.toContain("juan-d-arienzo");
    expect(r.options.excludeOrchestras).toContain("francisco-canaro");
    expect(r.applied.join(" ")).toMatch(/more Juan D'Arienzo|more juan-d-arienzo/);
    if (locked[0]!.orchestraId === "francisco-canaro") expect(r.notApplied.join(" ")).toMatch(/locked/);
    // an orchestra asked for is no longer excluded
    const r2 = refineOptions(
      { hours: 4, excludeOrchestras: ["juan-d-arienzo"] },
      { more: ["juan-d-arienzo"] },
    );
    expect(r2.options.excludeOrchestras ?? []).not.toContain("juan-d-arienzo");
  });
  it("the review's request (open with D'Arienzo, no Canaro, Pugliese última, more vals) keeps a 4 h night ≥ 90 % long", () => {
    const g = refineWithGuard(
      { hours: 4, seed: 3 },
      {
        more: ["juan-d-arienzo"],
        no: ["francisco-canaro"],
        feedback: ["more-vals", "more-instrumental"],
        patch: { rules: { ultimaRule: "pugliese" } },
      },
      deps,
    );
    expect(g.playlist.stats.durationSec).toBeGreaterThanOrEqual(0.9 * 4 * 3600);
    expect(g.playlist.tandas.some((t) => t.orchestraId === "francisco-canaro")).toBe(false);
    expect(g.playlist.tandas.at(-1)!.orchestraId).toBe("osvaldo-pugliese");
    expect(g.options.seed).toBe(g.playlist.options.seed);
  });
  it("an 'only X' request that cannot fill the night is refused with a reason and the previous options stay", () => {
    const g = refineWithGuard({ hours: 4, seed: 5 }, { only: ["osvaldo-pugliese"] }, deps);
    expect(g.playlist.stats.durationSec).toBeGreaterThanOrEqual(0.9 * 4 * 3600);
    expect(g.notApplied.join(" ")).toMatch(/could not fill 4 h/i);
    expect(g.options.includeOrchestras ?? []).not.toContain("osvaldo-pugliese");
  });
});

describe("R2 — never a tanda from undated or transcription rows", () => {
  const ERAS = ["golden", "golden-extended", "post-golden", "guardia-vieja", "all"] as const;
  it.each(ERAS)(
    "%s: no yearApprox / missing-year / transcription song in any tanda (default and BA rules)",
    (era) => {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const extra of [{}, BA_RULES]) {
          const p = compose({ hours: 4, seed, eras: [era], ...extra }, deps);
          expect(p.tandas.length).toBeGreaterThan(8);
          for (const t of p.tandas) {
            expect(t.yearRange, `${era} seed ${seed} tanda ${t.index} ${t.orchestra}`).not.toBeNull();
            for (const s of t.songs)
              expect(undatedSong(s), `${era} seed ${seed}: ${t.orchestra} – ${s.title} (${s.year})`).toBe(
                false,
              );
          }
        }
      }
    },
  );
  it("the Buenos Aires Saturday night (seed 174088444) closes on a dated tanda", () => {
    const p = compose(
      { ...BA_RULES, context: { ...BA_RULES.context, timeOfDay: "night" }, seed: 174088444 },
      deps,
    );
    const u = p.tandas.at(-1)!;
    expect(u.yearRange).not.toBeNull();
    expect(u.songs.every((s) => !undatedSong(s))).toBe(true);
    expect(u.songs.every((s) => s.rhythm === "tango")).toBe(true);
  });
  it("swapTanda keeps the rule; rules.allowUndated lets a DJ opt in", () => {
    let p = compose({ hours: 4, seed: 2, ...BA_RULES }, deps);
    for (let k = 0; k < 8; k++) {
      p = swapTanda(p, 3 + k, deps, 100 + k);
      for (const s of p.tandas[3 + k]!.songs) expect(undatedSong(s)).toBe(false);
    }
    expect(isTandaEligible({ year: 1940, yearApprox: true } as Song)).toBe(false);
    expect(isTandaEligible({ year: 1940, yearApprox: true } as Song, true)).toBe(true);
    expect(isTandaEligible({ year: 1941, transcription: true } as Song)).toBe(false);
  });
});

describe("R3 — rhythm at the song level, duplicates merged in the index", () => {
  it("no milonga/vals inside a tango tanda (index rhythm, then the title) across eras and seeds", () => {
    for (const era of ["golden", "post-golden", "all"] as const)
      for (const seed of [1, 2, 3, 4])
        for (const t of compose({ hours: 4, seed, eras: [era] }, deps).tandas)
          for (const s of t.songs) {
            expect(s.rhythm, `${era} ${seed}: ${t.orchestra} – ${s.title}`).toBe(t.rhythm);
            if (t.rhythm !== "milonga") expect(normTitle(s.title).startsWith("milonga ")).toBe(false);
          }
  });
  it("Pugliese Farol 1943 is one vocal row (Chanel) and the 1959 La Cumparsita is instrumental", () => {
    const farol = deps.catalog.songs.filter(
      (s) => s.orchestraId === "osvaldo-pugliese" && normTitle(s.title) === "farol" && s.year === 1943,
    );
    expect(farol).toHaveLength(1);
    expect(farol[0]!.vocal).toBe(true);
    expect(farol[0]!.singer).toMatch(/Chanel/);
    const cum = deps.catalog.songs.filter(
      (s) =>
        s.orchestraId === "osvaldo-pugliese" && normTitle(s.title) === "la cumparsita" && s.year === 1959,
    );
    expect(cum.length).toBeGreaterThanOrEqual(1);
    for (const c of cum) expect(c.vocal).toBe(false);
  });
  it("the committed index has no (orchestra, title, year, singer) duplicates and D'Arienzo Jueves 1937 is one row", () => {
    const seen = new Set<string>();
    for (const s of deps.raw.songs) {
      const k = `${s.orchestraId}|${normTitle(s.title)}|${s.year ?? ""}|${s.singerId ?? ""}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
    expect(
      deps.raw.songs.filter(
        (s) => s.orchestraId === "juan-d-arienzo" && normTitle(s.title) === "jueves" && s.year === 1937,
      ),
    ).toHaveLength(1);
    expect(deps.raw.songs.some((s) => s.transcription)).toBe(true);
  });
});

describe("R4 — the first D'Arienzo varies; the slot-3 vals does not overshoot", () => {
  it("over 12 seeds the first D'Arienzo tanda's title set is distinct in ≥ 8 seeds; Rawson/Ataniche/Joaquina/Jueves ≤ 2", () => {
    const sets = SEEDS.map((seed) => {
      const t = golden(seed).tandas.find((x) => x.orchestraId === "juan-d-arienzo" && x.rhythm === "tango")!;
      expect(t.vocal).toBe(false);
      return t.songs
        .map((s) => normTitle(s.title))
        .sort()
        .join("|");
    });
    expect(new Set(sets).size).toBeGreaterThanOrEqual(8);
    expect(sets.filter((s) => s === "ataniche|joaquina|jueves|rawson").length).toBeLessThanOrEqual(2);
  });
  it("the first vals tanda delivers ≤ target + 8 (warm-up valses before Rodríguez–Moreno and Biagi)", () => {
    let ok = 0;
    for (const seed of SEEDS) {
      const v = golden(seed).tandas.find((t) => t.rhythm === "vals")!;
      if (v.energy <= v.targetEnergy + 8) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(11);
  });
  it("no −20/+20 sawtooth around the early D'Arienzo (tandas 1–8): no two consecutive opposite steps both > 18", () => {
    for (const seed of SEEDS) {
      const e = golden(seed)
        .tandas.slice(0, 8)
        .map((t) => t.energy);
      for (let i = 1; i < e.length - 1; i++) {
        const a = e[i]! - e[i - 1]!,
          b = e[i + 1]! - e[i]!;
        expect(a * b < 0 && Math.abs(a) > 18 && Math.abs(b) > 18, `seed ${seed}: ${e.join(" ")}`).toBe(false);
      }
    }
  });
});

describe("R5 — cortina pools: no back-to-back repeat, ≥ 8 distinct per 4 h or an era-matched fallback", () => {
  const variants: Array<[string, Record<string, unknown>]> = [
    ["turkish+greek trend", { cortinaCultures: ["turkish", "greek"], cortinaTrend: "trend" }],
    [
      "heat / afrobeats",
      {
        cortinaCultures: ["afrobeats"],
        cortinaGenres: ["pop", "afrobeats", "bossa", "jazz"],
        context: { season: "summer", weather: "heat", roomTemp: "hot" },
      },
    ],
    ["práctica chanson", { cortinaCultures: ["french"], context: { event: "practica" } }],
    ["marathon chanson", { hours: 6, cortinaCultures: ["french"], context: { event: "marathon" } }],
    ["guardia vieja", { eras: ["guardia-vieja"] }],
    ["default", {}],
  ];
  it.each(variants)("%s", (_name, extra) => {
    for (const seed of [21, 22, 23]) {
      const p = compose({ hours: 4, seed, ...extra }, deps);
      const ids = p.tandas.slice(0, -1).map((t) => t.cortina?.id ?? "-");
      if (p.options.cortinaStyle === "constant") {
        expect(new Set(ids).size).toBe(1);
        continue;
      }
      for (let i = 1; i < ids.length; i++)
        expect(ids[i], `seed ${seed} slot ${i}: ${ids[i]}`).not.toBe(ids[i - 1]);
      const distinct = new Set(ids).size;
      expect(distinct, `seed ${seed}: ${ids.join(",")}`).toBeGreaterThanOrEqual(Math.min(8, ids.length));
    }
  });
  it("a pool that cannot carry the night says so in stats.cortinaFallback; a healthy pool does not", () => {
    const small = compose(
      { hours: 4, seed: 21, cortinaCultures: ["afrobeats"], cortinaTrend: "trend" },
      deps,
    );
    expect(small.stats.cortinaFallback).toMatch(/afrobeats|trend/i);
    expect(golden(21).stats.cortinaFallback).toBeUndefined();
    // the Turkish family now carries a night on its own (round 8: two cues alternating 21 times)
    const tr = compose({ hours: 4, seed: 21, cortinaCultures: ["turkish"], cortinaTrend: "trend" }, deps);
    expect(tr.stats.cortinaFallback).toBeUndefined();
    expect(new Set(tr.tandas.slice(0, -1).map((t) => t.cortina?.id)).size).toBeGreaterThanOrEqual(8);
    expect(tr.tandas.slice(0, -1).every((t) => t.cortina?.culture === "turkish")).toBe(true);
  });
});

describe("R6 — nights of 5 h and more", () => {
  const marathon = (seed: number) =>
    compose(
      {
        hours: 6,
        seed,
        arc: "marathon-plateau",
        context: { event: "marathon", timeOfDay: "late-night", crowdLevel: "advanced" },
      },
      deps,
    );
  it("vocal ratio ≤ 0.75, Pugliese only in the last 40 % (cap kept), a real second peak and plateau", () => {
    for (const seed of [11, 12, 13, 14]) {
      const p = marathon(seed);
      expect(p.stats.vocalRatio, `seed ${seed}`).toBeLessThanOrEqual(0.75);
      const pug = p.tandas.map((t, i) => ({ t, i })).filter((x) => x.t.orchestraId === "osvaldo-pugliese");
      expect(pug.length).toBeLessThanOrEqual(2);
      for (const x of pug)
        expect(pos(p, x.i), `seed ${seed}: Pugliese at ${pos(p, x.i)}`).toBeGreaterThanOrEqual(0.6);
      const late = p.tandas.filter((_, i) => pos(p, i) >= 0.75 && pos(p, i) <= 0.92);
      expect(
        late.some((t) => t.energy >= 72),
        `seed ${seed}: second peak`,
      ).toBe(true);
      const third = p.tandas.filter((_, i) => pos(p, i) >= 0.66);
      const meanE = third.reduce((a, t) => a + t.energy, 0) / third.length;
      const meanT = third.reduce((a, t) => a + t.targetEnergy, 0) / third.length;
      expect(
        meanE,
        `seed ${seed}: last third e${meanE.toFixed(0)} for t${meanT.toFixed(0)}`,
      ).toBeGreaterThanOrEqual(meanT - 6);
    }
  });
  it("no energy sawtooth at tandas 4–6 in long nights outside the planned peaks: no V or Λ whose two legs both exceed 10", () => {
    for (const seed of [11, 12, 13, 14, 15, 16])
      for (const p of [marathon(seed), compose({ hours: 6, seed }, deps)]) {
        const ts = p.tandas.slice(2, 7); // tandas 3..7 give the steps around 4–6
        const e = ts.map((t) => t.energy);
        const firstDA = p.tandas.find((t) => t.orchestraId === "juan-d-arienzo" && t.rhythm === "tango");
        for (let i = 1; i < e.length - 1; i++) {
          if (ts[i] === firstDA || ts[i]!.phase === "peak") continue; // the planned early D'Arienzo peak is a peak
          const a = e[i]! - e[i - 1]!,
            b = e[i + 1]! - e[i]!;
          expect(a * b < 0 && Math.abs(a) > 10 && Math.abs(b) > 10, `seed ${seed}: ${e.join(" ")}`).toBe(
            false,
          );
        }
      }
  });
});

describe("R7 — hard failures cap the score at 60 and print why", () => {
  const base = () => JSON.parse(JSON.stringify(golden(3))) as Playlist;
  it("an undated or transcription última, a wrong rhythm inside a tanda, a broken Pugliese cap and a 53-minute night", () => {
    const good = golden(3);
    expect(good.score.total).toBeGreaterThanOrEqual(85);
    expect(good.score.reasons ?? []).toHaveLength(0);

    const undated = base();
    for (const s of undated.tandas.at(-1)!.songs) s.yearApprox = true;
    undated.tandas.at(-1)!.yearRange = null;
    const su = scorePlaylist(undated);
    expect(su.total).toBeLessThanOrEqual(60);
    expect(su.reasons!.join(" ")).toMatch(/undated/i);

    const boot = base();
    boot.tandas.at(-1)!.songs[1]!.transcription = true;
    expect(scorePlaylist(boot).reasons!.join(" ")).toMatch(/transcription/i);

    const rhythm = base();
    const tango = rhythm.tandas.find((t) => t.rhythm === "tango" && t.index > 2)!;
    tango.songs[2]!.rhythm = "milonga";
    const sr = scorePlaylist(rhythm);
    expect(sr.total).toBeLessThanOrEqual(60);
    expect(sr.reasons!.join(" ")).toMatch(/milonga/i);

    const pug = base();
    for (const t of pug.tandas.slice(14, 19)) {
      t.orchestraId = "osvaldo-pugliese";
      t.orchestra = "Osvaldo Pugliese";
    }
    const sp = scorePlaylist(pug);
    expect(sp.total).toBeLessThanOrEqual(60);
    expect(sp.reasons!.join(" ")).toMatch(/Pugliese/);

    const short = base();
    short.tandas = short.tandas.slice(0, 4);
    short.stats = { ...short.stats, durationSec: 53 * 60 };
    const ss = scorePlaylist(short);
    expect(ss.total).toBeLessThanOrEqual(60);
    expect(ss.reasons!.join(" ")).toMatch(/53 min|duration/i);
  });
});

describe("R8 — hide by orchestra + title", () => {
  it("hiding one D'Arienzo 'Jueves' hides every copy; hiddenScope 'copy' hides that row only; hiddenTitles keys work", () => {
    const rows = deps.raw.songs.filter(
      (s) => s.orchestraId === "juan-d-arienzo" && normTitle(s.title) === "jueves",
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const one = rows[0]!;
    const mk = (ov: Parameters<typeof loadCatalog>[1]) =>
      new Catalog(deps.raw.songs, deps.raw.profiles, deps.raw.cache, deps.corpus, ov, deps.trackEnergy);
    const byTitle = mk({ songs: { [one.id]: { hidden: true } } });
    expect(
      byTitle.songs.some((s) => s.orchestraId === "juan-d-arienzo" && normTitle(s.title) === "jueves"),
    ).toBe(false);
    const copy = mk({ songs: { [one.id]: { hidden: true, hiddenScope: "copy" } } });
    const left = copy.songs.filter(
      (s) => s.orchestraId === "juan-d-arienzo" && normTitle(s.title) === "jueves",
    );
    expect(left.length).toBe(rows.length - 1);
    expect(left.some((s) => s.id === one.id)).toBe(false);
    const keyed = mk({ hiddenTitles: [hideKey(one)] });
    expect(keyed.songs.some((s) => hideKey(s) === hideKey(one))).toBe(false);
    for (const seed of [1, 2, 3]) {
      const p = compose({ hours: 4, seed }, { ...deps, catalog: keyed });
      for (const t of p.tandas) for (const s of t.songs) expect(hideKey(s)).not.toBe(hideKey(one));
    }
  });
});

describe("R9 — Traktor NML file names", () => {
  it("FILE never contains '/' or other path-invalid characters, and matches the M3U8/Rekordbox naming", () => {
    const p = compose({ hours: 2, seed: 7 }, deps);
    const nml = toTraktorNML(p);
    const files = [...nml.matchAll(/FILE="([^"]*)"/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(f).not.toMatch(/[/\\:*?<>|]/);
    const vocal = p.tandas.find((t) => t.singer)!;
    const s = vocal.songs[0]!;
    expect(nml).toContain(`${s.orchestra} - ${vocal.singer} - ${s.title}.mp3`.replace(/[/\\:*?"<>|]+/g, "-"));
  });
});

describe("R10 — explicit arc shape", () => {
  const peaks = (ys: number[]) => {
    let n = 0;
    for (let i = 1; i < ys.length - 1; i++) if (ys[i]! > ys[i - 1]! && ys[i]! >= ys[i + 1]!) n++;
    return n;
  };
  it("double: two local maxima with a real dip between, última highest; single: one; neighbours within ±6 outside the climbs", () => {
    const body = (shape: "single" | "double") =>
      Array.from({ length: 20 }, (_, i) => arcTarget(i / 21, "classic-two-peaks", "balanced", shape)); // before the end lift
    const d = body("double");
    expect(peaks(d)).toBe(2);
    const first = Math.max(...d.slice(0, 11)),
      dip = Math.min(...d.slice(8, 15)),
      second = Math.max(...d.slice(11));
    expect(first - dip).toBeGreaterThanOrEqual(8);
    expect(second).toBeGreaterThan(first);
    expect(peaks(body("single"))).toBe(1);
    for (const shape of ["single", "double"] as const) {
      const ys = Array.from({ length: 23 }, (_, i) =>
        arcTarget(i / 22, "classic-two-peaks", "balanced", shape),
      );
      for (let i = 1; i < ys.length; i++) {
        const climb = ys[i]! > ys[i - 1]! && i / 22 < 0.85;
        if (!climb) expect(Math.abs(ys[i]! - ys[i - 1]!), `${shape} slot ${i}`).toBeLessThanOrEqual(6);
      }
    }
  });
  it("compose honours arcShape (double ≥ 3 h, shorter nights fall back to single) and yearRange narrows the pool", () => {
    const p = compose({ hours: 4, seed: 3, arcShape: "double", yearRange: [1935, 1945] }, deps);
    expect(p.options.arcShape).toBe("double");
    expect(peaks(p.tandas.slice(0, -2).map((t) => t.targetEnergy))).toBeGreaterThanOrEqual(2);
    expect(p.tandas.at(-1)!.targetEnergy).toBeGreaterThanOrEqual(62);
    for (const t of p.tandas) for (const s of t.songs) expect(s.year!).toBeLessThanOrEqual(1945);
    expect(compose({ hours: 2, seed: 3, arcShape: "double" }, deps).options.arcShape).toBe("single");
  });
});

describe("regressions the review listed", () => {
  it("a standalone closing La Cumparsita is never a vocal version (Canaro/Alonso 1951 out)", () => {
    for (const seed of SEEDS) {
      for (const p of [golden(seed), compose({ hours: 6, seed, context: { event: "marathon" } }, deps)])
        if (p.closing)
          expect(p.closing.vocal, `seed ${seed}: ${p.closing.orchestra} ${p.closing.year}`).toBe(false);
    }
  });
  it("no identical family (orchestra, singer, overlapping years, rhythm) twice in a 4 h golden night", () => {
    for (const seed of SEEDS) {
      const p = golden(seed);
      for (let i = 0; i < p.tandas.length; i++)
        for (let j = i + 1; j < p.tandas.length; j++) {
          const a = p.tandas[i]!,
            b = p.tandas[j]!;
          const same =
            a.orchestraId === b.orchestraId &&
            (a.singer ?? "") === (b.singer ?? "") &&
            a.rhythm === b.rhythm &&
            !!a.yearRange &&
            !!b.yearRange &&
            a.yearRange[0] <= b.yearRange[1] &&
            b.yearRange[0] <= a.yearRange[1];
          expect(same, `seed ${seed}: ${a.orchestra}/${a.singer} ${a.yearRange} at ${i} and ${j}`).toBe(
            false,
          );
        }
    }
  });
});
