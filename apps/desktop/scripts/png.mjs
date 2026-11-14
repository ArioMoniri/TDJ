// Minimal PNG tools (no dependencies): read size/colour type, and flatten RGBA → RGB over a background.
// App Store Connect rejects the 1024 px iOS icon and screenshots that carry an alpha channel.
import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

export function chunks(png) {
  if (!png.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  const out = [];
  let o = 8;
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.subarray(o + 4, o + 8).toString("latin1");
    out.push({ type, data: png.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

/** { width, height, colorType, bitDepth, alpha } */
export function info(png) {
  const ihdr = chunks(png).find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("no IHDR");
  const colorType = ihdr.data[9];
  return {
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
    bitDepth: ihdr.data[8],
    colorType,
    alpha: colorType === 4 || colorType === 6 || chunks(png).some((c) => c.type === "tRNS"),
  };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** 8-bit RGBA (colour type 6, non-interlaced) → 8-bit RGB composited over `bg` ([r,g,b]). Others returned as is. */
export function flattenAlpha(png, bg = [0, 0, 0]) {
  const { width, height, colorType, bitDepth } = info(png);
  if (colorType !== 6 || bitDepth !== 8) return png;
  const all = chunks(png);
  if (all.find((c) => c.type === "IHDR").data[12] !== 0) throw new Error("interlaced PNG not supported");
  const raw = inflateSync(Buffer.concat(all.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const bpp = 4;
  const stride = width * bpp;
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  const out = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const x = line[i];
      cur[i] =
        (f === 0
          ? x
          : f === 1
            ? x + a
            : f === 2
              ? x + b
              : f === 3
                ? x + ((a + b) >> 1)
                : x + paeth(a, b, c)) & 255;
    }
    const o = y * (width * 3 + 1);
    out[o] = 0;
    for (let px = 0; px < width; px++) {
      const al = cur[px * 4 + 3] / 255;
      for (let ch = 0; ch < 3; ch++)
        out[o + 1 + px * 3 + ch] = Math.round(cur[px * 4 + ch] * al + bg[ch] * (1 - al));
    }
    cur.copy(prev);
  }
  const ihdr = Buffer.from(all.find((c) => c.type === "IHDR").data);
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(out, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Size of a JPEG (SOFn marker) for the screenshot checks. */
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG");
  let o = 2;
  while (o < buf.length) {
    if (buf[o] !== 0xff) throw new Error("bad JPEG marker");
    const m = buf[o + 1];
    const len = buf.readUInt16BE(o + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7), components: buf[o + 9] };
    }
    o += 2 + len;
  }
  throw new Error("no SOF marker");
}
