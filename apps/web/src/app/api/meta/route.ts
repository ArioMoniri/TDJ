import { BUILTIN_CORTINAS, cortinaPool, ERA_PRESETS } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/server/catalog";
import { dbEnabled } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const { catalog, cortinas, meta, contextModel, corpus, trackEnergy, referencePlaylists } = getCatalog();
  const pool = cortinaPool(cortinas);
  const cultures = [...new Set(pool.map((c) => c.culture))].sort();
  const genres = [...new Set(pool.map((c) => c.genre))].sort();
  const orchestras = [...catalog.byOrchestra.entries()]
    .map(([id, songs]) => {
      const p = catalog.profile(id);
      return {
        id,
        name: songs[0]!.orchestra,
        count: songs.length,
        tier: p?.tier ?? 3,
        style: p?.style,
        energy: p?.energy,
        phase: p?.phase,
        notBefore: p?.notBefore,
        singers: p?.singers,
      };
    })
    .filter((o) => o.count >= 12)
    .sort((a, b) => a.tier - b.tier || b.count - a.count);
  return NextResponse.json({
    meta,
    cultures,
    genres,
    cortinas: pool.length,
    cortinaList: pool,
    builtinCortinas: BUILTIN_CORTINAS.length,
    eras: ERA_PRESETS,
    orchestras,
    contextModel: contextModel
      ? {
          version: contextModel.version,
          baseline: contextModel.baseline,
          factors: contextModel.factors.map((f) => ({
            id: f.id,
            label: f.label,
            options: f.options.map((o) => ({
              id: o.id,
              label: o.label,
              energyShift: o.energyShift,
              tempoShift: o.tempoShift,
              vocalRatioShift: o.vocalRatioShift,
              valsShare: o.valsShare,
              milongaShare: o.milongaShare,
              cortinaGenres: o.cortinaGenres,
              tandaSizeShift: o.tandaSizeShift,
              evidence: o.evidence,
              notes: o.notes,
              arcShift: o.arcShift,
              preferStyles: o.preferStyles,
              avoidStyles: o.avoidStyles,
            })),
          })),
        }
      : null,
    referencePlaylists,
    knowledge: {
      profiles: catalog.profiles.size,
      cortinas: pool.length,
      contextFactors: contextModel?.factors.length ?? 0,
      referencePlaylists: referencePlaylists.length,
      trackEnergy: Object.keys(trackEnergy).length,
      famousRecordings: corpus.famousRecordings?.length ?? 0,
      canonicalTandas: corpus.canonicalTandas?.length ?? 0,
    },
    storage: dbEnabled() ? "server" : "browser",
  });
}
