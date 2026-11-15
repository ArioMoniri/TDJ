import { type CoverageEdits, type CoverageRow, Heatmap, mergeCoverage, songEra } from "@tdj/core";
import COVERAGE from "../../../../data/index/coverage.json";
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
