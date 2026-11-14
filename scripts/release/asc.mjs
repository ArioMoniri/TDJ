// App Store Connect API client (no dependencies): ES256 JWT from the team API key + JSON:API requests.
// Docs: https://developer.apple.com/documentation/appstoreconnectapi
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const API = "https://api.appstoreconnect.apple.com";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** A 20-minute (Apple's maximum) ES256 token for the App Store Connect API. */
export function makeToken({ keyId, issuerId, privateKey, now = Math.floor(Date.now() / 1000), ttl = 1200 }) {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat: now, exp: now + Math.min(ttl, 1200), aud: "appstoreconnect-v1" };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = sign("sha256", Buffer.from(data), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${b64url(sig)}`;
}

/**
 * Where the key comes from, in order: APP_STORE_CONNECT_PRIVATE_KEY (text, CI secret),
 * APP_STORE_CONNECT_KEY_PATH, ~/.appstoreconnect/private_keys/AuthKey_TDJ.p8 (the rented Mac),
 * ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 (Apple's own naming).
 */
export function loadKey(env = process.env, home = homedir()) {
  const keyId = env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = env.APP_STORE_CONNECT_ISSUER_ID;
  if (!keyId || !issuerId)
    throw new AscError("Set APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID.");
  if (env.APP_STORE_CONNECT_PRIVATE_KEY?.includes("PRIVATE KEY")) {
    return { keyId, issuerId, privateKey: env.APP_STORE_CONNECT_PRIVATE_KEY, path: null };
  }
  const dir = join(home, ".appstoreconnect", "private_keys");
  const candidates = [
    env.APP_STORE_CONNECT_KEY_PATH,
    join(dir, "AuthKey_TDJ.p8"),
    join(dir, `AuthKey_${keyId}.p8`),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return { keyId, issuerId, privateKey: readFileSync(p, "utf8"), path: p };
  }
  throw new AscError(
    `No App Store Connect key found (tried the env and ${candidates.filter(Boolean).join(", ")}).`,
  );
}

export class AscError extends Error {
  constructor(message, { status = 0, errors = [] } = {}) {
    super(message);
    this.name = "AscError";
    this.status = status;
    this.errors = errors;
  }
  /** e.g. "ENTITY_ERROR.ATTRIBUTE.INVALID" */
  get codes() {
    return this.errors.map((e) => e.code ?? "");
  }
}

export function createClient({ keyId, issuerId, privateKey, fetchImpl = globalThis.fetch, base = API }) {
  let token = null;
  let tokenExp = 0;
  const auth = () => {
    const now = Math.floor(Date.now() / 1000);
    if (!token || now > tokenExp - 60) {
      token = makeToken({ keyId, issuerId, privateKey, now });
      tokenExp = now + 1200;
    }
    return token;
  };
  async function request(method, path, body) {
    const res = await fetchImpl(base + path, {
      method,
      headers: {
        authorization: `Bearer ${auth()}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const errors = json?.errors ?? [];
      const detail = errors.map((e) => `${e.title ?? ""}: ${e.detail ?? ""}`.trim()).join("; ");
      throw new AscError(`${method} ${path} → ${res.status} ${detail}`, { status: res.status, errors });
    }
    return json;
  }
  /** GET every page of a collection. */
  async function all(path) {
    const out = [];
    let next = path;
    while (next) {
      const page = await request("GET", next);
      out.push(...(page?.data ?? []));
      const link = page?.links?.next;
      next = link ? link.replace(base, "") : null;
    }
    return out;
  }
  return {
    request,
    all,
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    patch: (p, b) => request("PATCH", p, b),
    del: (p) => request("DELETE", p),
  };
}
