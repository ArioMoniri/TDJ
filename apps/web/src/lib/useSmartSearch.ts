"use client";
import { buildSongIndex, type SongFilters, searchSongs } from "@tdj/core";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Completion,
  type Correction,
  completionsFor,
  correctionFor,
  groupWorks,
  mergeVersions,
  queryText,
  type ServiceAnswer,
  type SourceId,
  titleComplete,
  type Version,
  type Work,
} from "./smartSearch";
import type { Song } from "./types";
import { type SongSearchPage, useSongSearch } from "./useSongSearch";

/**
 * 2026-11 — the state of one smart search box (components/ui/SmartSearch.tsx): the query and the chips (held here,
 * or by the page), the catalogue's answer (POST /api/search, or the given sides in the browser), the connected
 * services' recordings (POST /api/services/search, a moment later), merged into versions, grouped by work once a
 * title is complete, the completions and the correction, and the keyboard's place in the list.
 */
export interface SmartSearchOptions {
  value?: string;
  onChange?: (q: string) => void;
  filters?: SongFilters;
  onFiltersChange?: (f: SongFilters) => void;
  defaultFilters?: SongFilters;
  /** ask the connected services too (default true) */
  services?: boolean;
  /** search these sides in the browser instead of the catalogue (tonight's night) */
  local?: Song[] | null;
  limit?: number;
  group?: "orchestra";
  /** more sources a side has here (the Booth: a linked file) */
  extraSources?: (s: Song) => SourceId[];
  /** show the versions grouped by work even before a title is complete */
  works?: boolean;
}

export interface SmartSearchState {
  q: string;
  setQ: (q: string) => void;
  filters: SongFilters;
  setFilters: (f: SongFilters) => void;
  page: SongSearchPage | null;
  /** the query `page` answers (the results' `data-answered`: what is painted) */
  answered: string | null;
  loading: boolean;
  servicesLoading: boolean;
  services: ServiceAnswer[];
  versions: Version[];
  works: Work[] | null;
  completions: Completion[];
  correction: Correction | null;
  /** the words or the chips ask for something */
  asking: boolean;
  active: number;
  setActive: (i: number | ((a: number) => number)) => void;
  /** take a completion or the correction (Tab takes the first) */
  accept: (query: string) => void;
  hasMore: boolean;
  loadMore: () => void;
  total: number;
}

const hasChip = (f: SongFilters) =>
  Object.entries(f).some(
    ([k, v]) => k !== "favourites" && (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== false),
  );

/** the catalogue's orchestras (/api/meta), once per page, for reading a service's artists */
let orchestras: Promise<Array<{ id: string; name: string }>> | null = null;
const orchestraList = () => {
  orchestras ??= fetch("/api/meta")
    .then((r) => r.json())
    .then((j: { orchestras?: Array<{ id: string; name: string }> }) =>
      (j.orchestras ?? []).map((o) => ({ id: o.id, name: o.name })),
    )
    .catch(() => {
      orchestras = null;
      return [];
    });
  return orchestras;
};

/** how long the words must rest before the connected services are asked, and the fewest letters that ask */
export const SERVICE_DEBOUNCE_MS = 350;
export const SERVICE_MIN_CHARS = 3;
const NONE: ServiceAnswer[] = [];
const NO_HITS: SongSearchPage["items"] = [];

/**
 * The connected services' recordings for the words: asked once the words rest (350 ms, 3 letters or more), the request
 * a newer word made stale aborted; never in the way of the catalogue's results, which show first and on their own.
 */
export function useServiceSearch(text: string, on: boolean): { answers: ServiceAnswer[]; loading: boolean } {
  const [got, setGot] = useState<{ q: string; answers: ServiceAnswer[] }>({ q: "", answers: NONE });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = text.trim();
    if (!on || q.length < SERVICE_MIN_CHARS) {
      setGot((g) => (g.answers === NONE ? g : { q: "", answers: NONE }));
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    const h = setTimeout(() => {
      setLoading(true);
      fetch("/api/services/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, limit: 10 }),
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? r.json() : { services: [] }))
        .then((j: { services?: ServiceAnswer[] }) => {
          if (ctl.signal.aborted) return;
          const next = j.services ?? [];
          startTransition(() =>
            setGot((g) =>
              g.q === q && JSON.stringify(g.answers) === JSON.stringify(next) ? g : { q, answers: next },
            ),
          );
        })
        .catch(() => {})
        .finally(() => !ctl.signal.aborted && setLoading(false));
    }, SERVICE_DEBOUNCE_MS);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [text, on]);
  // only the answer to these words: an earlier word's recordings never sit under the next word's results (a state
  // with no recordings — "Spotify: not connected" — holds until the next answer, so its line does not blink)
  const fresh = got.q === text.trim() || !got.answers.some((a) => a.tracks.length);
  return { answers: fresh ? got.answers : NONE, loading };
}

export function useSmartSearch(o: SmartSearchOptions = {}): SmartSearchState {
  const [ownQ, setOwnQ] = useState("");
  const [ownF, setOwnF] = useState<SongFilters>(o.defaultFilters ?? {});
  const q = o.value ?? ownQ;
  const filters = o.filters ?? ownF;
  const setQ = useCallback(
    (v: string) => {
      if (o.value === undefined) setOwnQ(v);
      o.onChange?.(v);
    },
    [o.value, o.onChange],
  );
  const setFilters = useCallback(
    (f: SongFilters) => {
      if (o.filters === undefined) setOwnF(f);
      o.onFiltersChange?.(f);
    },
    [o.filters, o.onFiltersChange],
  );
  const local = o.local ?? null;
  const server = useSongSearch(local ? "" : q, {
    filters: local ? undefined : filters,
    limit: o.limit ?? 50,
    group: o.group,
    browse: local ? false : undefined,
    minLength: local ? 999 : 2,
  });
  // tonight's night (a few dozen sides): the same engine in the browser
  const ix = useMemo(() => (local ? buildSongIndex(local) : null), [local]);
  const localPage = useMemo<SongSearchPage | null>(() => {
    if (!ix || (q.trim().length < 2 && !hasChip(filters))) return null;
    const r = searchSongs(ix, q, { filters, limit: o.limit ?? 50 });
    return { ...r, parsed: r.parsed };
  }, [ix, q, filters, o.limit]);
  const page = local ? localPage : server.data;
  const text = queryText(q);
  const svc = useServiceSearch(text, (o.services ?? true) && !local);
  const [orch, setOrch] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (svc.answers.some((a) => a.tracks.length)) void orchestraList().then(setOrch);
  }, [svc.answers]);
  const asking = q.trim().length >= 2 || hasChip(filters);
  const items = asking ? (page?.items ?? NO_HITS) : NO_HITS;
  const versions = useMemo(
    () =>
      mergeVersions(
        items,
        asking ? svc.answers : [],
        {
          orchestras: [
            ...orch,
            ...(page?.facets.orchestra ?? []).map((f) => ({ id: f.key, name: f.label ?? f.key })),
          ],
        },
        { filters, extraSources: o.extraSources },
      ),
    [items, svc.answers, orch, page, filters, o.extraSources, asking],
  );
  const grouped = o.works || titleComplete(q, versions);
  const works = useMemo(
    () => (grouped && versions.length ? groupWorks(versions) : null),
    [grouped, versions],
  );
  const completions = useMemo(() => (asking ? completionsFor(q, page) : []), [q, page, asking]);
  const correction = useMemo(() => (asking ? correctionFor(q, page) : null), [q, page, asking]);
  const [active, setActive] = useState(-1);
  // a new answer starts the keyboard's place over
  const answerKey = useRef<unknown>(null);
  useEffect(() => {
    if (answerKey.current !== page) {
      answerKey.current = page;
      setActive(-1);
    }
  }, [page]);
  const accept = useCallback((query: string) => setQ(query), [setQ]);
  return {
    q,
    setQ,
    filters,
    setFilters,
    page,
    answered: local ? (localPage ? q : null) : server.answered,
    loading: local ? false : server.loading,
    servicesLoading: svc.loading,
    services: svc.answers,
    versions,
    works,
    completions,
    correction,
    asking,
    active,
    setActive,
    accept,
    hasMore: local ? false : server.hasMore,
    loadMore: server.loadMore,
    total: page?.total ?? 0,
  };
}

/** the versions in the order the list shows them (by work when grouped): the keyboard walks this */
export const shownOrder = (s: Pick<SmartSearchState, "versions" | "works">): Version[] =>
  s.works ? s.works.flatMap((w) => w.versions) : s.versions;
