"use client";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { SpotifyAccess } from "./host";
import { invoke, nativeInfo, spotifyClientId } from "./native";
import { beginPkce, readCallback, tokenBody } from "./pkce";
import { APP } from "./target";

/**
 * Sign-ins from the apps. Spotify: PKCE in the system browser, back through `tdj://spotify-callback`. The native
 * side keeps the verifier and state (`spotify_begin`), checks the state, exchanges the code and keeps the tokens in
 * the Keychain (src-tauri/src/spotify.rs), then opens `next?connected=spotify`; this page then reads the session
 * back (`syncAppSpotify`) so every part of the app sees it. A sign-in the native side did not see begin (the app
 * restarted in between) is finished by the `/callback` page with what this page kept (`finishAppLogin`).
 * Google and Dropbox need a client secret, so they sign in through a TDJ server the DJ linked (src-tauri lib.rs).
 */
export const PENDING = "tdj-app-pkce";
/** as long as the native side waits (spotify.rs PENDING_TTL) */
export const PENDING_TTL_MS = 15 * 60_000;

interface Pending {
  verifier: string;
  state: string;
  next: string;
  clientId: string;
  at: number;
}

/** Local storage, not session storage: iOS may end the web view's process while Safari is in front. */
const store = (): Storage | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export function takePending(now = Date.now()): Pending | null {
  const s = store();
  let saved: Pending | null = null;
  try {
    saved = JSON.parse(s?.getItem(PENDING) ?? "null");
    s?.removeItem(PENDING);
    // an older build kept it in session storage
    if (!saved) {
      saved = JSON.parse(sessionStorage.getItem(PENDING) ?? "null");
      sessionStorage.removeItem(PENDING);
    }
  } catch {}
  if (!saved?.state || !saved.verifier || !saved.clientId) return null;
  if (typeof saved.at === "number" && now - saved.at > PENDING_TTL_MS) return null;
  return saved;
}

export async function appLogin(provider: string, next = "/settings"): Promise<void> {
  if (provider !== "spotify") {
    if ((await nativeInfo()).linkedServer) {
      await invoke("start_login", { provider, next, scope: null }).catch(() => {});
      return;
    }
    toast(t("login.link_your_tdj_server_under_settings"));
    return;
  }
  const clientId = await spotifyClientId();
  if (!clientId) {
    toast(t("login.add_your_spotify_app_s_client"));
    return;
  }
  const p = await beginPkce({ clientId });
  try {
    store()?.setItem(
      PENDING,
      JSON.stringify({
        verifier: p.verifier,
        state: p.state,
        next,
        clientId,
        at: Date.now(),
      } satisfies Pending),
    );
  } catch {}
  // the native side finishes the sign-in itself when the deep link comes back (an older build: the page does)
  await invoke("spotify_begin", { clientId, state: p.state, verifier: p.verifier, next }).catch(() => {});
  await invoke("open_external", { url: p.url }).catch(() => toast(t("login.could_not_open_the_browser_for")));
}

/** Puts the native session's access token in the store (the Booth, Listen, rows and Fill read it there). */
function applyAccess(a: SpotifyAccess) {
  useStore.getState().setSpotifyToken({ access: a.access, expires: a.expires, scope: a.scopes?.join(" ") });
}

/** The /callback page in the apps: the deep link's query → tokens in the Keychain → where the DJ started. */
export async function finishAppLogin(query: string): Promise<{ next: string } | { error: string }> {
  const saved = takePending();
  if (!saved) return { error: t("login.this_sign_in_was_not_started") };
  const r = readCallback(query, saved.state);
  if ("error" in r)
    return {
      error:
        r.error === "access_denied"
          ? t("login.spotify_did_not_grant_access")
          : t("login.spotify_did_not_finish_the_sign"),
    };
  try {
    const access = await invoke<SpotifyAccess | null>("spotify_token", {
      clientId: saved.clientId,
      form: tokenBody({ clientId: saved.clientId, code: r.code, verifier: saved.verifier }).toString(),
    });
    if (access?.access) applyAccess(access);
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? t("login.could_not_finish_connecting") };
  }
  await forgetConnectors();
  // and once more from the native side, after any launch sync that asked before the exchange ended
  await syncAppSpotify();
  const next = saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/settings";
  return { next: `${next}${next.includes("?") ? "&" : "?"}connected=spotify` };
}

async function forgetConnectors() {
  try {
    (await import("@/lib/spotify")).resetConnectors();
  } catch {}
}

/**
 * The page's view of the Spotify session = the native one. Asked on launch, when the app comes back to the front
 * with a stale token, and after a sign-in: a token the Keychain no longer backs (signed out, revoked, another
 * Client ID, or a build without a Client ID) is dropped, so nothing shows "connected" without a session.
 * Returns whether the device is signed in; null when it could not tell (offline).
 */
export async function syncAppSpotify(f: typeof fetch = fetch): Promise<boolean | null> {
  let r: Response;
  try {
    r = await f("/api/spotify/access", { cache: "no-store" });
  } catch {
    return null;
  }
  const st = useStore.getState();
  if (r.ok) {
    const j = (await r.json().catch(() => null)) as { access?: string; expires?: number } | null;
    if (!j?.access) return null;
    st.setSpotifyToken({ access: j.access, expires: j.expires ?? Date.now() + 3_000_000 });
    return true;
  }
  if (r.status === 401 || r.status === 404) {
    if (st.spotifyToken) st.setSpotifyToken(null);
    return false;
  }
  return null;
}

declare global {
  interface Window {
    __TDJ_APP__?: { login(provider: string, next?: string): Promise<void> };
  }
}
/** the bridge shim (apps/desktop/ui/bridge-shim.js) and the native navigation policy hand logins to this */
if (APP && typeof window !== "undefined") {
  window.__TDJ_APP__ = { login: appLogin };
  // back from a sign-in the native side finished: what this page kept for it is spent
  const q = new URLSearchParams(location.search);
  if (q.get("connected") === "spotify" || q.get("error")?.startsWith("spotify_")) {
    try {
      store()?.removeItem(PENDING);
    } catch {}
  }
  // the launch sync runs from lib/app/boot.ts, once /api/* is answered on the device
  document.addEventListener("visibilitychange", () => {
    const tok = useStore.getState().spotifyToken;
    if (document.visibilityState === "visible" && (!tok || tok.expires < Date.now() + 120_000))
      void syncAppSpotify();
  });
}
