import { NextResponse } from "next/server";
import { cookieHeader, requestOrigin } from "@/lib/server/cookies";
import { authorizeUrl, hostedEnabled, newState, STATE_COOKIE } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/** Hosted "Log in with Spotify": sends the browser to Spotify with a state cookie; the callback finishes it. */
export async function GET(req: Request) {
  if (!hostedEnabled())
    return NextResponse.json(
      { error: "Hosted Spotify login is not enabled on this deployment" },
      { status: 404 },
    );
  const origin = requestOrigin(req);
  const next = new URL(req.url).searchParams.get("next") ?? "/settings";
  const state = `${newState()}.${Buffer.from(next.startsWith("/") ? next : "/settings").toString("base64url")}`;
  const res = NextResponse.redirect(authorizeUrl(origin, state), 302);
  res.headers.append(
    "set-cookie",
    cookieHeader(STATE_COOKIE, state, {
      maxAge: 600,
      path: "/api/spotify",
      secure: origin.startsWith("https://"),
    }),
  );
  return res;
}
