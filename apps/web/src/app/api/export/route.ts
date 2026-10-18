import { EXPORT_META, EXPORTERS, type ExportFormat } from "@tdj/core";
import { NextResponse } from "next/server";
import { applyPaths, withoutCortinas } from "@/lib/exportPaths";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, format, includeCortinas = true, folder, naming } = body;
  if (typeof format !== "string" || !Object.hasOwn(EXPORTERS, format))
    return NextResponse.json({ error: "unknown format" }, { status: 400 });
  const f = format as ExportFormat;
  const pl = includeCortinas ? playlist : withoutCortinas(playlist);
  const text = applyPaths(EXPORTERS[f](pl, { includeCortinas: !!includeCortinas }), f, pl, {
    folder: typeof folder === "string" ? folder : "",
    naming: typeof naming === "string" ? naming : "",
    includeCortinas: !!includeCortinas,
  });
  const m = EXPORT_META[f];
  return new NextResponse(text, {
    headers: {
      "content-type": `${m.mime}; charset=utf-8`,
      "content-disposition": `attachment; filename="${(playlist.name ?? "tdj").replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}"`,
    },
  });
}
