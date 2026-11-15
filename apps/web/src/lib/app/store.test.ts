import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { appDeps } from "./deps";
import type { HostCalls } from "./host";
import { dispatch } from "./routes";
import { DeviceStore, MIGRATIONS, migrate, type SqlDriver, schemaVersion } from "./store";

/** SQLite in memory with the same calls the app makes through tauri-plugin-sql (`execute`, `select`, `?` params). */
function sqlite(): SqlDriver & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    execute: async (sql, params = []) => {
      const r = raw.prepare(sql).run(...(params as never[]));
      return { rowsAffected: Number(r.changes) };
    },
    select: async <T>(sql: string, params: unknown[] = []) =>
      raw.prepare(sql).all(...(params as never[])) as T[],
  };
}
const tables = (d: DatabaseSync) =>
  (
    d.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all() as Array<{
      name: string;
    }>
  ).map((r) => r.name);

describe("on-device database migrations", () => {
  it("versions are unique, start at 1, increase by one and are named", () => {
    MIGRATIONS.forEach((m, i) => {
      expect(m.version).toBe(i + 1);
      expect(m.name).toMatch(/\w/);
      expect(m.up.length).toBeGreaterThan(0);
    });
  });

  it("a new database gets every migration, in order, recorded once", async () => {
    const db = sqlite();
    expect(await schemaVersion(db)).toBe(0);
    const applied = await migrate(db);
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version);
    const t = tables(db.raw);
    for (const name of ["settings", "documents", "history", "rooms_log", "media_cache", "schema_migrations"])
      expect(t).toContain(name);
    const rows = await db.select<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(rows.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it("running again applies nothing (every launch calls migrate)", async () => {
    const db = sqlite();
    await migrate(db);
    expect(await migrate(db)).toEqual([]);
  });

  it("an older database is brought forward from its own version only", async () => {
    const db = sqlite();
    await migrate(db, MIGRATIONS.slice(0, 1));
    expect(await schemaVersion(db)).toBe(1);
    await db.execute("INSERT INTO documents (name, value, updated_at) VALUES (?, ?, ?)", [
      "overrides",
      "{}",
      "x",
    ]);
    expect(await migrate(db)).toEqual(MIGRATIONS.slice(1).map((m) => m.version));
    // data written under version 1 survives
    expect((await db.select("SELECT name FROM documents")).length).toBe(1);
  });

  it("a failing migration stops there: its version and later ones are not recorded", async () => {
    const db = sqlite();
    const broken = [
      ...MIGRATIONS.slice(0, 1),
      { version: 2, name: "broken", up: ["CREATE TABLE nope (", "SELECT 1"] },
      { version: 3, name: "after", up: ["CREATE TABLE after_broken (x)"] },
    ];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await schemaVersion(db)).toBe(1);
    expect(tables(db.raw)).not.toContain("after_broken");
  });

  it("refuses migrations out of order", async () => {
    const db = sqlite();
    await expect(
      migrate(db, [
        { version: 2, name: "b", up: ["SELECT 1"] },
        { version: 1, name: "a", up: ["SELECT 1"] },
      ]),
    ).rejects.toThrow(/order/);
  });
});

describe("/api/db on the device", () => {
  const deps = () => {
    const db = sqlite();
    const host = {
      sql: async (op: "execute" | "select", q: string, p: unknown[]) =>
        op === "select" ? db.select(q, p) : db.execute(q, p),
      linked: async () => false,
    } as unknown as HostCalls;
    return appDeps({}, host);
  };
  const call = (d: ReturnType<typeof deps>, method: string, body?: unknown) =>
    dispatch(
      new Request("http://app/api/db", {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      d,
    ).then((r) => r.json());

  it("answers like a server row: enabled, and the device as where it lives", async () => {
    const d = deps();
    expect(await call(d, "GET")).toEqual({
      enabled: true,
      mode: "server",
      storage: "device",
      overrides: {},
      memory: null,
      history: [],
    });
  });

  it("a write keeps the parts it does not name, never stores connector URLs, and is migrated first", async () => {
    const d = deps();
    await call(d, "PUT", {
      overrides: { songs: { a: { year: 1940 } }, connectors: { webhookUrl: "https://h" } },
    });
    await call(d, "PUT", { memory: { notes: [] } });
    await call(d, "PUT", { history: [{ id: "n1", createdAt: "2026-11-14T20:00:00Z" }] });
    const j = await call(d, "GET");
    expect(j.overrides.songs).toEqual({ a: { year: 1940 } });
    expect(j.overrides.connectors).toBeUndefined();
    expect(typeof j.overrides.updatedAt).toBe("string");
    expect(j.memory).toEqual({ notes: [] });
    expect(j.history.map((h: { id: string }) => h.id)).toEqual(["n1"]);
  });
});

describe("device store", () => {
  const ready = async () => {
    const db = sqlite();
    await migrate(db);
    return new DeviceStore(db);
  };

  it("documents (overrides, learned preferences) round-trip and replace", async () => {
    const s = await ready();
    expect(await s.getDoc("overrides")).toBeNull();
    await s.putDoc("overrides", { songs: { a: { year: 1941 } } });
    await s.putDoc("overrides", { songs: { b: { year: 1942 } } });
    expect(await s.getDoc("overrides")).toEqual({ songs: { b: { year: 1942 } } });
    await s.putDoc("memory", { notes: [{ text: "likes Di Sarli" }] });
    expect(await s.getDoc("memory")).toEqual({ notes: [{ text: "likes Di Sarli" }] });
  });

  it("history keeps the snapshots in the order given (newest first) and replaces the list", async () => {
    const s = await ready();
    await s.putHistory([
      { id: "b", createdAt: "2026-11-02T20:00:00Z", name: "Two" },
      { id: "a", createdAt: "2026-11-01T20:00:00Z", name: "One" },
    ]);
    expect((await s.getHistory()).map((h) => h.id)).toEqual(["b", "a"]);
    await s.putHistory([{ id: "c", createdAt: "2026-11-03T20:00:00Z", name: "Three" }]);
    expect((await s.getHistory()).map((h) => h.id)).toEqual(["c"]);
  });

  it("settings, cached stream ids/BPM/artwork and the rooms log", async () => {
    const s = await ready();
    await s.putSetting("ui", { theme: "dark" });
    expect(await s.getSetting("ui")).toEqual({ theme: "dark" });
    await s.putMedia({
      songId: "s1",
      provider: "deezer",
      streamId: "123",
      bpm: 118.5,
      artwork: "https://x/a.jpg",
    });
    await s.putMedia({ songId: "s1", provider: "deezer", streamId: "124", bpm: null, artwork: null });
    expect(await s.getMedia("s1")).toEqual([
      expect.objectContaining({
        songId: "s1",
        provider: "deezer",
        streamId: "124",
        bpm: null,
        artwork: null,
      }),
    ]);
    await s.logRoomOp("room-1", { op: "swap", tanda: 3 });
    await s.logRoomOp("room-1", { op: "pin", tanda: 4 });
    expect((await s.roomLog("room-1")).map((r) => r.op)).toEqual([
      { op: "swap", tanda: 3 },
      { op: "pin", tanda: 4 },
    ]);
  });
});
