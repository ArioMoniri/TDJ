/**
 * Sync codes (docs/SYNC.md). A code is the only secret of a sync space: every device that knows it derives the same
 * space id and the same encryption key from it (crypto.ts), so whoever runs the server never sees the code or the
 * data. It reads `tango-k7m2-9qxr-…`: 26 random Crockford base32 characters (130 bits) and 2 check characters, in
 * groups of four. The alphabet has no i, l, o or u, and the reader forgives them (i/l → 1, o → 0), case, spaces and
 * dashes, so a code typed from a phone screen still works. It is language-neutral on purpose: no English words on
 * a Turkish screen.
 */
export const CODE_PREFIX = "tango";
/** Crockford base32, lowercase */
export const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
/** random characters (5 bits each: 130 bits) */
export const DATA_CHARS = 26;
const CHECK_CHARS = 2;
const GROUP = 4;

const charValue = (c: string) => ALPHABET.indexOf(c);

/** two check characters: weighted sums mod 31 (a prime above the length), so any single typo or swap is caught */
function check(data: string): string {
  let a = 0;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    const v = charValue(data[i]!);
    a = (a + v * (i + 1)) % 31;
    b = (b + v * (i + 1) * (i + 1)) % 31;
  }
  return ALPHABET[a]! + ALPHABET[b]!;
}

/** `tango-` and the 28 characters in groups of four */
export function formatCode(canonical: string): string {
  const full = canonical + check(canonical);
  const groups = full.match(new RegExp(`.{1,${GROUP}}`, "g")) ?? [];
  return [CODE_PREFIX, ...groups].join("-");
}

/** A new code from the system's random source. */
export function newCode(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(DATA_CHARS);
  let s = "";
  // 256 is a multiple of 32: the low five bits of a uniform byte are uniform
  for (const b of bytes) s += ALPHABET[b & 31];
  return formatCode(s);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/**
 * The code's 26 random characters, from anything a person may paste: the code as shown, without dashes, in capitals,
 * or a link that carries it (`tdj://sync#tango-…`, `…/settings#sync=tango-…`). Null when it is not a valid code (a
 * wrong length or a typo the check characters catch).
 */
export function parseCode(input: string): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  const hash = s.lastIndexOf("#");
  if (hash >= 0) s = s.slice(hash + 1);
  s = s.replace(/^sync=/, "");
  s = s.replace(new RegExp(`^${CODE_PREFIX}`), "");
  s = s
    .replace(/[\s\-_.]/g, "")
    .replace(/[il]/g, "1")
    .replace(/o/g, "0");
  if (s.length !== DATA_CHARS + CHECK_CHARS) return null;
  if ([...s].some((c) => charValue(c) < 0)) return null;
  const data = s.slice(0, DATA_CHARS);
  return check(data) === s.slice(DATA_CHARS) ? data : null;
}

/** The code as it is shown, from any accepted spelling (null when invalid). */
export function normalizeCode(input: string): string | null {
  const c = parseCode(input);
  return c ? formatCode(c) : null;
}

/** What the QR code holds: the app's link (the camera on an iPhone or iPad opens T-DJ on it). */
export function codeLink(code: string): string {
  return `tdj://sync#${normalizeCode(code) ?? code}`;
}
