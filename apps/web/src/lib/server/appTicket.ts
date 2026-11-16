/**
 * Sign-in from the Mac and iPhone / iPad apps through a TDJ server (apps/desktop/src-tauri/src/links.rs, "Auth
 * handoff"). The app opens `/api/<provider>/login?client=app` in the **system browser** (passkeys, password managers;
 * Google refuses embedded web views); the provider comes back to the server's usual https callback, so no new
 * redirect URI is registered anywhere. On that callback the sealed session is not set as a cookie in the browser:
 * it is wrapped in a 60-second ticket and handed to the app through its own deep link
 * `tdj://auth/<provider>?ticket=…&next=…`; the app redeems it at `/api/app/redeem` from its own cookie jar.
 * Nothing is stored server-side: the ticket is sealed like the cookie (AES-256-GCM), and a redeemed ticket's nonce
 * is remembered in memory until it would have expired anyway.
 *
 * Pure apart from the sealing functions passed in, so the vitest pins the rules.
 */
export const APP_SCHEME = "tdj";
export const TICKET_TTL_MS = 60_000;
/** the marker on the OAuth `state` of a sign-in that started in the apps */
export const APP_STATE_SUFFIX = ".app";
export type TicketProvider = "spotify" | "google" | "dropbox";
const PROVIDERS: readonly TicketProvider[] = ["spotify", "google", "dropbox"];

export const isAppState = (state: string) => state.endsWith(APP_STATE_SUFFIX);
export const appState = (state: string) => `${state}${APP_STATE_SUFFIX}`;

export interface TicketBody<S> {
  /** provider, so a Google ticket is never redeemed as a Spotify session */
  p: TicketProvider;
  s: S;
  exp: number;
  /** single use */
  n: string;
  next: string;
}

type Seal = (v: unknown) => Promise<string>;
type Unseal = <T>(s: string | null | undefined) => Promise<T | null>;

/** The deep link the callback sends the system browser to (links.rs `parse` → `DeepLink::AuthTicket`). */
export function appReturnUrl(provider: TicketProvider, ticket: string, next: string): string {
  const q = new URLSearchParams({ ticket, next });
  return `${APP_SCHEME}://auth/${provider}?${q}`;
}

/** The deep link for a failed app sign-in: the app opens Settings with the same error a browser would see. */
export function appErrorUrl(error: string): string {
  return `${APP_SCHEME}://open?${new URLSearchParams({ path: `/settings?error=${error}` })}`;
}

export async function makeTicket<S>(
  seal: Seal,
  o: { provider: TicketProvider; session: S; next: string; now?: number; nonce: string },
): Promise<string> {
  const body: TicketBody<S> = {
    p: o.provider,
    s: o.session,
    exp: (o.now ?? Date.now()) + TICKET_TTL_MS,
    n: o.nonce,
    next: o.next,
  };
  return seal(body);
}

/** nonces of redeemed tickets → when they expire (one Lambda / container; a ticket lives 60 s) */
const used = new Map<string, number>();
export const forgetUsedTickets = () => used.clear();

export type TicketResult<S> =
  | { ok: true; session: S; next: string }
  | { ok: false; reason: "invalid" | "expired" | "provider" | "used" };

export async function redeemTicket<S>(
  unseal: Unseal,
  provider: string,
  ticket: string | null | undefined,
  now = Date.now(),
): Promise<TicketResult<S>> {
  if (!PROVIDERS.includes(provider as TicketProvider)) return { ok: false, reason: "provider" };
  const t = await unseal<TicketBody<S>>(ticket);
  if (!t || typeof t.exp !== "number" || typeof t.n !== "string" || !t.s)
    return { ok: false, reason: "invalid" };
  if (t.p !== provider) return { ok: false, reason: "provider" };
  if (t.exp <= now) return { ok: false, reason: "expired" };
  for (const [k, exp] of used) if (exp <= now) used.delete(k);
  if (used.has(t.n)) return { ok: false, reason: "used" };
  used.set(t.n, t.exp);
  return { ok: true, session: t.s, next: /^\/(?![/\\])/.test(t.next ?? "") ? t.next : "/settings" };
}
