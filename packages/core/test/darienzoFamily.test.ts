/**
 * Round 8 (one family never twice): the early D'Arienzo instrumental and the D'Arienzo instrumental summit never
 * share a family (orchestra, singer, overlapping years, rhythm). With the 1939–44 sides streaming, the early chair
 * takes years outside the summit's (the 1939 sides when the summit is the 1935–38 Hotel Victoria set), or the summit
 * takes years outside the early chair's, whichever the strict panel judges better.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  compose,
  familyBreaks,
  mendDarienzoFamily,
  normTitle,
  retimeTanda,
  type Song,
  streamable,
  strictChecks,
  strictOrder,
  type Tanda,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const DA = "juan-d-arienzo";
const instr = (t: Tanda) => t.orchestraId === DA && t.rhythm === "tango" && !t.vocal;
const overlap = (a: Tanda, b: Tanda) =>
  !!a.yearRange && !!b.yearRange && a.yearRange[0] <= b.yearRange[1] && b.yearRange[0] <= a.yearRange[1];
const side = (title: string, year: number): Song => {
  const s = deps.catalog.songs.find(
    (x) =>
      x.orchestraId === DA &&
      !x.vocal &&
      x.rhythm === "tango" &&
      x.year === year &&
      normTitle(x.title) === normTitle(title),
  );
  if (!s) throw new Error(`${title} ${year} not in the index`);
  return s;
};
const HOOKS = new Set(["hotel victoria", "el flete", "el internado"]);

describe("mendDarienzoFamily", () => {
  it("parts an early 1936–37 chair from a 1935–38 instrumental summit", () => {
    let checked = 0;
    for (const seed of [2, 7, 9, 10]) {
      const p = compose({ hours: 4, seed }, deps);
      const i = p.tandas.findIndex((t) => instr(t) && !t.peak);
      const j = p.tandas.findIndex((t) => instr(t) && !!t.peak);
      if (i < 1 || j < 0) continue;
      // the night as the builder drafted it before the mend: the early chair on the 1936–37 sides
      const early = retimeTanda(
        p.tandas[i]!,
        strictOrder(
          [side("El Cencerro", 1937), side("Retintín", 1936), side("Jueves", 1937), side("El Caburé", 1937)],
          false,
        ),
      );
      const summit = retimeTanda(
        p.tandas[j]!,
        strictOrder(
          [
            side("Hotel Victoria", 1935),
            side("Champagne Tango", 1938),
            side("La Catrera", 1938),
            side("El Esquinazo", 1938),
          ],
          false,
        ),
      );
      const others = new Set(
        p.tandas.flatMap((t, k) => (k === i || k === j ? [] : t.songs.map((s) => normTitle(s.title)))),
      );
      const draft = p.tandas.map((t, k) => (k === i ? early : k === j ? summit : t));
      if (
        draft.some(
          (t, k) =>
            k !== i &&
            k !== j &&
            t.songs.some((s) =>
              [...early.songs, ...summit.songs].some((x) => normTitle(x.title) === normTitle(s.title)),
            ),
        )
      )
        continue;
      expect(overlap(draft[i]!, draft[j]!)).toBe(true);
      const judge = (ts: Tanda[]) => strictChecks({ tandas: ts, closing: p.closing, options: p.options });
      const before = judge(draft);
      const breaks = familyBreaks(deps.catalog);
      const m = mendDarienzoFamily(draft, p.options, deps.catalog, judge, breaks);
      const e = m.tandas[i]!,
        s = m.tandas[j]!;
      expect(overlap(e, s), `seed ${seed}: ${e.yearRange} / ${s.yearRange}`).toBe(false);
      expect(m.fallbacks.join(" ")).toMatch(/darienzo/);
      // the early chair stays an instrumental of 1935–39 and keeps the summit's hooks for the summit
      expect(instr(e) && !e.peak).toBe(true);
      expect(e.yearRange![0]).toBeGreaterThanOrEqual(1935);
      expect(e.yearRange![1]).toBeLessThanOrEqual(1939);
      for (const x of e.songs) expect(HOOKS.has(normTitle(x.title)), x.title).toBe(false);
      // neither chair crosses a line-up break or recording gap (round 13 R3)
      const month = (x: Song) => {
        const d = /^(\d{4})(?:-(\d{2}))?/.exec(x.date ?? "");
        return d ? Number(d[1]) * 12 + (d[2] ? Number(d[2]) - 1 : 6) : x.year! * 12 + 6;
      };
      for (const t of [e, s]) {
        const ms = t.songs.map(month);
        const lo = Math.min(...ms),
          hi = Math.max(...ms);
        expect(
          breaks(DA, null, false).some((b) => lo < b && b <= hi),
          `${t.yearRange}`,
        ).toBe(false);
      }
      // the summit holds the darienzoPeak window (1937–40, or from 1935 with a fame-5 side)
      expect(s.yearRange![1]).toBeLessThanOrEqual(1940);
      // no title twice in the night, at most one side per chair that nothing streams (no Spotify id, no Deezer match)
      const titles = m.tandas.flatMap((t) => t.songs.map((x) => normTitle(x.title)));
      expect(new Set(titles).size).toBe(titles.length);
      for (const t of [e, s]) {
        for (const x of t.songs) expect(others.has(normTitle(x.title))).toBe(false);
        expect(t.songs.filter((x) => !streamable(x)).length).toBeLessThanOrEqual(1);
      }
      // no new blocker; the round-8 rule is hard, so the split may cost the panel a little (never two should-fix items)
      const after = judge(m.tandas);
      expect(after.blockers).toBeLessThanOrEqual(before.blockers);
      expect(after.penalty).toBeLessThanOrEqual(before.penalty + 2 + 1e-9);
      // and never a −20/+20 sawtooth the night did not have
      const saws = (ts: Tanda[]) =>
        ts.filter((t, k) => {
          if (k === 0 || k === ts.length - 1) return false;
          const x = t.energy - ts[k - 1]!.energy,
            y = ts[k + 1]!.energy - t.energy;
          return x * y < 0 && Math.abs(x) > 18 && Math.abs(y) > 18;
        }).length;
      expect(saws(m.tandas)).toBeLessThanOrEqual(saws(draft));
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });
  it("leaves a night alone when the two chairs do not overlap", () => {
    const p = compose({ hours: 4, seed: 4 }, deps);
    const judge = (ts: Tanda[]) => strictChecks({ tandas: ts, closing: p.closing, options: p.options });
    const m = mendDarienzoFamily(p.tandas, p.options, deps.catalog, judge, familyBreaks(deps.catalog));
    expect(m.fallbacks).toEqual([]);
    m.tandas.forEach((t, k) => expect(t).toBe(p.tandas[k]));
  });
});
