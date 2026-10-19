import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import { profile } from "@/lib/server/dropbox";
import { clearSessionCookie, DROPBOX, enabled, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** `{ hosted, user }` for the sealed Dropbox session; 401 + `hosted` without one. */
export async function GET(req: Request) {
  const hosted = enabled(DROPBOX);
  const origin = requestOrigin(req);
  const s = hosted ? await withSession(DROPBOX, req, origin) : null;
  if (!s) {
    const res = NextResponse.json({ hosted, user: null }, { status: 401 });
    if (hosted && req.headers.get("cookie")?.includes(`${DROPBOX.cookie}=`))
      res.headers.append("set-cookie", clearSessionCookie(DROPBOX));
    return res;
  }
  try {
    const user = await profile(s.session.access);
    const res = NextResponse.json({ hosted, user, authorizedAt: s.session.authorizedAt });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const res = NextResponse.json({ hosted, user: null, error: (e as Error).message }, { status: 401 });
    if (/ 401 /.test(String(e))) res.headers.append("set-cookie", clearSessionCookie(DROPBOX));
    return res;
  }
}
