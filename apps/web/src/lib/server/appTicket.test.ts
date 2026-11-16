import { beforeEach, describe, expect, it } from "vitest";
import {
  appErrorUrl,
  appReturnUrl,
  appState,
  forgetUsedTickets,
  isAppState,
  makeTicket,
  redeemTicket,
  TICKET_TTL_MS,
} from "./appTicket";

// a reversible stand-in for the AES-GCM seal (cookies.ts): the rules, not the cipher, are under test
const seal = async (v: unknown) => `v1.${Buffer.from(JSON.stringify(v)).toString("base64url")}`;
const unseal = async <T>(s: string | null | undefined): Promise<T | null> => {
  try {
    return s?.startsWith("v1.") ? (JSON.parse(Buffer.from(s.slice(3), "base64url").toString()) as T) : null;
  } catch {
    return null;
  }
};
const now = 1_794_445_000_000;
const session = { access: "a", refresh: "r", expires: now + 3600_000, authorizedAt: now };

describe("app sign-in tickets (system browser → tdj://auth/… → /api/app/redeem)", () => {
  beforeEach(() => forgetUsedTickets());

  it("marks a login the apps started, keeping the state's next segment where the callback reads it", () => {
    const s = appState("rand.L3NldHRpbmdz");
    expect(isAppState(s)).toBe(true);
    expect(isAppState("rand.L3NldHRpbmdz")).toBe(false);
    expect(s.split(".")[1]).toBe("L3NldHRpbmdz");
  });

  it("returns through the deep link links.rs parses (provider path, ticket, next) and errors into Settings", () => {
    const u = new URL(appReturnUrl("google", "v1.abc_-", "/booth"));
    expect(u.protocol).toBe("tdj:");
    expect(u.host).toBe("auth");
    expect(u.pathname).toBe("/google");
    expect(u.searchParams.get("ticket")).toBe("v1.abc_-");
    expect(u.searchParams.get("next")).toBe("/booth");
    const e = new URL(appErrorUrl("google_denied"));
    expect(e.host).toBe("open");
    expect(e.searchParams.get("path")).toBe("/settings?error=google_denied");
  });

  it("redeems once, for the same provider, within 60 s", async () => {
    const t = await makeTicket(seal, { provider: "google", session, next: "/booth", now, nonce: "n1" });
    expect(await redeemTicket(unseal, "spotify", t, now)).toEqual({ ok: false, reason: "provider" });
    expect(await redeemTicket(unseal, "google", t, now + 1000)).toEqual({
      ok: true,
      session,
      next: "/booth",
    });
    expect(await redeemTicket(unseal, "google", t, now + 2000)).toEqual({ ok: false, reason: "used" });
    const late = await makeTicket(seal, { provider: "dropbox", session, next: "/", now, nonce: "n2" });
    expect(await redeemTicket(unseal, "dropbox", late, now + TICKET_TTL_MS)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses forged tickets, unknown providers and an off-site next", async () => {
    expect(await redeemTicket(unseal, "google", "v1.garbage", now)).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemTicket(unseal, "github", "x", now)).toEqual({ ok: false, reason: "provider" });
    const t = await makeTicket(seal, {
      provider: "spotify",
      session,
      next: "//evil.example",
      now,
      nonce: "n3",
    });
    expect(await redeemTicket(unseal, "spotify", t, now)).toMatchObject({ ok: true, next: "/settings" });
  });

  it("a real ticket fits the deep link's ticket rule (links.rs valid_ticket: ≤ 4096 of A-Z a-z 0-9 - _ . ~)", async () => {
    const big = { ...session, access: "x".repeat(400), refresh: "y".repeat(200), scopes: ["s".repeat(60)] };
    const t = await makeTicket(seal, {
      provider: "google",
      session: big,
      next: "/settings",
      now,
      nonce: "n4",
    });
    expect(t.length).toBeLessThanOrEqual(4096);
    expect(t).toMatch(/^[A-Za-z0-9\-_.~]+$/);
  });
});
