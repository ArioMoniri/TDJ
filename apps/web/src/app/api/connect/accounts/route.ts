import { NextResponse } from "next/server";
import { CONNECT_APPS, connectEnabled, listAccounts } from "@/lib/server/connect";
import { userFromRequest } from "@/lib/server/db";
export const dynamic = "force-dynamic";

/** Which apps this user has connected through Pipedream (names and health only, never credentials). */
export async function GET(req: Request) {
  const apps = CONNECT_APPS.map((a) => ({ slug: a.slug, label: a.label, kind: a.kind }));
  if (!connectEnabled()) return NextResponse.json({ enabled: false, apps, accounts: [] });
  const user = userFromRequest(req);
  try {
    const accounts = user.setCookie ? [] : await listAccounts(user.id);
    const res = NextResponse.json({ enabled: true, apps, accounts });
    if (user.setCookie) res.headers.append("set-cookie", user.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json(
      { enabled: true, apps, accounts: [], error: (e as Error).message },
      { status: 502 },
    );
  }
}
