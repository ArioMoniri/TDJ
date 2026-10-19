import { NextResponse } from "next/server";
import { connectEnabled, createConnectToken, isConnectApp } from "@/lib/server/connect";
import { requestOrigin } from "@/lib/server/cookies";
import { userFromRequest } from "@/lib/server/db";
export const dynamic = "force-dynamic";

/** A single-use Pipedream Connect token for the signed-cookie user; the browser opens `connect_link_url`. */
export async function POST(req: Request) {
  if (!connectEnabled())
    return NextResponse.json(
      { error: "Pipedream Connect is not enabled on this deployment" },
      { status: 404 },
    );
  const body = await req.json().catch(() => ({}));
  const app = isConnectApp(body?.app) ? body.app : undefined;
  const user = userFromRequest(req);
  try {
    const t = await createConnectToken(user.id, requestOrigin(req), app);
    const res = NextResponse.json(t);
    if (user.setCookie) res.headers.append("set-cookie", user.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: `Pipedream did not issue a token: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
