import {
  BOOTH_DEFAULTS,
  BOOTH_RANGES,
  type BoothLogEntry,
  type BoothPlan,
  type BoothPlanItem,
  type Cortina,
  type Playlist,
  planBooth,
  type Song,
} from "@tdj/core";

export type { BoothLogEntry, BoothPlan, BoothPlanItem };
/**
 * The night's timing plan comes from `@tdj/core` (round7-booth.md §7): the same `planBooth` the exports write their
 * cue points from. This module adds what the page needs on top: the entity behind every item, display rows, the
 * remaining-time arithmetic (§6.4) and clock labels.
 */
export { BOOTH_DEFAULTS, BOOTH_RANGES, planBooth };

export type PlanEntity = Song | Cortina | null;

/** A plan item with what the cards print (title, artist, singer, year, rhythm). */
export interface BoothRow extends BoothPlanItem {
  title: string;
  artist: string;
  singer?: string | null;
  year?: number | null;
  rhythm: string;
}
export type BoothRows = Omit<BoothPlan, "items"> & { items: BoothRow[] };

/** The song / cortina behind every plan item, in the same order (`null` for a break). */
export function planEntities(p: Playlist, plan: Pick<BoothPlan, "items">): PlanEntity[] {
  const seq: PlanEntity[] = [];
  if (p.opening) seq.push(p.opening);
  p.tandas.forEach((t, ti) => {
    for (const s of t.songs) seq.push(s);
    if (t.cortina) seq.push(t.cortina);
    for (const b of p.breaks ?? []) if (b.afterTanda === ti) seq.push(null);
  });
  return plan.items.map((_, i) => seq[i] ?? null);
}

/** Display rows for the plan. */
export function decorate(p: Playlist, plan: BoothPlan): BoothRows {
  const entities = planEntities(p, plan);
  const items = plan.items.map((it, i): BoothRow => {
    const e = entities[i];
    if (it.kind === "break") {
      const b = p.breaks?.find((x) => x.afterTanda === it.tanda - 1);
      return {
        ...it,
        title: b?.label || "Break",
        artist: `${Math.round(it.lengthSec / 60)} min`,
        rhythm: "break",
      };
    }
    if (!e) return { ...it, title: "?", artist: "", rhythm: it.kind };
    if ("rhythm" in e)
      return {
        ...it,
        title: e.title,
        artist: e.singer ? `${e.orchestra} / ${e.singer}` : e.orchestra,
        singer: e.singer,
        year: e.year,
        rhythm: e.rhythm,
      };
    return { ...it, title: e.title, artist: e.artist, year: e.year ?? null, rhythm: "cortina" };
  });
  return { ...plan, items };
}

/** The item that is the night's end (La Cumparsita when the set closes with it, else the last item). */
export function closingIndex(plan: Pick<BoothPlan, "items">): number {
  return plan.items.length - 1;
}

/**
 * Remaining planned seconds from a playhead (§6.4): the rest of the current item plus every item after it with its
 * gap; `skipped` items are left out; a cortina's live length may be shortened when the fader is already down.
 * `timeToCumparsita` = remaining − the closing's length.
 */
export function remainingFrom(
  plan: Pick<BoothPlan, "items">,
  planIndex: number,
  positionSec: number,
  o: {
    skipped?: ReadonlySet<number>;
    currentLength?: number;
    /** every item capped (rehearsal mode) */
    rehearsalSec?: number | null;
    /** per-item cap (an item played from a 30 s preview), wins over `rehearsalSec` */
    capFor?: (i: number) => number | null;
  } = {},
): { remainingSec: number; timeToCumparsita: number } {
  const len = (i: number) => {
    const it = plan.items[i]!;
    if (it.kind === "break") return it.lengthSec;
    const cap = o.capFor ? o.capFor(i) : o.rehearsalSec;
    return cap ? Math.min(cap, it.lengthSec) : it.lengthSec;
  };
  const cur = plan.items[planIndex];
  if (!cur) return { remainingSec: 0, timeToCumparsita: 0 };
  let rest = Math.max(0, (o.currentLength ?? len(planIndex)) - positionSec) + cur.gapAfterSec;
  for (let i = planIndex + 1; i < plan.items.length; i++) {
    if (o.skipped?.has(i)) continue;
    rest += len(i) + plan.items[i]!.gapAfterSec;
  }
  const ci = closingIndex(plan);
  const closingLen =
    ci > planIndex && !o.skipped?.has(ci)
      ? len(ci)
      : ci === planIndex
        ? Math.max(0, len(ci) - positionSec)
        : 0;
  return { remainingSec: rest, timeToCumparsita: Math.max(0, rest - closingLen) };
}

/** `23:42` for a wall-clock instant. */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** `1:07:32` / `7:32` (floor; never negative). */
export function durationLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}
/** `+2:40` late / `−1:10` early; `0:00` within a second. */
export function driftLabel(sec: number): string {
  if (Math.abs(sec) < 1) return "0:00";
  return `${sec > 0 ? "+" : "−"}${durationLabel(Math.abs(sec))}`;
}
