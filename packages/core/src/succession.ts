import SUCC from "../../../data/knowledge/succession.json";
import { sideBpm } from "./coherence";
import { normTitle } from "./energy";
import { FLOOR_LEARN, floorPairWeight, floorStepWeight, stepKey } from "./floor";
import { bpmMid, staticProfile } from "./knowledge";
import { BIG_FOUR_SHORT } from "./nightShape";
import { type ProfileOf, type StyleClass, styleClass } from "./transitions";
import type { DanceRhythm, LearnedPreferences, Phase, Playlist, Song, Tanda } from "./types";

/**
 * 2026-11 — the succession model: how well tanda B follows tanda A (docs/MUSICALITY.md "Succession"). Data-driven and
 * explainable: every part is a number of points with what it read, and the sum maps to −1 … +1.
 *
 *   energy   A's closing side against B's opening side, judged against the step the arc planned (B's target − A's)
 *   style    tango → tango: rhythmic ↔ lyrical / dramatic alternation (succession_curated.json styleMatrix), plus the
 *            corpus lift of that class pair (how much more often DJs play it than chance)
 *   era      the recording-sound jump between the two tandas' mean years (guardia → 1950s is a big jump)
 *   voice    the singers' voice classes (two light high tenors back to back tire the ear; a contrast helps)
 *   tempo    the step in BPM (measured tempo, else the orchestra profile's band), same rhythm only
 *   key      the Camelot distance and the brightness jump, where both sides were analysed
 *   lineage  two orchestras of one sound family back to back read as the same orchestra again
 *   corpus   what DJs do: the smoothed lift of A → B among the transitions mined from public DJ sets
 *            (scripts/build_succession.ts), with the raw count
 *   learned  the DJ's own edits and praise (learn.ts pairs), inside caps
 *
 * Pure: the data is the committed data/knowledge/succession.json; no orchestra is named in code.
 */
export type SuccessionKind =
  | "energy"
  | "style"
  | "era"
  | "voice"
  | "tempo"
  | "key"
  | "lineage"
  | "corpus"
  | "learned";
export interface SuccessionPart {
  kind: SuccessionKind;
  /** signed points (positive = follows well) */
  points: number;
  /** what the part read, for the explanation (numbers and short codes) */
  detail: Record<string, string | number>;
}
export type SuccessionVerdict = "good" | "ok" | "warn";
/** the one-line warning a part may raise */
export type SuccessionWarning =
  | "two_rhythmic"
  | "two_dramatic"
  | "two_lyrical"
  | "energy_jump"
  | "era_jump"
  | "same_voice"
  | "same_singer"
  | "same_lineage"
  | "rare_in_sets";
export interface Succession {
  /** −1 … +1 */
  score: number;
  /** the sum of the parts' points */
  points: number;
  verdict: SuccessionVerdict;
  parts: SuccessionPart[];
  warning?: SuccessionWarning;
  /** two big-four orchestras back to back (compose leaves their style and corpus bonuses to the big-four rule) */
  bigFour?: boolean;
}
/** the parts of a tanda the model reads (a built Tanda, or a candidate family the composer is weighing) */
export interface SuccessionSide {
  orchestraId: string;
  singer: string | null;
  rhythm: DanceRhythm | string;
  vocal: boolean;
  style?: string;
  /** the tanda's mean energy */
  energy: number;
  /** its first and last side's energy (the mean when unknown) */
  energyOpen?: number;
  energyClose?: number;
  targetEnergy?: number;
  /** the slot's role (the floor's step weights are kept per role) */
  phase?: string;
  meanYear: number | null;
  /** measured tempo (median of the sides that have one) */
  bpm?: number;
  /** the first and the last side's analysed key and brightness */
  open?: { camelot?: string; brightnessHz?: number };
  close?: { camelot?: string; brightnessHz?: number };
}
export interface SuccessionContext {
  learned?: LearnedPreferences | null;
  profileOf?: ProfileOf;
}

type Count = [number, number];
interface Curated {
  points: {
    scale: number;
    energy: { fit: number; slack: number; perPoint: number; min: number };
    era: {
      near: number;
      slack: number;
      perYear: number;
      min: number;
      bigJump: number;
      guardiaUntil: number;
      lateFrom: number;
      vmFactor: number;
    };
    voice: { same: Record<string, number>; contrast: number; sameSinger: number };
    tempo: { near: number; slack: number; perBpm: number; min: number };
    key: { near: number; far: number; brightJumpHz: number; bright: number };
    lineage: number;
    corpus: {
      alpha: number;
      minOut: number;
      perLog2: number;
      min: number;
      max: number;
      familyPerCount: number;
      familyMax: number;
      common: number;
    };
    styleLift: { perLog2: number; max: number };
    learned: { perPoint: number; min: number; max: number };
    good: number;
    warn: number;
  };
  styleMatrix: Record<string, Record<string, number> | string>;
  voices: Record<string, string[]>;
  lineages: Record<string, string[] | string>;
}
export interface SuccessionData {
  totals: { transitions: Count; tango: Count };
  orchestras: Record<string, { out: Count; in: Count }>;
  pairs: Record<string, Count>;
  families: Record<string, Count>;
  styles: Record<string, Count>;
  styleTotals: Record<string, { out: Count; in: Count }>;
  sources: {
    referenceSets: { sets: number; transitions: number };
    setlists: { sets: number; transitions: number };
  };
  curated: Curated;
}
export const SUCCESSION = SUCC as unknown as SuccessionData;
const C = SUCCESSION.curated;
const P = C.points;

/** the share of the compose weight the succession takes: w × exp(SUCCESSION_WEIGHT × points of COMPOSE_KINDS) */
export const SUCCESSION_WEIGHT = 0.03;
/**
 * the parts compose weighs: the ones the round-13 pairScore (transitions.ts) does not already carry — it scores the
 * energy step, the era and the tempo, and penalises same-class runs — so the night's arc is not counted twice
 */
export const COMPOSE_KINDS: ReadonlySet<SuccessionKind> = new Set([
  "style",
  "voice",
  "lineage",
  "corpus",
  "learned",
  "key",
]);
/** the learned pair weights (learn.ts): a pair the DJ chose +1, one they replaced −0.5, inside these limits */
export const PAIR_LIMITS = { min: -1, max: 3 } as const;
/** one praised tanda is one ♥ for the pair into it and out of it, never a rule: +0.25, at most +0.5 a pair */
export const PRAISE_PAIR = { each: 0.25, max: 0.5 } as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const surname = (s: string) => normTitle(s).split(/\s+/).pop() ?? "";
const firstSinger = (s: string | null | undefined) =>
  s ? (s.split(/\s*(?:-|·|&|\/| y )\s*/)[0] ?? "").trim() : "";

const VOICE = (() => {
  const full = new Map<string, string>();
  const last = new Map<string, Set<string>>();
  for (const [cls, names] of Object.entries(C.voices)) {
    if (!Array.isArray(names)) continue;
    for (const n of names) {
      full.set(normTitle(n), cls);
      const l = surname(n);
      last.set(l, (last.get(l) ?? new Set()).add(cls));
    }
  }
  return { full, last };
})();
/** a singer's voice class (succession_curated.json voices), by full name, else by a surname only one class holds */
export function voiceOf(singer: string | null | undefined): string | undefined {
  const s = firstSinger(singer);
  if (!s) return undefined;
  const hit = VOICE.full.get(normTitle(s));
  if (hit) return hit;
  const l = VOICE.last.get(surname(s));
  return l && l.size === 1 ? [...l][0] : undefined;
}
const LINEAGE = (() => {
  const m = new Map<string, string>();
  for (const [k, ids] of Object.entries(C.lineages))
    if (Array.isArray(ids)) for (const id of ids) m.set(id, k);
  return m;
})();
export const lineageOf = (orchestraId: string) => LINEAGE.get(orchestraId);

const famKey = (s: Pick<SuccessionSide, "orchestraId" | "singer" | "vocal">) =>
  `${s.orchestraId}|${s.vocal ? normTitle(firstSinger(s.singer)) : ""}`;
/** the corpus counts for A → B: raw count, the family pair's raw count, the smoothed lift (undefined: too little data) */
export function corpusOf(a: string, b: string, fa?: string, fb?: string) {
  const D = SUCCESSION;
  const total = D.totals.transitions[1];
  const outA = D.orchestras[a]?.out[1] ?? 0;
  const inB = D.orchestras[b]?.in[1] ?? 0;
  const c = D.pairs[`${a}>${b}`] ?? [0, 0];
  const fam = fa && fb ? (D.families[`${fa}>${fb}`]?.[0] ?? 0) : 0;
  if (outA < P.corpus.minOut || total <= 0) return { count: c[0], family: fam, lift: undefined };
  const pb = Math.max(inB, 0.5) / total;
  const lift = (c[1] + P.corpus.alpha * pb) / (outA + P.corpus.alpha) / pb;
  return { count: c[0], family: fam, lift };
}

const CAMELOT = /^(\d{1,2})([AB])$/;
function camelotDistance(x?: string, y?: string): number | undefined {
  const a = x ? CAMELOT.exec(x) : null;
  const b = y ? CAMELOT.exec(y) : null;
  if (!a || !b) return undefined;
  const d = Math.abs(Number(a[1]) - Number(b[1])) % 12;
  return Math.min(d, 12 - d) + (a[2] === b[2] ? 0 : 1);
}

/** the learned weight of the pair A → B: the DJ's edits plus the praised tandas' ♥ (capped) */
export function learnedPairWeight(
  L: LearnedPreferences | null | undefined,
  a: string,
  b: string,
): number | undefined {
  if (!L) return undefined;
  const edit = L.pairs?.[`${a}>${b}`];
  let praise = 0;
  for (const p of L.praise ?? []) {
    const me = p.family?.split("|")[0];
    if (!me) continue;
    if (me === b && p.prevFamily?.split("|")[0] === a) praise += PRAISE_PAIR.each;
    if (me === a && p.nextFamily?.split("|")[0] === b) praise += PRAISE_PAIR.each;
  }
  praise = Math.min(PRAISE_PAIR.max, praise);
  if (edit === undefined && !praise) return undefined;
  return Math.round(clamp((edit ?? 0) + praise, PAIR_LIMITS.min, PAIR_LIMITS.max) * 100) / 100;
}

const RHYTHMIC = (k: StyleClass) => k === "R" || k === "R+";

/** S(A → B): the succession parts, their sum, −1 … +1, the verdict and the warning (if any) */
export function succession(a: SuccessionSide, b: SuccessionSide, ctx: SuccessionContext = {}): Succession {
  const pf = ctx.profileOf ?? staticProfile;
  const parts: SuccessionPart[] = [];
  const add = (kind: SuccessionKind, points: number, detail: SuccessionPart["detail"]) =>
    parts.push({ kind, points: r1(points), detail });
  const vm = a.rhythm !== "tango" || b.rhythm !== "tango";
  // energy: A's last side → B's first side against the arc's planned step
  {
    const de = Math.round((b.energyOpen ?? b.energy) - (a.energyClose ?? a.energy));
    const dt =
      a.targetEnergy !== undefined && b.targetEnergy !== undefined
        ? Math.round(b.targetEnergy - a.targetEnergy)
        : 0;
    const miss = Math.abs(de - dt);
    const pts =
      miss <= P.energy.slack
        ? P.energy.fit
        : Math.max(P.energy.min, P.energy.fit - P.energy.perPoint * (miss - P.energy.slack));
    add("energy", pts, { step: de, plan: dt });
  }
  // style (tango → tango)
  let sameKindRun = false;
  if (!vm) {
    const ca = styleClass(a, pf);
    const cb = styleClass(b, pf);
    const row = C.styleMatrix[ca];
    let pts = typeof row === "object" ? (row[cb] ?? 0) : 0;
    sameKindRun = pts < 0;
    const c = SUCCESSION.styles[`${ca}>${cb}`];
    const outA = SUCCESSION.styleTotals[ca]?.out[1] ?? 0;
    const inB = SUCCESSION.styleTotals[cb]?.in[1] ?? 0;
    const tot = SUCCESSION.totals.tango[1];
    let lift: number | undefined;
    if (c && outA >= 5 && inB > 0 && tot > 0) {
      lift = c[1] / outA / (inB / tot);
      pts += clamp(P.styleLift.perLog2 * Math.log2(lift), -P.styleLift.max, P.styleLift.max);
    }
    add("style", pts, {
      from: ca,
      to: cb,
      count: c?.[0] ?? 0,
      ...(lift !== undefined ? { lift: r1(lift) } : {}),
    });
  }
  // era: the recording sound
  if (a.meanYear !== null && b.meanYear !== null) {
    const d = Math.abs(a.meanYear - b.meanYear);
    let pts = d <= P.era.slack ? P.era.near : Math.max(P.era.min, -P.era.perYear * (d - P.era.slack));
    const lo = Math.min(a.meanYear, b.meanYear);
    const hi = Math.max(a.meanYear, b.meanYear);
    const big = lo <= P.era.guardiaUntil && hi >= P.era.lateFrom;
    if (big) pts += P.era.bigJump;
    if (vm && pts < 0) pts *= P.era.vmFactor;
    add("era", pts, { from: Math.round(a.meanYear), to: Math.round(b.meanYear), ...(big ? { big: 1 } : {}) });
  }
  // voice
  if (a.vocal && b.vocal && a.singer && b.singer) {
    const sa = firstSinger(a.singer);
    const sb = firstSinger(b.singer);
    if (surname(sa) && surname(sa) === surname(sb))
      add("voice", P.voice.sameSinger, { voice: "same", singer: sb });
    else {
      const va = voiceOf(sa);
      const vb = voiceOf(sb);
      if (va && vb)
        add("voice", va === vb ? (P.voice.same[va] ?? 0) : P.voice.contrast, { from: va, to: vb });
    }
  }
  // tempo (same rhythm)
  if (a.rhythm === b.rhythm) {
    const r = a.rhythm as DanceRhythm;
    const ba = a.bpm ?? bpmMid(pf(a.orchestraId), r);
    const bb = b.bpm ?? bpmMid(pf(b.orchestraId), r);
    if (ba !== undefined && bb !== undefined) {
      const d = Math.abs(ba - bb);
      add(
        "tempo",
        d <= P.tempo.slack ? P.tempo.near : Math.max(P.tempo.min, -P.tempo.perBpm * (d - P.tempo.slack)),
        {
          from: Math.round(ba),
          to: Math.round(bb),
        },
      );
    }
  }
  // key and brightness (analysed audio on both sides of the cortina)
  {
    const kd = camelotDistance(a.close?.camelot, b.open?.camelot);
    let pts = 0;
    const detail: SuccessionPart["detail"] = {};
    if (kd !== undefined) {
      pts += kd <= 1 ? P.key.near : kd >= 3 ? P.key.far : 0;
      detail.keys = `${a.close!.camelot}>${b.open!.camelot}`;
    }
    const ba = a.close?.brightnessHz;
    const bb = b.open?.brightnessHz;
    if (ba !== undefined && bb !== undefined) {
      if (Math.abs(ba - bb) > P.key.brightJumpHz) pts += P.key.bright;
      detail.bright = Math.round(bb - ba);
    }
    if (Object.keys(detail).length) add("key", pts, detail);
  }
  // sound family
  if (a.orchestraId !== b.orchestraId) {
    const la = lineageOf(a.orchestraId);
    if (la && la === lineageOf(b.orchestraId)) add("lineage", P.lineage, { lineage: la });
  }
  // what DJs do
  if (a.orchestraId !== b.orchestraId) {
    const c = corpusOf(a.orchestraId, b.orchestraId, famKey(a), famKey(b));
    if (c.lift !== undefined) {
      let pts = clamp(P.corpus.perLog2 * Math.log2(c.lift), P.corpus.min, P.corpus.max);
      if (c.family >= 2) pts += Math.min(P.corpus.familyMax, P.corpus.familyPerCount * c.family);
      // (what DJs do never excuses a run the style rules advise against: two rhythmic, two lyrical, two dramatic in a
      // row — some set lists play D'Arienzo-school orchestras back to back; the strict panel does not)
      if (sameKindRun) pts = Math.min(0, pts);
      add("corpus", pts, { count: c.count, family: c.family, lift: r1(c.lift) });
    }
  }
  // the DJ's own edits and praise
  // (and the floor's reactions, floor.ts: the pair into a tanda and the energy step into its role — small nudges)
  const lw = learnedPairWeight(ctx.learned, a.orchestraId, b.orchestraId) ?? 0;
  const fw = a.orchestraId !== b.orchestraId ? floorPairWeight(ctx.learned, a.orchestraId, b.orchestraId) : 0;
  const sw = b.phase
    ? floorStepWeight(ctx.learned, stepKey(a, { energy: b.energy, phase: b.phase as Phase }))
    : 0;
  if (lw || fw || sw)
    add(
      "learned",
      clamp(P.learned.perPoint * (lw + fw) + FLOOR_LEARN.stepPoints * sw, P.learned.min, P.learned.max),
      { weight: r1(lw + fw), ...(fw ? { floor: fw } : {}), ...(sw ? { step: sw } : {}) },
    );

  const points = r1(parts.reduce((x, p) => x + p.points, 0));
  const verdict: SuccessionVerdict = points >= P.good ? "good" : points <= P.warn ? "warn" : "ok";
  const out: Succession = {
    score: Math.round(Math.tanh(points / P.scale) * 100) / 100,
    points,
    verdict,
    parts,
  };
  // two of the big four back to back (night_shape.json): the big-four spread rule decides that pair, so compose
  // leaves the style and corpus bonuses out of it (composePoints); the explanation still shows them
  if (a.orchestraId in BIG_FOUR_SHORT && b.orchestraId in BIG_FOUR_SHORT && a.orchestraId !== b.orchestraId)
    out.bigFour = true;
  const w = warningOf(parts);
  if (w) out.warning = w;
  return out;
}

/** the warning the worst part raises, when it is bad enough to say */
function warningOf(parts: SuccessionPart[]): SuccessionWarning | undefined {
  const worst = [...parts].sort((x, y) => x.points - y.points)[0];
  if (!worst || worst.points > -3) return undefined;
  switch (worst.kind) {
    case "style": {
      const ca = worst.detail.from as StyleClass;
      const cb = worst.detail.to as StyleClass;
      if (ca === "D" && cb === "D") return "two_dramatic";
      if (RHYTHMIC(ca) && RHYTHMIC(cb)) return "two_rhythmic";
      if (ca === "L" && cb === "L") return "two_lyrical";
      return undefined;
    }
    case "energy":
      return "energy_jump";
    case "era":
      return "era_jump";
    case "voice":
      return worst.detail.voice === "same" ? "same_singer" : "same_voice";
    case "lineage":
      return "same_lineage";
    case "corpus":
      return "rare_in_sets";
    default:
      return undefined;
  }
}

/** the points compose weighs (COMPOSE_KINDS) */
export const composePoints = (s: Succession) =>
  s.parts.reduce(
    (x, p) =>
      x +
      (!COMPOSE_KINDS.has(p.kind)
        ? 0
        : s.bigFour && (p.kind === "corpus" || p.kind === "style")
          ? Math.min(0, p.points)
          : p.points),
    s.bigFour ? -BIG_FOUR_PAIR : 0,
  );
/** compose's points against two big-four orchestras back to back (the owner's spread rule, coherence.ts bigFour) */
export const BIG_FOUR_PAIR = 4;
/** the compose factor of a succession: exp(SUCCESSION_WEIGHT × compose points) */
export const successionFactor = (s: Succession | null | undefined) =>
  s ? Math.exp(SUCCESSION_WEIGHT * composePoints(s)) : 1;

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const audioOf = (s: Song | undefined) =>
  s?.audio ? { camelot: s.audio.camelot, brightnessHz: s.audio.brightnessHz } : undefined;
/** a set of sides (a tanda, or a candidate family's sides) as the model reads it */
export function successionSideOfSongs(
  songs: Song[],
  base: Pick<SuccessionSide, "orchestraId" | "singer" | "rhythm" | "vocal"> &
    Partial<Pick<SuccessionSide, "style" | "targetEnergy" | "energy" | "phase">>,
): SuccessionSide {
  const es = songs.map((s) => s.energy ?? 50);
  const ys = songs.map((s) => (s.year && !s.yearApprox ? s.year : null)).filter((y): y is number => !!y);
  const bpm = median(
    songs.map((s) => sideBpm(s, String(base.rhythm))).filter((x): x is number => x !== null),
  );
  const mean = es.length ? es.reduce((x, y) => x + y, 0) / es.length : (base.energy ?? 50);
  return {
    ...base,
    energy: base.energy ?? mean,
    energyOpen: es[0] ?? mean,
    energyClose: es[es.length - 1] ?? mean,
    meanYear: ys.length ? ys.reduce((x, y) => x + y, 0) / ys.length : null,
    ...(bpm !== undefined ? { bpm } : {}),
    ...(audioOf(songs[0]) ? { open: audioOf(songs[0]) } : {}),
    ...(audioOf(songs[songs.length - 1]) ? { close: audioOf(songs[songs.length - 1]) } : {}),
  };
}
/** a built tanda as the model reads it (its energy curve, in the order it plays) */
export function successionSide(t: Tanda): SuccessionSide {
  const s = successionSideOfSongs(t.songs, {
    orchestraId: t.orchestraId,
    singer: t.singer,
    rhythm: t.rhythm,
    vocal: t.vocal,
    ...(t.style ? { style: t.style } : {}),
    targetEnergy: t.targetEnergy,
    energy: t.energy,
  });
  s.phase = t.phase;
  const c = t.energyCurve?.length ? t.energyCurve : null;
  return c ? { ...s, energyOpen: c[0]!, energyClose: c[c.length - 1]! } : s;
}

/** the succession into tanda i (from i − 1) and out of it (into i + 1); the closing Cumparsita is never judged */
export function tandaSuccession(
  p: Pick<Playlist, "tandas">,
  i: number,
  ctx: SuccessionContext = {},
): { fromPrev: Succession | null; intoNext: Succession | null } {
  const t = p.tandas[i];
  if (!t) return { fromPrev: null, intoNext: null };
  const me = successionSide(t);
  const prev = p.tandas[i - 1];
  const next = p.tandas[i + 1];
  return {
    fromPrev: prev ? succession(successionSide(prev), me, ctx) : null,
    intoNext: next ? succession(me, successionSide(next), ctx) : null,
  };
}

/** the parts worth saying, best (or worst) first: at most `n`, the ones that move the verdict */
export function successionHighlights(s: Succession, n = 3): SuccessionPart[] {
  const sign = s.verdict === "warn" ? -1 : 1;
  return s.parts
    .filter((p) => p.points * sign > 0.5)
    .sort((x, y) => sign * (y.points - x.points))
    .slice(0, n);
}

const CLASS_WORD: Record<string, string> = {
  "R+": "driving",
  R: "rhythmic",
  L: "lyrical",
  B: "balanced",
  D: "dramatic",
};
const WARN_WORD: Record<SuccessionWarning, string> = {
  two_rhythmic: "Two rhythmic tandas in a row",
  two_dramatic: "Two dramatic tandas in a row",
  two_lyrical: "Two lyrical tandas in a row",
  energy_jump: "Energy jump against the plan",
  era_jump: "A big jump in recording sound",
  same_voice: "Two similar voices back to back",
  same_singer: "The same singer back to back",
  same_lineage: "Two orchestras of one sound back to back",
  rare_in_sets: "Rare in DJ sets",
};
/** one part in English (the CLI, the suggestions' reasons, the AI prompts; the web app has its own en / tr words) */
export function partPhrase(p: SuccessionPart): string {
  const d = p.detail;
  const sg = (x: number) => `${x > 0 ? "+" : ""}${x}`;
  switch (p.kind) {
    case "energy":
      return `energy ${sg(Number(d.step))}${Number(d.plan) ? ` (plan ${sg(Number(d.plan))})` : ""}`;
    case "style":
      return `${CLASS_WORD[String(d.to)] ?? d.to} after ${CLASS_WORD[String(d.from)] ?? d.from}`;
    case "era":
      return `${d.from} → ${d.to}`;
    case "voice":
      return d.voice === "same"
        ? "the same singer"
        : `${String(d.to).replace("-", " ")} after ${String(d.from).replace("-", " ")}`;
    case "tempo":
      return `${d.from} → ${d.to} bpm`;
    case "key":
      return d.keys ? `key ${String(d.keys).replace(">", " → ")}` : "brightness";
    case "lineage":
      return "one sound family";
    case "corpus":
      return Number(d.count) ? `common in DJ sets (${d.count}×)` : "rare in DJ sets";
    case "learned":
      if (d.floor !== undefined && Math.abs(Number(d.floor)) >= Math.abs(Number(d.weight) - Number(d.floor)))
        return Number(d.floor) > 0 ? "the floor filled after this pair" : "the floor emptied after this pair";
      if (!Number(d.weight) && d.step !== undefined)
        return Number(d.step) > 0
          ? "the floor liked this energy step here"
          : "the floor left at this energy step here";
      return Number(d.weight) > 0 ? "you chose this pair before" : "you replaced this pair before";
  }
}
/** "Follows Di Sarli well: energy +6, rhythmic after lyrical, common in DJ sets (42×)" or the warning */
export function successionLine(s: Succession, prevName: string): string {
  const hl = successionHighlights(s);
  if (s.verdict === "warn" || (s.warning && s.verdict !== "good"))
    return `${s.warning ? WARN_WORD[s.warning] : `Follows ${prevName} poorly`}${hl.length ? `: ${hl.map(partPhrase).join(", ")}` : ""}`;
  const lead = s.verdict === "good" ? `Follows ${prevName} well` : `Follows ${prevName}`;
  return `${lead}${hl.length ? `: ${hl.map(partPhrase).join(", ")}` : ""}`;
}
