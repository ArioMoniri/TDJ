import { normTitle } from "./energy";
import { emptyLearned, familyKey, LIKE_WEIGHTS, yearBand } from "./learn";
import type { ComposeOptions, LearnedPreferences, LikedShape, NightLike, Playlist, Tanda } from "./types";

/**
 * Thumbs up / down on a composed night. A like is a moderate vote for each of the night's tanda families (orchestra +
 * singer + rhythm + year band, LIKE_WEIGHTS in learn.ts), more for the tandas the DJ pinned; a dislike a scaled-down
 * vote against them (the DJ's own pinned tandas are spared: the DJ chose them). The night's shape (arc, eras, length,
 * cortina culture) is a "liked shape" signal: two liked nights more than disliked ones with the same setting make it
 * the default for the settings the DJ did not set tonight. Each night's contribution is kept by its id, so a toggle
 * or an undo takes back exactly what the rating added.
 */

const playable = (t: Pick<Tanda, "songs">) => t.songs.filter((s) => normTitle(s.title) !== "la cumparsita");
const pinnedByDj = (t: Pick<Tanda, "pinned" | "locked">) => t.pinned?.by === "dj" || !!t.locked;

/** a tanda's family with its year band: `${orchestraId}|${singer}|${rhythm}|${band}` */
export function likeFamilyKey(t: Pick<Tanda, "songs" | "rhythm" | "yearRange">): string {
  const s = playable(t)[0] ?? t.songs[0];
  if (!s) return "";
  const ys = t.songs.map((x) => x.year).filter((y): y is number => !!y);
  const years = t.yearRange ?? (ys.length ? ([Math.min(...ys), Math.max(...ys)] as [number, number]) : null);
  return `${familyKey({ ...s, rhythm: t.rhythm })}|${yearBand(years)}`;
}

export function shapeOf(o: Partial<ComposeOptions>): LikedShape {
  return {
    hours: o.hours ?? 4,
    eras: [...(o.eras ?? [])],
    arc: o.arc ?? "classic-two-peaks",
    ...(o.arcShape ? { arcShape: o.arcShape } : {}),
    cortinaCultures: [...(o.cortinaCultures ?? [])],
  };
}

/** one rated night's contribution */
export function nightLikeOf(
  p: Pick<Playlist, "name" | "tandas" | "options">,
  liked: boolean,
  at = new Date().toISOString(),
): NightLike {
  const families: Record<string, number> = {};
  for (const t of p.tandas) {
    if (!playable(t).length) continue;
    const k = likeFamilyKey(t);
    const pinned = pinnedByDj(t);
    // a dislike spares what the DJ pinned by hand
    const w = liked ? (pinned ? LIKE_WEIGHTS.pinned : LIKE_WEIGHTS.like) : pinned ? 0 : LIKE_WEIGHTS.dislike;
    if (!w) continue;
    // a family twice in the night counts once (its strongest vote)
    families[k] = liked ? Math.max(families[k] ?? 0, w) : Math.min(families[k] ?? 0, w);
  }
  return { at, liked, name: p.name, families, shape: shapeOf(p.options) };
}

/** rate a night (true / false) or take its rating back (undefined): replaces the night's contribution */
export function learnFromLike(
  L: LearnedPreferences | undefined,
  p: Pick<Playlist, "id" | "name" | "tandas" | "options">,
  liked: boolean | undefined,
  at = new Date().toISOString(),
): LearnedPreferences {
  const next: LearnedPreferences = structuredClone(L ?? emptyLearned());
  const likes = { ...(next.likes ?? {}) };
  delete likes[p.id];
  if (liked !== undefined) likes[p.id] = nightLikeOf(p, liked, at);
  if (Object.keys(likes).length) next.likes = likes;
  else delete next.likes;
  next.updatedAt = at;
  return next;
}

/** the night's rating is gone (the learned store as it was before the rating, `likes` dropped when empty) */
export const forgetLike = (L: LearnedPreferences | undefined, id: string): LearnedPreferences | undefined =>
  L?.likes?.[id]
    ? learnFromLike(L, { id, name: "", tandas: [], options: {} as ComposeOptions }, undefined)
    : L;

const SHAPE_KEYS = ["hours", "eras", "arc", "arcShape", "cortinaCultures"] as const;
/** settings two liked nights (net of disliked ones) agree on: defaults under the DJ's explicit ones and preferences */
export function likedShapeDefaults(L: LearnedPreferences | undefined): Partial<ComposeOptions> {
  const out: Record<string, unknown> = {};
  const nights = Object.values(L?.likes ?? {}).filter((n) => n.shape);
  if (!nights.length) return {};
  for (const k of SHAPE_KEYS) {
    const tally = new Map<string, number>();
    for (const n of nights) {
      const v = n.shape![k];
      if (v === undefined || (Array.isArray(v) && !v.length)) continue;
      const j = JSON.stringify(v);
      tally.set(j, (tally.get(j) ?? 0) + (n.liked ? 1 : -1));
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    if (best[0] && best[0][1] >= 2 && best[0][1] > (best[1]?.[1] ?? 0)) out[k] = JSON.parse(best[0][0]);
  }
  return out as Partial<ComposeOptions>;
}
