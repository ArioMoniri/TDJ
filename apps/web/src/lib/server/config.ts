import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Runtime configuration for the hosted connectors, readable without a redeploy. Every key is resolved in order:
 *   1. the process environment (GitHub secrets forwarded by sst.config.ts, or a local shell),
 *   2. the config store: AWS Systems Manager Parameter Store SecureStrings under `/tdj/<stage>/<KEY>` on AWS
 *      (`TDJ_CONFIG_BACKEND=ssm`, the default on Lambda), or an in-process map for tests and local runs
 *      (`TDJ_CONFIG_BACKEND=memory`, optionally seeded from `TDJ_CONFIG_SEED` JSON),
 *   3. nothing.
 * The owner writes the store from /admin (lib/server/admin.ts). Reads are cached for 60 s per process; a store
 * that is unreachable (no AWS credentials on a laptop) counts as empty and is retried after the same 60 s.
 * Values never leave the server: the admin API only ever reports "configured" and the last characters of an ID.
 */
export const CONFIG_KEYS = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "DROPBOX_APP_KEY",
  "DROPBOX_APP_SECRET",
  "TDJ_COOKIE_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "SETUP_CODE",
  "OWNER_PASSPHRASE_HASH",
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type Config = Partial<Record<ConfigKey, string>>;
export type ConfigSource = "env" | "store";

/** Keys that only ever live in the store: the environment has no business carrying a one-time code or a hash. */
const STORE_ONLY: ReadonlySet<ConfigKey> = new Set<ConfigKey>(["SETUP_CODE", "OWNER_PASSPHRASE_HASH"]);

const TTL_MS = 60_000;
export const stage = () => process.env.TDJ_STAGE || process.env.SST_STAGE || "local";
export const parameterName = (key: ConfigKey) => `/tdj/${stage()}/${key}`;

/* ---------- backends ---------- */

interface Backend {
  readonly kind: "memory" | "ssm";
  /** every stored key at once (one call per cache refresh) */
  readAll(): Promise<Config>;
  write(key: ConfigKey, value: string, o?: { overwrite?: boolean }): Promise<void>;
  remove(key: ConfigKey): Promise<void>;
}

export class AlreadyExistsError extends Error {}

function memoryBackend(): Backend {
  const store = new Map<ConfigKey, string>();
  try {
    const seed = JSON.parse(process.env.TDJ_CONFIG_SEED || "{}") as Record<string, string>;
    for (const k of CONFIG_KEYS) if (typeof seed[k] === "string" && seed[k]) store.set(k, seed[k]);
  } catch {}
  return {
    kind: "memory",
    async readAll() {
      return Object.fromEntries(store) as Config;
    },
    async write(key, value, o) {
      if (o?.overwrite === false && store.has(key)) throw new AlreadyExistsError(key);
      store.set(key, value);
    },
    async remove(key) {
      store.delete(key);
    },
  };
}

/** The SDK is loaded on first use so route modules stay cheap and a laptop without it still builds. */
async function ssm() {
  const m = await import("@aws-sdk/client-ssm");
  const client = new m.SSMClient({ maxAttempts: 2, requestHandler: { requestTimeout: 4000 } });
  return { m, client };
}

function ssmBackend(): Backend {
  let conn: ReturnType<typeof ssm> | null = null;
  const get = () => {
    conn ??= ssm().catch((e) => {
      conn = null;
      throw e;
    });
    return conn;
  };
  return {
    kind: "ssm",
    async readAll() {
      const { m, client } = await get();
      const out: Config = {};
      const prefix = `/tdj/${stage()}/`;
      let NextToken: string | undefined;
      do {
        const r = await client.send(
          new m.GetParametersByPathCommand({ Path: prefix, WithDecryption: true, NextToken }),
        );
        for (const p of r.Parameters ?? []) {
          const key = p.Name?.slice(prefix.length) as ConfigKey | undefined;
          if (key && (CONFIG_KEYS as readonly string[]).includes(key) && p.Value) out[key] = p.Value;
        }
        NextToken = r.NextToken;
      } while (NextToken);
      return out;
    },
    async write(key, value, o) {
      const { m, client } = await get();
      try {
        await client.send(
          new m.PutParameterCommand({
            Name: parameterName(key),
            Value: value,
            Type: "SecureString",
            Overwrite: o?.overwrite !== false,
          }),
        );
      } catch (e) {
        if ((e as { name?: string }).name === "ParameterAlreadyExists") throw new AlreadyExistsError(key);
        throw e;
      }
    },
    async remove(key) {
      const { m, client } = await get();
      try {
        await client.send(new m.DeleteParameterCommand({ Name: parameterName(key) }));
      } catch (e) {
        if ((e as { name?: string }).name !== "ParameterNotFound") throw e;
      }
    },
  };
}

export type BackendKind = Backend["kind"];
export function backendKind(): BackendKind {
  const want = process.env.TDJ_CONFIG_BACKEND;
  if (want === "memory" || want === "ssm") return want;
  return process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.TDJ_STAGE ? "ssm" : "memory";
}

let backend: Backend | null = null;
const store = () => {
  backend ??= backendKind() === "ssm" ? ssmBackend() : memoryBackend();
  return backend;
};

/* ---------- cached reads ---------- */

interface Snapshot {
  at: number;
  stored: Config;
  /** the store could not be read (no credentials, no network); treated as empty until the next refresh */
  unavailable: boolean;
}
let snapshot: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

async function refresh(): Promise<Snapshot> {
  inflight ??= (async () => {
    let stored: Config = {};
    let unavailable = false;
    try {
      stored = await store().readAll();
    } catch (e) {
      unavailable = true;
      if (process.env.NODE_ENV !== "test")
        console.warn(`[tdj] config store (${store().kind}) unavailable: ${(e as Error).message}`);
    }
    snapshot = { at: Date.now(), stored, unavailable };
    return snapshot;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
async function current(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot;
  return refresh();
}

/** Forgets the cached store contents (after a write from /admin). Other Lambda instances catch up within 60 s. */
export function clearConfigCache() {
  snapshot = null;
}

const fromEnv = (key: ConfigKey) => (STORE_ONLY.has(key) ? undefined : process.env[key] || undefined);

/** Every key with its resolved value (environment first, then the store). */
export async function getConfig(): Promise<Config> {
  const s = await current();
  const out: Config = {};
  for (const k of CONFIG_KEYS) {
    const v = fromEnv(k) ?? s.stored[k];
    if (v) out[k] = v;
  }
  return out;
}
export async function getConfigValue(key: ConfigKey): Promise<string | undefined> {
  return (await getConfig())[key];
}
/** Where a key's value comes from, for the admin page ("set by the environment" fields are read-only there). */
export async function configSource(key: ConfigKey): Promise<ConfigSource | null> {
  if (fromEnv(key)) return "env";
  return (await current()).stored[key] ? "store" : null;
}
/** Whether the store answered on the last read; the admin page says so instead of failing silently. */
export async function storeAvailable(): Promise<boolean> {
  return !(await current()).unavailable;
}

/* ---------- writes (admin only) ---------- */

export async function setConfigValue(key: ConfigKey, value: string, o?: { overwrite?: boolean }) {
  await store().write(key, value, o);
  clearConfigCache();
}
export async function deleteConfigValue(key: ConfigKey) {
  await store().remove(key);
  clearConfigCache();
}

/* ---------- the cookie secret ---------- */

let generated: string | null = null;
/**
 * The key material for sealed cookies: `TDJ_COOKIE_SECRET` from the environment or the store, else one generated
 * here and kept in the store (`Overwrite: false`, so two cold Lambdas racing agree on the first writer's secret).
 * Without a writable store the process falls back to a per-process secret (local runs), after the Spotify secret
 * when there is one so a laptop with the GitHub-secrets setup behaves as before.
 */
export async function getCookieSecret(): Promise<string> {
  const configured = await getConfigValue("TDJ_COOKIE_SECRET");
  if (configured) return configured;
  if (generated) return generated;
  const fresh = randomBytes(32).toString("base64url");
  try {
    await store().write("TDJ_COOKIE_SECRET", fresh, { overwrite: false });
    clearConfigCache();
    generated = fresh;
  } catch (e) {
    if (e instanceof AlreadyExistsError) {
      clearConfigCache();
      const again = await getConfigValue("TDJ_COOKIE_SECRET");
      if (again) return again;
    }
    generated = process.env.SPOTIFY_CLIENT_SECRET || process.env.TDJ_SECRET || fresh;
  }
  return generated;
}
