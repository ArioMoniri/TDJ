import { addSide } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { forWire } from "@/lib/server/wire";
export const dynamic = "force-dynamic";

/**
 * Round 22 — "Add to a tanda" from the song search panel: the side joins the tanda, which is pinned as the DJ's; the
 * night comes back re-timed and re-scored (core `addSide`). `reason` says why a side was refused.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, tandaIndex, songId } = body;
  const deps = getCatalogFor(playlist.options?.overrides);
  const r = addSide(playlist, Number(tandaIndex), String(songId ?? ""), deps);
  const changed = r.playlist !== playlist;
  return NextResponse.json(
    { ...forWire(r.playlist), changed, ...(r.reason ? { reason: r.reason } : {}) },
    { status: changed ? 200 : 409 },
  );
}
