/**
 * The share sheet's QR encoder. Decoding is checked out of band (zxing-cpp read every version 1–40 at L/M/Q/H when
 * this was written); here: the smallest version is chosen, the finder and timing patterns sit where scanners look,
 * and a link past version 40 is refused rather than drawn wrong.
 */
import { describe, expect, it } from "vitest";
import { qrMatrix, qrPath } from "./qr";

const finderAt = (m: boolean[][], x0: number, y0: number) => {
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      if (m[y0 + y]![x0 + x] !== (d !== 2)) return false;
    }
  return true;
};

describe("qrMatrix", () => {
  it("picks the smallest version that holds the text", () => {
    expect(qrMatrix("hi", "M").length).toBe(21); // version 1
    expect(qrMatrix("https://tdj.example/night?s=abcdefghjk", "M").length).toBe(29); // version 3
    expect(qrMatrix("x".repeat(2331), "M").length).toBe(177); // version 40 holds 2331 bytes at M
    expect(() => qrMatrix("x".repeat(2332), "M")).toThrow();
  });

  it("draws the three finders, the timing lines and the dark module", () => {
    for (const text of ["T-DJ", "https://tdj.example/rooms?join=ABC234", "y".repeat(400)]) {
      const m = qrMatrix(text);
      const n = m.length;
      expect(finderAt(m, 0, 0)).toBe(true);
      expect(finderAt(m, n - 7, 0)).toBe(true);
      expect(finderAt(m, 0, n - 7)).toBe(true);
      for (let i = 8; i < n - 8; i++) {
        expect(m[6]![i]).toBe(i % 2 === 0);
        expect(m[i]![6]).toBe(i % 2 === 0);
      }
      expect(m[n - 8]![8]).toBe(true);
    }
  });

  it("is deterministic and draws one path", () => {
    const a = qrMatrix("same");
    expect(qrMatrix("same")).toEqual(a);
    expect(qrPath(a)).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });
});
