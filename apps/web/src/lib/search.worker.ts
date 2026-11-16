import { type SongIndex, type SongSearchOptions, searchSongs } from "@tdj/core";
import { indexFromSnapshot, loadSnapshot } from "./searchSnapshot";

/**
 * 2026-11 — the catalogue search in a Web Worker (lib/localSearch.ts starts it): it loads GET /api/search/snapshot
 * once, builds core `buildSongIndex` off the main thread and answers each query with core `searchSongs`, so a
 * keystroke never waits for the network and the field never waits for the search. A side's record crosses to the page
 * once (the page keeps it by id): later answers name it by id only.
 */

/** the worker's scope, typed by hand (the app's TypeScript lib is the DOM's) */
const scope = globalThis as unknown as {
  postMessage(m: WorkerOut): void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
  location: Location;
};

export type WorkerIn = {
  type: "search";
  id: number;
  q: string;
  opts: Omit<SongSearchOptions, "tandaOf">;
};
export type WorkerOut =
  | { type: "ready"; v: string; count: number; ms: number }
  | { type: "failed"; error: string }
  | {
      type: "result";
      id: number;
      tookMs: number;
      /** the answer, each item's `song` replaced by `songId` once the page has the record */
      page: Record<string, unknown> & { items: Array<Record<string, unknown>> };
    }
  | { type: "error"; id: number; error: string };

let ix: SongIndex | null = null;
const sent = new Set<string>();
const t0 = performance.now();

loadSnapshot((...a) => fetch(...a), scope.location.origin)
  .then(({ v, parts }) => {
    ix = indexFromSnapshot(parts);
    scope.postMessage({ type: "ready", v, count: ix.songs.length, ms: Math.round(performance.now() - t0) });
  })
  .catch((e) => scope.postMessage({ type: "failed", error: String((e as Error)?.message ?? e) }));

scope.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m?.type !== "search") return;
  if (!ix) {
    scope.postMessage({ type: "error", id: m.id, error: "not ready" });
    return;
  }
  try {
    const a = performance.now();
    const r = searchSongs(ix, m.q, m.opts);
    const tookMs = Math.round((performance.now() - a) * 100) / 100;
    const items = r.items.map((h) => {
      const { song, ...rest } = h;
      const out: Record<string, unknown> = { ...rest, score: Math.round(h.score * 100) / 100 };
      if (sent.has(song.id)) out.songId = song.id;
      else {
        sent.add(song.id);
        out.song = song;
      }
      return out;
    });
    scope.postMessage({ type: "result", id: m.id, tookMs, page: { ...r, items, tookMs } });
  } catch (err) {
    scope.postMessage({ type: "error", id: m.id, error: String((err as Error)?.message ?? err) });
  }
};
