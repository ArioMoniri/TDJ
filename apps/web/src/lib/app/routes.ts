import { importNight, NightFormatError } from "@tdj/core";
import { artwork } from "@/lib/api/artwork";
import { dna } from "@/lib/api/dna";
import {
  adapt,
  benchmark,
  checkEditRoute,
  compose,
  exportFile,
  feedback,
  improve,
  meta,
  search,
  swap,
  swapOptions,
  swapTrack,
} from "@/lib/api/engine";
import { json, jsonNoStore, noStore } from "@/lib/api/http";
import { importMatch } from "@/lib/api/importMatch";
import { preview, resolve, resolveStatus } from "@/lib/api/net";
import { popularity } from "@/lib/api/popularity";
import { searchQuery } from "@/lib/api/search";
import { serviceSearch } from "@/lib/api/serviceSearch";
import { spot } from "@/lib/api/spot";
import { spotifyMatch, spotifyPlaylist } from "@/lib/api/spotify";
import { spotifyCover } from "@/lib/api/spotifyCover";
import { tandaSet } from "@/lib/api/tandaSet";
import { t } from "@/lib/i18n";
import { profile } from "@/lib/spotifyWeb";
import type { AgentMemory, AppOverrides, HistorySnapshot } from "@/lib/types";
import type { AppDeps } from "./deps";
// the server routes the app runs unchanged (the AI routes, song search, add a side, build by hand, fill)
import { DEVICE_ROUTES } from "./deviceRoutes";
import type { WireRequest } from "./host";
import { KEYCHAIN_KEY } from "./target";

type Handler = (req: Request, d: AppDeps) => Promise<Response>;
type Method = "GET" | "POST" | "PUT";

/* ---------- routes only the apps answer this way ---------- */

/** /api/db: the DJ's database in the on-device SQLite (the web's server row, on the device). */
async function dbGet(_req: Request, d: AppDeps): Promise<Response> {
  const s = await d.store();
  const [overrides, memory, history] = await Promise.all([
    s.getDoc<AppOverrides>("overrides"),
    s.getDoc<AgentMemory>("memory"),
    s.getHistory<HistorySnapshot & { id: string }>(),
  ]);
  return jsonNoStore({
    enabled: true,
    mode: "server",
    storage: "device",
    overrides: overrides ?? {},
    memory: memory ?? null,
    history,
  });
}

async function dbPut(req: Request, d: AppDeps): Promise<Response> {
  const text = await req.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!body || typeof body !== "object")
    return jsonNoStore({ error: t("routes.invalid_json") }, { status: 400 });
  const s = await d.store();
  const stamp = (o: AppOverrides) => {
    // connector URLs stay in the page's own storage, exactly as on the web
    const { connectors: _c, ...rest } = o;
    return { ...rest, updatedAt: new Date().toISOString() };
  };
  if ("overrides" in body || "memory" in body || "history" in body) {
    if (body.overrides && typeof body.overrides === "object")
      await s.putDoc("overrides", stamp(body.overrides as AppOverrides));
    if (body.memory && typeof body.memory === "object") await s.putDoc("memory", body.memory);
    if (Array.isArray(body.history)) await s.putHistory(body.history as HistorySnapshot[]);
  } else await s.putDoc("overrides", stamp(body as AppOverrides));
  // a linked TDJ server (Settings → Connections) gets the same write: the DJ's own instance stays in sync
  if (await d.host.linked().catch(() => false))
    void d.host.remote({
      url: "/api/db",
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: text,
    });
  return jsonNoStore({ ok: true, storage: "device" });
}

async function dbExport(_req: Request, d: AppDeps): Promise<Response> {
  const overrides = (await (await d.store()).getDoc<AppOverrides>("overrides")) ?? {};
  return noStore(
    new Response(JSON.stringify(overrides, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="tdj-database.json"',
      },
    }),
  );
}

/** /api/spotify/me: the session this device holds (tokens in the Keychain, never in the page's storage). */
async function spotifyMe(_req: Request, d: AppDeps): Promise<Response> {
  const hosted = await d.spotify.enabled();
  const s = hosted ? await d.spotify.session(_req) : null;
  if (!s) return jsonNoStore({ hosted, user: null });
  try {
    const user = await profile(s.access);
    return jsonNoStore({
      hosted,
      user,
      token: { access: s.access, expires: s.expires },
      ...(s.scopes?.length ? { scopes: s.scopes } : {}),
    });
  } catch (e) {
    return jsonNoStore({ hosted, user: null, error: (e as Error).message });
  }
}

async function spotifyAccess(req: Request, d: AppDeps): Promise<Response> {
  if (!(await d.spotify.enabled()))
    return json({ error: t("routes.spotify_is_not_set_up_in") }, { status: 404 });
  const s = await d.spotify.session(req);
  if (!s) return json({ error: t("routes.not_logged_in_with_spotify") }, { status: 401 });
  return jsonNoStore({ access: s.access, expires: s.expires });
}

async function spotifyLogout(_req: Request, d: AppDeps): Promise<Response> {
  await d.host.spotify.logout();
  return jsonNoStore({ ok: true });
}

/** The app's settings in the device database (lib/app/boot.ts mirrors the store; never a key). */
async function settingsGet(_req: Request, d: AppDeps): Promise<Response> {
  return jsonNoStore({ settings: await (await d.store()).getSetting("user") });
}
async function settingsPut(req: Request, d: AppDeps): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object")
    return jsonNoStore({ error: t("routes.invalid_json") }, { status: 400 });
  // the Keychain holds the keys; the database only ever the mark that one is saved, for every provider
  const marked = (k: unknown) => {
    const o = k as { key?: string } | null;
    if (o && typeof o === "object" && o.key && o.key !== KEYCHAIN_KEY) o.key = KEYCHAIN_KEY;
  };
  marked(body.ai);
  if (body.aiKeys && typeof body.aiKeys === "object") for (const k of Object.values(body.aiKeys)) marked(k);
  await (await d.store()).putSetting("user", body);
  return jsonNoStore({ ok: true });
}

/**
 * A shared night (a .tdjnight file, a tdj:// or web link) rebuilt against the catalogue in the app, as
 * /api/night/resolve does on a server. Opening a night needs no server; rooms and short links do.
 */
async function nightResolve(req: Request, d: AppDeps): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { night?: unknown } | null;
  if (!body || typeof body !== "object")
    return json({ error: t("routes.this_is_not_a_night") }, { status: 400 });
  try {
    const { catalog, cortinas } = d.catalog();
    return json(importNight(body.night, { catalog, cortinas }));
  } catch (e) {
    return json(
      { error: e instanceof NightFormatError ? e.message : t("routes.this_night_could_not_be_opened") },
      { status: 400 },
    );
  }
}

/** No organiser, no shared seats or key in an app: what /api/admin/public says about a server with none set up. */
async function publicStatus(): Promise<Response> {
  return jsonNoStore({
    providers: { spotify: false, google: false, dropbox: false },
    ownerContact: "",
    seats: {
      spotify: { used: 0, max: 0 },
      google: { used: 0, max: 0 },
      dropbox: { used: 0, max: 0 },
    },
    ai: { shared: false, dailyLimit: 0 },
  });
}

const LOCAL: Record<string, Partial<Record<Method, Handler>>> = {
  "/api/compose": { POST: compose },
  "/api/improve": { POST: improve },
  "/api/benchmark": { POST: benchmark },
  "/api/check-edit": { POST: checkEditRoute },
  "/api/swap": { POST: swap },
  "/api/adapt": { POST: adapt },
  "/api/swap-options": { POST: swapOptions },
  "/api/swap-track": { POST: swapTrack },
  "/api/tanda-set": { POST: tandaSet },
  "/api/spot": { POST: spot },
  "/api/services/search": { POST: serviceSearch },
  "/api/meta": { GET: meta },
  "/api/dna": { GET: dna },
  "/api/popularity": { GET: popularity },
  // covers without a Spotify login (lib/api/artwork.ts): the shipped cache, else oEmbed through the native client
  "/api/artwork": { GET: (req, d) => artwork(req, d) },
  "/api/search": { GET: search, POST: searchQuery },
  "/api/feedback": { POST: feedback },
  "/api/export": { POST: exportFile },
  "/api/resolve": { POST: resolve, GET: resolveStatus },
  "/api/preview": { GET: preview },
  "/api/spotify/match": { POST: spotifyMatch },
  "/api/spotify/playlist": { POST: spotifyPlaylist },
  "/api/spotify/cover": { POST: spotifyCover },
  "/api/spotify/me": { GET: spotifyMe },
  "/api/spotify/access": { GET: spotifyAccess },
  "/api/spotify/logout": { POST: spotifyLogout },
  "/api/db": { GET: dbGet, PUT: dbPut },
  "/api/db/export": { GET: dbExport },
  "/api/admin/public": { GET: publicStatus },
  "/api/app/settings": { GET: settingsGet, PUT: settingsPut },
  "/api/night/resolve": { POST: nightResolve },
  // 2026-11: "Import a playlist" matches on the device too (lib/api/importMatch.ts)
  "/api/import/match": { POST: importMatch },
};

/**
 * Services whose sign-in needs a client secret (Google, Dropbox) or a server-side account (Pipedream Connect), and
 * what several DJs share (rooms, short share links): they work only through a TDJ server the DJ linked; without
 * one the app shows them as off.
 */
// (2026-11) the owner session and owner contributions: the app sends the owner's catalogue edits to the server it is
// linked to, whose /admin unlock it shares through the bridge's cookie jar; /api/admin/public stays on the device
const VIA_LINKED_SERVER = [
  "/api/google/",
  "/api/dropbox/",
  "/api/connect/",
  "/api/rooms",
  "/api/night",
  "/api/admin/",
  "/api/owner/",
];
function offline(path: string, method: string): Response {
  // what /api/rooms says on a server that keeps no rooms
  if (path === "/api/rooms" && method === "GET") return jsonNoStore({ available: false, shortLinks: false });
  if (path === "/api/google/me" || path === "/api/dropbox/me")
    return jsonNoStore({ hosted: false, user: null });
  if (path === "/api/connect/accounts") return jsonNoStore({ enabled: false, accounts: [] });
  return jsonNoStore({ error: t("routes.link_your_tdj_server_under_settings") }, { status: 404 });
}

export async function toWire(req: Request): Promise<WireRequest> {
  const u = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  return { url: u.pathname + u.search, method: req.method, headers, body };
}

/** Every /api/* request of the app, answered on the device (or, for the linked-server services, by that server). */
export async function dispatch(req: Request, d: AppDeps): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const device = DEVICE_ROUTES[path];
  const h: Handler | undefined =
    LOCAL[path]?.[req.method as Method] ?? device?.[req.method as "GET" | "POST"];
  if (h) {
    try {
      return await h(req, d);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : t("routes.something_went_wrong") },
        { status: 500 },
      );
    }
  }
  if (LOCAL[path] || device) return json({ error: t("routes.method_not_allowed") }, { status: 405 });
  if (VIA_LINKED_SERVER.some((p) => path.startsWith(p))) {
    if (await d.host.linked().catch(() => false)) {
      const r = await d.host.remote(await toWire(req));
      return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
    }
    return offline(path, req.method);
  }
  return json({ error: t("routes.not_found") }, { status: 404 });
}
