import { replaceSide, swapTrack } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { forWire } from "@/lib/server/wire";
export const dynamic = "force-dynamic";

/**
 * Swap one side. Round 21: with `songId` the DJ's choice from the Swap sheet takes the chair — a side that keeps the
 * tanda valid, or (with `force`) any side, and then the tanda is pinned as the DJ's; without it the engine draws a
 * valid side. The night comes back re-timed and re-scored; `reason` says why a side was refused.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, tandaIndex, trackIndex, songId, force, pin } = body;
  const deps = getCatalogFor(playlist.options?.overrides);
  if (typeof songId === "string") {
    const r = replaceSide(playlist, Number(tandaIndex), Number(trackIndex), songId, deps, {
      force: !!force,
      pin: !!pin,
    });
    const changed = r.playlist !== playlist;
    return NextResponse.json(
      { ...forWire(r.playlist), changed, ...(r.reason ? { reason: r.reason } : {}) },
      { status: changed || !r.reason ? 200 : 409 },
    );
  }
  const np = swapTrack(playlist, Number(tandaIndex), Number(trackIndex), deps);
  return NextResponse.json({ ...forWire(np), changed: np !== playlist });
}
