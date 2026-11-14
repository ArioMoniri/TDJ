import VOCAL_STYLES from "../../../data/knowledge/vocal_styles.json";
import { normTitle } from "./energy";
import type { ComposeOptions, DanceRhythm, Song, Tanda, TandaRules } from "./types";

/**
 * Round 21 — tanda coherence as named settings (docs/specs/round21-engine.md §2). Every path that builds or edits a
 * tanda (compose, improveNight, the strict repair, Swap track, Swap tanda, the AI swap, search-and-swap, the booth's
 * swap) asks `sideProblem` whether a side may join a tanda and `tandaProblems` whether a tanda holds:
 *   voice       — all instrumental or all vocal
 *   vocalStyle  — a vocal tanda never mixes rhythm-led (estribillista) with singer-led (cantor) sides; the DJ may ask
 *                 for one style only ("singer-led" / "rhythm-led")
 *   years       — every side within the tanda's spread cap (spreadCap; the night's maxYearSpread)
 *   (the streaming match of every side is dated in the side's era: a match rule, matchRules `release`, always on)
 *   bpm / level — the measured tempo (Deezer, else analysed audio) and loudness (Deezer gain) within a band
 * A tanda the DJ pinned (`Tanda.pinned`) is the DJ's: no rule edits it and the strict panel reports it as a DJ
 * exception, never a fault.
 */
export type VocalStyle = "estribillo" | "cantor";
export const VOCAL_STYLE_LABEL: Record<VocalStyle, string> = {
  estribillo: "Rhythm-led (the orchestra starts, the singer comes in later)",
  cantor: "Singer-led (the singer leads the side)",
};

export const DEFAULT_TANDA_RULES: Required<TandaRules> = {
  voice: true,
  vocalStyle: "either",
  bpmBand: true,
  levelBand: true,
  bigFour: true,
  bigFourGap: 5,
  tone: "between",
};
/** the night's tanda rules: the defaults, the legacy `mixVocalInstrumental` (true = voice off), then the DJ's */
export function tandaRulesOf(
  o: Partial<Pick<ComposeOptions, "tandaRules" | "mixVocalInstrumental">>,
): Required<TandaRules> {
  return {
    ...DEFAULT_TANDA_RULES,
    ...(o.mixVocalInstrumental ? { voice: false } : {}),
    ...Object.fromEntries(Object.entries(o.tandaRules ?? {}).filter(([, v]) => v !== undefined)),
  } as Required<TandaRules>;
}

// --- vocal style -----------------------------------------------------------------------------------------------
interface StyleRule {
  orchestra?: string;
  singers?: string[];
  years?: [number, number];
  style: VocalStyle;
}
const KNOW = VOCAL_STYLES as unknown as { refrainEraUntil: number; rules: StyleRule[] };
const RULES = KNOW.rules.map((r) => ({ ...r, singers: r.singers?.map((x) => normTitle(x)) }));

/** the vocal style the knowledge table (or the refrain-era heuristic) gives a side, with how it was found */
export function knownVocalStyle(
  s: Pick<Song, "vocal" | "singer" | "orchestraId" | "year">,
): { style: VocalStyle; source: "knowledge" | "heuristic" } | null {
  if (!s.vocal || !s.singer) return null;
  const sg = ` ${normTitle(s.singer)} `;
  for (const r of RULES) {
    if (r.orchestra && r.orchestra !== s.orchestraId) continue;
    if (r.years && (!s.year || s.year < r.years[0] || s.year > r.years[1])) continue;
    if (r.singers && !r.singers.some((x) => sg.includes(` ${x} `))) continue;
    return { style: r.style, source: "knowledge" };
  }
  if (s.year && s.year <= KNOW.refrainEraUntil) return { style: "estribillo", source: "heuristic" };
  return null;
}
/** the side's style: the DJ's correction / the catalogue's value (Song.vocalStyle), else the table */
export const vocalStyleOf = (s: Pick<Song, "vocal" | "singer" | "orchestraId" | "year" | "vocalStyle">) =>
  s.vocal ? (s.vocalStyle ?? knownVocalStyle(s)?.style ?? null) : null;

// --- tempo and level ---------------------------------------------------------------------------------------------
/** the dance range each rhythm's beat is folded into (a tracker halves or doubles) — as score.ts reads it */
export const BPM_RANGE: Record<DanceRhythm, [number, number]> = {
  tango: [96, 150],
  vals: [150, 215],
  milonga: [88, 135],
};
export function foldBpm(b: number | null | undefined, rhythm: string): number | null {
  if (!b || b <= 0) return null;
  const [lo, hi] = BPM_RANGE[rhythm as DanceRhythm] ?? [60, 240];
  let x = b;
  for (let i = 0; i < 3 && x < lo; i++) x *= 2;
  for (let i = 0; i < 3 && x >= hi; i++) x /= 2;
  return x >= lo && x < hi ? x : null;
}
/** a side's measured tempo, folded into the rhythm's range (the DJ's, Deezer's, else the analysed preview's) */
export const sideBpm = (s: Pick<Song, "tempo">, rhythm: string) => foldBpm(s.tempo?.bpm, rhythm);
/** a side's loudness (dB, Deezer's replay gain or the DJ's) */
export const sideGain = (s: Pick<Song, "level">) =>
  typeof s.level?.gainDb === "number" ? s.level.gainDb : null;
/**
 * Round 21 bands (docs/specs/round21-engine.md §3, from the Deezer distribution over the golden families): inside a
 * tanda the folded tempo spreads at most BPM_BAND of the slowest side (the round-9 tempo factor gives full marks to
 * 6 %, zero at 16 %), and the gain at most LEVEL_BAND_DB.
 */
export const BPM_BAND: Record<DanceRhythm, number> = { tango: 0.1, vals: 0.12, milonga: 0.12 };
export const LEVEL_BAND_DB = 6;

// --- the checks ---------------------------------------------------------------------------------------------------
const yearOf = (s: Song) => (s.year && !s.yearApprox ? s.year : null);
/** the spread cap a tanda's years keep (as tanda.ts: vocal tango 2, instrumental tango 3, vals / milonga 2) */
function capOf(rhythm: string, vocal: boolean, maxYearSpread: number) {
  const c = rhythm === "tango" ? (vocal ? 2 : 3) : 2;
  return Math.min(c, maxYearSpread);
}

export interface SideCheck {
  rhythm: string;
  /** the night's options (rules, spread) */
  o: Partial<Pick<ComposeOptions, "tandaRules" | "mixVocalInstrumental" | "maxYearSpread">>;
  /** check only these rules (default: all) */
  only?: Array<
    "voice" | "vocalStyle" | "years" | "bpm" | "level" | "tone" | "orchestra" | "singer" | "rhythm"
  >;
}
/**
 * Why `cand` may not join the tanda formed by `others` (the sides that stay), or null. Order of the reasons: voice,
 * orchestra, vocal style, years, stream era, tempo, level.
 */
export function sideProblem(
  others: Song[],
  cand: Song,
  { rhythm, o }: SideCheck,
  opts: { orchestraId?: string; singerId?: string | null } = {},
): string | null {
  const r = tandaRulesOf(o);
  if (cand.rhythm !== rhythm && !(rhythm === "tango" && cand.rhythm === "tango"))
    return `a ${cand.rhythm}, not a ${rhythm}`;
  if (opts.orchestraId && cand.orchestraId !== opts.orchestraId)
    return `another orchestra (${cand.orchestra})`;
  if (r.voice && others.length && others.some((s) => !!s.vocal !== !!cand.vocal))
    return cand.vocal ? "a vocal side in an instrumental tanda" : "an instrumental side in a vocal tanda";
  if (opts.singerId !== undefined && cand.vocal && (cand.singerId ?? null) !== (opts.singerId ?? null))
    return `another singer (${cand.singer ?? "instrumental"})`;
  if (cand.vocal && r.vocalStyle !== "off") {
    const st = vocalStyleOf(cand);
    const want =
      r.vocalStyle === "singer-led" ? "cantor" : r.vocalStyle === "rhythm-led" ? "estribillo" : null;
    if (want && st && st !== want)
      return `${st === "cantor" ? "singer-led" : "rhythm-led"}, the night asks ${r.vocalStyle}`;
    const theirs = new Set(others.map(vocalStyleOf).filter((x): x is VocalStyle => !!x));
    if (st && theirs.size && !theirs.has(st))
      return `${st === "cantor" ? "a singer-led" : "a rhythm-led"} side in a ${st === "cantor" ? "rhythm-led" : "singer-led"} tanda`;
  }
  const y = yearOf(cand);
  const ys = others.map(yearOf).filter((x): x is number => !!x);
  if (y && ys.length) {
    const cap = capOf(rhythm, !!cand.vocal, o.maxYearSpread ?? 4);
    const span = Math.max(y, ...ys) - Math.min(y, ...ys);
    if (span > cap) return `${y} spreads the tanda over ${span} years (cap ${cap})`;
  }
  if (r.bpmBand) {
    const b = sideBpm(cand, rhythm);
    const bs = others.map((s) => sideBpm(s, rhythm)).filter((x): x is number => x !== null);
    if (b !== null && bs.length) {
      const lo = Math.min(b, ...bs),
        hi = Math.max(b, ...bs);
      if ((hi - lo) / lo > BPM_BAND[rhythm as DanceRhythm] + 1e-9)
        return `${Math.round(b)} BPM against ${Math.round(Math.min(...bs))}–${Math.round(Math.max(...bs))}`;
    }
  }
  if (r.tone === "between" && others.length) {
    const es = others.map(sideEnergy);
    const e = sideEnergy(cand);
    if (Math.max(e, ...es) - Math.min(e, ...es) > TONE_ENERGY_BAND)
      return `energy ${e} against ${Math.min(...es)}–${Math.max(...es)} (one tone per tanda)`;
  }
  if (r.levelBand) {
    const g = sideGain(cand);
    const gs = others.map(sideGain).filter((x): x is number => x !== null);
    if (g !== null && gs.length && Math.max(g, ...gs) - Math.min(g, ...gs) > LEVEL_BAND_DB + 1e-9)
      return `level ${g.toFixed(1)} dB against ${Math.min(...gs).toFixed(1)}…${Math.max(...gs).toFixed(1)} dB`;
  }
  return null;
}

export type CoherenceKey = "voice" | "vocalStyle" | "years" | "bpm" | "level" | "tone";
/**
 * round 21 (tone "between"): the sides of a tanda keep one tone — their energy within this band (max − min). The
 * per-side model carries a ±4.5 title jitter (energy.ts), so 10 is the noise floor of "the same tone"; the round-20
 * composer's tandas spread p50 7, p75 10, p90 12 (docs/specs/round21-engine.md §5).
 */
export const TONE_ENERGY_BAND = 10;
export const sideEnergy = (s: Pick<Song, "energy">) => s.energy ?? 50;
/** every coherence rule a tanda breaks (empty for a pinned tanda: the DJ's) */
export function tandaProblems(
  t: Pick<Tanda, "songs" | "rhythm" | "pinned">,
  o: SideCheck["o"],
): Array<{ key: CoherenceKey; detail: string }> {
  const out: Array<{ key: CoherenceKey; detail: string }> = [];
  const r = tandaRulesOf(o);
  const ss = t.songs.filter((s) => normTitle(s.title) !== "la cumparsita");
  if (ss.length < 2) return out;
  if (r.voice && new Set(ss.map((s) => !!s.vocal)).size > 1)
    out.push({ key: "voice", detail: "instrumental and vocal sides in one tanda" });
  if (r.vocalStyle !== "off") {
    const st = ss.map(vocalStyleOf).filter((x): x is VocalStyle => !!x);
    if (new Set(st).size > 1)
      out.push({ key: "vocalStyle", detail: "rhythm-led and singer-led sides in one tanda" });
    const want =
      r.vocalStyle === "singer-led" ? "cantor" : r.vocalStyle === "rhythm-led" ? "estribillo" : null;
    if (want && st.some((x) => x !== want))
      out.push({ key: "vocalStyle", detail: `the night asks ${r.vocalStyle} sides` });
  }
  const ys = ss.map(yearOf).filter((x): x is number => !!x);
  const vocal = ss.some((s) => s.vocal);
  if (ys.length > 1 && Math.max(...ys) - Math.min(...ys) > capOf(t.rhythm, vocal, o.maxYearSpread ?? 4))
    out.push({ key: "years", detail: `${Math.min(...ys)}–${Math.max(...ys)}` });
  if (r.bpmBand) {
    const bs = ss.map((s) => sideBpm(s, t.rhythm)).filter((x): x is number => x !== null);
    if (bs.length >= 2 && (Math.max(...bs) - Math.min(...bs)) / Math.min(...bs) > BPM_BAND[t.rhythm] + 1e-9)
      out.push({ key: "bpm", detail: `${Math.round(Math.min(...bs))}–${Math.round(Math.max(...bs))} BPM` });
  }
  if (r.levelBand) {
    const gs = ss.map(sideGain).filter((x): x is number => x !== null);
    if (gs.length >= 2 && Math.max(...gs) - Math.min(...gs) > LEVEL_BAND_DB + 1e-9)
      out.push({ key: "level", detail: `${Math.min(...gs).toFixed(1)}…${Math.max(...gs).toFixed(1)} dB` });
  }
  if (r.tone === "between") {
    const es = ss.map(sideEnergy);
    if (Math.max(...es) - Math.min(...es) > TONE_ENERGY_BAND)
      out.push({
        key: "tone",
        detail: `energy ${Math.min(...es)}–${Math.max(...es)} (one tone: ≤ ${TONE_ENERGY_BAND})`,
      });
  }
  return out;
}

// --- the big four ------------------------------------------------------------------------------------------------
/** Di Sarli, D'Arienzo, Troilo, Pugliese: every tanda of theirs counts, whatever its rhythm */
export const BIG_FOUR = ["carlos-di-sarli", "juan-d-arienzo", "anibal-troilo", "osvaldo-pugliese"] as const;
export const isBigFour = (t: Pick<Tanda, "orchestraId">) =>
  (BIG_FOUR as readonly string[]).includes(t.orchestraId);
/** the quartile (0–3) of tanda i in a night of n tandas, by position (the tanda index) */
export const quartileOf = (i: number, n: number) => Math.min(3, Math.floor((i * 4) / Math.max(1, n)));

/**
 * The big-four rule (round 21): each quartile of the night holds a big-four tanda; two big-four tandas are never back
 * to back; the same big-four orchestra returns no sooner than `bigFourGap` tandas later (and never sooner than the
 * night's orchestra gap); each of the four plays in a night of ≥ 3 h. Returns the faults with the tanda they sit on.
 */
export function bigFourProblems(
  tandas: Array<Pick<Tanda, "orchestraId" | "orchestra">>,
  o: Partial<Pick<ComposeOptions, "tandaRules" | "orchestraRepeatGap" | "hours" | "mixVocalInstrumental">>,
): Array<{
  tanda: number;
  kind: "quartile" | "adjacent" | "gap" | "missing";
  detail: string;
  with?: number;
}> {
  const r = tandaRulesOf(o);
  const out: Array<{
    tanda: number;
    kind: "quartile" | "adjacent" | "gap" | "missing";
    detail: string;
    with?: number;
  }> = [];
  const n = tandas.length;
  if (!r.bigFour || n < 8) return out;
  const gap = Math.max(r.bigFourGap, o.orchestraRepeatGap ?? 0);
  for (let q = 0; q < 4; q++) {
    const idx = tandas.map((_, i) => i).filter((i) => quartileOf(i, n) === q);
    if (idx.length && !idx.some((i) => isBigFour(tandas[i]!)))
      out.push({
        tanda: idx[0]!,
        kind: "quartile",
        detail: `quartile ${q + 1} (tandas ${idx[0]! + 1}–${idx.at(-1)! + 1}) has no big-four tanda`,
      });
  }
  for (let i = 1; i < n; i++)
    if (isBigFour(tandas[i - 1]!) && isBigFour(tandas[i]!))
      out.push({
        tanda: i,
        with: i - 1,
        kind: "adjacent",
        detail: `${tandas[i - 1]!.orchestra} then ${tandas[i]!.orchestra}`,
      });
  const last = new Map<string, number>();
  tandas.forEach((t, i) => {
    if (!isBigFour(t)) return;
    const p = last.get(t.orchestraId);
    if (p !== undefined && i - p < gap)
      out.push({
        tanda: i,
        with: p,
        kind: "gap",
        detail: `${t.orchestra} again ${i - p} tandas after tanda ${p + 1} (≥ ${gap})`,
      });
    last.set(t.orchestraId, i);
  });
  if ((o.hours ?? 4) >= 3)
    for (const id of BIG_FOUR)
      if (!tandas.some((t) => t.orchestraId === id))
        out.push({ tanda: -1, kind: "missing", detail: `no ${id} tanda` });
  return out;
}

/** a night that asks for one vocal style keeps the vocal sides of that style and those of unknown style */
export function styleFilter<T extends Song>(pool: T[], want: Required<TandaRules>["vocalStyle"]): T[] {
  if (want !== "singer-led" && want !== "rhythm-led") return pool;
  const w: VocalStyle = want === "singer-led" ? "cantor" : "estribillo";
  return pool.filter((s) => {
    const st = vocalStyleOf(s);
    return !st || st === w;
  });
}
/** fewer vocal families of the chosen style than this per rhythm: the style setting falls back (recorded) */
export const STYLE_MIN_FAMILIES = 3;

/** round 21: a pinned tanda is locked for the composer, every improveNight fixer and the strict repair */
export function withPinsLocked<P extends { tandas: Tanda[] }>(p: P): P {
  return p.tandas.some((t) => t.pinned && !t.locked)
    ? { ...p, tandas: p.tandas.map((t) => (t.pinned && !t.locked ? { ...t, locked: true } : t)) }
    : p;
}
/** pin a tanda for the DJ ("Keep my tanda as is"): locked, with the reason and the time */
export function pinTanda<P extends { tandas: Tanda[] }>(
  p: P,
  index: number,
  reason?: string,
  at = new Date().toISOString(),
): P {
  return {
    ...p,
    tandas: p.tandas.map((t, i) =>
      i === index
        ? { ...t, locked: true, pinned: { by: "dj" as const, ...(reason ? { reason } : {}), at } }
        : t,
    ),
  };
}
export function unpinTanda<P extends { tandas: Tanda[] }>(p: P, index: number): P {
  return {
    ...p,
    tandas: p.tandas.map((t, i) => {
      if (i !== index) return t;
      const { pinned: _p, ...rest } = t;
      return { ...rest, locked: false };
    }),
  };
}
