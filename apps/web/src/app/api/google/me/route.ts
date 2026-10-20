import { NextResponse } from "next/server";
import { storeAvailable } from "@/lib/server/config";
import { requestOrigin } from "@/lib/server/cookies";
import { grantedFeatures, profile } from "@/lib/server/google";
import { noStore } from "@/lib/server/guard";
import { clearSessionCookie, enabled, GOOGLE, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/**
 * `{ hosted, user, scopes: { drive, youtube } }`: which features this Google account has already granted. Never
 * cached; the cookie is kept (not cleared) while the config store that holds the cookie secret is unreachable.
 */
export async function GET(req: Request) {
  const hosted = await enabled(GOOGLE);
  const origin = await requestOrigin(req);
  const s = hosted ? await withSession(GOOGLE, req, origin) : null;
  if (!s) {
    const hasCookie = !!req.headers.get("cookie")?.includes(`${GOOGLE.cookie}=`);
    const store = await storeAvailable();
    // 200: "not connected" is a state, not an error (no console noise)
    const res = noStore(
      NextResponse.json({ hosted, user: null, ...(store ? {} : { storeUnavailable: true }) }),
    );
    if (hosted && hasCookie && store) res.headers.append("set-cookie", clearSessionCookie(GOOGLE));
    return res;
  }
  try {
    const user = await profile(s.session.access);
    const res = noStore(
      NextResponse.json({
        hosted,
        user,
        scopes: grantedFeatures(s.session),
        authorizedAt: s.session.authorizedAt,
      }),
    );
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const res = noStore(NextResponse.json({ hosted, user: null, error: (e as Error).message }));
    if (/ 401 /.test(String(e))) res.headers.append("set-cookie", clearSessionCookie(GOOGLE));
    return res;
  }
}
