"use client";
import { emptyMemory } from "@tdj/core";
import { del, get, set } from "idb-keyval";
import { t } from "@/lib/i18n";
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
    // round 21: what the DJ's edits taught (swaps, pins, hand-made tandas)
    ...(o.learned && typeof o.learned === "object" ? { learned: o.learned } : {}),
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
  if (p.floorMood === "energetic") out.push(t("memory.energetic_floor"));
  if (p.floorMood === "romantic") out.push(t("memory.romantic_floor"));
  if (p.floorMood === "traditional") out.push(t("memory.traditional_floor"));
  if (p.pattern === "custom" && p.customPattern)
    out.push(t("memory.cycle", { customPattern: p.customPattern }));
  if (p.cortinaLengthSec && p.cortinaLengthSec <= 30) out.push(t("memory.shorter_cortinas"));
  else if (p.cortinaLengthSec && p.cortinaLengthSec >= 60) out.push(t("memory.longer_cortinas"));
  if (p.arc) out.push(t("memory.arc", { p1: p.arc.replace(/-/g, " ") }));
  if (p.tandaShape) out.push(t("memory.tandas", { p1: p.tandaShape.replace(/-/g, " ") }));
  if (p.excludeOrchestras?.length)
    out.push(t("memory.orchestras_left_out", { length: p.excludeOrchestras.length }));
  if (p.eras?.length) out.push(t("memory.era", { p1: p.eras[0] }));
  return out;
}
