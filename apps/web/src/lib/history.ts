"use client";
import { del, delMany, get, getMany, keys, setMany } from "idb-keyval";
import type { StorageMode } from "./overrides";
import { HISTORY_MAX, type HistorySnapshot, type Playlist } from "./types";

/** v1 stored the whole list under one key: every save re-cloned up to 50 sets (~5 MB) on the main thread */
const LEGACY_KEY = "tdj-history-v1";
/** v2: one record per snapshot plus an ordered index, so a save writes the one new or renamed snapshot */
const INDEX_KEY = "tdj-history-v2:index";
const keyOf = (id: string) => `tdj-history-v2:${id}`;
/** what IndexedDB holds right now (by reference): a save writes only what differs */
const stored = new Map<string, HistorySnapshot>();
/** the server row is one DynamoDB item (400 KB): history there keeps the newest snapshots that fit this budget */
export const SERVER_HISTORY_BYTES = 300_000;

const ERA_LABEL: Record<string, string> = {
  golden: "Golden age",
  "golden-extended": "Golden extended",
  "guardia-vieja": "Guardia Vieja",
  "post-golden": "Post-golden",
  nuevo: "Nuevo",
  contemporary: "Contemporary",
  all: "All eras",
};
const fmtHours = (h: number) => (Number.isInteger(h) ? `${h} h` : `${h} h`.replace(".5 h", "½ h"));

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Auto title: "Sat · Golden age · 4 h" (the event name when Tonight has one). No `Intl`: its first call loads
 *  ICU data on the main thread right after the result paints (100 ms on a phone). */
export function snapshotTitle(p: Playlist, at = new Date()): string {
  const day = WEEKDAY[at.getDay()] ?? "";
  const era = ERA_LABEL[p.options.eras?.[0] ?? "golden"] ?? p.options.eras?.[0] ?? "Golden age";
  const ev = p.options.context?.event;
  const evLabel = ev && ev !== "milonga" ? ` · ${ev[0]!.toUpperCase()}${ev.slice(1)}` : "";
  return `${day} · ${era} · ${fmtHours(p.options.hours)}${evLabel}`;
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
          ? "Today"
          : key === dayKey(yest)
            ? "Yesterday"
            : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
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
export function nightLogSummary(n: NightLog): string {
  const h = Math.floor(n.playedSec / 3600);
  const m = Math.floor((n.playedSec % 3600) / 60);
  const parts = [
    `${n.ended ? "played" : "played (unfinished)"} ${n.startedAt.slice(0, 10)}`,
    `${h}:${String(m).padStart(2, "0")} h`,
    `${n.holds} hold${n.holds === 1 ? "" : "s"}`,
  ];
  if (n.birthdayVals) parts.push(`${n.birthdayVals} birthday vals`);
  if (n.stops) parts.push(`${n.stops} stop${n.stops === 1 ? "" : "s"}`);
  if (n.rehearsal) parts.push("rehearsal");
  return parts.join(" · ");
}
