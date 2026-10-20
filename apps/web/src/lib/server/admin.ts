import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { AiProvider } from "@/lib/types";
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
import { clientKey } from "./guard";
import { AI_DAILY_DEFAULT, complete, isProvider, LlmError, modelFor, sharedAi } from "./llm";
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

/* ---------- rate limit ---------- */

/**
 * Two limits guard the unlock, on top of scrypt and the 1 s delay per attempt. Per client (the address CloudFront
 * appended, lib/server/guard.ts; a caller-chosen `X-Forwarded-For` element never counts): 5 failures in 10 min,
 * kept in this process. Deployment-wide: `UNLOCK_FAILURES` in the config store (`<count>.<window start>`),
 * 20 failures per hour from anyone, so rotating addresses or Lambda instances does not restart the budget.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
export const GLOBAL_WINDOW_S = 3600;
export const GLOBAL_MAX_ATTEMPTS = 20;
const attempts = new Map<string, { n: number; until: number }>();

export { clientKey };
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

async function globalFailures(): Promise<{ n: number; start: number }> {
  const raw = (await getConfig()).UNLOCK_FAILURES ?? "";
  const [n, start] = raw.split(".").map(Number);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(n) || !Number.isFinite(start) || now - start! > GLOBAL_WINDOW_S)
    return { n: 0, start: now };
  return { n: n!, start: start! };
}
/** true while the whole deployment is under its hourly budget of failed unlocks. */
export async function allowGlobalAttempt(): Promise<boolean> {
  return (await globalFailures()).n < GLOBAL_MAX_ATTEMPTS;
}
export async function recordGlobalFailure(): Promise<void> {
  const g = await globalFailures();
  await setConfigValue("UNLOCK_FAILURES", `${g.n + 1}.${g.start}`).catch(() => {});
}
/** a successful unlock closes the window (whoever got in holds the passphrase anyway) */
export async function clearGlobalFailures(): Promise<void> {
  if ((await getConfig()).UNLOCK_FAILURES) await deleteConfigValue("UNLOCK_FAILURES").catch(() => {});
}

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

/* ---------- people: the seats each provider grants a development app (docs/OWNER_GUIDE.md) ---------- */

/** Verified 2026-10-19: Spotify Development Mode 5 users, Google unverified app 100 test users, Dropbox 50 before production. */
export const SEAT_LIMITS: Record<ProviderId, number> = { spotify: 5, google: 100, dropbox: 50 };
const SEAT_KEYS: Record<ProviderId, ConfigKey> = {
  spotify: "SPOTIFY_SEATS",
  google: "GOOGLE_SEATS",
  dropbox: "DROPBOX_SEATS",
};
const parseSeats = (raw: string | undefined) =>
  (raw ?? "")
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
export type Seats = Record<ProviderId, string[]>;
async function seatLists(): Promise<Seats> {
  const c = await getConfig();
  return {
    spotify: parseSeats(c.SPOTIFY_SEATS),
    google: parseSeats(c.GOOGLE_SEATS),
    dropbox: parseSeats(c.DROPBOX_SEATS),
  };
}

export interface SharedAiStatus {
  configured: boolean;
  provider: AiProvider;
  model: string;
  dailyLimit: number;
  /** last 4 characters of the key (never the key) */
  keyHint: string | null;
  hasWorkspace: boolean;
  source: "env" | "store" | null;
}
/** The shared key as `sharedAi()` resolves it (the store, else the deployment's ANTHROPIC_API_KEY); never the key. */
async function sharedAiStatus(): Promise<SharedAiStatus> {
  const s = await sharedAi();
  if (!s)
    return {
      configured: false,
      provider: "anthropic",
      model: "",
      dailyLimit: AI_DAILY_DEFAULT,
      keyHint: null,
      hasWorkspace: false,
      source: null,
    };
  return {
    configured: true,
    provider: s.provider,
    model: s.model,
    dailyLimit: s.dailyLimit,
    keyHint: hint(s.key),
    hasWorkspace: !!s.workspace,
    source: s.source === "store" ? ((await configSource("AI_KEY")) ?? "store") : "env",
  };
}

/**
 * GET /api/admin/public: what any DJ may know without unlocking anything. Which logins exist, how many of each
 * provider's seats the organiser has handed out (counts, never the e-mails), how to reach the organiser and
 * whether a shared model key exists. No secret, no hint of one.
 */
export interface PublicStatus {
  providers: Record<ProviderId, boolean>;
  ownerContact: string;
  seats: Record<ProviderId, { used: number; max: number }>;
  ai: { shared: boolean; dailyLimit: number };
  /** no owner passphrase yet: Settings points at /admin. Whether a setup code exists is not public. */
  setupNeeded: boolean;
}
export async function publicStatus(): Promise<PublicStatus> {
  const c = await getConfig();
  const seats = await seatLists();
  const ai = await sharedAiStatus();
  return {
    setupNeeded: !c.OWNER_PASSPHRASE_HASH,
    providers: {
      spotify: !!(c.SPOTIFY_CLIENT_ID && c.SPOTIFY_CLIENT_SECRET),
      google: !!(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET),
      dropbox: !!(c.DROPBOX_APP_KEY && c.DROPBOX_APP_SECRET),
    },
    ownerContact: c.OWNER_CONTACT ?? "",
    seats: {
      spotify: { used: seats.spotify.length, max: SEAT_LIMITS.spotify },
      google: { used: seats.google.length, max: SEAT_LIMITS.google },
      dropbox: { used: seats.dropbox.length, max: SEAT_LIMITS.dropbox },
    },
    ai: { shared: ai.configured, dailyLimit: ai.dailyLimit },
  };
}

export interface AdminStatus {
  unlocked: boolean;
  hasPassphrase: boolean;
  /**
   * unlocked: whether an unexpired setup code is stored. Locked: only "owner setup still needed" (no passphrase
   * yet), so a visitor cannot learn that a live code is waiting to be guessed.
   */
  hasSetupCode: boolean;
  stage: string;
  backend: "memory" | "ssm";
  storeAvailable: boolean;
  origin: string;
  /** NEXT_PUBLIC_APP_URL as resolved (environment or store), null when the origin comes from the request */
  publicUrl: { value: string; source: "env" | "store" } | null;
  providers?: ProviderStatus[];
  /** owner only: the seat lists as pasted, the organiser contact and the shared model key's status */
  seats?: Seats;
  seatLimits?: Record<ProviderId, number>;
  ownerContact?: string;
  ai?: SharedAiStatus;
}
export async function adminStatus(req: Request): Promise<AdminStatus> {
  const unlocked = await isAdmin(req);
  const c = await getConfig();
  const code = parseSetupCode(c.SETUP_CODE);
  const base: AdminStatus = {
    unlocked,
    hasPassphrase: !!c.OWNER_PASSPHRASE_HASH,
    hasSetupCode: unlocked ? !!code && !code.expired : !c.OWNER_PASSPHRASE_HASH,
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
  base.seats = await seatLists();
  base.seatLimits = SEAT_LIMITS;
  base.ownerContact = c.OWNER_CONTACT ?? "";
  base.ai = await sharedAiStatus();
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
  /** how DJs reach the organiser (an e-mail, a phone, a chat handle); "" clears it */
  ownerContact?: string | null;
  /** the seat lists, one e-mail per entry; each list replaces the stored one */
  seats?: Partial<Record<ProviderId, string[] | string>>;
  /** the shared model key for everyone; `remove` deletes all of it */
  ai?: {
    provider?: string;
    key?: string;
    model?: string;
    workspaceId?: string;
    dailyLimit?: number | string;
    remove?: boolean;
  };
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
  if (body.ownerContact !== undefined) {
    const v = clean(body.ownerContact).slice(0, 200);
    if (v) await setConfigValue("OWNER_CONTACT", v);
    else await deleteConfigValue("OWNER_CONTACT");
    saved.push(v ? "Organiser contact" : "Organiser contact cleared");
  }
  if (body.seats && typeof body.seats === "object") {
    for (const id of PROVIDER_IDS) {
      const raw = body.seats[id];
      if (raw === undefined) continue;
      const list = [
        ...new Set(
          parseSeats(Array.isArray(raw) ? raw.map(String).join("\n") : String(raw)).map((e) =>
            e.toLowerCase(),
          ),
        ),
      ];
      if (list.length > SEAT_LIMITS[id]) {
        errors.push(`${PROVIDERS[id].label}: ${SEAT_LIMITS[id]} seats at most; ${list.length} given.`);
        continue;
      }
      if (list.some((e) => e.length > 120 || !e.includes("@"))) {
        errors.push(`${PROVIDERS[id].label}: one e-mail address per line.`);
        continue;
      }
      if (list.length) await setConfigValue(SEAT_KEYS[id], list.join("\n"));
      else await deleteConfigValue(SEAT_KEYS[id]);
      saved.push(`${PROVIDERS[id].label} seats`);
    }
  }
  if (body.ai) {
    if (await envLocked("AI_KEY"))
      errors.push("The shared model key is set by the deployment's environment.");
    else if (body.ai.remove) {
      for (const k of ["AI_PROVIDER", "AI_KEY", "AI_MODEL", "AI_WORKSPACE_ID", "AI_DAILY_LIMIT"] as const)
        await deleteConfigValue(k);
      saved.push("Shared model key removed");
    } else {
      const key = clean(body.ai.key);
      const provider = clean(body.ai.provider);
      const limit = Math.floor(Number(body.ai.dailyLimit ?? AI_DAILY_DEFAULT));
      const current = await getConfig();
      if (!key && !current.AI_KEY) errors.push("Paste the model key first.");
      else if (!isProvider(provider)) errors.push("Choose a provider.");
      else if (key && (key.length > MAX_LEN || /\s/.test(key)))
        errors.push("That does not look like a model key (spaces or too long).");
      else if (!Number.isFinite(limit) || limit < 1 || limit > 1000)
        errors.push("The daily limit per DJ must be between 1 and 1000.");
      else {
        if (key) await setConfigValue("AI_KEY", key);
        await setConfigValue("AI_PROVIDER", provider);
        const model = clean(body.ai.model).slice(0, 120);
        if (model) await setConfigValue("AI_MODEL", model);
        else await deleteConfigValue("AI_MODEL");
        const ws = clean(body.ai.workspaceId).slice(0, 120);
        if (ws && provider === "anthropic") await setConfigValue("AI_WORKSPACE_ID", ws);
        else await deleteConfigValue("AI_WORKSPACE_ID");
        await setConfigValue("AI_DAILY_LIMIT", String(limit));
        saved.push("Shared model key");
      }
    }
  }
  return { saved, errors };
}

/** One ping with the shared key, the way Settings → Test connection does it with a personal key. */
export async function testSharedAi(): Promise<TestResult> {
  const s = await sharedAi();
  if (!s) return { ok: false, text: "No shared model key is saved yet." };
  const model = modelFor(s.provider, s.model);
  try {
    const text = await complete({
      provider: s.provider,
      key: s.key,
      model,
      workspace: s.workspace,
      system: "You are a connection test. Reply with the single word OK.",
      user: "ping",
      maxTokens: 16,
    });
    return {
      ok: true,
      text: `The model (${model}) answered "${text.trim().slice(0, 40)}". DJs without a key of their own now get reviews.`,
    };
  } catch (e) {
    const msg = e instanceof LlmError ? e.message : (e as Error).message;
    return {
      ok: false,
      text: /not scoped to a workspace/i.test(msg)
        ? "This key needs a workspace: paste its Workspace ID or create the key inside a workspace at console.anthropic.com → API keys."
        : `The provider refused the key (model ${model}): ${msg.slice(0, 200)}`,
    };
  }
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
 * answer tells the two apart: `invalid_grant` means the client authenticated and the code was then rejected;
 * anything else (`invalid_client`, and also `invalid_request`, which Google sends for a malformed request
 * *before* it checks the secret) is reported with the provider's own error word.
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
    if (r.ok || err === "invalid_grant" || (p === DROPBOX && r.status === 400 && !err.includes("client")))
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
