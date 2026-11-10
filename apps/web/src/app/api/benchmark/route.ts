import { benchmarkNight, type Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { crossOriginResponse } from "@/lib/server/guard";

export const dynamic = "force-dynamic";
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** The night against the published DJ sets (docs/specs/round12-benchmark.md): `{ total, checks, inRange, scored }`. */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const body = await req.json().catch(() => null);
  const playlist = (body?.playlist ?? body) as Playlist | null;
  if (!playlist || !Array.isArray(playlist.tandas) || !playlist.options) return bad("playlist required");
  try {
    return NextResponse.json(benchmarkNight(playlist));
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not benchmark this set");
  }
}
