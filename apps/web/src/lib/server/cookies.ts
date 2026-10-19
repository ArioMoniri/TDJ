import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Sealed cookies: AES-256-GCM with a key derived from TDJ_COOKIE_SECRET (or, when absent, from the Spotify client
 * secret, which is already a server-only secret). The browser only ever sees ciphertext; nothing is persisted.
 */
const keyMaterial = () =>
  process.env.TDJ_COOKIE_SECRET ||
  process.env.SPOTIFY_CLIENT_SECRET ||
  process.env.TDJ_SECRET ||
  "tdj-dev-cookie-secret";
let cachedKey: { from: string; key: Buffer } | null = null;
function key(): Buffer {
  const from = keyMaterial();
  if (!cachedKey || cachedKey.from !== from)
    cachedKey = { from, key: createHash("sha256").update(`tdj-cookie:${from}`).digest() };
  return cachedKey.key;
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function unseal<T>(sealed: string | null | undefined): T | null {
  if (!sealed) return null;
  try {
    const [v, iv, tag, ct] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    const out = Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

/** The public origin: NEXT_PUBLIC_APP_URL when set, else what the request came in on (CloudFront forwards the host). */
export function requestOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function cookieHeader(
  name: string,
  value: string,
  o: { maxAge: number; path?: string; secure: boolean },
): string {
  return `${name}=${encodeURIComponent(value)}; Path=${o.path ?? "/"}; Max-Age=${o.maxAge}; SameSite=Lax; HttpOnly${o.secure ? "; Secure" : ""}`;
}
export function clearCookieHeader(name: string, path = "/"): string {
  return `${name}=; Path=${path}; Max-Age=0; SameSite=Lax; HttpOnly`;
}
