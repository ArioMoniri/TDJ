import { normTitle } from "./energy";
import type { AgentMemory, LearnedPreferences, Playlist, Song, Tanda } from "./types";

/**
 * Round 21 — what TDJ learns from the DJ's edits (docs/specs/round21-engine.md §8). Every hand edit of a night (a
 * swapped side, a replaced or pinned tanda, a search-and-swap) is a statement: the sides and families the DJ put in
 * are wanted, the ones they took out a little less. `learnFromEdit` turns the difference between a night before and
 * after an edit into weighted preferences (bounded, so one evening never dominates), and a pinned tanda into a
 * reusable "DJ tanda template". Compose reads them through `ComposeOptions.learned` (the web merges the user's memory)
 * and the repo-level store data/knowledge/dj_preferences.json (the featured night's edits): a chosen side weighs up
 * to ×2.5 in its family, a chosen family up to ×2.2 in its slot, a replaced side or family down to ×0.6. Explicit
 * settings of the night always win; nothing here breaks a rule.
 */
export const LEARN_LIMITS = { sideMax: 3, sideMin: -1, familyMax: 3, familyMin: -1 } as const;

export const familyKey = (s: Pick<Song, "orchestraId" | "singer" | "rhythm">) =>
  `${s.orchestraId}|${normTitle(s.singer ?? "")}|${s.rhythm}`;

export const emptyLearned = (): LearnedPreferences => ({ sides: {}, families: {}, templates: [], edits: [] });

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const sidesOf = (t?: Pick<Tanda, "songs"> | null) =>
  (t?.songs ?? []).filter((s) => normTitle(s.title) !== "la cumparsita");

/** one edit's difference: the sides the DJ added and removed, tanda by tanda (and the opening / closing side) */
export function editDiff(
  before: Pick<Playlist, "tandas" | "opening" | "closing">,
  after: Pick<Playlist, "tandas" | "opening" | "closing">,
): { added: Song[]; removed: Song[]; pinned: Tanda[] } {
  const added: Song[] = [];
  const removed: Song[] = [];
  const n = Math.max(before.tandas.length, after.tandas.length);
  for (let i = 0; i < n; i++) {
    const a = new Set(sidesOf(before.tandas[i]).map((s) => s.id));
    const b = new Set(sidesOf(after.tandas[i]).map((s) => s.id));
    for (const s of sidesOf(after.tandas[i])) if (!a.has(s.id)) added.push(s);
    for (const s of sidesOf(before.tandas[i])) if (!b.has(s.id)) removed.push(s);
  }
  for (const k of ["opening", "closing"] as const) {
    const x = before[k],
      y = after[k];
    if (y && x?.id !== y.id) added.push(y);
    if (x && x.id !== y?.id) removed.push(x);
  }
  // a side that only moved between tandas is neither added nor removed
  const addIds = new Set(added.map((s) => s.id));
  const remIds = new Set(removed.map((s) => s.id));
  const pinned = after.tandas.filter((t, i) => t.pinned && !before.tandas[i]?.pinned);
  return {
    added: added.filter((s) => !remIds.has(s.id)),
    removed: removed.filter((s) => !addIds.has(s.id)),
    pinned,
  };
}

/** fold one edit into the learned preferences (chosen +1, replaced −0.5; bounded) */
export function learnFromEdit(
  learned: LearnedPreferences | undefined,
  before: Pick<Playlist, "tandas" | "opening" | "closing">,
  after: Pick<Playlist, "id" | "tandas" | "opening" | "closing">,
  at = new Date().toISOString(),
  note?: string,
): LearnedPreferences {
  const L: LearnedPreferences = structuredClone(learned ?? emptyLearned());
  L.sides ??= {};
  L.families ??= {};
  L.templates ??= [];
  L.edits ??= [];
  const { added, removed, pinned } = editDiff(before, after);
  if (!added.length && !removed.length && !pinned.length) return L;
  const bump = (m: Record<string, number>, k: string, d: number, lo: number, hi: number) => {
    m[k] = Math.round(clamp((m[k] ?? 0) + d, lo, hi) * 100) / 100;
  };
  for (const s of added) bump(L.sides, s.id, 1, LEARN_LIMITS.sideMin, LEARN_LIMITS.sideMax);
  for (const s of removed) bump(L.sides, s.id, -0.5, LEARN_LIMITS.sideMin, LEARN_LIMITS.sideMax);
  const famA = new Set(added.map(familyKey));
  const famR = new Set(removed.map(familyKey));
  for (const k of famA) bump(L.families, k, 1, LEARN_LIMITS.familyMin, LEARN_LIMITS.familyMax);
  // (a family the DJ took out steps back a full point: ×0.6 in its slot — one evening is a clear statement)
  for (const k of famR)
    if (!famA.has(k)) bump(L.families, k, -1, LEARN_LIMITS.familyMin, LEARN_LIMITS.familyMax);
  for (const t of pinned) {
    const id = `${t.rhythm}:${t.songs.map((s) => s.id).join(",")}`;
    if (L.templates.some((x) => x.id === id)) continue;
    L.templates.push({
      id,
      rhythm: t.rhythm,
      name: `${[...new Set(t.songs.map((s) => s.orchestra))].join(" + ")} · ${t.songs.map((s) => s.title).join(", ")}`,
      songIds: t.songs.map((s) => s.id),
      at,
    });
  }
  L.edits.unshift({
    at,
    playlistId: after.id,
    added: added.map((s) => s.id),
    removed: removed.map((s) => s.id),
    ...(note ? { note } : {}),
  });
  L.edits = L.edits.slice(0, 100);
  L.updatedAt = at;
  return L;
}

/** merge two learned stores (the repo-level one under the DJ's own: the DJ's values win per key) */
export function mergeLearned(
  base?: LearnedPreferences | null,
  mine?: LearnedPreferences | null,
): LearnedPreferences {
  return {
    sides: { ...(base?.sides ?? {}), ...(mine?.sides ?? {}) },
    families: { ...(base?.families ?? {}), ...(mine?.families ?? {}) },
    templates: [
      ...(mine?.templates ?? []),
      ...(base?.templates ?? []).filter((t) => !mine?.templates?.some((m) => m.id === t.id)),
    ],
    edits: [...(mine?.edits ?? []), ...(base?.edits ?? [])].slice(0, 100),
  };
}

/**
 * The compose weights (round 21b, capped so a fresh night stays inside the benchmark band): a chosen side ×1.15 per
 * point up to ×1.45, only when it has a checked Spotify id and is not a suspect stream (a learned side never pulls in
 * one the stream rule would refuse); a replaced side steps back to ×0.9 at most (never enough to push a famous side
 * out for an unknown one); a family ×1.04 per point up to ×1.12, a replaced family down to ×0.9 (a family weight moves the night's
 * orchestras, and so the round 9–17 placement rules — rhythmic runs, the last side — it stays a nudge). The weights carry no
 * era: the DJ's out-of-era tandas teach their families and sides, never "these years are fine" — the night's era
 * settings and the year rules still decide.
 */
export const learnedSideFactor = (
  L: LearnedPreferences | undefined,
  id: string,
  s?: Pick<Song, "spotify" | "streamSuspect">,
) => {
  const v = L?.sides?.[id];
  if (v === undefined) return 1;
  if (v < 0) return Math.max(0.9, 1 + 0.1 * v);
  if (s && (!s.spotify?.uri || s.streamSuspect)) return 1;
  return Math.min(1.45, 1 + 0.15 * v);
};
export const learnedFamilyFactor = (L: LearnedPreferences | undefined, key: string) => {
  const v = L?.families?.[key];
  return v === undefined ? 1 : v >= 0 ? Math.min(1.12, 1 + 0.04 * v) : Math.max(0.9, 1 + 0.1 * v);
};

/** the learned store kept in the DJ's memory (AgentMemory.learned) */
export function rememberEdit(
  memory: AgentMemory,
  before: Pick<Playlist, "tandas" | "opening" | "closing">,
  after: Pick<Playlist, "id" | "tandas" | "opening" | "closing">,
  note?: string,
): AgentMemory {
  const at = new Date().toISOString();
  return { ...memory, learned: learnFromEdit(memory.learned, before, after, at, note), updatedAt: at };
}

/** one line per learned preference, for Settings ("What TDJ learned from your edits") and the AI prompts */
export function describeLearned(
  L: LearnedPreferences | undefined,
  nameOf: (id: string) => string = (x) => x,
): string[] {
  if (!L) return [];
  const out: string[] = [];
  const fams = Object.entries(L.families ?? {}).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of fams) {
    const [orch, singer, rhythm] = k.split("|");
    out.push(
      `${v > 0 ? "more" : "less"} ${nameOf(orch ?? "")}${singer ? ` / ${singer}` : " instrumental"} ${rhythm} (${v > 0 ? "+" : ""}${v})`,
    );
  }
  const sides = Object.entries(L.sides ?? {});
  const up = sides.filter(([, v]) => v > 0).length;
  const down = sides.filter(([, v]) => v < 0).length;
  if (sides.length) out.push(`${up} sides you chose, ${down} you replaced`);
  if (L.templates?.length) out.push(`${L.templates.length} tandas kept as your templates`);
  return out;
}
