/**
 * 2026-11 (the owner on the Energy tonight card: "UI button sizing, text justifying issue" — the dots squeezed into the
 * middle third, "we are here" over the dots): the chart's geometry as pure functions.
 */

/**
 * The energy axis: the night's own range (its dots and the planned line), a little room each side, at least 30 points
 * wide, on multiples of 5 — a night that lives between 48 and 66 uses the card's whole width, not its middle third.
 */
export function energyDomain(values: number[], minSpan = 30): [number, number] {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return [0, 100];
  let lo = Math.min(...v) - 4;
  let hi = Math.max(...v) + 4;
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  lo = Math.max(0, Math.floor(lo / 5) * 5);
  hi = Math.min(100, Math.ceil(hi / 5) * 5);
  if (hi - lo < minSpan) {
    if (lo === 0) hi = Math.min(100, minSpan);
    else lo = Math.max(0, 100 - minSpan);
  }
  return [lo, hi];
}

/** grid lines inside the domain, every 10 (every 20 when the domain is wide) */
export function energyTicks([lo, hi]: [number, number]): number[] {
  const step = hi - lo > 60 ? 20 : 10;
  const out: number[] = [];
  for (let v = Math.ceil((lo + 1) / step) * step; v < hi; v += step) out.push(v);
  return out;
}

/**
 * Where "we are here" goes: on the side of the line (above, then below) and at the x where its pill covers no dot —
 * the right end first, then the widest free run; null when no free run fits (the label then stays off the chart).
 * `dots`: the dots' centres and radius; `width`: the label pill's width; `band`: its height; [x0, x1]: the plot;
 * [y0, y1]: the drawing's height (the pill stays on it).
 */
export function hereLabelSpot(
  lineY: number,
  dots: Array<{ x: number; y: number; r: number }>,
  width: number,
  band: number,
  [x0, x1]: [number, number],
  gap = 3,
  [y0, y1]: [number, number] = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
): { x: number; y: number; above: boolean } | null {
  for (const above of [true, false]) {
    const top = above ? lineY - gap - band : lineY + gap;
    const bottom = top + band;
    // (never off the chart: at the night's start the line sits at its top edge, the pill goes under it)
    if (top < y0 || bottom > y1) continue;
    // the dots that reach into the band, as blocked x runs
    const blocked = dots
      .filter((d) => d.y + d.r > top && d.y - d.r < bottom)
      .map((d) => [d.x - d.r - 2, d.x + d.r + 2] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    // free runs, right to left
    const free: Array<[number, number]> = [];
    let cur = x0;
    for (const [a, b] of blocked) {
      if (a > cur) free.push([cur, Math.min(a, x1)]);
      cur = Math.max(cur, b);
    }
    if (cur < x1) free.push([cur, x1]);
    const fits = free.filter(([a, b]) => b - a >= width).sort((p, q) => q[1] - p[1]);
    if (fits.length) {
      const [, b] = fits[0]!;
      return { x: b - width, y: top, above };
    }
  }
  return null;
}
