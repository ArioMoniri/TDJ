"use client";
import { del, get, set } from "idb-keyval";
import type { AppOverrides } from "./types";

const KEY = "tdj-overrides-v1";
export type StorageMode = "browser" | "server";

/** How many individual changes the user's database carries (shown in the Database header). */
export function countChanges(o: AppOverrides | null | undefined): number {
  if (!o) return 0;
  let n = 0;
  for (const p of Object.values(o.songs ?? {})) n += Object.keys(p).length;
  for (const p of Object.values(o.profiles ?? {})) n += Object.keys(p).length;
  n += Object.keys(o.cortinas ?? {}).length;
  const { trackEnergy, notBefore, ...rules } = o.rules ?? {};
  n += Object.keys(rules).length + Object.keys(trackEnergy ?? {}).length + Object.keys(notBefore ?? {}).length;
  n += o.addedSongs?.length ?? 0;
  for (const f of Object.values(o.contextFactors ?? {}))
    for (const op of Object.values(f)) n += Object.keys(op).length;
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
      .then((r) => (r.ok ? ("server" as const) : ("browser" as const)))
      .catch(() => "browser" as const);
  return modeP;
}

export async function loadOverrides(): Promise<{ overrides: AppOverrides; mode: StorageMode }> {
  const mode = await storageMode();
  if (mode === "server") {
    try {
      const r = await fetch("/api/db");
      const j = await r.json();
      if (r.ok && j.overrides) return { overrides: j.overrides, mode };
    } catch {}
  }
  try {
    const v = await get<AppOverrides>(KEY);
    return { overrides: v ?? {}, mode };
  } catch {
    return { overrides: {}, mode };
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Persist (debounced): IndexedDB always, plus the server when enabled. */
export function saveOverrides(o: AppOverrides, mode: StorageMode) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const value = { ...o, updatedAt: new Date().toISOString() };
    try {
      await set(KEY, value);
    } catch {}
    if (mode === "server")
      await fetch("/api/db", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrides: value }),
      }).catch(() => {});
  }, 250);
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
  const o = j && typeof j === "object" && "overrides" in j && typeof j.overrides === "object" ? j.overrides : j;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Not a TDJ database file");
  const out: AppOverrides = {};
  for (const k of ["songs", "profiles", "cortinas", "rules", "contextFactors"] as const)
    if (o[k] && typeof o[k] === "object") (out as Record<string, unknown>)[k] = o[k];
  if (Array.isArray(o.addedSongs)) out.addedSongs = o.addedSongs;
  return out;
}
