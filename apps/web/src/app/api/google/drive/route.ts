import { EXPORT_META, type ExportFormat } from "@tdj/core";
import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import { featureLogin, hasScope, uploadDrive } from "@/lib/server/google";
import { crossOriginResponse } from "@/lib/server/guard";
import { enabled, errorStatus, GOOGLE, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/**
 * `{ format, filename, text, next? }` → the file in the "TDJ" folder of the user's Drive, `{ id, path, url }`.
 * Without the Drive scope the answer is 403 `{ error: "needs_scope", login }`: the client sends the DJ there.
 */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!(await enabled(GOOGLE)))
    return NextResponse.json({ error: "Google login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(GOOGLE, req, origin);
  if (!s) return NextResponse.json({ error: "Not connected with Google" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const format = body?.format as ExportFormat;
  if (!body || typeof body.text !== "string" || !Object.hasOwn(EXPORT_META, format))
    return NextResponse.json({ error: "format and text required" }, { status: 400 });
  if (!hasScope(s.session, "drive"))
    return NextResponse.json(
      {
        error: "needs_scope",
        scope: "drive",
        login: featureLogin("drive", typeof body.next === "string" ? body.next : "/"),
      },
      { status: 403 },
    );
  const m = EXPORT_META[format];
  const filename = typeof body.filename === "string" && body.filename ? body.filename : `tdj-set.${m.ext}`;
  try {
    const r = await uploadDrive(s.session.access, { filename, mime: m.mime, text: body.text });
    const res = NextResponse.json({ app: "google_drive", ...r });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}
