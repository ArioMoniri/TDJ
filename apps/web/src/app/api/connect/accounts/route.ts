import { CONNECT_APPS, connectEnabled, listAccounts } from "@/lib/server/connect";
import { userFromRequest } from "@/lib/server/db";
import { jsonNoStore } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/** Which apps this user has connected through Pipedream (names and health only, never credentials). Never cached. */
export async function GET(req: Request) {
  const apps = CONNECT_APPS.map((a) => ({ slug: a.slug, label: a.label, kind: a.kind }));
  if (!connectEnabled()) return jsonNoStore({ enabled: false, apps, accounts: [] });
  const user = await userFromRequest(req);
  try {
    const accounts = user.setCookie ? [] : await listAccounts(user.id);
    const res = jsonNoStore({ enabled: true, apps, accounts });
    if (user.setCookie) res.headers.append("set-cookie", user.setCookie);
    return res;
  } catch (e) {
    return jsonNoStore({ enabled: true, apps, accounts: [], error: (e as Error).message }, { status: 502 });
  }
}
