import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppOverrides } from "@/lib/types";

/** Optional server storage: DynamoDB table named by TDJ_DB_TABLE, rows keyed by a signed anonymous user id. */
export function dbEnabled() {
  return !!process.env.TDJ_DB_TABLE;
}

const COOKIE = "tdj_uid";
const secret = () => process.env.TDJ_SECRET || process.env.TDJ_DB_TABLE || "tdj-dev-secret";
const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url");

/** Returns the user id from the signed cookie, or mints a new one (and the Set-Cookie header to send back). */
export function userFromRequest(req: Request): { id: string; setCookie?: string } {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (m) {
    const [id, sig] = decodeURIComponent(m[1]!).split(".");
    if (id && sig) {
      const want = Buffer.from(sign(id));
      const got = Buffer.from(sig);
      if (want.length === got.length && timingSafeEqual(want, got)) return { id };
    }
  }
  const id = randomBytes(12).toString("base64url");
  const value = encodeURIComponent(`${id}.${sign(id)}`);
  return {
    id,
    setCookie: `${COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}

interface DocClient {
  send(cmd: unknown): Promise<{ Item?: { overrides?: AppOverrides } }>;
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

export async function getOverrides(user: string): Promise<AppOverrides> {
  const { doc, Get } = await dynamo();
  const r = await doc.send(new Get({ TableName: process.env.TDJ_DB_TABLE, Key: { pk: `user#${user}` } }));
  return r.Item?.overrides ?? {};
}

export async function putOverrides(user: string, overrides: AppOverrides): Promise<void> {
  const { doc, Put } = await dynamo();
  await doc.send(
    new Put({
      TableName: process.env.TDJ_DB_TABLE,
      Item: { pk: `user#${user}`, overrides, updatedAt: new Date().toISOString() },
    }),
  );
}
