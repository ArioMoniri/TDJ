/**
 * Owner setup (/admin): the in-app configuration of the hosted connectors. A second `next start` on port 3102 runs
 * with the in-memory config backend (TDJ_CONFIG_BACKEND=memory) seeded with a setup code, the way the deploy
 * workflow seeds SSM; Spotify, Google and Dropbox token endpoints are mocked so "Test" can prove the saved secret
 * reached the provider. Nothing the server answers may ever contain a secret.
 */
import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { type APIRequestContext, expect, test } from "@playwright/test";

const MOCK_PORT = 3198;
const APP_PORT = 3102;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;
const SETUP_CODE = "0123456789abcdef0123456789abcdef";
const PASSPHRASE = "milonga-nights-2026";
const SP = { id: "sp-client-id-9f3a", secret: "sp-secret-value-ZZ9" };
const GG = { id: "gg-client.apps.googleusercontent.com", secret: "gg-secret-value-QQ7" };
const SECRETS = [SP.secret, GG.secret, PASSPHRASE];

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
      const basic = `Basic ${Buffer.from(`${SP.id}:${SP.secret}`).toString("base64")}`;
      // Spotify accounts: client credentials for the admin test, authorization code for a login
      if (url === "/api/token") {
        if (req.headers.authorization !== basic) return json(401, { error: "invalid_client" });
        return json(200, {
          access_token: "acc-1",
          refresh_token: "ref-1",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url === "/v1/me") return json(200, { id: "dj1", display_name: "Test DJ" });
      // Google: a bogus code with the right client answers invalid_grant, a wrong secret invalid_client
      if (url === "/google/token") {
        const form = new URLSearchParams(body);
        if (form.get("client_id") !== GG.id || form.get("client_secret") !== GG.secret)
          return json(401, { error: "invalid_client", error_description: "The OAuth client was not found." });
        return json(400, { error: "invalid_grant", error_description: "Malformed auth code." });
      }
      if (url === "/dropbox/oauth2/token") return json(400, { error: "invalid_grant" });
      json(404, { error: `mock: no route for ${req.method} ${url}` });
    });
  });
}

let mock: http.Server;
let app: ChildProcess;
test.describe.configure({ mode: "serial" });
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
        TDJ_CONFIG_BACKEND: "memory",
        TDJ_CONFIG_SEED: JSON.stringify({ SETUP_CODE: `${SETUP_CODE}.${Math.floor(Date.now() / 1000)}` }),
        // nothing from the shell: every credential must come from the owner setup
        SPOTIFY_CLIENT_ID: "",
        SPOTIFY_CLIENT_SECRET: "",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        DROPBOX_APP_KEY: "",
        DROPBOX_APP_SECRET: "",
        TDJ_COOKIE_SECRET: "",
        NEXT_PUBLIC_APP_URL: "",
        PIPEDREAM_PROJECT_ID: "",
        TDJ_DB_TABLE: "",
        SPOTIFY_ACCOUNTS_URL: MOCK,
        SPOTIFY_API_URL: `${MOCK}/v1`,
        GOOGLE_TOKEN_URL: `${MOCK}/google/token`,
        DROPBOX_API_URL: `${MOCK}/dropbox`,
      },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${APP}/api/admin/status`);
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("admin test server did not start");
});
test.afterAll(async () => {
  app?.kill("SIGTERM");
  await new Promise<void>((r) => mock?.close(() => r()));
});

const setCookies = (r: { headersArray(): Array<{ name: string; value: string }> }) =>
  r
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
const cookieOf = (setCookie: string[], name: string) =>
  setCookie.map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${name}=`));
/** every body the server answered in a test, checked for leaked secrets at the end */
const bodies: string[] = [];
const text = async (r: { text(): Promise<string> }) => {
  const t = await r.text();
  bodies.push(t);
  return t;
};
const json = async (r: { text(): Promise<string> }) => JSON.parse(await text(r));
const expectNoSecrets = () => {
  for (const b of bodies) for (const s of SECRETS) expect(b).not.toContain(s);
};
/** each test is its own client for the per-client attempt counter */
const ip = (n: number) => ({ "x-forwarded-for": `10.0.0.${n}` });

async function unlock(request: APIRequestContext, secret: string, client: number) {
  const r = await request.post(`${APP}/api/admin/unlock`, { data: { secret }, headers: ip(client) });
  return { status: r.status(), body: await json(r), cookie: cookieOf(setCookies(r), "tdj_admin") };
}

test("a wrong setup code is refused after a delay, leaves the page locked and sets no cookie", async ({
  request,
}) => {
  const t0 = Date.now();
  const r = await unlock(request, "not-the-code", 1);
  expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  expect(r.status).toBe(401);
  expect(r.body.error).toMatch(/not right/);
  expect(r.cookie).toBeUndefined();
  const s = await json(await request.get(`${APP}/api/admin/status`));
  expect(s).toMatchObject({ unlocked: false, hasPassphrase: false, hasSetupCode: true, backend: "memory" });
  expect(s).not.toHaveProperty("providers");
  // the owner endpoints need the session
  expect((await request.get(`${APP}/api/admin/config`)).status()).toBe(401);
  expect((await request.put(`${APP}/api/admin/config`, { data: { spotify: SP } })).status()).toBe(401);
  expect(
    (await request.post(`${APP}/api/admin/passphrase`, { data: { passphrase: "x".repeat(12) } })).status(),
  ).toBe(401);
  expect((await request.post(`${APP}/api/admin/test`, { data: { provider: "spotify" } })).status()).toBe(401);
  // nothing is configured: the hosted logins are off and Settings offers the owner link
  expect(await json(await request.get(`${APP}/api/spotify/me`))).toEqual({ hosted: false, user: null });
  expect((await request.get(`${APP}/api/spotify/login`, { maxRedirects: 0 })).status()).toBe(404);
  expectNoSecrets();
});

test("setup code → passphrase (the code dies) → Spotify credentials → hosted login on, secrets never echoed", async ({
  request,
  playwright,
}) => {
  const first = await unlock(request, SETUP_CODE, 2);
  expect(first.status).toBe(200);
  expect(first.body).toEqual({ ok: true, via: "code" });
  const raw = first.cookie!;
  expect(raw).toMatch(/^tdj_admin=v1\./);
  const admin = { cookie: raw };
  const status = await json(await request.get(`${APP}/api/admin/status`, { headers: admin }));
  expect(status.unlocked).toBe(true);
  expect(status.hasPassphrase).toBe(false);
  expect(status.providers.map((p: { id: string; configured: boolean }) => [p.id, p.configured])).toEqual([
    ["spotify", false],
    ["google", false],
    ["dropbox", false],
  ]);
  expect(status.providers[0].redirectUris).toEqual([`${APP}/api/spotify/callback`, `${APP}/callback`]);
  expect(status.providers[1].redirectUris).toEqual([`${APP}/api/google/callback`]);
  // a short passphrase is refused; a good one deletes the setup code
  const short = await request.post(`${APP}/api/admin/passphrase`, {
    data: { passphrase: "short" },
    headers: admin,
  });
  expect(short.status()).toBe(400);
  const ok = await request.post(`${APP}/api/admin/passphrase`, {
    data: { passphrase: PASSPHRASE },
    headers: admin,
  });
  expect(ok.status()).toBe(200);
  const again = await unlock(await playwright.request.newContext(), SETUP_CODE, 3);
  expect(again.status).toBe(401);
  const viaPass = await unlock(await playwright.request.newContext(), PASSPHRASE, 4);
  expect(viaPass.status).toBe(200);
  expect(viaPass.body.via).toBe("passphrase");
  const s2 = await json(await request.get(`${APP}/api/admin/status`, { headers: admin }));
  expect(s2).toMatchObject({ hasPassphrase: true, hasSetupCode: false });
  // half a pair is refused, a whole pair is saved
  const half = await request.put(`${APP}/api/admin/config`, {
    data: { spotify: { clientId: SP.id } },
    headers: admin,
  });
  expect(half.status()).toBe(400);
  expect((await json(half)).errors[0]).toMatch(/both/);
  const saved = await request.put(`${APP}/api/admin/config`, {
    data: { spotify: { clientId: SP.id, clientSecret: SP.secret } },
    headers: admin,
  });
  expect(saved.status()).toBe(200);
  const sj = await json(saved);
  expect(sj.saved).toEqual(["Spotify"]);
  const sp = sj.providers.find((p: { id: string }) => p.id === "spotify");
  expect(sp).toMatchObject({ configured: true, idHint: "…9f3a", source: "store" });
  expect(JSON.stringify(sp)).not.toContain(SP.id); // only the last four characters of the id come back
  // the hosted login exists now, with the saved client id, and the Test proves the secret reached Spotify
  expect((await json(await request.get(`${APP}/api/spotify/me`))).hosted).toBe(true);
  const login = await request.get(`${APP}/api/spotify/login`, { maxRedirects: 0 });
  expect(login.status()).toBe(302);
  const to = new URL(login.headers().location!);
  expect(to.origin).toBe(MOCK);
  expect(to.searchParams.get("client_id")).toBe(SP.id);
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/spotify/callback`);
  hits.length = 0;
  const t = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "spotify" }, headers: admin }),
  );
  expect(t).toEqual({ ok: true, text: expect.stringMatching(/accepted/) });
  expect(new URLSearchParams(last(/POST \/api\/token/)!.body).get("grant_type")).toBe("client_credentials");
  const nope = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "google" }, headers: admin }),
  );
  expect(nope.ok).toBe(false);
  expect(nope.text).toMatch(/not configured/);
  // lock → the session is gone
  const lock = await request.post(`${APP}/api/admin/lock`, { headers: admin });
  expect(lock.headers()["set-cookie"]).toMatch(/tdj_admin=;.*Max-Age=0/);
  expectNoSecrets();
});

test("the page: unlock with the passphrase, paste Google credentials beside the redirect URI, test, remove", async ({
  page,
}) => {
  page.on("response", (r) => {
    if (r.url().includes("/api/"))
      void r
        .text()
        .then((t) => bodies.push(t))
        .catch(() => {});
  });
  await page.setExtraHTTPHeaders(ip(5));
  await page.goto(`${APP}/admin`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Owner setup");
  await expect(page.locator("#admin-unlock")).toContainText("Enter the owner passphrase");
  await expect(page.locator("#admin-unlock-button")).toBeDisabled();
  await page.locator("#admin-secret").fill("wrong-passphrase");
  await page.locator("#admin-unlock-button").click();
  await expect(page.locator("#admin-unlock")).toContainText("not right");
  await page.locator("#admin-secret").fill(PASSPHRASE);
  await page.locator("#admin-secret").press("Enter");
  await expect(page.locator("#admin-status-spotify")).toContainText("Configured · …9f3a");
  await expect(page.locator("#admin-status-google")).toContainText("Not configured");
  await expect(page.locator("#admin-uri-google-0")).toContainText(`${APP}/api/google/callback`);
  await expect(page.locator("#admin-uri-google-0").getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.locator("#admin-uri-spotify-1")).toContainText(`${APP}/callback`);
  await expect(page.locator("#admin-test-button-google")).toHaveCount(0);
  await expect(page.locator("#admin-save-google")).toBeDisabled();
  await page.locator("#admin-id-google").fill(GG.id);
  await page.locator("#admin-secret-google").fill(GG.secret);
  await expect(page.locator("#admin-secret-google")).toHaveAttribute("type", "password");
  await page.locator("#admin-save-google").click();
  await expect(page.locator("#admin-status-google")).toContainText("Configured · ….com");
  await expect(page.locator("#admin-id-google")).toHaveValue(""); // the form forgets what it sent
  await page.locator("#admin-test-button-google").click();
  await expect(page.getByTestId("admin-test-google")).toContainText("Google accepted");
  expect(new URLSearchParams(last(/POST \/google\/token/)!.body).get("client_secret")).toBe(GG.secret);
  // Settings no longer offers the owner link (a service is configured) and Google reads as enabled
  await page.goto(`${APP}/settings`);
  await expect(page.locator("#connector-google")).toContainText("Connect");
  await expect(page.locator("#connector-owner-setup")).toHaveCount(0);
  await page.goto(`${APP}/admin`);
  await page.locator("#admin-remove-google").click();
  await expect(page.locator("#admin-status-google")).toContainText("Not configured");
  await page.locator("#admin-lock").click();
  await expect(page.locator("#admin-unlock")).toBeVisible();
  await expect(page.locator("#admin-status-spotify")).toHaveCount(0);
  expectNoSecrets();
  const html = await page.content();
  for (const s of SECRETS) expect(html).not.toContain(s);
});

test("five wrong attempts lock a client out for a while", async ({ request }) => {
  for (let i = 0; i < 5; i++) expect((await unlock(request, `wrong-${i}`, 6)).status).toBe(401);
  const sixth = await unlock(request, PASSPHRASE, 6);
  expect(sixth.status).toBe(429);
  // another client is unaffected
  expect((await unlock(request, PASSPHRASE, 7)).status).toBe(200);
});
