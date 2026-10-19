/**
 * Connectors: hosted "Log in with Spotify" (server-side code exchange, sealed cookie, transparent session),
 * playlist creation through the server, the BYO fallback when the deployment has no Spotify credentials, and
 * Pipedream Connect (token → Connect Link, accounts, proxy export). Spotify and Pipedream are mocked by a small
 * HTTP server; a second `next start` on port 3101 points at it through SPOTIFY_*_URL / PIPEDREAM_API_URL.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
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
      // Spotify accounts service
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
      if (url.startsWith("/v1/search"))
        return json(200, {
          tracks: {
            items: [
              {
                uri: `spotify:track:found${hits.filter((h) => h.url.startsWith("/v1/search")).length}`,
                name: "Found",
                artists: [{ name: "Orquesta" }],
                duration_ms: 170000,
                external_urls: { spotify: "https://open.spotify.com/track/x" },
              },
            ],
          },
        });
      if (url === "/v1/me/playlists" && req.method === "POST")
        return json(201, { id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } });
      if (url === "/v1/playlists/pl1/items" && req.method === "POST") return json(201, { snapshot_id: "s1" });
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

test("/api/spotify/me returns the profile with the cookie, 401 + hosted:true without it; logout clears it", async ({
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
  expect(anon.status()).toBe(401);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const out = await request.post(`${APP}/api/spotify/logout`, { headers: { cookie: session } });
  expect(out.headers()["set-cookie"]).toMatch(/tdj_sp=;.*Max-Age=0/);
});

test("playlist creation POSTs name/description/public, adds items in chunks of ≤100 and searches unresolved tracks", async ({
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
  for (const s of searches) expect(new URL(s.url, MOCK).searchParams.get("type")).toBe("track");
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
  const key = createHash("sha256").update("tdj-cookie:e2e-cookie-secret").digest();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    c.update(
      JSON.stringify({ access: "acc-stale", refresh: "ref-1", expires: Date.now() - 1000, authorizedAt: 1 }),
      "utf8",
    ),
    c.final(),
  ]);
  const sealed = [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
  hits.length = 0;
  const me = await request.get(`${APP}/api/spotify/me`, {
    headers: { cookie: `tdj_sp=${encodeURIComponent(sealed)}` },
  });
  expect(me.status()).toBe(200);
  expect((await me.json()).token.access).toBe("acc-refreshed");
  const tok = last(/POST \/api\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("refresh_token");
  expect(form.get("refresh_token")).toBe("ref-1");
  expect(me.headers()["set-cookie"]).toMatch(/tdj_sp=v1\./);
  // a tampered cookie (one ciphertext byte flipped) is simply "not logged in"
  const parts = sealed.split(".");
  parts[3] = (parts[3]![0] === "A" ? "B" : "A") + parts[3]!.slice(1);
  const bad = await (await playwright.request.newContext()).get(`${APP}/api/spotify/me`, {
    headers: { cookie: `tdj_sp=${encodeURIComponent(parts.join("."))}` },
  });
  expect(bad.status()).toBe(401);
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
  await expect(sheet).toContainText("5 listeners per app");
  await expect(sheet.locator("#spotify-logout")).toBeVisible();
  await expect(sheet.locator("#spotify-client-id")).toHaveCount(0);
  await sheet.locator("#spotify-advanced").click();
  await expect(sheet.locator("#spotify-client-id")).toBeVisible();
  // Pipedream rows (the mock lists one Dropbox account for this user once the uid cookie exists)
  await expect(page.locator("#connector-youtube_data_api")).toContainText(/Connect/);
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
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Needs a Client ID");
  await expect(page.locator("#connector-dropbox")).toContainText("Not enabled");
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
  await expect(sheet.locator("#send-dropbox")).toBeVisible();
  hits.length = 0;
  await sheet.locator("#send-dropbox").click();
  await expect(page.getByTestId("toast")).toContainText("Saved to Dropbox", { timeout: 20000 });
  expect(last(/proxy/)!.body).toContain("#EXTM3U");
  await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
  await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 30000 });
  await expect(sheet.getByRole("button", { name: "Open in Spotify" })).toBeVisible();
  expect(last(/POST \/v1\/me\/playlists/)).toBeTruthy();
  await ctx.close();
});
