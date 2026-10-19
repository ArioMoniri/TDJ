import { NextResponse } from "next/server";
import { clearCookieHeader, readCookie, requestOrigin } from "@/lib/server/cookies";
import { exchangeCode, hostedEnabled, STATE_COOKIE, sessionCookie } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/** Code exchange on the server; the tokens go into a sealed httpOnly cookie, never to the browser or a database. */
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const fail = (reason: string) => {
    const r = NextResponse.redirect(`${origin}/settings?error=spotify_${reason}`, 302);
    r.headers.append("set-cookie", clearCookieHeader(STATE_COOKIE, "/api/spotify"));
    return r;
  };
  if (!hostedEnabled()) return fail("disabled");
  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  const expected = readCookie(req, STATE_COOKIE);
  if (!state || !expected || state !== expected) return fail("state");
  if (q.get("error") || !q.get("code")) return fail("denied");
  try {
    const session = await exchangeCode(q.get("code")!, origin);
    const next = Buffer.from(state.split(".")[1] ?? "", "base64url").toString("utf8") || "/settings";
    const to = new URL(next.startsWith("/") ? next : "/settings", origin);
    to.searchParams.set("connected", "spotify");
    const res = NextResponse.redirect(to.toString(), 302);
    res.headers.append("set-cookie", sessionCookie(session, origin));
    res.headers.append("set-cookie", clearCookieHeader(STATE_COOKIE, "/api/spotify"));
    return res;
  } catch {
    return fail("exchange");
  }
}
