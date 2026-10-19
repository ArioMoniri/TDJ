import { NextResponse } from "next/server";
import { dbEnabled, getUserRow, putUserRow, userFromRequest } from "@/lib/server/db";
import type { AgentMemory, AppOverrides } from "@/lib/types";
export const dynamic = "force-dynamic";

const disabled = () =>
  NextResponse.json(
    {
      enabled: false,
      storage: "browser",
      hint: "Set TDJ_DB_TABLE (and TDJ_SECRET) to store the database server-side.",
    },
    { status: 404 },
  );

export async function GET(req: Request) {
  if (!dbEnabled()) return disabled();
  const u = userFromRequest(req);
  try {
    const { overrides, memory } = await getUserRow(u.id);
    const res = NextResponse.json({ enabled: true, storage: "server", overrides, memory });
    if (u.setCookie) res.headers.set("set-cookie", u.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Body: `{ overrides }`, `{ memory }` or both; a bare overrides object is accepted too. Missing parts are kept. */
export async function PUT(req: Request) {
  if (!dbEnabled()) return disabled();
  const u = userFromRequest(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parts: { overrides?: AppOverrides; memory?: AgentMemory } = {};
  if ("overrides" in body || "memory" in body) {
    if (body.overrides && typeof body.overrides === "object")
      parts.overrides = { ...(body.overrides as AppOverrides), updatedAt: new Date().toISOString() };
    if (body.memory && typeof body.memory === "object") parts.memory = body.memory as AgentMemory;
  } else parts.overrides = { ...(body as AppOverrides), updatedAt: new Date().toISOString() };
  try {
    await putUserRow(u.id, parts);
    const res = NextResponse.json({ ok: true, storage: "server" });
    if (u.setCookie) res.headers.set("set-cookie", u.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
