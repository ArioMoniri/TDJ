import {
  type Cortina,
  type CoverageEdits,
  type CoverageRow,
  DEFAULT_HEATMAP,
  ERA_WORDS,
  type EraMark,
  eraMark,
  type HeatGrade,
  Heatmap,
  mergeCoverage,
  songEra,
} from "@tdj/core";
import COVERAGE from "../../../../data/index/coverage.json";
import { surnameOf } from "./booth/songInfo";
import type { Song } from "./types";

/**
 * Round 22 — the era indicator in the browser: the shipped heatmap (data/index/coverage.json, the defaults every
 * self-deployed instance ships) with the DJ's grade edits (`overrides.heatmap`) over it. Memoised per edits object.
 */
export const DEFAULT_COVERAGE = COVERAGE as unknown as Array<
  CoverageRow & { orchestra: string; activePeriod?: string; born?: number; died?: number }
>;
let memo: { edits: CoverageEdits | undefined; rows: CoverageRow[]; map: Heatmap } | null = null;
export function coverageWith(edits: CoverageEdits | undefined): { rows: CoverageRow[]; map: Heatmap } {
  if (memo && memo.edits === edits) return memo;
  const rows = mergeCoverage(DEFAULT_COVERAGE, edits);
  memo = { edits, rows, map: new Heatmap(rows) };
  return memo;
}
export function eraOfSong(
  s: Pick<Song, "orchestraId" | "vocal" | "year" | "yearApprox">,
  edits?: CoverageEdits,
) {
  return songEra(s, coverageWith(edits).map);
}
/** cycle a heatmap cell in edit mode: none → 4 → 3 → 2 → 1 → 0 → none */
export function nextGrade(g: number | undefined | null): number | null {
  if (g === undefined || g === null) return 4;
  if (g <= 0) return null;
  return g - 1;
}
/** a cell edit over the DJ's edits: back to the shipped grade drops the edit */
export function editGrade(
  edits: CoverageEdits | undefined,
  orchestraId: string,
  mode: "instrumental" | "vocal",
  year: number,
  grade: number | null,
): CoverageEdits {
  const shipped = DEFAULT_COVERAGE.find((r) => r.orchestraId === orchestraId)?.[mode]?.[String(year)];
  const next: CoverageEdits = { ...(edits ?? {}) };
  const o = { ...(next[orchestraId] ?? {}) };
  const m = { ...(o[mode] ?? {}) };
  if ((shipped ?? null) === grade) delete m[String(year)];
  else m[String(year)] = grade;
  if (Object.keys(m).length) o[mode] = m;
  else delete o[mode];
  if (Object.keys(o).length) next[orchestraId] = o;
  else delete next[orchestraId];
  return next;
}

/* ---------- the Booth's era glyph (four bars), one module with Compose's badge ---------- */

/**
 * In the Booth a side carries the grade the catalogue stamped on it (`heat`); a side that came without one (an older
 * saved night) is looked up in the shipped heatmap. Same four marks as Compose's badge.
 */
export type EraClass = EraMark;

export const ERA_CLASSES: ReadonlyArray<{ cls: EraClass; label: string; bars: number; explain: string }> = [
  // the words are the app's one era vocabulary (core ERA_WORDS, wave 2); the bars are the Booth's glyph
  {
    cls: "best",
    label: ERA_WORDS.best.label,
    bars: 4,
    explain: "The orchestra's best years in your heatmap.",
  },
  {
    cls: "good",
    label: ERA_WORDS.good.label,
    bars: 3,
    explain: "Good years: dependable sides for the floor.",
  },
  {
    cls: "weak",
    label: ERA_WORDS.weak.label,
    bars: 2,
    explain: "Uneven years: single tracks rather than whole tandas.",
  },
  {
    cls: "outside",
    label: ERA_WORDS.outside.label,
    bars: 0,
    explain: "Years outside the orchestra's best in your heatmap.",
  },
];

export function eraClassOf(g: HeatGrade): EraClass {
  return eraMark(g, true)!;
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

/** The era of a side in the Booth, or null (a cortina, an undated side, an orchestra the heatmap does not grade). */
export function eraOf(e: Song | Cortina | null | undefined): Era | null {
  if (!e || !isSong(e)) return null;
  const g =
    typeof e.heat === "number" ? e.heat : DEFAULT_HEATMAP.grade(e.orchestraId, !!e.vocal, e.year ?? null);
  if (g === undefined || g === null) return null;
  const cls = eraClassOf(g as HeatGrade);
  const c = ERA_CLASSES.find((x) => x.cls === cls)!;
  return {
    grade: g as HeatGrade,
    cls,
    label: c.label,
    bars: g as number,
    why: `${surnameOf(e.orchestra)}, ${e.vocal ? "vocal" : "instrumental"}, ${e.year ?? "undated"}: ${c.label.toLowerCase()}`,
  };
}
