import { improveNight, type Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { crossOriginResponse } from "@/lib/server/guard";
import { forWire } from "@/lib/server/wire";
import type { AppOverrides } from "@/lib/types";

export const dynamic = "force-dynamic";
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Improve a night against the benchmark and the engine score (packages/core/src/benchmark.ts → improveNight): a
 * change is kept only when neither number falls and no hard failure appears. Same catalogue (and user overrides) as
 * /api/compose. Returns `{ playlist, changes, before, after }`; the client decides whether to keep it.
 */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const body = await req.json().catch(() => null);
  const playlist = body?.playlist as Playlist | undefined;
  if (!playlist || !Array.isArray(playlist.tandas) || !playlist.options || !playlist.score)
    return bad("playlist required");
  const ovRaw = body?.overrides ?? playlist.options.overrides;
  const overrides =
    ovRaw && typeof ovRaw === "object" && !Array.isArray(ovRaw) ? (ovRaw as AppOverrides) : undefined;
  try {
    const { catalog, cortinas, contextModel } = getCatalogFor(overrides);
    const r = improveNight(playlist, { catalog, cortinas, contextModel });
    return NextResponse.json({ ...r, playlist: forWire(r.playlist) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not improve this set");
  }
}
