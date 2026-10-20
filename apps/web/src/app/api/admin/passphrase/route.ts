import { NextResponse } from "next/server";
import { forbidden, isAdmin, PASSPHRASE_MIN, setPassphrase } from "@/lib/server/admin";
import { crossOriginResponse } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/** `{ passphrase }` → scrypt hash in the config store; the one-time setup code is deleted at the same time. */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!(await isAdmin(req))) return forbidden();
  const body = (await req.json().catch(() => null)) as { passphrase?: unknown } | null;
  const passphrase = typeof body?.passphrase === "string" ? body.passphrase : "";
  if (passphrase.length < PASSPHRASE_MIN || passphrase.length > 256)
    return NextResponse.json(
      { error: `The passphrase needs at least ${PASSPHRASE_MIN} characters.` },
      { status: 400 },
    );
  try {
    await setPassphrase(passphrase);
  } catch (e) {
    return NextResponse.json({ error: `Could not save: ${(e as Error).message}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
