import type { ConnectionId } from "./catalog";

/**
 * 2026-11 — "Connect Spotify (one tap)": the managed sign-in a server offers when it has Pipedream Connect
 * (PIPEDREAM_PROJECT_ID / CLIENT_ID / CLIENT_SECRET; docs/CONNECTORS.md → Seamless connectors with Pipedream
 * Connect). Pipedream's own OAuth apps run the sign-in, the DJ's account is tied to the anonymous `tdj_uid` id, and
 * calls go through the server's /api/connect/proxy. The apps use it through a linked server; without one (or on a
 * server without Pipedream) everything falls back to the built-in Spotify app or the DJ's own credentials.
 */
export const MANAGED_APP: Partial<Record<ConnectionId, string>> = {
  spotify: "spotify",
  youtube: "youtube_data_api",
  dropbox: "dropbox",
  google_drive: "google_drive",
};
export interface ManagedState {
  enabled: boolean;
  /** the Pipedream app slugs this DJ has a healthy account for */
  connected: string[];
}
export const MANAGED_OFF: ManagedState = { enabled: false, connected: [] };

/** GET /api/connect/accounts (names and health only, never a credential). */
export async function fetchManaged(f: typeof fetch = fetch): Promise<ManagedState> {
  try {
    const r = await f("/api/connect/accounts", { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as {
      enabled?: boolean;
      accounts?: Array<{ app?: string; healthy?: boolean }>;
    } | null;
    if (!j?.enabled) return MANAGED_OFF;
    return {
      enabled: true,
      connected: (j.accounts ?? []).filter((a) => a.healthy !== false && a.app).map((a) => a.app as string),
    };
  } catch {
    return MANAGED_OFF;
  }
}

export const managedConnected = (id: ConnectionId, m: ManagedState | undefined) =>
  !!m?.enabled && !!MANAGED_APP[id] && m.connected.includes(MANAGED_APP[id] as string);

/**
 * Starts the one-tap connection: a short-lived Connect token from the server, then Pipedream's hosted page. Web: a
 * new tab, opened before the request so pop-up blockers allow it. Apps: the system browser.
 */
export async function startManaged(
  id: ConnectionId,
  d: {
    fetch: typeof fetch;
    app: boolean;
    openExternal: (url: string) => Promise<unknown>;
    openTab?: () => Window | null;
  },
): Promise<void> {
  const app = MANAGED_APP[id];
  if (!app) throw new Error("not available");
  const tab = d.app ? null : (d.openTab?.() ?? null);
  try {
    const r = await d.fetch("/api/connect/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app }),
    });
    const j = (await r.json().catch(() => ({}))) as { connect_link_url?: string; error?: string };
    if (!r.ok || !j.connect_link_url || !/^https:\/\//.test(j.connect_link_url))
      throw new Error(j.error ?? String(r.status));
    if (tab) {
      tab.opener = null;
      tab.location.href = j.connect_link_url;
    } else await d.openExternal(j.connect_link_url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
