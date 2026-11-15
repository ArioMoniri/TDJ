import { describe, expect, it } from "vitest";
import { parseClock } from "../seek";
import type { BoothRow, PlanEntity } from "./plan";
import { fold, searchTonight, tandaQuery } from "./tonightSearch";

const row = (o: Partial<BoothRow> & Pick<BoothRow, "kind" | "tanda" | "title">): BoothRow =>
  ({ artist: "", rhythm: "tango", lengthSec: 170, startSec: 0, n: 0, gapAfterSec: 2.5, ...o }) as BoothRow;

const items: BoothRow[] = [
  row({ kind: "closing", tanda: 0, title: "La Cumparsita", artist: "D'Agostino" }),
  row({ kind: "track", tanda: 1, title: "Garúa", artist: "Pedro Láurenz / Alberto Podestá", year: 1943 }),
  row({ kind: "track", tanda: 1, title: "Nada más", artist: "Pedro Láurenz / Alberto Podestá", year: 1943 }),
  row({ kind: "cortina", tanda: 1, title: "Cortina", artist: "Band" }),
  row({ kind: "track", tanda: 2, title: "Poema", artist: "Francisco Canaro / Roberto Maida", year: 1935 }),
  row({ kind: "cortina", tanda: 2, title: "Cortina 2", artist: "Band" }),
];
const entities: PlanEntity[] = items.map(() => null);

describe("tonight's search (the Booth's song finder looks in the night first)", () => {
  it("accents and case do not matter", () => {
    expect(fold("Garúa LÁURENZ")).toBe("garua laurenz");
  });
  it("matches title, orchestra and year, every word, in night order, with tanda and place", () => {
    expect(searchTonight(items, entities, "garua")).toEqual([{ i: 1, tanda: 1, k: 1, kind: "track" }]);
    expect(searchTonight(items, entities, "laurenz").map((h) => h.i)).toEqual([1, 2]);
    expect(searchTonight(items, entities, "laurenz nada").map((h) => h.k)).toEqual([2]);
    expect(searchTonight(items, entities, "1935").map((h) => h.i)).toEqual([4]);
    expect(searchTonight(items, entities, "Malena")).toEqual([]);
    expect(searchTonight(items, entities, "  ")).toEqual([]);
  });
  it("T2 or 2 is that tanda (its tracks and cortina); a year is not a tanda", () => {
    expect(tandaQuery("T2", 2)).toBe(2);
    expect(tandaQuery("t 1", 2)).toBe(1);
    expect(tandaQuery("12", 2)).toBeNull();
    expect(tandaQuery("1943", 30)).toBeNull();
    expect(searchTonight(items, entities, "T2").map((h) => h.i)).toEqual([4, 5]);
  });
  it("a start point reads as m:ss or seconds", () => {
    expect(parseClock("0:12")).toBe(12);
    expect(parseClock("1.05")).toBe(65);
    expect(parseClock("42")).toBe(42);
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});
