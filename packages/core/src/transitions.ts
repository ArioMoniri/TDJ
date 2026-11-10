import { cortinaTempo } from "./cortinas";
import { bpmMid, staticProfile } from "./knowledge";
import type { Cortina, DanceRhythm, OrchestraProfile, Tanda } from "./types";

/**
 * Round 13 — transitions between tandas (docs/reviews/round13-transitions.md §2): a pairwise score S(a, b) for two
 * consecutive dance tandas, starting at 100 and subtracting style, energy, era, tempo, vocal, run and cortina terms,
 * plus the hard rules H1–H6. Smooth ≥ 88, fine 72–87, jarring < 72 or any hard rule. The closing Cumparsita is never
 * scored. Pure: profiles come from the caller or from the committed orchestra_profiles.json.
 */
export type StyleClass = "R+" | "R" | "L" | "B" | "D";
export type HardRule = "H1" | "H2" | "H3" | "H4" | "H5" | "H6";

/** the parts of a tanda the model reads (a built Tanda, or a candidate family the composer is weighing) */
export interface TransitionSide {
  orchestraId: string;
  style?: string;
  rhythm: DanceRhythm | string;
  vocal: boolean;
  energy: number;
  targetEnergy: number;
  phase?: string;
  peak?: boolean;
  meanYear: number | null;
  /** the cue played after this tanda (into the next one) */
  cortina?: Cortina | null;
}
export type ProfileOf = (id: string) => Pick<OrchestraProfile, "drive" | "bpm" | "style"> | undefined;

/** cls(t): R+ (a hard-driving rhythmic orchestra: profile drive "hard"), R, L, B, D from the tanda's own style */
export function styleClass(
  t: Pick<TransitionSide, "style" | "orchestraId">,
  profileOf: ProfileOf = staticProfile,
): StyleClass {
  const st = t.style ?? profileOf(t.orchestraId)?.style ?? "balanced";
  if (st === "dramatic") return "D";
  if (st === "lyrical") return "L";
  if (st === "rhythmic" || st === "guardia") return profileOf(t.orchestraId)?.drive === "hard" ? "R+" : "R";
  return "B";
}
/** the style matrix, tango → tango, from row to column (transitions review §2.2) */
const MATRIX: Record<StyleClass, Record<StyleClass, number>> = {
  "R+": { "R+": 10, R: 2, L: 0, B: 0, D: 12 },
  R: { "R+": 2, R: 6, L: 0, B: 0, D: 10 },
  L: { "R+": 0, R: 0, L: 10, B: 2, D: 4 },
  B: { "R+": 0, R: 0, L: 2, B: 6, D: 4 },
  D: { "R+": 0, R: 6, L: 15, B: 6, D: 40 },
};

export const meanYearOf = (t: Pick<Tanda, "songs">): number | null => {
  const ys = t.songs.map((s) => (s.year && !s.yearApprox ? s.year : null)).filter((y): y is number => !!y);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
};
export const sideOf = (t: Tanda): TransitionSide => ({
  orchestraId: t.orchestraId,
  style: t.style,
  rhythm: t.rhythm,
  vocal: t.vocal,
  energy: t.energy,
  targetEnergy: t.targetEnergy,
  phase: t.phase,
  peak: t.peak,
  meanYear: meanYearOf(t),
  cortina: t.cortina,
});

/** a bridge cue: medium or slow, and its energy between the two tandas (down to 10 under the cooler one) */
export function isBridge(
  cue: Cortina | null | undefined,
  a: { energy: number },
  b: { energy: number },
): boolean {
  if (!cue) return false;
  const tempo = cortinaTempo(cue);
  if (tempo !== "medium" && tempo !== "slow") return false;
  return cue.energy >= Math.min(a.energy, b.energy) - 10 && cue.energy <= Math.max(a.energy, b.energy);
}

export interface PairContext {
  /** the tanda before `a` (style runs) */
  before?: TransitionSide | null;
  /** vocal flags of the tango tandas before `b`, oldest first (`a` included when it is a tango) */
  tangoVocals?: boolean[];
  /** the cue between a and b; undefined = not chosen yet (the cortina term is left out) */
  cue?: Cortina | null;
  profileOf?: ProfileOf;
}
export interface PairScore {
  score: number;
  why: string[];
  hard: HardRule[];
}

/** S(a, b): 100 minus the penalties of §2.2, with the hard rules this boundary breaks (H2 is judged per night) */
export function pairScore(a: TransitionSide, b: TransitionSide, ctx: PairContext = {}): PairScore {
  const pf = ctx.profileOf ?? staticProfile;
  const ca = styleClass(a, pf);
  const cb = styleClass(b, pf);
  const vmA = a.rhythm !== "tango";
  const vmB = b.rhythm !== "tango";
  const why: string[] = [];
  const hard: HardRule[] = [];
  let pen = 0;
  const take = (v: number, label: string) => {
    if (v > 0.05) {
      pen += v;
      why.push(`${label} −${Math.round(v)}`);
    }
  };
  // style pair
  let ps = MATRIX[ca][cb];
  if ((vmA || vmB) && ca !== "D" && cb !== "D") ps *= 0.5;
  if (ca === "D" && vmB) ps = 0;
  if (ca === "L" && cb === "L" && !vmA && !vmB && (a.phase === "peak" || b.phase === "peak")) ps += 10;
  take(ps, `style ${ca}${vmA ? "V" : "T"}>${cb}${vmB ? "V" : "T"}`);
  // energy
  const de = b.energy - a.energy;
  const dt = b.targetEnergy - a.targetEnergy;
  const j = Math.abs(de - dt);
  take(
    Math.min(36, 2 * Math.max(0, j - 8)) + 0.5 * Math.max(0, Math.abs(de) - 18),
    `energy ${de > 0 ? "+" : ""}${de} (plan ${dt > 0 ? "+" : ""}${dt})`,
  );
  // era
  const d = a.meanYear !== null && b.meanYear !== null ? Math.abs(a.meanYear - b.meanYear) : 0;
  let py = d <= 3 ? 0 : d <= 6 ? 2.5 * (d - 3) : 7.5 + 5 * (d - 6);
  const bridge = ctx.cue !== undefined && isBridge(ctx.cue, a, b);
  if (bridge) py /= 2;
  if (vmA || vmB) py /= 2;
  if (cb === "D" && (ca === "R" || ca === "R+") && a.meanYear !== null && a.meanYear <= 1939) py += 8;
  take(py, `era ${Math.round(a.meanYear ?? 0)}>${Math.round(b.meanYear ?? 0)}${bridge ? " bridged" : ""}`);
  // tempo (tango → tango)
  if (!vmA && !vmB) {
    const ba = bpmMid(pf(a.orchestraId), "tango");
    const bb = bpmMid(pf(b.orchestraId), "tango");
    if (ba !== undefined && bb !== undefined)
      take(0.6 * Math.max(0, Math.abs(ba - bb) - 10), `tempo ${Math.round(ba)}>${Math.round(bb)}`);
  }
  // vocal
  if (!vmA && !vmB && a.vocal === b.vocal) take(4, `voc same ${b.vocal ? "V" : "I"}`);
  const tv = ctx.tangoVocals ?? [];
  if (!vmB && b.vocal && tv.length >= 2 && tv[tv.length - 1] && tv[tv.length - 2]) take(8, "3 vocal tangos");
  // style run
  if (ctx.before && styleClass(ctx.before, pf) === ca && ca === cb) take(12, `3x ${ca}`);
  // cortina
  if (ctx.cue) {
    const tempo = cortinaTempo(ctx.cue);
    let pc = 0.4 * Math.max(0, Math.abs(ctx.cue.energy - (b.energy - 8)) - 12);
    if (tempo === "slow" && b.energy >= 75 && cb !== "D") pc += 6;
    if (tempo === "up" && cb === "D") pc += 4;
    take(pc, `cue e${ctx.cue.energy} ${tempo}`);
  }
  // hard rules
  if (a.style === "dramatic" && b.style === "dramatic") hard.push("H1");
  if (Math.abs(de) > 25 || (Math.abs(de) >= 15 && Math.abs(de - dt) > 18)) hard.push("H3");
  if (d > 9 || (!vmA && !vmB && d > 6 && ctx.cue !== undefined && !bridge)) hard.push("H4");
  if (!vmB && !b.vocal && tv.length >= 2 && !tv[tv.length - 1] && !tv[tv.length - 2]) hard.push("H5");
  if (a.style === "dramatic" && !vmB && b.style === "lyrical") hard.push("H6");
  return { score: Math.round(Math.max(0, 100 - pen) * 10) / 10, why, hard };
}

export interface BoundaryGrade extends PairScore {
  /** index of the tanda the transition leaves (a); b = from + 1 */
  from: number;
  grade: "smooth" | "fine" | "jarring";
}
export interface NightTransitions {
  pairs: BoundaryGrade[];
  mean: number;
  min: number;
  smooth: number;
  fine: number;
  jarring: number;
  /** hits per hard rule (H2: triples beyond the one allowed, or any touching a peak) */
  hard: Record<HardRule, number>;
  /** the structural sub-score (style, era, tempo, vocal, run: no energy and no cortina), the reference-set band */
  structural: number;
}

/** every boundary of a night graded with the pairwise model (the closing Cumparsita is not scored) */
export function nightTransitions(tandas: Tanda[], profileOf: ProfileOf = staticProfile): NightTransitions {
  const sides = tandas.map(sideOf);
  const pairs: BoundaryGrade[] = [];
  const hard: Record<HardRule, number> = { H1: 0, H2: 0, H3: 0, H4: 0, H5: 0, H6: 0 };
  const tangoVocals: boolean[] = [];
  let structural = 0;
  // H2: same-class triples; one is allowed per night, none touching a peak slot
  const triples: number[] = [];
  for (let i = 1; i + 1 < sides.length; i++) {
    const c = styleClass(sides[i]!, profileOf);
    if (styleClass(sides[i - 1]!, profileOf) === c && styleClass(sides[i + 1]!, profileOf) === c)
      triples.push(i);
  }
  const touchesPeak = (i: number) =>
    [i - 1, i, i + 1].some((k) => tandas[k]?.phase === "peak" || tandas[k]?.peak);
  const h2At = new Set(triples.filter((i, k) => k >= 1 || touchesPeak(i)).map((i) => i));
  for (let i = 0; i + 1 < sides.length; i++) {
    const a = sides[i]!;
    const b = sides[i + 1]!;
    if (a.rhythm === "tango") tangoVocals.push(a.vocal);
    const ps = pairScore(a, b, {
      before: i > 0 ? sides[i - 1] : null,
      tangoVocals,
      cue: a.cortina ?? null,
      profileOf,
    });
    const hr = ps.hard.slice();
    if (h2At.has(i)) hr.push("H2");
    for (const h of hr) hard[h]++;
    const st = pairScore(
      { ...a, energy: 0, targetEnergy: 0, cortina: null },
      { ...b, energy: 0, targetEnergy: 0, cortina: null },
      { before: i > 0 ? sides[i - 1] : null, tangoVocals, profileOf },
    );
    structural += st.score;
    pairs.push({
      ...ps,
      hard: hr,
      from: i,
      grade: hr.length || ps.score < 72 ? "jarring" : ps.score >= 88 ? "smooth" : "fine",
    });
  }
  const n = pairs.length || 1;
  return {
    pairs,
    mean: Math.round((pairs.reduce((x, p) => x + p.score, 0) / n) * 10) / 10,
    min: pairs.length ? Math.min(...pairs.map((p) => p.score)) : 100,
    smooth: pairs.filter((p) => p.grade === "smooth").length,
    fine: pairs.filter((p) => p.grade === "fine").length,
    jarring: pairs.filter((p) => p.grade === "jarring").length,
    hard,
    structural: Math.round((structural / n) * 10) / 10,
  };
}
