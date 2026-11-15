import { familyKey, yearBand } from "./learn";
import { databasePrior, popularityOn, withPopularityPrior } from "./popularity";
import type { Phase, Song, Tanda } from "./types";

/**
 * Dancer favourites (2026-11, "a tracker of which songs are liked most by dancers; know them and use them in place").
 * Per DJ (stored with the DJ's memory, never the repo; local-first like `learned`), from four optional signals that
 * all work offline:
 *
 *  - the booth's floor reaction: the DJ taps "Floor full ♥", "OK" or "Floor emptied" on the Now card or a set-list
 *    tanda, kept per song and per tanda with the night id, the time and the slot role (the tanda's phase);
 *  - dancer hearts from a room (anonymous counts, one per dancer per song per night, only with a rooms server);
 *  - repeat evidence: the nights a song was played and not skipped or swapped out;
 *  - a seed prior: the reference sets' fame (famousRecordings) as a weak prior, so a new profile is not empty.
 *
 * Evidence is kept per song and per family (orchestra + singer + rhythm + year band, likes.ts' key) and per slot role
 * (warm-up, build, peak, cool-down, last tandas). The score is a Bayesian-smoothed rate with a decay:
 *
 *     rate = (full − emptied + K·prior) / (n + K),  every unit weighted 0.5^(age / 180 days)
 *
 * Compose reads it bounded like the learned preferences: a favourite lifts its family up to ×1.8 in the slot role
 * where it worked and a side up to ×2 within its family; "emptied" lowers to ×0.7 at most (never a ban). Weights only:
 * no tanda rule, explicit setting or DJ pin is ever overridden. Only counts are kept: nothing about a dancer.
 */

export type SlotRole = Phase;
export const SLOT_ROLES: readonly SlotRole[] = ["warmup", "build", "peak", "cooldown", "close"] as const;
export type FloorReaction = "full" | "ok" | "emptied";

/** what the tracker shows of a song (kept with the evidence: the list needs no catalogue) */
export interface FavouriteSongMeta {
  title: string;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  year: number | null;
  rhythm: string;
  /** the song's family with its year band (`${familyKey}|${band}`) */
  family: string;
  /** the seed prior: the reference sets' fame (0–5) */
  fame?: number;
}

/** one floor reaction tapped in the booth */
export interface FloorTap {
  at: string;
  nightId: string;
  /** "song": the playing song (Now card, Controls); "tanda": a set-list tanda row */
  scope: "song" | "tanda";
  /** the song (scope song) or the tanda's sides (scope tanda) */
  songIds: string[];
  /** the tanda's family with its year band */
  family: string;
  role: SlotRole;
  /** 0-based tanda index in the night */
  tanda?: number;
  reaction: FloorReaction;
}

export interface DancerFavourites {
  /** "Use dancer favourites when composing" switched off (the evidence is kept, compose ignores it) */
  off?: boolean;
  /** "Use popularity from databases" switched off (popularity.ts: the prior is the fame prior again) */
  popularityOff?: boolean;
  /** the floor reactions (the latest per night and target; a tap on the same reaction again takes it back) */
  taps: FloorTap[];
  /** room hearts: night id → song id → { n: distinct dancers, role } (anonymous counts) */
  hearts: Record<string, Record<string, { n: number; role: SlotRole; at: string }>>;
  /** repeat evidence: night id → the sides played and kept / skipped or swapped out, with their roles */
  plays: Record<string, { at: string; kept: Record<string, SlotRole>; skipped?: Record<string, SlotRole> }>;
  /** what the list shows of each song with evidence */
  songs: Record<string, FavouriteSongMeta>;
  /** a row the DJ reset: evidence before this time is ignored (`song:<id>` / `family:<key>`) */
  reset?: Record<string, string>;
  updatedAt?: string;
}

export const emptyFavourites = (): DancerFavourites => ({ taps: [], hearts: {}, plays: {}, songs: {} });

/** the tuning (exported for the invariants) */
export const FAVOURITE_LIMITS = {
  halfLifeDays: 180,
  /** pseudo-count of the prior */
  k: 2,
  /** prior rate per fame point (fame 5 → 0.4) */
  priorPerFame: 0.08,
  familyMax: 1.8,
  sideMax: 2,
  min: 0.7,
  /** a heart unit: h dancers → min(1, h / heartsFull) of a "full" */
  heartsFull: 3,
  /** a night played and kept / skipped */
  play: 0.25,
  /** taps kept */
  maxTaps: 4000,
} as const;

const VALUE: Record<FloorReaction, number> = { full: 1, ok: 0, emptied: -1 };

/** [positive, negative, n, prior] — decayed sums per role */
export type Evidence = [number, number, number, number];
/** what compose reads: decayed evidence per song and per family, per role (built from the tracker at request time) */
export interface FavouriteTable {
  v: 1;
  off?: boolean;
  /** popularity from databases on (popularity.ts `withPopularity`; read where the data is loaded) */
  pop?: 1;
  sides: Record<string, Partial<Record<SlotRole, Evidence>>>;
  families: Record<string, Partial<Record<SlotRole, Evidence>>>;
}

/** the year band of one song's year */
export const songBand = (s: Pick<Song, "year" | "yearApprox">) =>
  yearBand(s.year && !s.yearApprox ? [s.year, s.year] : null);
/** a song's family with its year band */
export const songFamily = (s: Pick<Song, "orchestraId" | "singer" | "rhythm" | "year" | "yearApprox">) =>
  `${familyKey(s)}|${songBand(s)}`;
/** a tanda's family with its year band (likes.ts likeFamilyKey without the import cycle) */
export function tandaFamily(t: Pick<Tanda, "songs" | "rhythm" | "yearRange">): string {
  const s = t.songs.find((x) => x.title.toLowerCase() !== "la cumparsita") ?? t.songs[0];
  if (!s) return "";
  const ys = t.songs.map((x) => x.year).filter((y): y is number => !!y);
  const years = t.yearRange ?? (ys.length ? ([Math.min(...ys), Math.max(...ys)] as [number, number]) : null);
  return `${familyKey({ ...s, rhythm: t.rhythm })}|${yearBand(years)}`;
}

export const metaOf = (s: Song): FavouriteSongMeta => ({
  title: s.title,
  orchestra: s.orchestra,
  orchestraId: s.orchestraId,
  singer: s.singer ?? null,
  year: s.year ?? null,
  rhythm: s.rhythm,
  family: songFamily(s),
  ...(s.fame ? { fame: s.fame } : {}),
});

const now = () => new Date().toISOString();
const clone = (F?: DancerFavourites | null): DancerFavourites => {
  const e = emptyFavourites();
  if (!F) return e;
  return {
    ...F,
    taps: [...(F.taps ?? [])],
    hearts: { ...(F.hearts ?? {}) },
    plays: { ...(F.plays ?? {}) },
    songs: { ...(F.songs ?? {}) },
    ...(F.reset ? { reset: { ...F.reset } } : {}),
  };
};
const tapTarget = (t: Pick<FloorTap, "nightId" | "scope" | "songIds" | "tanda">) =>
  t.scope === "tanda" ? `${t.nightId}#t${t.tanda ?? t.songIds.join(",")}` : `${t.nightId}#s${t.songIds[0]}`;

/** the reaction recorded tonight on a song or a tanda (for the pressed state of the buttons) */
export function reactionOf(
  F: DancerFavourites | null | undefined,
  q: { nightId: string; scope: "song" | "tanda"; songId?: string; tanda?: number },
): FloorReaction | undefined {
  const key = tapTarget({ ...q, songIds: q.songId ? [q.songId] : [] });
  for (let i = (F?.taps ?? []).length - 1; i >= 0; i--) {
    const t = F!.taps[i]!;
    if (tapTarget(t) === key) return t.reaction;
  }
  return undefined;
}

/**
 * Record a floor reaction on a song (the playing one) or a tanda (a set-list row): it replaces this night's earlier
 * reaction on the same target; the same reaction again takes it back (a one-tap toggle).
 */
export function recordFloor(
  F: DancerFavourites | null | undefined,
  o: {
    nightId: string;
    scope: "song" | "tanda";
    /** the playing song (scope song) */
    song?: Song;
    /** the tanda it sits in (the role, the family, and the sides for scope tanda) */
    tanda: Pick<Tanda, "songs" | "rhythm" | "yearRange" | "phase">;
    tandaIndex?: number;
    reaction: FloorReaction;
    at?: string;
  },
): DancerFavourites {
  const out = clone(F);
  const songs =
    o.scope === "song" ? (o.song ? [o.song] : []) : o.tanda.songs.filter((s) => s.rhythm !== "other");
  if (!songs.length) return out;
  const tap: FloorTap = {
    at: o.at ?? now(),
    nightId: o.nightId,
    scope: o.scope,
    songIds: songs.map((s) => s.id),
    family: tandaFamily(o.tanda),
    role: o.tanda.phase ?? "build",
    ...(o.tandaIndex !== undefined ? { tanda: o.tandaIndex } : {}),
    reaction: o.reaction,
  };
  const key = tapTarget(tap);
  const prev = reactionOf(out, {
    nightId: o.nightId,
    scope: o.scope,
    songId: songs[0]!.id,
    tanda: o.tandaIndex,
  });
  out.taps = out.taps.filter((t) => tapTarget(t) !== key);
  if (prev !== o.reaction) out.taps.push(tap);
  if (out.taps.length > FAVOURITE_LIMITS.maxTaps) out.taps = out.taps.slice(-FAVOURITE_LIMITS.maxTaps);
  for (const s of songs) out.songs[s.id] = metaOf(s);
  out.updatedAt = tap.at;
  return out;
}

/**
 * Room hearts for one night: `counts` is the room's tally (distinct dancers per song). A tally only ever grows, so
 * the larger count is kept: polling it again counts nothing twice.
 */
export function recordHearts(
  F: DancerFavourites | null | undefined,
  nightId: string,
  counts: Record<string, number>,
  sides: (id: string) => { song: Song; role: SlotRole } | undefined,
  at = now(),
): DancerFavourites {
  const out = clone(F);
  const night = { ...(out.hearts[nightId] ?? {}) };
  let changed = false;
  for (const [id, n0] of Object.entries(counts)) {
    const n = Math.max(0, Math.floor(Number(n0) || 0));
    if (!n || (night[id]?.n ?? 0) >= n) continue;
    const side = sides(id);
    if (!side) continue;
    night[id] = { n, role: side.role, at: night[id]?.at ?? at };
    out.songs[id] = metaOf(side.song);
    changed = true;
  }
  if (!changed) return F ? (F as DancerFavourites) : out;
  out.hearts[nightId] = night;
  out.updatedAt = at;
  return out;
}

/** Repeat evidence: the night's sides played and kept, and those skipped or swapped out (replaces the night's record). */
export function recordPlays(
  F: DancerFavourites | null | undefined,
  nightId: string,
  kept: Array<{ song: Song; role: SlotRole }>,
  skipped: Array<{ song: Song; role: SlotRole }> = [],
  at = now(),
): DancerFavourites {
  const out = clone(F);
  const k: Record<string, SlotRole> = {};
  const s: Record<string, SlotRole> = {};
  for (const x of kept) k[x.song.id] = x.role;
  for (const x of skipped) if (!k[x.song.id]) s[x.song.id] = x.role;
  if (!Object.keys(k).length && !Object.keys(s).length) return out;
  out.plays[nightId] = {
    at: out.plays[nightId]?.at ?? at,
    kept: k,
    ...(Object.keys(s).length ? { skipped: s } : {}),
  };
  // the list names the kept sides only when they carry other evidence; the meta is cheap, keep it
  for (const x of [...kept, ...skipped]) out.songs[x.song.id] ??= metaOf(x.song);
  out.updatedAt = at;
  return out;
}

/** reset a row of the list (its evidence until now is ignored from here on) */
export function resetFavourite(
  F: DancerFavourites | null | undefined,
  key: `song:${string}` | `family:${string}`,
  at = now(),
): DancerFavourites {
  const out = clone(F);
  out.reset = { ...(out.reset ?? {}), [key]: at };
  out.updatedAt = at;
  return out;
}

export const setFavouritesOff = (F: DancerFavourites | null | undefined, off: boolean): DancerFavourites => {
  const out = clone(F);
  if (off) out.off = true;
  else delete out.off;
  return out;
};

/* ---------- the math ---------- */

/** the decay of a unit `ageDays` old (half-life 180 days) */
export const decay = (ageDays: number) => 0.5 ** (Math.max(0, ageDays) / FAVOURITE_LIMITS.halfLifeDays);
/** the prior rate of a fame (0–5) */
export const priorOf = (fame?: number) =>
  Math.min(0.4, Math.max(0, (fame ?? 0) * FAVOURITE_LIMITS.priorPerFame));
/** the smoothed rate of decayed evidence: (pos − neg + K·prior) / (n + K), in −1…1 */
export function smoothedRate(e: Evidence | undefined): number {
  if (!e) return 0;
  const [p, q, n, prior] = e;
  const K = FAVOURITE_LIMITS.k;
  return (p - q + K * prior) / (n + K);
}
/** a family's compose factor from its rate: up to ×1.8, down to ×0.7 */
export const familyFactorOf = (r: number) =>
  r >= 0 ? Math.min(FAVOURITE_LIMITS.familyMax, 1 + 0.8 * r) : Math.max(FAVOURITE_LIMITS.min, 1 + 0.3 * r);
/** a side's compose factor within its family: up to ×2, down to ×0.7 */
export const sideFactorOf = (r: number) =>
  r >= 0 ? Math.min(FAVOURITE_LIMITS.sideMax, 1 + r) : Math.max(FAVOURITE_LIMITS.min, 1 + 0.3 * r);

const days = (from: string, to: number) => (to - Date.parse(from)) / 864e5;

/** one unit of evidence */
interface Unit {
  key: string;
  role: SlotRole;
  v: number;
  /** its weight in n (a heart or a play counts for less than a tap) */
  w: number;
  at: string;
  night: string;
  kind: "tap" | "heart" | "play";
  reaction?: FloorReaction;
  hearts?: number;
  fame?: number;
}

/** every unit of evidence the tracker holds, per song (`song:<id>`) and per family (`family:<key>`) */
function units(F: DancerFavourites): Unit[] {
  const out: Unit[] = [];
  const meta = F.songs ?? {};
  const byNight = new Map<string, FloorTap[]>();
  for (const t of F.taps ?? []) {
    const arr = byNight.get(t.nightId) ?? [];
    arr.push(t);
    byNight.set(t.nightId, arr);
  }
  for (const [night, taps] of byNight) {
    const songTaps = new Map<string, FloorTap>();
    for (const t of taps) if (t.scope === "song" && t.songIds[0]) songTaps.set(t.songIds[0], t);
    // songs: their own tap, else their tanda's
    const songDone = new Set<string>();
    for (const [id, t] of songTaps) {
      out.push(unit(`song:${id}`, t, meta[id]?.fame));
      songDone.add(id);
    }
    for (const t of taps)
      if (t.scope === "tanda")
        for (const id of t.songIds)
          if (!songDone.has(id)) {
            out.push(unit(`song:${id}`, t, meta[id]?.fame));
            songDone.add(id);
          }
    // families: one unit per night and role, the tanda taps' mean (else the song taps')
    const fam = new Map<string, FloorTap[]>();
    for (const t of taps) {
      const k = `${t.family}#${t.role}`;
      const arr = fam.get(k) ?? [];
      arr.push(t);
      fam.set(k, arr);
    }
    for (const arr of fam.values()) {
      const tandaTaps = arr.filter((t) => t.scope === "tanda");
      const use = tandaTaps.length ? tandaTaps : arr;
      const v = use.reduce((a, t) => a + VALUE[t.reaction], 0) / use.length;
      const last = use[use.length - 1]!;
      const fames = last.songIds.map((id) => meta[id]?.fame ?? 0);
      out.push({
        key: `family:${last.family}`,
        role: last.role,
        v,
        w: 1,
        at: last.at,
        night,
        kind: "tap",
        reaction: v > 0.33 ? "full" : v < -0.33 ? "emptied" : "ok",
        fame: fames.length ? fames.reduce((a, b) => a + b, 0) / fames.length : 0,
      });
    }
  }
  for (const [night, songs] of Object.entries(F.hearts ?? {})) {
    const famBest = new Map<string, Unit>();
    for (const [id, h] of Object.entries(songs)) {
      const v = Math.min(1, h.n / FAVOURITE_LIMITS.heartsFull);
      const u: Unit = {
        key: `song:${id}`,
        role: h.role,
        v,
        w: v,
        at: h.at,
        night,
        kind: "heart",
        hearts: h.n,
      };
      u.fame = meta[id]?.fame;
      out.push(u);
      const fk = meta[id]?.family;
      if (!fk) continue;
      const k = `${fk}#${h.role}`;
      const prev = famBest.get(k);
      famBest.set(k, {
        ...u,
        key: `family:${fk}`,
        v: Math.max(v, prev?.v ?? 0),
        w: Math.max(v, prev?.w ?? 0),
        hearts: (prev?.hearts ?? 0) + h.n,
      });
    }
    out.push(...famBest.values());
  }
  for (const [night, p] of Object.entries(F.plays ?? {})) {
    const fams = new Map<string, Unit>();
    const add = (id: string, role: SlotRole, kept: boolean) => {
      const u: Unit = {
        key: `song:${id}`,
        role,
        v: kept ? FAVOURITE_LIMITS.play : 0,
        w: FAVOURITE_LIMITS.play,
        at: p.at,
        night,
        kind: "play",
        fame: meta[id]?.fame,
      };
      out.push(u);
      const fk = meta[id]?.family;
      if (fk && !fams.has(`${fk}#${role}`)) fams.set(`${fk}#${role}`, { ...u, key: `family:${fk}` });
    };
    for (const [id, role] of Object.entries(p.kept ?? {})) add(id, role, true);
    for (const [id, role] of Object.entries(p.skipped ?? {})) add(id, role, false);
    out.push(...fams.values());
  }
  const reset = F.reset ?? {};
  return out.filter((u) => !reset[u.key] || Date.parse(u.at) > Date.parse(reset[u.key]!));
}

function unit(key: string, t: FloorTap, fame?: number): Unit {
  return {
    key,
    role: t.role,
    v: VALUE[t.reaction],
    w: 1,
    at: t.at,
    night: t.nightId,
    kind: "tap",
    reaction: t.reaction,
    fame,
  };
}

/** The table compose reads: the tracker's evidence decayed to `at`, per song and per family, per role. */
export function favouriteTable(
  F: DancerFavourites | null | undefined,
  at: number = Date.now(),
): FavouriteTable {
  const t: FavouriteTable = { v: 1, sides: {}, families: {} };
  if (!F) return t;
  if (F.off) t.off = true;
  for (const u of units(F)) {
    const d = decay(days(u.at, at));
    const [kind, ...rest] = u.key.split(":");
    const key = rest.join(":");
    const m = kind === "song" ? t.sides : t.families;
    const row = m[key] ?? {};
    m[key] = row;
    const e = row[u.role] ?? [0, 0, 0, priorOf(u.fame)];
    row[u.role] = e;
    if (u.v > 0) e[0] += u.v * d;
    else if (u.v < 0) e[1] += -u.v * d;
    e[2] += u.w * d;
    e[3] = Math.max(e[3], priorOf(u.fame));
  }
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
  for (const m of [t.sides, t.families])
    for (const row of Object.values(m))
      for (const e of Object.values(row)) if (e) for (let i = 0; i < 4; i++) e[i] = r4(e[i]!);
  return t;
}

const tableOn = (T: FavouriteTable | null | undefined): T is FavouriteTable => !!T && !T.off;

/** what ComposeOptions.favourites may hold: the table (the web builds it at request time) or the tracker itself */
export function asFavouriteTable(
  x: FavouriteTable | DancerFavourites | null | undefined,
  at: number = Date.now(),
): FavouriteTable | undefined {
  if (!x) return undefined;
  if ((x as DancerFavourites).taps) return favouriteTable(x as DancerFavourites, at);
  const T = x as FavouriteTable;
  return T.sides && T.families ? T : undefined;
}
/** the table is on and holds evidence (compose stays exactly as without favourites otherwise) */
export const favouritesActive = (T: FavouriteTable | null | undefined): T is FavouriteTable =>
  tableOn(T) && (Object.keys(T.sides).length > 0 || Object.keys(T.families).length > 0 || popularityOn(T));

const famIndex = new WeakMap<FavouriteTable, Map<string, Array<[number | null, string]>>>();
/** families by key without the band: [band start (null = undated), full key] */
function familiesByKey(T: FavouriteTable) {
  let m = famIndex.get(T);
  if (m) return m;
  m = new Map();
  for (const k4 of Object.keys(T.families)) {
    const i = k4.lastIndexOf("|");
    const key = k4.slice(0, i);
    const band = k4.slice(i + 1) ? Number(k4.slice(i + 1)) : null;
    const arr = m.get(key) ?? [];
    arr.push([band, k4]);
    m.set(key, arr);
  }
  famIndex.set(T, m);
  return m;
}

/** a family's evidence in a role, its year bands that overlap `years` summed (all bands when undated) */
export function familyEvidence(
  T: FavouriteTable | null | undefined,
  key: string,
  role: SlotRole,
  years?: readonly [number, number] | null,
): Evidence | undefined {
  if (!tableOn(T)) return undefined;
  const rows = familiesByKey(T).get(key);
  if (!rows) return undefined;
  let e: Evidence | undefined;
  for (const [band, k4] of rows) {
    if (band !== null && years && !(years[0] <= band + 4 && years[1] >= band)) continue;
    const x = T.families[k4]?.[role];
    if (!x) continue;
    e = e ? [e[0] + x[0], e[1] + x[1], e[2] + x[2], Math.max(e[3], x[3])] : [...x];
  }
  return e && e[2] > 0 ? e : undefined;
}

/** the compose factor of a family (`familyKey` without band) in a slot role; 1 when nothing is known there */
export function favouriteFamilyFactor(
  T: FavouriteTable | null | undefined,
  key: string,
  role: SlotRole,
  years?: readonly [number, number] | null,
): number {
  const e = familyEvidence(T, key, role, years);
  return e ? familyFactorOf(smoothedRate(e)) : 1;
}

/** the compose factor of a side within its family in a slot role; 1 when nothing is known there */
export function favouriteSideFactor(
  T: FavouriteTable | null | undefined,
  id: string,
  role: SlotRole,
): number {
  if (!tableOn(T)) return 1;
  const e = T.sides[id]?.[role];
  if (e && e[2] > 0) return sideFactorOf(smoothedRate(withPopularityPrior(T, e, id, role)));
  // popularity from databases (popularity.ts): a side without evidence of the DJ's own, by its prior alone
  const p = databasePrior(T, id, role);
  return p > 0 ? sideFactorOf(p) : 1;
}

/** a side is a crowd favourite (♥) in any role / in this role: its smoothed rate is clearly positive */
export const FAVOURITE_BADGE_RATE = 0.25;
export function isFavouriteSide(T: FavouriteTable | null | undefined, id: string, role?: SlotRole): boolean {
  if (!tableOn(T)) return false;
  const row = T.sides[id];
  if (!row) return false;
  const roles = role ? [role] : SLOT_ROLES;
  return roles.some((r) => {
    const e = row[r];
    return (
      !!e && e[2] > 0 && e[0] > 0 && smoothedRate(withPopularityPrior(T, e, id, r)) >= FAVOURITE_BADGE_RATE
    );
  });
}

/** one family the draw weighed with a favourite factor (PlaylistStats.favourites) */
export interface FavouriteTrace {
  /** `familyKey` (no band) */
  key: string;
  role: SlotRole;
  slot: number;
  factor: number;
  rankWith: number;
  rankWithout: number;
  shareWith: number;
  shareWithout: number;
}

/** the draw's trace: one entry per family and role, the slot where the favourite moved it most */
export function traceFavourites(
  trace: FavouriteTrace[],
  slot: number,
  role: SlotRole,
  rows: Array<{ key: string; w: number; f: number }>,
) {
  if (!rows.some((r) => r.f !== 1)) return;
  const withW = rows.map((r) => r.w);
  const without = rows.map((r) => r.w / r.f);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0) || 1;
  const sW = sum(withW);
  const s0 = sum(without);
  const rank = (xs: number[], i: number) => xs.filter((x, j) => x > xs[i]! || (x === xs[i] && j < i)).length;
  rows.forEach((r, i) => {
    if (r.f === 1) return;
    const e: FavouriteTrace = {
      key: r.key,
      role,
      slot,
      factor: Math.round(r.f * 1000) / 1000,
      rankWith: rank(withW, i),
      rankWithout: rank(without, i),
      shareWith: Math.round((withW[i]! / sW) * 1e4) / 1e4,
      shareWithout: Math.round((without[i]! / s0) * 1e4) / 1e4,
    };
    const at = trace.findIndex((x) => x.key === e.key && x.role === e.role);
    const gain = (x: FavouriteTrace) => x.rankWithout - x.rankWith + (x.shareWith - x.shareWithout);
    if (at < 0) trace.push(e);
    else if (gain(e) > gain(trace[at]!)) trace[at] = e;
  });
}

/* ---------- the list (Database → Memory) ---------- */

export interface FavouriteRow {
  /** `song:<id>` / `family:<key>` */
  key: string;
  kind: "song" | "family";
  role: SlotRole;
  /** −1…1, the smoothed decayed rate */
  rate: number;
  hearts: number;
  full: number;
  ok: number;
  emptied: number;
  /** nights with any evidence (taps, hearts, plays) */
  nights: number;
  /** nights played and kept */
  kept: number;
  lastAt: string;
  /** the song (kind song) or one song of the family */
  song?: FavouriteSongMeta;
  /** the family key (kind family) */
  family?: string;
}

/** every song and family with evidence, per role, best first (raw counts for the evidence line, decayed rate) */
export function favouriteRows(
  F: DancerFavourites | null | undefined,
  at: number = Date.now(),
): FavouriteRow[] {
  if (!F) return [];
  const T = favouriteTable({ ...F, off: false }, at);
  const rows = new Map<string, FavouriteRow & { nightSet: Set<string> }>();
  const famSong = new Map<string, FavouriteSongMeta>();
  for (const m of Object.values(F.songs ?? {})) if (!famSong.has(m.family)) famSong.set(m.family, m);
  for (const u of units(F)) {
    const id = `${u.key}#${u.role}`;
    const [kind, ...rest] = u.key.split(":");
    const k = rest.join(":");
    let r = rows.get(id);
    if (!r) {
      const e = (kind === "song" ? T.sides : T.families)[k]?.[u.role];
      r = {
        key: u.key,
        kind: kind as "song" | "family",
        role: u.role,
        rate: Math.round(smoothedRate(e) * 100) / 100,
        hearts: 0,
        full: 0,
        ok: 0,
        emptied: 0,
        nights: 0,
        kept: 0,
        lastAt: u.at,
        nightSet: new Set(),
        ...(kind === "song" ? { song: F.songs?.[k] } : { family: k, song: famSong.get(k) }),
      };
      rows.set(id, r);
    }
    r.nightSet.add(u.night);
    if (u.at > r.lastAt) r.lastAt = u.at;
    if (u.kind === "heart") r.hearts += u.hearts ?? 0;
    else if (u.kind === "play") {
      if (u.v > 0) r.kept += 1;
    } else if (u.reaction === "full") r.full += 1;
    else if (u.reaction === "emptied") r.emptied += 1;
    else r.ok += 1;
  }
  return [...rows.values()]
    .map(({ nightSet, ...r }) => ({ ...r, nights: nightSet.size }))
    .filter((r) => r.full + r.ok + r.emptied + r.hearts > 0 || r.kept >= 2)
    .sort((a, b) => b.rate - a.rate || b.full + b.hearts - (a.full + a.hearts) || a.key.localeCompare(b.key));
}

/** "♥ 7 · full 5 · emptied 0 · 3 nights" */
export const evidenceLine = (r: Pick<FavouriteRow, "hearts" | "full" | "emptied" | "nights">) =>
  `♥ ${r.hearts} · full ${r.full} · emptied ${r.emptied} · ${r.nights} night${r.nights === 1 ? "" : "s"}`;

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** the list as CSV (one row per song or family and role) */
export function favouritesCsv(rows: FavouriteRow[]): string {
  const head = [
    "kind",
    "role",
    "title",
    "orchestra",
    "singer",
    "year",
    "rhythm",
    "family",
    "score",
    "hearts",
    "full",
    "ok",
    "emptied",
    "nights",
    "kept",
    "last",
  ];
  const lines = rows.map((r) =>
    [
      r.kind,
      r.role,
      r.kind === "song" ? r.song?.title : "",
      r.song?.orchestra,
      r.song?.singer,
      r.kind === "song" ? r.song?.year : r.family?.split("|")[3],
      r.song?.rhythm,
      r.kind === "family" ? r.family : r.song?.family,
      r.rate,
      r.hearts,
      r.full,
      r.ok,
      r.emptied,
      r.nights,
      r.kept,
      r.lastAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

/** a dancer-favourites store read from anywhere (memory, a request): anything odd is dropped */
export function normalizeFavourites(x: unknown): DancerFavourites | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Partial<DancerFavourites>;
  const obj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, never>) : {};
  return {
    ...(o.off ? { off: true } : {}),
    ...(o.popularityOff ? { popularityOff: true } : {}),
    taps: Array.isArray(o.taps)
      ? o.taps.filter(
          (t) =>
            t &&
            typeof t.nightId === "string" &&
            Array.isArray(t.songIds) &&
            (t.reaction === "full" || t.reaction === "ok" || t.reaction === "emptied") &&
            SLOT_ROLES.includes(t.role),
        )
      : [],
    hearts: obj(o.hearts),
    plays: obj(o.plays),
    songs: obj(o.songs),
    ...(o.reset ? { reset: obj(o.reset) } : {}),
    ...(typeof o.updatedAt === "string" ? { updatedAt: o.updatedAt } : {}),
  };
}

/** a table from a request body: numbers only, anything else dropped */
export function cleanFavouriteTable(x: unknown): FavouriteTable | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Partial<FavouriteTable>;
  const clean = (m: unknown) => {
    const out: FavouriteTable["sides"] = {};
    if (!m || typeof m !== "object") return out;
    for (const [k, row] of Object.entries(m as Record<string, unknown>)) {
      if (!row || typeof row !== "object") continue;
      const r: Partial<Record<SlotRole, Evidence>> = {};
      for (const role of SLOT_ROLES) {
        const e = (row as Record<string, unknown>)[role];
        if (Array.isArray(e) && e.length === 4 && e.every((n) => Number.isFinite(n) && n >= 0))
          r[role] = [e[0], e[1], e[2], Math.min(0.4, e[3])] as Evidence;
      }
      if (Object.keys(r).length) out[k.slice(0, 200)] = r;
    }
    return out;
  };
  return {
    v: 1,
    ...(o.off ? { off: true } : {}),
    ...(o.pop === 1 ? { pop: 1 as const } : {}),
    sides: clean(o.sides),
    families: clean(o.families),
  };
}
