import { NextResponse } from "next/server";
import {
  forbidden,
  isAdmin,
  PROVIDER_IDS,
  type ProviderId,
  testProvider,
  testSharedAi,
} from "@/lib/server/admin";
export const dynamic = "force-dynamic";

/** `{ provider }` → `{ ok, text }` after one request to the provider with the saved credentials ("ai" pings the shared model key). */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) return forbidden();
  const body = (await req.json().catch(() => null)) as { provider?: unknown } | null;
  const id = body?.provider;
  if (id === "ai") return NextResponse.json(await testSharedAi());
  if (typeof id !== "string" || !PROVIDER_IDS.includes(id as ProviderId))
    return NextResponse.json({ error: "provider must be spotify, google, dropbox or ai" }, { status: 400 });
  return NextResponse.json(await testProvider(id as ProviderId));
}
