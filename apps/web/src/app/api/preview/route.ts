import { NextResponse } from "next/server";
import { linkExpiry } from "@/lib/server/previewLink";
export const dynamic = "force-dynamic";

/**
 * Fresh 30 s preview for a resolved track. Deezer preview links are signed and expire within minutes, so the cached
 * `previewUrl` in data/cache/resolve is only a hint: at play time we ask Deezer for the current link (keyless,
 * `GET /track/{id}`), cache it per instance until a minute before the link's own expiry (`hdnea=exp=<unix s>`;
 * Deezer signs them for ~15 min, so a 6 h cache handed out dead links → 403), and either redirect the <audio>
 * element to it or hand it to the analyser as JSON (`?json=1`; Deezer previews allow cross-origin fetches).
 * `&fresh=1` skips the cache (the client's one retry after a 403).
 */
const cache = new Map<string, { url: string; until: number }>();

async function fresh(provider: string, id: string, force = false): Promise<string | null> {
  const key = `${provider}:${id}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() < hit.until) return hit.url;
  if (provider !== "deezer" || !/^\d+$/.test(id)) return null;
  const r = await fetch(`https://api.deezer.com/track/${id}`, {
    headers: { "user-agent": "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { preview?: string };
  if (!j.preview) return null;
  cache.set(key, { url: j.preview, until: linkExpiry(j.preview) });
  return j.preview;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const provider = u.searchParams.get("provider") ?? "deezer";
  const id = u.searchParams.get("id") ?? "";
  const url = await fresh(provider, id, u.searchParams.get("fresh") === "1");
  if (!url) return NextResponse.json({ error: "No preview available for this track." }, { status: 404 });
  if (u.searchParams.get("json"))
    return NextResponse.json({ url }, { headers: { "cache-control": "private, max-age=60" } });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=60" } });
}
