import "server-only";
import { NextResponse } from "next/server";
import { getConfigValue } from "./config";
import { incomingOrigin } from "./cookies";

/**
 * Request-level guards shared by the API routes: the trustworthy client address, a same-origin check for
 * state-changing routes and the `cache-control: no-store` every session endpoint must carry.
 */

/**
 * The address the request really came from. CloudFront *appends* the viewer address to whatever
 * `X-Forwarded-For` the client sent, so only the last element can be trusted; a caller-chosen first element
 * must never key a rate limit. `cloudfront-viewer-address` (when the distribution forwards it) is the same
 * value with a port. Off AWS the same rule holds for any proxy that appends.
 */
export function clientKey(req: Request): string {
  const viewer = req.headers.get("cloudfront-viewer-address")?.replace(/:\d+$/, "").trim();
  if (viewer) return viewer;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart) return lastPart;
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}

const trim = (s: string) => s.replace(/\/$/, "").toLowerCase();
/**
 * Whether the request may change state: a browser sends `Origin` on every POST/PUT/DELETE, so an `Origin` that
 * is neither the origin the request came in on nor the configured public URL is another site's script (CSRF or
 * a credit-burning page). Requests without `Origin` (curl, server-to-server, same-origin GET) pass; the
 * `sec-fetch-site: cross-site` hint is honoured when present. Returns the 403 to send, or null when allowed.
 */
export async function crossOriginResponse(req: Request): Promise<NextResponse | null> {
  if (req.headers.get("sec-fetch-site") === "cross-site") return forbiddenOrigin();
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return null;
  const allowed = new Set([trim(incomingOrigin(req))]);
  const configured = await getConfigValue("NEXT_PUBLIC_APP_URL").catch(() => undefined);
  if (configured) allowed.add(trim(configured));
  return allowed.has(trim(origin)) ? null : forbiddenOrigin();
}
const forbiddenOrigin = () =>
  NextResponse.json(
    { error: "This request did not come from the app itself." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );

/** Marks a response as never cacheable (session, token and quota answers). */
export function noStore<T extends Response>(res: T): T {
  res.headers.set("cache-control", "no-store");
  return res;
}
/** `NextResponse.json` with `cache-control: no-store`. */
export function jsonNoStore(body: unknown, init: ResponseInit = {}): NextResponse {
  return noStore(NextResponse.json(body, init));
}
