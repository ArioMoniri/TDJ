"use client";
import { del, get, set } from "idb-keyval";
import { loadMemoryLocal, normalizeMemory } from "./memory";
import type { AgentMemory, AppOverrides, HistorySnapshot } from "./types";

const KEY = "tdj-overrides-v1";
export type StorageMode = "browser" | "server";

/** How many individual changes the user's database carries (shown in the Database header). */
export function countChanges(o: AppOverrides | null | undefined): number {
  if (!o) return 0;
  let n = 0;
  // singerId / vocal / era follow a singer or year edit: derived, not separate changes
  const derived = new Set(["singerId", "vocal", "era"]);
  for (const p of Object.values(o.songs ?? {})) n += Object.keys(p).filter((k) => !derived.has(k)).length;
  for (const p of Object.values(o.profiles ?? {})) n += Object.keys(p).length;
  n += Object.keys(o.cortinas ?? {}).length;
  const { trackEnergy, notBefore, ...rules } = o.rules ?? {};
  n +=
    Object.keys(rules).length + Object.keys(trackEnergy ?? {}).length + Object.keys(notBefore ?? {}).length;
  n += o.addedSongs?.length ?? 0;
  for (const f of Object.values(o.contextFactors ?? {}))
    for (const op of Object.values(f)) n += Object.keys(op).length;
  n += Object.values(o.guide ?? {}).filter((v) => typeof v === "string" && v.trim()).length;
  if (o.connectors?.webhookUrl) n += 1;
  return n;
}
export function isEmptyOverrides(o: AppOverrides | null | undefined): boolean {
  return countChanges(o) === 0;
}

/** Detect server storage mode once per page load (404 = browser mode). */
let modeP: Promise<StorageMode> | null = null;
export function storageMode(): Promise<StorageMode> {
  if (!modeP)
    modeP = fetch("/api/db", { method: "GET" })
      .then(async (r) => {
        if (!r.ok) return "browser" as const;
        const j = (await r.json().catch(() => ({}))) as { enabled?: boolean; mode?: string };
        return j.enabled === true || j.mode === "server" ? ("server" as const) : ("browser" as const);
      })
      .catch(() => "browser" as const);
  return modeP;
}

/** The user's database: overrides plus what the agents remember. Server when enabled, else IndexedDB. */
export async function loadOverrides(): Promise<{
  overrides: AppOverrides;
  memory: AgentMemory;
  mode: StorageMode;
  /** server mode only: the bounded history kept in the row */
  history?: HistorySnapshot[];
}> {
  const mode = await storageMode();
  if (mode === "server") {
    try {
      const r = await fetch("/api/db");
      const j = await r.json();
      if (r.ok && j.overrides) {
        // connector URLs never reach the server: they live in this browser only
        let connectors: AppOverrides["connectors"];
        try {
          connectors = (await get<AppOverrides>(KEY))?.connectors;
        } catch {}
        return {
          overrides: connectors ? { ...j.overrides, connectors } : j.overrides,
          memory: normalizeMemory(j.memory),
          mode,
          history: Array.isArray(j.history) ? j.history : [],
        };
      }
    } catch {}
  }
  const memory = await loadMemoryLocal();
  try {
    const v = await get<AppOverrides>(KEY);
    return { overrides: v ?? {}, memory, mode };
  } catch {
    return { overrides: {}, memory, mode };
  }
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

/** Persist (debounced, flushed on page hide): IndexedDB always, plus the server when enabled. */
export function saveOverrides(o: AppOverrides, mode: StorageMode) {
  if (timer) clearTimeout(timer);
  pending = async () => {
    const value = { ...o, updatedAt: new Date().toISOString() };
    try {
      await set(KEY, value);
    } catch {}
    if (mode === "server") {
      const { connectors: _c, ...server } = value;
      await fetch("/api/db", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrides: server }),
        keepalive: true,
      }).catch(() => {});
    }
  };
  timer = setTimeout(flush, 250);
}

export async function clearOverrides(mode: StorageMode) {
  if (timer) clearTimeout(timer);
  try {
    await del(KEY);
  } catch {}
  if (mode === "server")
    await fetch("/api/db", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides: {} }),
    }).catch(() => {});
}

/** Accept a previously exported JSON file (either the overrides object or { overrides }). */
export function parseImport(text: string): AppOverrides {
  const j = JSON.parse(text);
  const o =
    j && typeof j === "object" && "overrides" in j && typeof j.overrides === "object" ? j.overrides : j;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Not a TDJ database file");
  const out: AppOverrides = {};
  for (const k of [
    "songs",
    "profiles",
    "cortinas",
    "rules",
    "contextFactors",
    "guide",
    "connectors",
  ] as const)
    if (o[k] && typeof o[k] === "object") (out as Record<string, unknown>)[k] = o[k];
  if (Array.isArray(o.addedSongs)) out.addedSongs = o.addedSongs;
  return out;
}
