import { emptyMemory } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { HISTORY_MAX } from "@/lib/types";
import { formatCode } from "./code";
import { deriveKeys } from "./crypto";
import { type Item, type LocalSide, type Persist, SyncEngine, type Transport } from "./engine";
import { HISTORY_LIMIT, type Night as HistorySnapshot, type Library } from "./library";
import { Clock, deleteRec, isLive, mergeRec, type Rec, stable, valuesOf, writeFields } from "./merge";

const CODE = formatCode("tdjtdjtdjtdjtdjtdjtdjtdjtd");

it("the sync core keeps as many nights as History does", () => expect(HISTORY_LIMIT).toBe(HISTORY_MAX));

/* ---------- the record merge ---------- */

const clockAt = (node: string, t: { ms: number }) => new Clock(node, () => t.ms);

describe("hybrid logical clock", () => {
  it("stamps grow on one device even when the wall clock stands still or goes back", () => {
    const t = { ms: 1000 };
    const c = clockAt("a", t);
    const a = c.tick();
    const b = c.tick();
    t.ms = 500;
    const d = c.tick();
    expect(a < b && b < d).toBe(true);
  });
  it("a write made after reading another device's write sorts after it, even with a slow clock", () => {
    const fast = clockAt("fast", { ms: 10_000 });
    const slow = clockAt("slow", { ms: 1_000 });
    const remote = fast.tick();
    slow.observe(remote);
    expect(slow.tick() > remote).toBe(true);
  });
});

describe("merge", () => {
  const t = { ms: 1 };
  const A = clockAt("a", t);
  const B = clockAt("b", t);
  const base = writeFields(undefined, "night:1", { title: "Saturday milonga", score: 80 }, A);

  it("concurrent edits of different fields both survive", () => {
    t.ms = 10;
    const a = writeFields(base, "night:1", { title: "Sábado" }, A);
    const b = writeFields(base, "night:1", { score: 91 }, B);
    expect(valuesOf(mergeRec(a, b)!)).toEqual({ title: "Sábado", score: 91 });
  });

  it("concurrent edits of one field: the later stamp wins, the same on both devices", () => {
    t.ms = 20;
    const a = writeFields(base, "night:1", { title: "A's name" }, A);
    t.ms = 21;
    const b = writeFields(base, "night:1", { title: "B's name" }, B);
    expect(valuesOf(mergeRec(a, b)!).title).toBe("B's name");
    expect(stable(mergeRec(a, b))).toBe(stable(mergeRec(b, a)));
    // same wall time: the node id decides, deterministically
    t.ms = 30;
    const a2 = writeFields(base, "night:1", { title: "x" }, clockAt("a", t));
    const b2 = writeFields(base, "night:1", { title: "y" }, clockAt("b", t));
    expect(stable(mergeRec(a2, b2))).toBe(stable(mergeRec(b2, a2)));
    expect(valuesOf(mergeRec(a2, b2)!).title).toBe("y");
  });

  it("delete vs rename: the later of the two wins, and the night is never gone from the log", () => {
    t.ms = 40;
    const deleted = deleteRec(base, A);
    t.ms = 41;
    const renamed = writeFields(base, "night:1", { title: "Renamed after" }, B);
    const m = mergeRec(deleted, renamed)!;
    expect(isLive(m)).toBe(true);
    expect(valuesOf(m).title).toBe("Renamed after");

    t.ms = 50;
    const renamed2 = writeFields(base, "night:1", { title: "Renamed before" }, B);
    t.ms = 51;
    const deleted2 = deleteRec(base, A);
    const m2 = mergeRec(renamed2, deleted2)!;
    expect(isLive(m2)).toBe(false);
    // the tombstone still holds the whole night, rename included
    expect(valuesOf(m2)).toEqual({ title: "Renamed before", score: 80 });
    expect(stable(m2)).toBe(stable(mergeRec(deleted2, renamed2)));
  });

  it("is idempotent, commutative and associative (any order, any repeats)", () => {
    t.ms = 60;
    const recs: Rec[] = [
      writeFields(base, "night:1", { title: "one" }, A),
      deleteRec(base, B),
      writeFields(base, "night:1", { score: 3, change: "Calmer" }, B),
      writeFields(base, "night:1", { title: "two" }, A),
    ];
    const fold = (list: Rec[]) => list.reduce<Rec | undefined>((m, r) => mergeRec(m, r), undefined);
    const want = stable(fold(recs));
    const perms = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [1, 3, 0, 2],
      [2, 0, 3, 1, 1, 0],
    ];
    for (const p of perms) expect(stable(fold(p.map((i) => recs[i]!)))).toBe(want);
    const once = fold(recs)!;
    expect(stable(mergeRec(once, once))).toBe(stable(once));
    // associativity: (a·b)·c = a·(b·c)
    const [a, b, c] = recs as [Rec, Rec, Rec];
    expect(stable(mergeRec(mergeRec(a, b), c))).toBe(stable(mergeRec(a, mergeRec(b, c))));
  });

  it("an unchanged value writes nothing; a removed field is a stamped removal", () => {
    expect(writeFields(base, "night:1", { title: "Saturday milonga" }, A)).toBe(base);
    const r = writeFields(base, "night:1", { title: "Saturday milonga" }, A, { removeMissing: true });
    expect(valuesOf(r)).toEqual({ title: "Saturday milonga" });
  });
});

/* ---------- whole devices ---------- */

const night = (id: string, createdAt: string, title: string): HistorySnapshot =>
  ({
    id,
    createdAt,
    title,
    options: {},
    playlist: { id: `p-${id}`, tandas: [], score: { total: 80 } },
    score: 80,
    source: "compose",
  }) as unknown as HistorySnapshot;

/** a device's stores, as plain state (the app's stores in lib/sync/local.ts) */
function device(): LocalSide & { lib: Library } {
  const d = {
    lib: {
      history: [],
      memory: emptyMemory(),
      settings: { theme: "auto" },
      overrides: {},
    } as unknown as Library,
    read: () => d.lib,
    write: (p: Partial<Library>) => {
      d.lib = { ...d.lib, ...p };
    },
  };
  return d;
}

/** a server in memory: versions, records by id, the pull after a cursor (the API's own logic is api.test.ts) */
function memoryServer() {
  const recs = new Map<string, { v: number; blob: string }>();
  let ver = 0;
  const transport = (name = "server"): Transport => ({
    name,
    async pull(cursor) {
      const since = Number(cursor ?? 0);
      const items = [...recs].filter(([, r]) => r.v > since).map(([rid, r]) => ({ rid, blob: r.blob }));
      return { items, cursor: String(ver) };
    },
    async push(items: Item[]) {
      for (const it of items) recs.set(it.rid, { v: ++ver, blob: it.blob });
    },
  });
  return { recs, transport };
}

const memPersist = (): Persist => {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined,
    set: async (k, v) => void m.set(k, structuredClone(v)),
    del: async (k) => void m.delete(k),
  };
};

async function pair(now: { ms: number }) {
  const keys = await deriveKeys(CODE);
  const server = memoryServer();
  const a = device();
  const b = device();
  const ea = new SyncEngine(
    keys,
    { id: "devA", name: "iPhone", platform: "ios" },
    a,
    [server.transport()],
    memPersist(),
    () => now.ms,
  );
  const eb = new SyncEngine(
    keys,
    { id: "devB", name: "Mac", platform: "macos" },
    b,
    [server.transport()],
    memPersist(),
    () => now.ms,
  );
  return { a, b, ea, eb, server };
}

describe("two devices through one server", () => {
  it("a night made on one appears on the other; a rename and a delete follow", async () => {
    const now = { ms: Date.parse("2026-11-19T20:00:00Z") };
    const { a, b, ea, eb } = await pair(now);
    a.lib = {
      ...a.lib,
      history: [
        night("n1", "2026-11-18T20:00:00Z", "Saturday milonga"),
        night("n2", "2026-11-17T20:00:00Z", "Práctica"),
      ],
    };
    await ea.sync();
    await eb.sync();
    expect(b.lib.history.map((h) => h.title)).toEqual(["Saturday milonga", "Práctica"]);

    now.ms += 1000;
    b.lib = {
      ...b.lib,
      history: b.lib.history.map((h) => (h.id === "n1" ? { ...h, title: "Sábado en Sunderland" } : h)),
    };
    await eb.sync();
    now.ms += 1000;
    a.lib = { ...a.lib, history: a.lib.history.filter((h) => h.id !== "n2") };
    await ea.sync();
    await eb.sync();
    await ea.sync();
    expect(a.lib.history.map((h) => h.title)).toEqual(["Sábado en Sunderland"]);
    expect(b.lib.history.map((h) => h.title)).toEqual(["Sábado en Sunderland"]);
    // the deleted night stays in the log as a tombstone
    expect(eb.doc.get("night:n2")?.d).toBeTruthy();
  });

  it("concurrent offline edits on both devices converge, and nothing is lost", async () => {
    const now = { ms: Date.parse("2026-11-19T20:00:00Z") };
    const { a, b, ea, eb } = await pair(now);
    a.lib = { ...a.lib, history: [night("n1", "2026-11-18T20:00:00Z", "One")] };
    await ea.sync();
    await eb.sync();
    // offline: A renames n1 and adds n3; B adds n4 and changes a setting
    now.ms += 1000;
    a.lib = {
      ...a.lib,
      history: [night("n3", "2026-11-19T19:00:00Z", "Three"), { ...a.lib.history[0]!, title: "One (A)" }],
    };
    b.lib = {
      ...b.lib,
      history: [night("n4", "2026-11-19T18:00:00Z", "Four"), ...b.lib.history],
      settings: { ...b.lib.settings, theme: "dark" },
    };
    await eb.sync();
    await ea.sync();
    await eb.sync();
    const titles = (l: Library) => l.history.map((h) => h.title);
    expect(titles(a.lib)).toEqual(["Three", "Four", "One (A)"]);
    expect(titles(b.lib)).toEqual(titles(a.lib));
    expect(a.lib.settings.theme).toBe("dark");
    // a round with nothing new changes nothing (idempotent)
    const before = JSON.stringify(a.lib);
    const r = await ea.sync();
    expect(r.applied).toBe(false);
    expect(r.transports[0]!.pushed).toBe(0);
    expect(JSON.stringify(a.lib)).toBe(before);
  });

  it("delete on one device vs rename on the other: the later wins on both", async () => {
    const now = { ms: Date.parse("2026-11-19T20:00:00Z") };
    const { a, b, ea, eb } = await pair(now);
    a.lib = { ...a.lib, history: [night("n1", "2026-11-18T20:00:00Z", "One")] };
    await ea.sync();
    await eb.sync();
    now.ms += 1000;
    a.lib = { ...a.lib, history: [] }; // A deletes first
    now.ms += 1000;
    b.lib = { ...b.lib, history: [{ ...b.lib.history[0]!, title: "Renamed" }] }; // B renames later, offline
    await ea.sync();
    await eb.sync();
    await ea.sync();
    expect(a.lib.history.map((h) => h.title)).toEqual(["Renamed"]);
    expect(b.lib.history.map((h) => h.title)).toEqual(["Renamed"]);
  });

  it("model keys and a DJ app's folder never enter the space", async () => {
    const now = { ms: Date.parse("2026-11-19T20:00:00Z") };
    const { a, b, ea, eb, server } = await pair(now);
    a.lib = {
      ...a.lib,
      settings: {
        theme: "light",
        ai: { provider: "anthropic", key: "sk-ant-secret", model: "" },
        djApps: { rekordbox: { folder: "/Users/a/Music" } },
        dataSources: { autoFill: true, discogsToken: "discogs-secret" },
      } as unknown as Library["settings"],
    };
    await ea.sync();
    await eb.sync();
    expect(b.lib.settings.theme).toBe("light");
    expect(b.lib.settings.ai).toBeUndefined();
    expect(b.lib.settings.djApps).toBeUndefined();
    expect(b.lib.settings.dataSources).toEqual({ autoFill: true });
    const keys = await deriveKeys(CODE);
    const { open } = await import("./crypto");
    for (const [rid, r] of server.recs)
      expect(JSON.stringify(await open(keys, r.blob, rid))).not.toMatch(/secret|Users/);
  });

  it("a night that only fell off the end of a full History is not deleted", async () => {
    const now = { ms: Date.parse("2026-11-19T20:00:00Z") };
    const { a, ea } = await pair(now);
    const list = Array.from({ length: 50 }, (_, i) =>
      night(`n${i}`, new Date(Date.parse("2026-11-01T00:00:00Z") + i * 3600_000).toISOString(), `N${i}`),
    ).reverse();
    a.lib = { ...a.lib, history: list };
    await ea.sync();
    // a new night pushes the oldest (n0) out of the 50
    a.lib = { ...a.lib, history: [night("new", "2026-11-19T00:00:00Z", "New"), ...list.slice(0, 49)] };
    await ea.sync();
    expect(isLive(ea.doc.get("night:n0"))).toBe(true);
    // a real delete of a recent one is a delete
    a.lib = { ...a.lib, history: a.lib.history.filter((h) => h.id !== "n40") };
    await ea.sync();
    expect(isLive(ea.doc.get("night:n40"))).toBe(false);
  });

  it("an edit made while the other device's change was in flight is not overwritten", async () => {
    const now = { ms: Date.parse("2026-11-19T20:00:00Z") };
    const { a, b, ea, eb } = await pair(now);
    a.lib = { ...a.lib, history: [night("n1", "2026-11-18T20:00:00Z", "One")] };
    await ea.sync();
    await eb.sync();
    now.ms += 1000;
    b.lib = { ...b.lib, settings: { ...b.lib.settings, theme: "dark" } };
    await eb.sync();
    // A renames; its round pulls B's theme and must keep A's rename
    now.ms += 1000;
    a.lib = { ...a.lib, history: [{ ...a.lib.history[0]!, title: "Mine" }] };
    await ea.sync();
    expect(a.lib.history[0]!.title).toBe("Mine");
    expect(a.lib.settings.theme).toBe("dark");
  });
});
