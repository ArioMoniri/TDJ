import { NextResponse } from "next/server";
import { type Fetch, type FillWant, lookup, politeFetch, SOURCES, type SourceId } from "@/lib/fill/sources";
export const dynamic = "force-dynamic";

const polite = politeFetch(fetch as unknown as Fetch);

/**
 * Round 22 — one source lookup for the fill flow, run here because Deezer answers no browser (no CORS). POST
 * { source, song } with the DJ's Discogs token in `x-discogs-token` (used for this request only, never stored).
 * The merge into the DJ's record happens in the browser (lib/fill), so the same code runs in a standalone app.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { source?: string; song?: Partial<FillWant> } | null;
  const source = body?.source as SourceId | undefined;
  const s = body?.song;
  if (!source || !SOURCES.some((x) => x.id === source) || source === "spotify")
    return NextResponse.json({ error: "unknown source" }, { status: 400 });
  if (!s?.title || !s.orchestra)
    return NextResponse.json({ error: "title and orchestra required" }, { status: 400 });
  const want: FillWant = {
    id: String(s.id ?? ""),
    title: String(s.title).slice(0, 120),
    orchestra: String(s.orchestra).slice(0, 120),
    singer: typeof s.singer === "string" ? s.singer : null,
    year: typeof s.year === "number" ? s.year : null,
    deezerId: typeof s.deezerId === "string" && /^\d+$/.test(s.deezerId) ? s.deezerId : null,
  };
  const token = req.headers.get("x-discogs-token") ?? undefined;
  const r = await lookup(source, want, { fetch: polite, discogsToken: token || undefined });
  return NextResponse.json(r);
}
