import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/server/admin";
export const dynamic = "force-dynamic";

/** Forgets the owner session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("set-cookie", clearAdminCookie());
  return res;
}
