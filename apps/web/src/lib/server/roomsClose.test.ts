/**
 * 2026-11 (the owner: "rooms can be deletable so they don't take space when used"): the owner closes a room — the
 * item goes with its hearts, playing song and log; the code answers "closed by its owner" for a while; nobody else
 * can close it — and every write moves the room's `ttl` on (30 days idle), against the fake DynamoDB and the memory
 * store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Delete, fakeDynamo, Update } from "../../../test/fakeDynamo";

let fake = fakeDynamo();
let dynamo = true;
vi.mock("./db", () => ({
  dbEnabled: () => dynamo,
  dynamoDoc: async () => fake.doc,
}));
const store = await import("./rooms");
const day = 86400;

for (const kind of ["dynamo", "memory"] as const)
  describe(`closing a room (${kind})`, () => {
    beforeEach(() => {
      fake = fakeDynamo();
      dynamo = kind === "dynamo";
      (globalThis as { __tdjRoomStore?: unknown }).__tdjRoomStore = undefined;
      process.env.TDJ_DB_TABLE = "tdj-test";
    });
    afterEach(() => {
      delete process.env.TDJ_DB_TABLE;
    });

    it("only the DJ who made it closes it; everything in it goes; the code says it was closed", async () => {
      const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
      await store.setPlaying(room.code, "Ana", {
        songId: "s1",
        nightId: "n1",
        title: "Gallo ciego",
        artist: "Pugliese",
        at: "2026-11-16T22:00:00Z",
      });
      await store.heartSong(room.code, { nightId: "n1", songId: "s1", dancer: "dancer-0001" });
      await store.applyOps(room.code, [{ type: "join" }], "Ben");
      expect(await store.closeRoom(room.code, "Ben")).toBe("forbidden");
      expect(await store.getRoom(room.code)).not.toBeNull();
      expect(await store.closeRoom(room.code, "Ana")).toBe("closed");
      expect(await store.getRoom(room.code)).toBeNull();
      expect(await store.closedBy(room.code)).toBe("Ana");
      // another DJ's next edit finds no room
      expect(await store.applyOps(room.code, [{ type: "rename", name: "x", base: 1 }], "Ben")).toBeNull();
      if (kind === "dynamo") {
        // the item itself is gone (its h|… hearts and the playing song were its attributes), a tombstone stays
        expect(fake.table.has(`room#${room.code}`)).toBe(false);
        expect(fake.log.some((l) => l.kind === Delete.name)).toBe(true);
        const tomb = fake.table.get(`closed#${room.code}`)!;
        expect(tomb.by).toBe("Ana");
        expect(Number(tomb.ttl)).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 7 * day + 5);
      }
      expect(await store.closeRoom(room.code, "Ana")).toBeNull();
    });

    it("every write moves the ttl on: a room in use stays, an idle one expires after 30 days", async () => {
      if (kind !== "dynamo") return;
      const room = await store.newRoom({ name: "Milonga", by: "Ana", night: null });
      const now = Math.floor(Date.now() / 1000);
      const first = Number(fake.table.get(`room#${room.code}`)!.ttl);
      expect(first).toBeGreaterThanOrEqual(now + store.ROOM_TTL_DAYS * day - 5);
      expect(first).toBeLessThanOrEqual(now + store.ROOM_TTL_DAYS * day + 5);
      // an edit, the playing song and a heart each set ttl
      await store.applyOps(room.code, [{ type: "rename", name: "Práctica", base: room.rev }], "Ana");
      await store.setPlaying(room.code, "Ana", null);
      await store.heartSong(room.code, { nightId: "n1", songId: "s1", dancer: "d" });
      const updates = fake.log.filter((l) => l.kind === Update.name);
      expect(updates.length).toBeGreaterThan(0);
      for (const u of updates) expect(u.input.UpdateExpression).toMatch(/#ttl = :ttl/);
    });
  });
