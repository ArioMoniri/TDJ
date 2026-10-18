import { swapTrack } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, tandaIndex, trackIndex } = body;
  const { catalog, cortinas, contextModel } = getCatalogFor(playlist.options?.overrides);
  const np = swapTrack(playlist, Number(tandaIndex), Number(trackIndex), { catalog, cortinas, contextModel });
  return NextResponse.json({ ...np, changed: np !== playlist });
}
