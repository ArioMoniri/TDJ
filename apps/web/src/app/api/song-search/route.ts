import { type SongQuery, searchSongs } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { songWire } from "@/lib/songWire";
export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : undefined);

/**
 * Round 22 — the song search panel: POST { query, overrides? } → the matching sides (core `searchSongs` over the
 * catalogue with the DJ's database). Where each side sits in tonight's night is worked out in the browser.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    query?: Record<string, unknown>;
    overrides?: unknown;
  } | null;
  const q = body?.query ?? {};
  const query: SongQuery = {
    text: str(q.text),
    orchestra: str(q.orchestra),
    singer: str(q.singer),
    yearFrom: num(q.yearFrom),
    yearTo: num(q.yearTo),
    rhythms: Array.isArray(q.rhythms)
      ? q.rhythms.filter((r): r is string => typeof r === "string")
      : undefined,
    limit: Math.min(100, num(q.limit) ?? 60),
  };
  const { catalog } = getCatalogFor((body?.overrides ?? null) as never);
  return NextResponse.json({ results: searchSongs(catalog.songs, query).map((h) => songWire(h.song)) });
}
