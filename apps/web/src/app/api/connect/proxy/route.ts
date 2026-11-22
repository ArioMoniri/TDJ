import { accountFor, connectEnabled, isConnectApp, proxyRequest, proxyTarget } from "@/lib/server/connect";
import { userFromRequest } from "@/lib/server/db";
import { crossOriginResponse, jsonNoStore } from "@/lib/server/guard";
import { rateLimited } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const MAX_BODY = 1_000_000;

/**
 * 2026-11 — one API call with the DJ's Pipedream-connected account (docs/CONNECTORS.md → Seamless connectors):
 *   `{ app, method, url, body?, headers? }` → the provider's own answer (status, content type, body).
 * `url` must be that app's own API (lib/server/connect.ts → PROXY_ALLOW). The user is the anonymous `tdj_uid`
 * cookie id (random, never an e-mail); their account's credentials stay in Pipedream. Off (404) unless the
 * server has PIPEDREAM_PROJECT_ID, PIPEDREAM_CLIENT_ID and PIPEDREAM_CLIENT_SECRET; 60 calls a minute per DJ.
 */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!connectEnabled())
    return jsonNoStore({ error: "Pipedream Connect is not turned on for this T-DJ site" }, { status: 404 });
  const user = await userFromRequest(req);
  if (user.setCookie) {
    const res = jsonNoStore({ error: "not_connected" }, { status: 409 });
    res.headers.append("set-cookie", user.setCookie);
    return res;
  }
  const b = (await req.json().catch(() => null)) as {
    app?: unknown;
    method?: unknown;
    url?: unknown;
    body?: unknown;
    headers?: unknown;
  } | null;
  if (!b || !isConnectApp(b.app)) return jsonNoStore({ error: "app required" }, { status: 400 });
  const method = typeof b.method === "string" ? b.method.toUpperCase() : "GET";
  if (!METHODS.has(method)) return jsonNoStore({ error: "method not allowed" }, { status: 400 });
  const url = proxyTarget(b.app, b.url);
  if (!url) return jsonNoStore({ error: "That address is not this app's API" }, { status: 400 });
  const body =
    b.body === undefined || b.body === null
      ? undefined
      : typeof b.body === "string"
        ? b.body
        : JSON.stringify(b.body);
  if (body && body.length > MAX_BODY) return jsonNoStore({ error: "body too large" }, { status: 413 });
  const headers: Record<string, string> = {};
  if (b.headers && typeof b.headers === "object")
    for (const [k, v] of Object.entries(b.headers as Record<string, unknown>))
      if (typeof v === "string") headers[k] = v;
  if (body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type"))
    headers["content-type"] = "application/json";
  if (rateLimited(`pd-proxy:${user.id}`, 60))
    return jsonNoStore({ error: "slow_down" }, { status: 429, headers: { "retry-after": "60" } });
  try {
    const account = await accountFor(user.id, b.app);
    if (!account) return jsonNoStore({ error: "not_connected", app: b.app }, { status: 409 });
    const r = await proxyRequest(user.id, account.id, { method, url, headers, body });
    return new Response([204, 205, 304].includes(r.status) ? null : r.body, {
      status: r.status,
      headers: {
        "content-type": r.contentType || "application/octet-stream",
        "cache-control": "no-store",
        "x-tdj-via": "pipedream",
      },
    });
  } catch {
    return jsonNoStore({ error: "Pipedream did not answer" }, { status: 502 });
  }
}
