import { type NightFile, parseNightFile } from "./night";

/**
 * The share-link codec (ROADMAP §13): a night packed into a URL fragment, so it never reaches a server log. The
 * payload is `n1.` + base64url(deflate-raw(JSON)); CompressionStream does the deflate in browsers, in the apps'
 * web views and in Node ≥ 18. A link past `MAX_LINK_PAYLOAD` characters is refused (messengers and some browsers cut
 * long URLs): the share sheet offers the file or a short link instead. Decoding stops at `MAX_NIGHT_BYTES` of JSON,
 * so a crafted link cannot inflate into a huge document.
 */
export const NIGHT_LINK_PREFIX = "n1.";
/** characters of the fragment payload a link may carry */
export const MAX_LINK_PAYLOAD = 24_000;
/** bytes of JSON a payload may inflate to */
export const MAX_NIGHT_BYTES = 1_000_000;

export class NightLinkError extends Error {
  constructor(
    message: string,
    readonly code: "too-large" | "damaged" | "unsupported",
  ) {
    super(message);
  }
}

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new NightLinkError("This link is damaged.", "damaged");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new NightLinkError("This link is damaged.", "damaged");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(
  bytes: Uint8Array,
  t: { readable: ReadableStream; writable: WritableStream },
  max: number,
) {
  const writer = t.writable.getWriter();
  const done = writer.write(bytes as unknown as BufferSource).then(() => writer.close());
  done.catch(() => {});
  const reader = t.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    total += (value as Uint8Array).length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new NightLinkError("This night is too large to open from a link.", "too-large");
    }
    parts.push(value as Uint8Array);
  }
  await done;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const hasStreams = () =>
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

/** The night as a link payload (`n1.…`). Throws `NightLinkError("too-large")` past `max` characters. */
export async function encodeNightPayload(n: NightFile, max = MAX_LINK_PAYLOAD): Promise<string> {
  if (!hasStreams()) throw new NightLinkError("This browser cannot make share links.", "unsupported");
  const json = new TextEncoder().encode(JSON.stringify(n));
  const packed = await pipe(json, new CompressionStream("deflate-raw"), Number.POSITIVE_INFINITY);
  const out = NIGHT_LINK_PREFIX + toB64url(packed);
  if (out.length > max)
    throw new NightLinkError("This night is too long for a link. Share the file instead.", "too-large");
  return out;
}

/** The night a payload (`n1.…`) carries, checked as a `.tdjnight` document. */
export async function decodeNightPayload(payload: string): Promise<NightFile> {
  const p = payload.trim();
  if (!p.startsWith(NIGHT_LINK_PREFIX)) throw new NightLinkError("This link is not a T-DJ night.", "damaged");
  if (p.length > MAX_LINK_PAYLOAD * 4)
    throw new NightLinkError("This night is too large to open from a link.", "too-large");
  if (!hasStreams()) throw new NightLinkError("This browser cannot open share links.", "unsupported");
  const bytes = fromB64url(p.slice(NIGHT_LINK_PREFIX.length));
  let json: Uint8Array;
  try {
    json = await pipe(bytes, new DecompressionStream("deflate-raw"), MAX_NIGHT_BYTES);
  } catch (e) {
    if (e instanceof NightLinkError) throw e;
    throw new NightLinkError("This link is damaged.", "damaged");
  }
  try {
    return parseNightFile(new TextDecoder().decode(json));
  } catch (e) {
    throw new NightLinkError((e as Error).message || "This link is damaged.", "damaged");
  }
}

/** `https://host/night#n1.…` */
export function nightLink(origin: string, payload: string): string {
  return `${origin.replace(/\/$/, "")}/night#${payload}`;
}
/** `tdj://night#n1.…`: opens straight in the Mac and iPad apps */
export function appNightLink(payload: string): string {
  return `tdj://night#${payload}`;
}
/** The payload in a share link, an app link or a bare fragment; null when there is none. */
export function payloadFromLink(link: string): string | null {
  const i = link.indexOf("#");
  const frag = (i >= 0 ? link.slice(i + 1) : link).trim();
  return frag.startsWith(NIGHT_LINK_PREFIX) ? frag : null;
}
