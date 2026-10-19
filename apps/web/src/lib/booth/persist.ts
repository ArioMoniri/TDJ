"use client";
import { createStore, del, get, set } from "idb-keyval";
import type { Measurement } from "./loudness";
import type { BoothLogEntry } from "./plan";

/**
 * IndexedDB `tdj-booth` (round7-booth.md §9): the folder handle, the song → file match map, the measurements and
 * the running night. Nothing here is ever sent to the server; handles and paths never leave the browser.
 */
const store = typeof indexedDB !== "undefined" ? createStore("tdj-booth", "kv") : undefined;

export interface FolderInfo {
  name: string;
  files: number;
  /** when the browser cannot keep a handle (Firefox, Safari): re-pick each session */
  session?: boolean;
}
export interface MatchRecord {
  path: string;
  size: number;
  lastModified: number;
  score: number;
  manual?: boolean;
}
export type MatchMap = Record<string, MatchRecord>;
export type MeasurementMap = Record<string, Measurement>;
export interface NightRecord {
  playlistId: string;
  planIndex: number;
  state: string;
  startedAt: number;
  settings: Record<string, unknown>;
  trims: Record<string, number>;
  master: number;
  cortinaFader: number;
  log: BoothLogEntry[];
  anchors: Array<{ planIndex: number; at: string }>;
  updatedAt: number;
  rehearsal?: boolean;
}

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  if (!store) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

export const loadFolderHandle = () =>
  safe<FileSystemDirectoryHandle | undefined>(() => get("folder", store), undefined);
export const saveFolderHandle = (h: FileSystemDirectoryHandle | null) =>
  safe(() => (h ? set("folder", h, store) : del("folder", store)), undefined);
export const loadFolderInfo = () => safe<FolderInfo | undefined>(() => get("folderInfo", store), undefined);
export const saveFolderInfo = (i: FolderInfo | null) =>
  safe(() => (i ? set("folderInfo", i, store) : del("folderInfo", store)), undefined);

export const loadMatches = () => safe<MatchMap>(async () => (await get("matches", store)) ?? {}, {});
export const saveMatches = (m: MatchMap) => safe(() => set("matches", m, store), undefined);

export const loadMeasurements = () =>
  safe<MeasurementMap>(async () => (await get("measurements", store)) ?? {}, {});
export const saveMeasurements = (m: MeasurementMap) => safe(() => set("measurements", m, store), undefined);
export const measurementKey = (path: string, size: number, mtime: number) => `${path}|${size}|${mtime}`;

export const loadNight = () => safe<NightRecord | undefined>(() => get("night", store), undefined);
export const saveNight = (n: NightRecord | null) =>
  safe(() => (n ? set("night", n, store) : del("night", store)), undefined);

/** Per-device booth settings (the §6.1 object) and the theme choice for `/booth`. */
export const loadBoothSettings = () =>
  safe<Record<string, unknown> | undefined>(() => get("settings", store), undefined);
export const saveBoothSettings = (s: Record<string, unknown>) =>
  safe(() => set("settings", s, store), undefined);

/** A night older than this is not offered for resumption. */
export const NIGHT_MAX_AGE_MS = 12 * 3600_000;
