import { normTitle } from "./energy";
import { emptyLearned, familyKey, LEARN_LIMITS, LIKE_WEIGHTS } from "./learn";
import { spreadCap } from "./tanda";
import type { LearnedPreferences, NightException, Song, Tanda } from "./types";

/**
 * Round 22 — what TDJ learned from the DJ's edits, as a list of rules the DJ can read, weight and delete (Database →
 * Memory). A family rule ("Troilo / Fiorentino · tango", +2) and a side rule ("“Toda mi vida”", +1) carry the
 * weights `learnedFamilyFactor` / `learnedSideFactor` read at compose (and the hand-built night's suggestions); a
 * template is a tanda the DJ pinned. Weights stay inside LEARN_LIMITS; 0 is neutral. Locking a tanda counts as a half
 * vote for its family and sides.
 */
export interface LearnedRule {
  /** `family:<key>`, `side:<songId>`, `template:<id>`, `liked:<key>|<band>` or `shape:<nightId>` */
  id: string;
  kind: "family" | "side" | "template" | "liked" | "shape";
  /** where it came from: the DJ's edits, or the nights the DJ liked / disliked (thumbs up / down) */
  source: "edits" | "liked" | "disliked";
  label: string;
  /** one line: what the rule does to the next nights */
  detail: string;
  weight: number;
  min: number;
  max: number;
}

/** a tanda's template id (learnFromEdit's): `${rhythm}:${song ids}` */
export const templateIdOf = (t: Pick<Tanda, "rhythm" | "songs">) =>
  `${t.rhythm}:${t.songs.map((s) => s.id).join(",")}`;

/**
 * What a tanda mixes against the default tanda rule: vocal and instrumental sides ("mode"), more than one singer
 * ("singer"), recording years wider than the rhythm's cap ("years", tanda.ts spreadCap). Data for a DJ approval.
 */
export function templateMix(
  songs: Array<Pick<Song, "vocal" | "singer" | "year" | "yearApprox">>,
  rhythm: string,
): Array<"mode" | "singer" | "years"> {
  const out: Array<"mode" | "singer" | "years"> = [];
  const vocal = songs.some((s) => s.vocal);
  if (vocal && songs.some((s) => !s.vocal)) out.push("mode");
  const singers = new Set(songs.filter((s) => s.vocal && s.singer).map((s) => normTitle(s.singer!)));
  if (singers.size > 1) out.push("singer");
  const ys = songs.filter((s) => s.year && !s.yearApprox).map((s) => s.year!);
  if (ys.length > 1 && Math.max(...ys) - Math.min(...ys) > spreadCap(rhythm, vocal)) out.push("years");
  return out;
}

/** a tanda by what it is, not its takes: `${rhythm}|${orchestra ids}|${normalised titles}` */
export const tandaTitleKeyOf = (t: Pick<Tanda, "rhythm" | "songs">) =>
  `${t.rhythm}|${[...new Set(t.songs.map((s) => s.orchestraId))].sort().join("+")}|${t.songs.map((s) => normTitle(s.title)).join(",")}`;

/**
 * The tandas the DJ approved as they are for ONE night (FeaturedNightChoices.exceptions, scoped to its id): the keys
 * the strict panel accepts for that night only — by song ids, or by rhythm + orchestras + titles (a take may change).
 * Another night gets an empty set: an exception is never a template and never a compose signal.
 */
export function nightExceptionKeys(
  L: LearnedPreferences | null | undefined,
  nightId: string | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!nightId) return out;
  for (const x of L?.night?.exceptions ?? []) {
    if (x.nightId !== nightId) continue;
    if (x.tandaId) out.add(x.tandaId);
    out.add(`${x.rhythm}|${[...x.orchestraIds].sort().join("+")}|${x.titles.join(",")}`);
  }
  return out;
}

/** the night's exceptions, for the list in Database → Memory / Settings ("Exception for this night only") */
export const nightExceptions = (
  L: LearnedPreferences | null | undefined,
  nightId?: string,
): NightException[] => (L?.night?.exceptions ?? []).filter((x) => !nightId || x.nightId === nightId);

const titleCase = (s: string) =>
  s.replace(/(^|\s)(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase());

export function learnedRules(
  L: LearnedPreferences | undefined,
  nameOf: (orchestraId: string) => string = (x) => x,
  songOf?: (id: string) => Pick<Song, "title" | "orchestra" | "year"> | undefined,
): LearnedRule[] {
  if (!L) return [];
  const out: LearnedRule[] = [];
  for (const [k, v] of Object.entries(L.families ?? {}).sort((a, b) => b[1] - a[1])) {
    const [orch, singer, rhythm] = k.split("|");
    out.push({
      id: `family:${k}`,
      kind: "family",
      label: `${nameOf(orch ?? "")}${singer ? ` / ${titleCase(singer)}` : " instrumental"} · ${rhythm}`,
      detail: v > 0 ? "Comes up more often in your nights" : v < 0 ? "Comes up less often" : "Neutral",
      weight: v,
      min: LEARN_LIMITS.familyMin,
      max: LEARN_LIMITS.familyMax,
      source: "edits",
    });
  }
  for (const [id, v] of Object.entries(L.sides ?? {}).sort((a, b) => b[1] - a[1])) {
    const s = songOf?.(id);
    out.push({
      id: `side:${id}`,
      kind: "side",
      label: s ? `“${s.title}” · ${s.orchestra}${s.year ? ` ${s.year}` : ""}` : `Side ${id}`,
      detail: v > 0 ? "Chosen first inside its family" : v < 0 ? "Played less inside its family" : "Neutral",
      weight: v,
      min: LEARN_LIMITS.sideMin,
      max: LEARN_LIMITS.sideMax,
      source: "edits",
    });
  }
  for (const t of L.templates ?? [])
    out.push({
      id: `template:${t.id}`,
      kind: "template",
      label: t.name,
      detail: `A ${t.rhythm} tanda you kept as is`,
      weight: 1,
      min: 0,
      max: 1,
      source: "edits",
    });
  // thumbs up / down on nights (likes.ts): one rule per family and year band, summed over the rated nights
  const liked = new Map<string, number>();
  for (const n of Object.values(L.likes ?? {}))
    for (const [k, w] of Object.entries(n.families ?? {})) liked.set(k, (liked.get(k) ?? 0) + w);
  for (const [k, sum] of [...liked.entries()].sort((a, b) => b[1] - a[1])) {
    const [orch, singer, rhythm, band] = k.split("|");
    const v = Math.round(Math.max(LIKE_WEIGHTS.min, Math.min(LIKE_WEIGHTS.max, sum)) * 100) / 100;
    if (!v) continue;
    out.push({
      id: `liked:${k}`,
      kind: "liked",
      label: `${nameOf(orch ?? "")}${singer ? ` / ${titleCase(singer)}` : " instrumental"} · ${rhythm}${band ? ` · ${band}–${Number(band) + 4}` : ""}`,
      detail:
        v > 0
          ? "From nights you liked: comes up a little more often"
          : "From nights you disliked: comes up a little less often",
      weight: v,
      min: LIKE_WEIGHTS.min,
      max: LIKE_WEIGHTS.max,
      source: v > 0 ? "liked" : "disliked",
    });
  }
  for (const [id, n] of Object.entries(L.likes ?? {}))
    if (n.shape)
      out.push({
        id: `shape:${id}`,
        kind: "shape",
        label: `${n.name || "A night"}: ${n.shape.hours} h · ${n.shape.eras.join(", ") || "any era"} · ${(n.shape.arcShape ?? n.shape.arc).replace(/-/g, " ")} · ${n.shape.cortinaCultures.join(", ") || "any"} cortinas`,
        detail: n.liked
          ? "From nights you liked: two alike set the defaults you leave open"
          : "From nights you disliked: counts against this shape",
        weight: n.liked ? 1 : -1,
        min: -1,
        max: 1,
        source: n.liked ? "liked" : "disliked",
      });
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, x)) * 100) / 100;
const split = (id: string) => {
  const i = id.indexOf(":");
  return [id.slice(0, i), id.slice(i + 1)] as const;
};

/** the DJ set a rule's weight (clamped to its limits; a template at 0 is deleted) */
export function setLearnedWeight(
  L: LearnedPreferences | undefined,
  id: string,
  weight: number,
): LearnedPreferences {
  const next: LearnedPreferences = structuredClone(L ?? emptyLearned());
  const [kind, key] = split(id);
  const w = Number.isFinite(weight) ? weight : 0;
  if (kind === "family")
    next.families = {
      ...(next.families ?? {}),
      [key]: clamp(w, LEARN_LIMITS.familyMin, LEARN_LIMITS.familyMax),
    };
  if (kind === "side")
    next.sides = { ...(next.sides ?? {}), [key]: clamp(w, LEARN_LIMITS.sideMin, LEARN_LIMITS.sideMax) };
  if (kind === "template" && w <= 0) return forgetLearned(next, id);
  next.updatedAt = new Date().toISOString();
  return next;
}

/** the DJ deleted a rule */
export function forgetLearned(L: LearnedPreferences | undefined, id: string): LearnedPreferences {
  const next: LearnedPreferences = structuredClone(L ?? emptyLearned());
  const [kind, key] = split(id);
  if (kind === "family" && next.families) delete next.families[key];
  if (kind === "side" && next.sides) delete next.sides[key];
  if (kind === "template") next.templates = (next.templates ?? []).filter((t) => t.id !== key);
  if (kind === "liked" && next.likes) for (const n of Object.values(next.likes)) delete n.families[key];
  if (kind === "shape" && next.likes?.[key]) delete next.likes[key].shape;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** a locked tanda is a half vote for its family and its sides (an unlock teaches nothing) */
export function learnFromLock(
  L: LearnedPreferences | undefined,
  t: Pick<Tanda, "songs">,
  locked: boolean,
  at = new Date().toISOString(),
  playlistId = "",
): LearnedPreferences {
  const next: LearnedPreferences = structuredClone(L ?? emptyLearned());
  if (!locked || !t.songs.length) return next;
  next.families ??= {};
  next.sides ??= {};
  const k = familyKey(t.songs[0]!);
  next.families[k] = clamp((next.families[k] ?? 0) + 0.5, LEARN_LIMITS.familyMin, LEARN_LIMITS.familyMax);
  for (const s of t.songs)
    next.sides[s.id] = clamp((next.sides[s.id] ?? 0) + 0.5, LEARN_LIMITS.sideMin, LEARN_LIMITS.sideMax);
  next.edits = [
    { at, playlistId, added: t.songs.map((s) => s.id), removed: [], note: "locked a tanda" },
    ...(next.edits ?? []),
  ].slice(0, 100);
  next.updatedAt = at;
  return next;
}
