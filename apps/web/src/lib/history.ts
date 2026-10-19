"use client";
import { del, get, set } from "idb-keyval";
import type { StorageMode } from "./overrides";
import { HISTORY_MAX, type HistorySnapshot, type Playlist } from "./types";

const KEY = "tdj-history-v1";
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

/** Auto title: "Sat · Golden age · 4 h" (the event name when Tonight has one). */
export function snapshotTitle(p: Playlist, at = new Date()): string {
  const day = at.toLocaleDateString(undefined, { weekday: "short" });
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
    const v = await get<HistorySnapshot[]>(KEY);
    return Array.isArray(v) ? v.filter(isSnapshot).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
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

/** Persist (debounced): IndexedDB always, plus the server row when enabled (bounded there). */
export function saveHistory(list: HistorySnapshot[], mode: StorageMode) {
  if (timer) clearTimeout(timer);
  pending = async () => {
    try {
      await set(KEY, list);
    } catch {}
    if (mode === "server")
      await fetch("/api/db", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: boundedHistory(list) }),
        keepalive: true,
      }).catch(() => {});
  };
  timer = setTimeout(flush, 250);
}

export async function clearHistoryStore(mode: StorageMode) {
  if (timer) clearTimeout(timer);
  try {
    await del(KEY);
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
