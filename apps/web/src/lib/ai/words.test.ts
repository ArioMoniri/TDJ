/**
 * Wave 2 (item 9) — the plain-words reader on real nights: the bar's own examples work on a fresh night, a
 * whole-night request is its Adjust chip, and a refused move names the nearest place that works.
 */
import { compose, type Playlist } from "@tdj/core";
import { loadCatalog } from "@tdj/core/load";
import { beforeAll, describe, expect, it } from "vitest";
import { chipOf, EDIT_EXAMPLES, editByWords } from "./edit";

let deps: ReturnType<typeof loadCatalog>;
const nights: Playlist[] = [];
beforeAll(() => {
  deps = loadCatalog();
  for (const seed of [3, 11]) nights.push(compose({ hours: 4, seed }, deps));
}, 600_000);

describe("the plain-words fallback (wave 2)", () => {
  it("“more vals please” is the More vals chip; a named tanda is never a chip", () => {
    expect(chipOf("more vals please")).toBe("more-vals");
    expect(chipOf("More milongas")).toBe("more-milongas");
    expect(chipOf("calmer")).toBe("calmer");
    expect(chipOf("make tanda 7 calmer")).toBeNull();
    const r = editByWords(nights[0]!, deps, "more vals please");
    expect(r.chip).toBe("more-vals");
    expect(r.notUnderstood).toEqual([]);
  });
  it("every example the bar offers works on a freshly composed night", () => {
    for (const p of nights)
      for (const x of EDIT_EXAMPLES) {
        const r = editByWords(p, deps, x);
        expect(
          r.applied.length > 0 || !!r.chip,
          `${x} (seed ${p.options.seed}): ${JSON.stringify(r.rejected)}`,
        ).toBe(true);
      }
  });
  it("a refused move suggests the nearest position that keeps the rules", () => {
    for (const p of nights) {
      const n = p.tandas.length;
      // find a move the rules refuse, then check the suggestion applies
      for (let from = 1; from <= 6; from++) {
        const r = editByWords(p, deps, `move tanda ${from} after tanda ${from + 3}`);
        const no = r.rejected[0];
        if (!no) continue;
        if (no.suggest) {
          const to = Number(no.suggest.match(/to (\d+)$/)![1]);
          expect(to).toBeGreaterThanOrEqual(1);
          expect(to).toBeLessThanOrEqual(n);
          expect(no.reason).toMatch(/nearest place that works is position \d+/);
          expect(editByWords(p, deps, no.suggest).applied.length).toBe(1);
          return;
        }
      }
    }
    throw new Error("no refused move with a suggestion on the test nights");
  });
  it("QA fix 2026-11: a refused move comes back done as asked, for the rule sheet (never applied by itself)", () => {
    let seen = 0;
    for (const p of nights)
      for (let from = 1; from <= 8; from++) {
        const r = editByWords(p, deps, `move tanda ${from} after tanda ${from + 2}`);
        const no = r.rejected.find((x) => x.op.op === "move");
        if (!no || no.op.op !== "move") continue;
        seen++;
        expect(r.asSaid, `move ${from}`).toBeTruthy();
        const moved = p.tandas[from - 1]!;
        const ids = (t: { songs: Array<{ id: string }> }) => t.songs.map((s) => s.id).join();
        expect(ids(r.asSaid!.playlist.tandas[no.op.to - 1]!)).toBe(ids(moved));
        // the night on screen is unchanged until the DJ answers
        expect(r.playlist.tandas.map(ids)).toEqual(p.tandas.map(ids));
        // a locked tanda is never moved as asked
        const locked = {
          ...p,
          tandas: p.tandas.map((t, k) => (k === from - 1 ? { ...t, locked: true } : t)),
        };
        const rl = editByWords(locked, deps, `move tanda ${from} after tanda ${from + 2}`);
        expect(
          rl.asSaid?.playlist.tandas[no.op.to - 1] ? ids(rl.asSaid.playlist.tandas[no.op.to - 1]!) : "",
        ).not.toBe(ids(moved));
      }
    expect(seen).toBeGreaterThan(0);
  });
});
