import { normTitle } from "./energy";
import { emptyLearned, familyKey, praiseList } from "./learn";
import type { LearnedPreferences, Playlist, Song, Tanda, TandaPraise } from "./types";

/**
 * 2026-11 — the DJ's praise of a tanda. The DJ, from the booth: "The 14th Troilo tanda was amazing. It finished so
 * nicely, the tanda started and connected so nicely." That is feedback of greatness, not a rule: a praised tanda is
 * one entry (TandaPraise: the night, the tanda, its sides, its role, the DJ's words, and its neighbours and cortinas
 * for context) kept in the repo-level store (data/knowledge/dj_preferences.json `praise`, the featured night) or in
 * the DJ's memory (`learned.praise`, the Booth's "Praise this tanda ★").
 *
 * Compose reads it exactly as one "Floor full ♥" tapped on that tanda in its slot role: one unit of evidence for its
 * family and for each of its sides, bounded and decaying like a tap (favourites.ts `withPraise`). It sets no order,
 * no connection and no cortina. Nothing here names a title or an orchestra.
 */

const isCump = (s: Pick<Song, "title">) => normTitle(s.title) === "la cumparsita";
const sidesOf = (t: Pick<Tanda, "songs">) => t.songs.filter((s) => !isCump(s));

/** a tanda's family as the praise reads it: its first side's orchestra and singer, the tanda's rhythm */
export function tandaFamilyKey(t: Pick<Tanda, "songs" | "rhythm"> | null | undefined): string | null {
  if (!t) return null;
  const s = sidesOf(t)[0] ?? t.songs[0];
  return s ? familyKey({ ...s, rhythm: t.rhythm as Song["rhythm"] }) : null;
}

const yearsOf = (t: Pick<Tanda, "songs" | "yearRange">): [number, number] | null => {
  if (t.yearRange) return [t.yearRange[0], t.yearRange[1]];
  const ys = sidesOf(t)
    .map((s) => (s.year && !s.yearApprox ? s.year : 0))
    .filter(Boolean);
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
};

/** the praise entry of tanda `index` (0-based) of a night: the same shape in the repo store and the DJ's memory */
export function praiseFromNight(
  p: Pick<Playlist, "id" | "tandas">,
  index: number,
  reason: string,
  o: { at?: string; source?: "featured" | "dj"; note?: string } = {},
): TandaPraise {
  const t = p.tandas[index];
  if (!t) throw new Error(`no tanda ${index} in ${p.id}`);
  const prev = index > 0 ? p.tandas[index - 1] : undefined;
  const next = p.tandas[index + 1];
  const sides = sidesOf(t);
  const note = o.note?.trim().slice(0, 200);
  return {
    id: `${p.id}#${index}`,
    nightId: p.id,
    tanda: index,
    rhythm: t.rhythm,
    songIds: sides.map((s) => s.id),
    family: tandaFamilyKey(t) ?? "",
    years: yearsOf(t),
    role: t.phase ?? "build",
    prevFamily: tandaFamilyKey(prev),
    prevRole: prev?.phase ?? null,
    prevCortinaId: prev?.cortina?.id ?? null,
    nextCortinaId: t.cortina?.id ?? null,
    nextFamily: tandaFamilyKey(next),
    nextRole: next?.phase ?? null,
    reason: reason.trim().slice(0, 500),
    ...(note ? { note } : {}),
    name: `${[...new Set(sides.map((s) => s.orchestra))].join(" + ")} · ${sides.map((s) => s.title).join(", ")}`,
    at: o.at ?? new Date().toISOString(),
    ...(o.source ? { source: o.source } : {}),
  };
}

/** the praise recorded for tanda `index` of a night, if any */
export const praiseOf = (
  L: LearnedPreferences | null | undefined,
  nightId: string,
  index: number,
): TandaPraise | undefined => praiseList(L).find((p) => p.nightId === nightId && p.tanda === index);

/** record a praise (the Booth's action): the same tanda praised again takes it back (a one-tap toggle) */
export function learnFromPraise(
  L: LearnedPreferences | null | undefined,
  p: TandaPraise,
): LearnedPreferences {
  const next: LearnedPreferences = structuredClone(L ?? emptyLearned());
  const had = (next.praise ?? []).some((x) => x.id === p.id);
  next.praise = had
    ? (next.praise ?? []).filter((x) => x.id !== p.id)
    : [p, ...(next.praise ?? [])].slice(0, 100);
  if (!next.praise.length) delete next.praise;
  next.updatedAt = p.at;
  return next;
}
