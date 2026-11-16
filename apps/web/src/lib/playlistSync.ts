import { flatten, type Playlist } from "@tdj/core";
import { create } from "zustand";

/**
 * 2026-11 (the owner: "any changes in the player should also update all other connected Spotify or other
 * playlists"): every playlist a night was exported to on a connected service follows the night. When the night
 * changes anywhere (a Booth swap, a reorder, Skip tonight, a remove, a Compose edit, Build by hand, an undo), each of
 * its exported playlists is rewritten to match 5 s after the last change, read back and repaired (Spotify:
 * lib/spotifyWrite.ts; YouTube: lib/youtubeVerify.ts), never while Spotify Connect is taking play requests
 * (lib/spotifyBurst.ts), and its cover redrawn from the night when it changed. Each night keeps its exported
 * playlists and a switch ("Keep my exported playlists in sync", on once the night was exported) in this browser.
 *
 * What syncs is the night as it will play: the tandas skipped tonight leave the synced playlists and come back when
 * they play again. A file export (M3U8, rekordbox, …) is a copy the DJ holds: it cannot follow.
 *
 * This file is the pure part (records, what changed, the debounced runner with its writers injected) so vitest
 * drives it with mock services; lib/playlistSyncRun.ts wires the real writers in the browser.
 */
export type SyncService = "spotify" | "youtube";
export const SYNC_DELAY_MS = 5000;
/** a Spotify Connect play request burst holds the sync back this long at a time */
export const BURST_RETRY_MS = 3000;

export interface SyncResult {
  ok: boolean;
  /** rows the service holds in place of how many asked */
  inPlace?: number;
  total?: number;
  error?: string;
  /** the playlist's cover was redrawn (Spotify), or why not */
  cover?: "added" | "no-scope" | "failed" | "skipped" | "same";
  /** row id → the service's id found for it (kept for the next sync: no search twice) */
  found?: Record<string, string>;
  /** the cover's hash that is now on the playlist */
  coverKey?: string;
}

export interface SyncTarget {
  service: SyncService;
  id: string;
  url: string;
  includeCortinas: boolean;
  exportedAt: string;
  /** what the playlist was last written as (the rows' ids in order): a change is a different signature */
  signature?: string;
  /** the cover hash last put on it */
  coverKey?: string;
  /** row id → service id, kept between syncs */
  found?: Record<string, string>;
}
export interface NightSync {
  /** "Keep my exported playlists in sync" (on once the night was exported) */
  enabled: boolean;
  targets: SyncTarget[];
}
export interface SyncStatus {
  state: "idle" | "pending" | "syncing" | "ok" | "error";
  /** changes since the last sync (pending) or in it (ok) */
  changes: number;
  at?: string;
  error?: string;
  cover?: SyncResult["cover"];
}

const KEY = "tdj-playlist-sync";
type Records = Record<string, NightSync>;
const MAX_NIGHTS = 40;

export function loadRecords(): Records {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return j && typeof j === "object" ? (j as Records) : {};
  } catch {
    return {};
  }
}
function saveRecords(r: Records) {
  try {
    const keys = Object.keys(r);
    // the newest nights only (an export a year ago need not follow)
    if (keys.length > MAX_NIGHTS) {
      const newest = (n: NightSync) => Math.max(0, ...n.targets.map((t) => Date.parse(t.exportedAt) || 0));
      keys
        .sort((a, b) => newest(r[a]!) - newest(r[b]!))
        .slice(0, keys.length - MAX_NIGHTS)
        .forEach((k) => {
          delete r[k];
        });
    }
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {}
}

/** the UI's view: each night's record and each target's status */
export const useSync = create<{ records: Records; status: Record<string, SyncStatus> }>(() => ({
  records: typeof window !== "undefined" ? loadRecords() : {},
  status: {},
}));
const statusKey = (nightId: string, service: SyncService) => `${nightId}|${service}`;
export const statusOf = (nightId: string, service: SyncService) =>
  useSync.getState().status[statusKey(nightId, service)] ?? { state: "idle", changes: 0 };
function setStatus(nightId: string, service: SyncService, s: Partial<SyncStatus>) {
  useSync.setState((st) => {
    const k = statusKey(nightId, service);
    const cur = st.status[k] ?? { state: "idle" as const, changes: 0 };
    return { status: { ...st.status, [k]: { ...cur, ...s } } };
  });
}
function putRecord(nightId: string, n: NightSync | null) {
  const records = { ...loadRecords() };
  if (n) records[nightId] = n;
  else delete records[nightId];
  saveRecords(records);
  useSync.setState({ records });
}
export const recordOf = (nightId: string): NightSync | null => loadRecords()[nightId] ?? null;

/** the night as it will play, the rows a synced playlist holds: ids in order */
export function syncRows(p: Playlist, includeCortinas: boolean) {
  return flatten(p, { includeCortinas, dropBypassed: true });
}
export function signatureOf(p: Playlist, includeCortinas: boolean): string {
  return syncRows(p, includeCortinas)
    .map((r) => r.id ?? `${r.title}|${r.artist}`)
    .join(",");
}
/** what an export wrote (its skipped tandas included, as a file export keeps them): the first sync drops them */
export function exportedSignature(p: Playlist, includeCortinas: boolean): string {
  return flatten(p, { includeCortinas })
    .map((r) => r.id ?? `${r.title}|${r.artist}`)
    .join(",");
}

/**
 * The export's hook: a playlist was written for this night. Kept (replacing an older record of the same service and
 * id), its signature as written, the sync switched on the first time.
 */
export function rememberExport(
  p: Playlist,
  t: Omit<SyncTarget, "exportedAt" | "signature"> & { signature?: string },
) {
  const cur = recordOf(p.id);
  const target: SyncTarget = {
    ...t,
    exportedAt: new Date().toISOString(),
    signature: t.signature ?? signatureOf(p, t.includeCortinas),
  };
  const targets = [...(cur?.targets ?? []).filter((x) => !(x.service === t.service)), target];
  putRecord(p.id, { enabled: cur ? cur.enabled : true, targets });
  setStatus(p.id, t.service, { state: "ok", changes: 0, at: target.exportedAt, error: undefined });
}
export function setSyncEnabled(nightId: string, on: boolean) {
  const cur = recordOf(nightId);
  if (!cur) return;
  putRecord(nightId, { ...cur, enabled: on });
}
export function forgetTarget(nightId: string, service: SyncService) {
  const cur = recordOf(nightId);
  if (!cur) return;
  const targets = cur.targets.filter((t) => t.service !== service);
  putRecord(nightId, targets.length ? { ...cur, targets } : null);
}

export interface SyncDeps {
  write: (service: SyncService, p: Playlist, t: SyncTarget) => Promise<SyncResult>;
  /** Spotify Connect is taking play requests now (lib/spotifyBurst.ts): wait */
  busy?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** the cover's key of a night (the hash the cover is drawn from) */
  coverKey?: (p: Playlist) => string;
}

/**
 * The runner: `noteChange` after every change of a night (the store's playlist), `flush` now (Retry, a test).
 * A change that leaves a target's rows as they were (a lock, a pin, a rename) counts only for its cover.
 */
export function createSyncer(deps: SyncDeps) {
  const setT = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let latest: Playlist | null = null;
  let running: Promise<void> | null = null;
  const counts = new Map<string, number>();

  /** the targets whose rows (or cover) differ from what they were last written as */
  const due = (p: Playlist) => {
    const rec = recordOf(p.id);
    if (!rec?.enabled) return [];
    return rec.targets.filter(
      (t) =>
        t.signature !== signatureOf(p, t.includeCortinas) ||
        (t.service === "spotify" && deps.coverKey && t.coverKey && t.coverKey !== deps.coverKey(p)),
    );
  };

  const noteChange = (p: Playlist | null) => {
    if (!p) return;
    const targets = due(p);
    if (!targets.length) return;
    latest = p;
    for (const t of targets) {
      const k = statusKey(p.id, t.service);
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      setStatus(p.id, t.service, { state: "pending", changes: n, error: undefined });
    }
    if (timer) clearT(timer);
    timer = setT(() => void run(), SYNC_DELAY_MS);
  };

  const run = async (): Promise<void> => {
    timer = null;
    const p = latest;
    if (!p) return;
    if (deps.busy?.()) {
      timer = setT(() => void run(), BURST_RETRY_MS);
      return;
    }
    if (running) {
      await running;
      return run();
    }
    running = (async () => {
      for (const t of due(p)) {
        const k = statusKey(p.id, t.service);
        const changes = counts.get(k) ?? 1;
        setStatus(p.id, t.service, { state: "syncing" });
        let r: SyncResult;
        try {
          r = await deps.write(t.service, p, t);
        } catch (e) {
          r = { ok: false, error: (e as Error)?.message ?? String(e) };
        }
        if (r.ok) {
          counts.delete(k);
          const rec = recordOf(p.id);
          if (rec)
            putRecord(p.id, {
              ...rec,
              targets: rec.targets.map((x) =>
                x.service === t.service
                  ? {
                      ...x,
                      signature: signatureOf(p, t.includeCortinas),
                      ...(r.coverKey ? { coverKey: r.coverKey } : {}),
                      found: { ...(x.found ?? {}), ...(r.found ?? {}) },
                    }
                  : x,
              ),
            });
          setStatus(p.id, t.service, {
            state: "ok",
            changes,
            at: new Date().toISOString(),
            error: undefined,
            cover: r.cover,
          });
        } else setStatus(p.id, t.service, { state: "error", changes, error: r.error ?? "" });
      }
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  };

  return {
    noteChange,
    /** run now (the sheet's Retry, Sync now): with `p` the night to sync, else the last changed one */
    flush: async (p?: Playlist | null) => {
      if (timer) clearT(timer);
      timer = null;
      if (p) {
        latest = p;
        // a Retry of a target already in step still writes once (the DJ asked)
        const rec = recordOf(p.id);
        if (rec && !due(p).length)
          putRecord(p.id, { ...rec, targets: rec.targets.map((t) => ({ ...t, signature: "" })) });
      }
      await run();
    },
    /** pending changes (tests) */
    pending: () => !!timer,
  };
}
