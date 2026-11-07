import type { ComposeOptions, DanceRhythm, Phase, Slot } from "./types";

export const DEFAULT_TRACK_SEC: Record<DanceRhythm, number> = { tango: 168, vals: 150, milonga: 138 };

export function patternString(o: ComposeOptions): string {
  if (o.pattern === "custom")
    return (
      String(o.customPattern ?? "TTVTTM")
        .toUpperCase()
        .replace(/[^TVM]/g, "") || "TTVTTM"
    );
  switch (o.pattern) {
    case "TVTM":
      return "TVTM";
    case "TMTV":
      return "TMTV";
    case "tango-only":
      return "T";
    default:
      return "TTVTTM";
  }
}

export function tandaDuration(o: ComposeOptions, r: DanceRhythm): number {
  const size = r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;
  const track = o.avgTrackSec ?? o.trackSecByRhythm?.[r] ?? DEFAULT_TRACK_SEC[r];
  const cortina = o.cortinaStyle === "none" ? 0 : o.cortinaLengthSec;
  return size * track + cortina;
}

/** How many tandas fit in `hours`, following the pattern cycle. */
export const MAX_HOURS = 12;
export function sanitizeOptions(o: ComposeOptions): ComposeOptions {
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const eras = Array.isArray(o.eras)
    ? o.eras
    : typeof o.eras === "string"
      ? [o.eras as ComposeOptions["eras"][number]]
      : ["golden" as const];
  return {
    ...o,
    eras,
    hours: num(o.hours, 4, 0.5, MAX_HOURS),
    tangoTandaSize: num(o.tangoTandaSize, 4, 3, 5) as 3 | 4 | 5,
    valsTandaSize: num(o.valsTandaSize, 3, 3, 4) as 3 | 4,
    milongaTandaSize: num(o.milongaTandaSize, 3, 3, 4) as 3 | 4,
    cortinaLengthSec: num(o.cortinaLengthSec, 45, 10, 120),
    orchestraRepeatGap: num(o.orchestraRepeatGap, 6, 1, 20),
    singerRepeatGap: num(o.singerRepeatGap, 4, 0, 20),
    maxYearSpread: num(o.maxYearSpread, 4, 0, 30),
    avgTrackSec: o.avgTrackSec === undefined ? undefined : num(o.avgTrackSec, 168, 60, 600),
    customPattern: o.customPattern === undefined ? undefined : String(o.customPattern),
  };
}

export function planSlots(raw: ComposeOptions): Slot[] {
  const o = sanitizeOptions(raw);
  const pat = patternString(o);
  const total = o.hours * 3600 - (o.closeWithCumparsita ? 190 : 0);
  const slots: Slot[] = [];
  let t = 0,
    i = 0;
  while (true) {
    const ch = pat[i % pat.length]!;
    const r: DanceRhythm = ch === "V" ? "vals" : ch === "M" ? "milonga" : "tango";
    const d = tandaDuration(o, r);
    if (Math.abs(t + d - total) > Math.abs(t - total)) break; // stop when one more tanda would move us further from the target
    slots.push({
      index: i,
      rhythm: r,
      size: r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize,
      targetEnergy: 0,
      phase: "build",
      position: 0,
    });
    t += d;
    i++;
    if (i > 400) break;
  }
  const n = slots.length;
  slots.forEach((s, k) => {
    s.position = n <= 1 ? 0 : k / (n - 1);
  });
  applyArc(slots, o);
  return slots;
}

/** Night arc: gradual rise and fall; classic shape has two peaks (around 45% and 80% of the night). */
export function arcTarget(
  x: number,
  arc: ComposeOptions["arc"],
  mood: ComposeOptions["floorMood"] = "balanced",
  shape?: ComposeOptions["arcShape"],
): number {
  const lo = mood === "romantic" ? 40 : mood === "energetic" ? 52 : 44;
  const hi = mood === "romantic" ? 72 : mood === "energetic" ? 90 : mood === "traditional" ? 82 : 84;
  const bump = (c: number, w: number, h: number) => h * Math.exp(-((x - c) ** 2) / (2 * w * w));
  let y: number;
  if (shape === "double") {
    // an explicit double peak: first summit ~42 %, a real breather ~62 % (≥ 8 points under it), the higher second
    // summit ~82 %, then a short settle before the última, which the end lift keeps highest
    const base = lo + (hi - lo) * 0.28 * Math.sin(Math.PI * x);
    y =
      base +
      bump(0.42, 0.1, (hi - lo) * 0.44) +
      bump(0.8, 0.13, (hi - lo) * 0.62) -
      bump(0.61, 0.07, (hi - lo) * 0.12);
    if (x > 0.9) y += ((x - 0.9) / 0.1) * Math.max(0, lo + (hi - lo) * 0.45 - y) * 0.8;
    return Math.round(Math.max(lo - 4, Math.min(hi, y)));
  }
  if (shape === "single") {
    y = lo + (hi - lo) * Math.sin(Math.PI * Math.min(1, Math.max(0, x))) ** 1.05;
    if (x > 0.9) y += ((x - 0.9) / 0.1) * Math.max(0, lo + (hi - lo) * 0.45 - y) * 0.8;
    return Math.round(Math.max(lo - 4, Math.min(hi, y)));
  }
  switch (arc) {
    case "single-peak":
      y = lo + (hi - lo) * Math.sin(Math.PI * Math.min(1, Math.max(0, x))) ** 1.05;
      break;
    case "marathon-plateau": {
      // a marathon block is not a wall: plateau at 78 % of the range, a breather at 55 %, a real second peak at 85 %
      // (round 8: the second emotional peak was missing and the last third slid to e55–66)
      const plateau = lo + (hi - lo) * 0.78 * Math.min(1, x / 0.3);
      y = plateau - bump(0.55, 0.06, (hi - lo) * 0.16) + bump(0.85, 0.07, (hi - lo) * 0.18);
      if (x > 0.92) y -= (hi - lo) * 0.3 * ((x - 0.92) / 0.08);
      break;
    }
    case "gentle":
      y = lo + (hi - lo) * 0.7 * Math.sin(Math.PI * x);
      break;
    default: {
      // classic two peaks: warm-up → first peak ~45% → dip ~60% → higher peak ~80% → cool-down
      const base = lo + (hi - lo) * 0.35 * Math.sin(Math.PI * x);
      y = base + bump(0.45, 0.13, (hi - lo) * 0.45) + bump(0.8, 0.1, (hi - lo) * 0.62);
    }
  }
  // the última tanda is emotional, not flat: lift the very end so the night does not fade out
  if (x > 0.9) y += ((x - 0.9) / 0.1) * Math.max(0, lo + (hi - lo) * 0.45 - y) * 0.8;
  return Math.round(Math.max(lo - 4, Math.min(hi, y)));
}

export function phaseOf(x: number, arc: ComposeOptions["arc"]): Phase {
  if (x < 0.18) return "warmup";
  if (arc === "classic-two-peaks") {
    if (x < 0.38) return "build";
    if (x < 0.52) return "peak";
    if (x < 0.68) return "build";
    if (x < 0.88) return "peak";
    return "cooldown";
  }
  if (x < 0.45) return "build";
  // the plateau stays a peak phase until the last tandas: cool-down orchestras do not get the last third of a marathon
  if (x < (arc === "marathon-plateau" ? 0.95 : 0.8)) return "peak";
  return "cooldown";
}

/** the shape a night can have: "double" needs ≥ 3 h for two peaks and a breather to fit */
export function arcShapeFor(o: Pick<ComposeOptions, "arcShape" | "hours">): ComposeOptions["arcShape"] {
  if (o.arcShape === "double" && o.hours < 3) return "single";
  return o.arcShape;
}

/**
 * The planned summits of a two-peak arc (round 9): the tango slot with the highest target around the first summit
 * (30–56 % of the night) and around the second (64–93 %). A single-peak arc has no planned peak slots (the última is
 * handled on its own). Vals and milonga slots carry a +2/+6 offset and never count as the peak chair.
 */
export function peakSlotIndices(slots: Slot[], shape: ComposeOptions["arcShape"] | "classic"): number[] {
  if (shape !== "double" && shape !== "classic") return [];
  const best = (lo: number, hi: number) => {
    let bi = -1;
    for (const s of slots) {
      if (s.rhythm !== "tango" || s.position < lo || s.position >= hi) continue;
      if (bi === -1 || s.targetEnergy > slots[bi]!.targetEnergy) bi = s.index;
    }
    return bi;
  };
  const last = slots.length - 1;
  return [best(0.3, 0.56), best(0.64, 0.93)].filter((i) => i >= 0 && i !== last);
}

export function applyArc(slots: Slot[], o: ComposeOptions) {
  const shape = arcShapeFor(o);
  for (const s of slots) {
    let e = arcTarget(s.position, o.arc, o.floorMood, shape);
    if (s.rhythm === "milonga") e += 6;
    else if (s.rhythm === "vals") e += 2;
    s.targetEnergy = Math.min(100, e);
    s.phase = phaseOf(
      s.position,
      shape === "double" ? "classic-two-peaks" : shape === "single" ? "single-peak" : o.arc,
    );
  }
  const last = slots[slots.length - 1];
  if (last) last.phase = "close";
  const twoPeaks = shape === "double" || (!shape && o.arc === "classic-two-peaks");
  for (const i of peakSlotIndices(slots, twoPeaks ? (shape === "double" ? "double" : "classic") : "single"))
    slots[i]!.peak = true;
}
