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
