/**
 * Round 21 — enrichment records (docs/specs/round21-engine.md §4). Every value an enrich script fetches from a provider
 * (Deezer BPM and gain, a Spotify release date) is stored with where it came from and when it was fetched; re-running
 * a script never keeps a stale value silently: a changed value replaces the old one, the record says when it changed
 * and keeps the previous value beside it. A DJ correction (the user's database, `UserOverrides.songs`) is never
 * written here and always wins over an enrichment at load (`catalog.ts`).
 */

export interface EnrichStamp {
  /** the provider ("deezer", "spotify") */
  source: string;
  /** ISO time of the last fetch */
  fetchedAt: string;
  /** ISO time the last fetch changed a value (unset = never changed since the first fetch) */
  changedAt?: string;
  /** the values the last change replaced */
  previous?: Record<string, unknown>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Merge a fresh fetch over the stored record: every fetched field replaces the stored one; when any differs the record
 * carries `changedAt` (now) and `previous` (the replaced values). A field the fetch did not return (undefined) keeps
 * its stored value; a field the provider now returns as null clears it.
 */
export function mergeEnrichment<T extends Record<string, unknown>>(
  prev: (T & EnrichStamp) | null | undefined,
  fetched: T,
  source: string,
  now: string = new Date().toISOString(),
): T & EnrichStamp {
  const { source: _s, fetchedAt: _f, changedAt, previous: _p, ...old } = (prev ?? {}) as T & EnrichStamp;
  const next: Record<string, unknown> = { ...old };
  const replaced: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fetched)) {
    if (v === undefined) continue;
    if (prev && k in old && !same(old[k], v)) replaced[k] = old[k];
    next[k] = v;
  }
  const changed = Object.keys(replaced).length > 0;
  return {
    ...(next as T),
    source,
    fetchedAt: now,
    ...(changed
      ? { changedAt: now, previous: replaced }
      : changedAt
        ? { changedAt, previous: prev?.previous }
        : {}),
  };
}

/** a record is due for a refetch when it was never fetched, or fetched more than `maxAgeDays` ago */
export function enrichDue(
  rec: { fetchedAt?: string } | null | undefined,
  maxAgeDays: number,
  now = Date.now(),
): boolean {
  if (!rec?.fetchedAt) return true;
  const t = Date.parse(rec.fetchedAt);
  return !Number.isFinite(t) || now - t > maxAgeDays * 86_400_000;
}

/** Deezer's per-track record (GET https://api.deezer.com/track/{id}): `bpm` (0 = unknown) and `gain` (dB) */
export interface DeezerTrackRecord extends Record<string, unknown> {
  id: string;
  bpm?: number | null;
  gain?: number | null;
  release?: string | null;
  album?: string | null;
}
export type DeezerCache = Record<string, (DeezerTrackRecord & EnrichStamp) | null>;
