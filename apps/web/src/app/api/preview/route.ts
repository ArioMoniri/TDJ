import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/**
 * Fresh 30 s preview for a resolved track. Deezer preview links are signed and expire after ~24 h, so the cached
 * `previewUrl` in data/cache/resolve is only a hint: at play time we ask Deezer for the current link (keyless,
 * `GET /track/{id}`), cache it for 6 h per instance, and either redirect the <audio> element to it or hand it to the
 * analyser as JSON (`?json=1`; Deezer previews allow cross-origin fetches).
 */
const TTL = 6 * 3600_000;
const cache = new Map<string, { url: string; at: number }>();

async function fresh(provider: string, id: string): Promise<string | null> {
  const key = `${provider}:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.url;
  if (provider !== "deezer" || !/^\d+$/.test(id)) return null;
  const r = await fetch(`https://api.deezer.com/track/${id}`, {
    headers: { "user-agent": "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { preview?: string };
  if (!j.preview) return null;
  cache.set(key, { url: j.preview, at: Date.now() });
  return j.preview;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const provider = u.searchParams.get("provider") ?? "deezer";
  const id = u.searchParams.get("id") ?? "";
  const url = await fresh(provider, id);
  if (!url) return NextResponse.json({ error: "No preview available for this track." }, { status: 404 });
  if (u.searchParams.get("json"))
    return NextResponse.json({ url }, { headers: { "cache-control": "private, max-age=3600" } });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=3600" } });
}
