import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AgentMemory, AppOverrides, HistorySnapshot } from "@/lib/types";
import { getCookieSecret } from "./config";

/** Optional server storage: DynamoDB table named by TDJ_DB_TABLE, rows keyed by a signed anonymous user id. */
export function dbEnabled() {
  return !!process.env.TDJ_DB_TABLE;
}

const COOKIE = "tdj_uid";
/**
 * The HMAC key for `tdj_uid`: `TDJ_SECRET` when the deployment sets it, else derived from the cookie secret
 * (environment, or generated once into the config store). There is no literal fallback: on AWS a store that
 * cannot be read throws (lib/server/config.ts) instead of signing ids anyone could forge.
 */
async function secret(): Promise<string> {
  return process.env.TDJ_SECRET || `tdj-uid:${await getCookieSecret()}`;
}
const sign = (id: string, key: string) => createHmac("sha256", key).update(id).digest("base64url");

export interface RequestUser {
  id: string;
  /** set when the request carried no valid cookie: a fresh id was minted and this header hands it back */
  setCookie?: string;
}
/** Returns the user id from the signed cookie, or mints a new one (and the Set-Cookie header to send back). */
export async function userFromRequest(req: Request): Promise<RequestUser> {
  const key = await secret();
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (m) {
    const [id, sig] = decodeURIComponent(m[1]!).split(".");
    if (id && sig) {
      const want = Buffer.from(sign(id, key));
      const got = Buffer.from(sig);
      if (want.length === got.length && timingSafeEqual(want, got)) return { id };
    }
  }
  const id = randomBytes(12).toString("base64url");
  const value = encodeURIComponent(`${id}.${sign(id, key)}`);
  return {
    id,
    setCookie: `${COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}

interface DocClient {
  send(cmd: unknown): Promise<{
    Item?: { overrides?: AppOverrides; memory?: AgentMemory; history?: HistorySnapshot[] };
  }>;
}
let client: Promise<{
  doc: DocClient;
  Get: new (i: unknown) => unknown;
  Put: new (i: unknown) => unknown;
}> | null = null;

/** The AWS SDK is loaded lazily by name so the build works without it installed. */
async function dynamo() {
  if (!client)
    client = (async () => {
      const load = (name: string) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name);
      const [{ DynamoDBClient }, { DynamoDBDocumentClient, GetCommand, PutCommand }] = await Promise.all([
        load("@aws-sdk/client-dynamodb"),
        load("@aws-sdk/lib-dynamodb"),
      ]);
      const doc = DynamoDBDocumentClient.from(new DynamoDBClient({})) as DocClient;
      return { doc, Get: GetCommand, Put: PutCommand };
    })().catch((e) => {
      client = null;
      throw new Error(
        `Server storage is enabled (TDJ_DB_TABLE) but the AWS SDK is not installed: ${(e as Error).message}`,
      );
    });
  return client;
}

/** One row per user: the database overrides, what the agents remember and the previous generations (bounded). */
export async function getUserRow(
  user: string,
): Promise<{ overrides: AppOverrides; memory: AgentMemory | null; history: HistorySnapshot[] }> {
  const { doc, Get } = await dynamo();
  const r = await doc.send(new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: `user#${user}` } }));
  return {
    overrides: r.Item?.overrides ?? {},
    memory: r.Item?.memory ?? null,
    history: Array.isArray(r.Item?.history) ? r.Item!.history! : [],
  };
}
export async function getOverrides(user: string): Promise<AppOverrides> {
  return (await getUserRow(user)).overrides;
}

/** History on the server: at most 50 snapshots and at most this many JSON bytes (one DynamoDB item is 400 KB). */
export const HISTORY_SERVER_MAX = 50;
export const HISTORY_SERVER_BYTES = 300_000;
export function boundHistory(list: unknown): HistorySnapshot[] {
  if (!Array.isArray(list)) return [];
  const out: HistorySnapshot[] = [];
  let bytes = 0;
  for (const s of list.slice(0, HISTORY_SERVER_MAX)) {
    if (!s || typeof s !== "object" || typeof (s as HistorySnapshot).id !== "string") continue;
    const n = JSON.stringify(s).length;
    if (bytes + n > HISTORY_SERVER_BYTES) break;
    bytes += n;
    out.push(s as HistorySnapshot);
  }
  return out;
}

/** Writes the given parts and keeps the others as they were. */
export async function putUserRow(
  user: string,
  parts: { overrides?: AppOverrides; memory?: AgentMemory; history?: HistorySnapshot[] },
): Promise<void> {
  const { doc, Put } = await dynamo();
  const cur = await getUserRow(user);
  await doc.send(
    new Put({
      TableName: process.env.TDJ_DB_TABLE,
      Item: {
        pk: `user#${user}`,
        overrides: parts.overrides ?? cur.overrides,
        memory: parts.memory ?? cur.memory ?? undefined,
        history: parts.history ? boundHistory(parts.history) : cur.history,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}
export async function putOverrides(user: string, overrides: AppOverrides): Promise<void> {
  await putUserRow(user, { overrides });
}
