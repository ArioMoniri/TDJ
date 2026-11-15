import { swapTanda, swapTandaOptions } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { forWire } from "@/lib/server/wire";
export const dynamic = "force-dynamic";

/**
 * Swap one tanda. Body: { playlist, index, options? }. Wave 2: with `options: true` the answer is up to three
 * nights, each with another family in the slot, ranked by distance to the slot's planned energy (nearest first), for
 * the DJ to choose from; without it, the single swap as before.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, index } = body;
  const { catalog, cortinas, contextModel } = getCatalogFor(playlist.options?.overrides);
  const deps = { catalog, cortinas, contextModel };
  if (body.options === true)
    return NextResponse.json({
      options: swapTandaOptions(playlist, Number(index), deps, Date.now() % 1e9).map(forWire),
    });
  return NextResponse.json(forWire(swapTanda(playlist, Number(index), deps)));
}
