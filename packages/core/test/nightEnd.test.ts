/**
 * 2026-11 (the owner: "in the Booth, auto add or remove tandas with all rules to extend the night by 20 min or to an
 * end time, or to shorten it"). Invariants written before the change, for 3 h, 4 h and 5 h nights at several
 * playheads: the played tandas and the playing one never change, nor the última, nor a locked / pinned tanda; the end
 * lands within one tanda of the target; no new rhythm-cycle or big-four fault; the "last 4 tandas tango only" setting
 * keeps the last four tango; every gap keeps a cortina, never two alike in a row; the closing stays a La Cumparsita.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  bigFourProblems,
  changeNightEnd,
  compose,
  isCumparsita,
  type Playlist,
  rhythmCycleFaults,
  tandaKey,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
}, 600000);

const big = (p: Playlist) =>
  bigFourProblems(p.tandas, p.options).filter((x) => x.kind === "adjacent" || x.kind === "gap").length;
const tandaSec = (p: Playlist) =>
  p.tandas.reduce((a, t) => a + t.durationSec + (t.cortina?.lengthSec ?? 0), 0) / p.tandas.length;

function holds(p: Playlist, from: number, deltaMin: number) {
  const end0 = p.booth!.wallClockSec;
  const r = changeNightEnd(p, deps, { from, targetSec: end0 + deltaMin * 60 });
  const q = r.playlist;
  // only the unplayed part changes; the última stays
  for (let i = 0; i < from; i++) expect(tandaKey(q.tandas[i]!)).toBe(tandaKey(p.tandas[i]!));
  expect(tandaKey(q.tandas.at(-1)!)).toBe(tandaKey(p.tandas.at(-1)!));
  for (const t of p.tandas.filter((t) => t.locked || t.pinned))
    expect(q.tandas.some((x) => tandaKey(x) === tandaKey(t))).toBe(true);
  // the end within one tanda of the target (or as near as the rules allowed, said in the notes)
  if (!r.notes.some((n) => /no place|no tanda/.test(n)))
    expect(Math.abs(r.diffSec)).toBeLessThanOrEqual(tandaSec(p));
  expect(Math.sign(r.endSec - end0)).toBe(Math.sign(deltaMin));
  // the rules
  expect(rhythmCycleFaults(q.tandas, q.options).length).toBeLessThanOrEqual(
    rhythmCycleFaults(p.tandas, p.options).length,
  );
  expect(big(q)).toBeLessThanOrEqual(big(p));
  if (q.options.rules?.lastFourTango)
    expect(q.tandas.slice(-4).filter((t) => t.rhythm !== "tango").length).toBeLessThanOrEqual(
      p.tandas.slice(-4).filter((t) => t.rhythm !== "tango").length,
    );
  q.tandas.forEach((t, i) => {
    expect(t.index).toBe(i);
    if (i < q.tandas.length - 1) expect(t.cortina, `gap after tanda ${i + 1}`).toBeTruthy();
    if (i > 0 && t.cortina && q.tandas[i - 1]!.cortina)
      expect(t.cortina.id).not.toBe(q.tandas[i - 1]!.cortina!.id);
  });
  expect(q.closing && isCumparsita(q.closing)).toBe(true);
  expect(r.added.length + r.removed.length).toBeGreaterThan(0);
  expect(q.booth!.wallClockSec).toBe(r.endSec);
  return r;
}

describe("change the end of the night", () => {
  for (const hours of [3, 4, 5])
    it(`${hours} h: +20 / −20 min at a quarter, the middle and three quarters in`, () => {
      const p = compose({ hours, seed: 11 + hours, rules: { lastFourTango: hours === 4 } }, deps);
      const n = p.tandas.length;
      for (const f of [0.25, 0.5, 0.75]) {
        const from = Math.round(n * f);
        const up = holds(p, from, 20);
        expect(up.added.length).toBeGreaterThan(0);
        const down = holds(p, from, -20);
        expect(down.removed.length).toBeGreaterThan(0);
      }
    }, 600000);
  it("an end at a time: the nearest whole-tanda night, the difference reported", () => {
    const p = compose({ hours: 4, seed: 5 }, deps);
    const target = p.booth!.wallClockSec + 33 * 60;
    const r = changeNightEnd(p, deps, { from: 4, targetSec: target });
    expect(r.diffSec).toBe(Math.round(r.endSec - target));
    expect(Math.abs(r.diffSec)).toBeLessThanOrEqual(tandaSec(p));
  }, 300000);
  it("nothing to remove after the playing tanda: the night as it was, with a note", () => {
    const p = compose({ hours: 2, seed: 5 }, deps);
    const r = changeNightEnd(p, deps, {
      from: p.tandas.length - 1,
      targetSec: p.booth!.wallClockSec - 20 * 60,
    });
    expect(r.playlist).toBe(p);
    expect(r.notes[0]).toMatch(/no tanda left/);
  }, 300000);
});
