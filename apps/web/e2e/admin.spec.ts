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
const GG = {
  id: "gg-client.apps.googleusercontent.com",
  secret: "gg-secret-value-QQ7",
  malformed: "gg-malformed-secret-MM1",
};
const AI = {
  key: "sk-ant-shared-key-7Q2x",
  orgKey: "sk-ant-org-level-key",
  workspace: "wrkspc_01TEST",
  slowKey: "sk-ant-slow-key-ZZ3",
  openai: "sk-openai-key-OO4",
  gemini: "AIza-gemini-key-GG5",
};
const SEATS = ["dj-one@example.test", "dj-two@example.test"];
const OWNER = "organiser@example.test";
const SECRETS = [
  SP.secret,
  GG.secret,
  GG.malformed,
  PASSPHRASE,
  AI.key,
  AI.orgKey,
  AI.workspace,
  AI.slowKey,
  AI.openai,
  AI.gemini,
];

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
        // a malformed request is refused before the secret is checked: no proof of anything
        if (form.get("client_secret") === GG.malformed)
          return json(400, { error: "invalid_request", error_description: "Missing required parameter" });
        if (form.get("client_id") !== GG.id || form.get("client_secret") !== GG.secret)
          return json(401, { error: "invalid_client", error_description: "The OAuth client was not found." });
        return json(400, { error: "invalid_grant", error_description: "Malformed auth code." });
      }
      if (url === "/dropbox/oauth2/token") return json(400, { error: "invalid_grant" });
      // Anthropic (ANTHROPIC_BASE_URL): an organisation-level key is refused without its workspace header
      // OpenAI-compatible chat completions and Gemini generateContent: the request shape is what is tested
      if (url === "/openai/chat/completions")
        return req.headers.authorization === `Bearer ${AI.openai}`
          ? json(200, { choices: [{ message: { content: "OK" } }] })
          : json(401, { error: { message: "Incorrect API key provided" } });
      if (/^\/gemini\/models\/[^/]+:generateContent$/.test(url))
        return req.headers["x-goog-api-key"] === AI.gemini
          ? json(200, { candidates: [{ content: { parts: [{ text: "OK" }] } }] })
          : json(400, { error: { message: "API key not valid" } });
      if (url.startsWith("/anthropic/v1/messages")) {
        // a slow model: the server gives up after TDJ_MODEL_TIMEOUT_MS and says so in plain words
        if (req.headers["x-api-key"] === AI.slowKey) {
          setTimeout(
            () =>
              json(200, {
                id: "msg_slow",
                type: "message",
                role: "assistant",
                model: "test-model",
                content: [{ type: "text", text: "late" }],
                stop_reason: "end_turn",
                usage: { input_tokens: 1, output_tokens: 1 },
              }),
            4000,
          );
          return;
        }
        if (req.headers["x-api-key"] === AI.orgKey && !req.headers["anthropic-workspace-id"])
          return json(400, {
            type: "error",
            error: {
              type: "invalid_request_error",
              message:
                "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header",
            },
          });
        if (req.headers["x-api-key"] !== AI.key && req.headers["x-api-key"] !== AI.orgKey)
          return json(401, {
            type: "error",
            error: { type: "authentication_error", message: "invalid x-api-key" },
          });
        return json(200, {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "test-model",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
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
        ANTHROPIC_BASE_URL: `${MOCK}/anthropic`,
        ANTHROPIC_API_KEY: "",
        OPENAI_BASE_URL: `${MOCK}/openai`,
        GEMINI_BASE_URL: `${MOCK}/gemini`,
        // the 25 s model timeout shortened so the slow-model test runs in seconds
        TDJ_MODEL_TIMEOUT_MS: "1500",
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
  // a locked caller learns only that the owner setup is done, never whether a code is stored
  const locked = await json(await (await playwright.request.newContext()).get(`${APP}/api/admin/status`));
  expect(locked).toMatchObject({ unlocked: false, hasPassphrase: true, hasSetupCode: false });
  expect((await json(await request.get(`${APP}/api/admin/public`))).setupNeeded).toBe(false);
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

/* ---------- people, the public endpoint and the shared model key ---------- */

test("People: seats and the organiser contact are saved for the owner; /api/admin/public shows counts, never e-mails or secrets", async ({
  request,
  playwright,
}) => {
  const { cookie } = await unlock(request, PASSPHRASE, 8);
  const admin = { cookie: cookie! };
  // nothing yet: the public view is empty but well-formed, and it needs no session
  const before = await json(await request.get(`${APP}/api/admin/public`));
  expect(before).toEqual({
    providers: { spotify: true, google: false, dropbox: false },
    ownerContact: "",
    seats: { spotify: { used: 0, max: 5 }, google: { used: 0, max: 100 }, dropbox: { used: 0, max: 50 } },
    ai: { shared: false, dailyLimit: 20 },
    setupNeeded: false,
  });
  // six Spotify seats are refused, two are saved; a line without @ is refused
  const six = await request.put(`${APP}/api/admin/config`, {
    data: { seats: { spotify: Array.from({ length: 6 }, (_, i) => `dj${i}@example.test`) } },
    headers: admin,
  });
  expect((await json(six)).errors[0]).toMatch(/5 seats at most/);
  const bad = await request.put(`${APP}/api/admin/config`, {
    data: { seats: { spotify: "not an e-mail" } },
    headers: admin,
  });
  expect((await json(bad)).errors[0]).toMatch(/one e-mail/);
  const ok = await request.put(`${APP}/api/admin/config`, {
    data: { seats: { spotify: SEATS.join("\n"), google: ["DJ-One@example.test"] }, ownerContact: OWNER },
    headers: admin,
  });
  expect(ok.status()).toBe(200);
  expect((await json(ok)).saved).toEqual(
    expect.arrayContaining(["Organiser contact", "Spotify seats", "Google seats"]),
  );
  const status = await json(await request.get(`${APP}/api/admin/status`, { headers: admin }));
  expect(status.seats).toEqual({ spotify: SEATS, google: ["dj-one@example.test"], dropbox: [] });
  expect(status.seatLimits).toEqual({ spotify: 5, google: 100, dropbox: 50 });
  expect(status.ownerContact).toBe(OWNER);
  // the public endpoint: counts and the contact, nothing else
  const pub = await request.get(`${APP}/api/admin/public`);
  const pj = await json(pub);
  expect(pj.seats).toEqual({
    spotify: { used: 2, max: 5 },
    google: { used: 1, max: 100 },
    dropbox: { used: 0, max: 50 },
  });
  expect(pj.ownerContact).toBe(OWNER);
  const raw = JSON.stringify(pj);
  for (const e of SEATS) expect(raw).not.toContain(e);
  expect(raw).not.toContain(SP.id);
  expect(raw).not.toMatch(/9f3a|hint|secret|key/i);
  // a locked client (no cookie) still cannot see the lists
  const locked = await json(await (await playwright.request.newContext()).get(`${APP}/api/admin/status`));
  expect(locked).not.toHaveProperty("seats");
  expect(locked).not.toHaveProperty("ownerContact");
  expectNoSecrets();
});

test("shared model key: saved on /admin, used for DJs without a key, counted per DJ and per day, 429 with a plain message at the limit", async ({
  request,
  playwright,
}) => {
  const { cookie } = await unlock(request, PASSPHRASE, 9);
  const admin = { cookie: cookie! };
  // without a shared key a keyless DJ gets the old 401
  const none = await request.post(`${APP}/api/ai/review`, { data: { test: true } });
  expect(none.status()).toBe(401);
  // a bad limit and a missing key are refused
  expect(
    (
      await json(
        await request.put(`${APP}/api/admin/config`, {
          data: { ai: { provider: "anthropic", key: AI.key, dailyLimit: 0 } },
          headers: admin,
        }),
      )
    ).errors[0],
  ).toMatch(/between 1 and 1000/);
  expect(
    (
      await json(
        await request.put(`${APP}/api/admin/config`, {
          data: { ai: { provider: "anthropic" } },
          headers: admin,
        }),
      )
    ).errors[0],
  ).toMatch(/Paste the model key/);
  const saved = await request.put(`${APP}/api/admin/config`, {
    data: { ai: { provider: "anthropic", key: AI.key, model: "", dailyLimit: 2 } },
    headers: admin,
  });
  expect(saved.status()).toBe(200);
  const status = await json(await request.get(`${APP}/api/admin/status`, { headers: admin }));
  expect(status.ai).toEqual({
    configured: true,
    provider: "anthropic",
    model: "",
    dailyLimit: 2,
    keyHint: "…7Q2x",
    hasWorkspace: false,
    source: "store",
  });
  // the owner's Test pings the provider with the shared key (not counted against anyone)
  hits.length = 0;
  const t = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "ai" }, headers: admin }),
  );
  expect(t).toEqual({ ok: true, text: expect.stringMatching(/answered "OK"/) });
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["x-api-key"]).toBe(AI.key);
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["anthropic-workspace-id"]).toBeUndefined();
  // a DJ without a key: the shared key runs the request, the key stays on the server, the quota counts down
  const dj = await playwright.request.newContext();
  const q0 = await json(await dj.get(`${APP}/api/ai/review`));
  expect(q0).toMatchObject({ shared: true, limit: 2, used: 0, provider: "anthropic" });
  hits.length = 0;
  const r1 = await dj.post(`${APP}/api/ai/review`, { data: { test: true } });
  expect(r1.status()).toBe(200);
  expect(await json(r1)).toMatchObject({ ok: true, text: "OK", shared: true });
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["x-api-key"]).toBe(AI.key);
  expect((await json(await dj.get(`${APP}/api/ai/review`))).used).toBe(1);
  expect((await dj.post(`${APP}/api/ai/review`, { data: { test: true } })).status()).toBe(200);
  const third = await dj.post(`${APP}/api/ai/review`, { data: { test: true } });
  expect(third.status()).toBe(429);
  expect((await json(third)).error).toMatch(/used today's 2 reviews on the organiser's key/);
  // another DJ (another uid cookie) still has the allowance; a DJ with a key of their own is not counted
  const other = await playwright.request.newContext();
  expect((await other.post(`${APP}/api/ai/review`, { data: { test: true } })).status()).toBe(200);
  hits.length = 0;
  const own = await dj.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "anthropic", "x-ai-key": AI.key, "x-ai-workspace": "" },
  });
  expect(await json(own)).toMatchObject({ ok: true, shared: false });
  // "Tell the DJ" keeps working by keywords once the allowance is gone, and says so
  const refine = await json(
    await dj.post(`${APP}/api/ai/refine`, {
      data: { instruction: "more vals, make it feel like a rainy Tuesday in Rosario", options: {} },
    }),
  );
  expect(refine.source).toBe("keywords");
  expect(refine.note).toMatch(/Applied: .*vals/i);
  expect(refine.note).toMatch(/Could not apply: .*organiser's key is used up/);
  expectNoSecrets();
});

test("Anthropic workspace: x-ai-workspace is forwarded when set and absent when empty; the shared key can carry one too", async ({
  request,
}) => {
  const { cookie } = await unlock(request, PASSPHRASE, 10);
  const admin = { cookie: cookie! };
  hits.length = 0;
  const refused = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "anthropic", "x-ai-key": AI.orgKey, "x-ai-workspace": "" },
  });
  expect(refused.status()).toBe(400);
  expect((await json(refused)).error).toMatch(/not scoped to a workspace/);
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["anthropic-workspace-id"]).toBeUndefined();
  const withWs = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "anthropic", "x-ai-key": AI.orgKey, "x-ai-workspace": AI.workspace },
  });
  expect(withWs.status()).toBe(200);
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["anthropic-workspace-id"]).toBe(AI.workspace);
  // the shared key: the owner saves the organisation key with its workspace and Test forwards the header
  await request.put(`${APP}/api/admin/config`, {
    data: { ai: { provider: "anthropic", key: AI.orgKey, workspaceId: AI.workspace, dailyLimit: 20 } },
    headers: admin,
  });
  expect((await json(await request.get(`${APP}/api/admin/status`, { headers: admin }))).ai.hasWorkspace).toBe(
    true,
  );
  hits.length = 0;
  const t = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "ai" }, headers: admin }),
  );
  expect(t.ok).toBe(true);
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["anthropic-workspace-id"]).toBe(AI.workspace);
  // removed: keyless DJs are back to 401 and the public view says so
  await request.put(`${APP}/api/admin/config`, { data: { ai: { remove: true } }, headers: admin });
  expect((await request.post(`${APP}/api/ai/review`, { data: { test: true } })).status()).toBe(401);
  expect((await json(await request.get(`${APP}/api/admin/public`))).ai.shared).toBe(false);
  expectNoSecrets();
});

test("the pages: /admin People and AI groups, Settings shows the organiser's key and the workspace hint", async ({
  page,
}) => {
  page.on("response", (r) => {
    if (r.url().includes("/api/"))
      void r
        .text()
        .then((t) => bodies.push(t))
        .catch(() => {});
  });
  await page.setExtraHTTPHeaders(ip(11));
  await page.goto(`${APP}/admin`);
  await page.locator("#admin-secret").fill(PASSPHRASE);
  await page.locator("#admin-secret").press("Enter");
  await expect(page.locator("#admin-guide")).toHaveAttribute("href", /OWNER_GUIDE\.md/);
  await expect(page.locator("#admin-people")).toContainText("5 Spotify accounts");
  await expect(page.locator("#admin-seats-spotify")).toContainText("2 of 5 used");
  await expect(page.locator("#admin-seat-list-spotify")).toHaveValue(SEATS.join("\n"));
  await expect(page.locator("#admin-contact")).toHaveValue(OWNER);
  // a sixth e-mail turns the counter red and disables Save
  await page
    .locator("#admin-seat-list-spotify")
    .fill([...SEATS, "a@x.t", "b@x.t", "c@x.t", "d@x.t"].join("\n"));
  await expect(page.locator("#admin-seats-spotify")).toContainText("6 of 5 used");
  await expect(page.locator("#admin-seats-save-spotify")).toBeDisabled();
  // the shared key group: paste, save, test; the key never comes back
  await expect(page.locator("#admin-status-ai")).toContainText("Not configured");
  await page.locator("#admin-ai-key").fill(AI.key);
  await expect(page.locator("#admin-ai-key")).toHaveAttribute("type", "password");
  await page.locator("#admin-ai-save").click();
  await expect(page.locator("#admin-status-ai")).toContainText("Configured · …7Q2x · 20/day");
  await expect(page.locator("#admin-ai-key")).toHaveValue("");
  await page.locator("#admin-ai-test").click();
  await expect(page.getByTestId("admin-test-ai")).toContainText(
    "DJs without a key of their own now get reviews",
  );
  // Settings, as a DJ without a key: the organiser's key is in use, the personal fields fold away
  await page.goto(`${APP}/settings`);
  await expect(page.locator("#ai-status")).toContainText("Using the organiser's key · 0 of 20 today");
  await expect(page.locator("#ai-key")).toHaveCount(0);
  await page.locator("#ai-test").click();
  await expect(page.locator("#ai-status")).toContainText("1 of 20 today");
  await page.locator("#ai-own-key").click();
  await expect(page.locator("#ai-key")).toBeVisible();
  // an organisation-level Anthropic key without its workspace gets the friendly line, with it the test passes
  await page.locator("#ai-key").fill(AI.orgKey);
  await expect(page.locator("#ai-status")).toContainText("Key saved");
  await page.locator("#ai-test").click();
  await expect(page.getByRole("status").filter({ hasText: /workspace/ })).toContainText(
    "This key needs a workspace: paste its Workspace ID below or create the key inside a workspace",
  );
  await page.locator("#ai-workspace").fill(AI.workspace);
  hits.length = 0;
  await page.locator("#ai-test").click();
  await expect(page.getByTestId("test-icon-ok")).toBeVisible();
  expect(last(/POST \/anthropic\/v1\/messages/)!.headers["anthropic-workspace-id"]).toBe(AI.workspace);
  // tidy up for the suite: the personal key leaves the browser store
  await page.locator("#ai-key").fill("");
  await page.locator("#ai-workspace").fill("");
  expectNoSecrets();
  const html = await page.content();
  for (const s of SECRETS) expect(html).not.toContain(s);
});

/* ---------- round 8: connectivity audit fixes ---------- */

test("Google Test: only invalid_grant proves the secret; invalid_request (sent before the secret is checked) is reported as it is", async ({
  request,
}) => {
  const { cookie } = await unlock(request, PASSPHRASE, 12);
  const admin = { cookie: cookie! };
  await request.put(`${APP}/api/admin/config`, {
    data: { google: { clientId: GG.id, clientSecret: GG.malformed } },
    headers: admin,
  });
  const bad = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "google" }, headers: admin }),
  );
  expect(bad.ok).toBe(false);
  expect(bad.text).toMatch(/invalid_request/);
  await request.put(`${APP}/api/admin/config`, {
    data: { google: { clientId: GG.id, clientSecret: GG.secret } },
    headers: admin,
  });
  const ok = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "google" }, headers: admin }),
  );
  expect(ok).toEqual({ ok: true, text: expect.stringMatching(/Google accepted/) });
  await request.put(`${APP}/api/admin/config`, { data: { google: { remove: true } }, headers: admin });
  expectNoSecrets();
});

test("OpenAI gets max_completion_tokens (≥ 4000, never max_tokens); Gemini gets the key in x-goog-api-key, a current default model and maxOutputTokens ≥ 4000", async ({
  request,
  playwright,
}) => {
  hits.length = 0;
  const oa = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "openai", "x-ai-key": AI.openai, "x-ai-model": "" },
  });
  expect(oa.status()).toBe(200);
  expect(await json(oa)).toMatchObject({ ok: true, text: "OK", shared: false });
  const oaHit = last(/POST \/openai\/chat\/completions/)!;
  const oaBody = JSON.parse(oaHit.body);
  expect(oaBody.model).toBe("gpt-5.2");
  expect(oaBody.max_completion_tokens).toBeGreaterThanOrEqual(4000);
  expect(oaBody).not.toHaveProperty("max_tokens");
  expect(oaHit.headers.authorization).toBe(`Bearer ${AI.openai}`);
  const gm = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "gemini", "x-ai-key": AI.gemini, "x-ai-model": "" },
  });
  expect(gm.status()).toBe(200);
  expect(await json(gm)).toMatchObject({ ok: true, text: "OK" });
  const gmHit = last(/POST \/gemini\/models\//)!;
  expect(gmHit.url).toBe("/gemini/models/gemini-4-argon:generateContent");
  expect(gmHit.url).not.toContain("key=");
  expect(gmHit.headers["x-goog-api-key"]).toBe(AI.gemini);
  expect(JSON.parse(gmHit.body).generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(4000);
  // the owner's Test names the model it used
  const { cookie } = await unlock(await playwright.request.newContext(), PASSPHRASE, 13);
  const admin = { cookie: cookie! };
  await request.put(`${APP}/api/admin/config`, {
    data: { ai: { provider: "gemini", key: AI.gemini, model: "", dailyLimit: 20 } },
    headers: admin,
  });
  const t = await json(
    await request.post(`${APP}/api/admin/test`, { data: { provider: "ai" }, headers: admin }),
  );
  expect(t).toEqual({ ok: true, text: expect.stringMatching(/\(gemini-4-argon\) answered "OK"/) });
  expectNoSecrets();
});

test("a model that does not answer in time gets a DJ sentence (504), not a function timeout; a wrong key keeps the provider's words", async ({
  request,
}) => {
  const t0 = Date.now();
  const slow = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "anthropic", "x-ai-key": AI.slowKey },
  });
  expect(slow.status()).toBe(504);
  expect((await json(slow)).error).toBe("The model took too long; try again or ask a shorter question.");
  expect(Date.now() - t0).toBeLessThan(3500);
  const wrong = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-ai-provider": "openai", "x-ai-key": "sk-not-the-key" },
  });
  expect(wrong.status()).toBe(401);
  expect((await json(wrong)).error).toMatch(/Incorrect API key/);
  expectNoSecrets();
});

test("the shared key: another site's Origin is refused, and a caller who drops the cookie is still capped per address", async ({
  request,
  playwright,
}) => {
  const { cookie } = await unlock(request, PASSPHRASE, 14);
  const admin = { cookie: cookie! };
  await request.put(`${APP}/api/admin/config`, {
    data: { ai: { provider: "anthropic", key: AI.key, model: "", dailyLimit: 2 } },
    headers: admin,
  });
  hits.length = 0;
  const evil = await request.post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { origin: "https://evil.example" },
  });
  expect(evil.status()).toBe(403);
  const refine = await request.post(`${APP}/api/ai/refine`, {
    data: { instruction: "more vals" },
    headers: { origin: "https://evil.example" },
  });
  expect(refine.status()).toBe(403);
  expect(last(/POST \/anthropic\/v1\/messages/)).toBeUndefined();
  // no cookie → a fresh id each time, so the per-DJ cap alone would never bite; the address cap does (2 × 5)
  const addr = { "x-forwarded-for": "203.0.113.9, 10.0.0.77" };
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) {
    const fresh = await playwright.request.newContext();
    const r = await fresh.post(`${APP}/api/ai/review`, { data: { test: true }, headers: addr });
    statuses.push(r.status());
    await fresh.dispose();
  }
  expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
  expect(statuses[10]).toBe(429);
  // a spoofed first X-Forwarded-For element does not buy a new allowance: the appended address counts
  const spoof = await (await playwright.request.newContext()).post(`${APP}/api/ai/review`, {
    data: { test: true },
    headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.77" },
  });
  expect(spoof.status()).toBe(429);
  expect(hits.filter((h) => /POST \/anthropic\/v1\/messages/.test(`${h.method} ${h.url}`))).toHaveLength(10);
  await request.put(`${APP}/api/admin/config`, { data: { ai: { remove: true } }, headers: admin });
  expectNoSecrets();
});

test("the unlock limiter keys on the address CloudFront appended, not on a caller-chosen X-Forwarded-For element", async ({
  request,
}) => {
  for (let i = 0; i < 5; i++) {
    const r = await request.post(`${APP}/api/admin/unlock`, {
      data: { secret: `wrong-${i}` },
      headers: { "x-forwarded-for": `1.2.3.${i}, 10.0.0.60` },
    });
    expect(r.status()).toBe(401);
  }
  const sixth = await request.post(`${APP}/api/admin/unlock`, {
    data: { secret: PASSPHRASE },
    headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.60" },
  });
  expect(sixth.status()).toBe(429);
  expect((await json(sixth)).error).toMatch(/ten minutes/);
  // a cross-site page cannot even try
  const cross = await request.post(`${APP}/api/admin/unlock`, {
    data: { secret: PASSPHRASE },
    headers: { ...ip(61), origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  expectNoSecrets();
});

// last on purpose: it locks the whole deployment for an hour
test("twenty failures from anywhere lock the deployment for an hour (the counter lives in the config store)", async ({
  request,
}) => {
  let locked = false;
  for (let i = 0; i < 20 && !locked; i++) {
    const r = await request.post(`${APP}/api/admin/unlock`, {
      data: { secret: `global-wrong-${i}` },
      headers: ip(100 + i),
    });
    expect([401, 429]).toContain(r.status());
    if (r.status() === 429) locked = true;
  }
  const r = await request.post(`${APP}/api/admin/unlock`, { data: { secret: PASSPHRASE }, headers: ip(200) });
  expect(r.status()).toBe(429);
  expect((await json(r)).error).toMatch(/Too many failed unlocks on this deployment.*hour/);
  expect(cookieOf(setCookies(r), "tdj_admin")).toBeUndefined();
  // the counter is in the store, not in the page: the public view and the locked status say nothing about it
  const pub = JSON.stringify(await json(await request.get(`${APP}/api/admin/public`)));
  expect(pub).not.toMatch(/UNLOCK|failures/i);
  expectNoSecrets();
});
