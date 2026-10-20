import {
  adminCookie,
  allowAttempt,
  allowGlobalAttempt,
  clearFailures,
  clearGlobalFailures,
  clientKey,
  delay,
  recordFailure,
  recordGlobalFailure,
  tryUnlock,
} from "@/lib/server/admin";
import { requestOrigin } from "@/lib/server/cookies";
import { crossOriginResponse, jsonNoStore } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/**
 * `{ secret }` = the one-time setup code from the deploy summary, or the owner passphrase once set. Every attempt
 * waits one second; five failures in ten minutes lock this client (the address CloudFront appended, not a header
 * the caller chose) out of this instance, and twenty failures in an hour from anyone lock the whole deployment
 * (the counter lives in the config store, so every Lambda instance sees it).
 */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const key = clientKey(req);
  if (!allowAttempt(key))
    return jsonNoStore({ error: "Too many attempts. Try again in ten minutes." }, { status: 429 });
  if (!(await allowGlobalAttempt()))
    return jsonNoStore(
      { error: "Too many failed unlocks on this deployment. Try again in an hour." },
      { status: 429 },
    );
  const body = (await req.json().catch(() => null)) as { secret?: unknown } | null;
  const secret = typeof body?.secret === "string" ? body.secret : "";
  await delay(1000);
  const failed = async () => {
    recordFailure(key);
    await recordGlobalFailure();
  };
  if (!secret || secret.length > 256) {
    await failed();
    return jsonNoStore({ error: "Enter the setup code or your passphrase." }, { status: 400 });
  }
  const r = await tryUnlock(secret);
  if (!r.ok) {
    await failed();
    return jsonNoStore({ error: r.reason }, { status: 401 });
  }
  clearFailures(key);
  await clearGlobalFailures();
  const res = jsonNoStore({ ok: true, via: r.via });
  res.headers.append("set-cookie", await adminCookie(await requestOrigin(req)));
  return res;
}
