import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import { clearSessionCookie, hostedEnabled, profile, withSession } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/**
 * The hosted session: `{ hosted, user, token }`. `hosted` tells the client whether "Log in with Spotify" exists on
 * this deployment; `token` is the short-lived access token (never the refresh token) so the Listen tab can search.
 */
export async function GET(req: Request) {
  const hosted = await hostedEnabled();
  const origin = await requestOrigin(req);
  const s = hosted ? await withSession(req, origin) : null;
  if (!s) {
    const res = NextResponse.json({ hosted, user: null }); // 200: "not connected" is a state, not an error (no console noise)
    if (hosted && req.headers.get("cookie")?.includes("tdj_sp="))
      res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
  try {
    const user = await profile(s.session.access);
    const res = NextResponse.json({
      hosted,
      user,
      token: { access: s.session.access, expires: s.session.expires },
      authorizedAt: s.session.authorizedAt,
    });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const res = NextResponse.json({ hosted, user: null, error: (e as Error).message });
    if (/ 401 /.test(String(e))) res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
}
