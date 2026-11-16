import { type ComposeDeps, swapTandaOptions } from "./compose";
import { type FavouriteTable, type FloorReaction, favouriteFamilyFactor, tandaFamily } from "./favourites";
import { mergeLearned } from "./learn";
import { type Succession, successionLine, tandaSuccession } from "./succession";
import type { LearnedPreferences, Playlist, Tanda } from "./types";

/**
 * 2026-11 — live adaptation in the Booth: after a tanda's floor reaction (the DJ's Floor full ♥ / OK / Floor emptied,
 * and the room's hearts), the next ADAPT.lookahead unplayed tandas are weighed again — the succession model
 * (succession.ts), the arc's plan and the reaction — against the engine's own alternatives for each chair
 * (swapTandaOptions). When one is clearly better, ONE suggestion comes back for the DJ to apply or keep; nothing changes
 * the room by itself (the Booth applies it through the swap, the rule check and the undo).
 *
 *   emptied  raise the energy over the plan, prefer the floor's favourites and known sides, shorten experimental picks
 *            (fame-0 sides) — the smallest margin
 *   full     keep the line: only a much better succession (a planned summit is never touched: peak chairs are kept)
 *   ok       small corrections only
 *
 * Pure apart from the engine's seeded draws; never at compose time (the golden set is unaffected).
 */
export const ADAPT = {
  /** how many unplayed tandas after the reacted one are weighed */
  lookahead: 3,
  /** the gain an alternative needs, by reaction */
  margin: { emptied: 4, ok: 8, full: 14 } as Record<FloorReaction, number>,
  /** a chair further away needs this much more gain per tanda */
  distance: 1.5,
  /** after an emptied floor the plan's energy is read this much higher */
  lift: 6,
  /** room hearts per song from which the room says "full" when the DJ has not tapped */
  heartsFull: 2,
  draws: 6,
} as const;

export interface FloorSignal {
  reaction?: FloorReaction | null;
  /** the room's hearts on the tanda's songs (distinct dancers, summed) */
  hearts?: number;
}
/** a stable seed for a reaction (the same tap on the same night asks the same draws) */
export const adaptSeed = (p: Pick<Playlist, "options">, after: number, reaction: FloorReaction) =>
  ((p.options?.seed ?? 1) * 31 + after * 101 + (reaction === "emptied" ? 7 : reaction === "ok" ? 3 : 1)) >>>
  0;

/** the reaction the adaptation reads: the DJ's tap, else the room's hearts (≥ heartsFull a song: full), else none */
export function floorMood(sig: FloorSignal, songs = 4): FloorReaction | null {
  if (sig.reaction) return sig.reaction;
  if (sig.hearts !== undefined && sig.hearts >= ADAPT.heartsFull * Math.max(1, songs)) return "full";
  return null;
}

export type AdaptReasonKind = "energy" | "favourite" | "known" | "experimental" | "succession" | "plan";
export interface AdaptReason {
  kind: AdaptReasonKind;
  /** signed: energy points, favourite factor, fame, fame-0 sides, succession points */
  value: number;
  /** the succession line (kind succession) */
  line?: string;
}
export interface AdaptSuggestion {
  /** the tanda the floor reacted to (0-based) and how */
  after: number;
  reaction: FloorReaction;
  /** the chair to change (0-based) */
  index: number;
  from: Pick<Tanda, "orchestra" | "orchestraId" | "singer" | "energy" | "yearRange" | "rhythm">;
  to: Pick<Tanda, "orchestra" | "orchestraId" | "singer" | "energy" | "yearRange" | "rhythm">;
  /** how much better the alternative weighs */
  gain: number;
  /** why, strongest first */
  reasons: AdaptReason[];
  /** the night with the change (re-timed and re-scored by the swap) */
  playlist: Playlist;
}
export interface AdaptOptions {
  seed?: number;
  favourites?: FavouriteTable;
  learned?: LearnedPreferences;
  /** tandas that cannot change (played or playing), 0-based */
  frozen?: number[];
  draws?: number;
}

const pick = (t: Tanda) => ({
  orchestra: t.orchestra,
  orchestraId: t.orchestraId,
  singer: t.singer,
  energy: t.energy,
  yearRange: t.yearRange,
  rhythm: t.rhythm,
});
const fameOf = (t: Tanda) => t.songs.reduce((a, s) => a + (s.fame ?? 0), 0) / Math.max(1, t.songs.length);
const flowOf = (s: { fromPrev: Succession | null; intoNext: Succession | null }) =>
  (s.fromPrev?.points ?? 0) + (s.intoNext?.points ?? 0);

/** a chair's weight after the reaction (higher is better), with its parts */
function weigh(
  q: Playlist,
  k: number,
  mood: FloorReaction,
  o: AdaptOptions,
): { w: number; parts: Record<AdaptReasonKind, number>; flow: ReturnType<typeof tandaSuccession> } {
  const t = q.tandas[k]!;
  const flow = tandaSuccession(q, k, { learned: o.learned });
  const target = t.targetEnergy + (mood === "emptied" ? ADAPT.lift : 0);
  const plan = -0.5 * Math.abs(t.energy - target);
  const fam = o.favourites ? favouriteFamilyFactor(o.favourites, familyOfTanda(t), t.phase, t.yearRange) : 1;
  const fame = fameOf(t);
  const exp = t.songs.filter((s) => !(s.fame ?? 0)).length;
  const parts = {
    succession: flowOf(flow) * (mood === "full" ? 1 : 0.6),
    plan,
    energy: mood === "emptied" ? 0.4 * Math.max(-10, Math.min(12, t.energy - t.targetEnergy)) : 0,
    favourite: (fam - 1) * (mood === "emptied" ? 25 : 10),
    known: fame * (mood === "emptied" ? 3 : 1),
    experimental: -exp * (mood === "emptied" ? 3 : 1),
  };
  return { w: Object.values(parts).reduce((a, b) => a + b, 0), parts, flow };
}
const familyOfTanda = (t: Tanda) => tandaFamily(t).replace(/\|\d*$/, "");

/**
 * the one suggestion after a reaction on tanda `after` (0-based), or null when the plan holds: the next unplayed,
 * unpinned, unlocked, non-summit tandas, each against the engine's alternatives for its chair
 */
export function adaptNext(
  p: Playlist,
  after: number,
  sig: FloorSignal,
  deps: ComposeDeps,
  o: AdaptOptions = {},
): AdaptSuggestion | null {
  const t0 = p.tandas[after];
  if (!t0) return null;
  const mood = floorMood(sig, t0.songs.length);
  if (!mood) return null;
  const L = mergeLearned(deps.catalog.learned, o.learned ?? p.options.learned);
  const oo = { ...o, learned: L };
  const frozen = new Set(o.frozen ?? []);
  let best: AdaptSuggestion | null = null;
  let bestScore = 0;
  for (let k = after + 1; k <= after + ADAPT.lookahead && k < p.tandas.length; k++) {
    const t = p.tandas[k]!;
    // the DJ's tandas, the locked ones, the planned summits and the última keep their chair
    if (frozen.has(k) || t.pinned || t.locked || t.bypass || t.peak || k === p.tandas.length - 1) continue;
    const cur = weigh(p, k, mood, oo);
    const opts = swapTandaOptions(
      p,
      k,
      deps,
      (o.seed ?? adaptSeed(p, after, mood)) + k * 101,
      3,
      o.draws ?? ADAPT.draws,
    );
    for (const q of opts) {
      const nt0 = q.tandas[k]!;
      // after an emptied floor the chair never cools down below what it had (unless it sat over the lifted plan)
      if (mood === "emptied" && nt0.energy < t.energy - 2 && nt0.energy < t.targetEnergy + ADAPT.lift)
        continue;
      const alt = weigh(q, k, mood, oo);
      const gain = alt.w - cur.w;
      const need = ADAPT.margin[mood] + ADAPT.distance * (k - after - 1);
      if (gain < need || gain - need <= bestScore) continue;
      bestScore = gain - need;
      const nt = q.tandas[k]!;
      const reasons: AdaptReason[] = [];
      const de = Math.round(nt.energy - t.energy);
      if (de) reasons.push({ kind: "energy", value: de });
      if (alt.parts.favourite - cur.parts.favourite > 0.5)
        reasons.push({ kind: "favourite", value: Math.round(alt.parts.favourite - cur.parts.favourite) });
      const df = Math.round((fameOf(nt) - fameOf(t)) * 10) / 10;
      if (df >= 0.5) reasons.push({ kind: "known", value: df });
      const dx = nt.songs.filter((s) => !(s.fame ?? 0)).length - t.songs.filter((s) => !(s.fame ?? 0)).length;
      if (dx < 0) reasons.push({ kind: "experimental", value: dx });
      const ds = Math.round(flowOf(alt.flow) - flowOf(cur.flow));
      if (ds > 0 && alt.flow.fromPrev)
        reasons.push({
          kind: "succession",
          value: ds,
          line: successionLine(alt.flow.fromPrev, q.tandas[k - 1]!.orchestra),
        });
      best = {
        after,
        reaction: mood,
        index: k,
        from: pick(t),
        to: pick(nt),
        gain: Math.round(gain * 10) / 10,
        reasons,
        playlist: q,
      };
    }
  }
  return best;
}
