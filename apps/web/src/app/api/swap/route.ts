import { swapTanda } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, index } = body;
  const { catalog, cortinas, contextModel } = getCatalogFor(playlist.options?.overrides);
  return NextResponse.json(swapTanda(playlist, Number(index), { catalog, cortinas, contextModel }));
}
