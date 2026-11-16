"use client";
import {
  buildTextIndex,
  type SongFacets,
  type SongFilters,
  type SongSearchHit,
  searchText,
  type TextField,
  type TextResult,
} from "@tdj/core";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { localSearch, localSearchReady, subscribeLocalSearch, warmLocalSearch } from "./localSearch";

/**
 * The shared song search on the client (2026-11). `useSongSearch(query, { filters })` asks POST /api/search (core
 * `searchSongs` over the catalogue's prebuilt index) after a short pause in typing, aborts the request a newer
 * keystroke made stale, keeps the last answer on screen while the next one loads, and pages with `loadMore`.
 * The Library and the Database use it; the Booth's search, the swap sheet and Build by hand can adopt it as is.
 *
 * `useTextSearch(items, fields, query)` is the same engine in the browser for the small lists (cortinas, orchestras):
 * the index is built once per list.
 */

export interface SongSearchPage {
  items: SongSearchHit[];
  total: number;
  facets: SongFacets;
  suggestion?: string;
  corrected?: Array<{ typed: string; found: string }>;
  groups?: Array<{ orchestraId: string; orchestra: string; count: number }>;
  parsed: Array<{ kind: string; raw: string }>;
  tookMs?: number;
}

export interface UseSongSearch {
  data: SongSearchPage | null;
  /** the query `data` answers */
  answered: string | null;
  loading: boolean;
  error: boolean;
  /** more pages exist */
  hasMore: boolean;
  loadMore: () => void;
}

export interface SongSearchRequest {
  filters?: SongFilters;
  /** per page (default 50) */
  limit?: number;
  group?: "orchestra";
  /** ms of quiet before asking (default 160) */
  debounce?: number;
  /** ask even for an empty query (the chips alone): default true when a filter is set */
  browse?: boolean;
  /** shortest query that asks (default 2; the chips ask on their own) */
  minLength?: number;
  /** another runtime's endpoint (tests) */
  endpoint?: string;
}

const hasFilters = (f?: SongFilters) =>
  !!f &&
  Object.entries(f).some(
    ([k, v]) => k !== "favourites" && (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== false),
  );

export async function fetchSongSearch(
  q: string,
  o: {
    filters?: SongFilters;
    limit?: number;
    offset?: number;
    group?: "orchestra";
    signal?: AbortSignal;
    endpoint?: string;
  },
): Promise<SongSearchPage> {
  const r = await fetch(o.endpoint ?? "/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      q,
      filters: o.filters,
      limit: o.limit ?? 50,
      offset: o.offset ?? 0,
      group: o.group,
    }),
    signal: o.signal,
  });
  if (!r.ok) throw new Error(`search ${r.status}`);
  return (await r.json()) as SongSearchPage;
}

export function useSongSearch(query: string, o: SongSearchRequest = {}): UseSongSearch {
  const [data, setData] = useState<SongSearchPage | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const key = JSON.stringify([query, o.filters ?? null, o.limit ?? 50, o.group ?? null]);
  const q = query;
  const browse = o.browse ?? hasFilters(o.filters);
  const asks = q.trim().length >= (o.minLength ?? 2) || (browse && !q.trim());
  // 2026-11: the catalogue in the browser (lib/localSearch.ts) once its worker is ready; the server until then
  const local = useSyncExternalStore(subscribeLocalSearch, localSearchReady, () => false) && !o.endpoint;
  useEffect(() => {
    if (!o.endpoint) warmLocalSearch();
  }, [o.endpoint]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the query and its options
  useEffect(() => {
    ctl.current?.abort();
    if (!asks) {
      setData(null);
      setAnswered(null);
      setLoading(false);
      setError(false);
      return;
    }
    const c = new AbortController();
    ctl.current = c;
    const take = (r: SongSearchPage) => {
      if (c.signal.aborted) return;
      // the results render as a transition: the next keystroke interrupts them, the field never waits
      startTransition(() => {
        setData(r);
        setAnswered(q);
        setError(false);
        setLoading(false);
      });
    };
    const ask = () =>
      fetchSongSearch(q, {
        filters: o.filters,
        limit: o.limit,
        group: o.group,
        signal: c.signal,
        endpoint: o.endpoint,
      })
        .then(take)
        .catch((e) => {
          if (c.signal.aborted || (e as Error).name === "AbortError") return;
          setError(true);
          setLoading(false);
        });
    if (local) {
      // no pause and no request: a few milliseconds in the worker (the server if it fails)
      localSearch(q, { filters: o.filters, limit: o.limit ?? 50, group: o.group })
        .then(take)
        .catch(() => {
          if (!c.signal.aborted) void ask();
        });
      return () => c.abort();
    }
    setLoading(true);
    const h = setTimeout(ask, o.debounce ?? 160);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [key, asks, local]);
  const hasMore = !!data && data.items.length < data.total;
  const loadMore = useCallback(() => {
    if (!data || loading || data.items.length >= data.total) return;
    const c = new AbortController();
    ctl.current = c;
    setLoading(true);
    const more = (r: SongSearchPage) => {
      if (c.signal.aborted) return;
      setData((d) => (d ? { ...d, items: [...d.items, ...r.items] } : r));
    };
    const server = () =>
      fetchSongSearch(q, {
        filters: o.filters,
        limit: o.limit,
        offset: data.items.length,
        group: o.group,
        signal: c.signal,
        endpoint: o.endpoint,
      }).then(more);
    (local
      ? localSearch(q, {
          filters: o.filters,
          limit: o.limit ?? 50,
          offset: data.items.length,
          group: o.group,
        })
          .then(more)
          .catch(server)
      : server()
    )
      .catch(() => {})
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
  }, [data, loading, q, o.filters, o.limit, o.group, o.endpoint, local]);
  return { data, answered, loading, error, hasMore, loadMore };
}

/** the same engine over a small list in the browser (cortinas, orchestras): index once per list, search per query */
export function useTextSearch<T>(
  items: T[],
  fields: Array<TextField<T>>,
  query: string,
  opts: {
    limit?: number;
    highlight?: Array<{ field: string; get: (doc: T) => string | null | undefined }>;
  } = {},
): TextResult<T> {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the fields are fixed per caller
  const ix = useMemo(() => buildTextIndex(items, fields), [items]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the highlight getters are fixed per caller
  return useMemo(
    () => searchText(ix, query, { limit: opts.limit ?? items.length, highlight: opts.highlight }),
    [ix, query, opts.limit],
  );
}

const RECENT_KEY = "tdj-recent-searches";
/** the last searches on this device (a convenience: never synced, gone with the browser's storage) */
export function recentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function rememberSearch(q: string): string[] {
  const t = q.trim();
  if (t.length < 2) return recentSearches();
  const next = [t, ...recentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
  return next;
}
export function forgetSearches(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {}
}
