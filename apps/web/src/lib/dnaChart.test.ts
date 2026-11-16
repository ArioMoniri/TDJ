import { describe, expect, it } from "vitest";
import { chartLayout, LANE_MIN, PX_PER_YEAR, SAME_YEAR_STEP } from "./dnaChart";

/**
 * 2026-11 — Song DNA's "Recordings over the years": lanes per orchestra by first recording, decade lines, same-year
 * marks spread across the lane (never stacked on one spot), the current one found, undated ones counted.
 */
const R = (id: string, orchestraId: string, year: number | null, o: { vocal?: boolean; current?: boolean } = {}) => ({
  id,
  orchestra: orchestraId.toUpperCase(),
  orchestraId,
  year,
  vocal: o.vocal ?? false,
  current: o.current,
});

describe("the recordings chart", () => {
  const rs = [
    R("a1", "troilo", 1942, { vocal: true, current: true }),
    R("a2", "troilo", 1942),
    R("a3", "troilo", 1942, { vocal: true }),
    R("b1", "demare", 1938, { vocal: true }),
    R("c1", "pugliese", 1952),
    R("u1", "pugliese", null),
  ];
  const l = chartLayout(rs);
  it("one lane per orchestra, in the order each first recorded the work", () => {
    expect(l.lanes.map((x) => x.orchestraId)).toEqual(["demare", "troilo", "pugliese"]);
  });
  it("runs from decade to decade, a line every ten years and a tick every year", () => {
    expect([l.from, l.to]).toEqual([1930, 1960]);
    expect(l.decades.map((d) => d.year)).toEqual([1930, 1940, 1950, 1960]);
    expect(l.years).toHaveLength(31);
    expect(l.decades[0]!.x).toBe(0);
    expect(l.decades.at(-1)!.x).toBe(1);
    expect(l.minWidth).toBe(30 * PX_PER_YEAR);
  });
  it("the same year's recordings in one lane are offset across it, never on one spot, and the lane grows to fit", () => {
    const troilo = l.lanes.find((x) => x.orchestraId === "troilo")!;
    const dys = troilo.marks.map((m) => m.dy);
    expect(new Set(dys).size).toBe(3);
    expect(Math.max(...dys) - Math.min(...dys)).toBe(2 * SAME_YEAR_STEP);
    expect(troilo.marks.every((m) => m.x === troilo.marks[0]!.x)).toBe(true);
    expect(troilo.height).toBeGreaterThanOrEqual(LANE_MIN);
    expect(troilo.height).toBeGreaterThanOrEqual(2 * SAME_YEAR_STEP + 32);
    expect(l.lanes.find((x) => x.orchestraId === "demare")!.height).toBe(LANE_MIN);
  });
  it("finds this recording and counts the undated ones (they are not drawn)", () => {
    expect(l.current?.r.id).toBe("a1");
    expect(l.undated).toBe(1);
    expect(l.dated).toBe(5);
    expect(l.lanes.flatMap((x) => x.marks).some((m) => m.r.id === "u1")).toBe(false);
  });
  it("nothing dated: no chart", () => {
    const none = chartLayout([R("u", "x", null)]);
    expect(none.lanes).toEqual([]);
    expect(none.undated).toBe(1);
  });
  it("a single year still spans a decade", () => {
    const one = chartLayout([R("a", "x", 1940)]);
    expect([one.from, one.to]).toEqual([1940, 1950]);
  });
});
