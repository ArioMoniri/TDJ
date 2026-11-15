/**
 * Wave 2 invariants (the T-DJ test users' Compose findings), written before the code:
 * - Swap tanda offers choices ranked by distance to the slot's planned energy (a warm-up slot planned at 51 no longer
 *   gets an energy-79 vals with no choice);
 * - Build by hand ranks its next-tanda suggestions by fit to the plan's energy;
 * - the compose profile work (family memo, surname memo) changes no night: a fixed seed composes the same night
 *   cold and warm.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  compose,
  type Playlist,
  strictChecks,
  suggestNext,
  surnameKey,
  swapTanda,
  swapTandaOptions,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let night: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  night = compose({ hours: 4, seed: 7 }, deps);
}, 600000);

const fam = (p: Playlist, i: number) => p.tandas[i]!.songs.map((s) => s.id).join(",");

describe("Swap tanda: up to three choices, nearest the slot's planned energy first", () => {
  it("ranks by distance to the target, offers distinct families, never the tanda that is there", () => {
    for (const i of [1, 4, 9]) {
      const t = night.tandas[i]!;
      const opts = swapTandaOptions(night, i, deps, 99);
      expect(opts.length).toBeGreaterThan(0);
      expect(opts.length).toBeLessThanOrEqual(3);
      const d = opts.map((p) => Math.abs(p.tandas[i]!.energy - t.targetEnergy));
      expect(d).toEqual([...d].sort((a, b) => a - b));
      expect(new Set(opts.map((p) => fam(p, i))).size).toBe(opts.length);
      for (const p of opts) {
        expect(fam(p, i)).not.toBe(fam(night, i));
        expect(p.tandas[i]!.rhythm).toBe(t.rhythm);
        // every other tanda stays as it was
        night.tandas.forEach((_x, j) => {
          if (j !== i) expect(fam(p, j)).toBe(fam(night, j));
        });
      }
    }
  });
  it("the first choice is at least as close to the plan as the single swap was", () => {
    for (const i of [1, 2, 4, 9]) {
      const target = night.tandas[i]!.targetEnergy;
      const one = swapTanda(night, i, deps, 99);
      const first = swapTandaOptions(night, i, deps, 99)[0];
      if (!first || one === night) continue;
      expect(Math.abs(first.tandas[i]!.energy - target)).toBeLessThanOrEqual(
        Math.abs(one.tandas[i]!.energy - target),
      );
    }
  });
});

describe("Build by hand: suggestions ranked by fit to the plan's energy", () => {
  it("fit to the plan's energy leads: the first suggestion is within 8 of the closest one, never 20 off", () => {
    // every slot of the first hour of a composed night (warm-up and build), from an empty draft on
    for (const k of [0, 1, 2, 3, 4, 5]) {
      const songs = night.tandas.slice(0, k).map((t) => t.songs);
      const r = suggestNext(songs, deps, { hours: 4, limit: 8 });
      expect(r.mode).toBe("tanda");
      const d = r.suggestions.map((s) => Math.abs(s.energy - r.targetEnergy));
      expect(d.length).toBeGreaterThan(1);
      expect(d[0]!).toBeLessThanOrEqual(Math.min(...d) + 8);
      expect(d[0]!).toBeLessThan(20);
      // best first is still the order (the score carries the fit)
      const sc = r.suggestions.map((s) => s.score);
      expect(sc).toEqual([...sc].sort((a, b) => b - a));
    }
  });
});

describe("compose profile (wave 2): faster, the same night", () => {
  it("surnameKey is the old expression", () => {
    for (const s of ["Roberto Rufino", "Alberto Castillo", "", null, undefined, "Ángel Vargas (1945)"])
      expect(surnameKey(s)).toBe(
        (s ?? "")
          .replace(/ı/g, "i")
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/\(.*?\)/g, "")
          .replace(/[^a-z0-9 ]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .split(" ")
          .pop() ?? "",
      );
  });
  it("a fixed seed composes the same night again, with the memos warm", () => {
    const again = compose({ hours: 4, seed: 7 }, deps);
    expect(again.tandas.map((t) => t.songs.map((s) => s.id))).toEqual(
      night.tandas.map((t) => t.songs.map((s) => s.id)),
    );
    expect(again.score.total).toBe(night.score.total);
    expect(strictChecks(again)).toEqual(strictChecks(night));
  });
});
