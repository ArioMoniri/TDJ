import COVERAGE from "../../../data/index/coverage.json";
import PROFILES from "../../../data/knowledge/orchestra_profiles.json";
import { normTitle } from "./energy";
import type { DanceRhythm, OrchestraProfile } from "./types";

/**
 * Round 13 — the user's orchestra heatmap and the per-family year bands.
 *
 * `data/index/coverage.json` is parsed by scripts/build_index.py from the user's own `data/sources/All_orchestras.xls`:
 * per orchestra (21), per year, separately instrumental and vocal, a grade 0 avoid / 1 single tracks only / 2 uneven /
 * 3 good / 4 fantastic. It is the primary source for "which years of this orchestra" (docs/specs/round13-engine.md §2).
 *
 * The per-family bands (`bands` in orchestra_profiles.json, docs/reviews/round13-best-years.md §2) narrow the heatmap
 * per singer; they never widen it. The reviewer's `bandOverrides` (families rated above the heatmap) are stored but
 * ignored unless a night opts in (`ComposeOptions.bandOverrides`): the user has not approved them.
 */
export type HeatGrade = 0 | 1 | 2 | 3 | 4;
export const HEAT_LABEL: Record<HeatGrade, string> = {
  0: "avoid",
  1: "single tracks only",
  2: "uneven",
  3: "good",
  4: "fantastic",
};

export interface CoverageRow {
  orchestraId: string;
  instrumental: Record<string, number | null>;
  vocal: Record<string, number | null>;
}

/** the heatmap lookup: orchestra + mode + year → grade (undefined when the user's grid has no cell) */
export class Heatmap {
  private readonly rows = new Map<string, CoverageRow>();
  constructor(rows: CoverageRow[] = []) {
    for (const r of rows) this.rows.set(r.orchestraId, r);
  }
  has(orchestraId: string): boolean {
    return this.rows.has(orchestraId);
  }
  grade(orchestraId: string, vocal: boolean, year: number | null | undefined): HeatGrade | undefined {
    if (!year) return undefined;
    const r = this.rows.get(orchestraId);
    const g = r?.[vocal ? "vocal" : "instrumental"]?.[String(year)];
    return typeof g === "number" && g >= 0 && g <= 4 ? (g as HeatGrade) : undefined;
  }
}
export const DEFAULT_HEATMAP = new Heatmap(COVERAGE as unknown as CoverageRow[]);

export type FamilyBand = "best" | "ok" | "outside";
export interface BandRange {
  best?: [number, number] | null;
  ok?: [number, number] | null;
  override?: boolean;
  why?: string;
  rhythm?: string;
  singlesOnly?: boolean;
}
export interface FamilyBands {
  instrumental?: BandRange | null;
  singers?: Record<string, BandRange>;
}
export interface GoldenBands {
  core: [number, number];
  edge: Array<[number, number]>;
  /** a colour orchestra (Canaro, Lomuto, OTV, Malerba, Rodríguez, Firpo): capped and kept off the peaks */
  colour?: boolean;
}
export interface LineupBreak {
  /** "YYYY-MM": sides before and after never share a tanda */
  at: string;
  /** the break applies to vocal (true), instrumental (false) or both (unset) families */
  vocal?: boolean;
  why?: string;
}

const STATIC = new Map<string, OrchestraProfile>(
  (PROFILES as unknown as OrchestraProfile[]).map((p) => [p.id, p]),
);
/** the committed profile (data/knowledge/orchestra_profiles.json), for the catalog-free scorers (score, benchmark) */
export const staticProfile = (id: string): OrchestraProfile | undefined => STATIC.get(id);

const inRange = (r: [number, number] | null | undefined, y: number) => !!r && y >= r[0] && y <= r[1];

/** the band entry for a family: the singer's (exact, then accent/case-insensitive), the instrumental one, or undefined */
function bandEntry(
  b: FamilyBands | undefined,
  singer: string | null | undefined,
): { entry: BandRange | null | undefined; listed: boolean } {
  if (!b) return { entry: undefined, listed: false };
  if (!singer) return { entry: b.instrumental, listed: b.instrumental !== undefined };
  const s = b.singers ?? {};
  if (s[singer]) return { entry: s[singer], listed: true };
  const n = normTitle(singer);
  const k = Object.keys(s).find((x) => normTitle(x) === n);
  if (k) return { entry: s[k], listed: true };
  return { entry: undefined, listed: false };
}

/**
 * The family band of one side: best / ok / outside, or undefined when the profile has no bands for it.
 * Instrumental `null` = no instrumental family worth a tanda (outside); a singer missing from a non-empty singers map
 * is outside (the best-years review: OTV's Carmen del Moral is not neutral). With `overrides` the reviewer's proposed
 * overrides extend the bands (off unless the night opts in).
 */
export function familyBand(
  p: Pick<OrchestraProfile, "bands" | "bandOverrides"> | undefined,
  singer: string | null | undefined,
  year: number | null | undefined,
  overrides = false,
): FamilyBand | undefined {
  if (!p?.bands || !year) return undefined;
  const { entry, listed } = bandEntry(p.bands, singer);
  if (overrides) {
    const o = bandEntry(p.bandOverrides, singer).entry;
    if (o && (inRange(o.best, year) || inRange(o.ok, year))) return inRange(o.best, year) ? "best" : "ok";
  }
  if (!listed) {
    if (!singer) return undefined;
    return Object.keys(p.bands.singers ?? {}).length ? "outside" : undefined;
  }
  if (!entry) return "outside";
  if (inRange(entry.best, year)) return "best";
  if (inRange(entry.ok, year)) return "ok";
  return "outside";
}

export type GoldenClass = "core" | "edge" | "other";
/** a year's place in the family's golden-night bands (golden-age review §2); undefined when the orchestra has none */
export function goldenClass(
  p: Pick<OrchestraProfile, "goldenBands"> | undefined,
  year: number | null | undefined,
): GoldenClass | undefined {
  const g = p?.goldenBands;
  if (!g || !year) return undefined;
  if (year >= g.core[0] && year <= g.core[1]) return "core";
  if (g.edge.some((e) => year >= e[0] && year <= e[1])) return "edge";
  return "other";
}
/** the class of a set of sides: core when all are core, edge when all are core or edge, else other */
export function goldenClassOf(
  p: Pick<OrchestraProfile, "goldenBands"> | undefined,
  years: number[],
): GoldenClass | undefined {
  const cs = years.map((y) => goldenClass(p, y));
  if (!cs.length || cs.some((c) => c === undefined)) return undefined;
  if (cs.every((c) => c === "core")) return "core";
  if (cs.every((c) => c !== "other")) return "edge";
  return "other";
}
export const isColour = (p: Pick<OrchestraProfile, "goldenBands"> | undefined) => !!p?.goldenBands?.colour;

/** a golden-purist night (golden-age review §5): `eras: ["golden"]`, or a year range inside 1932–1950 */
export const isGoldenNight = (o: { eras: string[]; yearRange?: [number, number] }) =>
  (o.eras.length > 0 && o.eras.every((e) => e === "golden")) ||
  (!!o.yearRange && o.yearRange[0] >= 1932 && o.yearRange[1] <= 1950);

/** the midpoint of a profile's bpm band for a rhythm (transitions: tempo term) */
export function bpmMid(
  p: Pick<OrchestraProfile, "bpm"> | undefined,
  rhythm: DanceRhythm,
): number | undefined {
  const r = p?.bpm?.[rhythm];
  return r ? (r[0] + r[1]) / 2 : undefined;
}

/** "1938-07-03" → months since year 0 (a bare year sits mid-year; undefined without a year) */
export function monthIndex(
  date: string | null | undefined,
  year: number | null | undefined,
): number | undefined {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(date ?? "");
  if (m) return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 6);
  return year ? year * 12 + 6 : undefined;
}
