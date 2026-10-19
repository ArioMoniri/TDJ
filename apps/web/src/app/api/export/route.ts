import { EXPORT_META, EXPORTERS, type ExportFormat, type Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { applyPaths, withoutCortinas } from "@/lib/exportPaths";
export const dynamic = "force-dynamic";

const csvq = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

/** Show / performance breaks appear as a row in the set list and the CSV (the file formats carry tracks only). */
function withBreaks(text: string, f: ExportFormat, p: Playlist): string {
  const breaks = p.breaks ?? [];
  if (!breaks.length) return text;
  if (f === "setlist") {
    const lines = text.split("\n");
    for (const b of [...breaks].sort((a, c) => c.afterTanda - a.afterTanda)) {
      const next = lines.findIndex((l) => l.startsWith(`${String(b.afterTanda + 2).padStart(2, "0")}. [`));
      const line = `     ── ${b.label} · ${b.minutes} min ──`;
      if (next >= 0) lines.splice(next, 0, line);
      else {
        const star = lines.findIndex((l) => l.startsWith("★"));
        lines.splice(star >= 0 ? star : lines.length, 0, line);
      }
    }
    return lines.join("\n");
  }
  if (f === "csv") {
    // rows are "#","kind","tanda",…; a break row goes after the last row of tanda `afterTanda + 1` (1-based)
    const lines = text.split("\n");
    const tandaOf = (l: string) => Number(l.match(/^"\d+","(?:track|cortina)","(\d+)"/)?.[1] ?? Number.NaN);
    const out: string[] = [];
    lines.forEach((l, i) => {
      out.push(l);
      const t = tandaOf(l);
      if (Number.isNaN(t)) return;
      const next = tandaOf(lines[i + 1] ?? "");
      if (next === t) return;
      for (const b of breaks)
        if (b.afterTanda + 1 === t)
          out.push(
            ["", "break", t, b.label, "", "", "", "break", b.minutes * 60, "", "", ""].map(csvq).join(","),
          );
    });
    return out.join("\n");
  }
  return text;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, format, includeCortinas = true, folder, naming } = body;
  if (typeof format !== "string" || !Object.hasOwn(EXPORTERS, format))
    return NextResponse.json({ error: "unknown format" }, { status: 400 });
  const f = format as ExportFormat;
  const pl = includeCortinas ? playlist : withoutCortinas(playlist);
  const text = withBreaks(
    applyPaths(EXPORTERS[f](pl, { includeCortinas: !!includeCortinas }), f, pl, {
      folder: typeof folder === "string" ? folder : "",
      naming: typeof naming === "string" ? naming : "",
      includeCortinas: !!includeCortinas,
    }),
    f,
    pl,
  );
  const m = EXPORT_META[f];
  return new NextResponse(text, {
    headers: {
      "content-type": `${m.mime}; charset=utf-8`,
      "content-disposition": `attachment; filename="${(playlist.name ?? "tdj").replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}"`,
    },
  });
}
