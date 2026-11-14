import { swapOptions } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { swapWire } from "@/lib/server/wire";
export const dynamic = "force-dynamic";

/**
 * Round 21 — the Swap sheet's lists for one chair: `suggestions` (the sides that keep the tanda valid, best fit first)
 * and, with `query`, `results` (the catalogue by title, orchestra or singer; each excluded side with its reason).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, tandaIndex, trackIndex, query } = body;
  const deps = getCatalogFor(playlist.options?.overrides);
  const r = swapOptions(playlist, Number(tandaIndex), Number(trackIndex), deps, {
    query: typeof query === "string" ? query.slice(0, 80) : undefined,
  });
  return NextResponse.json({ suggestions: r.suggestions.map(swapWire), results: r.results.map(swapWire) });
}
