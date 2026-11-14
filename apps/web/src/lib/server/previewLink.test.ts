import { describe, expect, it } from "vitest";
import { linkExpiry, MAX_TTL } from "./previewLink";

describe("signed preview links", () => {
  const now = 1_794_445_000_000;
  it("expire a minute before the link's own exp token (Deezer signs for ~15 min)", () => {
    const exp = Math.floor(now / 1000) + 15 * 60;
    const url = `https://cdnt-preview.dzcdn.net/api/1/1/4/d/x.mp3?hdnea=exp=${exp}~acl=/api/1/1/4/d/x.mp3*~data=user_id=0~hmac=ab`;
    expect(linkExpiry(url, now)).toBe(Math.min(exp * 1000 - 60_000, now + MAX_TTL));
  });
  it("a link already past its expiry is not reused", () => {
    const exp = Math.floor(now / 1000) - 4 * 60;
    expect(linkExpiry(`https://x/y.mp3?hdnea=exp=${exp}~acl=/`, now)).toBeLessThan(now);
  });
  it("no token: at most MAX_TTL (never the old 6 h)", () => {
    expect(linkExpiry("https://x/y.mp3", now)).toBe(now + MAX_TTL);
    expect(MAX_TTL).toBeLessThanOrEqual(15 * 60_000);
  });
});
