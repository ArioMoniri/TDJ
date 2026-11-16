import { describe, expect, it } from "vitest";
import { energyDomain, energyTicks, hereLabelSpot } from "./energyLayout";

describe("the Energy tonight card's chart (the owner: dots squeezed, 'we are here' over the dots)", () => {
  it("the axis is the night's own range: a night between 48 and 66 spans the width", () => {
    const [lo, hi] = energyDomain([48, 52, 61, 66, 55]);
    expect(lo).toBeLessThanOrEqual(44);
    expect(hi).toBeGreaterThanOrEqual(70);
    expect(hi - lo).toBeLessThanOrEqual(40);
    // the dots use most of the plot: the narrowest night still spans ≥ 45 % of it
    expect((66 - 48) / (hi - lo)).toBeGreaterThan(0.45);
    expect(energyDomain([])).toEqual([0, 100]);
    expect(energyDomain([2, 4])).toEqual([0, 30]);
    expect(energyDomain([97, 99])).toEqual([70, 100]);
  });
  it("grid lines fall inside the axis", () => {
    expect(energyTicks([40, 75])).toEqual([50, 60, 70]);
    expect(energyTicks([0, 100])).toEqual([20, 40, 60, 80]);
  });
  it("'we are here' takes a clear spot: never a pill over a dot", () => {
    const dots = [
      { x: 180, y: 96, r: 5 },
      { x: 60, y: 104, r: 5 },
    ];
    const spot = hereLabelSpot(100, dots, 60, 12, [26, 190])!;
    expect(spot).not.toBeNull();
    for (const d of dots) {
      const overlapX = d.x + d.r > spot.x && d.x - d.r < spot.x + 60;
      const overlapY = d.y + d.r > spot.y && d.y - d.r < spot.y + 12;
      expect(overlapX && overlapY).toBe(false);
    }
    // at the chart's top edge the pill goes under the line, never off the drawing
    const top = hereLabelSpot(4, [], 60, 12, [26, 190], 3, [0, 300])!;
    expect(top.above).toBe(false);
    expect(top.y).toBeGreaterThanOrEqual(0);
    // nowhere free: no spot
    const wall = Array.from({ length: 40 }, (_, i) => ({ x: 26 + i * 4.2, y: 100, r: 20 }));
    expect(hereLabelSpot(100, wall, 60, 12, [26, 190])).toBeNull();
  });
});
