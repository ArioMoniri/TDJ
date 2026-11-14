import { type Cortina, DEFAULT_HEATMAP, type HeatGrade, type Song } from "@tdj/core";
import { surnameOf } from "./songInfo";

/**
 * Round 22 (ROADMAP §4): the era badge — where a side sits in its orchestra's best years, from the DJ's own heatmap
 * (`data/index/coverage.json`, 0 avoid … 4 fantastic). The catalogue stamps `heat` on every dated side; a side that
 * came without it (an older saved night) is looked up in the shipped heatmap.
 */
export type EraClass = "best" | "good" | "weak" | "outside";

export const ERA_CLASSES: ReadonlyArray<{ cls: EraClass; label: string; bars: number; explain: string }> = [
  { cls: "best", label: "Best years", bars: 4, explain: "The orchestra's finest years in your heatmap." },
  { cls: "good", label: "Good years", bars: 3, explain: "Good years: dependable sides for the floor." },
  {
    cls: "weak",
    label: "Weaker years",
    bars: 2,
    explain: "Uneven years, or only single tracks worth playing.",
  },
  {
    cls: "outside",
    label: "Outside the best years",
    bars: 0,
    explain: "Years your heatmap marks to avoid for this orchestra.",
  },
];

export function eraClassOf(g: HeatGrade): EraClass {
  return g >= 4 ? "best" : g === 3 ? "good" : g >= 1 ? "weak" : "outside";
}

export interface Era {
  grade: HeatGrade;
  cls: EraClass;
  label: string;
  bars: number;
  /** "D'Agostino, vocal, 1941: best years" — the tooltip */
  why: string;
}

const isSong = (e: Song | Cortina): e is Song => "rhythm" in e && "orchestraId" in e;

/** The era of a side, or null (a cortina, an undated side, an orchestra the heatmap does not grade). */
export function eraOf(e: Song | Cortina | null | undefined): Era | null {
  if (!e || !isSong(e)) return null;
  const g =
    typeof e.heat === "number" ? e.heat : DEFAULT_HEATMAP.grade(e.orchestraId, !!e.vocal, e.year ?? null);
  if (g === undefined || g === null) return null;
  const cls = eraClassOf(g as HeatGrade);
  const c = ERA_CLASSES.find((x) => x.cls === cls)!;
  const surname = surnameOf(e.orchestra);
  return {
    grade: g as HeatGrade,
    cls,
    label: c.label,
    bars: g as number,
    why: `${surname}, ${e.vocal ? "vocal" : "instrumental"}, ${e.year ?? "undated"}: ${c.label.toLowerCase()}`,
  };
}
