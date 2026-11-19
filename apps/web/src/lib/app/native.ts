"use client";
import { t as tx } from "@/lib/i18n";
import type { HostCalls, HostError, SpotifyAccess, WireRequest, WireResponse } from "./host";

/**
 * The page's side of the native bridge: Tauri commands of src-tauri (src/commands.rs, src/secrets.rs, src/net.rs)
 * and tauri-plugin-sql. Only the app's own pages may call them (capabilities/default.json).
 */
interface NativeInfo {
  platform?: string;
  version?: string;
  apiBase?: string;
  /** the Spotify Client ID this build ships with (public; PKCE needs no secret) */
  spotifyClientId?: string | null;
  /** the DJ's own Spotify Client ID ("Use my own Spotify app"), kept in this device's Keychain */
  ownSpotifyClientId?: string | null;
  /** the TDJ server the DJ linked under Settings → Connections, when the link is on */
  linkedServer?: string | null;
  updater?: boolean;
  appStore?: boolean;
}
declare global {
  interface Window {
    __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    __TDJ_NATIVE__?: NativeInfo;
  }
}

export const hasNative = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

export function invoke<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const t = typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
  if (!t)
    return Promise.reject({ message: tx("native.this_needs_the_t_dj_app"), status: 501 } satisfies HostError);
  return t.invoke(cmd, args) as Promise<T>;
}

/** Live native info (the link to a server can change while the app runs). */
export async function nativeInfo(): Promise<NativeInfo> {
  try {
    return { ...(window.__TDJ_NATIVE__ ?? {}), ...(await invoke<NativeInfo>("get_native_info")) };
  } catch {
    return window.__TDJ_NATIVE__ ?? {};
  }
}

const DB = "sqlite:tdj.db";
let loaded: Promise<unknown> | null = null;
const loadDb = () => {
  if (!loaded)
    loaded = invoke("plugin:sql|load", { db: DB }).catch((e) => {
      loaded = null;
      throw e;
    });
  return loaded;
};

/** The Client ID the app was built with (TDJ_SPOTIFY_CLIENT_ID, baked into the bundle by build-ui.mjs). */
const BUILT_IN_SPOTIFY = process.env.NEXT_PUBLIC_TDJ_SPOTIFY_CLIENT_ID || "";

/**
 * Which Spotify app signs the DJ in: their own ("Use my own Spotify app", Settings → Connections → Spotify; kept in
 * the Keychain, or the page's settings from an older build) wins over the one this build ships with. Spotify's
 * Development Mode admits 5 listed users (February 2026), so every DJ past those needs their own.
 */
export function pickSpotifyClientId(o: {
  keychain?: string | null;
  settings?: string | null;
  native?: string | null;
  builtIn?: string | null;
}): { id: string; own: boolean } {
  const own = (o.keychain ?? "").trim() || (o.settings ?? "").trim();
  if (own) return { id: own, own: true };
  return { id: (o.native ?? "").trim() || (o.builtIn ?? "").trim(), own: false };
}

export async function spotifyClientId(): Promise<string> {
  const { useStore } = await import("@/lib/store");
  const info = await nativeInfo();
  return pickSpotifyClientId({
    keychain: info.ownSpotifyClientId,
    settings: useStore.getState().settings.spotifyClientId,
    native: info.spotifyClientId,
    builtIn: BUILT_IN_SPOTIFY,
  }).id;
}

/** Saves the DJ's own Client ID in this device's Keychain ("" removes it: the built-in app again). */
export async function saveOwnSpotifyClientId(id: string): Promise<void> {
  const v = id.trim();
  if (v) await invoke("secret_set", { name: "spotify.client_id", value: v });
  else await invoke("secret_delete", { name: "spotify.client_id" });
}

/** What the engine worker asks the page to do natively (lib/app/host.ts). */
export function nativeHost(origFetch: typeof fetch): HostCalls {
  return {
    fetch: (r) => invoke<WireResponse>("net_fetch", { req: r }),
    ask: async (ai, req) => (await import("./ai")).deviceAsk(ai, req),
    sql: async (op, query, values) => {
      await loadDb();
      if (op === "select") return invoke(`plugin:sql|select`, { db: DB, query, values });
      return invoke(`plugin:sql|execute`, { db: DB, query, values });
    },
    spotify: {
      enabled: async () => !!(await spotifyClientId()),
      access: async () => {
        const clientId = await spotifyClientId();
        return clientId ? invoke<SpotifyAccess | null>("spotify_access", { clientId }) : null;
      },
      logout: () => invoke("spotify_logout"),
    },
    linked: async () => !!(await nativeInfo()).linkedServer,
    remote: async (r: WireRequest) => {
      const base = (await nativeInfo()).apiBase ?? "tdjapi://localhost";
      const res = await origFetch(base + r.url, { method: r.method, headers: r.headers, body: r.body });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: res.status, headers, body: await res.text() };
    },
  };
}
