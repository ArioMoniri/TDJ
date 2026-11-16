import type { FloorLearned, LearnedPreferences, Tanda } from "./types";

/**
 * 2026-11 — floor learning: the Booth's floor reaction on a tanda (Floor full ♥ / OK / Floor emptied) teaches the
 * succession model a little — the pair into that tanda (its orchestra after the one before) and the energy step it took
 * in its role (warm-up up, peak flat …). Each reaction moves a weight by FLOOR_LEARN's step, inside caps, so one tanda's
 * reaction is a nudge like one praised tanda's ♥, never a rule. Changing or taking back a tap moves the weights back
 * (the reaction each tanda holds is kept). The family weight is the dancer-favourites tracker's (favourites.ts reads
 * the same taps), so it is not counted twice here.
 */
export const FLOOR_LEARN = {
  pair: { full: 0.25, ok: 0, emptied: -0.25 },
  step: { full: 0.2, ok: 0, emptied: -0.2 },
  pairMin: -0.5,
  pairMax: 0.75,
  stepMin: -0.6,
  stepMax: 0.6,
  /** the step buckets: a step of at least this many energy points is "up" / "down" */
  stepBand: 8,
  /** points one unit of step weight adds to the succession's learned part */
  stepPoints: 1.5,
  /** the taps kept (newest) */
  keep: 300,
} as const;
export type FloorReactionKind = keyof typeof FLOOR_LEARN.pair;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
export const emptyFloor = (): FloorLearned => ({ pairs: {}, steps: {}, taps: {} });

/** the step bucket of an energy step */
export const stepBucket = (de: number) =>
  de >= FLOOR_LEARN.stepBand ? "up" : de <= -FLOOR_LEARN.stepBand ? "down" : "flat";
/** the step key of tanda b after tanda a: its role and the bucket of the energy step */
export const stepKey = (a: Pick<Tanda, "energy">, b: Pick<Tanda, "energy" | "phase">) =>
  `${b.phase}|${stepBucket(b.energy - a.energy)}`;

/**
 * fold one floor reaction on tanda `index` of a night into the learned store; `reaction` null takes the tap back. A
 * store with floor learning switched off is returned unchanged.
 */
export function learnFromFloor(
  L: LearnedPreferences | undefined,
  night: { tandas: Array<Pick<Tanda, "orchestraId" | "energy" | "phase">> },
  nightId: string,
  index: number,
  reaction: FloorReactionKind | null,
  at = new Date().toISOString(),
): LearnedPreferences {
  const out: LearnedPreferences = structuredClone(L ?? { sides: {}, families: {} });
  const F: FloorLearned = out.floor ?? emptyFloor();
  if (F.off) return out;
  const key = `${nightId}#${index}`;
  const old = F.taps[key];
  const move = (m: Record<string, number>, k: string | undefined, d: number, lo: number, hi: number) => {
    if (!k || !d) return;
    const v = r2(clamp((m[k] ?? 0) + d, lo, hi));
    if (v === 0) delete m[k];
    else m[k] = v;
  };
  // the tap this tanda held moves back first
  if (old) {
    move(F.pairs, old.pair, -FLOOR_LEARN.pair[old.reaction], FLOOR_LEARN.pairMin, FLOOR_LEARN.pairMax);
    move(F.steps, old.step, -FLOOR_LEARN.step[old.reaction], FLOOR_LEARN.stepMin, FLOOR_LEARN.stepMax);
    delete F.taps[key];
  }
  const t = night.tandas[index];
  const prev = night.tandas[index - 1];
  if (reaction && t) {
    const pair =
      prev && prev.orchestraId !== t.orchestraId ? `${prev.orchestraId}>${t.orchestraId}` : undefined;
    const step = prev ? stepKey(prev, t) : undefined;
    move(F.pairs, pair, FLOOR_LEARN.pair[reaction], FLOOR_LEARN.pairMin, FLOOR_LEARN.pairMax);
    move(F.steps, step, FLOOR_LEARN.step[reaction], FLOOR_LEARN.stepMin, FLOOR_LEARN.stepMax);
    F.taps[key] = { reaction, ...(pair ? { pair } : {}), ...(step ? { step } : {}), at };
    const keys = Object.entries(F.taps).sort((a, b) => b[1].at.localeCompare(a[1].at));
    for (const [k] of keys.slice(FLOOR_LEARN.keep)) delete F.taps[k];
  }
  F.updatedAt = at;
  out.floor = F;
  return out;
}

/** floor learning switched on or off (the weights are kept either way) */
export function setFloorLearning(L: LearnedPreferences | undefined, on: boolean): LearnedPreferences {
  const out: LearnedPreferences = structuredClone(L ?? { sides: {}, families: {} });
  const F: FloorLearned = { ...(out.floor ?? emptyFloor()) };
  if (on) delete F.off;
  else F.off = true;
  out.floor = F;
  return out;
}
export const floorLearningOn = (L: LearnedPreferences | null | undefined) => !L?.floor?.off;

/** the floor's weight of the pair A → B (0 when off or unknown) */
export const floorPairWeight = (L: LearnedPreferences | null | undefined, a: string, b: string) =>
  L?.floor && !L.floor.off ? (L.floor.pairs[`${a}>${b}`] ?? 0) : 0;
/** the floor's weight of an energy step into a role (0 when off or unknown) */
export const floorStepWeight = (L: LearnedPreferences | null | undefined, key: string | undefined) =>
  key && L?.floor && !L.floor.off ? (L.floor.steps[key] ?? 0) : 0;

/** what the floor taught, for Settings → learning (source "floor reactions"): pairs and steps, strongest first */
export function floorLessons(
  L: LearnedPreferences | null | undefined,
): Array<{ kind: "pair" | "step"; key: string; weight: number }> {
  const F = L?.floor;
  if (!F) return [];
  return [
    ...Object.entries(F.pairs).map(([key, weight]) => ({ kind: "pair" as const, key, weight })),
    ...Object.entries(F.steps).map(([key, weight]) => ({ kind: "step" as const, key, weight })),
  ].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.key.localeCompare(b.key));
}
