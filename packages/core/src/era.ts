import { type CoverageRow, type HeatGrade, Heatmap } from "./knowledge";
import type { Song } from "./types";

/**
 * Round 22 — the era indicator (docs/ROADMAP.md "Round 22 onward" §4): where a side sits in its orchestra's best years,
 * read from the user's heatmap (data/index/coverage.json, 0 avoid … 4 fantastic). The grades ship as defaults; the DJ
 * edits them per user (`CoverageEdits`, kept in their database) and an edit always wins.
 */
export type EraMark = "best" | "good" | "weak" | "outside";
export const ERA_MARK_LABEL: Record<EraMark, string> = {
  best: "Best years",
  good: "Good years",
  weak: "Uneven years",
  outside: "Outside the best years",
};
export const ERA_MARKS: EraMark[] = ["best", "good", "weak", "outside"];

/** a grade as a mark; `known` = the orchestra has a heatmap row (an ungraded orchestra gets no badge) */
export function eraMark(grade: HeatGrade | number | undefined, known: boolean): EraMark | undefined {
  if (!known) return undefined;
  if (grade === undefined) return "outside";
  if (grade >= 4) return "best";
  if (grade >= 3) return "good";
  if (grade >= 1) return "weak";
  return "outside";
}

/** the badge of one side: its mark, the grade behind it and the mode it was read in */
export function songEra(
  s: Pick<Song, "orchestraId" | "vocal" | "year" | "yearApprox">,
  heatmap: Heatmap,
): { mark: EraMark; grade?: HeatGrade; mode: "vocal" | "instrumental"; year: number } | undefined {
  if (!s.year || s.yearApprox || !heatmap.has(s.orchestraId)) return undefined;
  const grade = heatmap.grade(s.orchestraId, s.vocal, s.year);
  const mark = eraMark(grade, true)!;
  return {
    mark,
    ...(grade !== undefined ? { grade } : {}),
    mode: s.vocal ? "vocal" : "instrumental",
    year: s.year,
  };
}

/** the DJ's grade edits: orchestra → mode → year → grade (null clears the shipped cell) */
export type CoverageEdits = Record<
  string,
  { instrumental?: Record<string, number | null>; vocal?: Record<string, number | null> }
>;

/** the shipped rows with the DJ's edits over them (new rows for orchestras the defaults do not grade) */
export function mergeCoverage(rows: CoverageRow[], edits: CoverageEdits | null | undefined): CoverageRow[] {
  if (!edits || !Object.keys(edits).length) return rows;
  const apply = (base: Record<string, number | null>, e?: Record<string, number | null>) => {
    if (!e) return base;
    const next = { ...base };
    for (const [y, g] of Object.entries(e)) {
      if (g === null) delete next[y];
      else if (typeof g === "number" && g >= 0 && g <= 4) next[y] = Math.round(g);
    }
    return next;
  };
  const out = rows.map((r) => {
    const e = edits[r.orchestraId];
    return e
      ? {
          ...r,
          instrumental: apply(r.instrumental ?? {}, e.instrumental),
          vocal: apply(r.vocal ?? {}, e.vocal),
        }
      : r;
  });
  for (const [id, e] of Object.entries(edits))
    if (!rows.some((r) => r.orchestraId === id))
      out.push({ orchestraId: id, instrumental: apply({}, e.instrumental), vocal: apply({}, e.vocal) });
  return out;
}

/** the heatmap a night reads: the shipped grades with the DJ's edits */
export function heatmapWith(rows: CoverageRow[], edits?: CoverageEdits | null): Heatmap {
  return new Heatmap(mergeCoverage(rows, edits));
}

/** sorted years as runs: [1940, 1941, 1942, 1945] → [[1940, 1942], [1945, 1945]] */
export function yearRanges(years: number[]): Array<[number, number]> {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const y of ys) {
    const last = out[out.length - 1];
    if (last && y === last[1] + 1) last[1] = y;
    else out.push([y, y]);
  }
  return out;
}

/** the runs of years graded `min` or higher in one mode */
export function bestYears(
  row: Pick<CoverageRow, "instrumental" | "vocal">,
  mode: "instrumental" | "vocal",
  min = 4,
): Array<[number, number]> {
  const cells = row[mode] ?? {};
  return yearRanges(
    Object.entries(cells)
      .filter(([, g]) => typeof g === "number" && g >= min)
      .map(([y]) => Number(y)),
  );
}

/** "1940–42, 1944" */
export function rangesLabel(r: Array<[number, number]>): string {
  return r
    .map(([a, b]) =>
      a === b
        ? String(a)
        : Math.floor(a / 100) === Math.floor(b / 100)
          ? `${a}–${String(b).slice(2)}`
          : `${a}–${b}`,
    )
    .join(", ");
}
