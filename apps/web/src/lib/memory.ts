"use client";
import { emptyMemory } from "@tdj/core";
import { del, get, set } from "idb-keyval";
import type { StorageMode } from "./overrides";
import type { AgentMemory } from "./types";

const KEY = "tdj-memory";

/** Shape-check a stored memory object; anything odd falls back to an empty memory. */
export function normalizeMemory(m: unknown): AgentMemory {
  const e = emptyMemory();
  if (!m || typeof m !== "object") return e;
  const o = m as Partial<AgentMemory>;
  return {
    notes: Array.isArray(o.notes) ? o.notes.filter((n) => n && typeof n.text === "string") : e.notes,
    feedbackHistory: Array.isArray(o.feedbackHistory) ? o.feedbackHistory : e.feedbackHistory,
    sets: Array.isArray(o.sets) ? o.sets : e.sets,
    preferences: o.preferences && typeof o.preferences === "object" ? o.preferences : e.preferences,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  };
}

export async function loadMemoryLocal(): Promise<AgentMemory> {
  try {
    return normalizeMemory(await get(KEY));
  } catch {
    return emptyMemory();
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
export function saveMemory(m: AgentMemory, mode: StorageMode) {
  if (timer) clearTimeout(timer);
  pending = async () => {
    try {
      await set(KEY, m);
    } catch {}
    if (mode === "server")
      await fetch("/api/db", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memory: m }),
        keepalive: true,
      }).catch(() => {});
  };
  timer = setTimeout(flush, 250);
}

export async function clearMemoryStore(mode: StorageMode) {
  if (timer) clearTimeout(timer);
  try {
    await del(KEY);
  } catch {}
  if (mode === "server")
    await fetch("/api/db", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memory: emptyMemory() }),
    }).catch(() => {});
}

/** Human line for the "Using what you taught me" footer: learned preferences in plain words. */
export function describePreferences(m: AgentMemory | null | undefined): string[] {
  const p = m?.preferences;
  if (!p) return [];
  const out: string[] = [];
  if (p.floorMood === "energetic") out.push("energetic floor");
  if (p.floorMood === "romantic") out.push("romantic floor");
  if (p.floorMood === "traditional") out.push("traditional floor");
  if (p.pattern === "custom" && p.customPattern) out.push(`cycle ${p.customPattern}`);
  if (p.cortinaLengthSec && p.cortinaLengthSec <= 30) out.push("shorter cortinas");
  else if (p.cortinaLengthSec && p.cortinaLengthSec >= 60) out.push("longer cortinas");
  if (p.arc) out.push(`${p.arc.replace(/-/g, " ")} arc`);
  if (p.tandaShape) out.push(`${p.tandaShape.replace(/-/g, " ")} tandas`);
  if (p.excludeOrchestras?.length) out.push(`${p.excludeOrchestras.length} orchestras left out`);
  if (p.eras?.length) out.push(`${p.eras[0]} era`);
  return out;
}
