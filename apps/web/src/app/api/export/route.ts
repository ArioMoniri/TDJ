import { EXPORTERS, EXPORT_META, type ExportFormat } from "@tdj/core";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { playlist, format } = await req.json();
  const f = format as ExportFormat;
  if (!EXPORTERS[f]) return NextResponse.json({ error: "unknown format" }, { status: 400 });
  const body = EXPORTERS[f](playlist);
  const m = EXPORT_META[f];
  return new NextResponse(body, { headers: { "content-type": `${m.mime}; charset=utf-8`, "content-disposition": `attachment; filename="${(playlist.name ?? "tdj").replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}"` } });
}
