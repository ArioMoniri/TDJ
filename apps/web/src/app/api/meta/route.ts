import { BUILTIN_CORTINAS, cortinaPool, ERA_PRESETS } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/server/catalog";
export const dynamic = "force-dynamic";
export async function GET() {
  const { catalog, cortinas, meta } = getCatalog();
  const pool = cortinaPool(cortinas);
  const cultures = [...new Set(pool.map((c) => c.culture))].sort();
  const genres = [...new Set(pool.map((c) => c.genre))].sort();
  const orchestras = [...catalog.byOrchestra.entries()]
    .map(([id, songs]) => ({
      id,
      name: songs[0]!.orchestra,
      count: songs.length,
      tier: catalog.profile(id)?.tier ?? 3,
      style: catalog.profile(id)?.style,
    }))
    .filter((o) => o.count >= 12)
    .sort((a, b) => a.tier - b.tier || b.count - a.count);
  return NextResponse.json({
    meta,
    cultures,
    genres,
    cortinas: pool.length,
    builtinCortinas: BUILTIN_CORTINAS.length,
    eras: ERA_PRESETS,
    orchestras,
  });
}
