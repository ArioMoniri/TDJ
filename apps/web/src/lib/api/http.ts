/**
 * Responses for the shared route handlers (lib/api/*). Plain `Response` (not `NextResponse`), so the same handler
 * answers on the server (apps/web/src/app/api/**) and inside the macOS and iPadOS apps (lib/app/adapter.ts), where
 * there is no Next server.
 */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** `json` with `cache-control: no-store` (session, token and quota answers). */
export function jsonNoStore(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return json(body, { ...init, headers });
}

export function noStore<T extends Response>(res: T): T {
  res.headers.set("cache-control", "no-store");
  return res;
}

export const bad = (error: string, status = 400) => json({ error }, { status });

export function redirect(url: string, status = 302, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set("location", url);
  return new Response(null, { status, headers: h });
}

/** A request body read field by field, as the route handlers always have (`await req.json()`). */
// biome-ignore lint/suspicious/noExplicitAny: every field is checked where it is read
export type AnyBody = any;

/** The request body as JSON, or null when it is missing or does not parse. */
export async function bodyJson<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
