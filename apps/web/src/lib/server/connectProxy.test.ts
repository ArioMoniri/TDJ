import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-11 — Pipedream Connect, server side, against a mocked Pipedream: the token route mints a Connect token for the
 * anonymous `tdj_uid` id (never an e-mail), the proxy route sends one call with the DJ's connected account through
 * Pipedream's REST proxy, only to that app's own API, and both are off without the PIPEDREAM_* settings.
 */
const sdk = vi.hoisted(() => ({
  tokens: [] as Array<Record<string, unknown>>,
  accounts: [] as Array<Record<string, unknown>>,
  constructed: [] as Array<Record<string, unknown>>,
}));
vi.mock("@pipedream/sdk", () => ({
  PipedreamClient: class {
    constructor(o: Record<string, unknown>) {
      sdk.constructed.push(o);
    }
    rawAccessToken = Promise.resolve("pd-fake-access");
    tokens = {
      create: async (o: Record<string, unknown>) => {
        sdk.tokens.push(o);
        return {
          token: "ctok_fake",
          expiresAt: "2026-11-22T12:00:00Z",
          connectLinkUrl: "https://pipedream.com/_static/connect.html?token=ctok_fake",
        };
      },
    };
    accounts = {
      list: async (o: { externalUserId: string }) => ({
        data: sdk.accounts.filter((a) => a.uid === o.externalUserId),
      }),
    };
  },
}));

const ORIGIN = "http://127.0.0.1:3000";
const ENV = {
  PIPEDREAM_PROJECT_ID: "proj_fake",
  PIPEDREAM_CLIENT_ID: "fake-client",
  PIPEDREAM_CLIENT_SECRET: "fake-secret-value",
  PIPEDREAM_API_URL: "https://pd.test",
  TDJ_SECRET: "test-uid-secret",
  TDJ_CONFIG_BACKEND: "memory",
};
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});
beforeEach(() => {
  sdk.tokens.length = 0;
  sdk.accounts.length = 0;
});

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
/** a signed `tdj_uid` cookie: the one the server hands out on a first visit */
async function cookie(): Promise<{ cookie: string; id: string }> {
  const { userFromRequest } = await import("./db");
  const u = await userFromRequest(new Request(ORIGIN));
  const c = (u.setCookie ?? "").split(";")[0] ?? "";
  return { cookie: c, id: u.id };
}

describe("Pipedream Connect: token", () => {
  it("mints a token for the anonymous id, for this origin, with the app in the Connect Link", async () => {
    const { POST } = await import("@/app/api/connect/token/route");
    const me = await cookie();
    const r = await POST(post("/api/connect/token", { app: "spotify" }, me.cookie));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { connect_link_url: string; token: string };
    expect(new URL(j.connect_link_url).searchParams.get("app")).toBe("spotify");
    expect(sdk.tokens[0]).toMatchObject({ externalUserId: me.id, allowedOrigins: [ORIGIN] });
    // a random id, never an e-mail
    expect(String(sdk.tokens[0]?.externalUserId)).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(JSON.stringify(j)).not.toContain(ENV.PIPEDREAM_CLIENT_SECRET);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses another site's page", async () => {
    const { POST } = await import("@/app/api/connect/token/route");
    const r = await POST(
      new Request(`${ORIGIN}/api/connect/token`, {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(r.status).toBe(403);
  });
});

describe("Pipedream Connect: proxy", () => {
  it("sends the call through Pipedream's proxy with the DJ's account, and answers with the provider's reply", async () => {
    const { POST } = await import("@/app/api/connect/proxy/route");
    const me = await cookie();
    sdk.accounts.push({ uid: me.id, id: "apn_fake", app: { nameSlug: "spotify" }, healthy: true });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        calls.push({ url: String(u), init });
        return new Response(JSON.stringify({ id: "pl1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const r = await POST(
      post(
        "/api/connect/proxy",
        {
          app: "spotify",
          method: "post",
          url: "https://api.spotify.com/v1/me/playlists",
          body: { name: "Milonga" },
        },
        me.cookie,
      ),
    );
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: "pl1" });
    expect(r.headers.get("x-tdj-via")).toBe("pipedream");
    const call = calls[0]!;
    const u = new URL(call.url);
    expect(u.origin).toBe("https://pd.test");
    expect(u.pathname).toBe(
      `/v1/connect/proj_fake/proxy/${Buffer.from("https://api.spotify.com/v1/me/playlists").toString("base64url")}`,
    );
    expect(u.searchParams.get("external_user_id")).toBe(me.id);
    expect(u.searchParams.get("account_id")).toBe("apn_fake");
    const h = call.init?.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer pd-fake-access");
    expect(h["x-pd-environment"]).toBe("development");
    expect(h["x-pd-proxy-content-type"]).toBe("application/json");
    expect(call.init?.body).toBe(JSON.stringify({ name: "Milonga" }));
  });
  it("only that app's own API: anything else never reaches Pipedream", async () => {
    const { POST } = await import("@/app/api/connect/proxy/route");
    const me = await cookie();
    sdk.accounts.push({ uid: me.id, id: "apn_fake", app: { nameSlug: "spotify" }, healthy: true });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const url of [
      "https://evil.example/v1/me",
      "https://www.googleapis.com/youtube/v3/search",
      "http://api.spotify.com/v1/me",
      "https://user:pw@api.spotify.com/v1/me",
    ]) {
      const r = await POST(post("/api/connect/proxy", { app: "spotify", url }, me.cookie));
      expect(r.status).toBe(400);
    }
    const bad = await POST(
      post(
        "/api/connect/proxy",
        { app: "spotify", method: "TRACE", url: "https://api.spotify.com/v1/me" },
        me.cookie,
      ),
    );
    expect(bad.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it("not connected yet: 409 with the app, so Settings offers the one-tap connect", async () => {
    const { POST } = await import("@/app/api/connect/proxy/route");
    const me = await cookie();
    vi.stubGlobal("fetch", vi.fn());
    const r = await POST(
      post(
        "/api/connect/proxy",
        { app: "dropbox", url: "https://api.dropboxapi.com/2/users/get_current_account" },
        me.cookie,
      ),
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "not_connected", app: "dropbox" });
    // a first visit (no cookie yet) has no accounts either
    const fresh = await POST(
      post("/api/connect/proxy", { app: "dropbox", url: "https://api.dropboxapi.com/2/x" }),
    );
    expect(fresh.status).toBe(409);
  });
  it("off without the PIPEDREAM_* settings", async () => {
    const { POST } = await import("@/app/api/connect/proxy/route");
    const { POST: token } = await import("@/app/api/connect/token/route");
    const { GET: accounts } = await import("@/app/api/connect/accounts/route");
    const keep = process.env.PIPEDREAM_CLIENT_SECRET;
    delete process.env.PIPEDREAM_CLIENT_SECRET;
    try {
      expect(
        (await POST(post("/api/connect/proxy", { app: "spotify", url: "https://api.spotify.com/v1/me" })))
          .status,
      ).toBe(404);
      expect((await token(post("/api/connect/token", {}))).status).toBe(404);
      expect(await (await accounts(new Request(`${ORIGIN}/api/connect/accounts`))).json()).toMatchObject({
        enabled: false,
      });
    } finally {
      process.env.PIPEDREAM_CLIENT_SECRET = keep;
    }
  });
});
