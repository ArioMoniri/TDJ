import { describe, expect, it } from "vitest";
import { codeLink, formatCode, newCode, normalizeCode, parseCode } from "./code";
import { deriveKeys, looksSealed, open, recordId, seal } from "./crypto";

const CODE = formatCode("0123456789abcdefghjkmnpqrs");

describe("sync codes", () => {
  it("a new code carries 130 random bits, reads tango-…, and parses back", () => {
    const c = newCode();
    expect(c).toMatch(/^tango(-[0-9a-hjkmnp-tv-z]{4}){7}$/);
    expect(parseCode(c)).toHaveLength(26);
    expect(new Set(Array.from({ length: 20 }, () => newCode())).size).toBe(20);
  });
  it("forgives case, spaces, dashes, look-alike letters and links; catches typos", () => {
    const canonical = parseCode(CODE)!;
    expect(parseCode(CODE.toUpperCase())).toBe(canonical);
    expect(parseCode(CODE.replace(/-/g, " "))).toBe(canonical);
    expect(parseCode(CODE.replace("tango-", "").replace(/1/g, "l").replace(/0/g, "O"))).toBe(canonical);
    expect(parseCode(codeLink(CODE))).toBe(canonical);
    expect(parseCode(`https://tdj.example/settings#sync=${CODE}`)).toBe(canonical);
    // one character changed, two swapped, one missing: refused
    expect(parseCode(CODE.replace("0123", "0124"))).toBeNull();
    expect(parseCode(CODE.replace("0123", "0213"))).toBeNull();
    expect(parseCode(CODE.slice(0, -1))).toBeNull();
    expect(normalizeCode(CODE.toUpperCase())).toBe(CODE);
  });
});

describe("sync crypto", () => {
  it("derivation is deterministic: the same code gives the same id, keys and record ids on every device", async () => {
    const a = await deriveKeys(CODE);
    const b = await deriveKeys(CODE.toUpperCase().replace(/-/g, ""));
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await recordId(a, "night:x")).toBe(await recordId(b, "night:x"));
    expect(await recordId(a, "night:x")).not.toBe(await recordId(a, "night:y"));
    // what one device seals, the other opens
    const blob = await seal(a, { hello: "milonga" }, "rid1");
    expect(await open(b, blob, "rid1")).toEqual({ hello: "milonga" });
  });

  it("another code gives another id, and its key cannot open the blob", async () => {
    const a = await deriveKeys(CODE);
    const other = await deriveKeys(newCode());
    expect(other.id).not.toBe(a.id);
    const blob = await seal(a, { secret: "Di Sarli" }, "rid1");
    await expect(open(other, blob, "rid1")).rejects.toThrow();
  });

  it("a blob is bound to its record id and to every bit", async () => {
    const k = await deriveKeys(CODE);
    const blob = await seal(k, { n: 1 }, "rid1");
    await expect(open(k, blob, "rid2")).rejects.toThrow();
    const flipped = blob.slice(0, 30) + (blob[30] === "A" ? "B" : "A") + blob.slice(31);
    await expect(open(k, flipped, "rid1")).rejects.toThrow();
  });

  it("the ciphertext shows nothing of the data, and a large night is compressed", async () => {
    const k = await deriveKeys(CODE);
    const night = {
      title: "Saturday milonga at Sunderland",
      songs: Array.from({ length: 400 }, (_, i) => `Pugliese ${i}`),
    };
    const blob = await seal(k, night, "rid");
    expect(looksSealed(blob)).toBe(true);
    expect(blob).not.toMatch(/Saturday|Pugliese|milonga/);
    expect(blob.length).toBeLessThan(JSON.stringify(night).length / 2);
    expect(await open(k, blob, "rid")).toEqual(night);
    // the same value sealed twice differs (fresh IV)
    expect(await seal(k, night, "rid")).not.toBe(blob);
  });

  it("refuses an invalid code", async () => {
    await expect(deriveKeys("tango-nope")).rejects.toThrow();
    expect(looksSealed("plain text")).toBe(false);
    expect(looksSealed('{"title":"x"}')).toBe(false);
  });
});
