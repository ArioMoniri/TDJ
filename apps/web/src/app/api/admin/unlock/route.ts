import { NextResponse } from "next/server";
import {
  adminCookie,
  allowAttempt,
  clearFailures,
  clientKey,
  delay,
  recordFailure,
  tryUnlock,
} from "@/lib/server/admin";
import { requestOrigin } from "@/lib/server/cookies";
export const dynamic = "force-dynamic";

/**
 * `{ secret }` = the one-time setup code from the deploy summary, or the owner passphrase once set. Every attempt
 * waits one second; five failures in ten minutes lock this client out of this instance for the rest of the window.
 */
export async function POST(req: Request) {
  const key = clientKey(req);
  if (!allowAttempt(key))
    return NextResponse.json({ error: "Too many attempts. Try again in ten minutes." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { secret?: unknown } | null;
  const secret = typeof body?.secret === "string" ? body.secret : "";
  await delay(1000);
  if (!secret || secret.length > 256) {
    recordFailure(key);
    return NextResponse.json({ error: "Enter the setup code or your passphrase." }, { status: 400 });
  }
  const r = await tryUnlock(secret);
  if (!r.ok) {
    recordFailure(key);
    return NextResponse.json({ error: r.reason }, { status: 401 });
  }
  clearFailures(key);
  const res = NextResponse.json({ ok: true, via: r.via });
  res.headers.append("set-cookie", await adminCookie(await requestOrigin(req)));
  return res;
}
