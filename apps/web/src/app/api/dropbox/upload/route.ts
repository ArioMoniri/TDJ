import { EXPORT_META, type ExportFormat } from "@tdj/core";
import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import { upload } from "@/lib/server/dropbox";
import { DROPBOX, enabled, errorStatus, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** `{ format, filename, text, set }` → `/Apps/TDJ/<set>/<file>` in the user's Dropbox, `{ path, url }`. */
export async function POST(req: Request) {
  if (!(await enabled(DROPBOX)))
    return NextResponse.json({ error: "Dropbox login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(DROPBOX, req, origin);
  if (!s) return NextResponse.json({ error: "Not connected to Dropbox" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const format = body?.format as ExportFormat;
  if (!body || typeof body.text !== "string" || !Object.hasOwn(EXPORT_META, format))
    return NextResponse.json({ error: "format and text required" }, { status: 400 });
  const m = EXPORT_META[format];
  const filename = typeof body.filename === "string" && body.filename ? body.filename : `tdj-set.${m.ext}`;
  const set = typeof body.set === "string" && body.set.trim() ? body.set.trim() : "TDJ set";
  try {
    const r = await upload(s.session.access, { set, filename, mime: m.mime, text: body.text });
    const res = NextResponse.json({ app: "dropbox", ...r });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}
