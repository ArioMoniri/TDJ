"use client";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { invoke, nativeInfo, spotifyClientId } from "./native";
import { beginPkce, readCallback, tokenBody } from "./pkce";
import { APP } from "./target";

/**
 * Sign-ins from the apps. Spotify: PKCE in the system browser, back through `tdj://spotify-callback`; the native
 * side exchanges the code and keeps the tokens in the Keychain. Google and Dropbox need a client secret, so they
 * sign in through a TDJ server the DJ linked (the server's own flow, src-tauri/src/lib.rs → `login`).
 */
const PENDING = "tdj-app-pkce";

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
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier: p.verifier, state: p.state, next, clientId }));
  } catch {}
  await invoke("open_external", { url: p.url }).catch(() => toast(t("login.could_not_open_the_browser_for")));
}

/** The /callback page in the apps: the deep link's query → tokens in the Keychain → where the DJ started. */
export async function finishAppLogin(query: string): Promise<{ next: string } | { error: string }> {
  let saved: { verifier: string; state: string; next: string; clientId: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(PENDING) ?? "null");
    sessionStorage.removeItem(PENDING);
  } catch {}
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
    await invoke("spotify_token", {
      clientId: saved.clientId,
      form: tokenBody({ clientId: saved.clientId, code: r.code, verifier: saved.verifier }).toString(),
    });
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? t("login.could_not_finish_connecting") };
  }
  return { next: saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/settings" };
}

declare global {
  interface Window {
    __TDJ_APP__?: { login(provider: string, next?: string): Promise<void> };
  }
}
/** the bridge shim (apps/desktop/ui/bridge-shim.js) and the native navigation policy hand logins to this */
if (APP && typeof window !== "undefined") window.__TDJ_APP__ = { login: appLogin };
