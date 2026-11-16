import { patternString, planSlots, sanitizeOptions } from "./arc";
import { BIG_FOUR, sideProblem } from "./coherence";
import { type ComposeDeps, DEFAULT_OPTIONS } from "./compose";
import { isDanceableSong, normTitle } from "./energy";
import {
  asFavouriteTable,
  type FavouriteTable,
  favouriteFamilyFactor,
  favouriteSideFactor,
  isFavouriteSide,
  type SlotRole,
  withPraise,
} from "./favourites";
import { familyKey, learnedFamilyWeight, learnedSideFactor, mergeLearned } from "./learn";
import { withEraSettings } from "./profiles";
import { recue } from "./repair";
import { composePoints, succession, successionLine, successionSideOfSongs } from "./succession";
import { renight, retimeTanda } from "./swap";
import { isTandaEligible, shapeTanda } from "./tanda";
import type { ComposeOptions, DanceRhythm, LearnedPreferences, Playlist, Song, Tanda } from "./types";

/**
 * Round 22 — the hand-built night (docs/ROADMAP.md §12 "Manual playlist creation"). The DJ picks songs or whole
 * tandas; after each one TDJ suggests what comes next, ranked by the composer's own rules and each with the reason:
 * the rhythm rotation of the night's cycle, the energy against the arc and the last tandas ("lifts the energy after
 * two calm tandas"), orchestra and singer spacing, the big-four rule, the years of what came before, and what the
 * DJ's own edits taught (learned families and sides). Inside an unfinished tanda it suggests the next side of the
 * same family, within the tanda rules (voice, singer, year band, tempo, level, tone).
 */
/** the succession's share of a suggestion's score: points of succession.ts COMPOSE_KINDS × this */
export const SUGGEST_SUCCESSION = 0.5;
/** …at most this much either way (the energy rules — a lift after two calm tandas — keep the lead) */
export const SUGGEST_SUCCESSION_MAX = 5;

export interface NextSuggestion {
  /** the family key (orchestraId|singer|rhythm), plus the side id for a single-side suggestion */
  key: string;
  kind: "tanda" | "song";
  rhythm: DanceRhythm;
  orchestraId: string;
  orchestra: string;
  singer: string | null;
  /** a whole tanda (kind "tanda") or the one side (kind "song") */
  songs: Song[];
  energy: number;
  years: [number, number] | null;
  score: number;
  /** why, best reason first, in DJ words */
  reasons: string[];
  /** 2026-11: dancers filled the floor with it in this slot's role (♥) */
  favourite?: boolean;
}
export interface SuggestResult {
  mode: "tanda" | "song";
  rhythm: DanceRhythm;
  /** 0-based slot of the next tanda */
  slot: number;
  /** the arc's plan for that slot */
  targetEnergy: number;
  suggestions: NextSuggestion[];
}
export type SuggestOptions = Partial<ComposeOptions> & {
  /** the DJ chose the rhythm of the next tanda */
  rhythm?: DanceRhythm;
  limit?: number;
};

const DANCE: DanceRhythm[] = ["tango", "vals", "milonga"];
const rhythmOf = (s: Pick<Song, "rhythm">): DanceRhythm =>
  (DANCE as string[]).includes(s.rhythm) ? (s.rhythm as DanceRhythm) : "tango";
const isBig = (id: string) => (BIG_FOUR as readonly string[]).includes(id);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const energyOf = (ss: Song[]) => Math.round(mean(ss.map((s) => s.energy ?? 50)));
const datedYears = (ss: Song[]) =>
  ss.map((s) => (s.year && !s.yearApprox ? s.year : null)).filter((y): y is number => !!y);
const yearsOf = (ss: Song[]): [number, number] | null => {
  const ys = datedYears(ss);
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
};
const capOf = (rhythm: string, vocal: boolean, maxYearSpread: number) =>
  Math.min(rhythm === "tango" ? (vocal ? 2 : 3) : 2, maxYearSpread);

export function nightOptions(opts: Partial<ComposeOptions> = {}): ComposeOptions {
  return sanitizeOptions({ ...DEFAULT_OPTIONS, ...withEraSettings(opts) } as ComposeOptions);
}
const sizeFor = (o: ComposeOptions, r: DanceRhythm) =>
  r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;

/** the next rhythm of the cycle, aligned on what the DJ has played so far (they may have left the plan) */
export function nextRhythm(draft: DanceRhythm[], o: ComposeOptions): DanceRhythm {
  const pat = patternString(o);
  const L = pat.length;
  const ch = (k: number): DanceRhythm => {
    const c = pat[k % L]!;
    return c === "V" ? "vals" : c === "M" ? "milonga" : "tango";
  };
  let best = 0,
    bestN = -1;
  for (let s = 0; s < L; s++) {
    let n = 0;
    // every tanda so far votes for the phase, the latest weighing most
    draft.forEach((r, j) => {
      if (r === ch(s + j)) n += 1 + j / Math.max(1, draft.length);
    });
    if (n > bestN + 1e-9) {
      best = s;
      bestN = n;
    }
  }
  let r = ch(best + draft.length);
  // never two non-tango tandas in a row
  if (r !== "tango" && draft.at(-1) && draft.at(-1) !== "tango") r = "tango";
  return r;
}

const playable = (s: Song, deps: ComposeDeps, o: ComposeOptions) =>
  !!s.spotify?.uri &&
  !s.streamSuspect &&
  normTitle(s.title) !== "la cumparsita" &&
  isTandaEligible(s, !!o.rules?.allowUndated) &&
  isDanceableSong(s, deps.catalog.blacklist) &&
  !deps.catalog.nonDance(s.orchestraId, s.title, s.year);

/** the best `size` sides of a family inside one year band that keep the tanda rules */
function representative(
  pool: Song[],
  size: number,
  rhythm: DanceRhythm,
  o: ComposeOptions,
  L?: LearnedPreferences,
) {
  const ranked = pool
    .slice()
    .sort(
      (a, b) =>
        (b.fame ?? 0) * learnedSideFactor(L, b.id, b) - (a.fame ?? 0) * learnedSideFactor(L, a.id, a) ||
        a.id.localeCompare(b.id),
    );
  for (const anchor of ranked.slice(0, 6)) {
    if (!anchor.year || anchor.yearApprox) continue;
    const cap = capOf(rhythm, !!anchor.vocal, o.maxYearSpread ?? 4);
    const chosen: Song[] = [anchor];
    const titles = new Set([normTitle(anchor.title)]);
    for (const s of ranked) {
      if (chosen.length >= size) break;
      if (s === anchor || titles.has(normTitle(s.title)) || !s.year || s.yearApprox) continue;
      const ys = [...datedYears(chosen), s.year];
      if (Math.max(...ys) - Math.min(...ys) > cap) continue;
      if (sideProblem(chosen, s, { rhythm, o })) continue;
      chosen.push(s);
      titles.add(normTitle(s.title));
    }
    if (chosen.length >= size) return shapeTanda(chosen, o.tandaShape, rhythm);
  }
  return null;
}

function suggestSides(
  draft: Song[][],
  deps: ComposeDeps,
  o: ComposeOptions,
  L: LearnedPreferences,
  limit: number,
  fav?: { table: FavouriteTable; role: SlotRole },
) {
  const cur = draft.at(-1)!;
  const s0 = cur[0]!;
  const rhythm = rhythmOf(s0);
  const size = sizeFor(o, rhythm);
  const used = new Set(draft.flat().map((s) => s.id));
  const titles = new Set(draft.flat().map((s) => normTitle(s.title)));
  const last = cur.at(-1)!;
  const ys = datedYears(cur);
  const my = ys.length ? mean(ys) : (s0.year ?? 1940);
  const chair = cur.length; // 0-based chair being filled
  const want = (last.energy ?? 50) + (chair < size - 1 ? 3 : -2);
  const out: NextSuggestion[] = [];
  for (const s of deps.catalog.byOrchestra.get(s0.orchestraId) ?? []) {
    if (rhythmOf(s) !== rhythm || s.rhythm !== s0.rhythm || used.has(s.id) || titles.has(normTitle(s.title)))
      continue;
    if (!!s.vocal !== !!s0.vocal || (s0.vocal && (s.singerId ?? null) !== (s0.singerId ?? null))) continue;
    if (!playable(s, deps, o)) continue;
    if (sideProblem(cur, s, { rhythm, o }, { orchestraId: s0.orchestraId })) continue;
    const e = s.energy ?? 50;
    const lf = learnedSideFactor(L, s.id, s);
    const ff = fav ? favouriteSideFactor(fav.table, s.id, fav.role) : 1;
    const score =
      (s.fame ?? 0) * 4 -
      Math.abs((s.year ?? my) - my) * 3 -
      Math.abs(e - want) / 2 +
      (lf - 1) * 40 +
      (ff - 1) * 30 +
      10;
    const reasons: string[] = [];
    reasons.push(
      `${s0.vocal ? `same singer (${s0.singer})` : "instrumental, like the tanda"}, recorded ${s.year ?? "?"} beside ${ys.length ? (Math.min(...ys) === Math.max(...ys) ? Math.min(...ys) : `${Math.min(...ys)}–${Math.max(...ys)}`) : "?"}`,
    );
    if (chair < size - 1 && e > (last.energy ?? 50))
      reasons.push(`lifts the tanda (energy ${Math.round(e)} after ${Math.round(last.energy ?? 50)})`);
    else if (chair === size - 1 && e <= (last.energy ?? 50) + 2)
      reasons.push(`settles the tanda to close it (energy ${Math.round(e)})`);
    if ((s.fame ?? 0) >= 3) reasons.push("a floor favourite with DJs");
    if (lf > 1) reasons.push("you chose this side before");
    const heart = !!fav && isFavouriteSide(fav.table, s.id, fav.role);
    if (heart) reasons.unshift("♥ dancers filled the floor with it here");
    out.push({
      key: `${familyKey(s)}|${s.id}`,
      kind: "song",
      rhythm,
      orchestraId: s.orchestraId,
      orchestra: s.orchestra,
      singer: s.singer,
      songs: [s],
      energy: Math.round(e),
      years: s.year ? [s.year, s.year] : null,
      score: Math.round(score * 10) / 10,
      reasons,
      ...(heart ? { favourite: true } : {}),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit);
}

/** how far past the best fit to the plan a family may be and still lead the list */
const LEAD_FIT = 8;
/**
 * Fit to the plan's energy leads (wave 2): a family more than LEAD_FIT off what the slot wants, past the closest
 * family on offer, may rank high (a due big-four tanda still reaches the top three) but never first. The bonuses
 * (big four due: 24–48; learned family: 6 a level) can outweigh 12–24 points of energy gap at 2 a point, so such a
 * family is held just under the best-scored family that fits, keeping its order among the others it passes.
 */
function leadFitsThePlan(out: NextSuggestion[], want: number) {
  if (out.length < 2) return;
  const gap = (s: NextSuggestion) => Math.abs(s.energy - want);
  const closest = Math.min(...out.map(gap));
  const fits = out.filter((s) => gap(s) <= closest + LEAD_FIT);
  const top = Math.max(...fits.map((s) => s.score));
  out
    .filter((s) => gap(s) > closest + LEAD_FIT && s.score >= top)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .forEach((s, i) => {
      s.score = Math.round((top - 0.5 - 0.1 * i) * 10) / 10;
    });
}

/**
 * What comes next in a hand-built night `draft` (its tandas, in order; the last one may be unfinished). An unfinished
 * last tanda → the next side of its family; otherwise → the next tanda, as whole families with their best sides.
 */
export function suggestNext(draft: Song[][], deps: ComposeDeps, opts: SuggestOptions = {}): SuggestResult {
  const { rhythm: forced, limit: lim, ...rest } = opts;
  const o = nightOptions(rest);
  const L = mergeLearned(deps.catalog.learned, opts.learned);
  const limit = lim ?? 8;
  const tandas = draft.filter((t) => t.length);
  const slots = planSlots(o);
  const cur = tandas.at(-1);
  // 2026-11: dancer favourites, read in the slot's role (a praised tanda among them as a "Floor full ♥": withPraise)
  const at = Date.now();
  const table = withPraise(asFavouriteTable(opts.favourites, at), L.praise, {
    at,
    songs: deps.catalog.songs,
  });
  const favAt = (k: number) =>
    table && !table.off ? { table, role: slots[Math.min(k, slots.length - 1)]?.phase ?? "build" } : undefined;
  if (cur && cur.length < sizeFor(o, rhythmOf(cur[0]!))) {
    const slot = tandas.length - 1;
    return {
      mode: "song",
      rhythm: rhythmOf(cur[0]!),
      slot,
      targetEnergy: slots[slot]?.targetEnergy ?? 60,
      suggestions: suggestSides(tandas, deps, o, L, limit, favAt(slot)),
    };
  }
  const slot = tandas.length;
  const rhythm =
    forced ??
    nextRhythm(
      tandas.map((t) => rhythmOf(t[0]!)),
      o,
    );
  const size = sizeFor(o, rhythm);
  const target = slots[Math.min(slot, slots.length - 1)]?.targetEnergy ?? 62;
  const used = new Set(tandas.flat().map((s) => s.id));
  const titles = new Set(tandas.flat().map((s) => normTitle(s.title)));
  const last2 = tandas.slice(-2).map(energyOf);
  const calm = last2.length === 2 && last2.every((e) => e < 60);
  const strong = last2.length === 2 && last2.every((e) => e > 72);
  const lastMean = last2.length ? mean(last2) : target;
  const want = calm ? Math.max(target, lastMean + 10) : strong ? Math.min(target, lastMean - 10) : target;
  const prev = tandas.at(-1);
  const prevYears = prev ? datedYears(prev) : [];
  const prevYear = prevYears.length ? mean(prevYears) : null;
  const og = o.orchestraRepeatGap ?? 6;
  const sg = o.singerRepeatGap ?? 4;
  const lastAt = new Map<string, number>();
  const singerAt = new Map<string, number>();
  tandas.forEach((t, k) => {
    lastAt.set(t[0]!.orchestraId, k);
    const sing = t.find((s) => s.singer)?.singer;
    if (sing) singerAt.set(normTitle(sing), k);
  });
  let sinceBig = tandas.length;
  for (let k = tandas.length - 1; k >= 0; k--)
    if (isBig(tandas[k]![0]!.orchestraId)) {
      sinceBig = tandas.length - 1 - k;
      break;
    }
  const prevBig = !!prev && isBig(prev[0]!.orchestraId);
  const prevSide = prev
    ? successionSideOfSongs(prev, {
        orchestraId: prev[0]!.orchestraId,
        singer: prev.find((x) => x.singer)?.singer ?? null,
        rhythm: rhythmOf(prev[0]!),
        vocal: prev.some((x) => x.vocal),
        targetEnergy: slots[Math.max(0, slot - 1)]?.targetEnergy ?? target,
      })
    : null;
  const pool = deps.catalog
    .filter({
      eras: o.eras,
      rhythms: [rhythm],
      excludeOrchestras: o.excludeOrchestras,
      includeOrchestras: o.includeOrchestras,
      yearRange: o.yearRange,
      minTier: o.eras.includes("all") || o.eras.includes("contemporary") || o.eras.includes("nuevo") ? 3 : 2,
    })
    .filter((s) => !used.has(s.id) && !titles.has(normTitle(s.title)) && playable(s, deps, o));
  const fams = new Map<string, Song[]>();
  for (const s of pool) {
    const k = familyKey(s);
    const arr = fams.get(k);
    if (arr) arr.push(s);
    else fams.set(k, [s]);
  }
  const out: NextSuggestion[] = [];
  for (const [key, songs] of fams) {
    if (songs.length < size) continue;
    const s0 = songs[0]!;
    const orch = s0.orchestraId;
    const seen = lastAt.get(orch);
    if (seen !== undefined && tandas.length - seen < og) continue;
    if (prevBig && isBig(orch)) continue;
    if (
      s0.singer &&
      singerAt.has(normTitle(s0.singer)) &&
      tandas.length - singerAt.get(normTitle(s0.singer))! < sg
    )
      continue;
    const rep = representative(songs, size, rhythm, o, L);
    if (!rep) continue;
    const e = energyOf(rep);
    const ys = yearsOf(rep);
    const tier = deps.catalog.profile(orch)?.tier ?? 3;
    const fame = mean(rep.map((s) => s.fame ?? 0));
    const reasons: Array<[number, string]> = [];
    // wave 2: fit to the plan's energy weighs most (2 a point: a headline family 25 points over a warm-up slot
    // planned at 51 no longer leads the list; the lift after two calm tandas still counts through `want`)
    let score = (tier === 1 ? 10 : tier === 2 ? 5 : 0) + fame * 3 - Math.abs(e - want) * 2;
    if (calm) {
      if (e > lastMean + 3)
        reasons.push([30, `lifts the energy after two calm tandas (${e} after ${Math.round(lastMean)})`]);
      else score -= 15;
    } else if (strong) {
      if (e < lastMean - 3)
        reasons.push([
          30,
          `gives the floor a breather after two strong tandas (${e} after ${Math.round(lastMean)})`,
        ]);
      else score -= 15;
    } else if (Math.abs(e - target) <= 6)
      reasons.push([12, `fits the arc here (energy ${e}, plan ${Math.round(target)})`]);
    if (isBig(orch) && sinceBig >= 2 && tandas.length >= 2) {
      // (wave 2: scaled with the energy weight, so a due big-four tanda still rises to the top three)
      score += 12 * Math.min(sinceBig, 4);
      reasons.push([25, `a big four tanda is due (none in the last ${sinceBig})`]);
    }
    if (seen === undefined) {
      score += 4;
      if (tandas.length) reasons.push([6, "not played yet tonight"]);
    } else reasons.push([5, `${s0.orchestra} last played ${tandas.length - seen} tandas ago`]);
    if (prevYear !== null && ys) {
      const y = (ys[0] + ys[1]) / 2;
      const d = Math.abs(y - prevYear);
      score -= Math.min(d, 15) * 1.2;
      if (d <= 3) reasons.push([10, `stays in the ${Math.floor(y / 10) * 10}s, the years of the last tanda`]);
    }
    // 2026-11 — succession (succession.ts): how it follows the last tanda (the parts the energy fit above does not
    // already weigh), and the one-line why
    if (prev && prevSide) {
      const su = succession(
        prevSide,
        successionSideOfSongs(rep, {
          orchestraId: orch,
          singer: s0.singer,
          rhythm,
          vocal: rep.some((x) => x.vocal),
          targetEnergy: target,
        }),
        { learned: L, profileOf: (id) => deps.catalog.profile(id) },
      );
      score += Math.max(
        -SUGGEST_SUCCESSION_MAX,
        Math.min(SUGGEST_SUCCESSION_MAX, composePoints(su) * SUGGEST_SUCCESSION),
      );
      if (su.verdict === "good") reasons.push([15, successionLine(su, prev[0]!.orchestra)]);
      else if (su.warning) reasons.push([2, successionLine(su, prev[0]!.orchestra)]);
    }
    const lv = learnedFamilyWeight(L, key, ys);
    if (lv !== undefined) {
      score += lv * 6;
      const fromLikes = L.families?.[key] === undefined;
      if (lv > 0) reasons.push([20, fromLikes ? "from nights you liked" : "you often choose this family"]);
      else if (lv < 0)
        reasons.push([4, fromLikes ? "from nights you disliked" : "you replaced this family before"]);
    }
    const fv = favAt(slot);
    const ff = fv ? favouriteFamilyFactor(fv.table, key, fv.role, ys) : 1;
    if (ff !== 1) {
      score += (ff - 1) * 40;
      if (ff > 1) reasons.push([40, "♥ dancers filled the floor with this family here"]);
      else reasons.push([2, "the floor emptied for this family here before"]);
    }
    if (fame >= 3) reasons.push([3, "a floor favourite with DJs"]);
    if (!reasons.length)
      reasons.push([1, `a ${tier === 1 ? "headline" : "strong"} ${rhythm} family for this slot`]);
    out.push({
      key,
      kind: "tanda",
      rhythm,
      orchestraId: orch,
      orchestra: s0.orchestra,
      singer: s0.singer,
      songs: rep,
      energy: e,
      years: ys,
      score: Math.round(score * 10) / 10,
      reasons: reasons.sort((a, b) => b[0] - a[0]).map((r) => r[1]),
      ...(ff > 1 ? { favourite: true } : {}),
    });
  }
  leadFitsThePlan(out, want);
  return {
    mode: "tanda",
    rhythm,
    slot,
    targetEnergy: Math.round(target),
    suggestions: out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit),
  };
}

/**
 * A hand-picked night (tandas of song ids, or songs) as a full night: tandas re-timed and kept as the DJ's own
 * (pinned and locked: no fixer edits them, the strict panel reports what they break as the DJ's choice), cortinas
 * planned between them, stats, the booth plan and the score. Unknown ids are dropped, never invented.
 */
export function buildManualNight(
  draft: Array<Array<string | Song>>,
  deps: ComposeDeps,
  opts: Partial<ComposeOptions> = {},
): Playlist {
  const o = nightOptions(opts);
  const slots = planSlots(o);
  const at = new Date().toISOString();
  const byId = (id: string) => deps.catalog.songs.find((s) => s.id === id || s.altIds?.includes(id));
  const tandas: Tanda[] = [];
  for (const raw of draft) {
    const songs = raw
      .map((x) => (typeof x === "string" ? byId(x) : byId(x.id)))
      .filter((s): s is Song => !!s);
    if (!songs.length) continue;
    const i = tandas.length;
    const s0 = songs[0]!;
    const base: Tanda = {
      index: i,
      rhythm: rhythmOf(s0),
      orchestra: s0.orchestra,
      orchestraId: s0.orchestraId,
      singer: songs.find((s) => s.singer)?.singer ?? null,
      vocal: songs.some((s) => s.vocal),
      yearRange: null,
      era: s0.era,
      songs,
      energy: 0,
      energyCurve: [],
      targetEnergy: slots[i]?.targetEnergy ?? 60,
      phase: slots[i]?.phase ?? "build",
      durationSec: 0,
      cortina: null,
      locked: true,
      pinned: { by: "dj", reason: "hand-made", at },
    };
    tandas.push(retimeTanda(base, songs));
  }
  const cued = tandas.length > 1 ? recue(tandas, deps, o) : null;
  const shell = {
    id: `manual-${Date.now().toString(36)}`,
    name: opts.name ?? "Hand-built night",
    createdAt: at,
    options: o,
    tandas: [],
    closing: null,
  } as unknown as Playlist;
  return renight(shell, cued ?? tandas);
}
