import { emptyLearned, familyKey, LEARN_LIMITS } from "./learn";
import type { LearnedPreferences, Song, Tanda } from "./types";

/**
 * Round 22 — what TDJ learned from the DJ's edits, as a list of rules the DJ can read, weight and delete (Database →
 * Memory). A family rule ("Troilo / Fiorentino · tango", +2) and a side rule ("“Toda mi vida”", +1) carry the
 * weights `learnedFamilyFactor` / `learnedSideFactor` read at compose (and the hand-built night's suggestions); a
 * template is a tanda the DJ pinned. Weights stay inside LEARN_LIMITS; 0 is neutral. Locking a tanda counts as a half
 * vote for its family and sides.
 */
export interface LearnedRule {
  /** `family:<key>`, `side:<songId>` or `template:<id>` */
  id: string;
  kind: "family" | "side" | "template";
  label: string;
  /** one line: what the rule does to the next nights */
  detail: string;
  weight: number;
  min: number;
  max: number;
}

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
