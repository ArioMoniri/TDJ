import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  backendKind,
  type ConfigKey,
  configSource,
  deleteConfigValue,
  getConfig,
  setConfigValue,
  stage,
  storeAvailable,
} from "./config";
import { clearCookieHeader, cookieHeader, readCookie, requestOrigin, seal, unseal } from "./cookies";
import {
  type Credentials,
  DROPBOX,
  GOOGLE,
  PROVIDERS,
  type Provider,
  rawTokenRequest,
  SPOTIFY,
} from "./oauth";

/**
 * Owner setup (/admin): the deploy workflow leaves a one-time setup code in the config store; the owner unlocks
 * with it, chooses a passphrase (scrypt hash in the store, the code is then deleted) and pastes the provider
 * credentials, which land in the store as SecureStrings. Nothing here ever returns a secret: the status reports
 * "configured" and the last characters of an ID. The session is a sealed httpOnly `tdj_admin` cookie (12 h).
 */
const scrypt = (pw: string, salt: Buffer, keylen: number, o: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw, salt, keylen, o, (err, key) => (err ? reject(err) : resolve(key))),
  );
export const ADMIN_COOKIE = "tdj_admin";
const SESSION_HOURS = 12;
/** a setup code is good for one day after the deploy that issued it (the Actions summary is not a secret store) */
export const SETUP_CODE_TTL_MS = 24 * 3600_000;
export const PASSPHRASE_MIN = 8;

/* ---------- passphrase ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(passphrase.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [algo, n, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !n || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(passphrase.normalize("NFKC"), Buffer.from(salt, "base64url"), want.length, {
    ...SCRYPT,
    N: Number(n),
  });
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ---------- setup code ---------- */

/** The workflow stores `<hex>.<unix seconds>`; a bare code (written by hand) never expires. */
export function parseSetupCode(stored: string | undefined): { code: string; expired: boolean } | null {
  if (!stored) return null;
  const [code, issued] = stored.split(".");
  if (!code) return null;
  const at = Number(issued);
  const expired = !!issued && Number.isFinite(at) && Date.now() - at * 1000 > SETUP_CODE_TTL_MS;
  return { code, expired };
}
const sameString = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/* ---------- rate limit (per process; Lambda instances each keep their own, plus the 1 s delay) ---------- */

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { n: number; until: number }>();
export function clientKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cloudfront-viewer-address")?.replace(/:\d+$/, "") ||
    "local"
  );
}
/** true when this client may try again; a failure is recorded with `recordFailure`. */
export function allowAttempt(key: string): boolean {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) return true;
  return a.n < MAX_ATTEMPTS;
}
export function recordFailure(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { n: 1, until: now + WINDOW_MS });
  else a.n++;
  if (attempts.size > 10_000) attempts.clear();
}
export const clearFailures = (key: string) => attempts.delete(key);
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- unlock ---------- */

export type UnlockResult = { ok: true; via: "code" | "passphrase" } | { ok: false; reason: string };
export async function tryUnlock(secret: string): Promise<UnlockResult> {
  const c = await getConfig();
  if (c.OWNER_PASSPHRASE_HASH && (await verifyPassphrase(secret, c.OWNER_PASSPHRASE_HASH)))
    return { ok: true, via: "passphrase" };
  const code = parseSetupCode(c.SETUP_CODE);
  if (code && sameString(secret.trim().toLowerCase(), code.code.toLowerCase())) {
    if (code.expired)
      return { ok: false, reason: "That setup code is older than a day. Deploy again for a fresh one." };
    return { ok: true, via: "code" };
  }
  if (!c.OWNER_PASSPHRASE_HASH && !code)
    return {
      ok: false,
      reason:
        backendKind() === "ssm"
          ? "No setup code is stored for this deployment yet. Run Deploy to AWS once more and copy the code from the run summary."
          : 'No setup code is stored. Start the server with TDJ_CONFIG_SEED={"SETUP_CODE":"…"} or set a passphrase through the environment.',
    };
  return { ok: false, reason: "That code or passphrase is not right." };
}

/* ---------- session ---------- */

interface AdminSession {
  admin: true;
  exp: number;
}
export async function isAdmin(req: Request): Promise<boolean> {
  const s = await unseal<AdminSession>(readCookie(req, ADMIN_COOKIE));
  return !!s && s.admin === true && typeof s.exp === "number" && s.exp > Date.now();
}
export async function adminCookie(origin: string): Promise<string> {
  const value = await seal({
    admin: true,
    exp: Date.now() + SESSION_HOURS * 3600_000,
  } satisfies AdminSession);
  return cookieHeader(ADMIN_COOKIE, value, {
    maxAge: SESSION_HOURS * 3600,
    secure: origin.startsWith("https://"),
    sameSite: "Strict",
  });
}
export const clearAdminCookie = () => clearCookieHeader(ADMIN_COOKIE);
export const forbidden = () => NextResponse.json({ error: "Unlock the owner setup first" }, { status: 401 });

/* ---------- providers ---------- */

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** last 4 characters of the client id (never the secret) */
  idHint: string | null;
  /** "env" when the deployment's environment sets it (read-only on /admin), "store" when the owner saved it */
  source: "env" | "store" | null;
  redirectUris: string[];
}
const hint = (s: string | undefined) => (s ? `…${s.slice(-4)}` : null);

export async function providerStatus(req: Request): Promise<ProviderStatus[]> {
  const origin = await requestOrigin(req);
  const c = await getConfig();
  const out: ProviderStatus[] = [];
  for (const id of PROVIDER_IDS) {
    const p = PROVIDERS[id];
    const idv = c[p.idKey];
    const sv = c[p.secretKey];
    const src = (await configSource(p.idKey)) ?? (await configSource(p.secretKey));
    const uris = [`${origin}/api/${p.id}/callback`];
    if (p.id === "spotify") uris.push(`${origin}/callback`); // the BYO PKCE page keeps working alongside
    out.push({
      id,
      label: p.label,
      configured: !!(idv && sv),
      idHint: hint(idv),
      source: idv && sv ? src : null,
      redirectUris: uris,
    });
  }
  return out;
}

export interface AdminStatus {
  unlocked: boolean;
  hasPassphrase: boolean;
  hasSetupCode: boolean;
  stage: string;
  backend: "memory" | "ssm";
  storeAvailable: boolean;
  origin: string;
  /** NEXT_PUBLIC_APP_URL as resolved (environment or store), null when the origin comes from the request */
  publicUrl: { value: string; source: "env" | "store" } | null;
  providers?: ProviderStatus[];
}
export async function adminStatus(req: Request): Promise<AdminStatus> {
  const unlocked = await isAdmin(req);
  const c = await getConfig();
  const code = parseSetupCode(c.SETUP_CODE);
  const base: AdminStatus = {
    unlocked,
    hasPassphrase: !!c.OWNER_PASSPHRASE_HASH,
    hasSetupCode: !!code && !code.expired,
    stage: stage(),
    backend: backendKind(),
    storeAvailable: await storeAvailable(),
    origin: await requestOrigin(req),
    publicUrl: null,
  };
  if (!unlocked) return base;
  const src = await configSource("NEXT_PUBLIC_APP_URL");
  if (c.NEXT_PUBLIC_APP_URL && src) base.publicUrl = { value: c.NEXT_PUBLIC_APP_URL, source: src };
  base.providers = await providerStatus(req);
  return base;
}

/* ---------- writes ---------- */

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const MAX_LEN = 512;
export interface SaveBody {
  spotify?: { clientId?: string; clientSecret?: string; remove?: boolean };
  google?: { clientId?: string; clientSecret?: string; remove?: boolean };
  dropbox?: { clientId?: string; clientSecret?: string; remove?: boolean };
  publicUrl?: string | null;
}
/**
 * Writes what was given: a provider needs both fields to be saved (a half-pasted pair is refused), `remove` deletes
 * both; `publicUrl` "" or null clears it. Keys set by the environment cannot be changed here and are reported.
 */
export async function saveConfig(body: SaveBody): Promise<{ saved: string[]; errors: string[] }> {
  const saved: string[] = [];
  const errors: string[] = [];
  const envLocked = async (k: ConfigKey) => (await configSource(k)) === "env";
  for (const id of PROVIDER_IDS) {
    const p = PROVIDERS[id];
    const b = body[id];
    if (!b) continue;
    if (await envLocked(p.idKey)) {
      errors.push(`${p.label} is set by the deployment's environment (GitHub secret); change it there.`);
      continue;
    }
    if (b.remove) {
      await deleteConfigValue(p.idKey);
      await deleteConfigValue(p.secretKey);
      saved.push(`${p.label} removed`);
      continue;
    }
    const cid = clean(b.clientId);
    const sec = clean(b.clientSecret);
    if (!cid && !sec) continue;
    if (!cid || !sec) {
      errors.push(`${p.label}: paste both the ${id === "dropbox" ? "app key" : "client ID"} and the secret.`);
      continue;
    }
    if (cid.length > MAX_LEN || sec.length > MAX_LEN || /\s/.test(cid) || /\s/.test(sec)) {
      errors.push(`${p.label}: that does not look like a credential (spaces or too long).`);
      continue;
    }
    await setConfigValue(p.idKey, cid);
    await setConfigValue(p.secretKey, sec);
    saved.push(p.label);
  }
  if (body.publicUrl !== undefined) {
    if (await envLocked("NEXT_PUBLIC_APP_URL"))
      errors.push("The public URL is set by the deployment's environment (NEXT_PUBLIC_APP_URL).");
    else {
      const u = clean(body.publicUrl).replace(/\/$/, "");
      if (!u) {
        await deleteConfigValue("NEXT_PUBLIC_APP_URL");
        saved.push("Public URL cleared");
      } else if (!/^https?:\/\/[^\s/]+$/i.test(u))
        errors.push("The public URL must be an origin like https://dj.example.com");
      else {
        await setConfigValue("NEXT_PUBLIC_APP_URL", u);
        saved.push("Public URL");
      }
    }
  }
  return { saved, errors };
}

export async function setPassphrase(passphrase: string): Promise<void> {
  await setConfigValue("OWNER_PASSPHRASE_HASH", await hashPassphrase(passphrase));
  await deleteConfigValue("SETUP_CODE");
}

/* ---------- provider tests ---------- */

export interface TestResult {
  ok: boolean;
  text: string;
}
/**
 * Proves the saved credentials against the provider without a user: Spotify issues a client-credentials token;
 * Google and Dropbox have no such grant, so a bogus authorization code is sent to the token endpoint and the
 * answer tells the two apart: `invalid_grant` means the client authenticated, `invalid_client` means it did not.
 */
export async function testProvider(id: ProviderId): Promise<TestResult> {
  const p: Provider = PROVIDERS[id];
  const c = await getConfig();
  const idv = c[p.idKey];
  const sv = c[p.secretKey];
  if (!idv || !sv) return { ok: false, text: `${p.label} is not configured yet.` };
  const cred: Credentials = { id: idv, secret: sv };
  try {
    if (p === SPOTIFY) {
      const r = await rawTokenRequest(p, cred, { grant_type: "client_credentials" });
      if (r.ok) return { ok: true, text: "Spotify accepted the Client ID and secret." };
      const j = (await r.json().catch(() => ({}))) as { error?: string; error_description?: string };
      return {
        ok: false,
        text: `Spotify answered ${r.status}${j.error ? ` (${j.error_description ?? j.error})` : ""}. Check the Client ID and secret in the Spotify dashboard.`,
      };
    }
    const r = await rawTokenRequest(p, cred, {
      grant_type: "authorization_code",
      code: "tdj-credential-check",
      redirect_uri: "https://127.0.0.1/api/tdj/check",
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; error_description?: string };
    const err = (j.error ?? "").toLowerCase();
    if (
      r.ok ||
      err === "invalid_grant" ||
      err === "invalid_request" ||
      (p === DROPBOX && r.status === 400 && !err.includes("client"))
    )
      return {
        ok: true,
        text: `${p.label} accepted the ${p === GOOGLE ? "Client ID" : "app key"} and secret.`,
      };
    return {
      ok: false,
      text: `${p.label} answered ${r.status}${err ? ` (${err})` : ""}. Check the ${p === GOOGLE ? "Client ID" : "app key"} and secret.`,
    };
  } catch (e) {
    return { ok: false, text: `Could not reach ${p.label}: ${(e as Error).message}` };
  }
}
