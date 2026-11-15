/**
 * JSON requests to a provider's Web API with a bearer token (Spotify, Google, Dropbox): shared by the server
 * (lib/server/oauth.ts re-exports it) and the apps, which call Spotify's Web API from the device.
 */
export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, message: string, body = "") {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** A 429 the provider would not let us wait out: `retryAfter` seconds is what it asked for. */
export class RateLimitError extends ApiError {
  retryAfter: number;
  constructor(url: string, retryAfter: number, body = "") {
    super(429, `${new URL(url).pathname}: 429 rate limited, retry after ${retryAfter} s`, body);
    this.retryAfter = retryAfter;
  }
}
/** Longest Retry-After (seconds) a request waits out once; beyond it the caller is told to pause. */
export const RETRY_AFTER_MAX = 10;
export const isRateLimited = (e: unknown): e is RateLimitError => e instanceof RateLimitError;

/**
 * JSON request with a bearer token. A 429 is retried exactly once when Retry-After is ≤ RETRY_AFTER_MAX seconds
 * and the wait would end before `deadline` (an epoch ms budget the route sets so one request never outlives the
 * function); a longer wait, or a second 429, throws `RateLimitError` so the route can report the pause instead
 * of hammering the provider (there is never an uncapped retry loop).
 */
export async function api<T>(
  access: string,
  url: string,
  init: RequestInit = {},
  attempt = 0,
  deadline?: number,
): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (r.status === 429) {
    const header = Number(r.headers.get("retry-after"));
    const wait = Number.isFinite(header) && header > 0 ? Math.ceil(header) : 2;
    const body = await r.text().catch(() => "");
    const crosses = deadline !== undefined && Date.now() + wait * 1000 > deadline;
    if (attempt >= 1 || wait > RETRY_AFTER_MAX || crosses) throw new RateLimitError(url, wait, body);
    await new Promise((res) => setTimeout(res, wait * 1000));
    return api<T>(access, url, init, attempt + 1, deadline);
  }
  if (!r.ok) {
    const body = await r.text();
    throw new ApiError(r.status, `${new URL(url).pathname}: ${r.status} ${body.slice(0, 200)}`, body);
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** HTTP status for a failed provider call: 401 when the grant is gone, 502 for anything else upstream. */
export const errorStatus = (e: unknown) =>
  e instanceof ApiError ? (e.status === 401 ? 401 : e.status === 429 ? 429 : 502) : 500;

/** File names on a cloud drive: no path separators or reserved characters. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "tdj-set";
