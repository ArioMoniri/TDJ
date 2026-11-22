import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEYCHAIN_KEY } from "@/lib/app/target";
import { en } from "@/lib/i18n/en";
import { tr } from "@/lib/i18n/tr";
import { useStore } from "@/lib/store";
import {
  BYO_STORAGE_KEY,
  type ByoState,
  type KeyValueStorage,
  keyHint,
  readByo,
  saveOwnClientId,
  saveYoutubeKey,
  setByoStorage,
  writeByo,
} from "./byo";
import { CONNECTIONS, validDropboxAppKey, validGoogleClientId, validYoutubeKey } from "./catalog";
import {
  beginOwnLogin,
  finishOwnLogin,
  OWN_OAUTH,
  ownAccess,
  ownAuthorizeUrl,
  ownDisconnect,
  ownTokenForm,
  ownWebRedirect,
} from "./ownOAuth";
import { dropboxUpload, driveUpload, headerJson } from "./ownUpload";
import { byoAvailable, type ConnectionContext, connectionStatus, uploadVia } from "./status";
import { findVideos, parseYoutubeSearch, youtubeSearchUrl, youtubeWays } from "./youtube";

/** obviously fake values: the leak check (scripts/security/leaks.test.mjs) knows them as fakes */
const FAKE_YT_KEY = "AIzaFAKEtestKEY0123456789abcdefghijklmn";
const FAKE_DROPBOX_KEY = "fakeappkey12345";
const FAKE_GOOGLE_ID = "123456789012-fakeclientidtest.apps.googleusercontent.com";

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** a fetch that records every URL and answers from a table of (url prefix → response) */
function fakeFetch(table: Array<[string, () => Response]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const hit = table.find(([p]) => url.startsWith(p));
    return hit ? hit[1]() : new Response("not found", { status: 404 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

let store: ReturnType<typeof memory>;
beforeEach(() => {
  store = memory();
  setByoStorage(store);
});
afterEach(() => setByoStorage(undefined));

const ctx = (o: Partial<ConnectionContext> = {}): ConnectionContext => ({
  app: false,
  linkedServer: false,
  server: { spotify: false, google: false, dropbox: false, youtubeKey: false },
  byo: {},
  spotifyClientId: false,
  ...o,
});

describe("catalog", () => {
  it("lists every service T-DJ talks to, once", () => {
    expect(CONNECTIONS.map((c) => c.id)).toEqual([
      "spotify",
      "youtube",
      "google_drive",
      "dropbox",
      "deezer",
      "musicbrainz",
      "lrclib",
      "apple_music",
    ]);
  });
  it("names the deployment's env keys exactly as sst.config.ts forwards them", async () => {
    const { readFileSync } = await import("node:fs");
    const sst = readFileSync(new URL("../../../../../sst.config.ts", import.meta.url), "utf8");
    for (const c of CONNECTIONS)
      for (const k of c.serverKeys) if (!k.startsWith("APPLE_")) expect(sst).toContain(`"${k}"`);
  });
  it("every service has its texts in English and Turkish", () => {
    const prefix: Record<string, string> = { google_drive: "google", apple_music: "apple" };
    for (const c of CONNECTIONS)
      for (const part of ["sub", "unlocks", "limits"]) {
        const k = `connections.${prefix[c.id] ?? c.id}.${part}`;
        expect(en).toHaveProperty([k]);
        expect(tr).toHaveProperty([k]);
      }
  });
  it("checks the shapes of what a DJ pastes", () => {
    expect(validYoutubeKey(FAKE_YT_KEY)).toBe(true);
    expect(validYoutubeKey("AIza-short")).toBe(false);
    expect(validDropboxAppKey(FAKE_DROPBOX_KEY)).toBe(true);
    expect(validDropboxAppKey("Not A Key")).toBe(false);
    expect(validGoogleClientId(FAKE_GOOGLE_ID)).toBe(true);
    expect(validGoogleClientId("my-client")).toBe(false);
  });
});

describe("status: the server's credentials first, then the DJ's own, else a plain sentence", () => {
  it("keyless services always work", () => {
    for (const id of ["deezer", "musicbrainz", "lrclib"] as const)
      expect(connectionStatus(id, ctx({ server: null }))).toMatchObject({ via: "keyless", tone: "on" });
  });
  it("Apple Music says it is not there yet", () => {
    expect(connectionStatus("apple_music", ctx())).toMatchObject({ via: "soon", message: "connections.msg.apple_soon" });
  });
  it("checking while the deployment has not answered", () => {
    expect(connectionStatus("spotify", ctx({ server: null })).via).toBe("checking");
    expect(connectionStatus("dropbox", ctx({ server: null })).via).toBe("checking");
  });
  it("Spotify: the site's app, else the DJ's Client ID, else how to set one up", () => {
    expect(connectionStatus("spotify", ctx({ server: { ...ctx().server!, spotify: true } })).via).toBe("server");
    expect(connectionStatus("spotify", ctx({ spotifyClientId: true })).via).toBe("own");
    expect(connectionStatus("spotify", ctx())).toMatchObject({ via: "none", tone: "warn" });
  });
  it("YouTube: your own key wins (even before the site answers), then the site's key, then Google", () => {
    expect(connectionStatus("youtube", ctx({ server: null, byo: { youtubeKey: FAKE_YT_KEY } })).via).toBe("own");
    const s = ctx().server!;
    expect(connectionStatus("youtube", ctx({ server: { ...s, youtubeKey: true } })).message).toBe(
      "connections.msg.youtube_server_key",
    );
    expect(connectionStatus("youtube", ctx({ server: { ...s, google: true } })).message).toBe(
      "connections.msg.youtube_google",
    );
    expect(connectionStatus("youtube", ctx())).toMatchObject({ via: "none", message: "connections.msg.youtube_none" });
  });
  it("Dropbox: the site's app, else the DJ's app (signed in, or a key that still needs a sign-in)", () => {
    const s = ctx().server!;
    expect(connectionStatus("dropbox", ctx({ server: { ...s, dropbox: true } })).via).toBe("server");
    expect(
      connectionStatus("dropbox", ctx({ byo: { dropbox: { clientId: FAKE_DROPBOX_KEY, connected: true } } })).via,
    ).toBe("own");
    expect(connectionStatus("dropbox", ctx({ byo: { dropbox: { clientId: FAKE_DROPBOX_KEY } } }))).toMatchObject({
      tone: "warn",
      short: "connections.short.sign_in",
    });
    expect(connectionStatus("dropbox", ctx()).message).toBe("connections.msg.dropbox_none");
  });
  it("Google Drive: no BYO on the web (Google wants a secret there); the DJ's iOS client in the apps", () => {
    const own = { google: { clientId: FAKE_GOOGLE_ID, connected: true } };
    expect(connectionStatus("google_drive", ctx({ byo: own })).message).toBe("connections.msg.drive_none_web");
    expect(byoAvailable("google_drive", false)).toBe(false);
    expect(byoAvailable("google_drive", true)).toBe(true);
    expect(connectionStatus("google_drive", ctx({ app: true, byo: own })).via).toBe("own");
    expect(connectionStatus("google_drive", ctx({ app: true })).message).toBe("connections.msg.drive_none_app");
  });
  it("a standalone app has no server, whatever the device's /api answers; a linked one has its server's", () => {
    const all = { spotify: true, google: true, dropbox: true, youtubeKey: true };
    expect(connectionStatus("dropbox", ctx({ app: true, server: all })).via).toBe("none");
    expect(connectionStatus("dropbox", ctx({ app: true, linkedServer: true, server: all })).via).toBe("server");
  });
  it("uploads go to the site's sign-in first, then to the DJ's own app", () => {
    const s = ctx().server!;
    const own: ByoState = {
      dropbox: { clientId: FAKE_DROPBOX_KEY, connected: true },
      google: { clientId: FAKE_GOOGLE_ID, connected: true },
    };
    expect(uploadVia("dropbox", ctx({ server: { ...s, dropbox: true }, byo: own }))).toBe("server");
    expect(uploadVia("dropbox", ctx({ byo: own }))).toBe("own");
    expect(uploadVia("dropbox", ctx())).toBeNull();
    expect(uploadVia("google_drive", ctx({ byo: own }))).toBeNull();
    expect(uploadVia("google_drive", ctx({ app: true, byo: own }))).toBe("own");
  });
  it("every status sentence exists in both languages", () => {
    const keys = new Set<string>();
    const contexts = [
      ctx(),
      ctx({ server: null }),
      ctx({ app: true }),
      ctx({ spotifyClientId: true, byo: { youtubeKey: "x", dropbox: { clientId: "k" }, google: { clientId: "g" } } }),
      ctx({ app: true, byo: { dropbox: { clientId: "k", connected: true }, google: { clientId: "g", connected: true } } }),
      ctx({ server: { spotify: true, google: true, dropbox: true, youtubeKey: true } }),
      ctx({ server: { spotify: false, google: true, dropbox: false, youtubeKey: false } }),
    ];
    for (const c of contexts)
      for (const x of CONNECTIONS) {
        const s = connectionStatus(x.id, c);
        keys.add(s.message);
        keys.add(s.short);
      }
    for (const k of keys) {
      expect(en).toHaveProperty([k]);
      expect(tr).toHaveProperty([k]);
    }
  });
});

describe("bring-your-own storage: on this device only, never in the synced settings", () => {
  it("a web key is kept apart from the settings store and never in what syncs", async () => {
    expect(await saveYoutubeKey(FAKE_YT_KEY, { app: false })).toBe("saved");
    expect(readByo().youtubeKey).toBe(FAKE_YT_KEY);
    expect(store.data.get(BYO_STORAGE_KEY)).toContain(FAKE_YT_KEY);
    // the settings store (persisted, synced to the server database and the apps' device copy) has no trace
    expect(JSON.stringify(useStore.getState())).not.toContain(FAKE_YT_KEY);
    expect(keyHint(readByo().youtubeKey)).toBe("…klmn");
    expect(await saveYoutubeKey("", { app: false })).toBe("removed");
    expect(store.data.has(BYO_STORAGE_KEY)).toBe(false);
  });
  it("refuses what is not a YouTube key, and stores nothing", async () => {
    expect(await saveYoutubeKey("sk-not-a-youtube-key", { app: false })).toBe("invalid");
    expect(readByo()).toEqual({});
  });
  it("apps: the key goes to the Keychain; the page keeps only the mark", async () => {
    const invoke = vi.fn(async () => undefined);
    await saveYoutubeKey(FAKE_YT_KEY, { app: true, invoke });
    expect(invoke).toHaveBeenCalledWith("secret_set", { name: "byo.youtube", value: FAKE_YT_KEY });
    expect(readByo().youtubeKey).toBe(KEYCHAIN_KEY);
    expect([...store.data.values()].join()).not.toContain(FAKE_YT_KEY);
    expect(keyHint(KEYCHAIN_KEY)).toBe("");
    await saveYoutubeKey("", { app: true, invoke });
    expect(invoke).toHaveBeenLastCalledWith("secret_delete", { name: "byo.youtube" });
  });
  it("a new app key signs the old one out", () => {
    writeByo({ dropbox: { clientId: FAKE_DROPBOX_KEY, connected: true, refresh: "r" } });
    saveOwnClientId("dropbox", FAKE_DROPBOX_KEY);
    expect(readByo().dropbox?.connected).toBe(true);
    saveOwnClientId("dropbox", "otherappkey1234");
    expect(readByo().dropbox).toEqual({ clientId: "otherappkey1234" });
    saveOwnClientId("dropbox", "");
    expect(readByo().dropbox).toBeUndefined();
  });
  it("no storage at all (a private window): everything reads as empty, nothing throws", () => {
    setByoStorage(null);
    expect(readByo()).toEqual({});
    expect(() => writeByo({ youtubeKey: FAKE_YT_KEY })).not.toThrow();
  });
});

describe("YouTube search: own key → the site's key → Google, and the key never reaches a TDJ server", () => {
  const ITEMS = {
    items: [
      { id: { videoId: "abc_DEF-123" }, snippet: { title: "Poema", channelTitle: "Canaro" } },
      { id: { videoId: "bad id!" }, snippet: { title: "x" } },
    ],
  };
  it("builds Google's request and keeps only valid video ids", () => {
    const u = new URL(youtubeSearchUrl("Poema Canaro tango", FAKE_YT_KEY));
    expect(u.origin).toBe("https://www.googleapis.com");
    expect(u.searchParams.get("key")).toBe(FAKE_YT_KEY);
    expect(parseYoutubeSearch(ITEMS)).toEqual([{ videoId: "abc_DEF-123", title: "Poema", channel: "Canaro", thumb: null }]);
    expect(parseYoutubeSearch(null)).toEqual([]);
  });
  it("the ways for each device", () => {
    expect(youtubeWays({ app: false, ownKey: true })).toEqual(["own", "server", "google"]);
    expect(youtubeWays({ app: true, ownKey: false })).toEqual([]);
    expect(youtubeWays({ app: true, ownKey: true })).toEqual(["own"]);
  });
  it("your own key: one request, straight to Google, no cookies, nothing to /api", async () => {
    const { f, calls } = fakeFetch([["https://www.googleapis.com/", () => json(ITEMS)]]);
    const r = await findVideos("Poema", { app: false, byo: { youtubeKey: FAKE_YT_KEY }, fetch: f });
    expect(r).toMatchObject({ ok: true, via: "own" });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).host).toBe("www.googleapis.com");
    expect(calls[0]!.init?.credentials).toBe("omit");
    expect(calls.some((c) => c.url.startsWith("/"))).toBe(false);
  });
  it("your own key's quota or a refused key is said as it is", async () => {
    const quota = fakeFetch([
      ["https://www.googleapis.com/", () => json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403)],
    ]);
    expect(await findVideos("x", { app: false, byo: { youtubeKey: FAKE_YT_KEY }, fetch: quota.f })).toEqual({
      ok: false,
      error: "quota",
    });
    const bad = fakeFetch([["https://www.googleapis.com/", () => json({ error: { message: "API key not valid" } }, 400)]]);
    expect(await findVideos("x", { app: false, byo: { youtubeKey: FAKE_YT_KEY }, fetch: bad.f })).toEqual({
      ok: false,
      error: "key",
    });
  });
  it("apps: the native side searches with the Keychain's key; the page sends only the words", async () => {
    const invoke = vi.fn(async () => ({ status: 200, body: JSON.stringify(ITEMS) }));
    const { f, calls } = fakeFetch([]);
    const r = await findVideos("Poema", { app: true, byo: { youtubeKey: KEYCHAIN_KEY }, fetch: f, invoke });
    expect(r).toMatchObject({ ok: true, via: "own" });
    expect(invoke).toHaveBeenCalledWith("byo_youtube_search", { q: "Poema" });
    expect(calls).toHaveLength(0);
  });
  it("no key of your own: the site's key, and on its 404 the Google sign-in", async () => {
    const server = fakeFetch([["/api/youtube/search", () => json({ videos: parseYoutubeSearch(ITEMS) })]]);
    expect(await findVideos("x", { app: false, byo: {}, fetch: server.f })).toMatchObject({ ok: true, via: "server" });
    const google = fakeFetch([
      ["/api/youtube/search", () => json({ error: "not_configured" }, 404)],
      ["/api/google/youtube", () => json({ videos: parseYoutubeSearch(ITEMS) })],
    ]);
    expect(await findVideos("x", { app: false, byo: {}, fetch: google.f })).toMatchObject({ ok: true, via: "google" });
    const none = fakeFetch([["/api/google/youtube", () => json({ error: "Not connected" }, 401)]]);
    expect(await findVideos("x", { app: false, byo: {}, fetch: none.f })).toEqual({ ok: false, error: "connect" });
    // a standalone app without a key: nothing to try, the plain "connect or add a key" message
    expect(await findVideos("x", { app: true, byo: {}, fetch: none.f })).toEqual({ ok: false, error: "connect" });
  });
});

describe("own Dropbox / Google app: PKCE, a public client, no secret anywhere", () => {
  it("the sign-in links ask for offline access with S256 and no secret", () => {
    const d = new URL(
      ownAuthorizeUrl("dropbox", { clientId: FAKE_DROPBOX_KEY, challenge: "ch", state: "st", redirectUri: "https://x/cb" }),
    );
    expect(d.origin + d.pathname).toBe(OWN_OAUTH.dropbox.authorize);
    expect(d.searchParams.get("code_challenge_method")).toBe("S256");
    expect(d.searchParams.get("token_access_type")).toBe("offline");
    const g = new URL(ownAuthorizeUrl("google", { clientId: FAKE_GOOGLE_ID, challenge: "ch", state: "st" }));
    expect(g.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    const form = ownTokenForm({ clientId: FAKE_DROPBOX_KEY, code: "c", verifier: "v" });
    expect(form.has("client_secret")).toBe(false);
    expect(form.has("redirect_uri")).toBe(false);
    expect(ownWebRedirect("https://dj.example/")).toBe("https://dj.example/connections/callback");
  });
  it("web Dropbox: away, back, the code exchanged straight with Dropbox, tokens on this device only", async () => {
    saveOwnClientId("dropbox", FAKE_DROPBOX_KEY);
    const session = memory();
    let went = "";
    const start = await beginOwnLogin("dropbox", {
      app: false,
      fetch: vi.fn() as unknown as typeof fetch,
      session,
      origin: "https://dj.example",
      assign: (u) => {
        went = u;
      },
    });
    expect(start).toBe("left");
    const state = new URL(went).searchParams.get("state") ?? "";
    expect(new URL(went).searchParams.get("redirect_uri")).toBe("https://dj.example/connections/callback");
    const { f, calls } = fakeFetch([
      [OWN_OAUTH.dropbox.token, () => json({ access_token: "fake-at", expires_in: 14400, refresh_token: "fake-rt" })],
    ]);
    const r = await finishOwnLogin({ query: `?code=fakecode123&state=${state}` }, { app: false, fetch: f, session, now: () => 0 });
    expect(r).toEqual({ ok: true, provider: "dropbox", next: "/settings" });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["api.dropboxapi.com"]);
    expect(String(calls[0]!.init?.body)).not.toContain("secret");
    expect(readByo().dropbox).toMatchObject({ connected: true, access: "fake-at", refresh: "fake-rt" });
    expect(JSON.stringify(useStore.getState())).not.toContain("fake-rt");
    // a second callback with the same state is refused: the pending sign-in is gone
    expect((await finishOwnLogin({ query: `?code=x12345678&state=${state}` }, { app: false, fetch: f, session })).ok).toBe(false);
  });
  it("a wrong state or a refusal does not sign in", async () => {
    saveOwnClientId("dropbox", FAKE_DROPBOX_KEY);
    const session = memory();
    await beginOwnLogin("dropbox", { app: false, fetch: fetch, session, origin: "https://dj.example", assign: () => {} });
    const deps = { app: false, fetch: vi.fn() as unknown as typeof fetch, session };
    expect(await finishOwnLogin({ query: "?code=fakecode123&state=other" }, deps)).toEqual({ ok: false, error: "state" });
  });
  it("apps: Dropbox's pasted code goes to the native exchange; the refresh token never reaches the page", async () => {
    saveOwnClientId("dropbox", FAKE_DROPBOX_KEY);
    const session = memory();
    const opened: string[] = [];
    const invoke = vi.fn(async (cmd: string) => (cmd === "byo_oauth_exchange" ? { access: "fake-at", expires: 9e12 } : null));
    const start = await beginOwnLogin("dropbox", {
      app: true,
      fetch: fetch,
      invoke,
      session,
      openExternal: async (u) => void opened.push(u),
    });
    expect(start).toBe("paste");
    expect(new URL(opened[0]!).searchParams.has("redirect_uri")).toBe(false);
    const r = await finishOwnLogin({ code: "fakecode123" }, { app: true, fetch: fetch, invoke, session });
    expect(r.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("byo_oauth_exchange", expect.objectContaining({ provider: "dropbox", clientId: FAKE_DROPBOX_KEY }));
    expect(readByo().dropbox).toMatchObject({ connected: true, access: "fake-at" });
    expect(readByo().dropbox?.refresh).toBeUndefined();
  });
  it("apps: Google comes back through the app's own redirect", async () => {
    saveOwnClientId("google", FAKE_GOOGLE_ID);
    const session = memory();
    const opened: string[] = [];
    const invoke = vi.fn(async (cmd: string) => (cmd === "byo_google_redirect" ? "com.example.tdj:/oauth2redirect" : null));
    expect(
      await beginOwnLogin("google", { app: true, fetch: fetch, invoke, session, openExternal: async (u) => void opened.push(u) }),
    ).toBe("wait");
    expect(new URL(opened[0]!).searchParams.get("redirect_uri")).toBe("com.example.tdj:/oauth2redirect");
  });
  it("web: a token about to expire is refreshed with the client ID alone; a refused refresh signs out", async () => {
    writeByo({ dropbox: { clientId: FAKE_DROPBOX_KEY, connected: true, access: "old", expires: 0, refresh: "fake-rt" } });
    const ok = fakeFetch([[OWN_OAUTH.dropbox.token, () => json({ access_token: "new", expires_in: 100 })]]);
    expect(await ownAccess("dropbox", { app: false, fetch: ok.f, now: () => 0 })).toBe("new");
    expect(String(ok.calls[0]!.init?.body)).toContain("grant_type=refresh_token");
    expect(readByo().dropbox?.refresh).toBe("fake-rt");
    writeByo({ dropbox: { clientId: FAKE_DROPBOX_KEY, connected: true, access: "old", expires: 0, refresh: "fake-rt" } });
    const gone = fakeFetch([[OWN_OAUTH.dropbox.token, () => json({ error: "invalid_grant" }, 400)]]);
    expect(await ownAccess("dropbox", { app: false, fetch: gone.f })).toBeNull();
    expect(readByo().dropbox).toEqual({ clientId: FAKE_DROPBOX_KEY });
  });
  it("signing out keeps the app key and, in the apps, clears the Keychain", async () => {
    writeByo({ google: { clientId: FAKE_GOOGLE_ID, connected: true, access: "a" } });
    const invoke = vi.fn(async () => undefined);
    await ownDisconnect("google", { app: true, invoke });
    expect(invoke).toHaveBeenCalledWith("byo_oauth_logout", { provider: "google" });
    expect(readByo().google).toEqual({ clientId: FAKE_GOOGLE_ID });
  });
});

describe("own uploads go straight to the provider", () => {
  it("Dropbox: the file into the set's folder, then a shared link", async () => {
    const { f, calls } = fakeFetch([
      ["https://content.dropboxapi.com/2/files/upload", () => json({ path_display: "/Milonga_Sábado/set.m3u8" })],
      ["https://api.dropboxapi.com/2/sharing/", () => json({ url: "https://www.dropbox.com/s/fake" })],
    ]);
    const r = await dropboxUpload("fake-at", { filename: "set.m3u8", text: "#EXTM3U", set: "Milonga Sábado" }, f);
    expect(r).toEqual({ path: "/Milonga_Sábado/set.m3u8", url: "https://www.dropbox.com/s/fake" });
    const arg = (calls[0]!.init?.headers as Record<string, string>)["dropbox-api-arg"];
    expect(arg).toBe(headerJson({ path: "/Milonga Sábado/set.m3u8", mode: "overwrite", autorename: false, mute: true }));
    expect(arg).toMatch(/^[\x20-\x7e]+$/);
    expect(calls.every((c) => /^https:\/\/(content|api)\.dropboxapi\.com\//.test(c.url))).toBe(true);
  });
  it("Google Drive: finds or makes the TDJ folder, then a multipart upload", async () => {
    const { f, calls } = fakeFetch([
      ["https://www.googleapis.com/drive/v3/files?q=", () => json({ files: [] })],
      ["https://www.googleapis.com/drive/v3/files?fields=id", () => json({ id: "folder1" })],
      ["https://www.googleapis.com/upload/drive/v3/files", () => json({ id: "f1", name: "set.csv", webViewLink: "https://drive.google.com/x" })],
    ]);
    const r = await driveUpload("fake-at", { filename: "set.csv", text: "a,b" }, f);
    expect(r).toEqual({ path: "TDJ/set.csv", url: "https://drive.google.com/x" });
    expect(calls).toHaveLength(3);
    expect(String(calls[2]!.init?.body)).toContain('"parents":["folder1"]');
  });
});
