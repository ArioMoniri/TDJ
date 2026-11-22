import { challengeS256, createState, createVerifier } from "@/lib/app/pkce";
import { type Invoke, type OwnProvider, readByo, writeByo } from "./byo";

/**
 * 2026-11 — signing in with the DJ's own app at Dropbox (web and apps) and Google Drive (apps): Authorization Code
 * with PKCE (RFC 7636), a public client, so no secret exists anywhere. docs/CONNECTORS.md → Bring your own.
 *
 * - Dropbox, web: the browser goes to Dropbox and comes back to `<origin>/connections/callback`; the code is
 *   exchanged here, straight with api.dropboxapi.com (it answers browsers), and the tokens stay in this browser.
 * - Dropbox, apps: Dropbox has no redirect a desktop or iPad app can register for a DJ's own app key, so the app
 *   uses Dropbox's no-redirect flow: the system browser shows a code, the DJ pastes it into Settings.
 * - Google Drive, apps: an *iOS* OAuth client (no secret), redirect `<bundle id>:/oauth2redirect`, which the app
 *   registers as a URL scheme (src-tauri/src/byo.rs). Google's *web* clients always need a secret, so the web uses
 *   the deployment's Google sign-in instead and offers no BYO there.
 * In the apps the code exchange and refreshes run natively and the refresh token lives in the Keychain.
 */
export const OWN_OAUTH = {
  dropbox: {
    authorize: "https://www.dropbox.com/oauth2/authorize",
    token: "https://api.dropboxapi.com/oauth2/token",
    scope: "files.content.write sharing.write account_info.read",
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/drive.file",
  },
} as const;

/** the web's callback page for a DJ's own Dropbox app (add it to the app's Redirect URIs) */
export const OWN_CALLBACK_PATH = "/connections/callback";
export const ownWebRedirect = (origin: string) => `${origin.replace(/\/$/, "")}${OWN_CALLBACK_PATH}`;

export function ownAuthorizeUrl(
  provider: OwnProvider,
  o: { clientId: string; challenge: string; state: string; redirectUri?: string },
): string {
  const p = OWN_OAUTH[provider];
  const q: Record<string, string> = {
    client_id: o.clientId,
    response_type: "code",
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    state: o.state,
  };
  if (o.redirectUri) q.redirect_uri = o.redirectUri;
  if (provider === "dropbox") {
    q.token_access_type = "offline";
    q.scope = p.scope;
  } else {
    q.scope = p.scope;
    q.access_type = "offline";
    q.prompt = "consent";
  }
  const u = new URL(p.authorize);
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

/** The code exchange of a public client: the client ID and the verifier, never a secret. */
export function ownTokenForm(o: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri?: string;
}): URLSearchParams {
  const f = new URLSearchParams({
    grant_type: "authorization_code",
    code: o.code,
    client_id: o.clientId,
    code_verifier: o.verifier,
  });
  if (o.redirectUri) f.set("redirect_uri", o.redirectUri);
  return f;
}
export const ownRefreshForm = (clientId: string, refresh: string) =>
  new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId });

export interface OwnTokens {
  access: string;
  expires: number;
  refresh?: string;
  account?: string;
}
export function parseOwnTokens(j: unknown, now = Date.now()): OwnTokens | null {
  const t = j as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown; account_id?: unknown };
  if (!t || typeof t.access_token !== "string" || !t.access_token) return null;
  const secs = typeof t.expires_in === "number" && t.expires_in > 0 ? t.expires_in : 3600;
  return {
    access: t.access_token,
    expires: now + secs * 1000,
    refresh: typeof t.refresh_token === "string" && t.refresh_token ? t.refresh_token : undefined,
    account: typeof t.account_id === "string" ? t.account_id : undefined,
  };
}

/* ---------- the sign-in, start to finish ---------- */

const PENDING = "tdj-byo-pkce";
interface Pending {
  provider: OwnProvider;
  verifier: string;
  state: string;
  clientId: string;
  redirectUri?: string;
  next: string;
}

export interface OwnDeps {
  app: boolean;
  fetch: typeof fetch;
  invoke?: Invoke;
  /** where the browser goes (web) */
  assign?: (url: string) => void;
  /** opens the system browser (apps) */
  openExternal?: (url: string) => Promise<void>;
  session?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  origin?: string;
  now?: () => number;
}
const session = (d: OwnDeps) => {
  if (d.session !== undefined) return d.session;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Starts a sign-in with the DJ's own app. Web: the browser leaves for the provider. Apps: the system browser opens;
 * the result says whether the DJ pastes a code next (`paste`, Dropbox) or the app comes back by itself (`wait`).
 */
export async function beginOwnLogin(
  provider: OwnProvider,
  d: OwnDeps,
  next = "/settings",
): Promise<"left" | "paste" | "wait" | "no_client"> {
  const clientId = readByo()[provider]?.clientId ?? "";
  if (!clientId) return "no_client";
  let redirectUri: string | undefined;
  if (!d.app) redirectUri = ownWebRedirect(d.origin ?? location.origin);
  else if (provider === "google") redirectUri = (await d.invoke?.("byo_google_redirect")) as string;
  const verifier = createVerifier();
  const state = createState();
  const url = ownAuthorizeUrl(provider, {
    clientId,
    challenge: await challengeS256(verifier),
    state,
    redirectUri,
  });
  const p: Pending = { provider, verifier, state, clientId, redirectUri, next };
  try {
    session(d)?.setItem(PENDING, JSON.stringify(p));
  } catch {}
  if (!d.app) {
    (d.assign ?? ((u) => location.assign(u)))(url);
    return "left";
  }
  await d.openExternal?.(url);
  return provider === "dropbox" ? "paste" : "wait";
}

export type FinishResult =
  | { ok: true; provider: OwnProvider; next: string }
  | { ok: false; error: string; provider?: OwnProvider };

/**
 * Finishes it: `query` is the callback's query (web, Google in the apps) or `{ code }` the DJ pasted (Dropbox in
 * the apps, where no state comes back: the pending sign-in on this device stands for it).
 */
export async function finishOwnLogin(input: { query: string } | { code: string }, d: OwnDeps): Promise<FinishResult> {
  let p: Pending | null = null;
  try {
    p = JSON.parse(session(d)?.getItem(PENDING) ?? "null");
  } catch {}
  if (!p) return { ok: false, error: "not_started" };
  let code: string;
  if ("query" in input) {
    const q = new URLSearchParams(input.query.replace(/^\?/, ""));
    if (q.get("state") !== p.state) return { ok: false, error: "state" };
    if (q.get("error"))
      return {
        ok: false,
        provider: p.provider,
        error: q.get("error") === "access_denied" ? "denied" : "failed",
      };
    code = q.get("code") ?? "";
  } else code = input.code.trim();
  if (!code || !/^[A-Za-z0-9._~/+=-]{8,2048}$/.test(code)) return { ok: false, error: "no_code" };
  try {
    session(d)?.removeItem(PENDING);
  } catch {}
  const form = ownTokenForm({ clientId: p.clientId, code, verifier: p.verifier, redirectUri: p.redirectUri });
  const now = (d.now ?? Date.now)();
  if (d.app) {
    try {
      const t = (await d.invoke?.("byo_oauth_exchange", {
        provider: p.provider,
        clientId: p.clientId,
        form: form.toString(),
      })) as { access: string; expires: number } | undefined;
      if (!t?.access) return { ok: false, error: "failed" };
      writeByo({ [p.provider]: { clientId: p.clientId, connected: true, access: t.access, expires: t.expires } });
    } catch {
      return { ok: false, error: "failed" };
    }
  } else {
    const t = await tokenRequest(p.provider, form, d.fetch, now);
    if (!t) return { ok: false, error: "failed" };
    writeByo({ [p.provider]: { clientId: p.clientId, connected: true, ...t } });
  }
  const next = p.next.startsWith("/") && !p.next.startsWith("//") ? p.next : "/settings";
  return { ok: true, provider: p.provider, next };
}

async function tokenRequest(
  provider: OwnProvider,
  form: URLSearchParams,
  f: typeof fetch,
  now: number,
): Promise<OwnTokens | null> {
  try {
    const r = await f(OWN_OAUTH[provider].token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!r.ok) return null;
    return parseOwnTokens(await r.json(), now);
  } catch {
    return null;
  }
}

/** A valid access token for the DJ's own app, refreshed when it is about to expire; null when not signed in. */
export async function ownAccess(provider: OwnProvider, d: OwnDeps): Promise<string | null> {
  const own = readByo()[provider];
  if (!own?.connected) return null;
  const now = (d.now ?? Date.now)();
  if (own.access && (own.expires ?? 0) > now + 60_000) return own.access;
  if (d.app) {
    try {
      const t = (await d.invoke?.("byo_oauth_access", { provider, clientId: own.clientId })) as {
        access: string;
        expires: number;
      } | null;
      if (!t?.access) {
        writeByo({ [provider]: { clientId: own.clientId } });
        return null;
      }
      writeByo({ [provider]: { ...own, access: t.access, expires: t.expires } });
      return t.access;
    } catch {
      return null;
    }
  }
  if (!own.refresh) return null;
  const t = await tokenRequest(provider, ownRefreshForm(own.clientId, own.refresh), d.fetch, now);
  if (!t) {
    // the grant is gone (revoked, another app key): signed out, the app key stays
    writeByo({ [provider]: { clientId: own.clientId } });
    return null;
  }
  writeByo({ [provider]: { ...own, ...t, refresh: t.refresh ?? own.refresh } });
  return t.access;
}

/** Signs out of the DJ's own app; the public ID stays for the next sign-in. */
export async function ownDisconnect(provider: OwnProvider, d: Pick<OwnDeps, "app" | "invoke">): Promise<void> {
  const own = readByo()[provider];
  if (d.app) await d.invoke?.("byo_oauth_logout", { provider }).catch(() => {});
  writeByo({ [provider]: own ? { clientId: own.clientId } : undefined });
}
