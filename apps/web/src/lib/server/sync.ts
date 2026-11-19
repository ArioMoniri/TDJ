import "server-only";
import { createHash } from "node:crypto";
import { looksSealed } from "@/lib/sync/crypto";
import { dbEnabled, dynamoDoc } from "./db";

/**
 * The sync server (docs/SYNC.md): a blind store of encrypted records for sync spaces. No accounts: a space is
 * addressed by its id, which only devices that know the space's code can derive (lib/sync/crypto.ts), and it is
 * stored under SHA-256(id), so the table never holds the id itself. Every record is ciphertext the server cannot
 * read; record ids are opaque HMACs. What the server knows: how many records a space has, their sizes, when they
 * changed, and an opaque tag per device with the time it was last here.
 *
 * Layout (the deployment's DynamoDB table, `TDJ_DB_TABLE`, beside rooms and user rows; or this process's memory for
 * `pnpm dev`, `pnpm start` and a container without a table):
 * - `sync#<hash>`: the manifest, `ver` (the space's version), `recs` (record id → [the version it was last written
 *   at, its bytes, the ms of that write]) and `dev` (device tag → ms last seen);
 * - `sync#<hash>#r#<record id>`: one record, `v` and `blob`.
 * A write claims its versions and updates the manifest in one conditional update (retried on a lost race), then
 * writes the records, each only over an older version. A reader that finds a record older than the manifest says
 * (a write still landing) stops its cursor before it, so it reads that record again next time; nothing is skipped.
 * Spaces nobody uses expire after SPACE_TTL_DAYS (each write moves the date on).
 */

export const SYNC_LIMITS = {
  /** one record's ciphertext (base64url characters): DynamoDB's item limit is 400 KB */
  blobChars: 350_000,
  /** records per write */
  perPut: 25,
  /** request body */
  bodyBytes: 4_000_000,
  /** records per space (50 nights, their tombstones, settings, memory and devices fit many times over; the
   * manifest of a full space stays well inside one DynamoDB item) */
  records: 2500,
  /** bytes per space */
  spaceBytes: 40_000_000,
  /** devices remembered per space */
  devices: 32,
  /** records per read */
  perGet: 60,
  /** bytes per read (Lambda answers stay below 6 MB) */
  getBytes: 4_000_000,
  /** requests per minute from one address, and writes per minute to one space */
  perMinute: 120,
  writesPerMinute: 60,
};
export const SPACE_TTL_DAYS = 400;
/** a write that claimed a version but never landed is skipped by readers after this long */
const STALE_MS = 2 * 60_000;

export const isSpaceId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
export const isRecordId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s);
export const isDeviceTag = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]{8,32}$/.test(s);
/** the storage key of a space id (the id is the capability; its hash is only an address) */
export const spaceKey = (id: string) => createHash("sha256").update(`tdj-sync:${id}`).digest("base64url");

/** a record's entry in the manifest: [version, bytes, ms written] */
export type Entry = [number, number, number];
export interface Manifest {
  ver: number;
  recs: Record<string, Entry>;
  dev: Record<string, number>;
  /** the space was reset (its code replaced): devices still on the old code are told so, and cannot refill it */
  gone?: boolean;
}
export interface StoredRecord {
  rid: string;
  v: number;
  blob: string;
}
export class SyncError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The storage behind the route: DynamoDB or memory, the same semantics. */
export interface SyncStore {
  manifest(space: string): Promise<Manifest | null>;
  /** claims `n` versions and sets the manifest entries, only if the manifest is still at `expectVer` */
  claim(space: string, expectVer: number, next: Manifest): Promise<boolean>;
  putRecord(space: string, r: StoredRecord): Promise<void>;
  getRecord(space: string, rid: string): Promise<StoredRecord | null>;
  touchDevice(space: string, tag: string, ms: number): Promise<void>;
  /** removes the records and leaves a `gone` manifest (expiring after GONE_TTL_DAYS) */
  drop(space: string, rids: string[]): Promise<void>;
}
export const GONE_TTL_DAYS = 60;

const emptyManifest = (): Manifest => ({ ver: 0, recs: {}, dev: {} });
const ttl = () => Math.floor(Date.now() / 1000) + SPACE_TTL_DAYS * 86400;

/* ---------- memory ---------- */

interface Mem {
  manifests: Map<string, Manifest>;
  records: Map<string, StoredRecord>;
}
const g = globalThis as unknown as { __tdjSyncStore?: Mem };
export function memoryStore(
  mem: Mem = { manifests: new Map(), records: new Map() },
): SyncStore & { mem: Mem } {
  const key = (s: string, rid: string) => `${s}#${rid}`;
  return {
    mem,
    async manifest(s) {
      const m = mem.manifests.get(s);
      return m ? structuredClone(m) : null;
    },
    async claim(s, expect, next) {
      if ((mem.manifests.get(s)?.ver ?? 0) !== expect) return false;
      mem.manifests.set(s, structuredClone(next));
      return true;
    },
    async putRecord(s, r) {
      const cur = mem.records.get(key(s, r.rid));
      if (!cur || cur.v < r.v) mem.records.set(key(s, r.rid), { ...r });
    },
    async getRecord(s, rid) {
      const r = mem.records.get(key(s, rid));
      return r ? { ...r } : null;
    },
    async touchDevice(s, tag, ms) {
      const m = mem.manifests.get(s);
      if (m) m.dev[tag] = ms;
    },
    async drop(s, rids) {
      for (const rid of rids) mem.records.delete(key(s, rid));
      mem.manifests.set(s, { ver: 0, recs: {}, dev: {}, gone: true });
    },
  };
}

/* ---------- DynamoDB ---------- */

function dynamoStore(): SyncStore {
  const table = () => process.env.TDJ_DB_TABLE;
  const mpk = (s: string) => `sync#${s}`;
  const rpk = (s: string, rid: string) => `sync#${s}#r#${rid}`;
  const conditional = (e: unknown) => (e as { name?: string })?.name === "ConditionalCheckFailedException";
  return {
    async manifest(s) {
      const { send, Get } = await dynamoDoc();
      const r = await send(new Get({ TableName: table(), Key: { pk: mpk(s) }, ConsistentRead: true }));
      const it = r.Item;
      if (!it) return null;
      return {
        ver: Number(it.ver) || 0,
        recs: (it.recs as Record<string, Entry>) ?? {},
        dev: (it.dev as Record<string, number>) ?? {},
        ...(it.gone ? { gone: true } : {}),
      };
    },
    async claim(s, expect, next) {
      const { send, Put } = await dynamoDoc();
      try {
        await send(
          new Put({
            TableName: table(),
            Item: { pk: mpk(s), ...next, ttl: ttl() },
            ConditionExpression: expect === 0 ? "attribute_not_exists(pk) OR ver = :v" : "ver = :v",
            ExpressionAttributeValues: { ":v": expect },
          }),
        );
        return true;
      } catch (e) {
        if (conditional(e)) return false;
        throw e;
      }
    },
    async putRecord(s, r) {
      const { send, Put } = await dynamoDoc();
      try {
        await send(
          new Put({
            TableName: table(),
            Item: { pk: rpk(s, r.rid), v: r.v, blob: r.blob, ttl: ttl() },
            ConditionExpression: "attribute_not_exists(pk) OR v < :v",
            ExpressionAttributeValues: { ":v": r.v },
          }),
        );
      } catch (e) {
        if (!conditional(e)) throw e; // a newer write landed first: it stays
      }
    },
    async getRecord(s, rid) {
      const { send, Get } = await dynamoDoc();
      const r = await send(new Get({ TableName: table(), Key: { pk: rpk(s, rid) }, ConsistentRead: true }));
      return r.Item ? { rid, v: Number(r.Item.v) || 0, blob: String(r.Item.blob ?? "") } : null;
    },
    async touchDevice(s, tag, ms) {
      const { send, Update } = await dynamoDoc();
      await send(
        new Update({
          TableName: table(),
          Key: { pk: mpk(s) },
          UpdateExpression: "SET dev.#t = :ms",
          ConditionExpression: "attribute_exists(dev)",
          ExpressionAttributeNames: { "#t": tag },
          ExpressionAttributeValues: { ":ms": ms },
        }),
      ).catch(() => {});
    },
    async drop(s, rids) {
      const { send, Delete } = await dynamoDoc();
      for (let i = 0; i < rids.length; i += 10)
        await Promise.all(
          rids
            .slice(i, i + 10)
            .map((rid) => send(new Delete({ TableName: table(), Key: { pk: rpk(s, rid) } }))),
        );
      const gone = Math.floor(Date.now() / 1000) + GONE_TTL_DAYS * 86400;
      const { Put } = await dynamoDoc();
      await send(
        new Put({
          TableName: table(),
          Item: { pk: mpk(s), ver: 0, recs: {}, dev: {}, gone: true, ttl: gone },
        }),
      );
    },
  };
}

/** Where sync spaces live here: DynamoDB, else memory; none on a Lambda without a table (no shared memory). */
export function syncStore(): SyncStore | null {
  if (dbEnabled()) return dynamoStore();
  if (process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.TDJ_ROOMS_MEMORY !== "1") return null;
  g.__tdjSyncStore ??= { manifests: new Map(), records: new Map() };
  return memoryStore(g.__tdjSyncStore);
}

/* ---------- the operations ---------- */

/** What changed after version `since`: records in version order, a page at a time; the cursor to continue from. */
export async function readSpace(
  store: SyncStore,
  space: string,
  since: number,
  now = Date.now(),
): Promise<{ version: number; more: boolean; records: StoredRecord[]; devices: Record<string, number> }> {
  const m = await store.manifest(space);
  if (!m) return { version: 0, more: false, records: [], devices: {} };
  if (m.gone) throw new SyncError(410, "This sync code was replaced on another device.");
  const changed = Object.entries(m.recs)
    .map(([rid, e]) => [rid, Number(e[0]), Number(e[2])] as const)
    .filter(([, v]) => v > since)
    .sort((a, b) => a[1] - b[1]);
  const records: StoredRecord[] = [];
  let bytes = 0;
  let cursor = m.ver;
  let more = false;
  for (let i = 0; i < changed.length; i++) {
    const [rid, v, at] = changed[i]!;
    if (records.length >= SYNC_LIMITS.perGet || bytes >= SYNC_LIMITS.getBytes) {
      cursor = Math.min(cursor, changed[i - 1]![1]);
      more = true;
      break;
    }
    const r = await store.getRecord(space, rid);
    if (!r || r.v < v) {
      // claimed, not landed yet: stop before it (unless the write was abandoned)
      if (now - at < STALE_MS) {
        cursor = Math.min(cursor, v - 1);
        more = false;
        if (r) {
          records.push(r);
          bytes += r.blob.length;
        }
        continue;
      }
      if (!r) continue;
    }
    records.push(r);
    bytes += r.blob.length;
  }
  return { version: cursor, more, records, devices: m.dev };
}

/** Writes sealed records; returns the space's new version. Throws SyncError on a limit. */
export async function writeSpace(
  store: SyncStore,
  space: string,
  items: Array<{ rid: string; blob: string }>,
  device: string | null,
  now = Date.now(),
): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = (await store.manifest(space)) ?? emptyManifest();
    if (cur.gone) throw new SyncError(410, "This sync code was replaced on another device.");
    const next: Manifest = structuredClone(cur);
    let total = Object.values(next.recs).reduce((a, e) => a + e[1], 0);
    for (const it of items) {
      next.ver += 1;
      total += it.blob.length - (next.recs[it.rid]?.[1] ?? 0);
      next.recs[it.rid] = [next.ver, it.blob.length, now];
    }
    if (Object.keys(next.recs).length > SYNC_LIMITS.records)
      throw new SyncError(413, "This sync space holds too many records.");
    if (total > SYNC_LIMITS.spaceBytes) throw new SyncError(413, "This sync space is full.");
    if (device) {
      next.dev[device] = now;
      const tags = Object.entries(next.dev).sort((a, b) => b[1] - a[1]);
      next.dev = Object.fromEntries(tags.slice(0, SYNC_LIMITS.devices));
    }
    if (!(await store.claim(space, cur.ver, next))) continue;
    await Promise.all(
      items.map((it) => store.putRecord(space, { rid: it.rid, v: next.recs[it.rid]![0], blob: it.blob })),
    );
    return next.ver;
  }
  throw new SyncError(409, "Too many devices are writing at once. Try again.");
}

/** Checks a write's body: record ids and sealed blobs only, within the limits. */
export function parseWrite(body: unknown): Array<{ rid: string; blob: string }> {
  const recs = (body as { records?: unknown })?.records;
  if (!Array.isArray(recs) || !recs.length) throw new SyncError(400, "No records.");
  if (recs.length > SYNC_LIMITS.perPut)
    throw new SyncError(413, `At most ${SYNC_LIMITS.perPut} records at once.`);
  const seen = new Set<string>();
  const out: Array<{ rid: string; blob: string }> = [];
  for (const r of recs as Array<{ rid?: unknown; blob?: unknown }>) {
    if (!isRecordId(r?.rid)) throw new SyncError(400, "Bad record id.");
    if (typeof r.blob !== "string" || r.blob.length > SYNC_LIMITS.blobChars)
      throw new SyncError(413, "A record is too large.");
    // the server stores ciphertext only: anything that is not a sealed blob is refused
    if (!looksSealed(r.blob)) throw new SyncError(400, "Records must be encrypted.");
    if (seen.has(r.rid)) continue;
    seen.add(r.rid);
    out.push({ rid: r.rid, blob: r.blob });
  }
  return out;
}

/* ---------- rate limits (per server instance, as rooms) ---------- */

const hits = new Map<string, number[]>();
export function syncRateLimited(key: string, n: number, now = Date.now()): boolean {
  const l = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  l.push(now);
  hits.set(key, l);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return l.length > n;
}
export function resetSyncRateLimits() {
  hits.clear();
}
