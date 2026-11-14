/**
 * Rooms (ROADMAP §12): the op merge. Edits to different tandas both land; two edits to the same tanda resolve last
 * writer wins and the log names whose change was replaced; reorder and a swap made at the same time both stand;
 * the client diff turns a local edit into exactly the ops the merge expects, and an echo changes nothing.
 */
import { describe, expect, it } from "vitest";
import {
  applyRoomOps,
  appRoomLink,
  cleanRoomOps,
  createRoom,
  diffNight,
  type NightFile,
  type NightSide,
  type NightTanda,
  newRoomCode,
  normalizeRoomCode,
  parseNightFile,
  parseRoomLink,
  ROOM_CODE_ALPHABET,
  ROOM_LOG_MAX,
  type RoomState,
  roomLink,
  roomPresence,
  sameJson,
} from "../src/index";

const side = (id: string, title = `Song ${id}`): NightSide => ({
  id,
  title,
  orchestra: "Carlos Di Sarli",
  orchestraId: "carlos-di-sarli",
  singer: null,
  year: 1940,
  rhythm: "tango",
});
const tanda = (n: number, orchestra = `Orq ${n}`): NightTanda => ({
  rhythm: n % 3 === 2 ? "vals" : "tango",
  orchestra,
  orchestraId: orchestra.toLowerCase().replace(/\s+/g, "-"),
  singer: null,
  vocal: false,
  era: "golden-peak",
  phase: "build",
  targetEnergy: 50,
  sides: [side(`${n}a`), side(`${n}b`), side(`${n}c`)],
  cortina: { id: `c${n}`, title: `Cortina ${n}`, artist: "Band" },
});
const night = (): NightFile => ({
  format: "tdjnight",
  version: 1,
  name: "Saturday",
  createdAt: "2026-11-14T20:00:00.000Z",
  options: { hours: 2, cortinaLengthSec: 45 },
  score: { total: 88, verdict: "Good" },
  tandas: [1, 2, 3, 4, 5].map((n) => tanda(n)),
  opening: null,
  closing: side("cumparsita", "La Cumparsita"),
});
const T0 = "2026-11-14T21:00:00.000Z";
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();
const fresh = (): RoomState =>
  createRoom({ code: "ABC234", name: "Milonga", by: "Ana", at: T0, night: night() });

describe("room codes", () => {
  it("six characters from an alphabet without look-alikes; typed codes normalise", () => {
    const c = newRoomCode();
    expect(c).toMatch(/^[A-Z2-9]{6}$/);
    for (const ch of c) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01IO]/);
    expect(normalizeRoomCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeRoomCode("ABC23")).toBeNull();
    expect(normalizeRoomCode("ABC10!")).toBeNull();
  });
});

describe("room op merge", () => {
  it("creating with a night gives every tanda a stable slot and logs it", () => {
    const r = fresh();
    expect(r.slots).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(r.log.map((e) => e.kind)).toEqual(["create", "night"]);
    expect(r.rev).toBe(2);
  });

  it("edits to different tandas from two DJs both land, with no conflict", () => {
    const r0 = fresh();
    const base = r0.rev;
    const t1 = { ...r0.night!.tandas[0]!, locked: true };
    const t3 = {
      ...r0.night!.tandas[2]!,
      sides: [side("x1", "Lloran las campanas"), ...r0.night!.tandas[2]!.sides.slice(1)],
    };
    const a = applyRoomOps(r0, [{ type: "slot", slot: "s1", tanda: t1, base }], "Ana", at(1));
    const b = applyRoomOps(a.room, [{ type: "slot", slot: "s3", tanda: t3, base }], "Ben", at(2));
    expect(b.room.night!.tandas[0]!.locked).toBe(true);
    expect(b.room.night!.tandas[2]!.sides[0]!.id).toBe("x1");
    expect(b.room.log.filter((e) => e.kind === "conflict")).toEqual([]);
    expect(a.entries[0]).toMatchObject({ kind: "lock", by: "Ana", text: "locked tanda 1", tanda: 1 });
    expect(b.entries[0]).toMatchObject({ kind: "swap", by: "Ben", tanda: 3 });
    expect(b.entries[0]!.text).toBe("swapped “Song 3a” → “Lloran las campanas” in tanda 3");
    expect(b.room.rev).toBe(base + 2);
  });

  it("two edits to the same tanda: the last writer wins and the log says whose change it replaced", () => {
    const r0 = fresh();
    const base = r0.rev;
    const ana = { ...r0.night!.tandas[1]!, sides: [side("ana"), ...r0.night!.tandas[1]!.sides.slice(1)] };
    const ben = { ...r0.night!.tandas[1]!, sides: [side("ben"), ...r0.night!.tandas[1]!.sides.slice(1)] };
    const a = applyRoomOps(r0, [{ type: "slot", slot: "s2", tanda: ana, base }], "Ana", at(10));
    const b = applyRoomOps(a.room, [{ type: "slot", slot: "s2", tanda: ben, base }], "Ben", at(22));
    expect(b.room.night!.tandas[1]!.sides[0]!.id).toBe("ben");
    const c = b.entries.find((e) => e.kind === "conflict");
    expect(c).toMatchObject({ by: "Ben", tanda: 2 });
    expect(c!.text).toBe("This swap replaced Ana’s change from 12 s before");
    // the same DJ editing on top of their own change is no conflict
    const d = applyRoomOps(
      b.room,
      [{ type: "slot", slot: "s2", tanda: { ...ben, locked: true }, base }],
      "Ben",
      at(30),
    );
    expect(d.entries.some((e) => e.kind === "conflict")).toBe(false);
  });

  it("a reorder and a swap made at the same time both stand", () => {
    const r0 = fresh();
    const base = r0.rev;
    const moved = applyRoomOps(
      r0,
      [{ type: "order", order: ["s2", "s1", "s3", "s4", "s5"], base, moved: "s1" }],
      "Ana",
      at(1),
    );
    const t1 = { ...r0.night!.tandas[0]!, bypass: true };
    const both = applyRoomOps(moved.room, [{ type: "slot", slot: "s1", tanda: t1, base }], "Ben", at(2));
    expect(both.room.slots).toEqual(["s2", "s1", "s3", "s4", "s5"]);
    expect(both.room.night!.tandas[1]!.bypass).toBe(true);
    expect(both.room.night!.tandas[1]!.orchestra).toBe("Orq 1");
    expect(moved.entries[0]).toMatchObject({ kind: "reorder", text: "moved tanda 1 (Orq 1) to position 2" });
    expect(both.entries[0]).toMatchObject({ kind: "skip", text: "set tanda 2 to skip tonight" });
  });

  it("an edit to a tanda of a night that was replaced meanwhile is dropped and logged, never lost silently", () => {
    const r0 = fresh();
    const base = r0.rev;
    const other = { ...night(), createdAt: "2026-11-14T22:00:00.000Z", name: "Sunday" };
    const a = applyRoomOps(r0, [{ type: "night", night: other, base }], "Ana", at(1));
    expect(a.room.slots).toEqual(["s6", "s7", "s8", "s9", "s10"]);
    const b = applyRoomOps(a.room, [{ type: "slot", slot: "s2", tanda: tanda(9), base }], "Ben", at(2));
    expect(b.room.night!.name).toBe("Sunday");
    expect(b.entries[0]).toMatchObject({ kind: "conflict", by: "Ben" });
    expect(b.entries[0]!.text).toContain("Ana loaded a new night");
  });

  it("settings merge per key, last writer wins per key", () => {
    const r0 = fresh();
    const base = r0.rev;
    const a = applyRoomOps(
      r0,
      [{ type: "settings", patch: { "options.cortinaLengthSec": 40 }, base }],
      "Ana",
      at(1),
    );
    const b = applyRoomOps(
      a.room,
      [{ type: "settings", patch: { name: "Saturday late" }, base }],
      "Ben",
      at(2),
    );
    expect(b.room.night!.options.cortinaLengthSec).toBe(40);
    expect(b.room.night!.name).toBe("Saturday late");
    expect(b.room.log.filter((e) => e.kind === "conflict")).toEqual([]);
    const c = applyRoomOps(
      b.room,
      [{ type: "settings", patch: { "options.cortinaLengthSec": 60 }, base }],
      "Ben",
      at(3),
    );
    expect(c.room.night!.options.cortinaLengthSec).toBe(60);
    expect(c.entries.map((e) => e.kind)).toEqual(["conflict", "settings"]);
    expect(c.entries[1]!.text).toBe("set the cortina length to 60 s");
    // a key outside the night's settings is ignored
    const d = applyRoomOps(
      c.room,
      [{ type: "settings", patch: { "__proto__.x": 1, tandas: [] }, base }],
      "Ben",
      at(4),
    );
    expect(d.ignored).toBe(1);
    expect(d.room.rev).toBe(c.room.rev);
  });

  it("renames the room; an echo of the same state changes nothing", () => {
    const r0 = fresh();
    const a = applyRoomOps(
      r0,
      [{ type: "rename", name: "  Milonga  del Sábado ", base: r0.rev }],
      "Ben",
      at(1),
    );
    expect(a.room.name).toBe("Milonga del Sábado");
    expect(a.entries[0]!.text).toBe("renamed the room to “Milonga del Sábado”");
    const echo = applyRoomOps(
      a.room,
      [{ type: "slot", slot: "s1", tanda: a.room.night!.tandas[0]!, base: a.room.rev }],
      "Ben",
      at(2),
    );
    expect(echo.room.rev).toBe(a.room.rev);
    expect(echo.ignored).toBe(1);
  });

  it("a stored room read back with its keys in another order is the same room (no phantom edits)", () => {
    const r0 = fresh();
    const shuffle = (x: unknown): unknown =>
      Array.isArray(x)
        ? x.map(shuffle)
        : x && typeof x === "object"
          ? Object.fromEntries(
              Object.entries(x as object)
                .reverse()
                .map(([k, v]) => [k, shuffle(v)]),
            )
          : x;
    const stored = shuffle(r0) as RoomState;
    const echo = applyRoomOps(
      stored,
      [{ type: "slot", slot: "s1", tanda: r0.night!.tandas[0]!, base: r0.rev }],
      "Ana",
      at(1),
    );
    expect(echo.ignored).toBe(1);
    expect(echo.room.rev).toBe(r0.rev);
    expect(diffNight({ night: stored.night, slots: stored.slots, rev: stored.rev }, r0.night)).toEqual([]);
    expect(sameJson({ a: 1, b: { c: 2, d: undefined } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });

  it("keeps the log bounded and knows who is here", () => {
    let r = fresh();
    for (let i = 0; i < ROOM_LOG_MAX + 20; i++) {
      const t = { ...r.night!.tandas[0]!, locked: i % 2 === 0 };
      r = applyRoomOps(r, [{ type: "slot", slot: "s1", tanda: t, base: r.rev }], "Ana", at(i)).room;
    }
    expect(r.log.length).toBe(ROOM_LOG_MAX);
    r = applyRoomOps(r, [{ type: "join" }], "Ben", at(600)).room;
    expect(r.log.at(-1)).toMatchObject({ kind: "join", by: "Ben" });
    expect(roomPresence(r, Date.parse(at(610)))).toEqual(["Ben"]);
  });
});

describe("room links", () => {
  it("web and app links carry the server and the code, and nothing else gets through", () => {
    expect(roomLink("https://tdj.example/", "ABC234")).toBe("https://tdj.example/rooms?join=ABC234");
    expect(parseRoomLink("https://tdj.example/rooms?join=abc234")).toEqual({
      server: "https://tdj.example",
      code: "ABC234",
    });
    const app = appRoomLink("https://tdj.example", "ABC234");
    expect(app).toBe("tdj://room?server=https%3A%2F%2Ftdj.example&code=ABC234");
    expect(parseRoomLink(app)).toEqual({ server: "https://tdj.example", code: "ABC234" });
    expect(parseRoomLink("tdj://room?server=javascript:alert(1)&code=ABC234")).toBeNull();
    expect(parseRoomLink("https://tdj.example/night?join=ABC234")).toBeNull();
  });
});

describe("client diff → ops", () => {
  const synced = () => {
    const r = fresh();
    return { night: r.night, slots: r.slots, rev: r.rev, room: r };
  };

  it("a swap, a lock and a moved tanda become one op each, and apply to the same night", () => {
    const s = synced();
    const next = structuredClone(s.night!);
    next.tandas[3]!.sides[1] = side("new", "Bahía Blanca");
    next.tandas[0]!.locked = true;
    [next.tandas[1], next.tandas[2]] = [next.tandas[2]!, next.tandas[1]!];
    next.options.cortinaLengthSec = 50;
    const ops = diffNight(s, next);
    expect(ops.map((o) => o.type)).toEqual(["order", "slot", "slot", "settings"]);
    const r = applyRoomOps(s.room, ops, "Ben", at(5)).room;
    expect(r.night).toEqual(next);
    expect(r.slots).toEqual(["s1", "s3", "s2", "s4", "s5"]);
    expect(diffNight({ night: r.night, slots: r.slots, rev: r.rev }, next)).toEqual([]);
  });

  it("a new compose replaces the whole night", () => {
    const s = synced();
    const next = { ...night(), createdAt: "2026-11-14T23:00:00.000Z" };
    expect(diffNight(s, next)).toEqual([{ type: "night", night: next, base: s.rev }]);
    expect(diffNight({ night: null, slots: [], rev: 1 }, null)).toEqual([]);
  });

  it("ops from the wire are checked", () => {
    const ok = cleanRoomOps(
      [
        { type: "slot", slot: "s1", tanda: tanda(1), base: 3 },
        { type: "slot", slot: "s1", tanda: { rhythm: "rock", sides: [] }, base: 3 },
        { type: "night", night: { format: "nope" }, base: 3 },
        { type: "evil" },
        "x",
      ],
      parseNightFile,
    );
    expect(ok?.map((o) => o.type)).toEqual(["slot"]);
    expect(cleanRoomOps("nope", parseNightFile)).toBeNull();
  });
});
