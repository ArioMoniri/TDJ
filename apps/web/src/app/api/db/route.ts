import { NextResponse } from "next/server";
import { dbEnabled, getOverrides, putOverrides, userFromRequest } from "@/lib/server/db";
import type { AppOverrides } from "@/lib/types";
export const dynamic = "force-dynamic";

const disabled = () =>
  NextResponse.json(
    { enabled: false, storage: "browser", hint: "Set TDJ_DB_TABLE (and TDJ_SECRET) to store the database server-side." },
    { status: 404 },
  );

export async function GET(req: Request) {
  if (!dbEnabled()) return disabled();
  const u = userFromRequest(req);
  try {
    const overrides = await getOverrides(u.id);
    const res = NextResponse.json({ enabled: true, storage: "server", overrides });
    if (u.setCookie) res.headers.set("set-cookie", u.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return disabled();
  const u = userFromRequest(req);
  const body = (await req.json().catch(() => null)) as { overrides?: AppOverrides } | AppOverrides | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const overrides = ("overrides" in body ? body.overrides : body) as AppOverrides;
  try {
    await putOverrides(u.id, { ...overrides, updatedAt: new Date().toISOString() });
    const res = NextResponse.json({ ok: true, storage: "server" });
    if (u.setCookie) res.headers.set("set-cookie", u.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
