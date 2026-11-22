import { beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, OPTIONS, PUT } from "@/app/api/sync/route";
import { formatCode } from "@/lib/sync/code";
import { deriveKeys, open, recordId, seal } from "@/lib/sync/crypto";
import { type Item, SyncEngine, type Transport } from "@/lib/sync/engine";
import {
  memoryStore,
  readSpace,
  resetSyncRateLimits,
  SYNC_LIMITS,
  spaceKey,
  syncStore,
  writeSpace,
} from "./sync";

const CODE = formatCode("abcdefghjkmnpqrstvwxyz0123");
const URL0 = "http://localhost/api/sync";
let ip = 0;
/** each test from its own address, so the per-address limit of one test does not reach the next */
const headers = (id: string, extra: Record<string, string> = {}) => ({
  "x-tdj-sync-id": id,
  "x-tdj-device": "device-one",
  "x-forwarded-for": `10.0.0.${ip}`,
  ...extra,
});
const put = (id: string, records: unknown, extra: Record<string, string> = {}) =>
  PUT(new Request(URL0, { method: "PUT", headers: headers(id, extra), body: JSON.stringify({ records }) }));
const get = (id: string, since = 0) => GET(new Request(`${URL0}?since=${since}`, { headers: headers(id) }));

beforeEach(() => {
  ip++;
  resetSyncRateLimits();
  delete process.env.TDJ_DB_TABLE;
});

describe("/api/sync", () => {
  it("stores ciphertext only, under a hash of the id, and gives it back by version", async () => {
    const k = await deriveKeys(CODE);
    const rid = await recordId(k, "night:n1");
    const blob = await seal(k, { k: "night:n1", f: { title: { v: "Saturday at Sunderland", c: "1" } } }, rid);
    const r = await put(k.id, [{ rid, blob }]);
    expect(r.status).toBe(200);
    expect((await r.json()).version).toBe(1);

    // what the server holds: no code, no id, no title; the space is keyed by a hash of the id
    const mem = (syncStore() as ReturnType<typeof memoryStore>).mem;
    const dump = JSON.stringify({ m: [...mem.manifests], r: [...mem.records] });
    expect(dump).not.toContain("Saturday");
    expect(dump).not.toContain("Sunderland");
    expect(dump).not.toContain(k.id);
    expect(dump).not.toContain(CODE.slice(6));
    expect(mem.manifests.has(spaceKey(k.id))).toBe(true);

    const g = await (await get(k.id)).json();
    expect(g.version).toBe(1);
    expect(g.records).toEqual([{ rid, blob }]);
    expect(Object.keys(g.devices)).toEqual(["device-one"]);
    expect(await open(k, g.records[0].blob, rid)).toMatchObject({ k: "night:n1" });
    // nothing after version 1
    expect((await (await get(k.id, 1)).json()).records).toEqual([]);
  });

  it("refuses plaintext, malformed ids and oversize records", async () => {
    const k = await deriveKeys(CODE);
    const rid = await recordId(k, "settings");
    expect((await put(k.id, [{ rid, blob: '{"theme":"dark"}' }])).status).toBe(400);
    expect((await put(k.id, [{ rid, blob: "aGVsbG8gd29ybGQgaGVsbG8gd29ybGQgaGVsbG8gd29ybGQ" }])).status).toBe(
      400,
    );
    expect((await put("short", [{ rid, blob: await seal(k, 1, rid) }])).status).toBe(400);
    expect((await put(k.id, [{ rid: "../../etc", blob: await seal(k, 1, rid) }])).status).toBe(400);
    const big = await seal(k, "x", rid);
    const huge = `${big.slice(0, 4)}${"A".repeat(SYNC_LIMITS.blobChars)}`;
    expect((await put(k.id, [{ rid, blob: huge }])).status).toBe(413);
    const many = await Promise.all(
      Array.from({ length: SYNC_LIMITS.perPut + 1 }, async (_, i) => {
        const r = await recordId(k, `night:${i}`);
        return { rid: r, blob: await seal(k, i, r) };
      }),
    );
    expect((await put(k.id, many)).status).toBe(413);
    const body = "x".repeat(SYNC_LIMITS.bodyBytes + 1);
    const r = await PUT(new Request(URL0, { method: "PUT", headers: headers(k.id), body }));
    expect(r.status).toBe(413);
  });

  it("rate-limits one address, and writes to one space", async () => {
    const k = await deriveKeys(CODE);
    let last = 0;
    for (let i = 0; i <= SYNC_LIMITS.perMinute; i++) last = (await get(k.id)).status;
    expect(last).toBe(429);
    resetSyncRateLimits();
    const rid = await recordId(k, "memory");
    const blob = await seal(k, 1, rid);
    for (let i = 0; i < SYNC_LIMITS.writesPerMinute; i++) {
      ip++; // other addresses: the space's own limit
      expect((await put(k.id, [{ rid, blob }])).status).toBe(200);
    }
    ip++;
    expect((await put(k.id, [{ rid, blob }])).status).toBe(429);
  });

  it("answers any origin without credentials (the apps), and DELETE drops the space", async () => {
    const pre = OPTIONS();
    expect(pre.headers.get("access-control-allow-headers")).toContain("x-tdj-sync-id");
    const k = await deriveKeys(CODE);
    const rid = await recordId(k, "memory");
    await put(k.id, [{ rid, blob: await seal(k, 1, rid) }]);
    const d = await DELETE(new Request(URL0, { method: "DELETE", headers: headers(k.id) }));
    expect(d.status).toBe(200);
    // a reset space answers "replaced" to a device still on the old code, which cannot refill it
    expect((await get(k.id)).status).toBe(410);
    expect((await put(k.id, [{ rid, blob: await seal(k, 2, rid) }])).status).toBe(410);
    const mem = (syncStore() as ReturnType<typeof memoryStore>).mem;
    expect([...mem.records.keys()].some((x) => x.startsWith(spaceKey(k.id)))).toBe(false);
  });
});

describe("sync store semantics", () => {
  it("paging and a write still landing never skip a record", async () => {
    const store = memoryStore();
    const items = Array.from({ length: 70 }, (_, i) => ({
      rid: `r${String(i).padStart(21, "0")}`,
      blob: "x",
    }));
    for (let i = 0; i < items.length; i += 10) await writeSpace(store, "s", items.slice(i, i + 10), null);
    const p1 = await readSpace(store, "s", 0);
    expect(p1.records).toHaveLength(SYNC_LIMITS.perGet);
    expect(p1.more).toBe(true);
    const p2 = await readSpace(store, "s", p1.version);
    expect(p1.records.length + p2.records.length).toBe(70);
    // a claimed version whose record has not landed: the cursor stops before it
    const m = (await store.manifest("s"))!;
    m.ver += 1;
    m.recs.pending00000000000000a = [m.ver, 1, Date.now()];
    await store.claim("s", m.ver - 1, m);
    const p3 = await readSpace(store, "s", p2.version);
    expect(p3.version).toBe(m.ver - 1);
  });
});

/** the engine against the real route: a transport as the app's (lib/sync/transports.ts), over GET/PUT */
function routeTransport(id: string, device: string): Transport {
  return {
    name: "server",
    async pull(cursor) {
      const r = await GET(
        new Request(`${URL0}?since=${cursor ?? 0}`, { headers: { ...headers(id), "x-tdj-device": device } }),
      );
      const j = await r.json();
      return { items: j.records as Item[], cursor: String(j.version), devices: j.devices };
    },
    async push(items) {
      const r = await put(id, items, { "x-tdj-device": device });
      if (r.status !== 200) throw new Error(String(r.status));
    },
  };
}

describe("two devices through the route", () => {
  it("converge on nights, settings and devices", async () => {
    const k = await deriveKeys(formatCode("zyxwvtsrqpnmkjhgfedcba9876"));
    const mk = () => {
      const d = {
        lib: {
          history: [],
          memory: { notes: [], feedbackHistory: [], sets: [], preferences: {} },
          settings: {},
          overrides: {},
        } as never as import("@/lib/sync/library").Library,
        read: () => d.lib,
        write: (p: Partial<import("@/lib/sync/library").Library>) => {
          d.lib = { ...d.lib, ...p };
        },
      };
      return d;
    };
    const persist = () => {
      const m = new Map<string, unknown>();
      return {
        get: async (x: string) => m.get(x) as never,
        set: async (x: string, v: unknown) => void m.set(x, v),
        del: async (x: string) => void m.delete(x),
      };
    };
    const a = mk();
    const b = mk();
    const ea = new SyncEngine(
      k,
      { id: "devAAAAA", name: "iPad", platform: "ipados" },
      a,
      [routeTransport(k.id, "devAAAAA")],
      persist(),
    );
    const eb = new SyncEngine(
      k,
      { id: "devBBBBB", name: "Mac", platform: "macos" },
      b,
      [routeTransport(k.id, "devBBBBB")],
      persist(),
    );
    a.lib = {
      ...a.lib,
      history: [
        {
          id: "n1",
          createdAt: "2026-11-18T20:00:00Z",
          title: "Friday",
          options: {},
          playlist: { tandas: [] },
          score: 1,
          source: "import",
        } as never,
      ],
      settings: { theme: "dark" } as never,
    };
    await ea.sync();
    await eb.sync();
    expect(b.lib.history.map((h) => [h.title, h.source])).toEqual([["Friday", "import"]]);
    expect(b.lib.settings.theme).toBe("dark");
    await ea.sync();
    expect(
      ea
        .devices()
        .map((d) => d.name)
        .sort(),
    ).toEqual(["Mac", "iPad"]);
  });
});
