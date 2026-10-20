import "server-only";
/**
 * Pipedream Connect: managed OAuth for the apps Spotify's 5-user rule does not cover (YouTube, Dropbox, Google
 * Drive) and Spotify as an alternative. Enabled only when PIPEDREAM_PROJECT_ID / CLIENT_ID / CLIENT_SECRET are set.
 * Tokens live in Pipedream; TDJ only ever sees proxy responses. See docs/research/connectors.md §4.2.
 */
export const CONNECT_APPS = [
  { slug: "spotify", label: "Spotify", kind: "playlist" },
  { slug: "youtube_data_api", label: "YouTube", kind: "playlist" },
  { slug: "dropbox", label: "Dropbox", kind: "file" },
  { slug: "google_drive", label: "Google Drive", kind: "file" },
] as const;
export type ConnectApp = (typeof CONNECT_APPS)[number]["slug"];
export const isConnectApp = (s: unknown): s is ConnectApp =>
  typeof s === "string" && CONNECT_APPS.some((a) => a.slug === s);

export function connectEnabled(): boolean {
  return !!(
    process.env.PIPEDREAM_PROJECT_ID &&
    process.env.PIPEDREAM_CLIENT_ID &&
    process.env.PIPEDREAM_CLIENT_SECRET
  );
}
const environment = () => (process.env.PIPEDREAM_ENVIRONMENT === "production" ? "production" : "development");

import type { PipedreamClient } from "@pipedream/sdk";
import { httpJson } from "./headerJson";

let client: Promise<PipedreamClient> | null = null;
/** The official server SDK, loaded lazily so the route modules stay cheap when Connect is off. */
async function pd() {
  if (!client)
    client = (async () => {
      const { PipedreamClient } = await import("@pipedream/sdk");
      return new PipedreamClient({
        projectId: process.env.PIPEDREAM_PROJECT_ID!,
        clientId: process.env.PIPEDREAM_CLIENT_ID!,
        clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
        projectEnvironment: environment(),
        baseUrl: process.env.PIPEDREAM_API_URL || undefined,
      });
    })().catch((e) => {
      client = null;
      throw e;
    });
  return client;
}

export async function createConnectToken(uid: string, origin: string, app?: ConnectApp) {
  const c = await pd();
  const r = await c.tokens.create({
    externalUserId: uid,
    allowedOrigins: [origin],
    successRedirectUri: `${origin}/settings?connected=${app ?? "1"}`,
    errorRedirectUri: `${origin}/settings?error=connect`,
  });
  const link = new URL(r.connectLinkUrl);
  if (app) link.searchParams.set("app", app);
  return { token: r.token, expires_at: r.expiresAt, connect_link_url: link.toString() };
}

export interface ConnectedAccount {
  id: string;
  app: ConnectApp;
  label: string;
  name?: string;
  healthy: boolean;
}
export async function listAccounts(uid: string): Promise<ConnectedAccount[]> {
  const c = await pd();
  const page = await c.accounts.list({ externalUserId: uid, limit: 50 });
  const out: ConnectedAccount[] = [];
  for (const a of page.data ?? []) {
    const slug = a.app?.nameSlug ?? "";
    const meta = CONNECT_APPS.find((x) => x.slug === slug);
    if (!meta || a.dead) continue;
    out.push({
      id: String(a.id),
      app: meta.slug,
      label: meta.label,
      name: a.name,
      healthy: a.healthy !== false,
    });
  }
  return out;
}

/** JSON request through the SDK proxy (Pipedream injects the user's credentials). */
export async function proxyJson<T>(
  uid: string,
  accountId: string,
  method: "get" | "post" | "put",
  url: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<T> {
  const c = await pd();
  const common = { externalUserId: uid, accountId, url, params, headers: { accept: "application/json" } };
  const r =
    method === "get"
      ? await c.proxy.get(common)
      : method === "put"
        ? await c.proxy.put({ ...common, body: body ?? {} })
        : await c.proxy.post({ ...common, body: body ?? {} });
  return r as T;
}

/** Raw-body request through the REST proxy (file uploads: the SDK proxy only sends JSON). */
export async function proxyRaw(
  uid: string,
  accountId: string,
  url: string,
  init: { method: "POST" | "PUT"; headers: Record<string, string>; body: string | Uint8Array },
): Promise<unknown> {
  const c = await pd();
  const base = (process.env.PIPEDREAM_API_URL || "https://api.pipedream.com").replace(/\/$/, "");
  const url64 = Buffer.from(url).toString("base64url");
  const q = new URLSearchParams({ external_user_id: uid, account_id: accountId });
  const headers: Record<string, string> = {
    authorization: `Bearer ${await c.rawAccessToken}`,
    "x-pd-environment": environment(),
  };
  for (const [k, v] of Object.entries(init.headers)) headers[`x-pd-proxy-${k}`] = v;
  const r = await fetch(
    `${base}/v1/connect/${encodeURIComponent(process.env.PIPEDREAM_PROJECT_ID!)}/proxy/${url64}?${q}`,
    {
      method: init.method,
      headers,
      body: init.body as BodyInit,
    },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`Proxy to ${new URL(url).host} answered ${r.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "tdj-set";

export async function uploadDropbox(uid: string, accountId: string, f: { filename: string; text: string }) {
  const path = `/${safeName(f.filename)}`;
  const r = (await proxyRaw(uid, accountId, "https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": httpJson({ path, mode: "add", autorename: true, mute: false }),
    },
    body: f.text,
  })) as { path_display?: string };
  return { path: r.path_display ?? path, url: "https://www.dropbox.com/home/Apps" };
}

export async function uploadDrive(
  uid: string,
  accountId: string,
  f: { filename: string; mime: string; text: string },
) {
  const boundary = `tdj${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: safeName(f.filename) }),
    `--${boundary}`,
    `Content-Type: ${f.mime}`,
    "",
    f.text,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const r = (await proxyRaw(
    uid,
    accountId,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
  )) as { id?: string; name?: string; webViewLink?: string };
  return {
    path: r.name ?? f.filename,
    url: r.webViewLink ?? (r.id ? `https://drive.google.com/file/d/${r.id}` : undefined),
  };
}

/**
 * YouTube: one playlist insert (50 units) + one search (100/day/project) + one playlistItems insert (50 units) per
 * track. The daily quota is shared by every TDJ user, so this is best effort and stops at the first quota error.
 */
export async function youtubePlaylist(
  uid: string,
  accountId: string,
  p: { name: string; description: string; isPublic: boolean; queries: string[] },
) {
  const YT = "https://www.googleapis.com/youtube/v3";
  const pl = await proxyJson<{ id: string }>(
    uid,
    accountId,
    "post",
    `${YT}/playlists`,
    {
      snippet: { title: p.name, description: p.description },
      status: { privacyStatus: p.isPublic ? "public" : "private" },
    },
    { part: "snippet,status" },
  );
  let added = 0;
  let quota = false;
  const missing: string[] = [];
  /** not searched because the quota ran out (reported apart from `missing`, like the direct path) */
  const skipped: string[] = [];
  for (const q of p.queries) {
    if (quota) {
      skipped.push(q);
      continue;
    }
    try {
      const s = await proxyJson<{ items?: Array<{ id?: { videoId?: string } }> }>(
        uid,
        accountId,
        "get",
        `${YT}/search`,
        undefined,
        {
          part: "snippet",
          type: "video",
          maxResults: "1",
          q,
        },
      );
      const videoId = s.items?.[0]?.id?.videoId;
      if (!videoId) {
        missing.push(q);
        continue;
      }
      await proxyJson(
        uid,
        accountId,
        "post",
        `${YT}/playlistItems`,
        { snippet: { playlistId: pl.id, resourceId: { kind: "youtube#video", videoId } } },
        { part: "snippet" },
      );
      added++;
    } catch (e) {
      if (/quota|403/i.test(String(e))) {
        quota = true;
        skipped.push(q);
      } else missing.push(q);
    }
  }
  return { id: pl.id, url: `https://www.youtube.com/playlist?list=${pl.id}`, added, missing, skipped, quota };
}

/** Spotify through Pipedream's managed client (an alternative to the hosted login; same 5-user rule applies). */
export async function spotifyPlaylistViaProxy(
  uid: string,
  accountId: string,
  p: {
    name: string;
    description: string;
    isPublic: boolean;
    uris: string[];
    queries: Array<{ isrc?: string | null; query: string }>;
  },
) {
  const SP = "https://api.spotify.com/v1";
  const uris = [...p.uris];
  const missing: string[] = [];
  for (const t of p.queries) {
    let uri: string | undefined;
    for (const q of t.isrc ? [`isrc:${t.isrc}`, t.query] : [t.query]) {
      const r = await proxyJson<{ tracks?: { items?: Array<{ uri: string }> } }>(
        uid,
        accountId,
        "get",
        `${SP}/search`,
        undefined,
        {
          q,
          type: "track",
          limit: "5",
        },
      ).catch(() => null);
      uri = r?.tracks?.items?.[0]?.uri;
      if (uri) break;
    }
    if (uri) uris.push(uri);
    else missing.push(t.query);
  }
  const pl = await proxyJson<{ id: string; external_urls?: { spotify?: string } }>(
    uid,
    accountId,
    "post",
    `${SP}/me/playlists`,
    {
      name: p.name,
      description: p.description,
      public: p.isPublic,
    },
  );
  for (let i = 0; i < uris.length; i += 100)
    await proxyJson(uid, accountId, "post", `${SP}/playlists/${pl.id}/items`, {
      uris: uris.slice(i, i + 100),
    });
  return {
    id: pl.id,
    url: pl.external_urls?.spotify ?? `https://open.spotify.com/playlist/${pl.id}`,
    added: uris.length,
    missing,
  };
}
