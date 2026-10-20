import { NextResponse } from "next/server";
import { storeAvailable } from "@/lib/server/config";
import { requestOrigin } from "@/lib/server/cookies";
import { noStore } from "@/lib/server/guard";
import { clearSessionCookie, hostedEnabled, profile, withSession } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/**
 * The hosted session: `{ hosted, user, token }`. `hosted` tells the client whether "Log in with Spotify" exists on
 * this deployment; `token` is the short-lived access token (never the refresh token) so the Listen tab can search.
 * Never cached. A cookie that cannot be unsealed is cleared, except while the config store (the cookie secret)
 * is unreachable: then the session is kept and `storeUnavailable` says why there is no user.
 */
export async function GET(req: Request) {
  const hosted = await hostedEnabled();
  const origin = await requestOrigin(req);
  const s = hosted ? await withSession(req, origin) : null;
  if (!s) {
    const hasCookie = !!req.headers.get("cookie")?.includes("tdj_sp=");
    const store = await storeAvailable();
    // 200: "not connected" is a state, not an error (no console noise)
    const res = noStore(
      NextResponse.json({ hosted, user: null, ...(store ? {} : { storeUnavailable: true }) }),
    );
    if (hosted && hasCookie && store) res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
  try {
    const user = await profile(s.session.access);
    const res = noStore(
      NextResponse.json({
        hosted,
        user,
        token: { access: s.session.access, expires: s.session.expires },
        authorizedAt: s.session.authorizedAt,
      }),
    );
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const res = noStore(NextResponse.json({ hosted, user: null, error: (e as Error).message }));
    if (/ 401 /.test(String(e))) res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
}
