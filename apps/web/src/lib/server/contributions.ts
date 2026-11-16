import "server-only";
import { randomBytes } from "node:crypto";
import { CONTRIB_LIMITS, type ContributionBatch, validateContributionBatch } from "@tdj/core";
import type { NextResponse } from "next/server";
import { isAdmin } from "./admin";
import { dbEnabled, dynamoDoc } from "./db";
import { clientKey, crossOriginResponse, jsonNoStore } from "./guard";

/**
 * Owner contributions on the server (packages/core/src/owner.ts has the format and the validation). Only the owner
 * session (/admin → sealed `tdj_admin` cookie) may write; every other caller gets 401 before the body is read. The
 * request must come from the app's own origin, is size-capped before parsing, validated against the field whitelist
 * (no secrets, no free text blobs) and rate-limited per client. Contributions live in the owner partition of the
 * table, apart from every DJ's own row (`user#<signed id>`) and the rooms:
 *   owner#contrib#<id>    { status: "pending" | "merged", at, source, count, body (the items, JSON), ttl }
 *   owner#contrib#index   { pending: string set of ids, updatedAt }
 * The "Merge owner contributions" workflow reads the index, merges into the repo and marks them merged. Nothing here
 * ever answers with a contribution's content: GET reports counts to the owner only.
 */
export const CONTRIB_PREFIX = "owner#contrib#";
export const CONTRIB_INDEX = `${CONTRIB_PREFIX}index`;
const PENDING_TTL_DAYS = 180;
const ttl = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;

/* ---------- rate limit: per client, in this process ---------- */

const WINDOW_MS = 10 * 60_000;
// (a first "Send my existing changes" can carry the device's 4000 remembered covers plus the edits)
export const RATE = { requests: 30, items: 10_000 } as const;
const windows = new Map<string, { until: number; n: number; items: number }>();
export function allowContribution(key: string, items: number, now = Date.now()): boolean {
  let w = windows.get(key);
  if (!w || w.until < now) {
    w = { until: now + WINDOW_MS, n: 0, items: 0 };
    windows.set(key, w);
  }
  if (w.n + 1 > RATE.requests || w.items + items > RATE.items) return false;
  w.n++;
  w.items += items;
  if (windows.size > 10_000) windows.clear();
  return true;
}
export const resetContributionLimits = () => windows.clear();

/* ---------- store ---------- */

interface MemoryStore {
  items: Map<
    string,
    { status: "pending" | "merged"; at: string; source: string; body: string; count: number }
  >;
}
const mem = (): MemoryStore => {
  const g = globalThis as { __tdjContribStore?: MemoryStore };
  g.__tdjContribStore ??= { items: new Map() };
  return g.__tdjContribStore;
};
export const resetContributionMemory = () => {
  (globalThis as { __tdjContribStore?: MemoryStore }).__tdjContribStore = undefined;
};
export type ContributionStorage = "dynamo" | "memory";
export const contributionStorage = (): ContributionStorage => (dbEnabled() ? "dynamo" : "memory");

async function pendingIds(): Promise<string[]> {
  if (contributionStorage() === "memory")
    return [...mem().items].filter(([, v]) => v.status === "pending").map(([k]) => k);
  const { send, Get } = await dynamoDoc();
  const r = await send(
    new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: CONTRIB_INDEX }, ConsistentRead: true }),
  );
  const p = r.Item?.pending;
  return p instanceof Set ? [...(p as Set<string>)] : Array.isArray(p) ? (p as string[]) : [];
}

export class TooManyPending extends Error {}

/** keeps one validated batch; returns its id and how many are now waiting for the merge */
export async function storeContribution(batch: ContributionBatch): Promise<{ id: string; pending: number }> {
  const before = await pendingIds();
  if (before.length >= CONTRIB_LIMITS.pending) throw new TooManyPending();
  const at = new Date().toISOString();
  const id = `c-${at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomBytes(6).toString("hex")}`;
  const body = JSON.stringify(batch.items);
  if (contributionStorage() === "memory") {
    mem().items.set(id, { status: "pending", at, source: batch.source, body, count: batch.items.length });
    return { id, pending: before.length + 1 };
  }
  const { send, Put, Update } = await dynamoDoc();
  const TableName = process.env.TDJ_DB_TABLE;
  await send(
    new Put({
      TableName,
      Item: {
        pk: `${CONTRIB_PREFIX}${id}`,
        kind: "owner-contribution",
        status: "pending",
        at,
        source: batch.source,
        count: batch.items.length,
        body,
        ttl: ttl(PENDING_TTL_DAYS),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  await send(
    new Update({
      TableName,
      Key: { pk: CONTRIB_INDEX },
      UpdateExpression: "SET #u = :u ADD #p :id",
      ExpressionAttributeNames: { "#u": "updatedAt", "#p": "pending" },
      ExpressionAttributeValues: { ":u": at, ":id": new Set([id]) },
    }),
  );
  return { id, pending: before.length + 1 };
}

export async function contributionStatus(): Promise<{ pending: number; storage: ContributionStorage }> {
  return { pending: (await pendingIds()).length, storage: contributionStorage() };
}

/* ---------- the route ---------- */

const notOwner = () =>
  jsonNoStore({ owner: false, error: "Only the owner of this deployment can contribute." }, { status: 401 });

/** GET /api/owner/contributions: the owner's queue as counts (never content); 401 for everyone else. */
export async function contributionsGet(req: Request): Promise<NextResponse> {
  if (!(await isAdmin(req))) return notOwner();
  try {
    return jsonNoStore({ owner: true, ...(await contributionStatus()), limits: CONTRIB_LIMITS });
  } catch (e) {
    return jsonNoStore({ owner: true, error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/owner/contributions: `{ v: 1, source, items: [{ kind, id, value, at }] }` from the owner only. */
export async function contributionsPost(req: Request): Promise<NextResponse> {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!(await isAdmin(req))) return notOwner();
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    return jsonNoStore({ error: "Send JSON." }, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > CONTRIB_LIMITS.bodyBytes)
    return jsonNoStore({ error: "That contribution is too large." }, { status: 413 });
  const text = await req.text().catch(() => "");
  if (text.length > CONTRIB_LIMITS.bodyBytes)
    return jsonNoStore({ error: "That contribution is too large." }, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return jsonNoStore({ error: "Invalid JSON." }, { status: 400 });
  }
  const v = validateContributionBatch(raw);
  if (!v.ok) return jsonNoStore({ error: v.error }, { status: 400 });
  if (!allowContribution(clientKey(req), v.batch.items.length))
    return jsonNoStore({ error: "Too many contributions. Try again in ten minutes." }, { status: 429 });
  try {
    const r = await storeContribution(v.batch);
    return jsonNoStore({ ok: true, ...r, items: v.batch.items.length }, { status: 202 });
  } catch (e) {
    if (e instanceof TooManyPending)
      return jsonNoStore(
        { error: "Too many contributions are waiting for the merge. Run Merge owner contributions first." },
        { status: 429 },
      );
    return jsonNoStore({ error: (e as Error).message }, { status: 500 });
  }
}
