import { t } from "@/lib/i18n";
/**
 * A small QR Code encoder (ISO/IEC 18004, byte mode, versions 1–40, error correction L/M/Q/H) for the share sheet,
 * so a night or a room travels phone → iPad without a dependency. After Project Nayuki's reference implementation
 * (MIT). `qrMatrix(text)` returns the modules row by row (true = dark); `qrPath` draws them as one SVG path.
 */
export type QrEcc = "L" | "M" | "Q" | "H";
const ECL_ORDINAL: Record<QrEcc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMAT: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// biome-ignore format: tables
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// biome-ignore format: tables
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function numRawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const numDataCodewords = (ver: number, e: number) =>
  Math.floor(numRawDataModules(ver) / 8) -
  ECC_CODEWORDS_PER_BLOCK[e]![ver]! * NUM_ERROR_CORRECTION_BLOCKS[e]![ver]!;

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j]!, root);
      if (j + 1 < r.length) r[j]! ^= r[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => {
      r[i]! ^= gfMul(c, factor);
    });
  }
  return r;
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** The QR modules for `text` (UTF-8, byte mode), the smallest version that holds it; throws past version 40. */
export function qrMatrix(text: string, ecc: QrEcc = "M"): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const e = ECL_ORDINAL[ecc];
  let ver = 1;
  for (; ver <= 40; ver++) {
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= numDataCodewords(ver, e) * 8) break;
  }
  if (ver > 40) throw new Error(t("qr.too_much_data_for_a_qr"));
  const cap = numDataCodewords(ver, e) * 8;
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // error correction, split into blocks and interleaved
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e]![ver]!;
  const blockEcc = ECC_CODEWORDS_PER_BLOCK[e]![ver]!;
  const raw = Math.floor(numRawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(blockEcc);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - blockEcc + (i < numShort ? 0 : 1));
    k += dat.length;
    const ec = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ec));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((b, j) => {
      if (i !== shortLen - blockEcc || j >= numShort) codewords.push(b[i]!);
    });

  const size = ver * 4 + 17;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    mod[y]![x] = dark;
    fn[y]![x] = true;
  };
  // timing
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // finders with separators
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx,
          y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // alignment
  const al = alignmentPositions(ver);
  al.forEach((ax, i) =>
    al.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0))
        return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  const formatBits = (mask: number) => {
    const d = (ECL_FORMAT[ecc] << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  formatBits(0); // reserves the format area
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) === 1;
      const a = size - 11 + (i % 3),
        c = Math.floor(i / 3);
      set(a, c, dark);
      set(c, a, dark);
    }
  }
  // data in the zigzag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - v : v;
        if (!fn[y]![x] && i < codewords.length * 8) {
          mod[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }
  const masked = (m: number): boolean[][] =>
    mod.map((row, y) =>
      row.map((d, x) => {
        if (fn[y]![x]) return d;
        let inv: boolean;
        switch (m) {
          case 0:
            inv = (x + y) % 2 === 0;
            break;
          case 1:
            inv = y % 2 === 0;
            break;
          case 2:
            inv = x % 3 === 0;
            break;
          case 3:
            inv = (x + y) % 3 === 0;
            break;
          case 4:
            inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            inv = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        return d !== inv;
      }),
    );
  let best: boolean[][] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let m = 0; m < 8; m++) {
    formatBits(m);
    const g = masked(m);
    const s = penalty(g);
    if (s < bestScore) {
      bestScore = s;
      best = g;
    }
  }
  return best!;
}

function penalty(g: boolean[][]): number {
  const n = g.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // finder-like 1:1:3:1:1 with four light modules on a side
    for (let i = 0; i + 11 <= n; i++) {
      const p = Array.from({ length: 11 }, (_x, k) => get(i + k));
      const a = [true, false, true, true, true, false, true, false, false, false, false];
      if (a.every((v, k) => p[k] === v) || a.every((v, k) => p[10 - k] === v)) score += 40;
    }
  };
  for (let y = 0; y < n; y++) line((x) => g[y]![x]!);
  for (let x = 0; x < n; x++) line((y) => g[y]![x]!);
  for (let y = 0; y + 1 < n; y++)
    for (let x = 0; x + 1 < n; x++) {
      const c = g[y]![x];
      if (c === g[y]![x + 1] && c === g[y + 1]![x] && c === g[y + 1]![x + 1]) score += 3;
    }
  let dark = 0;
  for (const row of g) for (const d of row) if (d) dark++;
  const total = n * n;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The dark modules as one SVG path in module units (draw it in a `0 0 size size` viewBox plus the quiet zone). */
export function qrPath(m: boolean[][], margin = 4): string {
  let d = "";
  m.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w]) w++;
      d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}
