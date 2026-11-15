"use client";
import { del, delMany, get, getMany, keys, setMany } from "idb-keyval";
import { fmtDate, lazy, t as tx } from "@/lib/i18n";
import { eraName, hoursText, lengthText, nightTitle } from "./nightName";
import type { StorageMode } from "./overrides";
import {
  HISTORY_MAX,
  HISTORY_VERSIONS_MAX,
  type HistorySnapshot,
  type HistoryVersion,
  type Playlist,
} from "./types";

/** v1 stored the whole list under one key: every save re-cloned up to 50 sets (~5 MB) on the main thread */
const LEGACY_KEY = "tdj-history-v1";
/** v2: one record per snapshot plus an ordered index, so a save writes the one new or renamed snapshot */
const INDEX_KEY = "tdj-history-v2:index";
const keyOf = (id: string) => `tdj-history-v2:${id}`;
/** what IndexedDB holds right now (by reference): a save writes only what differs */
const stored = new Map<string, HistorySnapshot>();
/** the server row is one DynamoDB item (400 KB): history there keeps the newest snapshots that fit this budget */
export const SERVER_HISTORY_BYTES = 300_000;

const WEEKDAY = lazy(() => [
  tx("history.sunday"),
  tx("history.monday"),
  tx("history.tuesday"),
  tx("history.wednesday"),
  tx("history.thursday"),
  tx("history.friday"),
  tx("history.saturday"),
]);
const EVENT_LABEL: Record<string, string> = {
  milonga: "milonga",
  marathon: "marathon",
  encuentro: "encuentro",
  festival: "festival night",
  practica: "práctica",
  wedding: "wedding",
  show: "show night",
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Era label for a set ("Golden age", "Nuevo"…) for the History sub-lines. */
export function eraLabel(p: Playlist): string {
  return eraName(p.options.eras?.[0]);
}

/** Auto title: the event, "Tuesday milonga" / "Saturday práctica" (the era and length go in the sub-line,
 *  round8-ux.md §2 History). No `Intl`: its first call loads ICU data on the main thread right after the result
 *  paints (100 ms on a phone). */
export function snapshotTitle(p: Playlist, at = new Date()): string {
  // wave 2: the night's own title (lib/nightName.ts), the same one Share and the result header show
  if (p.name) return nightTitle(p);
  const day = WEEKDAY[at.getDay()] ?? "";
  const ev = p.options.context?.event ?? "milonga";
  return `${day} ${EVENT_LABEL[ev] ?? ev}`;
}
/** "4 h · 22 tandas · Golden age": what the title used to carry. */
export function snapshotMeta(p: Playlist): string {
  return tx("history.tandas_3", {
    p1: p.stats?.durationSec ? lengthText(p.stats.durationSec) : hoursText(p.options.hours),
    length: p.tandas.length,
    p2: eraLabel(p),
  });
}

/** The playlist without per-song chroma vectors (12 floats per track: the one bulky field nobody re-reads). */
export function compactPlaylist(p: Playlist): Playlist {
  const strip = (s: Playlist["closing"]) => (s?.audio ? { ...s, audio: { ...s.audio, chroma: [] } } : s);
  return {
    ...p,
    tandas: p.tandas.map((t) => ({ ...t, songs: t.songs.map((s) => strip(s)!) })),
    closing: strip(p.closing),
    opening: p.opening ? strip(p.opening) : p.opening,
  };
}

export function makeSnapshot(
  p: Playlist,
  options: HistorySnapshot["options"],
  source: HistorySnapshot["source"],
): HistorySnapshot {
  const at = new Date();
  return {
    id: `${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: at.toISOString(),
    title: snapshotTitle(p, at),
    options,
    playlist: compactPlaylist(p),
    score: p.score.total,
    source,
  };
}

export function isSnapshot(x: unknown): x is HistorySnapshot {
  const s = x as HistorySnapshot;
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.id === "string" &&
    typeof s.createdAt === "string" &&
    !!s.playlist &&
    Array.isArray(s.playlist.tandas)
  );
}

export async function loadHistoryLocal(): Promise<HistorySnapshot[]> {
  try {
    const ids = await get<string[]>(INDEX_KEY);
    let list: HistorySnapshot[];
    if (Array.isArray(ids)) {
      const rows = await getMany<HistorySnapshot>(ids.map(keyOf));
      list = rows.filter(isSnapshot).slice(0, HISTORY_MAX);
    } else {
      // first run on the v2 layout: take the v1 list over, one record per snapshot
      const legacy = await get<HistorySnapshot[]>(LEGACY_KEY);
      list = Array.isArray(legacy) ? legacy.filter(isSnapshot).slice(0, HISTORY_MAX) : [];
      if (list.length) {
        await setMany([
          [INDEX_KEY, list.map((h) => h.id)],
          ...list.map((h) => [keyOf(h.id), h] as [string, HistorySnapshot]),
        ]);
        await del(LEGACY_KEY);
      }
    }
    stored.clear();
    for (const h of list) stored.set(h.id, h);
    return list;
  } catch {
    return [];
  }
}

/** Write the index and only the snapshots IndexedDB does not hold yet (new, or renamed → a new object). */
async function writeLocal(list: HistorySnapshot[]) {
  const changed = list.filter((h) => stored.get(h.id) !== h);
  const gone = [...stored.keys()].filter((id) => !list.some((h) => h.id === id));
  await setMany([
    [INDEX_KEY, list.map((h) => h.id)],
    ...changed.map((h) => [keyOf(h.id), h] as [string, HistorySnapshot]),
  ]);
  if (gone.length) await delMany(gone.map(keyOf));
  for (const id of gone) stored.delete(id);
  for (const h of changed) stored.set(h.id, h);
}

/** Newest first, capped at 50 entries. */
export function pushSnapshot(list: HistorySnapshot[], s: HistorySnapshot): HistorySnapshot[] {
  return [s, ...list.filter((x) => x.id !== s.id)].slice(0, HISTORY_MAX);
}

/* ---------- one night, its versions (wave 2) ---------- */

/** what made a version, in the DJ's words (the stored `source` tags never show) */
export const SOURCE_WORDS: Record<HistorySnapshot["source"], string> = {
  get compose() {
    return tx("history.composed_2");
  },
  get refine() {
    return tx("history.adjusted");
  },
  get swap() {
    return tx("history.changed_a_song");
  },
  get import() {
    return tx("history.opened_from_a_file");
  },
  get room() {
    return tx("history.from_a_room");
  },
};
/** the current version's label: the edit that made it, else how the entry began */
export const changeLabel = (s: HistorySnapshot) =>
  s.change ?? SOURCE_WORDS[s.source] ?? tx("history.composed_2");

const vid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * An edit to the night an entry holds: the entry keeps its place and its title, the version it replaces goes into
 * `versions` (oldest first, at most HISTORY_VERSIONS_MAX), and the new night becomes its current version.
 */
export function recordEdit(
  entry: HistorySnapshot,
  p: Playlist,
  label: string,
  options?: HistorySnapshot["options"],
  at = new Date(),
): HistorySnapshot {
  const before: HistoryVersion = {
    id: vid(),
    at: entry.updatedAt ?? entry.createdAt,
    label: changeLabel(entry),
    playlist: entry.playlist,
    score: entry.score,
  };
  return {
    ...entry,
    versions: [...(entry.versions ?? []), before].slice(-HISTORY_VERSIONS_MAX),
    playlist: compactPlaylist(p),
    score: p.score.total,
    change: label,
    updatedAt: at.toISOString(),
    ...(options ? { options } : {}),
  };
}

/** Bring an earlier version back: it becomes the current one (an edit of its own, so nothing is lost). */
export function restoreVersion(entry: HistorySnapshot, versionId: string): HistorySnapshot | null {
  const v = entry.versions?.find((x) => x.id === versionId);
  if (!v) return null;
  return recordEdit(entry, v.playlist, tx("history.back_to", { label: v.label }));
}

/** every version of an entry, newest first: the current one, then the kept ones */
export function versionsOf(entry: HistorySnapshot): Array<HistoryVersion & { current: boolean }> {
  const cur = {
    id: "current",
    at: entry.updatedAt ?? entry.createdAt,
    label: changeLabel(entry),
    playlist: entry.playlist,
    score: entry.score,
    current: true,
  };
  return [cur, ...[...(entry.versions ?? [])].reverse().map((v) => ({ ...v, current: false }))];
}

/** what changes History: a new night (Compose, an import), or an edit to the night on screen */
export type HistoryEvent =
  | { kind: "new"; snap: HistorySnapshot }
  | {
      kind: "edit";
      playlist: Playlist;
      label: string;
      options: HistorySnapshot["options"];
      source?: HistorySnapshot["source"];
    };

/**
 * History after one event. A new night is one new entry and becomes the current one; an edit updates the current
 * entry (a version is kept inside it); an edit with no current entry (History cleared, an older browser) starts one.
 */
export function historyAfter(
  list: HistorySnapshot[],
  currentId: string | null,
  ev: HistoryEvent,
): { list: HistorySnapshot[]; currentId: string } {
  if (ev.kind === "new") return { list: pushSnapshot(list, ev.snap), currentId: ev.snap.id };
  const cur = currentId ? list.find((h) => h.id === currentId) : undefined;
  if (!cur) {
    const snap = { ...makeSnapshot(ev.playlist, ev.options, ev.source ?? "compose"), change: ev.label };
    return { list: pushSnapshot(list, snap), currentId: snap.id };
  }
  const next = recordEdit(cur, ev.playlist, ev.label, ev.options);
  return { list: list.map((h) => (h.id === cur.id ? next : h)), currentId: cur.id };
}

/** The newest snapshots whose JSON fits the byte budget (server storage). */
export function boundedHistory(list: HistorySnapshot[], budget = SERVER_HISTORY_BYTES): HistorySnapshot[] {
  const out: HistorySnapshot[] = [];
  let bytes = 0;
  for (const s of list.slice(0, HISTORY_MAX)) {
    const n = JSON.stringify(s).length;
    if (bytes + n > budget) break;
    bytes += n;
    out.push(s);
  }
  return out;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => Promise<void>) | null = null;
const flush = () => {
  if (!pending) return;
  if (timer) clearTimeout(timer);
  const run = pending;
  pending = null;
  timer = null;
  void run();
};
if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

/**
 * Persist (debounced): IndexedDB always, plus the server row when enabled (bounded there). A save writes one
 * record (the new or renamed snapshot) and the index, so it is cheap enough to run right after the debounce.
 */
export function saveHistory(list: HistorySnapshot[], mode: StorageMode, immediate = false) {
  if (timer) clearTimeout(timer);
  pending = async () => {
    try {
      await writeLocal(list);
    } catch {}
    if (mode === "server")
      await fetch("/api/db", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: boundedHistory(list) }),
        keepalive: true,
      }).catch(() => {});
  };
  // a rename or a delete is one small record: write it now, so a reload right after keeps it
  if (immediate) flush();
  else timer = setTimeout(flush, 250);
}

export async function clearHistoryStore(mode: StorageMode) {
  if (timer) clearTimeout(timer);
  try {
    const all = (await keys()).filter((k) => typeof k === "string" && k.startsWith("tdj-history-v"));
    await delMany(all);
    stored.clear();
  } catch {}
  if (mode === "server")
    await fetch("/api/db", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: [] }),
    }).catch(() => {});
}

/** Group snapshots by calendar day (newest first), labelled Today / Yesterday / date. */
export function groupByDay(list: HistorySnapshot[]): Array<{ label: string; items: HistorySnapshot[] }> {
  const out: Array<{ key: string; label: string; items: HistorySnapshot[] }> = [];
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const dayKey = (d: Date) => d.toDateString();
  for (const s of list) {
    const d = new Date(s.createdAt);
    const key = dayKey(d);
    let g = out.find((x) => x.key === key);
    if (!g) {
      const label =
        key === dayKey(today)
          ? tx("history.today")
          : key === dayKey(yest)
            ? tx("history.yesterday")
            : fmtDate(d, { weekday: "long", day: "numeric", month: "long" });
      g = { key, label, items: [] };
      out.push(g);
    }
    g.items.push(s);
  }
  return out;
}

/* ---------- the night as played (Booth, round7-booth.md §9) ---------- */

/** What the Booth writes into a snapshot when the night ends (and on every hold, so a crash loses nothing). */
export interface NightLog {
  startedAt: string;
  endedAt: string;
  /** seconds between the first start and the last entry */
  playedSec: number;
  holds: number;
  birthdayVals: number;
  stops: number;
  itemsPlayed: number;
  planIndex: number;
  settings: Record<string, unknown>;
  log: Array<{ at: string; from: string; to: string; planIndex: number; reason?: string }>;
  anchors: Array<{ planIndex: number; at: string }>;
  rehearsal?: boolean;
  ended: boolean;
}

/** Build the log from the engine's record (pure, so vitest can check the counts). */
export function makeNightLog(r: {
  startedAt: number;
  log: NightLog["log"];
  anchors: NightLog["anchors"];
  planIndex: number;
  settings: Record<string, unknown>;
  rehearsal?: boolean;
  ended: boolean;
  now?: number;
}): NightLog {
  const now = r.now ?? Date.now();
  const last = r.log[r.log.length - 1];
  const endMs = last ? Date.parse(last.at) : now;
  return {
    startedAt: new Date(r.startedAt || now).toISOString(),
    endedAt: new Date(Math.max(endMs, r.startedAt || 0)).toISOString(),
    playedSec: r.startedAt ? Math.max(0, Math.round((Math.max(endMs, now) - r.startedAt) / 1000)) : 0,
    // a hold is logged when asked (playing→playing) and when it lands (→paused): count the landing only
    holds: r.log.filter((e) => e.to === "paused" && e.reason === "hold").length,
    birthdayVals: r.log.filter((e) => e.reason === "birthday vals" && e.from === e.to).length,
    stops: r.log.filter((e) => e.to === "stopped" && (e.reason === "stop" || e.reason === "skip now")).length,
    itemsPlayed: new Set(r.anchors.map((a) => a.planIndex)).size,
    planIndex: r.planIndex,
    settings: r.settings,
    log: r.log,
    anchors: r.anchors,
    rehearsal: r.rehearsal,
    ended: r.ended,
  };
}

/** "played 2026-10-18 · 4:07 h · 2 holds · 1 birthday vals" (History row / detail). */
/** Under ten minutes a night was a rehearsal, not a night played ("played 0:00 h" read as a bug, round8-ux.md §2). */
export const PLAYED_MIN_SEC = 600;

export function nightLogSummary(n: NightLog): string {
  const started = new Date(n.startedAt);
  const clock = Number.isNaN(started.getTime())
    ? ""
    : ` ${pad(started.getHours())}:${pad(started.getMinutes())}`;
  const parts: string[] = [];
  if (n.rehearsal || n.playedSec < PLAYED_MIN_SEC) parts.push(`rehearsed${clock}`);
  else {
    const h = Math.floor(n.playedSec / 3600);
    const m = Math.floor((n.playedSec % 3600) / 60);
    parts.push(`${n.ended ? "played" : tx("history.played_unfinished")} ${h}:${pad(m)} h`);
  }
  if (n.holds) parts.push(tx("history.hold", { holds: n.holds, p1: n.holds === 1 ? "" : "s" }));
  if (n.birthdayVals) parts.push(tx("history.birthday_vals", { birthdayVals: n.birthdayVals }));
  if (n.stops) parts.push(tx("history.stop", { stops: n.stops, p1: n.stops === 1 ? "" : "s" }));
  return parts.join(" · ");
}
