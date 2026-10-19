import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import { hostedEnabled, withSession } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/**
 * The short-lived access token of the hosted Spotify session for the Web Playback SDK's `getOAuthToken` callback
 * (round7-booth.md §8.2): the same `{ access, expires }` that `/me` returns, without the profile round trip. The
 * refresh token never leaves the sealed cookie; a refresh on the way out re-seals it.
 */
export async function GET(req: Request) {
  if (!(await hostedEnabled()))
    return NextResponse.json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(req, origin);
  if (!s) return NextResponse.json({ error: "Not logged in with Spotify" }, { status: 401 });
  const res = NextResponse.json(
    { access: s.session.access, expires: s.session.expires },
    { headers: { "cache-control": "no-store" } },
  );
  if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
  return res;
}
