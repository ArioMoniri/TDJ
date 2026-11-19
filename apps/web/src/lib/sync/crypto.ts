import { parseCode } from "./code";

/**
 * End-to-end encryption of a sync space (docs/SYNC.md), WebCrypto only (browsers, the apps' web view, Node 20+).
 *
 * From the code's 130 random bits, HKDF-SHA-256 derives three independent values:
 * - `id`: the space's 256-bit id. A device sends it to the sync server as the capability to read and write the
 *   space; the server stores everything under SHA-256(id), so even its database never holds the id itself;
 * - an AES-256-GCM key that encrypts every record (random 96-bit IV per write);
 * - an HMAC-SHA-256 key that turns a record's name (`night:<id>`, `settings`…) into an opaque record id, so the
 *   server cannot tell nights from settings or count renames.
 * Each ciphertext is bound to its record id as additional data: a server that swaps two blobs only produces blobs
 * that fail to decrypt. The code itself never leaves the device.
 */
export interface SyncKeys {
  /** base64url of the 32-byte space id (the server's capability) */
  id: string;
  aes: CryptoKey;
  hmac: CryptoKey;
}

const te = new TextEncoder();
const td = new TextDecoder();
const SALT = te.encode("tdj-sync-v1");
const subtle = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: te.encode(info) });

/** The space id and keys of a code; throws on an invalid code. Deterministic: the same code, the same values. */
export async function deriveKeys(code: string): Promise<SyncKeys> {
  const canonical = parseCode(code);
  if (!canonical) throw new Error("invalid sync code");
  const ikm = await subtle().importKey("raw", te.encode(canonical), "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ]);
  const id = new Uint8Array(await subtle().deriveBits(hkdf("tdj-sync id"), ikm, 256));
  const aes = await subtle().deriveKey(
    hkdf("tdj-sync aes-gcm"),
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const hmac = await subtle().deriveKey(
    hkdf("tdj-sync record-id"),
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return { id: b64url(id), aes, hmac };
}

/** The opaque id of a record name: 128 bits of HMAC, base64url (22 characters). */
export async function recordId(keys: SyncKeys, name: string): Promise<string> {
  const mac = new Uint8Array(await subtle().sign("HMAC", keys.hmac, te.encode(`rid:${name}`)));
  return b64url(mac.slice(0, 16));
}

/** SHA-256 → base64url (the server's storage key of an id; the iCloud folder name of a space) */
export async function sha256(text: string): Promise<string> {
  return b64url(new Uint8Array(await subtle().digest("SHA-256", te.encode(text))));
}

// envelope: one format byte, the 12-byte IV, the AES-GCM ciphertext (with its 16-byte tag)
const RAW = 1;
const GZIP = 2;
export const IV_BYTES = 12;
export const MIN_BLOB_BYTES = 1 + IV_BYTES + 16;

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = new Blob([buf(bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const canGzip = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

/**
 * Encrypts a JSON value for one record (`aad`: its record id). Larger values are gzipped first (a night's JSON
 * shrinks about tenfold), so a night with its versions fits the server's per-record limit.
 */
export async function seal(keys: SyncKeys, value: unknown, aad: string): Promise<string> {
  let plain: Uint8Array = te.encode(JSON.stringify(value));
  let format = RAW;
  if (plain.length > 512 && canGzip()) {
    plain = await pipe(
      plain,
      new CompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
    format = GZIP;
  }
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: te.encode(`tdj-sync-v1|${aad}`) },
      keys.aes,
      buf(plain),
    ),
  );
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = format;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return b64url(out);
}

/** Decrypts what `seal` wrote; throws when the key, the record id or a single bit differs. */
export async function open<T = unknown>(keys: SyncKeys, blob: string, aad: string): Promise<T> {
  const bytes = fromB64url(blob);
  if (bytes.length < MIN_BLOB_BYTES || (bytes[0] !== RAW && bytes[0] !== GZIP))
    throw new Error("not a sync blob");
  const iv = bytes.slice(1, 1 + IV_BYTES);
  let plain: Uint8Array = new Uint8Array(
    await subtle().decrypt(
      { name: "AES-GCM", iv, additionalData: te.encode(`tdj-sync-v1|${aad}`) },
      keys.aes,
      buf(bytes.slice(1 + IV_BYTES)),
    ),
  );
  if (bytes[0] === GZIP)
    plain = await pipe(
      plain,
      new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
  return JSON.parse(td.decode(plain)) as T;
}

/** Whether a string has the shape of a sealed blob (what the server checks: it can check nothing more). */
export function looksSealed(blob: unknown): boolean {
  if (typeof blob !== "string" || !/^[A-Za-z0-9_-]+$/.test(blob)) return false;
  const n = Math.floor((blob.length * 3) / 4);
  if (n < MIN_BLOB_BYTES) return false;
  const first = fromB64url(blob.slice(0, 4))[0];
  return first === RAW || first === GZIP;
}
