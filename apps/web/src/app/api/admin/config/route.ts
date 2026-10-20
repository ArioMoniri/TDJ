import { NextResponse } from "next/server";
import { forbidden, isAdmin, providerStatus, type SaveBody, saveConfig } from "@/lib/server/admin";
import { crossOriginResponse } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/** Per-provider status for the unlocked owner (configured, last 4 of the ID, redirect URIs); never a secret. */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return forbidden();
  return NextResponse.json(
    { providers: await providerStatus(req) },
    { headers: { "cache-control": "no-store" } },
  );
}

/** `{ spotify?: { clientId, clientSecret } | { remove: true }, google?, dropbox?, publicUrl? }` → the config store. */
export async function PUT(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!(await isAdmin(req))) return forbidden();
  const body = (await req.json().catch(() => null)) as SaveBody | null;
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  try {
    const r = await saveConfig(body);
    return NextResponse.json(
      { ...r, providers: await providerStatus(req) },
      { status: r.errors.length && !r.saved.length ? 400 : 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Could not write the config store: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
