/**
 * Spotify sign-in from the apps: Authorization Code with PKCE (RFC 7636), a public client — no client secret ships
 * in the app. The system browser opens the authorize URL; Spotify redirects to the app's own deep link
 * (`tdj://spotify-callback`, src-tauri/src/links.rs), the app checks the state and hands the code and verifier to
 * the native side, which exchanges them and keeps the tokens in the Keychain (src-tauri/src/secrets.rs).
 */
export const SPOTIFY_APP_REDIRECT = "tdj://spotify-callback";
export const SPOTIFY_AUTHORIZE = "https://accounts.spotify.com/authorize";
/** the scopes the web's hosted login asks for (lib/server/oauth.ts → SPOTIFY), so every feature works the same */
export const SPOTIFY_APP_SCOPES =
  "playlist-modify-private playlist-modify-public user-read-email streaming user-read-private user-modify-playback-state user-read-playback-state ugc-image-upload";

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** 64 random bytes → 86 characters of the unreserved alphabet (RFC 7636 §4.1 allows 43–128). */
export const createVerifier = () => base64url(random(64));
export const createState = () => base64url(random(16));

export async function challengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function authorizeUrl(o: {
  clientId: string;
  challenge: string;
  state: string;
  scopes: string;
  redirectUri?: string;
  authorize?: string;
}): string {
  const u = new URL(o.authorize ?? SPOTIFY_AUTHORIZE);
  u.search = new URLSearchParams({
    client_id: o.clientId,
    response_type: "code",
    redirect_uri: o.redirectUri ?? SPOTIFY_APP_REDIRECT,
    scope: o.scopes,
    code_challenge_method: "S256",
    code_challenge: o.challenge,
    state: o.state,
  }).toString();
  return u.toString();
}

/** A new sign-in: the URL to open and the verifier + state to keep until the deep link comes back. */
export async function beginPkce(o: {
  clientId: string;
  scopes?: string;
  redirectUri?: string;
  authorize?: string;
}): Promise<{ url: string; verifier: string; state: string }> {
  const verifier = createVerifier();
  const state = createState();
  const url = authorizeUrl({
    clientId: o.clientId,
    challenge: await challengeS256(verifier),
    state,
    scopes: o.scopes ?? SPOTIFY_APP_SCOPES,
    redirectUri: o.redirectUri,
    authorize: o.authorize,
  });
  return { url, verifier, state };
}

/** The deep link's query: the code, only when its state is the one this device sent. */
export function readCallback(query: string, expectedState: string): { code: string } | { error: string } {
  const q = new URLSearchParams(query.replace(/^\?/, ""));
  if (!expectedState || q.get("state") !== expectedState) return { error: "state" };
  const err = q.get("error");
  if (err) return { error: err };
  const code = q.get("code");
  return code ? { code } : { error: "no_code" };
}

/** The token request of a public client (sent by the native side to accounts.spotify.com/api/token). */
export function tokenBody(o: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri?: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: o.clientId,
    code: o.code,
    redirect_uri: o.redirectUri ?? SPOTIFY_APP_REDIRECT,
    code_verifier: o.verifier,
  });
}

/** The refresh request the native side sends when the access token is about to expire. */
export function refreshBody(o: { clientId: string; refreshToken: string }): URLSearchParams {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: o.clientId,
    refresh_token: o.refreshToken,
  });
}
