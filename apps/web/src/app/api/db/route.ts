import { NextResponse } from "next/server";
import { dbEnabled, getUserRow, putUserRow, userFromRequest } from "@/lib/server/db";
import type { AgentMemory, AppOverrides, HistorySnapshot } from "@/lib/types";
export const dynamic = "force-dynamic";

/** Server storage is optional: without DynamoDB the route answers 200 so the browser keeps its own database quietly. */
const disabled = () =>
  NextResponse.json({
    enabled: false,
    mode: "browser",
    storage: "browser",
    hint: "Set TDJ_DB_TABLE (and TDJ_SECRET) to store the database server-side.",
  });

export async function GET(req: Request) {
  if (!dbEnabled()) return disabled();
  const u = userFromRequest(req);
  try {
    const { overrides, memory, history } = await getUserRow(u.id);
    const res = NextResponse.json({
      enabled: true,
      mode: "server",
      storage: "server",
      overrides,
      memory,
      history,
    });
    if (u.setCookie) res.headers.set("set-cookie", u.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Body: `{ overrides }`, `{ memory }`, `{ history }` or any mix; a bare overrides object is accepted too. Missing parts are kept. */
export async function PUT(req: Request) {
  if (!dbEnabled()) return disabled();
  const u = userFromRequest(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parts: { overrides?: AppOverrides; memory?: AgentMemory; history?: HistorySnapshot[] } = {};
  if ("overrides" in body || "memory" in body || "history" in body) {
    if (body.overrides && typeof body.overrides === "object") {
      // connector URLs are browser-only by contract; never persist them even if a client sends them
      const { connectors: _c, ...rest } = body.overrides as AppOverrides;
      parts.overrides = { ...rest, updatedAt: new Date().toISOString() };
    }
    if (body.memory && typeof body.memory === "object") parts.memory = body.memory as AgentMemory;
    if (Array.isArray(body.history)) parts.history = body.history as HistorySnapshot[];
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
