"use client";
import { useSyncExternalStore } from "react";
import { KEYCHAIN_KEY } from "@/lib/app/target";
import { validYoutubeKey } from "./catalog";

/**
 * 2026-11 — the DJ's own credentials for the services that allow a public client (docs/CONNECTORS.md → Bring your
 * own). They stay on this device and go only to the provider itself, never to a TDJ server:
 * - web: this browser's storage under its own key (`tdj-byo-v1`), apart from the settings store, so nothing that
 *   syncs settings (the server database, the apps' on-device copy) ever carries them;
 * - apps: the YouTube key and the Dropbox / Google refresh tokens in the Keychain (src-tauri/src/byo.rs); the page
 *   keeps only the mark that one is saved (`keychain:`) and the public IDs.
 * Public identifiers (a Dropbox app key, a Google client ID) are not secrets: they are in every sign-in link.
 */
export const BYO_STORAGE_KEY = "tdj-byo-v1";

export type OwnProvider = "dropbox" | "google";
export interface OwnOAuth {
  /** the Dropbox app key or the Google client ID (public) */
  clientId: string;
  /** web only: the tokens in this browser (the apps keep the refresh token in the Keychain) */
  refresh?: string;
  access?: string;
  /** ms since 1970 */
  expires?: number;
  /** signed in (web: a refresh token is here; apps: the Keychain holds one) */
  connected?: boolean;
  account?: string;
}
export interface ByoState {
  /** web: the key itself; apps: `keychain:` once the Keychain holds it */
  youtubeKey?: string;
  dropbox?: OwnOAuth;
  google?: OwnOAuth;
}

export interface KeyValueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
/** this browser's storage, or nothing (private mode, server rendering): BYO then simply reads as empty */
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

let storage: KeyValueStorage | null | undefined;
const store = () => (storage === undefined ? browserStorage() : storage);
/** tests: a storage of their own (null for none) */
export function setByoStorage(s: KeyValueStorage | null | undefined) {
  storage = s;
  cached = null;
}

let cached: { raw: string | null; state: ByoState } | null = null;
const EMPTY: ByoState = {};
export function readByo(): ByoState {
  let raw: string | null = null;
  try {
    raw = store()?.getItem(BYO_STORAGE_KEY) ?? null;
  } catch {}
  if (cached && cached.raw === raw) return cached.state;
  let state: ByoState = EMPTY;
  try {
    const j = raw ? (JSON.parse(raw) as ByoState) : null;
    if (j && typeof j === "object") state = j;
  } catch {}
  cached = { raw, state };
  return state;
}

const listeners = new Set<() => void>();
export function writeByo(patch: Partial<ByoState>): ByoState {
  const next: ByoState = { ...readByo(), ...patch };
  for (const k of Object.keys(next) as Array<keyof ByoState>) if (next[k] === undefined) delete next[k];
  try {
    const s = store();
    if (Object.keys(next).length) s?.setItem(BYO_STORAGE_KEY, JSON.stringify(next));
    else s?.removeItem(BYO_STORAGE_KEY);
  } catch {}
  for (const l of listeners) l();
  return readByo();
}
export function subscribeByo(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
/** the BYO state for components, updated on every write */
export function useByo(): ByoState {
  return useSyncExternalStore(subscribeByo, readByo, () => EMPTY);
}

/** What the native side is asked to do (lib/app/native.ts → invoke); a reject means "not saved". */
export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
export interface ByoEnv {
  /** the T-DJ app (Keychain) or a browser */
  app: boolean;
  invoke?: Invoke;
}

/** The Keychain item of the DJ's YouTube key (src-tauri/src/secrets.rs → page_may_write). */
export const YOUTUBE_KEYCHAIN_NAME = "byo.youtube";

export const hasYoutubeKey = (s: ByoState = readByo()) => !!s.youtubeKey;

/**
 * Saves (or, empty, removes) the DJ's YouTube Data API key. Returns `"invalid"` for a value that is not an API key;
 * in the apps the key goes to the Keychain and the page keeps only the mark.
 */
export async function saveYoutubeKey(value: string, env: ByoEnv): Promise<"saved" | "removed" | "invalid"> {
  const v = value.trim();
  if (v && !validYoutubeKey(v)) return "invalid";
  if (env.app) {
    if (!env.invoke) throw new Error("no native bridge");
    if (v) await env.invoke("secret_set", { name: YOUTUBE_KEYCHAIN_NAME, value: v });
    else await env.invoke("secret_delete", { name: YOUTUBE_KEYCHAIN_NAME });
    writeByo({ youtubeKey: v ? KEYCHAIN_KEY : undefined });
  } else writeByo({ youtubeKey: v || undefined });
  return v ? "saved" : "removed";
}

/** The public ID for one provider (Dropbox app key, Google client ID); a change signs the old one out. */
export function saveOwnClientId(provider: OwnProvider, clientId: string): ByoState {
  const v = clientId.trim();
  const cur = readByo()[provider];
  if (!v) return writeByo({ [provider]: undefined });
  if (cur?.clientId === v) return readByo();
  return writeByo({ [provider]: { clientId: v } });
}

/** What the page may show of a key: never the value, only that one is saved and its last 4 characters (web). */
export function keyHint(key: string | undefined): string {
  if (!key) return "";
  if (key === KEYCHAIN_KEY) return "";
  return `…${key.slice(-4)}`;
}
