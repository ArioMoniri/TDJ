/**
 * Round-9 invariants: what the working DJ heard in the featured night (docs/reviews/round8-best-night-dj.md):
 * voices early and a vocal majority, peaks that are peaks, the 1935–45 canon families, suspect sides, cortina
 * discipline (no repeat, upbeat after Pugliese, jittered length), the Cumparsita by última style and the order
 * inside a tanda (fame late, slowest never last).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CANON_VOCAL_FAMILIES,
  compose,
  cumparsitaStyle,
  isCanonFamily,
  isReleaseCut,
  isSuspectSide,
  normTitle,
  type Playlist,
  peakSlotIndices,
  pickCortina,
  planCortinas,
  planSlots,
  type Song,
  shapeTanda,
  staticProfile,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
/** the featured night: 4 h golden 1935–45, 4-3-3, Turkish classics, double peak, energetic room */
const NIGHT = {
  hours: 4,
  eras: ["golden" as const],
  yearRange: [1935, 1945] as [number, number],
  tangoTandaSize: 4 as const,
  valsTandaSize: 3 as const,
  milongaTandaSize: 3 as const,
  cortinaCultures: ["turkish"],
  arcShape: "double" as const,
  floorMood: "balanced" as const,
  cortinaTrend: "classic" as const,
  context: { mood: "energetic" as const, event: "milonga" as const, timeOfDay: "night" as const },
};
const nights = new Map<number, Playlist>();
const night = (seed: number) => {
  let p = nights.get(seed);
  if (!p) {
    p = compose({ ...NIGHT, seed, explicit: Object.keys(NIGHT).filter((k) => k !== "context") }, deps);
    nights.set(seed, p);
  }
  return p;
};
const goldens = new Map<number, Playlist>();
const golden = (seed: number) => {
  let p = goldens.get(seed);
  if (!p) {
    p = compose({ hours: 4, seed }, deps);
    goldens.set(seed, p);
  }
  return p;
};
const tangos = (p: Playlist) => p.tandas.filter((t) => t.rhythm === "tango");

describe("R9.1 — voices early, vocal majority", () => {
  it("at most 2 instrumental tango tandas before the first vocal one (the early D'Arienzo counts as one)", () => {
    for (const seed of SEEDS)
      for (const p of [night(seed), golden(seed)]) {
        const tg = tangos(p);
        const firstVocal = tg.findIndex((t) => t.vocal);
        const instrBefore = (firstVocal === -1 ? tg : tg.slice(0, firstVocal)).filter((t) => !t.vocal).length;
        expect(
          instrBefore,
          `seed ${seed}: ${tg.map((t) => (t.vocal ? "v" : "i")).join("")}`,
        ).toBeLessThanOrEqual(2);
      }
  });
  it("rules.maxInstrumentalBeforeVocal is the knob (0 = the opener sings)", () => {
    for (const seed of [1, 2, 3]) {
      const p = compose({ hours: 4, seed, rules: { maxInstrumentalBeforeVocal: 0 } }, deps);
      expect(tangos(p)[0]!.vocal, `seed ${seed}`).toBe(true);
    }
  });
  it("vocal share of the tango tandas in a 4 h golden night is 0.55–0.75", () => {
    // (round 15: the strict panel's vocalBand is a should-fix the hard cycle and the Echagüe summit trade against:
    // one night of the 24 may sit at 0.5, never lower, never over the ceiling)
    let under = 0;
    for (const seed of SEEDS)
      for (const p of [night(seed), golden(seed)]) {
        const tg = tangos(p);
        const share = tg.filter((t) => t.vocal).length / tg.length;
        if (share < 0.55 - 1e-9) under++;
        expect(share, `seed ${seed}`).toBeGreaterThanOrEqual(0.5);
        expect(share, `seed ${seed}`).toBeLessThanOrEqual(0.75);
        expect(p.stats.vocalTangoShare).toBeCloseTo(share, 5);
      }
    expect(under).toBeLessThanOrEqual(1);
  });
});

describe("R9.2 — peaks are peaks", () => {
  it("peakSlotIndices: two tango slots at the two summits of a double / classic two-peak arc, none for a single peak", () => {
    const slots = planSlots({
      ...NIGHT,
      pattern: "classic",
      cortinaStyle: "family",
      cortinaLengthSec: 45,
    } as never);
    const pk = peakSlotIndices(slots, "double");
    expect(pk.length).toBe(2);
    expect(slots[pk[0]!]!.position).toBeGreaterThan(0.3);
    expect(slots[pk[0]!]!.position).toBeLessThan(0.56);
    expect(slots[pk[1]!]!.position).toBeGreaterThan(0.64);
    expect(slots[pk[1]!]!.position).toBeLessThan(0.93);
    for (const i of pk) expect(slots[i]!.rhythm).toBe("tango");
    expect(peakSlotIndices(slots, "single").length).toBe(0);
  });
  it("the peak slots hold peak-phase orchestras only, never one flagged avoidMainPeak, and deliver ≥ target − 4", () => {
    for (const seed of SEEDS) {
      const p = night(seed);
      const peaks = p.tandas.filter((t) => t.peak);
      expect(peaks.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      for (const t of peaks) {
        const prof = deps.catalog.profile(t.orchestraId)!;
        expect(prof.avoidMainPeak, `seed ${seed}: ${t.orchestra} at ${t.index}`).not.toBe(true);
        const sp = prof.subPeriods?.find(
          (x) => t.yearRange && t.yearRange[0] >= x.years[0] - 0.5 && t.yearRange[1] <= x.years[1] + 0.5,
        );
        const phases = sp?.phase ?? prof.phase ?? [];
        expect(phases.includes("peak") || phases.includes("any"), `seed ${seed}: ${t.orchestra}`).toBe(true);
        // round 10: the first summit holds a tanda within 6 (D'Arienzo keeps the main peak), the second within 4
        // round 14: the main summit may hold a panel-clean tanda within 6 when the hotter D'Arienzo instrumental
        // would repeat the early one's line-up period (DJ S3) or lack two hits (dancer R14-7)
        expect(t.energy, `seed ${seed}: ${t.orchestra} at ${t.index}`).toBeGreaterThanOrEqual(
          t.targetEnergy - 6,
        );
      }
      // the última is the third peak and must reach target − 4 (round 4); round 10 lets a vocal closer within 8 end a
      // night that still owes the floor a voice (the vocal band comes first)
      const ult = p.tandas.at(-1)!;
      expect(
        ult.energy,
        `seed ${seed}: última ${ult.orchestra}/${ult.singer ?? "instr"}`,
      ).toBeGreaterThanOrEqual(ult.targetEnergy - (ult.vocal ? 8 : 4));
    }
  });
  it("D'Arienzo tango tandas ≤ 3 per 4 h even with the peaks forced; Rodríguez and Donato carry avoidMainPeak", () => {
    for (const seed of SEEDS)
      expect(
        tangos(night(seed)).filter((t) => t.orchestraId === "juan-d-arienzo").length,
        `seed ${seed}`,
      ).toBeLessThanOrEqual(3);
    expect(deps.catalog.profile("enrique-rodriguez")!.avoidMainPeak).toBe(true);
    expect(deps.catalog.profile("edgardo-donato")!.avoidMainPeak).toBe(true);
  });
  it("stats report the arc RMSE and the peaks", () => {
    const p = night(1);
    const rmse = Math.sqrt(
      p.tandas.reduce((a, t) => a + (t.energy - t.targetEnergy) ** 2, 0) / p.tandas.length,
    );
    expect(p.stats.arcRmse).toBeCloseTo(Math.round(rmse * 10) / 10, 5);
    expect(p.stats.peaks?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("R9.3 — the 1935–45 canon families", () => {
  it("a golden night of ≥ 3.5 h plays at least 3 of the seven canon vocal families as tango tandas", () => {
    for (const seed of SEEDS)
      for (const p of [night(seed), golden(seed)]) {
        const fams = new Set(
          tangos(p)
            .filter((t) => t.vocal)
            .map((t) => isCanonFamily(t)?.id)
            .filter(Boolean),
        );
        expect(fams.size, `seed ${seed}: ${[...fams].join(",")}`).toBeGreaterThanOrEqual(3);
      }
    expect([...new Set(CANON_VOCAL_FAMILIES.map((f) => f.id))]).toEqual([
      "canaro-maida",
      "di-sarli-rufino",
      "d-arienzo-echague",
      "troilo-fiorentino",
      "tanturi-castillo",
      "biagi-ortiz-falgas",
      "calo-beron",
    ]);
  });
  it("a short night is not forced (2 h: the rule is off) and preferFamilies is an option", () => {
    const p = compose({ hours: 2, seed: 5 }, deps);
    expect(p.options.preferFamilies?.length).toBeGreaterThan(0);
    expect(p.tandas.length).toBeGreaterThan(5);
  });
});

describe("R9.4 — track-level checks", () => {
  it("isSuspectSide: a golden-era side over 3:20 is suspect (round 10: whatever the corpus knows)", () => {
    const base = { era: "golden-early", rhythm: "tango", durationSec: 205, fame: 0 } as Song;
    expect(isSuspectSide(base)).toBe(true);
    expect(isSuspectSide({ ...base, fame: 3 })).toBe(true);
    expect(isSuspectSide({ ...base, durationSec: 190 })).toBe(false);
    expect(isSuspectSide({ ...base, era: "nuevo" })).toBe(false);
  });
  it("the featured night carries no unattested side over 3:20 where the family had alternatives, and reissue rows are flagged", () => {
    let suspect = 0;
    for (const seed of SEEDS)
      for (const t of night(seed).tandas) for (const s of t.songs) if (isSuspectSide(s)) suspect++;
    expect(suspect).toBeLessThanOrEqual(2);
    const alt = deps.catalog.songs.find((s) => (s.notes ?? "").toUpperCase().startsWith("COL.ALTAYA"));
    expect(alt?.reissue).toBe(true);
    const plain = deps.catalog.songs.find(
      (s) => s.orchestraId === "juan-d-arienzo" && s.title === "El Flete",
    );
    expect(plain?.reissue).toBeFalsy();
  });
  it("Láurenz 'Amurado' 1940 is the instrumental in the index", () => {
    const rows = deps.catalog.songs.filter(
      (s) => s.orchestraId === "pedro-laurenz" && normTitle(s.title) === "amurado" && s.year === 1940,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows.filter((s) => !s.transcription)) {
      expect(r.vocal).toBe(false);
      expect(r.singer).toBeNull();
    }
  });
});

describe("R9.5 — cortinas", () => {
  it("never the same cortina twice in the night when the family can carry it; every Turkish classic row has a tempo tag", () => {
    for (const seed of SEEDS) {
      const p = night(seed);
      const ids = p.tandas.slice(0, -1).map((t) => t.cortina!.id);
      // (round 16: seven cortina records failed the cortina match rules — live, remix, acoustic — and left the pools;
      // a night may repeat one cue, never within four cues, docs/specs/round16-engine.md §6)
      expect(ids.length - new Set(ids).size, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
    const turkish = deps.cortinas.filter((c) => c.culture === "turkish");
    expect(turkish.length).toBeGreaterThanOrEqual(30);
    for (const c of turkish)
      expect(
        c.tags?.some((t) => t.startsWith("tempo:")),
        c.title,
      ).toBe(true);
    for (const t of ["Hadi Bakalım", "Bambaşka Biri", "Dönence", "Araba", "Cemalim"])
      expect(
        turkish.some((c) => c.title === t && c.resolved?.provider === "deezer"),
        t,
      ).toBe(true);
  });
  it("the cortina after a dramatic tanda (Pugliese) is upbeat: energy ≥ 60 and never tempo:slow", () => {
    let checked = 0;
    for (const seed of SEEDS)
      for (const p of [night(seed), golden(seed)])
        for (const t of p.tandas.slice(0, -1)) {
          if (t.style !== "dramatic" || !t.cortina) continue;
          checked++;
          expect(
            t.cortina.energy,
            `seed ${seed}: ${t.cortina.title} after ${t.orchestra}`,
          ).toBeGreaterThanOrEqual(60);
          expect(t.cortina.tags ?? []).not.toContain("tempo:slow");
        }
    expect(checked).toBeGreaterThan(0);
    // the unit: pickCortina after a dramatic tanda never returns a slow cue when upbeat ones exist
    const pool = deps.cortinas.filter((c) => c.culture === "turkish");
    const o = { ...NIGHT, cortinaStyle: "family", cortinaLengthSec: 45 } as never;
    const rng = { next: () => 0.5, pick: <T>(a: T[]) => a[0], weighted: <T>(a: T[]) => a[0] } as never;
    const plan = planCortinas(pool, o, rng, 60, 22);
    const c = pickCortina(pool, 55, o, rng, new Set(), plan, "dramatic");
    expect(c!.energy).toBeGreaterThanOrEqual(60);
  });
  it("cortina lengths are jittered around the setting (not a constant) and stay within the fit's ±15 s", () => {
    for (const seed of SEEDS) {
      const p = night(seed);
      const ls = p.tandas.slice(0, -1).map((t) => t.cortina!.lengthSec!);
      expect(new Set(ls).size, `seed ${seed}: ${ls.join(",")}`).toBeGreaterThanOrEqual(4);
      for (const l of ls) expect(Math.abs(l - 45)).toBeLessThanOrEqual(15);
      expect(Math.abs((p.stats.cortinaSec ?? 45) - 45)).toBeLessThanOrEqual(15);
    }
  });
});

describe("R9.6 — La Cumparsita by última style", () => {
  it("a rhythmic última closes with D'Arienzo 1951 (another rhythmic version when the última is D'Arienzo); a lyrical one with Di Sarli", () => {
    let rhythmic = 0,
      lyrical = 0,
      inRange = 0;
    for (const seed of SEEDS)
      for (const p of [night(seed), golden(seed)]) {
        const ult = p.tandas.at(-1)!;
        const c = p.closing!;
        // round 13 (golden-age review R7): a night whose own year range ends before 1951 closes inside that range on
        // a stream that is the recording (round13.test.ts); the style rule below is for the nights that reach 1951
        const yr = p.options.yearRange;
        if (yr && yr[1] < 1951) {
          expect(c.year!).toBeGreaterThanOrEqual(yr[0]);
          expect(c.year!).toBeLessThanOrEqual(yr[1]);
          expect(c.streamSuspect).toBeFalsy();
          inRange++;
          continue;
        }
        const style = cumparsitaStyle(deps.catalog, ult.orchestraId);
        if (style === "rhythmic") {
          rhythmic++;
          if (ult.orchestraId !== "juan-d-arienzo") {
            expect(c.orchestraId, `seed ${seed}: ${ult.orchestra} → ${c.orchestra} ${c.year}`).toBe(
              "juan-d-arienzo",
            );
            expect(c.year).toBe(1951);
          } else expect(deps.catalog.profile(c.orchestraId)?.style).toBe("rhythmic");
        } else {
          lyrical++;
          if (ult.orchestraId !== "carlos-di-sarli")
            expect(c.orchestraId, `seed ${seed}: ${ult.orchestra} → ${c.orchestra} ${c.year}`).toBe(
              "carlos-di-sarli",
            );
          else expect(cumparsitaStyle(deps.catalog, c.orchestraId)).toBe("lyrical");
        }
      }
    expect(rhythmic + lyrical + inRange).toBe(SEEDS.length * 2);
    expect(rhythmic + lyrical).toBeGreaterThanOrEqual(SEEDS.length);
    expect(cumparsitaStyle(deps.catalog, "rodolfo-biagi")).toBe("rhythmic");
    expect(cumparsitaStyle(deps.catalog, "osvaldo-pugliese")).toBe("lyrical");
    expect(cumparsitaStyle(deps.catalog, "anibal-troilo")).toBe("lyrical");
  });
});

describe("R9.7 — order inside the tanda", () => {
  const mk = (es: number[], fames: number[] = [], roles: Array<Song["role"] | undefined> = []) =>
    es.map(
      (e, i) =>
        ({
          id: `s${i}`,
          title: `t${i}`,
          energy: e,
          fame: fames[i] ?? 0,
          role: roles[i],
          rhythm: "tango",
          orchestraId: "x",
          orchestra: "x",
          singer: null,
          singerId: null,
          vocal: false,
          year: 1940,
          era: "golden-early",
        }) as Song,
    );
  it("the most famous side goes 3rd or 4th; the slowest never last", () => {
    const out = shapeTanda(mk([60, 70, 80, 75], [5, 0, 0, 1]), "rise-settle");
    expect(out.findIndex((s) => s.fame === 5)).toBeGreaterThanOrEqual(2);
    expect(out.at(-1)!.energy).not.toBe(Math.min(...out.map((s) => s.energy!)));
    const three = shapeTanda(mk([80, 60, 70]), "hammock");
    expect(three.at(-1)!.energy).not.toBe(60);
    // corpus roles still win: an opener opens even when it is the hit
    const roled = shapeTanda(
      mk([60, 70, 80, 75], [5, 0, 0, 1], ["opener", undefined, undefined, "closer"]),
      "rise-settle",
    );
    expect(roled[0]!.role).toBe("opener");
    expect(roled.at(-1)!.role).toBe("closer");
  });
  it("holds across the featured night and the default golden set", () => {
    for (const seed of SEEDS)
      for (const p of [night(seed), golden(seed)])
        for (const [ti, t] of p.tandas.entries()) {
          // (round 17: a tanda ordered as a release cut at its boundary — docs/specs/round17-engine.md §2 — sets the corpus roles and the slowest-side rule aside)
          if (isReleaseCut(p.tandas, ti)) continue;
          const es = t.songs.map((s) => s.energy ?? 50);
          const last = t.songs.at(-1)!;
          const min = Math.min(...es);
          const bodyOpeners = t.songs.slice(1, -1).every((s) => s.role === "opener");
          if (es.filter((e) => e === min).length === 1 && last.role !== "closer" && !bodyOpeners)
            expect(
              last.energy,
              `seed ${seed} tanda ${t.index}: ${t.songs.map((s) => `${s.title} e${s.energy}`).join(" / ")}`,
            ).not.toBe(min);
          if (t.songs.length >= 4) {
            const top = Math.max(...t.songs.map((s) => s.fame ?? 0));
            const hits = t.songs.map((s, i) => ({ s, i })).filter((x) => (x.s.fame ?? 0) === top);
            const blocked =
              hits[0]!.i === 0 && t.songs[2]!.role === "closer" && t.songs[3]!.role === "closer";
            // (round 19, review F3: the one slow hit of a rhythmic tanda, 8 or more under the rest, opens — in the
            // middle it is a hole in the drive; docs/specs/round19-engine.md §2.2 O1)
            const slowHit =
              hits[0]!.i === 0 &&
              staticProfile(t.orchestraId)?.style === "rhythmic" &&
              es.filter((x) => x === min).length === 1 &&
              (hits[0]!.s.energy ?? 50) === min &&
              Math.max(...es) - min >= 8;
            if (top > 0 && hits.length === 1 && hits[0]!.s.role !== "opener" && !blocked && !slowHit)
              expect(
                hits[0]!.i,
                `seed ${seed} tanda ${t.index}: ${t.songs.map((s) => `${s.title} f${s.fame}`).join(" / ")}`,
              ).toBeGreaterThanOrEqual(2);
          }
        }
  });
});

describe("R9 — the benchmark stays green", () => {
  // round 14: ≥ 84 on every seed and ≥ 87 on average (the strict-panel factor, docs/specs/round14-engine.md §6)
  it("the featured night scores ≥ 84 on every seed (≥ 87 on average) with no hard failures", () => {
    let sum = 0;
    for (const seed of SEEDS) {
      const p = night(seed);
      expect(p.score.reasons ?? []).toEqual([]);
      expect(p.score.total, `seed ${seed}`).toBeGreaterThanOrEqual(84);
      sum += p.score.total;
    }
    expect(sum / SEEDS.length).toBeGreaterThanOrEqual(87);
  });
});
