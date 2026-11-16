"use client";
import type { SongSearchHit, SongSearchOptions } from "@tdj/core";
import { idleAfter } from "./power";
import type { WorkerIn, WorkerOut } from "./search.worker";
import type { Song } from "./types";
import type { SongSearchPage } from "./useSongSearch";

/**
 * 2026-11 ("the search is so slow"): the catalogue search in the browser. The first search box on a page starts a
 * Web Worker (lib/search.worker.ts) that loads the catalogue's snapshot and builds the same index the server has; once
 * it is ready, `localSearch` answers a query in a few milliseconds off the main thread (no debounce, no request),
 * and until then — or where there is no worker, or in the apps, which answer /api/search on the device — the hooks
 * keep asking POST /api/search. The sides keep one record per id here, so a row's song is the same object from one
 * answer to the next (memoised rows stay put).
 */

type State = "idle" | "loading" | "ready" | "off";
let state: State = "idle";
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { ok: (p: SongSearchPage) => void; no: (e: Error) => void }>();
const songs = new Map<string, Song>();
const subs = new Set<() => void>();
const set = (s: State) => {
  if (state === s) return;
  state = s;
  // for the latency probe (scripts/search-perf.ts) and the e2e: <html data-search="loading|ready|off">
  if (typeof document !== "undefined") document.documentElement.dataset.search = s;
  for (const f of subs) f();
};

/** the browser has no worker, or the build is the apps' (their /api/search already runs on the device) */
const unavailable = () =>
  typeof window === "undefined" ||
  typeof Worker === "undefined" ||
  process.env.NEXT_PUBLIC_TDJ_TARGET === "app" ||
  process.env.NODE_ENV === "test";

/** start the worker (once per page load); harmless to call often */
export function warmLocalSearch(): void {
  if (state !== "idle") return;
  if (unavailable()) {
    set("off");
    return;
  }
  try {
    worker = new Worker(new URL("./search.worker.ts", import.meta.url), {
      type: "module",
      name: "tdj-search",
    });
  } catch {
    set("off");
    return;
  }
  set("loading");
  idleAfter("search", SUSPEND_AFTER_MS, suspendLocalSearch);
  const fail = () => {
    set("off");
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) p.no(new Error("search worker stopped"));
    pending.clear();
  };
  worker.onerror = fail;
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === "ready") set("ready");
    else if (m.type === "failed") fail();
    else if (m.type === "result") {
      // every answer's new records are kept, the stale ones' too (the worker sends a record once)
      const items = m.page.items.map((h) => {
        const { songId, song, ...rest } = h as { songId?: string; song?: Song };
        let s = song;
        if (s) songs.set(s.id, s);
        else s = songs.get(songId!);
        return { ...rest, song: s } as unknown as SongSearchHit;
      });
      const p = pending.get(m.id);
      pending.delete(m.id);
      p?.ok({ ...(m.page as unknown as SongSearchPage), items });
    } else if (m.type === "error") {
      const p = pending.get(m.id);
      pending.delete(m.id);
      p?.no(new Error(m.error));
    }
  };
}

/**
 * Battery saver: the worker (and the catalogue index it holds) is let go after two minutes without a search; the next
 * search box warms it again and asks the server meanwhile.
 */
export function suspendLocalSearch(): void {
  if (!worker || state === "off") return;
  worker.terminate();
  worker = null;
  for (const p of pending.values()) p.no(new Error("search worker suspended"));
  pending.clear();
  set("idle");
}
const SUSPEND_AFTER_MS = 120_000;

export const localSearchState = (): State => state;
export const localSearchReady = (): boolean => state === "ready";
export function subscribeLocalSearch(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** one query, answered by the worker (reject when it is not ready: the caller asks the server instead) */
export function localSearch(q: string, opts: Omit<SongSearchOptions, "tandaOf">): Promise<SongSearchPage> {
  if (!worker || state !== "ready") return Promise.reject(new Error("search worker not ready"));
  idleAfter("search", SUSPEND_AFTER_MS, suspendLocalSearch);
  const id = ++seq;
  const f = opts.filters?.favourites;
  const msg: WorkerIn = {
    type: "search",
    id,
    q,
    opts: {
      ...opts,
      ...(opts.filters
        ? { filters: { ...opts.filters, ...(f ? { favourites: [...(f as Iterable<string>)] } : {}) } }
        : {}),
    },
  };
  return new Promise((ok, no) => {
    pending.set(id, { ok, no });
    worker!.postMessage(msg);
  });
}
