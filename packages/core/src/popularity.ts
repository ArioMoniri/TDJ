import type { Evidence, FavouriteTable, SlotRole } from "./favourites";

/**
 * Dancer popularity from databases (2026-11, "track favourites from databases too, not only from me clicking the
 * love button"). An offline prior per recording (song id), built by scripts/build_popularity.ts into the committed
 * data/knowledge/dancer_popularity.json from evidence of play that is not the DJ's own:
 *
 *  - djSets: the 31 public DJ sets of data/knowledge/reference_sets.json — how often DJs play the recording;
 *  - canonicalTandas: the 218 canonical tandas (weighted by their own popularity 1–5) — and their slot phase;
 *  - famous: the corpus' 1,078 famous recordings (fame 0–5, opener / closer roles);
 *  - setlists: public milonga set lists fetched by the script (chrisjj.com's DJ setblog), the "public DJ play data"
 *    tier the brief asked tango.info for (tango.info publishes no play counts: see the file's `sources`);
 *  - deezer / spotify: listening popularity (Deezer `rank`, Spotify `popularity`) — listening, not dancing: low weight.
 *
 * Each source is normalised by rank percentile within the recording's orchestra and era (0.7) blended with the
 * whole corpus (0.3), so a famous orchestra does not take everything; a source without evidence for a song counts 0,
 * a source that was blocked leaves the weighted mean altogether. Positions in the sets (first tanda, last tanda, the
 * relative slot) and the tandas' phases map onto the slot roles, so a closer is popular as a closer.
 *
 * The favourites tracker reads it in place of the fame-only prior (favourites.ts): prior = 0.4 × score in the slot's
 * role, with the tracker's pseudo-count (K = 2), so 3 "emptied" taps outweigh the most popular recording; with no
 * evidence of the DJ's own, a popular side weighs up to ×1.4 within its family (the DJ's own ♥ goes to ×2). Switched
 * off (DancerFavourites.popularityOff, "Use popularity from databases"), everything is exactly as before.
 *
 * The data reaches the engine through `setDancerPopularity` (src/data.ts buildLoaded, server side); nothing here reads
 * a file, and where it was never loaded (the browser) every lookup is undefined and nothing changes.
 */

export type PopularitySource =
  | "djSets"
  | "canonicalTandas"
  | "famous"
  | "setlists"
  | "tangoInfo"
  | "deezer"
  | "spotify";
export const POPULARITY_SOURCES: readonly PopularitySource[] = [
  "djSets",
  "canonicalTandas",
  "famous",
  "setlists",
  "tangoInfo",
  "deezer",
  "spotify",
] as const;

/**
 * The documented weights: DJ set plays and canonical tandas most, then the famous-recordings list (compiled from DJ
 * play), then public play data (set lists, tango.info), then listening popularity (Deezer, Spotify).
 */
export const POPULARITY_WEIGHTS: Readonly<Record<PopularitySource, number>> = {
  djSets: 0.3,
  canonicalTandas: 0.22,
  famous: 0.14,
  setlists: 0.12,
  tangoInfo: 0.12,
  deezer: 0.05,
  spotify: 0.05,
};

export const POPULARITY_LIMITS = {
  /** the favourites prior of the most popular recording (the fame prior's cap, fame 5 → 0.4) */
  priorMax: 0.4,
  /** the share of the within-orchestra/era percentile (the rest: the whole corpus) */
  groupShare: 0.7,
  /** a role the data never placed the song in keeps this share of its score */
  roleFloor: 0.6,
  /** role-placed evidence needed before roles are told apart */
  minRoleEvidence: 2,
} as const;

/* ---------- normalisation ---------- */

/** mid-rank percentile of `v` among `sorted` (ascending): the top value of n → 1, the bottom → 1 / n */
export function midRankPercentile(sorted: readonly number[], v: number): number {
  const n = sorted.length;
  if (!n) return 0;
  let lo = 0;
  let hi = n;
  // first index ≥ v
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m]! < v) lo = m + 1;
    else hi = m;
  }
  const below = lo;
  let end = lo;
  while (end < n && sorted[end] === v) end++;
  const equal = end - below;
  return (below + (equal + 1) / 2) / n;
}

export interface PercentileItem {
  key: string;
  /** the recording's orchestra and era (`${orchestraId}|${era}`) */
  group: string;
  value: number;
}

/**
 * Rank percentiles of one source: songs without evidence (value ≤ 0) get 0; the rest rank within their group
 * (shrunk by n / (n + 1): a group of one is not the top of anything) blended with the whole corpus.
 */
export function rankPercentiles(items: readonly PercentileItem[]): Map<string, number> {
  const out = new Map<string, number>();
  const pos = items.filter((x) => x.value > 0);
  const all = pos.map((x) => x.value).sort((a, b) => a - b);
  const byGroup = new Map<string, number[]>();
  for (const x of pos) {
    const arr = byGroup.get(x.group) ?? [];
    arr.push(x.value);
    byGroup.set(x.group, arr);
  }
  for (const arr of byGroup.values()) arr.sort((a, b) => a - b);
  const g = POPULARITY_LIMITS.groupShare;
  for (const x of items) {
    if (x.value <= 0) {
      out.set(x.key, 0);
      continue;
    }
    const arr = byGroup.get(x.group)!;
    const inGroup = midRankPercentile(arr, x.value) * (arr.length / (arr.length + 1));
    const global = midRankPercentile(all, x.value);
    out.set(x.key, round4(g * inGroup + (1 - g) * global));
  }
  return out;
}

/** the score: the weighted mean of the sources' percentiles over the sources that worked (0 when none did) */
export function combineScore(
  pcts: Partial<Record<PopularitySource, number>>,
  available: readonly PopularitySource[],
): number {
  let num = 0;
  let den = 0;
  for (const s of available) {
    const w = POPULARITY_WEIGHTS[s];
    den += w;
    num += w * Math.max(0, Math.min(1, pcts[s] ?? 0));
  }
  return den > 0 ? round4(num / den) : 0;
}

/* ---------- roles ---------- */

/**
 * A tanda's slot role from its position in a set of `n` tandas: the first is the warm-up (the opener), the last the
 * close (the closer); between them by relative position: the first fifth warm-up, to 45 % build, to 75 % peak, to
 * 90 % cool-down, then the last tandas.
 */
export function roleOfPosition(pos: number, n: number): SlotRole {
  if (n <= 1 || pos <= 1) return "warmup";
  if (pos >= n) return "close";
  const r = (pos - 1) / (n - 1);
  if (r < 0.2) return "warmup";
  if (r < 0.45) return "build";
  if (r < 0.75) return "peak";
  if (r < 0.9) return "cooldown";
  return "close";
}

/** the corpus' famous-recording roles (opener, closer, cumparsita; anytime has none) */
export function roleOfFamous(role?: string | null): SlotRole | undefined {
  if (role === "opener") return "warmup";
  if (role === "closer" || role === "cumparsita") return "close";
  return undefined;
}

const ROLES: readonly SlotRole[] = ["warmup", "build", "peak", "cooldown", "close"];
/** the canonical tandas' phase as a slot role */
export const roleOfPhase = (phase?: string | null): SlotRole | undefined =>
  ROLES.includes(phase as SlotRole) ? (phase as SlotRole) : undefined;

/**
 * Role scores from role-placed evidence: the role with the most keeps the whole score, a role without any keeps
 * 60 %; with less than 2 placed units the song has one score for every role (undefined).
 */
export function roleScores(
  score: number,
  counts: Partial<Record<SlotRole, number>>,
): Partial<Record<SlotRole, number>> | undefined {
  const total = ROLES.reduce((a, r) => a + (counts[r] ?? 0), 0);
  if (total < POPULARITY_LIMITS.minRoleEvidence) return undefined;
  const max = Math.max(...ROLES.map((r) => counts[r] ?? 0));
  const f = POPULARITY_LIMITS.roleFloor;
  const out: Partial<Record<SlotRole, number>> = {};
  for (const r of ROLES) out[r] = round4(score * (f + (1 - f) * ((counts[r] ?? 0) / max)));
  return out;
}

/* ---------- the committed file ---------- */

export interface SourceStatus {
  status: "ok" | "blocked" | "no-data" | "skipped";
  /** songs with evidence from it */
  songs?: number;
  /** why it is blocked / skipped, or what it holds */
  note?: string;
  checkedAt?: string;
}

export interface PopularityEvidence {
  djSets?: { n: number; djs: number; first: string; last: string; pct: number };
  canonicalTandas?: { n: number; ids: string[]; pct: number };
  famous?: { fame: number; role?: string; pct: number };
  setlists?: { n: number; first: string; last: string; pct: number };
  tangoInfo?: { plays: number; pct: number };
  deezer?: { rank: number; at: string; pct: number };
  spotify?: { popularity: number; at: string; pct: number };
}

export interface PopularityEntry {
  /** 0–1 */
  s: number;
  /** per slot role, when the data places the song (else `s` in every role) */
  roles?: Partial<Record<SlotRole, number>>;
  /** role-placed evidence counts (set positions, tanda phases, famous roles) */
  placed?: Partial<Record<SlotRole, number>>;
  ev: PopularityEvidence;
}

export interface DancerPopularity {
  version: 1;
  /** the latest evidence date (the file only changes when its evidence does) */
  asOf: string;
  about?: string;
  weights: Record<PopularitySource, number>;
  sources: Record<PopularitySource, SourceStatus>;
  songs: Record<string, PopularityEntry>;
}

let ACTIVE: DancerPopularity | undefined;

/** register the committed popularity (server side: src/data.ts buildLoaded); anything odd is ignored */
export function setDancerPopularity(x: unknown): void {
  const o = x as Partial<DancerPopularity> | null | undefined;
  ACTIVE =
    o && o.version === 1 && o.songs && typeof o.songs === "object" ? (o as DancerPopularity) : undefined;
}
/** the registered popularity (undefined where it was never loaded) */
export const dancerPopularity = (): DancerPopularity | undefined => ACTIVE;

/** a song's score (in a role, when the data places it); 0 when the file has no evidence; undefined when not loaded */
export function popularityScore(id: string, role?: SlotRole): number | undefined {
  if (!ACTIVE) return undefined;
  const e = ACTIVE.songs[id];
  if (!e) return 0;
  return (role && e.roles?.[role]) ?? e.s;
}

/** the favourites prior of a song in a role: 0.4 × score (undefined when not loaded) */
export function popularityPrior(id: string, role?: SlotRole): number | undefined {
  const s = popularityScore(id, role);
  return s === undefined ? undefined : round4(POPULARITY_LIMITS.priorMax * Math.max(0, Math.min(1, s)));
}

/**
 * The table with popularity from databases on — unless the DJ switched it off ("Use popularity from databases",
 * DancerFavourites.popularityOff) or switched the favourites off altogether. The web asks for it on every request
 * (default on); a table without it (the CLI, older requests) is exactly as before.
 */
export function withPopularity(
  T: FavouriteTable,
  F?: { popularityOff?: boolean; off?: boolean } | null,
): FavouriteTable {
  if (T.off || F?.off || F?.popularityOff) {
    const { pop: _, ...rest } = T;
    return rest;
  }
  return { ...T, pop: 1 };
}

/** the table uses popularity: switched on, and the data is loaded here */
export const popularityOn = (T: Pick<FavouriteTable, "pop" | "off"> | null | undefined): boolean =>
  !!T && !T.off && T.pop === 1 && !!ACTIVE;

/**
 * The hook favourites.ts reads a side's evidence through: with popularity on, the prior of the DJ's own evidence is
 * the popularity prior in the slot's role (replacing the fame prior); otherwise the evidence as it is.
 */
export function withPopularityPrior(
  T: Pick<FavouriteTable, "pop" | "off"> | null | undefined,
  e: Evidence,
  id: string,
  role: SlotRole,
): Evidence {
  if (!popularityOn(T)) return e;
  return [e[0], e[1], e[2], popularityPrior(id, role) ?? e[3]];
}

/** a side with no evidence of the DJ's own: its popularity prior alone (0 when off or unknown) */
export function databasePrior(
  T: Pick<FavouriteTable, "pop" | "off"> | null | undefined,
  id: string,
  role: SlotRole,
): number {
  return popularityOn(T) ? (popularityPrior(id, role) ?? 0) : 0;
}

/* ---------- what the list shows ---------- */

export type PopularityTier = "high" | "mid" | "low";
export const tierOf = (pct: number): PopularityTier => (pct >= 0.75 ? "high" : pct >= 0.4 ? "mid" : "low");

export interface PopularityPart {
  source: PopularitySource;
  /** a count (sets, tandas, set lists, Spotify popularity), the fame, or a tier for ranks */
  value: number | PopularityTier;
}

/** the sources behind an entry, strongest-weighted first: DJ sets 14 · tandas 3 · set lists 9 · Deezer high */
export function popularityParts(e: PopularityEntry | undefined): PopularityPart[] {
  if (!e) return [];
  const out: PopularityPart[] = [];
  const ev = e.ev;
  if (ev.djSets) out.push({ source: "djSets", value: round1(ev.djSets.n) });
  if (ev.canonicalTandas) out.push({ source: "canonicalTandas", value: ev.canonicalTandas.n });
  if (ev.famous) out.push({ source: "famous", value: ev.famous.fame });
  if (ev.setlists) out.push({ source: "setlists", value: round1(ev.setlists.n) });
  if (ev.tangoInfo) out.push({ source: "tangoInfo", value: tierOf(ev.tangoInfo.pct) });
  if (ev.deezer) out.push({ source: "deezer", value: tierOf(ev.deezer.pct) });
  if (ev.spotify) out.push({ source: "spotify", value: ev.spotify.popularity });
  return out;
}

const SOURCE_LABEL: Record<PopularitySource, string> = {
  djSets: "DJ sets",
  canonicalTandas: "Canonical tandas",
  famous: "Fame",
  setlists: "Set lists",
  tangoInfo: "tango.info",
  deezer: "Deezer",
  spotify: "Spotify",
};
/** "DJ sets: 14 · Set lists: 9 · Deezer: high" (the web translates the labels) */
export const popularityLine = (e: PopularityEntry | undefined) =>
  popularityParts(e)
    .map((p) => `${SOURCE_LABEL[p.source]}: ${p.value}`)
    .join(" · ");

export interface PopularityRow {
  id: string;
  score: number;
  role?: SlotRole;
  parts: PopularityPart[];
}

/** the top entries (in a role: by its role score), best first */
export function popularityRows(
  P: DancerPopularity | undefined = ACTIVE,
  o: { role?: SlotRole; limit?: number; ids?: readonly string[] } = {},
): PopularityRow[] {
  if (!P) return [];
  const want = o.ids ? new Set(o.ids) : undefined;
  const rows: PopularityRow[] = [];
  for (const [id, e] of Object.entries(P.songs)) {
    if (want && !want.has(id)) continue;
    const score = (o.role && e.roles?.[o.role]) ?? e.s;
    rows.push({ id, score, ...(o.role ? { role: o.role } : {}), parts: popularityParts(e) });
  }
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return o.limit ? rows.slice(0, o.limit) : rows;
}

function round4(x: number) {
  return Math.round(x * 1e4) / 1e4;
}
function round1(x: number) {
  return Math.round(x * 10) / 10;
}
