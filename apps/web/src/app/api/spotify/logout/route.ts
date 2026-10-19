import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/** Forgets the sealed session cookie. Spotify itself keeps the grant: spotify.com/account/apps removes it. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("set-cookie", clearSessionCookie());
  return res;
}
