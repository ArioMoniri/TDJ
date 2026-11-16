/**
 * 2026-11 — the layout of Song DNA's "Recordings over the years" (components/song/DnaChart.tsx): a horizontal
 * timeline with one lane per orchestra (ordered by its first recording of the work), decade gridlines and year ticks,
 * each dated recording a mark at its year in its orchestra's lane; recordings of one orchestra in one year sit side by
 * side across the lane (offset, never stacked on one spot). Pure, so the geometry is unit tested.
 */
export interface ChartRecording {
  id: string;
  orchestra: string;
  orchestraId: string;
  year: number | null;
  vocal: boolean;
  singer?: string | null;
  current?: boolean;
}

export interface ChartMark<R extends ChartRecording = ChartRecording> {
  r: R;
  /** 0–1 across the plot (the year's place between the first and the last decade line) */
  x: number;
  /** px from the lane's centre (recordings of the same year in one lane spread across it) */
  dy: number;
}

export interface ChartLane<R extends ChartRecording = ChartRecording> {
  orchestraId: string;
  orchestra: string;
  first: number;
  /** the lane's height in px (≥ 44: every mark keeps a 44 px target) */
  height: number;
  marks: Array<ChartMark<R>>;
}

export interface ChartLayout<R extends ChartRecording = ChartRecording> {
  /** the first and last decade lines (the plot's ends) */
  from: number;
  to: number;
  /** decade lines, each with its place across the plot */
  decades: Array<{ year: number; x: number }>;
  /** every year between, for the axis ticks */
  years: Array<{ year: number; x: number }>;
  lanes: Array<ChartLane<R>>;
  /** recordings without a year (not on the chart; the page says how many) */
  undated: number;
  /** the dated recordings */
  dated: number;
  /** the plot's minimum width in px (it scrolls inside its frame rather than widen the page) */
  minWidth: number;
  current: ChartMark<R> | null;
}

export const LANE_MIN = 44;
/** px between the centres of same-year marks in one lane */
export const SAME_YEAR_STEP = 13;
/** px per year at the narrowest (a 30-year span is 360 px: a phone scrolls a longer one inside its frame) */
export const PX_PER_YEAR = 12;

export function chartLayout<R extends ChartRecording>(recordings: readonly R[]): ChartLayout<R> {
  const dated = recordings.filter((r): r is R & { year: number } => typeof r.year === "number" && r.year > 0);
  const undated = recordings.length - dated.length;
  if (!dated.length)
    return {
      from: 0,
      to: 0,
      decades: [],
      years: [],
      lanes: [],
      undated,
      dated: 0,
      minWidth: 0,
      current: null,
    };
  const lo = Math.min(...dated.map((r) => r.year));
  const hi = Math.max(...dated.map((r) => r.year));
  const from = Math.floor(lo / 10) * 10;
  const to = Math.max(from + 10, Math.ceil((hi + 1) / 10) * 10);
  const span = to - from;
  const xOf = (y: number) => (y - from) / span;
  const decades: ChartLayout["decades"] = [];
  for (let y = from; y <= to; y += 10) decades.push({ year: y, x: xOf(y) });
  const years: ChartLayout["years"] = [];
  for (let y = from; y <= to; y++) years.push({ year: y, x: xOf(y) });
  // one lane per orchestra, by its first recording (then by name)
  const byOrch = new Map<string, Array<R & { year: number }>>();
  for (const r of dated) byOrch.set(r.orchestraId, [...(byOrch.get(r.orchestraId) ?? []), r]);
  let current: ChartMark<R> | null = null;
  const lanes = [...byOrch.entries()]
    .map(([orchestraId, rs]) => {
      const first = Math.min(...rs.map((r) => r.year));
      const perYear = new Map<number, Array<R & { year: number }>>();
      for (const r of [...rs].sort((a, b) => a.year - b.year || Number(b.vocal) - Number(a.vocal)))
        perYear.set(r.year, [...(perYear.get(r.year) ?? []), r]);
      const most = Math.max(...[...perYear.values()].map((g) => g.length));
      const marks: Array<ChartMark<R>> = [];
      for (const [y, g] of perYear)
        g.forEach((r, k) => {
          const m = { r, x: xOf(y), dy: (k - (g.length - 1) / 2) * SAME_YEAR_STEP };
          marks.push(m);
          if (r.current) current = m;
        });
      return {
        orchestraId,
        orchestra: rs[0]!.orchestra,
        first,
        height: Math.max(LANE_MIN, (most - 1) * SAME_YEAR_STEP + 32),
        marks,
      };
    })
    .sort((a, b) => a.first - b.first || a.orchestra.localeCompare(b.orchestra));
  return {
    from,
    to,
    decades,
    years,
    lanes,
    undated,
    dated: dated.length,
    minWidth: span * PX_PER_YEAR,
    current,
  };
}
