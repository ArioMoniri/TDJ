/**
 * 2026-11 — dancer hearts were lost when updates overlapped: `updateQuiet` wrote the whole room back at the same
 * revision under `rev = :rev`, so two hearts read at one revision both "won" and the second dropped the first, and a
 * room edit read before a heart wrote the old hearts back. The store now keeps each song's hearts as its own string
 * set (an atomic ADD) and the playing song as its own attribute; a room edit writes only the room. These tests run
 * the store against an in-memory DocumentClient (test/fakeDynamo.ts) whose commands interleave like concurrent
 * requests, and against the memory store.
 */
import { roomHeartsView } from "@tdj/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDynamo, Put, Update } from "../../../test/fakeDynamo";

let fake = fakeDynamo();
let dynamo = true;
vi.mock("./db", () => ({
  dbEnabled: () => dynamo,
  dynamoDoc: async () => fake.doc,
}));
const store = await import("./rooms");

const playing = {
  songId: "s1",
  nightId: "n1",
  title: "Gallo ciego",
  artist: "Pugliese",
  at: "2026-11-16T22:00:00Z",
};
async function roomWithPlaying() {
  const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
  const r = await store.setPlaying(room.code, "Ana", playing);
  expect(r).not.toBeNull();
  expect(r).not.toBe("forbidden");
  return room.code;
}
const dancers = (n: number) => Array.from({ length: n }, (_, i) => `dancer-${String(i).padStart(4, "0")}`);
const heart = (code: string, dancer: string, songId = "s1") =>
  store.heartSong(code, { nightId: "n1", songId, dancer });
const isRoomEdit = (cmd: unknown) =>
  cmd instanceof Update && /#rev = :expect/.test(cmd.input.ConditionExpression ?? "");

for (const kind of ["dynamo", "memory"] as const)
  describe(`room store (${kind})`, () => {
    beforeEach(() => {
      fake = fakeDynamo();
      dynamo = kind === "dynamo";
      (globalThis as { __tdjRoomStore?: unknown }).__tdjRoomStore = undefined;
      process.env.TDJ_DB_TABLE = "tdj-test";
    });
    afterEach(() => {
      delete process.env.TDJ_DB_TABLE;
    });

    it("40 dancers heart the playing song at the same moment: every heart counts", async () => {
      const code = await roomWithPlaying();
      const out = await Promise.all(dancers(40).map((d) => heart(code, d)));
      expect(out.every((r) => r?.counted)).toBe(true);
      // the counts each dancer saw are 1 … 40, once each (no two hearts read one count and wrote over each other)
      expect(out.map((r) => r!.count).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 40 }, (_, i) => i + 1),
      );
      const room = await store.getRoom(code);
      expect(roomHeartsView(room!, "n1").hearts).toEqual({ s1: 40 });
      expect(room!.rev).toBe(1);
    });

    it("one dancer's taps at the same moment count once", async () => {
      const code = await roomWithPlaying();
      const out = await Promise.all(Array.from({ length: 6 }, () => heart(code, "dancer-same")));
      expect(out.filter((r) => r?.counted)).toHaveLength(1);
      expect(roomHeartsView((await store.getRoom(code))!, "n1").hearts).toEqual({ s1: 1 });
      expect(await heart(code, "dancer-same")).toEqual({ counted: false, count: 1 });
    });

    it("a heart on a song that is not playing, or in no room, counts nothing", async () => {
      const code = await roomWithPlaying();
      expect(await heart(code, "dancer-0001", "s2")).toEqual({ counted: false, count: 0 });
      expect(await heart("ZZZZZZ", "dancer-0001")).toBeNull();
    });

    it("a room edit that overlaps hearts cannot drop them (it read the room before they landed)", async () => {
      const code = await roomWithPlaying();
      await heart(code, "dancer-early");
      let landed = false;
      if (kind === "dynamo")
        fake.setBefore(async (cmd) => {
          if (!isRoomEdit(cmd) || landed) return;
          landed = true;
          // the edit has read the room (one heart); these land before it writes
          await Promise.all(dancers(5).map((d) => heart(code, d)));
        });
      const edit = store.applyOps(code, [{ type: "rename", name: "Milonga del Sábado", base: 1 }], "Ana");
      if (kind === "memory") await Promise.all(dancers(5).map((d) => heart(code, d)));
      const room = await edit;
      expect(room?.name).toBe("Milonga del Sábado");
      if (kind === "dynamo") expect(landed).toBe(true);
      const now = await store.getRoom(code);
      expect(now!.name).toBe("Milonga del Sábado");
      expect(roomHeartsView(now!, "n1").hearts).toEqual({ s1: 6 });
      // the playing song survives the edit too
      expect(now!.playing?.songId).toBe("s1");
    });

    it("the playing song: only a DJ of the room says it, and it never moves the revision", async () => {
      const code = await roomWithPlaying();
      expect(await store.setPlaying(code, "Ben", { ...playing, songId: "s9" })).toBe("forbidden");
      const r = await store.setPlaying(code, "Ana", null);
      expect(r).not.toBe("forbidden");
      const room = await store.getRoom(code);
      expect(room!.playing ?? null).toBeNull();
      expect(room!.rev).toBe(1);
      expect(await store.setPlaying("ZZZZZZ", "Ana", null)).toBeNull();
    });
  });

describe("room store (dynamo): conditional writes", () => {
  beforeEach(() => {
    fake = fakeDynamo();
    dynamo = true;
    process.env.TDJ_DB_TABLE = "tdj-test";
  });
  afterEach(() => {
    delete process.env.TDJ_DB_TABLE;
  });

  it("a new room is put only under a free code; a room edit only at the revision it read; a heart with ADD", async () => {
    const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
    const put = fake.log.find((l) => l.kind === "Put")!;
    expect(put.input.ConditionExpression).toBe("attribute_not_exists(pk)");
    // a room edit is an Update of the room attributes only, conditioned on the revision read
    await store.applyOps(room.code, [{ type: "rename", name: "Otra", base: 1 }], "Ana");
    const edit = fake.log.find((l) => l.kind === "Update" && /#room/.test(l.input.UpdateExpression ?? ""))!;
    expect(edit.input.ConditionExpression).toBe("#rev = :expect");
    expect(edit.input.ExpressionAttributeValues?.[":expect"]).toBe(1);
    expect(Object.values(edit.input.ExpressionAttributeNames ?? {}).sort()).toEqual([
      "rev",
      "room",
      "ttl",
      "updatedAt",
    ]);
    expect(JSON.stringify(edit.input.ExpressionAttributeValues?.[":room"])).not.toMatch(/"hearts"|"playing"/);
    await store.setPlaying(room.code, "Ana", playing);
    await heart(room.code, "dancer-0001");
    const add = fake.log.find((l) => l.kind === "Update" && /^ADD/.test(l.input.UpdateExpression ?? ""))!;
    expect(add.input.ConditionExpression).toBe("attribute_exists(pk) AND NOT contains(#h, :tok)");
    expect(add.input.ExpressionAttributeValues?.[":d"]).toEqual(new Set(["dancer-0001"]));
  });

  it("a taken code is retried under another", async () => {
    let first = true;
    fake.setBefore((cmd) => {
      if (cmd instanceof Put && first) {
        first = false;
        // another server took this code a moment ago
        fake.table.set(cmd.input.Item!.pk as string, { pk: cmd.input.Item!.pk, rev: 1, room: {} });
      }
    });
    const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
    expect(fake.log.filter((l) => l.kind === "Put")).toHaveLength(2);
    expect((await store.getRoom(room.code))?.name).toBe("Milonga");
  });

  it("an edit that lost the race re-reads and merges: both DJs' edits are in, two revisions on", async () => {
    const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
    await store.applyOps(room.code, [{ type: "join" }], "Ben");
    const rev0 = (await store.getRoom(room.code))!.rev;
    let raced = false;
    fake.setBefore(async (cmd) => {
      if (!isRoomEdit(cmd) || raced) return;
      raced = true;
      fake.setBefore(null);
      // Ben's edit lands between Ana's read and Ana's write
      await store.applyOps(room.code, [{ type: "join" }], "Cleo");
    });
    const out = await store.applyOps(
      room.code,
      [{ type: "rename", name: "Milonga Nueva", base: rev0 }],
      "Ana",
    );
    expect(raced).toBe(true);
    expect(out?.name).toBe("Milonga Nueva");
    const now = (await store.getRoom(room.code))!;
    expect(now.rev).toBe(rev0 + 2);
    expect(Object.keys(now.members).sort()).toEqual(["Ana", "Ben", "Cleo"]);
    // Ana's edit was written twice: the first lost the race (its revision had moved), the second won
    expect(
      fake.log.filter((l) => l.kind === "Update" && /Milonga Nueva/.test(JSON.stringify(l.input))),
    ).toHaveLength(2);
  });

  it("a room that changes under every try says it is busy (five tries)", async () => {
    const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
    fake.setBefore((cmd) => {
      if (!isRoomEdit(cmd)) return;
      const it = fake.table.get(`room#${room.code}`)!;
      it.rev = (it.rev as number) + 1;
    });
    await expect(
      store.applyOps(room.code, [{ type: "rename", name: "Otra", base: 1 }], "Ana"),
    ).rejects.toThrow(/busy/);
    const edits = fake.log.filter(
      (l) => l.kind === "Update" && l.input.ConditionExpression === "#rev = :expect",
    );
    expect(edits).toHaveLength(5);
  });

  it("a room stored before (hearts inside the room) keeps them, and new hearts join them", async () => {
    const code = "ABC234";
    fake.table.set(`room#${code}`, {
      pk: `room#${code}`,
      rev: 3,
      room: {
        code,
        name: "Vieja",
        createdAt: "2026-11-01T00:00:00Z",
        createdBy: "Ana",
        rev: 3,
        night: null,
        slots: [],
        members: { Ana: "2026-11-16T21:00:00Z" },
        log: [],
        stamps: { settings: {} },
        playing,
        hearts: { n1: { s1: ["dancer-old1", "dancer-old2"] } },
      },
    });
    expect(roomHeartsView((await store.getRoom(code))!, "n1").hearts).toEqual({ s1: 2 });
    expect(await heart(code, "dancer-old1")).toEqual({ counted: false, count: 2 });
    expect(await heart(code, "dancer-new1")).toEqual({ counted: true, count: 3 });
    expect(roomHeartsView((await store.getRoom(code))!, "n1").hearts).toEqual({ s1: 3 });
  });
});
