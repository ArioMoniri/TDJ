import { normTitle } from "./energy";
import type {
  AgentMemory,
  LearnedPreferences,
  Phase,
  Playlist,
  RepoLearnedOverrides,
  Song,
  Tanda,
  TandaPraise,
} from "./types";

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
    // a tanda the DJ approved for one night against a rule ("Do it as I said") is never a template
    if (t.pinned?.exception) continue;
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
  // the DJ's overrides of the repo-level store (Database → Memory: off, reweighted, deleted)
  base = applyRepoOverrides(base, mine?.repo);
  return {
    sides: { ...(base?.sides ?? {}), ...(mine?.sides ?? {}) },
    families: { ...(base?.families ?? {}), ...(mine?.families ?? {}) },
    templates: [
      ...(mine?.templates ?? []),
      ...(base?.templates ?? []).filter((t) => !mine?.templates?.some((m) => m.id === t.id)),
    ],
    edits: [...(mine?.edits ?? []), ...(base?.edits ?? [])].slice(0, 100),
    ...(base?.likes || mine?.likes ? { likes: { ...(base?.likes ?? {}), ...(mine?.likes ?? {}) } } : {}),
    ...(base?.praise?.length || mine?.praise?.length
      ? {
          praise: [
            ...(mine?.praise ?? []),
            ...(base?.praise ?? []).filter((p) => !mine?.praise?.some((m) => m.id === p.id)),
          ],
        }
      : {}),
  };
}

/**
 * The repo-level store (the featured night's edits) as the DJ left it: none when switched off, a deleted rule gone,
 * a reweighted family or side at the DJ's weight (inside LEARN_LIMITS). Rule ids are learnedRules' (`family:<key>`,
 * `side:<id>`, `template:<id>`). The store object itself is never changed.
 */
export function applyRepoOverrides(
  base: LearnedPreferences | null | undefined,
  repo: RepoLearnedOverrides | undefined,
): LearnedPreferences | undefined {
  if (!base) return undefined;
  if (!repo) return base;
  if (repo.off) return undefined;
  const del = new Set(repo.deleted ?? []);
  const keep = (kind: string, m?: Record<string, number>, lo = -1, hi = 3) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m ?? {})) {
      const id = `${kind}:${k}`;
      if (del.has(id)) continue;
      const w = repo.weights?.[id];
      out[k] = w === undefined || !Number.isFinite(w) ? v : Math.round(clamp(w, lo, hi) * 100) / 100;
    }
    return out;
  };
  return {
    ...base,
    sides: keep("side", base.sides, LEARN_LIMITS.sideMin, LEARN_LIMITS.sideMax),
    families: keep("family", base.families, LEARN_LIMITS.familyMin, LEARN_LIMITS.familyMax),
    templates: (base.templates ?? []).filter((t) => !del.has(`template:${t.id}`)),
    ...(base.praise ? { praise: base.praise.filter((p) => !del.has(`praise:${p.id}`)) } : {}),
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
  /** the slot role: a praised tanda's sides weigh more in its role (praise.ts); unset = no praise */
  role?: Phase,
) => {
  const edit = L?.sides?.[id];
  const pr = role ? praisedSidePoints(L, id, role) : 0;
  const v = pr ? clamp((edit ?? 0) + pr, LEARN_LIMITS.sideMin, LEARN_LIMITS.sideMax) : edit;
  if (v === undefined) return 1;
  if (v < 0) return Math.max(0.9, 1 + 0.1 * v);
  if (s && (!s.spotify?.uri || s.streamSuspect)) return 1;
  return Math.min(1.45, 1 + 0.15 * v);
};
export const learnedFamilyFactor = (
  L: LearnedPreferences | undefined,
  key: string,
  years?: readonly [number, number] | null,
  /** the slot role: a praised tanda's family weighs more in its role (praise.ts); unset = no praise */
  role?: Phase,
) => {
  const v = learnedFamilyWeight(L, key, years, role);
  return v === undefined ? 1 : v >= 0 ? Math.min(1.12, 1 + 0.04 * v) : Math.max(0.9, 1 + 0.1 * v);
};

/**
 * Thumbs up / down on a night (likes.ts). A like gives each of the night's tanda families (orchestra + singer + rhythm
 * + year band) +0.3, a pinned DJ tanda +0.45 — both under a lock (+0.5) and a swap (+1), so one like never outweighs
 * an explicit edit; a dislike −0.1 (scaled down: a dislike nudges, never bans). Summed over the rated nights and
 * capped at +0.9 / −0.3 per family (×1.036 / ×0.97 in its slot), then added to the edits' weight inside LEARN_LIMITS.
 */
export const LIKE_WEIGHTS = { like: 0.3, pinned: 0.45, dislike: -0.1, max: 0.9, min: -0.3 } as const;

/** a year band of five years ("1940" = 1940–44) from a tanda's or a family window's years; "" when undated */
export const yearBand = (years?: readonly [number, number] | null) =>
  years ? String(Math.floor((years[0] + years[1]) / 2 / 5) * 5) : "";

const likeIndex = new WeakMap<LearnedPreferences, Map<string, Array<[number | null, number]>>>();
/** the rated nights summed per family key: [band start (null = any year), weight] */
function likesByFamily(L: LearnedPreferences) {
  let m = likeIndex.get(L);
  if (m) return m;
  m = new Map();
  for (const n of Object.values(L.likes ?? {}))
    for (const [k4, w] of Object.entries(n.families ?? {})) {
      const i = k4.lastIndexOf("|");
      const key = k4.slice(0, i);
      const band = k4.slice(i + 1) ? Number(k4.slice(i + 1)) : null;
      const arr = m.get(key) ?? [];
      const at = arr.find((x) => x[0] === band);
      if (at) at[1] += w;
      else arr.push([band, w]);
      m.set(key, arr);
    }
  likeIndex.set(L, m);
  return m;
}

/** what the rated nights add to a family in these years (capped); undefined when no rated night carries it */
export function likedFamilyWeight(
  L: LearnedPreferences | undefined,
  key: string,
  years?: readonly [number, number] | null,
): number | undefined {
  if (!L?.likes) return undefined;
  const rows = likesByFamily(L).get(key);
  if (!rows) return undefined;
  let sum = 0;
  let hit = false;
  for (const [band, w] of rows)
    if (band === null || !years || (years[0] <= band + 4 && years[1] >= band)) {
      sum += w;
      hit = true;
    }
  if (!hit) return undefined;
  return Math.round(clamp(sum, LIKE_WEIGHTS.min, LIKE_WEIGHTS.max) * 100) / 100;
}

/** a family's learned weight: the DJ's edits plus the rated nights (inside LEARN_LIMITS); undefined = never learned */
export function learnedFamilyWeight(
  L: LearnedPreferences | undefined,
  key: string,
  years?: readonly [number, number] | null,
  /** the slot role: adds what a praised tanda of this family in this role teaches (praise.ts) */
  role?: Phase,
): number | undefined {
  const edit = L?.families?.[key];
  const like = likedFamilyWeight(L, key, years);
  const pr = role ? praisedFamilyPoints(L, key, role) : 0;
  if (like === undefined && !pr) return edit;
  return (
    Math.round(clamp((edit ?? 0) + (like ?? 0) + pr, LEARN_LIMITS.familyMin, LEARN_LIMITS.familyMax) * 100) /
    100
  );
}

/**
 * 2026-11 — learned DJ praise (praise.ts: "the tanda started and connected so nicely"). A praised tanda adds, in its
 * slot role only, +1 to its family and +1 to each of its sides (at most +2 each from praise, inside LEARN_LIMITS: the
 * caps of learnedFamilyFactor / learnedSideFactor still hold), and a link bonus ×1.04 per praised connection (at most
 * ×1.08) for the previous family → this family and this family → the next one in adjacent slots of the same roles;
 * the cortinas in those two gaps ×1.1 at most. Weights only: no rule, setting or pin is overridden.
 */
export const PRAISE_LIMITS = {
  family: 1,
  side: 1,
  familyMax: 2,
  sideMax: 2,
  link: 1.04,
  linkMax: 1.08,
  cortina: 1.1,
  cortinaMax: 1.1,
  /** entries read */
  entries: 100,
} as const;

/** the praise entries compose reads (well-formed ones, at most PRAISE_LIMITS.entries) */
export function praiseList(L: LearnedPreferences | null | undefined): TandaPraise[] {
  const ps = L?.praise;
  if (!Array.isArray(ps) || !ps.length) return [];
  return ps
    .filter(
      (p) =>
        !!p &&
        typeof p.family === "string" &&
        typeof p.role === "string" &&
        Array.isArray(p.songIds) &&
        p.songIds.every((x) => typeof x === "string"),
    )
    .slice(0, PRAISE_LIMITS.entries);
}

/** the family points the praised tandas give `key` in `role` (0 elsewhere) */
export function praisedFamilyPoints(
  L: LearnedPreferences | null | undefined,
  key: string,
  role: Phase,
): number {
  let n = 0;
  for (const p of praiseList(L)) if (p.family === key && p.role === role) n += PRAISE_LIMITS.family;
  return Math.min(PRAISE_LIMITS.familyMax, n);
}

/** the side points the praised tandas give a side in `role` (0 elsewhere) */
export function praisedSidePoints(L: LearnedPreferences | null | undefined, id: string, role: Phase): number {
  let n = 0;
  for (const p of praiseList(L)) if (p.role === role && p.songIds.includes(id)) n += PRAISE_LIMITS.side;
  return Math.min(PRAISE_LIMITS.sideMax, n);
}

/** a tanda as the praise links read it: its family (familyKey) and its slot role */
export type PraiseSlot = { family: string; role: Phase | null | undefined } | null | undefined;
/** the praised connections that join the tanda `prev` to `cur` (adjacent slots, the praised roles) */
function praisedLinks(L: LearnedPreferences | null | undefined, prev: PraiseSlot, cur: PraiseSlot) {
  if (!prev || !cur) return [];
  const out: Array<{ p: TandaPraise; at: "into" | "out" }> = [];
  for (const p of praiseList(L)) {
    if (
      p.family === cur.family &&
      p.role === cur.role &&
      p.prevFamily === prev.family &&
      p.prevRole === prev.role
    )
      out.push({ p, at: "into" });
    if (
      p.family === prev.family &&
      p.role === prev.role &&
      p.nextFamily === cur.family &&
      p.nextRole === cur.role
    )
      out.push({ p, at: "out" });
  }
  return out;
}

/** the link bonus of a family `cur` after the tanda `prev`: ×1.04 per praised connection, ×1.08 at most */
export function praiseLinkFactor(
  L: LearnedPreferences | null | undefined,
  prev: PraiseSlot,
  cur: PraiseSlot,
): number {
  const n = praisedLinks(L, prev, cur).length;
  return n ? Math.min(PRAISE_LIMITS.linkMax, PRAISE_LIMITS.link ** n) : 1;
}

/** the bonus of a cortina in the gap between `before` and `after` when a praised connection there used it */
export function praiseCortinaFactor(
  L: LearnedPreferences | null | undefined,
  before: PraiseSlot,
  after: PraiseSlot,
  cortinaId: string,
): number {
  const n = praisedLinks(L, before, after).filter(({ p, at }) =>
    at === "into" ? p.prevCortinaId === cortinaId : p.nextCortinaId === cortinaId,
  ).length;
  return n ? Math.min(PRAISE_LIMITS.cortinaMax, PRAISE_LIMITS.cortina ** n) : 1;
}

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
  for (const p of praiseList(L).slice(0, 5))
    out.push(
      `praised tanda: ${p.name ?? p.family} (${p.role}): "${p.reason}"${p.note ? ` (${p.note})` : ""}`,
    );
  const rated = Object.values(L.likes ?? {});
  if (rated.length)
    out.push(
      `${rated.filter((n) => n.liked).length} nights you liked, ${rated.filter((n) => !n.liked).length} you disliked (their families weigh a little more / less)`,
    );
  return out;
}
