import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { type ConfigKey, getConfig } from "./config";
import { clearCookieHeader, cookieHeader, readCookie, requestOrigin, seal, unseal } from "./cookies";

/**
 * Direct OAuth per provider with the deployment's own credentials: the zero-cost path (docs/research/connectors.md,
 * "Open-source / free alternatives"). One table describes Spotify, Google (Drive + YouTube) and Dropbox; the
 * routes under /api/<provider>/ are thin wrappers over `loginRedirect`, `callbackRedirect`, `withSession` below.
 * Tokens are sealed (AES-256-GCM, lib/server/cookies.ts) into an httpOnly cookie and refreshed on use; nothing is
 * persisted server-side.
 */
export interface Provider {
  id: "spotify" | "google" | "dropbox";
  label: string;
  /** sealed session cookie, state cookie, PKCE cookie */
  cookie: string;
  /** base URL of the authorization page */
  authorize: () => string;
  /** token endpoint */
  token: () => string;
  /** configuration keys of the deployment's own app (lib/server/config.ts: environment, then the config store) */
  idKey: ConfigKey;
  secretKey: ConfigKey;
  /** scopes always requested (features add theirs through `loginRedirect({ scopes })`) */
  scopes: string;
  /** code_challenge S256 on the authorization request, code_verifier on the exchange */
  pkce: boolean;
  /** how the client credentials travel to the token endpoint */
  clientAuth: "basic" | "body";
  /** extra authorization parameters (`access_type=offline`, `token_access_type=offline`…) */
  authorizeParams: Record<string, string>;
  /** session lifetime in days (Spotify refresh tokens die after six months) */
  sessionDays: number;
}

const trim = (s: string) => s.replace(/\/$/, "");

export const SPOTIFY: Provider = {
  id: "spotify",
  label: "Spotify",
  cookie: "tdj_sp",
  authorize: () => `${trim(process.env.SPOTIFY_ACCOUNTS_URL ?? "https://accounts.spotify.com")}/authorize`,
  token: () => `${trim(process.env.SPOTIFY_ACCOUNTS_URL ?? "https://accounts.spotify.com")}/api/token`,
  idKey: "SPOTIFY_CLIENT_ID",
  secretKey: "SPOTIFY_CLIENT_SECRET",
  scopes: "playlist-modify-private playlist-modify-public user-read-email streaming user-read-private",
  pkce: false,
  clientAuth: "basic",
  authorizeParams: {},
  sessionDays: 180,
};

/** Google: one OAuth client for Drive (`drive.file`) and YouTube; the feature scopes are added incrementally. */
export const GOOGLE_SCOPE = {
  drive: "https://www.googleapis.com/auth/drive.file",
  youtube: "https://www.googleapis.com/auth/youtube",
} as const;
export type GoogleFeature = keyof typeof GOOGLE_SCOPE;
export const GOOGLE: Provider = {
  id: "google",
  label: "Google",
  cookie: "tdj_gg",
  authorize: () =>
    `${trim(process.env.GOOGLE_ACCOUNTS_URL ?? "https://accounts.google.com")}/o/oauth2/v2/auth`,
  token: () => process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
  idKey: "GOOGLE_CLIENT_ID",
  secretKey: "GOOGLE_CLIENT_SECRET",
  scopes: "openid email profile",
  pkce: false,
  clientAuth: "body",
  authorizeParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  sessionDays: 365,
};

export const DROPBOX: Provider = {
  id: "dropbox",
  label: "Dropbox",
  cookie: "tdj_db",
  authorize: () => `${trim(process.env.DROPBOX_WWW_URL ?? "https://www.dropbox.com")}/oauth2/authorize`,
  token: () => `${trim(process.env.DROPBOX_API_URL ?? "https://api.dropboxapi.com")}/oauth2/token`,
  idKey: "DROPBOX_APP_KEY",
  secretKey: "DROPBOX_APP_SECRET",
  scopes: "",
  pkce: true,
  clientAuth: "basic",
  authorizeParams: { token_access_type: "offline" },
  sessionDays: 365,
};

export const PROVIDERS = { spotify: SPOTIFY, google: GOOGLE, dropbox: DROPBOX } as const;

export interface Credentials {
  id: string;
  secret: string;
}
/** The deployment's own app for this provider, or null when the owner has not configured it. */
export async function credentials(p: Provider): Promise<Credentials | null> {
  const c = await getConfig();
  const id = c[p.idKey];
  const secret = c[p.secretKey];
  return id && secret ? { id, secret } : null;
}
export const enabled = async (p: Provider) => !!(await credentials(p));
export const redirectUri = (p: Provider, origin: string) => `${origin}/api/${p.id}/callback`;
export const stateCookie = (p: Provider) => `${p.cookie}_state`;
export const pkceCookie = (p: Provider) => `${p.cookie}_pkce`;
export const cookiePath = (p: Provider) => `/api/${p.id}`;
export const newState = () => randomBytes(16).toString("base64url");
const b64url = (b: Buffer) => b.toString("base64url");

export interface Session {
  access: string;
  refresh: string;
  expires: number;
  authorizedAt: number;
  /** granted scopes when the provider reports them (Google) */
  scopes?: string[];
}

export function authorizeUrl(
  p: Provider,
  clientId: string,
  origin: string,
  state: string,
  o: { scopes?: string[]; codeChallenge?: string } = {},
): string {
  const scope = [...new Set([...p.scopes.split(" "), ...(o.scopes ?? [])].filter(Boolean))].join(" ");
  const params: Record<string, string> = {
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(p, origin),
    ...(scope ? { scope } : {}),
    state,
    ...p.authorizeParams,
  };
  if (o.codeChallenge) {
    params.code_challenge = o.codeChallenge;
    params.code_challenge_method = "S256";
  }
  const u = new URL(p.authorize());
  u.search = new URLSearchParams(params).toString();
  return u.toString();
}

/** A request to the token endpoint with the app's credentials (Basic header or form fields per provider). */
export async function rawTokenRequest(
  p: Provider,
  c: Credentials,
  params: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(params);
  if (p.clientAuth === "basic")
    headers.authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`;
  else {
    body.set("client_id", c.id);
    body.set("client_secret", c.secret);
  }
  return fetch(p.token(), { method: "POST", headers, body });
}
async function tokenRequest(p: Provider, params: Record<string, string>) {
  const c = await credentials(p);
  if (!c) throw new Error(`${p.label} login is not enabled on this deployment`);
  const r = await rawTokenRequest(p, c, params);
  if (!r.ok) throw new Error(`${p.label} token endpoint answered ${r.status}`);
  return (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}
const scopeList = (s?: string) => (s ? s.split(/[\s,]+/).filter(Boolean) : undefined);

export async function exchangeCode(
  p: Provider,
  code: string,
  origin: string,
  verifier?: string,
): Promise<Session> {
  const j = await tokenRequest(p, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(p, origin),
    ...(verifier ? { code_verifier: verifier } : {}),
  });
  return {
    access: j.access_token,
    refresh: j.refresh_token ?? "",
    expires: Date.now() + (j.expires_in ?? 3600) * 1000,
    authorizedAt: Date.now(),
    scopes: scopeList(j.scope),
  };
}

export async function refreshSession(p: Provider, s: Session): Promise<Session> {
  const j = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: s.refresh });
  return {
    access: j.access_token,
    refresh: j.refresh_token ?? s.refresh,
    expires: Date.now() + (j.expires_in ?? 3600) * 1000,
    authorizedAt: s.authorizedAt,
    scopes: scopeList(j.scope) ?? s.scopes,
  };
}

export async function readSession(p: Provider, req: Request): Promise<Session | null> {
  const s = await unseal<Session>(readCookie(req, p.cookie));
  return s && typeof s.access === "string" && typeof s.refresh === "string" ? s : null;
}
export async function sessionCookie(p: Provider, s: Session, origin: string): Promise<string> {
  return cookieHeader(p.cookie, await seal(s), {
    maxAge: p.sessionDays * 86400,
    secure: origin.startsWith("https://"),
  });
}
export const clearSessionCookie = (p: Provider) => clearCookieHeader(p.cookie);

/** The current session with a valid access token, refreshing when it is about to expire (then `setCookie` is set). */
export async function withSession(
  p: Provider,
  req: Request,
  origin: string,
): Promise<{ session: Session; setCookie?: string } | null> {
  const s = await readSession(p, req);
  if (!s) return null;
  if (s.expires > Date.now() + 60_000) return { session: s };
  if (!s.refresh) return null;
  try {
    const fresh = await refreshSession(p, s);
    return { session: fresh, setCookie: await sessionCookie(p, fresh, origin) };
  } catch {
    return null;
  }
}

/* ---------- route helpers ---------- */

/**
 * GET /api/<provider>/login: sends the browser to the provider with a state cookie (and, for PKCE providers, a
 * sealed verifier cookie); `?next=` is where the callback lands afterwards.
 */
export async function loginRedirect(
  p: Provider,
  req: Request,
  o: { scopes?: string[] } = {},
): Promise<Response> {
  const c = await credentials(p);
  if (!c)
    return NextResponse.json(
      { error: `${p.label} login is not enabled on this deployment` },
      { status: 404 },
    );
  const origin = await requestOrigin(req);
  const next = new URL(req.url).searchParams.get("next") ?? "/settings";
  const state = `${newState()}.${Buffer.from(next.startsWith("/") ? next : "/settings").toString("base64url")}`;
  const secure = origin.startsWith("https://");
  const path = cookiePath(p);
  let codeChallenge: string | undefined;
  const cookies: string[] = [cookieHeader(stateCookie(p), state, { maxAge: 600, path, secure })];
  if (p.pkce) {
    const verifier = b64url(randomBytes(64));
    codeChallenge = b64url(createHash("sha256").update(verifier).digest());
    cookies.push(cookieHeader(pkceCookie(p), await seal({ verifier, state }), { maxAge: 600, path, secure }));
  }
  const res = NextResponse.redirect(
    authorizeUrl(p, c.id, origin, state, { scopes: o.scopes, codeChallenge }),
    302,
  );
  for (const c of cookies) res.headers.append("set-cookie", c);
  return res;
}

/**
 * GET /api/<provider>/callback: verifies the state, exchanges the code on the server, seals the session and lands on
 * `next?connected=<provider>`; failures land on `/settings?error=<provider>_<reason>`. A previous session of the same
 * provider is merged (Google: scopes accumulate, the refresh token survives a re-consent that did not issue one).
 */
export async function callbackRedirect(p: Provider, req: Request): Promise<Response> {
  const origin = await requestOrigin(req);
  const path = cookiePath(p);
  const clear = (res: NextResponse) => {
    res.headers.append("set-cookie", clearCookieHeader(stateCookie(p), path));
    if (p.pkce) res.headers.append("set-cookie", clearCookieHeader(pkceCookie(p), path));
    return res;
  };
  const fail = (reason: string) =>
    clear(NextResponse.redirect(`${origin}/settings?error=${p.id}_${reason}`, 302));
  if (!(await enabled(p))) return fail("disabled");
  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  const expected = readCookie(req, stateCookie(p));
  if (!state || !expected || state !== expected) return fail("state");
  if (q.get("error") || !q.get("code")) return fail("denied");
  let verifier: string | undefined;
  if (p.pkce) {
    const pk = await unseal<{ verifier: string; state: string }>(readCookie(req, pkceCookie(p)));
    if (!pk || pk.state !== state) return fail("state");
    verifier = pk.verifier;
  }
  try {
    const fresh = await exchangeCode(p, q.get("code")!, origin, verifier);
    const old = await readSession(p, req);
    const session: Session = {
      ...fresh,
      refresh: fresh.refresh || old?.refresh || "",
      scopes: fresh.scopes ?? scopeList(q.get("scope") ?? undefined),
    };
    if (session.scopes || old?.scopes)
      session.scopes = [...new Set([...(old?.scopes ?? []), ...(session.scopes ?? [])])];
    const next = Buffer.from(state.split(".")[1] ?? "", "base64url").toString("utf8") || "/settings";
    const to = new URL(next.startsWith("/") ? next : "/settings", origin);
    to.searchParams.set("connected", p.id);
    const res = NextResponse.redirect(to.toString(), 302);
    res.headers.append("set-cookie", await sessionCookie(p, session, origin));
    return clear(res);
  } catch {
    return fail("exchange");
  }
}

/** POST /api/<provider>/logout: forgets the sealed cookie (the provider keeps the grant until the user revokes it). */
export function logoutResponse(p: Provider): Response {
  const res = NextResponse.json({ ok: true });
  res.headers.append("set-cookie", clearSessionCookie(p));
  return res;
}

/* ---------- authenticated requests ---------- */

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, message: string, body = "") {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** JSON request with a bearer token; 429 waits for Retry-After (≤10 s) up to three times. */
export async function api<T>(access: string, url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (r.status === 429 && attempt < 3) {
    const wait = Math.min(10, Number(r.headers.get("retry-after") ?? 2));
    await new Promise((res) => setTimeout(res, wait * 1000));
    return api<T>(access, url, init, attempt + 1);
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
export const errorStatus = (e: unknown) => (e instanceof ApiError ? (e.status === 401 ? 401 : 502) : 500);

/** File names on a cloud drive: no path separators or reserved characters. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "tdj-set";
