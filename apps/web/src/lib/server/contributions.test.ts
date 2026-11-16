/**
 * 2026-11 — owner contributions and per-user isolation, as security invariants of the real route handlers:
 *   - only the owner session (sealed `tdj_admin` cookie) may contribute: anyone else gets 401 before the body is read,
 *     a forged or expired cookie too, and a request from another origin gets 403;
 *   - oversized, malformed, non-JSON and secret-carrying payloads are refused; a burst is rate-limited;
 *   - contributions land in the owner partition (`owner#contrib#…`), never in a DJ's row, and GET answers counts only;
 *   - one DJ's database (`user#<signed id>`) never appears in another DJ's answer, and a forged id reads nothing.
 * The table is the in-memory DocumentClient of test/fakeDynamo.ts, behind the AWS SDK module names db.ts loads.
 */
import { CONTRIB_LIMITS } from "@tdj/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDynamo } from "../../../test/fakeDynamo";

let fake = fakeDynamo({ maxDelayMs: 0 });
vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: (c: unknown) => fake.doc.send(c) }) },
  GetCommand: fake.doc.Get,
  PutCommand: fake.doc.Put,
  UpdateCommand: fake.doc.Update,
  DeleteCommand: fake.doc.Delete,
}));

process.env.TDJ_CONFIG_BACKEND = "memory";
process.env.TDJ_COOKIE_SECRET = "test-cookie-secret-for-contributions-0123456789";
process.env.TDJ_SECRET = "test-uid-secret-0123456789";
const contrib = await import("@/app/api/owner/contributions/route");
const dbRoute = await import("@/app/api/db/route");
const { adminCookie } = await import("./admin");
const { resetContributionLimits, resetContributionMemory, CONTRIB_PREFIX, CONTRIB_INDEX } = await import(
  "./contributions"
);
const { seal } = await import("./cookies");

const ORIGIN = "http://localhost:3000";
const cookiePart = (setCookie: string) => setCookie.split(";")[0]!;
let owner = "";
beforeAll(async () => {
  owner = cookiePart(await adminCookie(ORIGIN));
});
afterAll(() => {
  delete process.env.TDJ_DB_TABLE;
});

const AT = "2026-11-16T10:00:00.000Z";
const goodBatch = (n = 1) => ({
  v: 1,
  source: "web",
  items: Array.from({ length: n }, (_, i) => ({ kind: "song", id: `s${i}`, value: { year: 1938 }, at: AT })),
});
function post(body: unknown, o: { cookie?: string; origin?: string; type?: string; raw?: string } = {}) {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    "content-type": o.type ?? "application/json",
    "x-forwarded-for": "203.0.113.7",
  };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.origin) headers.origin = o.origin;
  return contrib.POST(
    new Request(`${ORIGIN}/api/owner/contributions`, {
      method: "POST",
      headers,
      body: o.raw ?? JSON.stringify(body),
    }),
  );
}
const get = (cookie?: string) =>
  contrib.GET(
    new Request(`${ORIGIN}/api/owner/contributions`, {
      headers: { host: "localhost:3000", ...(cookie ? { cookie } : {}) },
    }),
  );

for (const kind of ["dynamo", "memory"] as const)
  describe(`owner contributions (${kind})`, () => {
    beforeEach(() => {
      fake = fakeDynamo({ maxDelayMs: 0 });
      resetContributionLimits();
      resetContributionMemory();
      if (kind === "dynamo") process.env.TDJ_DB_TABLE = "tdj-test";
      else delete process.env.TDJ_DB_TABLE;
    });

    it("a non-owner POST is refused with 401 and nothing is stored", async () => {
      for (const cookie of [undefined, "tdj_admin=garbage", "tdj_uid=abc.def"]) {
        const r = await post(goodBatch(), { cookie });
        expect(r.status).toBe(401);
        expect((await r.json()).owner).toBe(false);
      }
      expect(fake.table.size).toBe(0);
      expect((await get()).status).toBe(401);
    });

    it("an expired or forged owner session is refused", async () => {
      const expired = `tdj_admin=${encodeURIComponent(await seal({ admin: true, exp: Date.now() - 1000 }))}`;
      expect((await post(goodBatch(), { cookie: expired })).status).toBe(401);
      const notAdmin = `tdj_admin=${encodeURIComponent(await seal({ admin: false, exp: Date.now() + 9e6 }))}`;
      expect((await post(goodBatch(), { cookie: notAdmin })).status).toBe(401);
    });

    it("another site's page is refused with 403 even with the owner's cookie", async () => {
      const r = await post(goodBatch(), { cookie: owner, origin: "https://evil.example" });
      expect(r.status).toBe(403);
    });

    it("oversized, malformed, non-JSON and secret-carrying payloads are refused", async () => {
      const huge = "x".repeat(CONTRIB_LIMITS.bodyBytes + 1);
      expect((await post(null, { cookie: owner, raw: huge })).status).toBe(413);
      expect((await post(null, { cookie: owner, raw: "{not json" })).status).toBe(400);
      expect((await post(goodBatch(), { cookie: owner, type: "text/plain" })).status).toBe(415);
      expect(
        (await post({ v: 1, items: [{ kind: "connectors", id: "x", value: {}, at: AT }] }, { cookie: owner }))
          .status,
      ).toBe(400);
      expect((await post(goodBatch(CONTRIB_LIMITS.items + 1), { cookie: owner })).status).toBe(400);
      const secret = {
        v: 1,
        items: [
          {
            kind: "song",
            id: "s1",
            value: { year: 1938, title: "sk-ant-api03-abcdefghijklmnopqrstu" },
            at: AT,
          },
        ],
      };
      const r = await post(secret, { cookie: owner });
      expect(r.status).toBe(400);
      expect(JSON.stringify(fake.table.size ? [...fake.table.values()] : [])).not.toContain("sk-ant");
      expect(fake.table.size).toBe(0);
    });

    it("the owner's batch lands in the owner partition; GET answers counts, never content", async () => {
      const r = await post(goodBatch(3), { cookie: owner });
      expect(r.status).toBe(202);
      const j = await r.json();
      expect(j).toMatchObject({ ok: true, items: 3, pending: 1 });
      if (kind === "dynamo") {
        const keys = [...fake.table.keys()];
        expect(keys.every((k) => k.startsWith(CONTRIB_PREFIX))).toBe(true);
        expect(keys).toContain(CONTRIB_INDEX);
        const row = fake.table.get(`${CONTRIB_PREFIX}${j.id}`)!;
        expect(row.status).toBe("pending");
        expect(JSON.parse(row.body as string)).toHaveLength(3);
        expect(fake.table.get(CONTRIB_INDEX)!.pending).toEqual(new Set([j.id]));
      }
      const s = await get(owner);
      expect(s.status).toBe(200);
      const body = await s.text();
      expect(JSON.parse(body)).toMatchObject({ owner: true, pending: 1 });
      expect(body).not.toContain("1938");
    });

    it("a burst from one client is rate-limited", async () => {
      const codes: number[] = [];
      for (let i = 0; i < 32; i++) codes.push((await post(goodBatch(), { cookie: owner })).status);
      expect(codes.slice(0, 30).every((c) => c === 202)).toBe(true);
      expect(codes.slice(30)).toEqual([429, 429]);
    });
  });

describe("per-user database rows (/api/db)", () => {
  beforeEach(() => {
    fake = fakeDynamo({ maxDelayMs: 0 });
    process.env.TDJ_DB_TABLE = "tdj-test";
  });
  const dbReq = (method: "GET" | "PUT", cookie?: string, body?: unknown) =>
    new Request(`${ORIGIN}/api/db`, {
      method,
      headers: {
        host: "localhost:3000",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  /** a fresh DJ: the signed id the server mints on the first request */
  async function newDj(): Promise<string> {
    const r = await dbRoute.GET(dbReq("GET"));
    return cookiePart(r.headers.get("set-cookie")!);
  }

  it("one DJ's database never appears in another DJ's answer", async () => {
    const a = await newDj();
    const b = await newDj();
    expect(a).not.toBe(b);
    const put = await dbRoute.PUT(
      dbReq("PUT", a, { overrides: { songs: { s1: { year: 1931, album: "A-only-marker" } } } }),
    );
    expect(put.status).toBe(200);
    const mine = await (await dbRoute.GET(dbReq("GET", a))).text();
    expect(mine).toContain("A-only-marker");
    const theirs = await (await dbRoute.GET(dbReq("GET", b))).text();
    expect(theirs).not.toContain("A-only-marker");
    // no cookie, a tampered signature and A's id with B's signature all read a fresh, empty row
    const [idA] = decodeURIComponent(a.split("=")[1]!).split(".");
    const [, sigB] = decodeURIComponent(b.split("=")[1]!).split(".");
    for (const cookie of [
      undefined,
      `tdj_uid=${idA}.forged`,
      `tdj_uid=${encodeURIComponent(`${idA}.${sigB}`)}`,
    ]) {
      const r = await dbRoute.GET(dbReq("GET", cookie));
      expect(await r.text()).not.toContain("A-only-marker");
    }
    // the DJ rows and the owner partition never share a key
    expect([...fake.table.keys()].every((k) => k.startsWith("user#"))).toBe(true);
  });

  it("a DJ's database write never reaches the owner partition or the shared catalogue", async () => {
    const a = await newDj();
    await dbRoute.PUT(dbReq("PUT", a, { overrides: { songs: { s1: { year: 1931 } } } }));
    expect([...fake.table.keys()].some((k) => k.startsWith(CONTRIB_PREFIX))).toBe(false);
    // the DJ's cookie is not an owner session
    expect((await post(goodBatch(), { cookie: a })).status).toBe(401);
  });
});
