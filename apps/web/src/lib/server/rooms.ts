import "server-only";
import { randomBytes } from "node:crypto";
import {
  applyRoomOps,
  createRoom,
  heartRoom,
  type NightFile,
  newRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_HEART_NIGHTS,
  type RoomOp,
  type RoomPlaying,
  type RoomState,
  roomPresence,
  setRoomPlaying,
} from "@tdj/core";
import { dbEnabled, dynamoDoc } from "./db";

/**
 * Where rooms and short share links live: the DynamoDB table of the deployment (`TDJ_DB_TABLE`, the same table as
 * the user rows, keyed `room#<code>` and `night#<id>`), else this server process's memory, the local fallback for
 * `pnpm dev`, `pnpm start` and a self-hosted container. A Lambda without a table has no shared memory between its
 * instances, so rooms are off there. Room edits are optimistic: a room is written only if its revision is still the
 * one read, and a lost race re-reads and merges again.
 *
 * 2026-11: what is not an edit of the night lives beside the room, never inside it, so neither can overwrite the
 * other. The playing song is its own attribute (`playing`, last write wins: one booth says it). Each song's dancer
 * hearts are their own string set (`h|<night>|<song>`), grown with an atomic `ADD` under `NOT contains` (a dancer
 * counts once, and two dancers at the same moment both count), with the night's first heart time beside it
 * (`hn|<night>`: the last few nights are shown). A room edit writes only `room`, `rev` and its stamps (`SET`), so the
 * hearts and the playing song survive any edit that overlaps them. (A room written before keeps its hearts inside
 * `room`: they are read and merged.)
 */
export type RoomStoreKind = "dynamo" | "memory";
export function roomStoreKind(): RoomStoreKind | null {
  if (dbEnabled()) return "dynamo";
  if (process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.TDJ_ROOMS_MEMORY !== "1") return null;
  return "memory";
}

/**
 * rooms and short links are forgotten this long after their last use: every write of a room (an edit, a DJ coming
 * in — presence is written at most every 20 s —, the playing song, a heart) moves its `ttl` on, so a room in use
 * stays and an idle one expires on its own (DynamoDB's TTL on `ttl`; 2026-11: 30 days, was 90)
 */
export const ROOM_TTL_DAYS = 30;
const TTL_DAYS = ROOM_TTL_DAYS;
/** a closed room's code answers "closed by its owner" this long (then: no such room) */
const CLOSED_TTL_DAYS = 7;
const SHORT_TTL_DAYS = 30;
const ttl = (days: number) => Math.floor(Date.now() / 1000) + days * 86400;

/** one stored room: the DynamoDB item's shape (the memory store keeps the same) */
interface RoomItem {
  pk: string;
  rev: number;
  room: RoomState;
  playing?: RoomPlaying | null;
  /** `h|<night>|<song>` → the hashed dancer tokens; `hn|<night>` → the night's first heart (ms) */
  [attr: string]: unknown;
}
// (ids never hold a "|": cleanRoomId keeps letters, digits and :.#@-_)
const SEP = "|";
const HEART = "h|";
const NIGHT = "hn|";
const heartAttr = (nightId: string, songId: string) => `${HEART}${nightId}${SEP}${songId}`;
const nightAttr = (nightId: string) => `${NIGHT}${nightId}`;
const tokensOf = (v: unknown): string[] =>
  v instanceof Set ? [...(v as Set<string>)] : Array.isArray(v) ? (v as string[]) : [];

/** the room as the app sees it: the stored room with its playing song and hearts merged in */
export function roomOfItem(item: RoomItem): RoomState {
  const { hearts: legacy, ...room } = item.room;
  const hearts: Record<string, Record<string, string[]>> = {};
  const listOf = (night: string, song: string) => {
    const songs = hearts[night] ?? {};
    hearts[night] = songs;
    const list = songs[song] ?? [];
    songs[song] = list;
    return list;
  };
  for (const [n, songs] of Object.entries(legacy ?? {}))
    for (const [s, list] of Object.entries(songs)) listOf(n, s).push(...list);
  const first: Record<string, number> = {};
  for (const [k, v] of Object.entries(item)) {
    if (k.startsWith(NIGHT)) first[k.slice(NIGHT.length)] = Number(v) || 0;
    if (!k.startsWith(HEART)) continue;
    const [night = "", song = ""] = k.slice(HEART.length).split(SEP);
    const list = listOf(night, song);
    for (const t of tokensOf(v)) if (!list.includes(t)) list.push(t);
  }
  // the last few nights only (a night hearted before this layout counts as the oldest)
  const nights = Object.keys(hearts).sort((a, b) => (first[a] ?? 0) - (first[b] ?? 0));
  for (const n of nights.slice(0, Math.max(0, nights.length - ROOM_HEART_NIGHTS))) delete hearts[n];
  const playing = "playing" in item ? (item.playing ?? null) : (room.playing ?? null);
  return {
    ...room,
    ...(playing ? { playing } : { playing: null }),
    ...(Object.keys(hearts).length ? { hearts } : {}),
  };
}
/** what a room edit stores: the room without the playing song and the hearts (they are their own attributes) */
const storedRoom = (room: RoomState): RoomState => {
  const { hearts: _h, playing: _p, ...rest } = room;
  return rest as RoomState;
};

interface Mem {
  rooms: Map<string, RoomItem>;
  nights: Map<string, { night: NightFile; expires: number }>;
  closed?: Map<string, { by: string; expires: number }>;
}
// (items, not bare rooms: a dev server reloaded over the older layout starts from an empty store)
const g = globalThis as unknown as { __tdjRoomStore?: Mem };
const mem = (): Mem => {
  g.__tdjRoomStore ??= { rooms: new Map(), nights: new Map() };
  return g.__tdjRoomStore;
};
const copy = <T>(x: T): T => structuredClone(x);

class Conflict extends Error {}
const conflicted = (e: unknown) => (e as { name?: string }).name === "ConditionalCheckFailedException";

async function readItem(code: string): Promise<RoomItem | null> {
  const kind = roomStoreKind();
  if (kind === "memory") {
    const r = mem().rooms.get(code);
    return r ? copy(r) : null;
  }
  if (kind !== "dynamo") return null;
  const { send, Get } = await dynamoDoc();
  const r = await send(
    new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: `room#${code}` }, ConsistentRead: true }),
  );
  return (r.Item as RoomItem | undefined)?.room ? (r.Item as RoomItem) : null;
}
async function read(code: string): Promise<RoomState | null> {
  const item = await readItem(code);
  return item ? roomOfItem(item) : null;
}

/** writes `room` if the stored revision is still `expect` (null: the code must be free); never its hearts */
async function write(room: RoomState, expect: number | null): Promise<void> {
  const kind = roomStoreKind();
  const pk = `room#${room.code}`;
  if (kind === "memory") {
    const cur = mem().rooms.get(room.code);
    if (expect === null ? !!cur : cur?.rev !== expect) throw new Conflict();
    const next: RoomItem = cur
      ? { ...cur, rev: room.rev, room: copy(storedRoom(room)) }
      : { pk, rev: room.rev, room: copy(storedRoom(room)) };
    mem().rooms.set(room.code, next);
    return;
  }
  if (kind !== "dynamo") throw new Error("Rooms are not available on this server.");
  const { send, Put, Update } = await dynamoDoc();
  const TableName = process.env.TDJ_DB_TABLE;
  try {
    if (expect === null)
      await send(
        new Put({
          TableName,
          Item: {
            pk,
            rev: room.rev,
            room: storedRoom(room),
            updatedAt: new Date().toISOString(),
            ttl: ttl(TTL_DAYS),
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
    else
      await send(
        new Update({
          TableName,
          Key: { pk },
          UpdateExpression: "SET #room = :room, #rev = :rev, #at = :at, #ttl = :ttl",
          ConditionExpression: "#rev = :expect",
          ExpressionAttributeNames: { "#room": "room", "#rev": "rev", "#at": "updatedAt", "#ttl": "ttl" },
          ExpressionAttributeValues: {
            ":room": storedRoom(room),
            ":rev": room.rev,
            ":at": new Date().toISOString(),
            ":ttl": ttl(TTL_DAYS),
            ":expect": expect,
          },
        }),
      );
  } catch (e) {
    if (conflicted(e)) throw new Conflict();
    throw e;
  }
}

export function getRoom(code: string): Promise<RoomState | null> {
  return read(code);
}

/**
 * 2026-11 (the owner: "rooms can be deletable"): the room's owner (the DJ who made it) closes it. The whole item
 * goes — the night, the log, the playing song and every dancer heart (they are its attributes) — and the code keeps
 * a small tombstone for a week, so the other DJs in it read "closed by its owner" instead of "no such room".
 * "forbidden": `user` did not make the room; null: no such room.
 */
export async function closeRoom(code: string, user: string): Promise<"closed" | "forbidden" | null> {
  const kind = roomStoreKind();
  const cur = await read(code);
  if (!cur) return null;
  if (cur.createdBy !== user) return "forbidden";
  if (kind === "memory") {
    mem().rooms.delete(code);
    const m = mem();
    if (!m.closed) m.closed = new Map();
    const closed = m.closed;
    closed.set(code, { by: user, expires: Date.now() + CLOSED_TTL_DAYS * 864e5 });
    return "closed";
  }
  if (kind !== "dynamo") return null;
  const { send, Delete, Put } = await dynamoDoc();
  const TableName = process.env.TDJ_DB_TABLE;
  await send(new Delete({ TableName, Key: { pk: `room#${code}` } }));
  await send(
    new Put({
      TableName,
      Item: { pk: `closed#${code}`, by: user, at: new Date().toISOString(), ttl: ttl(CLOSED_TTL_DAYS) },
    }),
  );
  return "closed";
}

/** 2026-11: who closed the room with this code (within a week), or null */
export async function closedBy(code: string): Promise<string | null> {
  const kind = roomStoreKind();
  if (kind === "memory") {
    const hit = mem().closed?.get(code);
    return hit && hit.expires > Date.now() ? hit.by : null;
  }
  if (kind !== "dynamo") return null;
  const { send, Get } = await dynamoDoc();
  const r = await send(new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: `closed#${code}` } }));
  const t = Number(r.Item?.ttl ?? 0);
  if (!r.Item || (t && t * 1000 < Date.now())) return null;
  return typeof r.Item.by === "string" ? r.Item.by : "";
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
 * 2026-11, a dancer's heart on the playing song (`heartRoom` says whether it counts: the playing song, once per
 * dancer, the limits). The heart is one atomic `ADD` to the song's own set under `NOT contains`: hearts that arrive
 * together all count, a dancer's second tap counts nothing, and no room edit can drop one. null: no such room.
 */
export async function heartSong(
  code: string,
  h: { nightId: string; songId: string; dancer: string },
): Promise<{ counted: boolean; count: number } | null> {
  const kind = roomStoreKind();
  const item = await readItem(code);
  if (!item) return null;
  const check = heartRoom(roomOfItem(item), h);
  if (!check.counted) return { counted: false, count: check.count };
  const attr = heartAttr(h.nightId, h.songId);
  const known = new Set(roomOfItem(item).hearts?.[h.nightId]?.[h.songId] ?? []);
  if (kind === "memory") {
    const cur = mem().rooms.get(code);
    if (!cur) return null;
    const set = new Set(tokensOf(cur[attr]));
    if (set.has(h.dancer)) return { counted: false, count: new Set([...known, ...set]).size };
    set.add(h.dancer);
    cur[attr] = set;
    cur[nightAttr(h.nightId)] ??= Date.now();
    return { counted: true, count: new Set([...known, ...set]).size };
  }
  if (kind !== "dynamo") return null;
  const { send, Update } = await dynamoDoc();
  try {
    const r = await send(
      new Update({
        TableName: process.env.TDJ_DB_TABLE,
        Key: { pk: `room#${code}` },
        UpdateExpression: "ADD #h :d SET #hn = if_not_exists(#hn, :now), #ttl = :ttl",
        ConditionExpression: "attribute_exists(pk) AND NOT contains(#h, :tok)",
        ExpressionAttributeNames: { "#h": attr, "#hn": nightAttr(h.nightId), "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":d": new Set([h.dancer]),
          ":tok": h.dancer,
          ":now": Date.now(),
          ":ttl": ttl(TTL_DAYS),
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return { counted: true, count: new Set([...known, ...tokensOf(r.Attributes?.[attr])]).size };
  } catch (e) {
    if (!conflicted(e)) throw e;
    // the room is gone, or this dancer's heart is in already
    const now = await read(code);
    if (!now) return null;
    return { counted: false, count: now.hearts?.[h.nightId]?.[h.songId]?.length ?? 0 };
  }
}

/**
 * 2026-11, what the DJ's booth plays now (dancers heart it): only a DJ of the room says it. Its own attribute, last
 * write wins; never the room's revision. null: no such room; "forbidden": `user` is not in the room.
 */
export async function setPlaying(
  code: string,
  user: string,
  playing: RoomPlaying | null,
): Promise<RoomState | "forbidden" | null> {
  const kind = roomStoreKind();
  const cur = await read(code);
  if (!cur) return null;
  if (!cur.members[user]) return "forbidden";
  const value = setRoomPlaying(cur, playing).playing ?? null;
  if (kind === "memory") {
    const item = mem().rooms.get(code);
    if (!item) return null;
    item.playing = copy(value);
    return roomOfItem(copy(item));
  }
  if (kind !== "dynamo") return null;
  const { send, Update } = await dynamoDoc();
  try {
    await send(
      new Update({
        TableName: process.env.TDJ_DB_TABLE,
        Key: { pk: `room#${code}` },
        UpdateExpression: "SET #p = :p, #ttl = :ttl",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#p": "playing", "#ttl": "ttl" },
        ExpressionAttributeValues: { ":p": value, ":ttl": ttl(TTL_DAYS) },
      }),
    );
  } catch (e) {
    if (conflicted(e)) return null;
    throw e;
  }
  return { ...cur, playing: value };
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
