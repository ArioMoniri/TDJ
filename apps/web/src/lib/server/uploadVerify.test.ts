import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { checkUpload, compareUpload, dropboxContentHash, md5Hex } = await import("./uploadVerify");

const sha = (b: Uint8Array | Buffer) => createHash("sha256").update(b).digest();

describe("uploads asked again after they are stored (Dropbox, Drive)", () => {
  it("Dropbox's content hash: SHA-256 over the SHA-256 of every 4 MiB block", () => {
    const small = new TextEncoder().encode("#EXTM3U\nSelda Bağcan - Yaz Gazeteci Yaz\n");
    expect(dropboxContentHash(small)).toBe(sha(sha(small)).toString("hex"));
    const big = new Uint8Array(4 * 1024 * 1024 + 10).fill(7);
    const blocks = Buffer.concat([sha(big.subarray(0, 4 * 1024 * 1024)), sha(big.subarray(4 * 1024 * 1024))]);
    expect(dropboxContentHash(big)).toBe(sha(blocks).toString("hex"));
  });
  it("same bytes: ok; a short file or another hash: not ok, with both sizes", () => {
    const sent = new TextEncoder().encode("ışık ğüşöç");
    expect(compareUpload(sent, { size: sent.length, hash: md5Hex(sent) }, "md5")).toEqual({
      ok: true,
      bytes: sent.length,
      size: sent.length,
      hash: "match",
    });
    expect(compareUpload(sent, { size: String(sent.length - 2), hash: "00" }, "md5")).toMatchObject({
      ok: false,
      size: sent.length - 2,
      hash: "differs",
    });
    // the drive said nothing about the hash: not proven
    expect(compareUpload(sent, { size: sent.length }, "dropbox").ok).toBe(false);
  });
  it("a failed read is an unknown result, never a failed upload", async () => {
    const r = await checkUpload(
      "x",
      async () => {
        throw new Error("404");
      },
      "dropbox",
    );
    expect(r).toMatchObject({ ok: false, hash: "unknown", error: "404" });
  });
});
