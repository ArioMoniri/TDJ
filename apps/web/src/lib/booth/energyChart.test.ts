import { describe, expect, it } from "vitest";
import { nightEnergy, scrubAt, scrubStep } from "./energyChart";

// three tandas of two tracks (100 s each) and a cortina (20 s): 220 s per tanda, a 660 s night
const items = [1, 2, 3].flatMap((t) => {
  const base = (t - 1) * 220;
  return [
    { kind: "track", tanda: t, title: `t${t}a`, startSec: base, lengthSec: 100 },
    { kind: "track", tanda: t, title: `t${t}b`, startSec: base + 100, lengthSec: 100 },
    { kind: "cortina", tanda: t, title: `c${t}`, startSec: base + 200, lengthSec: 20 },
  ];
});
const plan = { items, wallClockSec: 660 } as unknown as Parameters<typeof nightEnergy>[1];
const p = {
  tandas: [
    { rhythm: "tango", orchestra: "A", energy: 40, songs: [] },
    { rhythm: "vals", orchestra: "B", energy: 70, songs: [] },
    { rhythm: "milonga", orchestra: "C", energy: 90, songs: [] },
  ],
} as unknown as Parameters<typeof nightEnergy>[0];

/** 2026-11 ("slide to an energy cross-section … to play from there"): the scrub cursor on the vertical chart */
describe("energy scrub", () => {
  const c = nightEnergy(p, plan, 0, 0);
  it("a point on the night's clock names its tanda, the song playing there, the tanda's first track and energy", () => {
    const s = scrubAt(c, plan, 330 / 660);
    expect(s.tanda).toBe(2);
    expect(s.energy).toBe(70);
    expect(s.first).toBe(3);
    expect(s.item).toBe(4);
    expect(s.rhythm).toBe("vals");
  });
  it("clamps past either end; a point on a cortina still names its tanda", () => {
    expect(scrubAt(c, plan, -1).tanda).toBe(1);
    expect(scrubAt(c, plan, 2).tanda).toBe(3);
    const onCortina = scrubAt(c, plan, 210 / 660);
    expect(onCortina.tanda).toBe(1);
    expect(onCortina.first).toBe(0);
  });
  it("arrow keys step one tanda (to its middle), clamped at the first and last", () => {
    const f2 = scrubStep(c, 1, 1);
    expect(scrubAt(c, plan, f2).tanda).toBe(2);
    expect(scrubAt(c, plan, scrubStep(c, 3, 1)).tanda).toBe(3);
    expect(scrubAt(c, plan, scrubStep(c, 1, -1)).tanda).toBe(1);
    expect(scrubAt(c, plan, scrubStep(c, 3, -1)).tanda).toBe(2);
  });
});
