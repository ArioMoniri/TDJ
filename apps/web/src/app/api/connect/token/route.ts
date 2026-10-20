import { connectEnabled, createConnectToken, isConnectApp } from "@/lib/server/connect";
import { requestOrigin } from "@/lib/server/cookies";
import { userFromRequest } from "@/lib/server/db";
import { crossOriginResponse, jsonNoStore } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/** A single-use Pipedream Connect token for the signed-cookie user; the browser opens `connect_link_url`. */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!connectEnabled())
    return jsonNoStore({ error: "Pipedream Connect is not enabled on this deployment" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const app = isConnectApp(body?.app) ? body.app : undefined;
  const user = await userFromRequest(req);
  try {
    const t = await createConnectToken(user.id, await requestOrigin(req), app);
    const res = jsonNoStore(t);
    if (user.setCookie) res.headers.append("set-cookie", user.setCookie);
    return res;
  } catch (e) {
    return jsonNoStore(
      { error: `Pipedream did not issue a token: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
