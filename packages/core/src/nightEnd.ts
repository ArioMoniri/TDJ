import { planSlots } from "./arc";
import { attachBooth } from "./booth";
import { bigFourProblems } from "./coherence";
import type { ComposeDeps } from "./compose";
import {
  applyGuideFix,
  editGuide,
  insertTandaOptions,
  removeTanda,
  rhythmCycleFaults,
  slotAt,
} from "./insert";
import { renight } from "./swap";
import type { DanceRhythm, Playlist, Tanda } from "./types";

/**
 * 2026-11 (the owner: "in the Booth it should be able to auto add or remove tandas, with all rules — the last-4-tango
 * setting, La Cumparsita matching and energy — to extend the night by e.g. 20 min or to a specific end time, or to
 * shorten it"). The Booth's clock card: "Change the end…" (+10 / +20 / +30, −10 / −20 min, or "End at HH:MM").
 *
 * Only the unplayed part changes: whole tandas are added or removed after the playing one (`from` is the first tanda
 * that may change), never the última (it keeps its La Cumparsita), never a locked or pinned tanda (the DJ's own, and
 * their one-night exceptions). Each step is the one that keeps the night best: no new rhythm-cycle fault (TTV / TTM),
 * no new big-four fault, the orchestra gaps (the composer's own builder for an added chair), the "last 4 tandas
 * tango only" setting (no vals or milonga pulled into the last four), the smallest energy step at the join. Steps are
 * taken while they bring the end nearer the target; the arc's targets of the unplayed tandas are then re-planned for
 * the new length (summits and the cool-down where the new night puts them), the cortinas follow every insert and
 * removal, and the closing La Cumparsita is matched again when the guide asks.
 */
export interface EndChange {
  playlist: Playlist;
  /** the night's end on its own clock (seconds from the start), before and after */
  endBeforeSec: number;
  endSec: number;
  targetSec: number;
  /** endSec − targetSec (negative: before the target) */
  diffSec: number;
  /** the tanda keys (their sides' ids) added and removed, for the preview's highlights */
  added: string[];
  removed: string[];
  /** what happened, in plain words */
  notes: string[];
}

export const tandaKey = (t: Pick<Tanda, "songs">) => t.songs.map((s) => s.id).join(",");
const endOf = (p: Playlist): number => {
  const b = p.booth ?? attachBooth(p).booth;
  return b?.wallClockSec ?? p.stats?.durationSec ?? 0;
};

/** the faults a step must not add: rhythm cycle, big-four back to back / too soon, non-tango among the last four */
function faults(p: Playlist): [number, number, number] {
  const cyc = rhythmCycleFaults(p.tandas, p.options).length;
  const big = bigFourProblems(p.tandas, p.options).filter(
    (x) => x.kind === "adjacent" || x.kind === "gap",
  ).length;
  const lastFour = p.options.rules?.lastFourTango
    ? p.tandas.slice(-4).filter((t) => t.rhythm !== "tango" && !t.bypass).length
    : 0;
  return [cyc, big, lastFour];
}
const faultCost = (p: Playlist) => {
  const [a, b, c] = faults(p);
  return 100 * a + 60 * b + 100 * c;
};
/** a step adds none of the faults (each kind on its own: one mended never pays for another made) */
const noWorse = (q: Playlist, base: [number, number, number]) => faults(q).every((x, k) => x <= base[k]!);
const joinStep = (p: Playlist, i: number) => {
  const a = p.tandas[i - 1],
    b = p.tandas[i];
  return a && b ? Math.abs(a.energy - b.energy) : 0;
};
const changeable = (t: Tanda) => !t.locked && !t.pinned && !t.birthday;

/** the arc's targets and phases of the unplayed tandas, re-planned for the night's new length */
export function replanArc(p: Playlist, from: number): Playlist {
  const n = p.tandas.length;
  const hours = Math.max(1, endOf(p) / 3600);
  let slots: ReturnType<typeof planSlots> = [];
  try {
    slots = planSlots({ ...p.options, hours });
  } catch {
    return p;
  }
  if (slots.length < 2) return p;
  const tandas = p.tandas.map((t, k) => {
    if (k < from) return t;
    const s = slots[Math.round((k / Math.max(1, n - 1)) * (slots.length - 1))]!;
    return s.targetEnergy ? { ...t, targetEnergy: s.targetEnergy, phase: s.phase } : t;
  });
  try {
    return renight(p, tandas);
  } catch {
    return { ...p, tandas };
  }
}

/** the best tanda to remove at or after `from` (never the última): the fewest new faults, the smallest join */
function bestRemoval(p: Playlist, from: number, deps: ComposeDeps): Playlist | null {
  const n = p.tandas.length;
  const base = faultCost(p);
  const f0 = faults(p);
  let best: { q: Playlist; v: number } | null = null;
  for (let i = Math.max(1, from); i < n - 1; i++) {
    if (!changeable(p.tandas[i]!)) continue;
    const r = removeTanda(p, i, deps);
    if (r.reason || !noWorse(r.playlist, f0)) continue;
    const v = (faultCost(r.playlist) - base) * 10 + joinStep(r.playlist, i) + (p.tandas[i]!.peak ? 25 : 0);
    if (!best || v < best.v) best = { q: r.playlist, v };
  }
  return best?.q ?? null;
}

/** the best tanda to add at or after `from` (before the última): the slot that keeps the cycle, the builder's tanda */
function bestAddition(p: Playlist, from: number, deps: ComposeDeps, seed: number): Playlist | null {
  const n = p.tandas.length;
  const base = faultCost(p);
  const f0 = faults(p);
  const lastFour = !!p.options.rules?.lastFourTango;
  // the places a chair of the slot's rhythm adds no fault, spread across the unplayed part (the middle first)
  const places: Array<{ i: number; rhythm: DanceRhythm; v: number }> = [];
  for (let i = Math.max(1, from); i <= n - 1; i++) {
    let rhythm = slotAt(p, i).rhythm;
    if (lastFour && i >= n - 3) rhythm = "tango";
    const ts = p.tandas.slice();
    ts.splice(i, 0, { rhythm, energy: p.tandas[i]?.energy ?? 60, orchestraId: "" } as Tanda);
    const v = faultCost({ ...p, tandas: ts });
    if (v > base) continue;
    const mid = (Math.max(1, from) + n - 1) / 2;
    places.push({ i, rhythm, v: Math.abs(i - mid) });
  }
  places.sort((a, b) => a.v - b.v);
  let best: { q: Playlist; v: number } | null = null;
  for (const pl of places.slice(0, 3)) {
    const opts = insertTandaOptions(p, pl.i, deps, { n: 1, seed: seed + pl.i, rhythm: pl.rhythm });
    const o = opts[0];
    if (!o || !noWorse(o.playlist, f0)) continue;
    const v = (faultCost(o.playlist) - base) * 10 + o.cost;
    if (!best || v < best.v) best = { q: o.playlist, v };
  }
  return best?.q ?? null;
}

/**
 * Move the night's end toward `targetSec` (seconds on the night's clock) by whole tandas from tanda `from` on.
 * `from` is the first tanda that may change (the one after the playing tanda; 0 before the night starts).
 */
export function changeNightEnd(
  p0: Playlist,
  deps: ComposeDeps,
  opts: { from: number; targetSec: number; seed?: number; maxSteps?: number },
): EndChange {
  const from = Math.max(0, Math.min(opts.from, p0.tandas.length));
  const endBefore = endOf(p0);
  const target = opts.targetSec;
  const notes: string[] = [];
  let p = p0;
  const seed = opts.seed ?? (p0.options.seed ?? 1) + 977;
  const meanLen =
    p0.tandas.reduce((a, t) => a + t.durationSec + (t.cortina?.lengthSec ?? 0), 0) /
    Math.max(1, p0.tandas.length);
  for (let step = 0; step < (opts.maxSteps ?? 12); step++) {
    const end = endOf(p);
    const diff = target - end;
    if (Math.abs(diff) < meanLen / 2) break;
    const q = diff > 0 ? bestAddition(p, from, deps, seed + step * 101) : bestRemoval(p, from, deps);
    if (!q) {
      notes.push(
        diff > 0 ? "no place left to add a tanda without breaking a rule" : "no tanda left to remove",
      );
      break;
    }
    if (Math.abs(target - endOf(q)) >= Math.abs(diff)) break;
    p = q;
  }
  if (p !== p0) {
    // the arc of what is still to play, re-planned for the new length; then the closing matched again
    p = replanArc(p, from);
    for (const g of editGuide(p0, p, deps))
      if ((g.key === "closing" || g.key === "opening") && g.fix && !(g.key === "opening" && from > 0)) {
        const r = applyGuideFix(p, g.fix.fix, deps);
        if (!r.reason) {
          p = r.playlist;
          notes.push(g.text);
        }
      }
  }
  const before = new Set(p0.tandas.map(tandaKey));
  const after = new Set(p.tandas.map(tandaKey));
  const end = endOf(p);
  return {
    playlist: p,
    endBeforeSec: endBefore,
    endSec: end,
    targetSec: target,
    diffSec: Math.round(end - target),
    added: [...after].filter((k) => !before.has(k)),
    removed: [...before].filter((k) => !after.has(k)),
    notes,
  };
}
