import type { Playlist } from "@tdj/core";
import type { BoothRows } from "./plan";

/**
 * Round 22: the night's energy as a vertical chart (time runs down, energy to the right), the same data the
 * Compose arc draws, with "we are here" from the booth's playhead. Positions are fractions of the night's planned
 * clock so the chart reads like the set list beside it.
 */
export interface EnergyPoint {
  tanda: number;
  /** 0–1 of the night's clock at the tanda's first track */
  at: number;
  /** 0–1 at the tanda's last item (its cortina) */
  end: number;
  energy: number;
  /** the arc's target for this tanda (the shape the night was composed to), when known */
  target: number | null;
  rhythm: string;
  label: string;
}
export interface NightEnergy {
  points: EnergyPoint[];
  /** 0–1: where the playhead is on the night's clock */
  here: number;
  /** the tanda playing (0 before the first, tandas + 1 for the closing) */
  hereTanda: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pct = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;

export function nightEnergy(
  p: Pick<Playlist, "tandas">,
  plan: Pick<BoothRows, "items" | "wallClockSec">,
  planIndex: number,
  positionSec = 0,
): NightEnergy {
  const total = plan.wallClockSec || 1;
  const points: EnergyPoint[] = [];
  p.tandas.forEach((t, ti) => {
    const items = plan.items.filter((x) => x.tanda === ti + 1 && x.kind !== "break");
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const songs = t.songs.map((s) => pct(s.energy)).filter((v): v is number => v !== null);
    const mean = songs.length ? songs.reduce((a, b) => a + b, 0) / songs.length : null;
    points.push({
      tanda: ti + 1,
      at: clamp01(first.startSec / total),
      end: clamp01((last.startSec + last.lengthSec) / total),
      energy: Math.round(pct(t.energy) ?? mean ?? 50),
      target: pct((t as { targetEnergy?: number }).targetEnergy),
      rhythm: t.rhythm,
      label: `${t.orchestra}${t.singer ? ` / ${t.singer}` : ""}`,
    });
  });
  const cur = plan.items[planIndex];
  const here = cur ? clamp01((cur.startSec + Math.max(0, Math.min(positionSec, cur.lengthSec))) / total) : 0;
  return { points, here, hereTanda: cur?.tanda ?? 0 };
}

/** 2026-11 ("slide to an energy cross-section … to play from there"): what the scrub cursor points at */
export interface ScrubPoint {
  /** 0–1 on the night's clock (clamped) */
  at: number;
  tanda: number;
  energy: number;
  rhythm: string;
  label: string;
  /** the plan index of the tanda's first track ("Play from tanda N") */
  first: number;
  /** the plan index of the item sounding at that point of the planned night */
  item: number;
}

type ScrubItem = { kind: string; tanda: number; startSec: number; lengthSec: number };

/** The tanda (and the item) at fraction `f` of the night's planned clock: the one whose span holds it, else nearest. */
export function scrubAt(
  c: NightEnergy,
  plan: { items: ReadonlyArray<ScrubItem>; wallClockSec?: number },
  f: number,
): ScrubPoint {
  const items = plan.items;
  const at = clamp01(f);
  const pts = c.points;
  let p = pts.find((x) => at >= x.at && at <= x.end);
  if (!p && pts.length) {
    let best = Number.POSITIVE_INFINITY;
    for (const x of pts) {
      const d = at < x.at ? x.at - at : at - x.end;
      if (d < best) {
        best = d;
        p = x;
      }
    }
  }
  const tanda = p?.tanda ?? 0;
  const first = items.findIndex((x) => x.tanda === tanda && x.kind === "track");
  const total = plan.wallClockSec || items.reduce((m, x) => Math.max(m, x.startSec + x.lengthSec), 0) || 1;
  const sec = at * total;
  let item = first;
  for (let i = 0; i < items.length; i++) {
    const x = items[i]!;
    if (x.tanda !== tanda || x.kind === "break") continue;
    if (x.startSec <= sec) item = i;
  }
  return {
    at,
    tanda,
    energy: p?.energy ?? 0,
    rhythm: p?.rhythm ?? "",
    label: p?.label ?? "",
    first,
    item,
  };
}

/** The arrow keys: the middle of the tanda one before / after `tanda` (clamped to the first and the last). */
export function scrubStep(c: NightEnergy, tanda: number, dir: 1 | -1): number {
  const pts = c.points;
  if (!pts.length) return 0;
  const k = pts.findIndex((x) => x.tanda === tanda);
  const j = k < 0 ? 0 : Math.max(0, Math.min(pts.length - 1, k + dir));
  const p = pts[j]!;
  return (p.at + p.end) / 2;
}
