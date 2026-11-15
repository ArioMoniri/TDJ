import { normTitle } from "./energy";
import { emptyLearned, familyKey, praiseList } from "./learn";
import { isPeakSlot, templateOrder } from "./order";
import { orderCtxOf } from "./strict";
import type { LearnedPreferences, Playlist, Song, Tanda, TandaPraise } from "./types";

/**
 * 2026-11 — learned DJ praise. The DJ, from the booth: "The 14th Troilo tanda was amazing. It finished so nicely, the
 * tanda started and connected so nicely. Have that also in the learned things." A praised tanda is one entry
 * (TandaPraise: the night, the tanda, its sides in order, the families and cortinas around it, its role, the DJ's
 * words) kept in the repo-level store (data/knowledge/dj_preferences.json `praise`, the featured night) or in the DJ's
 * memory (`learned.praise`, the Booth's "Praise this tanda ★"). It teaches, bounded, never against a rule:
 *
 *  - the tanda: its family and sides in its slot role — DJ evidence in the dancer-favourites table (a "Floor full ♥",
 *    favourites.ts `withPraise`) and the learned family / side weights in that role (learn.ts PRAISE_LIMITS);
 *  - its order: a tanda compose draws with two or more of its sides follows its order (order.ts `templateOrder`: the
 *    opening and closing side first, then the whole order) when that keeps every order rule (`applyPraisedOrders`);
 *  - its connections: the previous family → this family → the next family in adjacent slots of the same roles, and
 *    the cortinas in those gaps (learn.ts praiseLinkFactor / praiseCortinaFactor).
 *
 * The sides are only ever ordered, never added: a praised tanda that mixed vocal and instrumental sides (that night's
 * one-time exception, learnedRules.ts nightExceptionKeys) never makes a composed tanda mix — compose's draw keeps one
 * mode, and the template orders the sides the draw holds. Nothing here names a title or an orchestra.
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

/** the praised order for a tanda of `rhythm` holding `min` (two) or more of a praised tanda's sides */
export function praiseTemplateFor(
  L: LearnedPreferences | null | undefined,
  songs: Array<Pick<Song, "id">>,
  rhythm: string,
  min = 2,
): string[] | undefined {
  const ids = new Set(songs.map((s) => s.id));
  return praiseList(L).find(
    (p) => p.rhythm === rhythm && p.songIds.filter((id) => ids.has(id)).length >= Math.max(1, min),
  )?.songIds;
}

/**
 * A night's tandas with the praised orders applied: a tanda (not the DJ's pinned or locked one) that holds two or
 * more of a praised tanda's sides takes its order when `templateOrder` finds one that keeps the order rules — and,
 * with `accept`, when the night as a whole is no worse for it (compose passes the strict panel). The tandas that do
 * not change are returned as they were.
 */
export function applyPraisedOrders(
  tandas: Tanda[],
  L: LearnedPreferences | null | undefined,
  accept?: (next: Tanda[], cur: Tanda[]) => boolean,
): Tanda[] {
  if (!praiseList(L).length) return tandas;
  let cur = tandas;
  for (let i = 0; i < cur.length; i++) {
    const t = cur[i]!;
    if (t.pinned || t.locked) continue;
    const tpl = praiseTemplateFor(L, t.songs, t.rhythm);
    if (!tpl) continue;
    const songs = templateOrder(t.songs, tpl, isPeakSlot(t), orderCtxOf(cur, i));
    if (!songs || songs.every((s, k) => s.id === t.songs[k]?.id)) continue;
    const next = cur.slice();
    next[i] = { ...t, songs, energyCurve: songs.map((s) => s.energy ?? 50) };
    if (accept && !accept(next, cur)) continue;
    cur = next;
  }
  return cur;
}
