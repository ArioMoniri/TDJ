/**
 * Minimal tag reader for the booth's folder index (round7-booth.md §8.1): ID3v2 (2.2/2.3/2.4) text frames, the
 * ID3v1 trailer, MP4 `ilst` atoms and the FLAC VorbisComment block. Pure over bytes: the adapter reads the first
 * 256 KB and the last 128 bytes of a file; vitest feeds synthetic buffers. No dependency.
 */
export interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
}
/** How much of a file's head is read for tags. */
export const TAG_HEAD_BYTES = 256 * 1024;

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
};
const utf8 = (b: Uint8Array) => {
  try {
    return new TextDecoder("utf-8").decode(b);
  } catch {
    return latin1(b);
  }
};
const utf16 = (b: Uint8Array, be: boolean) => {
  try {
    return new TextDecoder(be ? "utf-16be" : "utf-16le").decode(b);
  } catch {
    return "";
  }
};
const clean = (s: string) => s.replace(/\0+$/g, "").replace(/\0/g, " / ").trim();
const yearOf = (s?: string) => {
  const m = s?.match(/\b(1[89]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : undefined;
};

/** ID3v2 text frame payload: encoding byte then text. */
function id3Text(b: Uint8Array): string {
  if (!b.length) return "";
  const enc = b[0]!;
  const body = b.subarray(1);
  if (enc === 0) return clean(latin1(body));
  if (enc === 3) return clean(utf8(body));
  if (enc === 2) return clean(utf16(body, true));
  // 1: UTF-16 with BOM
  if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) return clean(utf16(body.subarray(2), false));
  if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) return clean(utf16(body.subarray(2), true));
  return clean(utf16(body, false));
}
const syncsafe = (b: Uint8Array, o: number) =>
  ((b[o]! & 0x7f) << 21) | ((b[o + 1]! & 0x7f) << 14) | ((b[o + 2]! & 0x7f) << 7) | (b[o + 3]! & 0x7f);
const u32 = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u24 = (b: Uint8Array, o: number) => (b[o]! << 16) | (b[o + 1]! << 8) | b[o + 2]!;

export function readId3v2(head: Uint8Array): Tags | null {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
  const version = head[3]!;
  const flags = head[5]!;
  const size = syncsafe(head, 6);
  let o = 10;
  if (version >= 3 && flags & 0x40) o += version === 4 ? syncsafe(head, 10) : u32(head, 10) + 4;
  const end = Math.min(head.length, 10 + size);
  const tags: Tags = {};
  const want: Record<string, keyof Tags> = {
    TIT2: "title",
    TPE1: "artist",
    TALB: "album",
    TYER: "year",
    TDRC: "year",
    TORY: "year",
    TDOR: "year",
    TT2: "title",
    TP1: "artist",
    TAL: "album",
    TYE: "year",
  };
  while (o + (version === 2 ? 6 : 10) <= end) {
    let id: string;
    let len: number;
    let hdr: number;
    if (version === 2) {
      id = latin1(head.subarray(o, o + 3));
      len = u24(head, o + 3);
      hdr = 6;
    } else {
      id = latin1(head.subarray(o, o + 4));
      len = version === 4 ? syncsafe(head, o + 4) : u32(head, o + 4);
      hdr = 10;
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id) || len <= 0) break;
    const key = want[id];
    if (key) {
      const text = id3Text(head.subarray(o + hdr, Math.min(end, o + hdr + len)));
      if (key === "year") tags.year ??= yearOf(text);
      else tags[key] ??= text || undefined;
    }
    o += hdr + len;
  }
  return tags;
}

export function readId3v1(tail: Uint8Array): Tags | null {
  if (tail.length < 128) return null;
  const b = tail.subarray(tail.length - 128);
  if (latin1(b.subarray(0, 3)) !== "TAG") return null;
  const f = (a: number, n: number) => clean(latin1(b.subarray(a, a + n)));
  const tags: Tags = {};
  const title = f(3, 30);
  const artist = f(33, 30);
  const album = f(63, 30);
  if (title) tags.title = title;
  if (artist) tags.artist = artist;
  if (album) tags.album = album;
  tags.year = yearOf(f(93, 4));
  return tags;
}

/** MP4/M4A: moov → udta → meta → ilst → ©nam/©ART/©alb/©day (only when `moov` sits in the head). */
export function readMp4(head: Uint8Array): Tags | null {
  if (head.length < 12 || latin1(head.subarray(4, 8)) !== "ftyp") return null;
  const tags: Tags = {};
  const names: Record<string, keyof Tags> = {
    "©nam": "title",
    "©ART": "artist",
    "©alb": "album",
    "©day": "year",
  };
  const walk = (start: number, end: number, depth: number) => {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(head, o);
      const type = latin1(head.subarray(o + 4, o + 8));
      let hdr = 8;
      if (size === 1) {
        // 64-bit size: low 32 bits are enough for a tag atom
        size = u32(head, o + 12);
        hdr = 16;
      } else if (size === 0) size = end - o;
      if (size < hdr) return;
      const inner = Math.min(end, o + size);
      if (type === "moov" || type === "udta" || type === "ilst") walk(o + hdr, inner, depth + 1);
      else if (type === "meta") walk(o + hdr + 4, inner, depth + 1);
      else if (names[type]) {
        // the atom holds a `data` atom: 8 header + 4 type/flags + 4 locale, then the text
        let p = o + hdr;
        while (p + 16 <= inner) {
          const dsize = u32(head, p);
          if (latin1(head.subarray(p + 4, p + 8)) === "data" && dsize >= 16) {
            const text = clean(utf8(head.subarray(p + 16, Math.min(inner, p + dsize))));
            const key = names[type]!;
            if (key === "year") tags.year ??= yearOf(text);
            else tags[key] ??= text || undefined;
            break;
          }
          if (dsize < 8) break;
          p += dsize;
        }
      }
      o += size;
    }
  };
  walk(0, head.length, 0);
  return tags;
}

/** FLAC: metadata blocks after "fLaC"; block type 4 is the VorbisComment (TITLE/ARTIST/ALBUM/DATE). */
export function readFlac(head: Uint8Array): Tags | null {
  if (head.length < 8 || latin1(head.subarray(0, 4)) !== "fLaC") return null;
  let o = 4;
  while (o + 4 <= head.length) {
    const h = head[o]!;
    const last = !!(h & 0x80);
    const type = h & 0x7f;
    const len = u24(head, o + 1);
    o += 4;
    if (type === 4) return parseVorbis(head.subarray(o, Math.min(head.length, o + len)));
    if (last) break;
    o += len;
  }
  return {};
}
function parseVorbis(b: Uint8Array): Tags {
  const tags: Tags = {};
  const le32 = (o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
  let o = 0;
  if (o + 4 > b.length) return tags;
  const vendor = le32(o);
  o += 4 + vendor;
  if (o + 4 > b.length) return tags;
  const count = le32(o);
  o += 4;
  for (let i = 0; i < count && o + 4 <= b.length; i++) {
    const len = le32(o);
    o += 4;
    const kv = utf8(b.subarray(o, Math.min(b.length, o + len)));
    o += len;
    const eq = kv.indexOf("=");
    if (eq < 0) continue;
    const k = kv.slice(0, eq).toUpperCase();
    const v = clean(kv.slice(eq + 1));
    if (k === "TITLE") tags.title ??= v;
    else if (k === "ARTIST" || k === "ALBUMARTIST") tags.artist ??= v;
    else if (k === "ALBUM") tags.album ??= v;
    else if (k === "DATE" || k === "YEAR" || k === "ORIGINALDATE") tags.year ??= yearOf(v);
  }
  return tags;
}

/** Tags from the head and the tail of a file, whatever the container; `{}` when nothing readable. */
export function readTags(head: Uint8Array, tail?: Uint8Array): Tags {
  const v2 = readId3v2(head);
  const mp4 = v2 ? null : readMp4(head);
  const flac = v2 || mp4 ? null : readFlac(head);
  const v1 = tail ? readId3v1(tail) : null;
  const out: Tags = {};
  for (const t of [v2, mp4, flac, v1]) {
    if (!t) continue;
    out.title ??= t.title;
    out.artist ??= t.artist;
    out.album ??= t.album;
    out.year ??= t.year;
  }
  return out;
}
