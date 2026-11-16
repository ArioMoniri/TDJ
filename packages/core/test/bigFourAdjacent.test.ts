/**
 * 2026-11 (QA): "Di Sarli, D'Arienzo, Troilo, Pugliese … never back to back" (types.ts TandaRules.bigFour,
 * coherence.ts bigFourProblems). The QA run composed 4 h nights for seeds 1, 2, 5, 8, 13, 21, 34 and 55 and found one
 * to three back-to-back big-four pairs on every one of them (15 in all); the golden set S1–S12 holds 29.
 *
 * The invariant first written here was the rule itself: no pair on the golden set and the QA seeds, a rare exception
 * stated. It does not hold without trading the strict panel's other rules. Measured on the golden set and the five
 * featured-options nights (43 pairs): an engine that parted all but 2 raised the rhythmic runs 5 → 16, the colour
 * budget 4 → 8, weak openers 9 → 22 and a singer's third tanda 0 → 3, and broke 14 test files; the gentlest version
 * that keeps every panel ratchet (pair mends that break no other panel rule more often, Pugliese never next to a
 * summit, the draws weighing a pair) still parts only 9 of the 43 (QA seeds 15 → 5) and moves enough seeded nights to
 * break 11 test files. Outside the big four the catalogue has few families the floor knows for the chairs the pairs sit
 * on: the late milonga after the D'Arienzo summit wants mean fame ≥ 3 — Canaro–Maida is a colour orchestra, Caló–Berón
 * is not programmed for the peak, Donato and Tanturi are usually inside their repeat gap. That trade is the owner's.
 *
 * The owner's decision (2026-11): "rarely, not never". A remaining pair is a stated exception: recorded on the night,
 * a should-fix item in the strict panel (its detail says so) and in `pnpm quality`'s table of stated exceptions, said
 * to the DJ in plain words (web djMessage) and explained by the edit guide where an edit touches it. The engine change
 * was taken as far as it breaks no other rule: the pair mend and the draws' pair weight hold the panel's rules
 * (compose.ts BIG_FOUR_PAIR_HELD, widened: the first version traded hotCold, ultima and instrCharacter on the golden
 * set), and its narrowed Pugliese draw was dropped (it moved twelve of these nights, put Pugliese into the warm-up of
 * seed 34, lost him from 2.5 h seed 5, made a −22/+27 sawtooth at seed 4's early D'Arienzo and took the golden set's
 * tone band from 78 % to 75 %). Golden S1–S12 29 → 28, the QA seeds 15 → 13, golden + featured options 43 → 40; four
 * nights move (S2, seed 21, featured options 36 and 181), every other rule as it was or within its ratchet.
 *
 * What holds, as a ratchet on today's engine:
 * - no night has more pairs than the counts below, every pair left is recorded on the night
 *   (stats.settingFallbacks "bigFour: …") and read as a stated exception by the strict panel, every night ≥ 85;
 * - the edits keep the rule: Change the end adds no pair, the Insert spot's first choice adds none, and a pair a
 *   Remove makes is named by the edit guide with a fix that parts it;
 * - the big four is one list: data/knowledge/night_shape.json `bigFour`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyGuideFix,
  BIG_FOUR,
  bigFourProblems,
  changeNightEnd,
  compose,
  editGuide,
  insertTandaOptions,
  type Playlist,
  removeTanda,
  strictChecks,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
const GOLDEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const QA = [1, 2, 5, 8, 13, 21, 34, 55];
const SEEDS = [...new Set([...GOLDEN, ...QA])];
const nights = new Map<number, Playlist>();
beforeAll(async () => {
  deps = loadCatalog();
  // (a tick between nights: the worker answers the runner while the sixteen nights compose)
  for (const seed of SEEDS) {
    nights.set(seed, compose({ hours: 4, seed }, deps));
    await new Promise((r) => setTimeout(r, 0));
  }
}, 1200000);

const pairs = (p: Playlist) => bigFourProblems(p.tandas, p.options).filter((x) => x.kind === "adjacent");
const isBig = (id: string) => BIG_FOUR.includes(id);

describe("the big four back to back: recorded, never more, the edits keep the rule", () => {
  it("the golden set and the QA seeds: no night with more pairs than today, every one recorded", () => {
    // the counts on the engine of 2026-11 with the pair mend (the golden set S1–S12, then the other QA seeds; before
    // it: 3 2 2 3 1 3 2 2 4 3 2 2 | 1 3 1 2); rarely, not never
    const TODAY: Record<number, number> = {
      1: 3,
      2: 1,
      3: 2,
      4: 3,
      5: 1,
      6: 3,
      7: 2,
      8: 2,
      9: 4,
      10: 3,
      11: 2,
      12: 2,
      13: 1,
      21: 2,
      34: 1,
      55: 2,
    };
    let golden = 0;
    let qa = 0;
    for (const [seed, p] of nights) {
      const ps = pairs(p);
      expect(p.score.total, `seed ${seed}`).toBeGreaterThanOrEqual(85);
      expect(ps.length, `seed ${seed}: ${ps.map((x) => x.detail).join("; ")}`).toBeLessThanOrEqual(
        TODAY[seed]!,
      );
      if (GOLDEN.includes(seed)) golden += ps.length;
      if (QA.includes(seed)) qa += ps.length;
      for (const f of ps)
        expect(
          p.stats.settingFallbacks?.some((s) => s.startsWith("bigFour:") && s.includes(f.detail)),
          `seed ${seed}: ${f.detail} is not recorded`,
        ).toBe(true);
    }
    // (29 and 15 before the pair mend)
    expect(golden).toBeLessThanOrEqual(28);
    expect(qa).toBeLessThanOrEqual(13);
  });

  it("a pair left is a stated exception: a should-fix item the strict panel reads as one, explained by the edit guide", () => {
    let explained = 0;
    for (const [seed, p] of nights) {
      const r = strictChecks(p);
      for (const f of pairs(p)) {
        const v = r.violations.find((x) => x.rule === "bigFour" && x.tanda === f.tanda && x.with === f.with);
        expect(v?.severity, `seed ${seed}: ${f.detail}`).toBe("should-fix");
        expect(v?.detail, `seed ${seed}`).toBe(
          `${f.detail}: back to back, a stated exception (parting them broke another rule tonight)`,
        );
      }
      // an edit beside the pair (the tanda before it, its sides reordered) leaves the pair and the guide says why
      const f = pairs(p).find((x) => x.with! > 1 && x.tanda < p.tandas.length - 1);
      if (!f || explained >= 3) continue;
      const k = f.with! - 1;
      const after: Playlist = {
        ...p,
        tandas: p.tandas.map((t, i) => (i === k ? { ...t, songs: [...t.songs].reverse() } : t)),
      };
      const g = editGuide(p, after, deps).find((x) => x.message.key === "guide.big4_stated");
      expect(g, `seed ${seed}: ${f.detail}`).toBeTruthy();
      expect(g!.tone).toBe("info");
      expect(g!.text).toContain(`stay back to back (tandas ${f.with! + 1}–${f.tanda + 1})`);
      expect(g!.text).toContain("because parting them broke another rule");
      expect([f.with, f.tanda]).toContain(g!.fix!.fix.kind === "swapTanda" ? g!.fix!.fix.tanda : -1);
      explained++;
    }
    expect(explained).toBeGreaterThan(0);
  }, 600000);

  it("every other rule the repair touches still holds on those nights", () => {
    for (const [seed, p] of nights) {
      const n = p.tandas.length;
      // the opening and closing La Cumparsita, the última a tango
      expect(p.closing?.title.toLowerCase(), `seed ${seed}`).toContain("cumparsita");
      expect(p.tandas[n - 1]!.rhythm, `seed ${seed}`).toBe("tango");
      for (const [i, t] of p.tandas.entries()) {
        // one orchestra, one voice, one rhythm a tanda
        const ss = t.songs.filter((s) => !s.title.toLowerCase().includes("cumparsita"));
        expect(new Set(ss.map((s) => s.orchestraId)).size, `seed ${seed} tanda ${i + 1}`).toBe(1);
        expect(new Set(ss.map((s) => !!s.vocal)).size, `seed ${seed} tanda ${i + 1}`).toBe(1);
        // an orchestra's repeat gap (the composer's one allowance: a known vals / milonga family four chairs from
        // its orchestra's last tanda, under the fame floor — noted on the tanda)
        for (let j = i + 1; j < Math.min(n, i + p.options.orchestraRepeatGap); j++) {
          if (p.tandas[j]!.orchestraId !== t.orchestraId) continue;
          const noted = [t, p.tandas[j]!].some((x) => /inside the repeat gap/.test(x.note ?? ""));
          expect(noted && j - i >= 4, `seed ${seed}: ${t.orchestra} at ${i + 1} and ${j + 1}`).toBe(true);
        }
      }
      // Pugliese after the midpoint (the pair mend narrows his chair; a draw that left him only the última once let him
      // into the warm-up of seed 34)
      p.tandas.forEach((t, i) => {
        if (t.orchestraId === "osvaldo-pugliese")
          expect(i / (n - 1), `seed ${seed}: Pugliese at tanda ${i + 1}`).toBeGreaterThanOrEqual(0.5);
      });
      // never two vals / milonga in a row
      for (let i = 1; i < n; i++)
        expect(
          p.tandas[i - 1]!.rhythm === "tango" || p.tandas[i]!.rhythm === "tango",
          `seed ${seed}: tandas ${i}–${i + 1}`,
        ).toBe(true);
    }
  });

  it("Change the end adds no pair", () => {
    for (const seed of [2, 8]) {
      const p = nights.get(seed)!;
      for (const delta of [20, -20]) {
        const q = changeNightEnd(p, deps, {
          from: Math.round(p.tandas.length / 2),
          targetSec: p.booth!.wallClockSec + delta * 60,
        }).playlist;
        expect(pairs(q).length, `seed ${seed} ${delta} min`).toBeLessThanOrEqual(pairs(p).length);
      }
    }
  }, 600000);

  it("Insert: the spot's first choice adds no pair", () => {
    const p = nights.get(5)!;
    for (const at of [6, 12, 18]) {
      const o = insertTandaOptions(p, at, deps, { n: 3 })[0];
      if (!o) continue;
      expect(pairs(o.playlist).length, `insert at ${at}`).toBeLessThanOrEqual(pairs(p).length);
    }
  }, 600000);

  it("Remove: a pair it makes is named, and the guide's fix parts it", () => {
    let checked = 0;
    for (const [seed, p] of nights) {
      const i = p.tandas.findIndex(
        (t, k) =>
          k > 0 &&
          k < p.tandas.length - 2 &&
          !isBig(t.orchestraId) &&
          isBig(p.tandas[k - 1]!.orchestraId) &&
          isBig(p.tandas[k + 1]!.orchestraId) &&
          p.tandas[k - 1]!.orchestraId !== p.tandas[k + 1]!.orchestraId,
      );
      if (i < 0) continue;
      const r = removeTanda(p, i, deps);
      expect(r.reason).toBeUndefined();
      const g = editGuide(p, r.playlist, deps).find((x) => x.key === "bigFour" && x.fix);
      expect(g, `seed ${seed}: removing tanda ${i + 1}`).toBeTruthy();
      const fixed = applyGuideFix(r.playlist, g!.fix!.fix, deps, 7);
      expect(fixed.reason).toBeUndefined();
      expect(pairs(fixed.playlist).length, `seed ${seed}`).toBeLessThan(pairs(r.playlist).length);
      if (++checked >= 3) break;
    }
    expect(checked).toBeGreaterThan(0);
  }, 600000);

  it("the big four is the night-shape list (data/knowledge/night_shape.json)", () => {
    const shape = JSON.parse(readFileSync(join(findRoot(), "data/knowledge/night_shape.json"), "utf8"));
    expect([...BIG_FOUR].sort()).toEqual(Object.keys(shape.bigFour).sort());
  });
});
