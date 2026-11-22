import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownAppRedirects, ownAppSteps } from "@/lib/spotifyOwnApp";
import { useStore } from "@/lib/store";
import { appLogin, finishAppLogin, PENDING, PENDING_TTL_MS, syncAppSpotify, takePending } from "./login";
import { pickSpotifyClientId } from "./native";

/** Web Storage over a Map (node has none). */
function storage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const BUILT_IN = "0123456789abcdef0123456789abcdef";
const OWN = "fedcba9876543210fedcba9876543210";

/**
 * The native side as src-tauri answers the sign-in commands (commands.rs, spotify.rs): a Keychain, the pending
 * sign-in, the code exchange. Like apps/desktop/store/tauri-mock.ts, nothing leaves the machine.
 */
function fakeNative(o: { own?: string } = {}) {
  const keychain = new Map<string, string>();
  if (o.own) keychain.set("spotify.client_id", o.own);
  const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
  let session: { access: string; expires: number } | null = null;
  const invoke = async (cmd: string, args: Record<string, unknown> = {}) => {
    calls.push({ cmd, args });
    switch (cmd) {
      case "get_native_info":
        return {
          platform: "macos",
          spotifyClientId: BUILT_IN,
          ownSpotifyClientId: keychain.get("spotify.client_id") ?? null,
        };
      case "spotify_begin":
      case "open_external":
        return null;
      case "spotify_token": {
        const form = new URLSearchParams(String(args.form));
        if (form.get("client_secret") || !form.get("code") || form.get("client_id") !== args.clientId)
          throw { message: "Spotify did not finish the sign-in.", status: 400 };
        keychain.set("spotify.refresh", "RT");
        session = { access: `AT-${form.get("code")}`, expires: Date.now() + 3_600_000 };
        return { ...session, scopes: ["streaming"] };
      }
      case "spotify_access":
        return session;
      default:
        return null;
    }
  };
  /** the device route /api/spotify/access (lib/app/routes.ts) over the native session */
  const fetch = (async (url: string) => {
    if (url !== "/api/spotify/access") return new Response("{}", { status: 404 });
    return session
      ? new Response(JSON.stringify(session), { status: 200 })
      : new Response(JSON.stringify({ error: "Not logged in with Spotify." }), { status: 401 });
  }) as unknown as typeof globalThis.fetch;
  return { invoke, calls, keychain, fetch, signOut: () => (session = null) };
}

let native: ReturnType<typeof fakeNative>;
function install(n = fakeNative()) {
  native = n;
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke: native.invoke } });
  vi.stubGlobal("fetch", native.fetch);
}

beforeEach(() => {
  install();
  useStore.getState().setSpotifyToken(null);
  useStore.getState().setSettings({ spotifyClientId: "" });
});
afterEach(() => vi.unstubAllGlobals());

async function begin(next = "/settings") {
  await appLogin("spotify", next);
  const begun = native.calls.find((c) => c.cmd === "spotify_begin")!.args;
  const url = new URL(String(native.calls.find((c) => c.cmd === "open_external")!.args.url));
  return { begun, url };
}

describe("Spotify sign-in in the apps (PKCE through tdj://spotify-callback)", () => {
  it("hands the verifier and state to the native side before the browser opens", async () => {
    const { begun, url } = await begin("/booth");
    expect(begun).toMatchObject({ clientId: BUILT_IN, next: "/booth" });
    expect(url.searchParams.get("state")).toBe(begun.state);
    expect(url.searchParams.get("redirect_uri")).toBe("tdj://spotify-callback");
    expect(url.searchParams.get("client_id")).toBe(BUILT_IN);
    const order = native.calls.map((c) => c.cmd).filter((c) => c !== "get_native_info");
    expect(order).toEqual(["spotify_begin", "open_external"]);
    // and keeps them for its own /callback, in local storage (iOS may end the web view while Safari is in front)
    expect(JSON.parse(localStorage.getItem(PENDING)!)).toMatchObject({ state: begun.state, next: "/booth" });
  });

  it("rejects a callback whose state is not the one this device sent", async () => {
    await begin();
    const r = await finishAppLogin("code=AQB&state=forged-state-000000");
    expect(r).toHaveProperty("error");
    expect(native.calls.some((c) => c.cmd === "spotify_token")).toBe(false);
    expect(useStore.getState().spotifyToken).toBeNull();
  });

  it("after the exchange the store reports connected, and Settings says so", async () => {
    const { begun } = await begin("/settings");
    const r = await finishAppLogin(`code=AQB&state=${begun.state}`);
    expect(r).toEqual({ next: "/settings?connected=spotify" });
    const form = new URLSearchParams(String(native.calls.find((c) => c.cmd === "spotify_token")!.args.form));
    expect(form.get("code_verifier")).toBe(begun.verifier);
    expect(form.get("client_secret")).toBeNull();
    expect(native.keychain.get("spotify.refresh")).toBe("RT");
    const tok = useStore.getState().spotifyToken;
    expect(tok?.access).toBe("AT-AQB");
    expect(tok!.expires).toBeGreaterThan(Date.now());
    // a code is used once: the same link again finds nothing to finish
    expect(await finishAppLogin(`code=AQB&state=${begun.state}`)).toHaveProperty("error");
  });

  it("a session finished natively reaches the store on launch; a token the Keychain no longer backs is dropped", async () => {
    const { begun } = await begin();
    await finishAppLogin(`code=XYZ&state=${begun.state}`);
    useStore.getState().setSpotifyToken(null); // a relaunch: the page's own copy is gone
    expect(await syncAppSpotify()).toBe(true);
    expect(useStore.getState().spotifyToken?.access).toBe("AT-XYZ");
    native.signOut();
    expect(await syncAppSpotify()).toBe(false);
    expect(useStore.getState().spotifyToken).toBeNull();
    // offline: unknown, the token stays as it is
    useStore.getState().setSpotifyToken({ access: "A", expires: Date.now() + 60_000 });
    expect(await syncAppSpotify((async () => Promise.reject(new Error("offline"))) as never)).toBeNull();
    expect(useStore.getState().spotifyToken?.access).toBe("A");
  });

  it("an old pending sign-in expires", () => {
    localStorage.setItem(
      PENDING,
      JSON.stringify({
        verifier: "v".repeat(43),
        state: "s".repeat(22),
        next: "/",
        clientId: BUILT_IN,
        at: 0,
      }),
    );
    expect(takePending(PENDING_TTL_MS + 1)).toBeNull();
  });
});

describe("Use my own Spotify app", () => {
  it("the DJ's own Client ID wins over the built-in one; without it the built-in one signs in", async () => {
    expect(pickSpotifyClientId({ keychain: OWN, native: BUILT_IN })).toEqual({ id: OWN, own: true });
    expect(pickSpotifyClientId({ settings: ` ${OWN} `, native: BUILT_IN })).toEqual({ id: OWN, own: true });
    expect(pickSpotifyClientId({ native: BUILT_IN })).toEqual({ id: BUILT_IN, own: false });
    expect(pickSpotifyClientId({ builtIn: BUILT_IN })).toEqual({ id: BUILT_IN, own: false });
    expect(pickSpotifyClientId({})).toEqual({ id: "", own: false });
    // the PKCE login uses the Keychain's own ID
    install(fakeNative({ own: OWN }));
    const { begun, url } = await begin();
    expect(begun.clientId).toBe(OWN);
    expect(url.searchParams.get("client_id")).toBe(OWN);
    expect(url.toString()).not.toMatch(/secret/i);
  });

  it("the guide names the exact redirect URIs, the bundle ID and the APIs", () => {
    expect(ownAppRedirects({ app: true })).toEqual({ uris: ["tdj://spotify-callback"] });
    expect(ownAppRedirects({ app: false, origin: "https://tdj.example/" })).toEqual({
      uris: ["https://tdj.example/callback"],
      server: "https://tdj.example/api/spotify/callback",
    });
    const app = ownAppSteps({ app: true }).join("\n");
    expect(app).toContain("developer.spotify.com/dashboard");
    expect(app).toContain("tdj://spotify-callback");
    expect(app).toContain("com.ariomoniri.tdj");
    expect(app).toMatch(/Web API and Web Playback SDK/);
    expect(app).toMatch(/User Management/);
    expect(app).toMatch(/never paste it/);
    const web = ownAppSteps({ app: false, origin: "https://tdj.example" });
    expect(web.join("\n")).toContain("https://tdj.example/callback");
    expect(web.join("\n")).not.toContain("com.ariomoniri.tdj");
  });
});
