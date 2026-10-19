import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getConfigValue, getCookieSecret } from "./config";

/**
 * Sealed cookies: AES-256-GCM with a key derived from the cookie secret (lib/server/config.ts: TDJ_COOKIE_SECRET
 * from the environment or the config store, else one generated once and kept in the store). The browser only ever
 * sees ciphertext; nothing is persisted server-side.
 */
let cachedKey: { from: string; key: Buffer } | null = null;
async function key(): Promise<Buffer> {
  const from = await getCookieSecret();
  if (!cachedKey || cachedKey.from !== from)
    cachedKey = { from, key: createHash("sha256").update(`tdj-cookie:${from}`).digest() };
  return cachedKey.key;
}

export async function seal(value: unknown): Promise<string> {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", await key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export async function unseal<T>(sealed: string | null | undefined): Promise<T | null> {
  if (!sealed) return null;
  try {
    const [v, iv, tag, ct] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", await key(), Buffer.from(iv, "base64url"));
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

/** The origin the request came in on (CloudFront forwards the host), without consulting the configuration. */
export function incomingOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The public origin: NEXT_PUBLIC_APP_URL (environment or config store) when set, else what the request came in on. */
export async function requestOrigin(req: Request): Promise<string> {
  const configured = (await getConfigValue("NEXT_PUBLIC_APP_URL"))?.replace(/\/$/, "");
  return configured || incomingOrigin(req);
}

export function cookieHeader(
  name: string,
  value: string,
  o: { maxAge: number; path?: string; secure: boolean; sameSite?: "Lax" | "Strict" },
): string {
  return `${name}=${encodeURIComponent(value)}; Path=${o.path ?? "/"}; Max-Age=${o.maxAge}; SameSite=${o.sameSite ?? "Lax"}; HttpOnly${o.secure ? "; Secure" : ""}`;
}
export function clearCookieHeader(name: string, path = "/"): string {
  return `${name}=; Path=${path}; Max-Age=0; SameSite=Lax; HttpOnly`;
}
