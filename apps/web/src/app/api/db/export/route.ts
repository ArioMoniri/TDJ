import { NextResponse } from "next/server";
import { dbEnabled, getOverrides, userFromRequest } from "@/lib/server/db";
import { jsonNoStore, noStore } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/** The user's database as a JSON download. In browser-storage mode the client exports directly; this serves server mode. */
export async function GET(req: Request) {
  if (!dbEnabled())
    return jsonNoStore(
      {
        storage: "browser",
        overrides: {},
        hint: "Your database lives in this browser: use Export JSON on the Database page.",
      },
      { status: 404 },
    );
  try {
    const overrides = await getOverrides((await userFromRequest(req)).id);
    return noStore(
      new NextResponse(JSON.stringify(overrides, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": 'attachment; filename="tdj-database.json"',
        },
      }),
    );
  } catch (e) {
    return jsonNoStore({ error: (e as Error).message }, { status: 500 });
  }
}
