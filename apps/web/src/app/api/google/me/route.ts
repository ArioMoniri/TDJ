import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import { grantedFeatures, profile } from "@/lib/server/google";
import { clearSessionCookie, enabled, GOOGLE, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** `{ hosted, user, scopes: { drive, youtube } }`: which features this Google account has already granted. */
export async function GET(req: Request) {
  const hosted = await enabled(GOOGLE);
  const origin = await requestOrigin(req);
  const s = hosted ? await withSession(GOOGLE, req, origin) : null;
  if (!s) {
    const res = NextResponse.json({ hosted, user: null }); // 200: "not connected" is a state, not an error (no console noise)
    if (hosted && req.headers.get("cookie")?.includes(`${GOOGLE.cookie}=`))
      res.headers.append("set-cookie", clearSessionCookie(GOOGLE));
    return res;
  }
  try {
    const user = await profile(s.session.access);
    const res = NextResponse.json({
      hosted,
      user,
      scopes: grantedFeatures(s.session),
      authorizedAt: s.session.authorizedAt,
    });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const res = NextResponse.json({ hosted, user: null, error: (e as Error).message });
    if (/ 401 /.test(String(e))) res.headers.append("set-cookie", clearSessionCookie(GOOGLE));
    return res;
  }
}
