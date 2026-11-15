import "server-only";
import { randomBytes } from "node:crypto";
import {
  applyRoomOps,
  createRoom,
  type NightFile,
  newRoomCode,
  ROOM_CODE_ALPHABET,
  type RoomOp,
  type RoomState,
  roomPresence,
} from "@tdj/core";
import { dbEnabled, dynamoDoc } from "./db";

/**
 * Where rooms and short share links live: the DynamoDB table of the deployment (`TDJ_DB_TABLE`, the same table as
 * the user rows, keyed `room#<code>` and `night#<id>`), else this server process's memory, the local fallback for
 * `pnpm dev`, `pnpm start` and a self-hosted container. A Lambda without a table has no shared memory between its
 * instances, so rooms are off there. Writes are optimistic: a room is written only if its revision is still the
 * one read, and a lost race re-reads and merges again.
 */
export type RoomStoreKind = "dynamo" | "memory";
export function roomStoreKind(): RoomStoreKind | null {
  if (dbEnabled()) return "dynamo";
  if (process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.TDJ_ROOMS_MEMORY !== "1") return null;
  return "memory";
}

/** rooms and short links are forgotten this long after their last change */
const TTL_DAYS = 90;
const SHORT_TTL_DAYS = 30;
const ttl = (days: number) => Math.floor(Date.now() / 1000) + days * 86400;

interface Mem {
  rooms: Map<string, RoomState>;
  nights: Map<string, { night: NightFile; expires: number }>;
}
const g = globalThis as unknown as { __tdjRooms?: Mem };
const mem = (): Mem => {
  g.__tdjRooms ??= { rooms: new Map(), nights: new Map() };
  return g.__tdjRooms;
};

class Conflict extends Error {}

async function read(code: string): Promise<RoomState | null> {
  const kind = roomStoreKind();
  if (kind === "memory") {
    const r = mem().rooms.get(code);
    return r ? (JSON.parse(JSON.stringify(r)) as RoomState) : null;
  }
  if (kind !== "dynamo") return null;
  const { send, Get } = await dynamoDoc();
  const r = await send(new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: `room#${code}` } }));
  return (r.Item?.room as RoomState | undefined) ?? null;
}

/** writes `room` if the stored revision is still `expect` (null: the code must be free) */
async function write(room: RoomState, expect: number | null): Promise<void> {
  const kind = roomStoreKind();
  if (kind === "memory") {
    const cur = mem().rooms.get(room.code);
    if (expect === null ? !!cur : cur?.rev !== expect) throw new Conflict();
    mem().rooms.set(room.code, JSON.parse(JSON.stringify(room)) as RoomState);
    return;
  }
  if (kind !== "dynamo") throw new Error("Rooms are not available on this server.");
  const { send, Put } = await dynamoDoc();
  try {
    await send(
      new Put({
        TableName: process.env.TDJ_DB_TABLE,
        Item: {
          pk: `room#${room.code}`,
          rev: room.rev,
          room,
          updatedAt: new Date().toISOString(),
          ttl: ttl(TTL_DAYS),
        },
        ...(expect === null
          ? { ConditionExpression: "attribute_not_exists(pk)" }
          : { ConditionExpression: "rev = :rev", ExpressionAttributeValues: { ":rev": expect } }),
      }),
    );
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") throw new Conflict();
    throw e;
  }
}

export function getRoom(code: string): Promise<RoomState | null> {
  return read(code);
}

/** A new room under a free code (a taken code is retried with another). */
export async function newRoom(o: { name: string; by: string; night: NightFile | null }): Promise<RoomState> {
  for (let i = 0; i < 6; i++) {
    const bytes = randomBytes(6);
    const code = newRoomCode(
      (() => {
        let k = 0;
        return () => bytes[k++]! / 256;
      })(),
    );
    if (code.length !== 6 || [...code].some((c) => !ROOM_CODE_ALPHABET.includes(c))) continue;
    const room = createRoom({ code, name: o.name, by: o.by, at: new Date().toISOString(), night: o.night });
    try {
      await write(room, null);
      return room;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error("No free room code was found. Try again.");
}

/** Applies ops from `by` with an optimistic write; a lost race re-reads and merges again (up to 5 times). */
export async function applyOps(code: string, ops: RoomOp[], by: string): Promise<RoomState | null> {
  for (let i = 0; i < 5; i++) {
    const cur = await read(code);
    if (!cur) return null;
    const { room } = applyRoomOps(cur, ops, by, new Date().toISOString());
    try {
      if (room.rev !== cur.rev || room.members[by] !== cur.members[by]) await write(room, cur.rev);
      return room;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error("The room is busy. Try again.");
}

/**
 * 2026-11: a change that is not an edit of the night (the playing song, dancer hearts): written at the same
 * revision, re-read and retried on a lost race. `fn` returns null to write nothing.
 */
export async function updateQuiet<T>(
  code: string,
  fn: (room: RoomState) => { room: RoomState | null; out: T },
): Promise<{ room: RoomState; out: T } | null> {
  for (let i = 0; i < 5; i++) {
    const cur = await read(code);
    if (!cur) return null;
    const { room, out } = fn(cur);
    if (!room) return { room: cur, out };
    try {
      await write(room, cur.rev);
      return { room, out };
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error("The room is busy. Try again.");
}

/**
 * Marks `user` as here. Presence does not change the revision; it is written at most every 20 s per DJ (a poll
 * every 2 s would otherwise write the room every time).
 */
export async function touch(room: RoomState, user: string): Promise<RoomState> {
  const seen = room.members[user];
  if (seen && Date.now() - Date.parse(seen) < 20_000) return room;
  const next = { ...room, members: { ...room.members, [user]: new Date().toISOString() } };
  try {
    await write(next, room.rev);
    return next;
  } catch {
    return room;
  }
}

export const presenceOf = (room: RoomState) => roomPresence(room, Date.now());

/* ---------- short links ---------- */

const SHORT_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const isShortId = (s: string | null | undefined): s is string => !!s && /^[a-z2-9]{10}$/.test(s);

/** Stores a night under a short id (30 days); null when this server keeps no short links. */
export async function putShortNight(night: NightFile): Promise<string | null> {
  const kind = roomStoreKind();
  if (!kind) return null;
  const bytes = randomBytes(10);
  const id = [...bytes].map((b) => SHORT_ALPHABET[b % SHORT_ALPHABET.length]).join("");
  if (kind === "memory") {
    const m = mem().nights;
    m.set(id, { night, expires: Date.now() + SHORT_TTL_DAYS * 864e5 });
    if (m.size > 500) m.delete(m.keys().next().value as string);
    return id;
  }
  const { send, Put } = await dynamoDoc();
  await send(
    new Put({
      TableName: process.env.TDJ_DB_TABLE,
      Item: { pk: `night#${id}`, night, createdAt: new Date().toISOString(), ttl: ttl(SHORT_TTL_DAYS) },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  return id;
}

export async function getShortNight(id: string): Promise<NightFile | null> {
  const kind = roomStoreKind();
  if (kind === "memory") {
    const hit = mem().nights.get(id);
    return hit && hit.expires > Date.now() ? hit.night : null;
  }
  if (kind !== "dynamo") return null;
  const { send, Get } = await dynamoDoc();
  const r = await send(new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: `night#${id}` } }));
  const t = Number(r.Item?.ttl ?? 0);
  if (t && t * 1000 < Date.now()) return null;
  return (r.Item?.night as NightFile | undefined) ?? null;
}

/* ---------- abuse ---------- */

const hits = new Map<string, number[]>();
/** At most `n` events per key per minute (codes are guessable only by brute force: this makes that slow). */
export function rateLimited(key: string, n: number): boolean {
  const now = Date.now();
  const l = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  l.push(now);
  hits.set(key, l);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return l.length > n;
}
