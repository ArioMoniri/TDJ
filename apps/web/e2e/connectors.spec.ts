/**
 * Connectors: hosted "Log in with Spotify" (server-side code exchange, sealed cookie, transparent session),
 * playlist creation through the server, the BYO fallback when the deployment has no Spotify credentials, direct
 * Google (Drive + YouTube, incremental scopes) and Dropbox (PKCE) logins with their uploads, and Pipedream Connect
 * (token → Connect Link, accounts, proxy export). Spotify, Google, Dropbox and Pipedream are mocked by a small HTTP
 * server; a second `next start` on port 3101 points at it through the *_URL environment variables.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const MOCK_PORT = 3199;
const APP_PORT = 3101;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;

interface Hit {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}
const hits: Hit[] = [];
const last = (re: RegExp) => [...hits].reverse().find((h) => re.test(`${h.method} ${h.url}`));
/** Spotify search mock: after this many searches every search answers 429 (Infinity = never); `retryAfter` is the header. */
const searchLimit = { after: Number.POSITIVE_INFINITY, count: 0, retryAfter: 30 };

function mockServer(): http.Server {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const url = req.url ?? "";
      hits.push({ method: req.method ?? "GET", url, headers: req.headers, body });
      const json = (code: number, j: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(j));
      };
      // Spotify accounts service (a code of a user the owner never listed answers 403 "not registered")
      if (url === "/api/token" && body.includes("code=code-notlisted"))
        return json(403, {
          error: "invalid_grant",
          error_description: "User not registered in the Developer Dashboard",
        });
      if (url === "/api/token")
        return json(200, {
          access_token: body.includes("refresh_token") ? "acc-refreshed" : "acc-1",
          refresh_token: "ref-1",
          expires_in: 3600,
          token_type: "Bearer",
        });
      // Spotify Web API
      if (url === "/v1/me")
        return req.headers.authorization === "Bearer acc-1" ||
          req.headers.authorization === "Bearer acc-refreshed"
          ? json(200, {
              id: "dj1",
              display_name: "Test DJ",
              email: "dj@example.test",
              product: "premium",
              external_urls: { spotify: "https://open.spotify.com/user/dj1" },
            })
          : json(401, { error: { status: 401, message: "The access token expired" } });
      if (url.startsWith("/v1/search")) {
        searchLimit.count++;
        if (searchLimit.count > searchLimit.after) {
          res.writeHead(429, {
            "content-type": "application/json",
            "retry-after": String(searchLimit.retryAfter),
          });
          return res.end(JSON.stringify({ error: { status: 429, message: "API rate limit exceeded" } }));
        }
        // a query-aware catalogue: `track:"T" artist:"A"` answers a modern cover first, then the orchestra's own
        // recording (170 s, 1940); a title containing "nowhere" has covers only; plain queries find nothing
        const q = new URL(url, MOCK).searchParams.get("q") ?? "";
        const m = /^track:"([^"]*)" artist:"([^"]*)"$/.exec(q);
        if (!m) return json(200, { tracks: { items: [] } });
        const [, title, artist] = m;
        const n = hits.filter((h) => h.url.startsWith("/v1/search")).length;
        const item = (uri: string, artists: string[], year: string, ms: number) => ({
          uri,
          name: title,
          artists: artists.map((name) => ({ name })),
          duration_ms: ms,
          album: { name: "Album", release_date: year },
          external_urls: { spotify: `https://open.spotify.com/track/${uri.split(":")[2]}` },
        });
        const items = [item(`spotify:track:cover${n}`, ["Orquesta Moderna de Hoy"], "2019-05-01", 201000)];
        if (!/nowhere/i.test(title ?? ""))
          items.push(item(`spotify:track:found${n}`, [`${artist} y su Orquesta`], "1940-01-01", 170000));
        return json(200, { tracks: { items } });
      }
      if (url === "/v1/me/playlists" && req.method === "POST")
        return json(201, { id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } });
      if (/^\/v1\/playlists\/pl1\/items/.test(url) && req.method === "POST")
        return json(201, { snapshot_id: "s1" });
      // Pipedream Connect (REST shape the SDK deserialises)
      if (url === "/v1/oauth/token")
        return json(200, { access_token: "pd-token", token_type: "bearer", expires_in: 3600 });
      if (url === "/v1/connect/proj_test/tokens" && req.method === "POST")
        return json(200, {
          token: "ctok_test",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          connect_link_url: "https://pipedream.com/_static/connect.html?token=ctok_test&connectLink=true",
        });
      if (url.startsWith("/v1/connect/proj_test/accounts"))
        return json(200, {
          data: [
            {
              id: "apn_dropbox",
              name: "dj@example.test",
              healthy: true,
              dead: false,
              app: {
                id: "app_dbx",
                name_slug: "dropbox",
                name: "Dropbox",
                auth_type: "oauth",
                img_src: "",
                categories: [],
                featured_weight: 0,
                scope_profiles: [],
              },
            },
          ],
          page_info: { total_count: 1, count: 1, start_cursor: "a", end_cursor: "a" },
        });
      if (url.startsWith("/v1/connect/proj_test/proxy/")) return json(200, { path_display: "/TDJ/set.m3u8" });
      // Google: token endpoint (the granted scope depends on the code, like a real consent screen), userinfo,
      // Drive (folder lookup + create, multipart upload) and YouTube (playlist, search with a 2-call budget, items)
      if (url === "/google/token") {
        const form = new URLSearchParams(body);
        if (form.get("grant_type") === "refresh_token")
          return json(200, {
            access_token: "gg-refreshed",
            expires_in: 3599,
            scope: "openid email profile https://www.googleapis.com/auth/drive.file",
            token_type: "Bearer",
          });
        const code = form.get("code") ?? "";
        const scope = {
          "code-gg-none": "openid email profile",
          "code-gg-drive": "openid email profile https://www.googleapis.com/auth/drive.file",
          "code-gg-youtube": "openid https://www.googleapis.com/auth/youtube",
        }[code];
        if (!scope) return json(400, { error: "invalid_grant" });
        return json(200, {
          access_token: `gg-${code.slice(8)}`,
          ...(code === "code-gg-youtube" ? {} : { refresh_token: "ggref-1" }),
          expires_in: 3599,
          scope,
          token_type: "Bearer",
        });
      }
      if (url === "/google/oauth2/v3/userinfo")
        return req.headers.authorization?.startsWith("Bearer gg-")
          ? json(200, { sub: "g1", name: "Test Google", email: "dj@gmail.test" })
          : json(401, { error: "invalid_token" });
      if (url.startsWith("/google/drive/v3/files?") && req.method === "GET") return json(200, { files: [] });
      if (url.startsWith("/google/drive/v3/files?") && req.method === "POST")
        return json(200, { id: "folder1" });
      if (url.startsWith("/google/upload/drive/v3/files?"))
        return json(200, {
          id: "file1",
          name: "set.m3u8",
          webViewLink: "https://drive.google.com/file/d/file1/view",
        });
      if (url.startsWith("/google/youtube/v3/playlists?")) return json(200, { id: "ytpl1" });
      if (url.startsWith("/google/youtube/v3/search?")) {
        const n = hits.filter((h) => h.url.startsWith("/google/youtube/v3/search?")).length;
        return n <= 2
          ? json(200, { items: [{ id: { kind: "youtube#video", videoId: `vid${n}` } }] })
          : json(403, {
              error: {
                code: 403,
                message: "The request cannot be completed because you have exceeded your quota.",
                errors: [{ domain: "youtube.quota", reason: "quotaExceeded" }],
              },
            });
      }
      if (url.startsWith("/google/youtube/v3/playlistItems?")) return json(200, { id: "item" });
      // Dropbox: token (PKCE), account, upload (content host), shared links (409 once the path says "again")
      if (url === "/dropbox/oauth2/token")
        return json(200, {
          access_token: body.includes("refresh_token") ? "db-refreshed" : "db-1",
          ...(body.includes("refresh_token") ? {} : { refresh_token: "dbref-1" }),
          expires_in: 14400,
          token_type: "bearer",
        });
      if (url === "/dropbox/2/users/get_current_account")
        return req.headers.authorization?.startsWith("Bearer db-")
          ? json(200, {
              account_id: "dbid:1",
              name: { display_name: "Test Dropbox" },
              email: "dj@example.test",
            })
          : json(401, { error_summary: "invalid_access_token/" });
      if (url === "/dropbox-content/2/files/upload") {
        const arg = JSON.parse(String(req.headers["dropbox-api-arg"] ?? "{}")) as { path: string };
        return json(200, { path_display: arg.path, path_lower: arg.path.toLowerCase() });
      }
      if (url === "/dropbox/2/sharing/create_shared_link_with_settings")
        return body.includes("again")
          ? json(409, {
              error_summary: "shared_link_already_exists/..",
              error: { ".tag": "shared_link_already_exists" },
            })
          : json(200, { url: "https://www.dropbox.com/scl/fo/new?dl=0" });
      if (url === "/dropbox/2/sharing/list_shared_links")
        return json(200, { links: [{ url: "https://www.dropbox.com/scl/fo/existing?dl=0" }] });
      json(404, { error: `mock: no route for ${req.method} ${url}` });
    });
  });
}

let mock: http.Server;
let app: ChildProcess;
test.beforeAll(async () => {
  mock = mockServer();
  await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
  const cwd = path.resolve(__dirname, "..");
  app = spawn(
    process.execPath,
    [path.join(cwd, "node_modules/next/dist/bin/next"), "start", "-p", String(APP_PORT)],
    {
      cwd,
      env: {
        ...process.env,
        SPOTIFY_CLIENT_ID: "test-client",
        SPOTIFY_CLIENT_SECRET: "test-secret",
        TDJ_COOKIE_SECRET: "e2e-cookie-secret",
        SPOTIFY_ACCOUNTS_URL: MOCK,
        SPOTIFY_API_URL: `${MOCK}/v1`,
        PIPEDREAM_PROJECT_ID: "proj_test",
        PIPEDREAM_CLIENT_ID: "pd-client",
        PIPEDREAM_CLIENT_SECRET: "pd-secret",
        PIPEDREAM_API_URL: MOCK,
        GOOGLE_CLIENT_ID: "google-client",
        GOOGLE_CLIENT_SECRET: "google-secret",
        GOOGLE_ACCOUNTS_URL: `${MOCK}/gaccounts`,
        GOOGLE_TOKEN_URL: `${MOCK}/google/token`,
        GOOGLE_API_URL: `${MOCK}/google`,
        DROPBOX_APP_KEY: "db-key",
        DROPBOX_APP_SECRET: "db-secret",
        DROPBOX_WWW_URL: `${MOCK}/dbwww`,
        DROPBOX_API_URL: `${MOCK}/dropbox`,
        DROPBOX_CONTENT_URL: `${MOCK}/dropbox-content`,
        NEXT_PUBLIC_APP_URL: "",
        TDJ_DB_TABLE: "",
      },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${APP}/api/spotify/me`);
      if (r.status === 401 || r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("second Next server did not start");
});
test.afterAll(async () => {
  app?.kill("SIGTERM");
  await new Promise<void>((r) => mock?.close(() => r()));
});

const cookieOf = (setCookie: string[] | undefined, name: string) =>
  (setCookie ?? []).map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${name}=`));
const setCookies = (r: { headersArray(): Array<{ name: string; value: string }> }) =>
  r
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);

/** Seals / unseals exactly as lib/server/cookies.ts does with TDJ_COOKIE_SECRET=e2e-cookie-secret. */
const COOKIE_KEY = createHash("sha256").update("tdj-cookie:e2e-cookie-secret").digest();
function sealed(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", COOKIE_KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}
function unsealed<T>(cookiePair: string): T {
  const [, iv, tag, ct] = decodeURIComponent(cookiePair.slice(cookiePair.indexOf("=") + 1)).split(".");
  const d = createDecipheriv("aes-256-gcm", COOKIE_KEY, Buffer.from(iv!, "base64url"));
  d.setAuthTag(Buffer.from(tag!, "base64url"));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(ct!, "base64url")), d.final()]).toString("utf8"),
  ) as T;
}

/** Runs the hosted login up to the callback and returns the session cookie pair. */
async function login(request: APIRequestContext) {
  const r = await request.get(`${APP}/api/spotify/login?next=/`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  const state = to.searchParams.get("state")!;
  const stateCookie = cookieOf(
    r
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value),
    "tdj_sp_state",
  )!;
  const cb = await request.get(
    `${APP}/api/spotify/callback?code=code-xyz&state=${encodeURIComponent(state)}`,
    {
      maxRedirects: 0,
      headers: { cookie: stateCookie },
    },
  );
  expect(cb.status()).toBe(302);
  const set = cb
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
  const session = cookieOf(set, "tdj_sp")!;
  return { session, location: cb.headers().location!, setCookie: set };
}

test("login redirects to Spotify with the app's Client ID, scopes, state cookie and the /api/spotify/callback redirect URI", async ({
  request,
}) => {
  const r = await request.get(`${APP}/api/spotify/login`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  expect(to.origin).toBe(MOCK);
  expect(to.pathname).toBe("/authorize");
  expect(to.searchParams.get("client_id")).toBe("test-client");
  expect(to.searchParams.get("response_type")).toBe("code");
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/spotify/callback`);
  expect(to.searchParams.get("scope")).toBe(
    "playlist-modify-private playlist-modify-public user-read-email streaming user-read-private",
  );
  const state = to.searchParams.get("state") ?? "";
  expect(state.length).toBeGreaterThan(16);
  const sc = r.headersArray().find((h) => h.name.toLowerCase() === "set-cookie")?.value ?? "";
  expect(sc).toContain(`tdj_sp_state=${encodeURIComponent(state)}`);
  expect(sc).toMatch(/HttpOnly/);
  expect(sc).toMatch(/SameSite=Lax/);
  expect(sc).toMatch(/Path=\/api\/spotify/);
});

test("callback exchanges the code on the server (client secret never in the browser) and seals the session cookie", async ({
  request,
}) => {
  hits.length = 0;
  const { session, location, setCookie } = await login(request);
  expect(location).toBe(`${APP}/?connected=spotify`);
  const sealed = decodeURIComponent(session.slice("tdj_sp=".length));
  expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(sealed).not.toContain("acc-1");
  expect(sealed).not.toContain("ref-1");
  const raw = setCookie.find((c) => c.startsWith("tdj_sp="))!;
  expect(raw).toMatch(/HttpOnly/);
  expect(raw).toMatch(/SameSite=Lax/);
  expect(raw).not.toMatch(/Secure/); // http origin: no Secure flag; https sets it
  const tok = last(/POST \/api\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code")).toBe("code-xyz");
  expect(form.get("redirect_uri")).toBe(`${APP}/api/spotify/callback`);
  expect(tok.headers.authorization).toBe(
    `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
  );
  // a wrong state is refused and never reaches Spotify
  const before = hits.length;
  const bad = await request.get(`${APP}/api/spotify/callback?code=x&state=forged`, {
    maxRedirects: 0,
    headers: { cookie: "tdj_sp_state=other" },
  });
  expect(bad.headers().location).toContain("error=spotify_state");
  expect(hits.length).toBe(before);
});

test("a DJ the owner did not list: access_denied from Spotify or a 403 'not registered' exchange lands on spotify_not_listed, and Settings explains it", async ({
  request,
  browser,
}) => {
  const start = async () => {
    const r = await request.get(`${APP}/api/spotify/login?next=/`, { maxRedirects: 0 });
    const state = new URL(r.headers().location!).searchParams.get("state")!;
    return { state, cookie: cookieOf(setCookies(r), "tdj_sp_state")! };
  };
  const a = await start();
  const denied = await request.get(
    `${APP}/api/spotify/callback?error=access_denied&state=${encodeURIComponent(a.state)}`,
    { maxRedirects: 0, headers: { cookie: a.cookie } },
  );
  expect(denied.headers().location).toBe(`${APP}/settings?error=spotify_not_listed`);
  expect(cookieOf(setCookies(denied), "tdj_sp")).toBeUndefined();
  const b = await start();
  const refused = await request.get(
    `${APP}/api/spotify/callback?code=code-notlisted&state=${encodeURIComponent(b.state)}`,
    { maxRedirects: 0, headers: { cookie: b.cookie } },
  );
  expect(refused.headers().location).toBe(`${APP}/settings?error=spotify_not_listed`);
  // any other failure keeps its own reason
  const c = await start();
  const other = await request.get(
    `${APP}/api/spotify/callback?error=server_error&state=${encodeURIComponent(c.state)}`,
    { maxRedirects: 0, headers: { cookie: c.cookie } },
  );
  expect(other.headers().location).toBe(`${APP}/settings?error=spotify_denied`);
  // the page: a plain sheet, the request to copy, the other ways
  const ctx = await browser.newContext({ baseURL: APP, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.goto("/settings?error=spotify_not_listed");
  const sheet = page.getByTestId("spotify-not-listed");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(
    "This app can let in 5 Spotify accounts. Ask the organiser to add your Spotify email, or send your set to Spotify another way",
  );
  await expect(sheet.locator("#not-listed-copy")).toHaveText("Copy my request");
  await expect(sheet.locator("#not-listed-contact")).toHaveCount(0); // no organiser contact on this deployment
  await page.locator("#not-listed-copy").click();
  await expect(sheet.locator("#not-listed-copy")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/add my Spotify e-mail/);
  await sheet.locator("#not-listed-other").click();
  await expect(sheet.locator("#not-listed-other-ways")).toBeVisible();
  await expect(sheet.locator("#not-listed-transfer")).toContainText("Spotify via a transfer service");
  expect(page.url()).toBe(`${APP}/settings`); // the error left the address bar
  await ctx.close();
});

test("/api/spotify/me returns the profile with the cookie, 200 { hosted:true, user:null } without it (no console 401s); logout clears it", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  const me = await request.get(`${APP}/api/spotify/me`, { headers: { cookie: session } });
  expect(me.status()).toBe(200);
  const j = await me.json();
  expect(j.hosted).toBe(true);
  expect(j.user).toMatchObject({ id: "dj1", name: "Test DJ", product: "premium" });
  expect(j.token.access).toBe("acc-1");
  expect(j).not.toHaveProperty("refresh");
  const fresh = await playwright.request.newContext();
  const anon = await fresh.get(`${APP}/api/spotify/me`);
  expect(anon.status()).toBe(200);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const out = await request.post(`${APP}/api/spotify/logout`, { headers: { cookie: session } });
  expect(out.headers()["set-cookie"]).toMatch(/tdj_sp=;.*Max-Age=0/);
});

test("playlist creation POSTs name/description/public, adds items in chunks of ≤100 and matches unresolved tracks with field-filtered searches", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 4, seed: 3 } })).json();
  hits.length = 0;
  const r = await request.post(`${APP}/api/spotify/playlist`, {
    headers: { cookie: session },
    data: { playlist: p, includeCortinas: false, name: "Milonga test" },
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.url).toBe("https://open.spotify.com/playlist/pl1");
  const create = last(/POST \/v1\/me\/playlists/)!;
  expect(JSON.parse(create.body)).toEqual({
    name: "Milonga test",
    description: expect.stringContaining("cortinas excluded"),
    public: false,
  });
  expect(create.headers.authorization).toBe("Bearer acc-1");
  const adds = hits.filter((h) => h.url === "/v1/playlists/pl1/items");
  expect(adds.length).toBeGreaterThan(0);
  let total = 0;
  for (const a of adds) {
    const uris = JSON.parse(a.body).uris as string[];
    expect(uris.length).toBeLessThanOrEqual(100);
    total += uris.length;
  }
  expect(total).toBe(j.added);
  const songs =
    p.tandas.reduce((n: number, t: { songs: unknown[] }) => n + t.songs.length, 0) + (p.closing ? 1 : 0);
  expect(j.added).toBe(songs); // every unresolved track was found by the (mocked) search
  const searches = hits.filter((h) => h.url.startsWith("/v1/search"));
  for (const s of searches) {
    const q = new URL(s.url, MOCK).searchParams;
    expect(q.get("type")).toBe("track");
    expect(q.get("limit")).toBe("10");
    expect(q.get("q")).toMatch(/^track:"[^"]+" artist:"[^"]+"$/);
  }
  // the scorer took the orchestra's recording, never the cover that Spotify lists first
  for (const a of adds) for (const u of JSON.parse(a.body).uris as string[]) expect(u).not.toMatch(/cover/);
  // not logged in → 401, nothing reaches Spotify
  const n = hits.length;
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/spotify/playlist`, {
    data: { playlist: p },
  });
  expect(anon.status()).toBe(401);
  expect(hits.length).toBe(n);
});

test("an expired access token is refreshed transparently and the cookie is re-sealed", async ({
  request,
  playwright,
}) => {
  // seal a session whose access token expired, exactly as lib/server/cookies.ts does with TDJ_COOKIE_SECRET
  const stale = sealed({
    access: "acc-stale",
    refresh: "ref-1",
    expires: Date.now() - 1000,
    authorizedAt: 1,
  });
  hits.length = 0;
  const me = await request.get(`${APP}/api/spotify/me`, {
    headers: { cookie: `tdj_sp=${encodeURIComponent(stale)}` },
  });
  expect(me.status()).toBe(200);
  expect((await me.json()).token.access).toBe("acc-refreshed");
  const tok = last(/POST \/api\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("refresh_token");
  expect(form.get("refresh_token")).toBe("ref-1");
  expect(me.headers()["set-cookie"]).toMatch(/tdj_sp=v1\./);
  // a tampered cookie (one ciphertext byte flipped) is simply "not logged in"
  const parts = stale.split(".");
  parts[3] = (parts[3]![0] === "A" ? "B" : "A") + parts[3]!.slice(1);
  const bad = await (await playwright.request.newContext()).get(`${APP}/api/spotify/me`, {
    headers: { cookie: `tdj_sp=${encodeURIComponent(parts.join("."))}` },
  });
  expect(bad.status()).toBe(200);
  expect((await bad.json()).user).toBeNull();
});

test("Settings (hosted): the Spotify row shows the account, the sheet has one primary action and Advanced hides the BYO field", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page = await ctx.newPage();
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Test DJ");
  await page.locator("#connector-spotify").click();
  const sheet = page.getByRole("dialog", { name: "Spotify" });
  await expect(sheet).toContainText("Logged in as Test DJ");
  await expect(sheet).toContainText("5 Spotify accounts");
  await expect(sheet.locator("#spotify-logout")).toBeVisible();
  await expect(sheet.locator("#spotify-client-id")).toHaveCount(0);
  await sheet.locator("#spotify-advanced").click();
  await expect(sheet.locator("#spotify-client-id")).toBeVisible();
  // Pipedream rows (the mock lists one Dropbox account for this user once the uid cookie exists)
  await expect(page.locator("#connector-pd-youtube_data_api")).toContainText(/Connect/);
  await expect(page.locator("#connector-owner-setup")).toHaveCount(0); // a service is configured: no owner link
  await ctx.close();
});

test("Settings (hosted, logged out): one button sends the DJ to /api/spotify/login", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Log in");
  await page.locator("#connector-spotify").click();
  const sheet = page.getByRole("dialog", { name: "Spotify" });
  await expect(sheet.locator("#spotify-login")).toHaveText("Log in with Spotify");
  // the button navigates to the server route, which redirects to Spotify (mocked: a 404 page from the mock)
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(`${APP}/api/spotify/login`)),
    sheet.locator("#spotify-login").click(),
  ]);
  expect(new URL(req.url()).searchParams.get("next")).toBe("/settings");
  await ctx.close();
});

test("env-absent fallback: without server credentials the sheet shows the BYO Client ID flow", async ({
  page,
}) => {
  await page.route("**/api/spotify/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ hosted: false, user: null }),
    }),
  );
  await page.route("**/api/connect/accounts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, accounts: [] }),
    }),
  );
  for (const p of ["google", "dropbox"])
    await page.route(`**/api/${p}/me`, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ hosted: false, user: null }),
      }),
    );
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Needs a Client ID");
  await expect(page.locator("#connector-dropbox")).toContainText("Not enabled");
  await expect(page.locator("#connector-google")).toContainText("Not enabled");
  await expect(page.locator("#connector-pd-youtube_data_api")).toHaveCount(0); // no Pipedream rows without its env
  // nothing configured anywhere: the owner is pointed at the in-app setup
  await expect(page.locator("#connector-owner-setup")).toContainText("Owner setup");
  await page.locator("#connector-spotify").click();
  const sheet = page.getByRole("dialog", { name: "Spotify" });
  await expect(sheet.locator("#spotify-connect")).toBeDisabled();
  await expect(sheet.locator("#spotify-login")).toHaveCount(0);
  await sheet.locator("#spotify-advanced").click();
  await sheet.locator("#spotify-client-id").fill("my-client-id");
  await expect(sheet.locator("#spotify-connect")).toBeEnabled();
  await expect(sheet).toContainText("/callback");
  await sheet.getByRole("button", { name: "Done" }).click();
  await page.locator("#connector-dropbox").click();
  const dbx = page.getByRole("dialog", { name: "Dropbox" });
  await expect(dbx).toContainText("Not enabled on this deployment");
  await expect(dbx.getByRole("link", { name: /How to enable/ })).toHaveAttribute(
    "href",
    /DEPLOY\.md#connectors/,
  );
  await expect(dbx.locator("#dropbox-login")).toHaveCount(0);
  await dbx.getByRole("button", { name: "Done" }).click();
  await page.locator("#connector-google").click();
  const gg = page.getByRole("dialog", { name: "Google" });
  await expect(gg).toContainText("Not enabled on this deployment");
  await expect(gg.getByRole("link", { name: /How to enable/ })).toHaveAttribute(
    "href",
    /DEPLOY\.md#connectors/,
  );
});

test("Pipedream: /api/connect/token mints a Connect Link for the cookie user; accounts and proxy export work", async ({
  request,
}) => {
  hits.length = 0;
  const t = await request.post(`${APP}/api/connect/token`, { data: { app: "dropbox" } });
  expect(t.status()).toBe(200);
  const j = await t.json();
  expect(j.connect_link_url).toContain("token=ctok_test");
  expect(j.connect_link_url).toContain("app=dropbox");
  const uid = cookieOf(
    t
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value),
    "tdj_uid",
  )!;
  const created = last(/POST \/v1\/connect\/proj_test\/tokens/)!;
  const body = JSON.parse(created.body);
  expect(body.external_user_id).toBe(decodeURIComponent(uid.slice("tdj_uid=".length)).split(".")[0]);
  expect(body.allowed_origins).toEqual([APP]);
  expect(body.success_redirect_uri).toBe(`${APP}/settings?connected=dropbox`);
  expect(last(/POST \/v1\/oauth\/token/)).toBeTruthy(); // the SDK authenticated with the client credentials
  const acc = await (await request.get(`${APP}/api/connect/accounts`, { headers: { cookie: uid } })).json();
  expect(acc.enabled).toBe(true);
  expect(acc.accounts).toEqual([
    { id: "apn_dropbox", app: "dropbox", label: "Dropbox", name: "dj@example.test", healthy: true },
  ]);
  const ex = await request.post(`${APP}/api/connect/export`, {
    headers: { cookie: uid },
    data: {
      app: "dropbox",
      accountId: "apn_dropbox",
      format: "m3u8",
      filename: "set.m3u8",
      text: "#EXTM3U\n",
    },
  });
  expect(ex.status()).toBe(200);
  expect((await ex.json()).path).toBe("/TDJ/set.m3u8");
  const proxy = last(/POST \/v1\/connect\/proj_test\/proxy\//)!;
  expect(proxy.body).toBe("#EXTM3U\n");
  expect(proxy.headers.authorization).toBe("Bearer pd-token");
  expect(proxy.headers["x-pd-proxy-dropbox-api-arg"]).toContain('"path":"/set.m3u8"');
  expect(proxy.headers["x-pd-environment"]).toBe("development");
  expect(Buffer.from(proxy.url.split("/proxy/")[1]!.split("?")[0]!, "base64url").toString()).toBe(
    "https://content.dropboxapi.com/2/files/upload",
  );
  // the wrong account id is refused
  const no = await request.post(`${APP}/api/connect/export`, {
    headers: { cookie: uid },
    data: { app: "dropbox", accountId: "apn_other", format: "m3u8", text: "x" },
  });
  expect(no.status()).toBe(403);
  // disabled deployment (the default server has no PIPEDREAM_* unless the shell sets them)
  const def = await request.post("/api/connect/token", { data: { app: "dropbox" } });
  expect([200, 404]).toContain(def.status());
});

test("Export sheet (hosted): 'Create playlist in Spotify' uses the session, lists the connected Dropbox and saves the file", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  await page.request.post("/api/connect/token", { data: {} }); // mints the uid cookie the accounts call needs
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet.locator("#send-spotify")).toContainText("Test DJ");
  await expect(sheet.locator("#send-pd-dropbox")).toBeVisible();
  // the direct rows (deployment's own Google and Dropbox apps) come before the Pipedream account
  await expect(sheet.locator("#send-dropbox")).toContainText("Connect");
  await expect(sheet.locator("#send-google_drive")).toContainText("Connect");
  await expect(sheet.locator("#send-youtube")).toContainText("Connect");
  const order = await sheet.evaluate((el) =>
    ["#send-spotify", "#send-youtube", "#send-dropbox", "#send-google_drive", "#send-pd-dropbox"].map((id) =>
      [...el.querySelectorAll("[id^=send-]")].findIndex((n) => n.id === id.slice(1)),
    ),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(order.every((i) => i >= 0)).toBe(true);
  // "Spotify via a transfer service": a title/artist/album CSV with one row per file, and the import page in a new tab
  const files = Number((await page.locator("#export-count").textContent())!.match(/\((\d+) files?\)/)![1]);
  await sheet.locator("#send-transfer").click();
  const transfer = page.getByTestId("transfer-sheet");
  await expect(transfer).toBeVisible();
  await expect(transfer.locator("#transfer-steps")).toContainText("Download the CSV below");
  await expect(transfer).toContainText(`${files} rows in set order`);
  // the import page is stubbed: the test proves which tab opens, not the service's own site
  await ctx.route("https://www.tunemymusic.com/**", (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><body>stub</body></html>" }),
  );
  const [download, popup] = await Promise.all([
    page.waitForEvent("download"),
    ctx.waitForEvent("page"),
    transfer.locator("#transfer-download").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-tunemymusic\.csv$/);
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://www.tunemymusic.com/transfer/csv-to-spotify");
  await popup.close();
  const csv = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
  const lines = csv.split("\r\n").filter(Boolean);
  expect(lines[0]).toBe("title,artist,album");
  expect(lines.length - 1).toBe(files);
  expect(lines[1]).toMatch(/^"[^"]+","[^"]+",".*"$/);
  await transfer.getByRole("button", { name: "Done" }).click();
  await expect(transfer).toBeHidden();
  hits.length = 0;
  await sheet.locator("#send-pd-dropbox").click();
  await expect(page.getByTestId("toast")).toContainText("Saved to Dropbox", { timeout: 20000 });
  expect(last(/proxy/)!.body).toContain("#EXTM3U");
  await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
  await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 30000 });
  await expect(sheet.getByRole("button", { name: "Open in Spotify" })).toBeVisible();
  expect(last(/POST \/v1\/me\/playlists/)).toBeTruthy();
  await ctx.close();
});

/* ---------- server-side matching, rate limits, cortina play length ---------- */

test("POST /api/spotify/match scores up to 10 items: the orchestra's recording beats a modern cover, covers alone are 'not found'", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  hits.length = 0;
  const items = [
    {
      id: "ciego",
      title: "Ciego",
      orchestra: "Francisco Canaro",
      singer: "Roberto Maida",
      year: 1935,
      durationSec: 162,
    },
    { id: "none", title: "Nowhere tango", orchestra: "Juan D'Arienzo", year: 1940, durationSec: 170 },
    { id: "lc", title: "La cumparsita", orchestra: "Juan D'Arienzo", year: 1951, durationSec: 172 },
  ];
  const r = await request.post(`${APP}/api/spotify/match`, { headers: { cookie: session }, data: { items } });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.rateLimited).toBeUndefined();
  expect(j.missing).toEqual(["none"]);
  expect(j.matches.map((m: { id: string }) => m.id)).toEqual(["ciego", "lc"]);
  const ciego = j.matches[0];
  expect(ciego.uri).toMatch(/^spotify:track:found/);
  expect(ciego.artist).toBe("Canaro y su Orquesta");
  expect(ciego.name).toBe("Ciego");
  expect(ciego.durationMs).toBe(170000);
  expect(ciego.year).toBe(1940);
  expect(ciego.score).toBeGreaterThanOrEqual(0.6);
  // the searches: one field-filtered query per item, the plain fallback only for the cover-only title
  const searches = hits
    .filter((h) => h.url.startsWith("/v1/search"))
    .map((h) => new URL(h.url, MOCK).searchParams.get("q"));
  expect(searches).toEqual([
    'track:"Ciego" artist:"Canaro"',
    'track:"Nowhere tango" artist:"D\'Arienzo"',
    "Nowhere tango Juan D'Arienzo",
    'track:"La cumparsita" artist:"D\'Arienzo"',
  ]);
  // memoised per process: the same items again search nothing
  const n = hits.length;
  const again = await request.post(`${APP}/api/spotify/match`, {
    headers: { cookie: session },
    data: { items },
  });
  expect((await again.json()).matches).toHaveLength(2);
  expect(hits.filter((h) => h.url.startsWith("/v1/search")).length).toBe(
    hits.slice(0, n).filter((h) => h.url.startsWith("/v1/search")).length,
  );
  // limits and auth
  const many = await request.post(`${APP}/api/spotify/match`, {
    headers: { cookie: session },
    data: { items: Array.from({ length: 11 }, (_, i) => ({ id: `i${i}`, title: `T${i}`, orchestra: "O" })) },
  });
  expect(many.status()).toBe(400);
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/spotify/match`, {
    data: { items: items.slice(0, 1) },
  });
  expect(anon.status()).toBe(401);
});

test("a 429 from Spotify ends the matching cleanly: the server reports the pause, the browser stops (no retry storm), the playlist holds what was found, 'Try again' adds the rest", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // every recording unresolved: the composed set without its cached Spotify ids
  let files = 0;
  await page.route("**/api/compose", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    for (const t of j.tandas) for (const s of t.songs) s.spotify = null;
    if (j.closing) j.closing.spotify = null;
    if (j.opening) j.opening.spotify = null;
    files =
      j.tandas.reduce((n: number, t: { songs: unknown[] }) => n + t.songs.length, 0) +
      (j.closing ? 1 : 0) +
      (j.opening ? 1 : 0);
    await route.fulfill({ response: r, json: j });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await sheet.getByRole("switch", { name: "Include cortinas" }).click(); // songs only: a known count
  expect(files).toBeGreaterThan(20);
  hits.length = 0;
  searchLimit.count = 0;
  searchLimit.after = 1; // the first search answers, the second is a 429 with Retry-After 30
  try {
    await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("Spotify is pausing searches for 30 s", { timeout: 30000 });
    await expect(toast).toContainText("try again in a minute to add the rest");
    await expect(toast.getByRole("button", { name: "Try again" })).toBeVisible();
    // no retry storm: one answered search, one 429, nothing more (Retry-After 30 is never waited out)
    const searches = hits.filter((h) => h.url.startsWith("/v1/search"));
    expect(searches.length).toBeLessThanOrEqual(3);
    expect(searches.length).toBe(2);
    // the playlist exists with the one match
    const create = last(/POST \/v1\/me\/playlists/)!;
    expect(JSON.parse(create.body).name).toMatch(/^TDJ · /);
    const adds = hits.filter((h) => /^\/v1\/playlists\/pl1\/items/.test(h.url));
    expect(adds).toHaveLength(1);
    // the one search that answered plus whatever the server already remembered from earlier tests (memoised
    // per process: no search for those), never a cover
    const first = JSON.parse(adds[0]!.body).uris as string[];
    expect(first).toContain("spotify:track:found1");
    for (const u of first) expect(u).toMatch(/^spotify:track:found/);
    const left = files - first.length;
    await expect(sheet).toContainText(
      `${first.length} tracks in the playlist. Spotify paused searches for 30 s: ${left} still to match.`,
    );
    await expect(sheet.getByRole("button", { name: "Open in Spotify" })).toBeVisible();
    const btn = sheet.locator("#spotify-create");
    await expect(btn).toContainText(`Try again · ${left} left`);
    // the pause is over: Try again matches the rest into the same playlist, batch by batch
    searchLimit.after = Number.POSITIVE_INFINITY;
    hits.length = 0;
    let matchCalls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/spotify/match")) matchCalls++;
    });
    await btn.click();
    await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 60000 });
    expect(last(/POST \/v1\/me\/playlists/)).toBeUndefined(); // no second playlist
    expect(matchCalls).toBe(Math.ceil(left / 10)); // batches of 10, sent one after the other
    let total = 0;
    for (const a of hits.filter((h) => /^\/v1\/playlists\/pl1\/items/.test(h.url))) {
      const uris = JSON.parse(a.body).uris as string[];
      expect(uris.length).toBeLessThanOrEqual(100);
      for (const u of uris) expect(u).not.toMatch(/cover/);
      total += uris.length;
    }
    expect(total).toBe(left);
    await expect(sheet).toContainText(`Added ${left} more.`);
    // the matches went into the DJ's database: a second export of the same set searches nothing
    hits.length = 0;
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.getByRole("button", { name: "Export" }).first().click();
    await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
    await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 60000 });
    expect(hits.filter((h) => h.url.startsWith("/v1/search"))).toHaveLength(0);
    // the console stayed clean: no 401s from /api/*/me, no 429 storm, no stale PKCE refresh
    expect(errors.filter((e) => /401|429|accounts\.spotify|api\.spotify/.test(e))).toEqual([]);
  } finally {
    searchLimit.after = Number.POSITIVE_INFINITY;
  }
  await ctx.close();
});

test("cortina play length: the Export sheet's stepper changes the M3U8 (VLC stop-time) and the setting persists in Settings → Playback", async ({
  browser,
  request,
}) => {
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 2, seed: 3 } })).json();
  // the route: explicit seconds, else each cortina's own length
  const at60 = await (
    await request.post(`${APP}/api/export`, { data: { playlist: p, format: "m3u8", cortinaStopSec: 60 } })
  ).text();
  const cortinas = p.tandas.filter((t: { cortina: unknown }) => t.cortina).length;
  expect(cortinas).toBeGreaterThan(0);
  expect(at60.match(/^#EXTVLCOPT:stop-time=60$/gm)).toHaveLength(cortinas);
  const xspf = await (
    await request.post(`${APP}/api/export`, { data: { playlist: p, format: "xspf", cortinaStopSec: 60 } })
  ).text();
  expect(xspf.match(/<vlc:option>stop-time=60<\/vlc:option>/g)).toHaveLength(cortinas);
  const rb = await (
    await request.post(`${APP}/api/export`, {
      data: { playlist: p, format: "rekordbox", cortinaStopSec: 60 },
    })
  ).text();
  expect(rb.match(/<POSITION_MARK [^>]*Start="60\.000"/g)).toHaveLength(cortinas);
  // the sheet
  const ctx = await browser.newContext({ baseURL: APP });
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toContainText("Cortinas stop at 45 s");
  await expect(sheet).toContainText("Spotify playlists cannot trim tracks");
  await sheet.getByRole("button", { name: "Increase cortina play length" }).click();
  await expect(sheet).toContainText("Cortinas stop at 50 s");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("button", { name: /M3U8 playlist/ }).click(),
  ]);
  const text = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
  expect(text).toContain("#EXTVLCOPT:stop-time=50");
  expect(text).not.toContain("#EXTVLCOPT:stop-time=45");
  // Settings → Playback shows the same value and can hand it back to the composer
  await page.goto("/settings");
  const playback = page.getByRole("group", { name: "Cortina play length" });
  await expect(page.getByText("Your own length")).toBeVisible();
  await expect(playback).toContainText("50");
  await page.getByRole("switch", { name: "Follow the composer's cortina length" }).click();
  await expect(page.getByText("Follows the composer")).toBeVisible();
  await ctx.close();
});

/* ---------- direct Google (Drive + YouTube) ---------- */

/** Runs /api/google/login?scope=… up to the callback; `code` decides what the mock consent screen granted. */
async function googleLogin(
  request: APIRequestContext,
  scope: "" | "drive" | "youtube",
  code: string,
  existing?: string,
) {
  const r = await request.get(`${APP}/api/google/login?scope=${scope}&next=/`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  const state = to.searchParams.get("state")!;
  const stateCookie = cookieOf(setCookies(r), "tdj_gg_state")!;
  const cb = await request.get(`${APP}/api/google/callback?code=${code}&state=${encodeURIComponent(state)}`, {
    maxRedirects: 0,
    headers: { cookie: [stateCookie, existing].filter(Boolean).join("; ") },
  });
  expect(cb.status()).toBe(302);
  const set = setCookies(cb);
  return { session: cookieOf(set, "tdj_gg")!, location: cb.headers().location!, setCookie: set, to };
}

test("Google login asks for the feature scope incrementally: offline access, consent, include_granted_scopes, state cookie", async ({
  request,
}) => {
  const r = await request.get(`${APP}/api/google/login?scope=drive`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  expect(to.origin + to.pathname).toBe(`${MOCK}/gaccounts/o/oauth2/v2/auth`);
  expect(to.searchParams.get("client_id")).toBe("google-client");
  expect(to.searchParams.get("response_type")).toBe("code");
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/google/callback`);
  const scope = (to.searchParams.get("scope") ?? "").split(" ");
  expect(scope).toEqual(
    expect.arrayContaining(["openid", "email", "https://www.googleapis.com/auth/drive.file"]),
  );
  expect(scope).not.toContain("https://www.googleapis.com/auth/youtube");
  expect(to.searchParams.get("access_type")).toBe("offline");
  expect(to.searchParams.get("prompt")).toBe("consent");
  expect(to.searchParams.get("include_granted_scopes")).toBe("true");
  const sc = setCookies(r).find((c) => c.startsWith("tdj_gg_state="))!;
  expect(sc).toMatch(/HttpOnly/);
  expect(sc).toMatch(/Path=\/api\/google/);
  // YouTube is a separate consent, nothing else; no scope at all = identity only
  const yt = new URL(
    (await request.get(`${APP}/api/google/login?scope=youtube`, { maxRedirects: 0 })).headers().location!,
  );
  expect(yt.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube");
  expect(yt.searchParams.get("scope")).not.toContain("drive.file");
  const none = new URL(
    (await request.get(`${APP}/api/google/login`, { maxRedirects: 0 })).headers().location!,
  );
  expect(none.searchParams.get("scope")).toBe("openid email profile");
});

test("Google callback exchanges the code with the client secret in the body, seals tdj_gg and merges scopes across consents", async ({
  request,
  playwright,
}) => {
  hits.length = 0;
  const first = await googleLogin(request, "drive", "code-gg-drive");
  expect(first.location).toBe(`${APP}/?connected=google`);
  const raw = first.setCookie.find((c) => c.startsWith("tdj_gg="))!;
  expect(raw).toMatch(/HttpOnly/);
  expect(raw).toMatch(/SameSite=Lax/);
  expect(first.session).not.toContain("gg-drive");
  const tok = last(/POST \/google\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code")).toBe("code-gg-drive");
  expect(form.get("redirect_uri")).toBe(`${APP}/api/google/callback`);
  expect(form.get("client_id")).toBe("google-client");
  expect(form.get("client_secret")).toBe("google-secret");
  expect(tok.headers.authorization).toBeUndefined();
  const me = await request.get(`${APP}/api/google/me`, { headers: { cookie: first.session } });
  expect(me.status()).toBe(200);
  const j = await me.json();
  expect(j.hosted).toBe(true);
  expect(j.user).toMatchObject({ id: "g1", name: "Test Google", email: "dj@gmail.test" });
  expect(j.scopes).toEqual({ drive: true, youtube: false });
  expect(j).not.toHaveProperty("token");
  // second consent for YouTube: Google issued no new refresh token; the old one and the Drive scope survive
  const second = await googleLogin(request, "youtube", "code-gg-youtube", first.session);
  const s = unsealed<{ access: string; refresh: string; scopes: string[] }>(second.session);
  expect(s.access).toBe("gg-youtube");
  expect(s.refresh).toBe("ggref-1");
  expect(s.scopes).toEqual(
    expect.arrayContaining([
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/youtube",
    ]),
  );
  const me2 = await (await playwright.request.newContext()).get(`${APP}/api/google/me`, {
    headers: { cookie: second.session },
  });
  expect((await me2.json()).scopes).toEqual({ drive: true, youtube: true });
  // anonymous: 200 + hosted:true, user null; a forged state never reaches Google
  const anon = await (await playwright.request.newContext()).get(`${APP}/api/google/me`);
  expect(anon.status()).toBe(200);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const before = hits.length;
  const bad = await request.get(`${APP}/api/google/callback?code=x&state=forged`, {
    maxRedirects: 0,
    headers: { cookie: "tdj_gg_state=other" },
  });
  expect(bad.headers().location).toContain("error=google_state");
  expect(hits.length).toBe(before);
  const out = await request.post(`${APP}/api/google/logout`);
  expect(out.headers()["set-cookie"]).toMatch(/tdj_gg=;.*Max-Age=0/);
});

test("an expired Google access token is refreshed with the client secret in the body and the cookie re-sealed", async ({
  playwright,
}) => {
  const stale = sealed({
    access: "gg-stale",
    refresh: "ggref-1",
    expires: Date.now() - 1000,
    authorizedAt: 1,
    scopes: ["openid", "https://www.googleapis.com/auth/drive.file"],
  });
  hits.length = 0;
  const me = await (await playwright.request.newContext()).get(`${APP}/api/google/me`, {
    headers: { cookie: `tdj_gg=${encodeURIComponent(stale)}` },
  });
  expect(me.status()).toBe(200);
  expect((await me.json()).scopes.drive).toBe(true);
  const tok = last(/POST \/google\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("refresh_token");
  expect(form.get("refresh_token")).toBe("ggref-1");
  expect(form.get("client_secret")).toBe("google-secret");
  expect(me.headers()["set-cookie"]).toMatch(/tdj_gg=v1\./);
  expect(last(/userinfo/)!.headers.authorization).toBe("Bearer gg-refreshed");
});

test("Drive upload: finds or creates the TDJ folder, then a multipart/related body with the metadata and the file", async ({
  request,
  playwright,
}) => {
  const { session } = await googleLogin(request, "drive", "code-gg-drive");
  hits.length = 0;
  const r = await request.post(`${APP}/api/google/drive`, {
    headers: { cookie: session },
    data: { format: "m3u8", filename: "set.m3u8", text: "#EXTM3U\n#EXTINF:170,Orquesta - Found\n" },
  });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({
    app: "google_drive",
    id: "file1",
    path: "TDJ/set.m3u8",
    url: "https://drive.google.com/file/d/file1/view",
  });
  const lookup = last(/GET \/google\/drive\/v3\/files\?/)!;
  expect(new URL(lookup.url, MOCK).searchParams.get("q")).toContain("name = 'TDJ'");
  const mk = last(/POST \/google\/drive\/v3\/files\?/)!;
  expect(JSON.parse(mk.body)).toEqual({ name: "TDJ", mimeType: "application/vnd.google-apps.folder" });
  const up = last(/POST \/google\/upload\/drive\/v3\/files\?/)!;
  expect(up.url).toContain("uploadType=multipart");
  expect(up.url).toContain("fields=id,name,webViewLink");
  expect(up.headers.authorization).toBe("Bearer gg-drive");
  const boundary = /multipart\/related; boundary=(\S+)/.exec(String(up.headers["content-type"]))?.[1];
  expect(boundary).toBeTruthy();
  const parts = up.body.split(`--${boundary}`);
  expect(parts).toHaveLength(4); // "", metadata, file, "--\r\n"
  expect(parts[1]).toContain("Content-Type: application/json; charset=UTF-8");
  expect(JSON.parse(parts[1]!.split("\r\n\r\n")[1]!.trim())).toEqual({
    name: "set.m3u8",
    parents: ["folder1"],
  });
  expect(parts[2]).toMatch(/Content-Type: [\w/.+-]+mpegurl/);
  expect(parts[2]).toContain("#EXTM3U\n#EXTINF:170,Orquesta - Found\n");
  // the Drive scope was never granted: 403 with where to go, nothing sent to Google
  const yt = await googleLogin(await playwright.request.newContext(), "youtube", "code-gg-youtube");
  const n = hits.length;
  const no = await request.post(`${APP}/api/google/drive`, {
    headers: { cookie: yt.session },
    data: { format: "m3u8", filename: "set.m3u8", text: "#EXTM3U\n", next: "/history" },
  });
  expect(no.status()).toBe(403);
  expect(await no.json()).toEqual({
    error: "needs_scope",
    scope: "drive",
    login: "/api/google/login?scope=drive&next=%2Fhistory",
  });
  expect(hits.length).toBe(n);
  // not connected → 401
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/google/drive`, {
    data: { format: "m3u8", text: "x" },
  });
  expect(anon.status()).toBe(401);
});

test("YouTube: creates the playlist, searches each track, inserts items and stops at the first quota error, reporting what was left out", async ({
  request,
  playwright,
}) => {
  const { session } = await googleLogin(await playwright.request.newContext(), "youtube", "code-gg-youtube");
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 2, seed: 5 } })).json();
  const songs =
    p.tandas.reduce((n: number, t: { songs: unknown[] }) => n + t.songs.length, 0) + (p.closing ? 1 : 0);
  hits.length = 0;
  const r = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: session },
    data: { playlist: p, includeCortinas: false, name: "Milonga YT" },
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.url).toBe("https://www.youtube.com/playlist?list=ytpl1");
  expect(j.added).toBe(2);
  expect(j.quota).toBe(true);
  expect(j.missing).toEqual([]);
  expect(j.skipped).toHaveLength(songs - 2);
  const create = last(/POST \/google\/youtube\/v3\/playlists\?/)!;
  expect(create.url).toContain("part=snippet,status");
  expect(JSON.parse(create.body)).toEqual({
    snippet: { title: "Milonga YT", description: expect.stringContaining("cortinas excluded") },
    status: { privacyStatus: "private" },
  });
  expect(create.headers.authorization).toBe("Bearer gg-youtube");
  const searches = hits.filter((h) => h.url.startsWith("/google/youtube/v3/search?"));
  expect(searches).toHaveLength(3); // two hits, the third answered 403 quotaExceeded → stop
  for (const s of searches) {
    const q = new URL(s.url, MOCK).searchParams;
    expect(q.get("type")).toBe("video");
    expect(q.get("maxResults")).toBe("1");
    expect(q.get("q")).toBeTruthy();
  }
  const inserts = hits.filter((h) => h.url.startsWith("/google/youtube/v3/playlistItems?"));
  expect(inserts).toHaveLength(2);
  expect(JSON.parse(inserts[0]!.body)).toEqual({
    snippet: { playlistId: "ytpl1", resourceId: { kind: "youtube#video", videoId: "vid1" } },
  });
  // with only the Drive scope the route asks for the YouTube consent first
  const drive = await googleLogin(await playwright.request.newContext(), "drive", "code-gg-drive");
  const no = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: drive.session },
    data: { playlist: p },
  });
  expect(no.status()).toBe(403);
  expect((await no.json()).login).toBe("/api/google/login?scope=youtube&next=%2F");
});

/* ---------- direct Dropbox (PKCE) ---------- */

async function dropboxLogin(request: APIRequestContext) {
  const r = await request.get(`${APP}/api/dropbox/login?next=/`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  const state = to.searchParams.get("state")!;
  const set = setCookies(r);
  const cookies = [cookieOf(set, "tdj_db_state")!, cookieOf(set, "tdj_db_pkce")!];
  const cb = await request.get(
    `${APP}/api/dropbox/callback?code=code-db&state=${encodeURIComponent(state)}`,
    {
      maxRedirects: 0,
      headers: { cookie: cookies.join("; ") },
    },
  );
  expect(cb.status()).toBe(302);
  const cbSet = setCookies(cb);
  return {
    session: cookieOf(cbSet, "tdj_db")!,
    location: cb.headers().location!,
    setCookie: cbSet,
    to,
    cookies,
  };
}

test("Dropbox login uses PKCE (S256) and offline access; the callback proves the verifier and seals tdj_db", async ({
  request,
  playwright,
}) => {
  hits.length = 0;
  const { session, location, setCookie, to, cookies } = await dropboxLogin(request);
  expect(to.origin + to.pathname).toBe(`${MOCK}/dbwww/oauth2/authorize`);
  expect(to.searchParams.get("client_id")).toBe("db-key");
  expect(to.searchParams.get("response_type")).toBe("code");
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/dropbox/callback`);
  expect(to.searchParams.get("token_access_type")).toBe("offline");
  expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  const challenge = to.searchParams.get("code_challenge") ?? "";
  expect(challenge.length).toBeGreaterThanOrEqual(43);
  expect(to.searchParams.has("scope")).toBe(false); // scopes come from the app's permissions tab
  expect(cookies[1]).toMatch(/^tdj_db_pkce=v1\./); // the verifier only ever travels sealed
  expect(location).toBe(`${APP}/?connected=dropbox`);
  const raw = setCookie.find((c) => c.startsWith("tdj_db="))!;
  expect(raw).toMatch(/HttpOnly/);
  expect(session).not.toContain("db-1");
  const tok = last(/POST \/dropbox\/oauth2\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code")).toBe("code-db");
  expect(form.get("redirect_uri")).toBe(`${APP}/api/dropbox/callback`);
  const verifier = form.get("code_verifier") ?? "";
  expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
  expect(tok.headers.authorization).toBe(`Basic ${Buffer.from("db-key:db-secret").toString("base64")}`);
  expect(form.has("client_id")).toBe(false);
  expect(unsealed<{ refresh: string }>(session).refresh).toBe("dbref-1");
  // the state and PKCE cookies are gone afterwards; a callback without the verifier cookie is refused
  expect(setCookie.find((c) => c.startsWith("tdj_db_pkce="))).toMatch(/Max-Age=0/);
  const again = await request.get(`${APP}/api/dropbox/login`, { maxRedirects: 0 });
  const st = new URL(again.headers().location!).searchParams.get("state")!;
  const n = hits.length;
  const bad = await request.get(`${APP}/api/dropbox/callback?code=x&state=${encodeURIComponent(st)}`, {
    maxRedirects: 0,
    headers: { cookie: cookieOf(setCookies(again), "tdj_db_state")! },
  });
  expect(bad.headers().location).toContain("error=dropbox_state");
  expect(hits.length).toBe(n);
  // me / anonymous / logout / refresh
  const me = await request.get(`${APP}/api/dropbox/me`, { headers: { cookie: session } });
  expect(me.status()).toBe(200);
  expect((await me.json()).user).toMatchObject({
    id: "dbid:1",
    name: "Test Dropbox",
    email: "dj@example.test",
  });
  const anon = await (await playwright.request.newContext()).get(`${APP}/api/dropbox/me`);
  expect(anon.status()).toBe(200);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const out = await request.post(`${APP}/api/dropbox/logout`);
  expect(out.headers()["set-cookie"]).toMatch(/tdj_db=;.*Max-Age=0/);
  const stale = sealed({
    access: "db-stale",
    refresh: "dbref-1",
    expires: Date.now() - 1000,
    authorizedAt: 1,
  });
  hits.length = 0;
  const fresh = await (await playwright.request.newContext()).get(`${APP}/api/dropbox/me`, {
    headers: { cookie: `tdj_db=${encodeURIComponent(stale)}` },
  });
  expect(fresh.status()).toBe(200);
  expect(new URLSearchParams(last(/POST \/dropbox\/oauth2\/token/)!.body).get("grant_type")).toBe(
    "refresh_token",
  );
  expect(fresh.headers()["set-cookie"]).toMatch(/tdj_db=v1\./);
  expect(last(/get_current_account/)!.headers.authorization).toBe("Bearer db-refreshed");
});

test("Dropbox upload: files/upload into /<set>/<file> of the app folder, then a shared link (reused when it exists)", async ({
  request,
  playwright,
}) => {
  const { session } = await dropboxLogin(await playwright.request.newContext());
  hits.length = 0;
  const r = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: { format: "m3u8", filename: "set.m3u8", text: "#EXTM3U\n", set: "Milonga / test" },
  });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({
    app: "dropbox",
    path: "/Apps/TDJ/Milonga _ test/set.m3u8",
    url: "https://www.dropbox.com/scl/fo/new?dl=0",
  });
  const up = last(/POST \/dropbox-content\/2\/files\/upload/)!;
  expect(up.headers["content-type"]).toBe("application/octet-stream");
  expect(up.headers.authorization).toBe("Bearer db-1");
  expect(JSON.parse(String(up.headers["dropbox-api-arg"]))).toEqual({
    path: "/Milonga _ test/set.m3u8",
    mode: "add",
    autorename: true,
    mute: false,
  });
  expect(up.body).toBe("#EXTM3U\n");
  const share = last(/create_shared_link_with_settings/)!;
  expect(JSON.parse(share.body)).toEqual({ path: "/milonga _ test/set.m3u8" });
  expect(share.headers["content-type"]).toBe("application/json");
  // a link that already exists (409) is looked up instead of failing the export
  const r2 = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: { format: "csv", filename: "again.csv", text: "a,b\n", set: "Set" },
  });
  expect((await r2.json()).url).toBe("https://www.dropbox.com/scl/fo/existing?dl=0");
  expect(JSON.parse(last(/list_shared_links/)!.body)).toEqual({ path: "/set/again.csv", direct_only: true });
  // not connected → 401; a bad format → 400
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/dropbox/upload`, {
    data: { format: "m3u8", text: "x" },
  });
  expect(anon.status()).toBe(401);
  const bad = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: { format: "exe", text: "x" },
  });
  expect(bad.status()).toBe(400);
});

/* ---------- Settings and Export sheet with the direct connections ---------- */

test("Settings (direct): Google and Dropbox rows show the account, permissions per feature, one button when logged out", async ({
  browser,
  playwright,
}) => {
  const gg = await googleLogin(await playwright.request.newContext(), "drive", "code-gg-drive");
  const db = await dropboxLogin(await playwright.request.newContext());
  const ctx = await browser.newContext({ baseURL: APP });
  await ctx.addCookies(
    [gg.session, db.session].map((c) => {
      const [name, value] = c.split("=");
      return { name: name!, value: value!, url: APP };
    }),
  );
  const page = await ctx.newPage();
  await page.goto("/settings");
  await expect(page.locator("#connector-google")).toContainText("Test Google");
  await expect(page.locator("#connector-dropbox")).toContainText("Test Dropbox");
  await page.locator("#connector-google").click();
  const sheet = page.getByRole("dialog", { name: "Google" });
  await expect(sheet).toContainText("Connected as Test Google");
  await expect(sheet.locator("#google-scope-drive")).toContainText("Allowed");
  await expect(sheet.locator("#google-scope-youtube")).toContainText("Not yet");
  await expect(sheet.locator("#google-grant-drive")).toHaveCount(0);
  await expect(sheet.locator("#google-grant-youtube")).toHaveText("Allow YouTube");
  await expect(sheet.locator("#google-logout")).toBeVisible();
  const [grant] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(`${APP}/api/google/login`)),
    sheet.locator("#google-grant-youtube").click(),
  ]);
  const q = new URL(grant.url()).searchParams;
  expect(q.get("scope")).toBe("youtube");
  expect(q.get("next")).toBe("/settings");
  await page.goto("/settings");
  await page.locator("#connector-dropbox").click();
  const dbx = page.getByRole("dialog", { name: "Dropbox" });
  await expect(dbx).toContainText("Connected as Test Dropbox");
  await expect(dbx).toContainText("Apps/TDJ");
  await expect(dbx.locator("#dropbox-logout")).toBeVisible();
  // the Pipedream alternative lives under Advanced, named as such
  await expect(page.locator("#connector-pd-youtube_data_api")).toContainText("via Pipedream");
  await ctx.close();
  // logged out: one primary action per sheet, pointing at the server login routes
  const ctx2 = await browser.newContext({ baseURL: APP });
  const page2 = await ctx2.newPage();
  await page2.goto("/settings");
  await expect(page2.locator("#connector-google")).toContainText("Connect");
  await page2.locator("#connector-google").click();
  const g2 = page2.getByRole("dialog", { name: "Google" });
  await expect(g2.locator("#google-login")).toHaveText("Connect with Google");
  await expect(g2.locator("#google-scope-drive")).toHaveCount(0);
  const [login] = await Promise.all([
    page2.waitForRequest((r) => r.url().startsWith(`${APP}/api/google/login`)),
    g2.locator("#google-login").click(),
  ]);
  expect(new URL(login.url()).searchParams.get("scope")).toBeNull();
  await page2.goto("/settings");
  await page2.locator("#connector-dropbox").click();
  const d2 = page2.getByRole("dialog", { name: "Dropbox" });
  await expect(d2.locator("#dropbox-login")).toHaveText("Connect Dropbox");
  const [dlogin] = await Promise.all([
    page2.waitForRequest((r) => r.url().startsWith(`${APP}/api/dropbox/login`)),
    d2.locator("#dropbox-login").click(),
  ]);
  expect(new URL(dlogin.url()).searchParams.get("next")).toBe("/settings");
  await ctx2.close();
});

test("Export sheet (direct): Save to Dropbox uploads the chosen format with the session cookie; Drive without its scope goes to consent", async ({
  browser,
  playwright,
}) => {
  const gg = await googleLogin(await playwright.request.newContext(), "", "code-gg-none");
  const db = await dropboxLogin(await playwright.request.newContext());
  const ctx = await browser.newContext({ baseURL: APP });
  await ctx.addCookies(
    [gg.session, db.session].map((c) => {
      const [name, value] = c.split("=");
      return { name: name!, value: value!, url: APP };
    }),
  );
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet.locator("#send-dropbox")).toContainText(".m3u8");
  await expect(sheet.locator("#send-google_drive")).toContainText("Allow");
  await expect(sheet.locator("#send-youtube")).toContainText("Allow");
  await sheet.getByRole("combobox", { name: "File format" }).selectOption("csv");
  await expect(sheet.locator("#send-dropbox")).toContainText(".csv");
  hits.length = 0;
  await sheet.locator("#send-dropbox").click();
  await expect(page.getByTestId("toast")).toContainText("Saved to Dropbox", { timeout: 20000 });
  const up = last(/POST \/dropbox-content\/2\/files\/upload/)!;
  expect(up.body).toMatch(/^"?#/); // the CSV export, not the m3u8
  expect(JSON.parse(String(up.headers["dropbox-api-arg"])).path).toMatch(/\.csv$/);
  await expect(sheet).toContainText("Saved CSV to Dropbox (/Apps/TDJ/");
  await expect(sheet.getByRole("button", { name: "Open in Dropbox" })).toBeVisible();
  // Drive: the scope was never granted → the server says so and the browser goes to Google's consent for it
  const [consent] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(`${APP}/api/google/login`)),
    sheet.locator("#send-google_drive").click(),
  ]);
  const q = new URL(consent.url()).searchParams;
  expect(q.get("scope")).toBe("drive");
  expect(q.get("next")).toBe("/");
  await ctx.close();
});
