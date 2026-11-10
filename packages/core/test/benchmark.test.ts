/**
 * Round-12 invariants: benchmark any composed night against the published DJ sets
 * (docs/reviews/benchmark-reference-sets.md "Common patterns", data/knowledge/benchmark.json) and improve it in place
 * without ever lowering the engine score or the benchmark total.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  benchmarkNight,
  compose,
  cortinaTempo,
  familyOf,
  hardFailures,
  hourlyInstrumental,
  improveNight,
  normTitle,
  type Playlist,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let featured: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const cache = new Map<string, Playlist>();
const golden = (seed: number) => {
  const k = `g${seed}`;
  if (!cache.has(k)) cache.set(k, compose({ hours: 4, seed }, deps));
  return cache.get(k)!;
};
const vocalHeavy = (seed: number) => {
  const k = `v${seed}`;
  if (!cache.has(k)) cache.set(k, compose({ hours: 4, seed, vocalBias: 1 }, deps));
  return cache.get(k)!;
};
const minHour = (p: Playlist) => Math.min(...hourlyInstrumental(p).map((h) => h.share));
const meanHour = (p: Playlist) => {
  const h = hourlyInstrumental(p);
  return h.reduce((a, x) => a + x.share, 0) / Math.max(1, h.length);
};
const orchCounts = (p: Playlist) => {
  const m = new Map<string, number>();
  for (const t of p.tandas) m.set(t.orchestraId, (m.get(t.orchestraId) ?? 0) + 1);
  return m;
};

describe("benchmarkNight", () => {
  it("is pure and deterministic, with a source on every check", () => {
    const p = golden(1);
    const json = JSON.stringify(p);
    const a = benchmarkNight(p);
    const b = benchmarkNight(p);
    expect(a).toEqual(b);
    expect(JSON.stringify(p)).toBe(json);
    expect(a.total).toBeGreaterThanOrEqual(0);
    expect(a.total).toBeLessThanOrEqual(100);
    expect(a.checks.length).toBeGreaterThanOrEqual(13);
    for (const c of a.checks) {
      expect(c.source.length, c.key).toBeGreaterThan(10);
      expect(["ok", "near", "off"]).toContain(c.status);
      expect(c.value, c.key).toBeTruthy();
      expect(c.range, c.key).toBeTruthy();
    }
    const keys = a.checks.map((c) => c.key);
    for (const k of [
      "darienzo",
      "orchestras",
      "vals",
      "milonga",
      "pugliese",
      "cumparsita",
      "canon",
      "instrumental",
      "spacing3",
      "cycle",
      "sizes",
      "cortinaLength",
      "cortinaCulture",
    ])
      expect(keys).toContain(k);
    expect(a.checks.find((c) => c.key === "instrumental")!.fix).toBe("instrumental");
  });

  it("the featured night has no 'off' check except informational ones", () => {
    const b = benchmarkNight(featured);
    // round 13: the round-11 featured night predates the year-spread, golden-core, transitions and heatmap checks
    // (the cohesion review grades it loose: median 2 y, 55 % ≤ 2 y); the main session regenerates it, so those four
    // are judged in round13.test.ts, not here
    const r13 = new Set(["yearSpread", "goldenCore", "transitions", "heatmapBest"]);
    const off = b.checks.filter((c) => c.status === "off" && !c.info && !r13.has(c.key));
    expect(off.map((c) => `${c.key}: ${c.value} (${c.range})`)).toEqual([]);
    expect(b.inRange).toBeGreaterThanOrEqual(b.scored - 3);
  });

  it("hours come from the real durations (songs + cortinas), not the tanda index", () => {
    const p = golden(2);
    const hours = hourlyInstrumental(p);
    expect(hours.length).toBeGreaterThanOrEqual(3);
    expect(hours.length).toBeLessThanOrEqual(5);
    // doubling every song length doubles the clock: twice as many hours, same tandas
    const slow: Playlist = {
      ...p,
      tandas: p.tandas.map((t) => ({
        ...t,
        songs: t.songs.map((s) => ({ ...s, durationSec: (s.durationSec ?? 170) * 2 })),
      })),
    };
    expect(hourlyInstrumental(slow).length).toBeGreaterThan(hours.length);
  });

  it("flags an early Pugliese and a missing Cumparsita", () => {
    const p = golden(3);
    const i = p.tandas.findIndex((t) => t.orchestraId === "osvaldo-pugliese");
    const moved = { ...p, tandas: [...p.tandas] };
    if (i > 0) {
      const [pug] = moved.tandas.splice(i, 1);
      moved.tandas.splice(1, 0, pug!);
      expect(benchmarkNight(moved).checks.find((c) => c.key === "pugliese")!.status).toBe("off");
    }
    const noClose = { ...p, closing: null };
    expect(benchmarkNight(noClose).checks.find((c) => c.key === "cumparsita")!.status).not.toBe("ok");
  });
});

describe("improveNight", () => {
  it("never lowers the engine score or the benchmark total (seeds 1–20, 4 h golden)", () => {
    for (const seed of SEEDS) {
      const p = golden(seed);
      const r = improveNight(p, deps);
      expect(r.before.score).toBe(p.score.total);
      expect(r.after.score, `seed ${seed}`).toBeGreaterThanOrEqual(r.before.score);
      expect(r.after.bench, `seed ${seed}`).toBeGreaterThanOrEqual(r.before.bench);
      expect(r.playlist.score.total).toBe(r.after.score);
      expect(benchmarkNight(r.playlist).total).toBe(r.after.bench);
      const before = new Set(hardFailures(p));
      for (const h of hardFailures(r.playlist)) expect(before.has(h), `seed ${seed}: ${h}`).toBe(true);
      for (const c of r.changes) expect(c.text.length).toBeGreaterThan(10);
    }
  });

  it("every change keeps caps, spacing, the cycle and title uniqueness", () => {
    for (const seed of SEEDS)
      for (const p of [golden(seed), vocalHeavy(seed)]) {
        const r = improveNight(p, deps);
        const q = r.playlist;
        // the same tandas in the same chairs: orchestras and rhythms unchanged (TTVTTM, caps, spacing kept); round 13's
        // golden-core fixer is the one change that may hand a chair to another orchestra (caps and spacing still hold)
        const moved = new Set(r.changes.filter((c) => c.kind === "core").map((c) => c.tanda));
        expect(q.tandas.map((t, i) => (moved.has(i) ? "*" : t.orchestraId))).toEqual(
          p.tandas.map((t, i) => (moved.has(i) ? "*" : t.orchestraId)),
        );
        expect(q.tandas.map((t) => t.rhythm)).toEqual(p.tandas.map((t) => t.rhythm));
        for (const [id, n] of orchCounts(q))
          expect(n, `seed ${seed} ${id}`).toBeLessThanOrEqual(id === "juan-d-arienzo" ? 3 : 2);
        for (let i = 0; i < q.tandas.length; i++)
          for (let j = i + 1; j < Math.min(q.tandas.length, i + 3); j++)
            expect(q.tandas[j]!.orchestraId, `seed ${seed} #${i}/#${j}`).not.toBe(q.tandas[i]!.orchestraId);
        const titles = q.tandas.flatMap((t) => t.songs.map((s) => normTitle(s.title)));
        expect(new Set(titles).size, `seed ${seed}`).toBe(titles.length);
        for (const t of q.tandas) {
          expect(new Set(t.songs.map((s) => s.orchestraId)).size).toBe(1);
          expect(new Set(t.songs.map((s) => s.vocal)).size).toBe(1);
          const ys = t.songs.map((s) => s.year!).filter(Boolean);
          expect(t.yearRange).toEqual([Math.min(...ys), Math.max(...ys)]);
          const mean = Math.round(t.songs.reduce((a, s) => a + (s.energy ?? 0), 0) / t.songs.length);
          expect(Math.abs(t.energy - mean)).toBeLessThanOrEqual(1);
        }
      }
  });

  it("on vocal-heavy nights it raises the per-hour instrumental share", () => {
    let raised = 0;
    for (const seed of SEEDS) {
      const p = vocalHeavy(seed);
      const r = improveNight(p, deps);
      expect(meanHour(r.playlist), `seed ${seed}`).toBeGreaterThanOrEqual(meanHour(p) - 1e-9);
      if (minHour(r.playlist) > minHour(p) || meanHour(r.playlist) > meanHour(p)) raised++;
      const instr = r.changes.filter((c) => c.kind === "instrumental");
      for (const c of instr) {
        // round 13: a later fixer (tighten, heatmap, energy) may rework the same tanda; judge untouched ones
        if (r.changes.some((x) => x !== c && x.tanda === c.tanda)) continue;
        const t = r.playlist.tandas[c.tanda]!;
        expect(t.vocal).toBe(false);
        expect(t.orchestraId).toBe(p.tandas[c.tanda]!.orchestraId);
        expect(t.songs.filter((s) => (s.fame ?? 0) >= 2).length).toBeGreaterThanOrEqual(t.songs.length - 1);
        expect(t.songs.some((s) => s.streamSuspect || s.reissue || s.yearApprox)).toBe(false);
        expect(t.songs.at(-1)!.role === "opener" && t.songs.some((s) => s.role !== "opener")).toBe(false);
        const [y0, y1] = p.tandas[c.tanda]!.yearRange!;
        for (const s of t.songs) {
          expect(s.year!).toBeGreaterThanOrEqual(y0 - 2);
          expect(s.year!).toBeLessThanOrEqual(y1 + 2);
        }
      }
    }
    expect(raised).toBeGreaterThanOrEqual(5);
  });

  it("cue-fit never adds a cortina family and never leaves a slow cue before a vals or milonga it could fix", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const p = golden(seed);
      const r = improveNight(p, deps);
      const fams = (q: Playlist) =>
        new Set(q.tandas.flatMap((t) => (t.cortina ? [familyOf(t.cortina)] : [])));
      const before = fams(p);
      for (const f of fams(r.playlist)) expect(before.has(f), `seed ${seed}: ${f}`).toBe(true);
      // the cues are the same set (swaps), unless a change says a new cue came in
      const cues = (q: Playlist) =>
        q.tandas
          .flatMap((t) => (t.cortina ? [t.cortina.id] : []))
          .sort()
          .join();
      if (!r.changes.some((c) => /new cue/.test(c.text))) expect(cues(r.playlist)).toBe(cues(p));
      const slowBefore = (q: Playlist) =>
        q.tandas.filter(
          (t, i) => i > 0 && t.rhythm !== "tango" && cortinaTempo(q.tandas[i - 1]!.cortina!) === "slow",
        ).length;
      expect(slowBefore(r.playlist), `seed ${seed}`).toBeLessThanOrEqual(slowBefore(p));
      // cortina lengths stay with their gaps
      expect(r.playlist.tandas.map((t) => t.cortina?.lengthSec)).toEqual(
        p.tandas.map((t) => t.cortina?.lengthSec),
      );
    }
  });

  it("is deterministic and leaves the input untouched", () => {
    const p = vocalHeavy(4);
    const json = JSON.stringify(p);
    const a = improveNight(p, deps);
    const b = improveNight(p, deps);
    expect(JSON.stringify(p)).toBe(json);
    expect(a.changes).toEqual(b.changes);
    expect(a.after).toEqual(b.after);
  });

  it("improves the featured night without lowering anything", () => {
    const r = improveNight(featured, deps);
    expect(r.after.score).toBeGreaterThanOrEqual(r.before.score);
    expect(r.after.bench).toBeGreaterThanOrEqual(r.before.bench);
  });
});
