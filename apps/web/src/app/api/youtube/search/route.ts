import { NextResponse } from "next/server";
import { keyError, parseYoutubeSearch, youtubeSearchUrl } from "@/lib/connections/youtube";
import { getConfigValue } from "@/lib/server/config";
import { clientKey, crossOriginResponse } from "@/lib/server/guard";
import { rateLimited } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";

/**
 * 2026-11 — `GET /api/youtube/search?q=…`: five embeddable videos with the deployment's own YouTube Data API key
 * (`YOUTUBE_API_KEY`, environment or Parameter Store; docs/CONNECTORS.md), so "Find a video" works without a Google
 * sign-in. 404 when the deployment has no key: the page then tries the DJ's Google sign-in. Every search costs 100
 * of the project's 10,000 daily units, so a client gets 10 a minute; the key never leaves the server.
 */
export async function GET(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const key = await getConfigValue("YOUTUBE_API_KEY");
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  if (rateLimited(`yt-search:${clientKey(req)}`, 10))
    return NextResponse.json({ error: "slow_down" }, { status: 429, headers: { "retry-after": "60" } });
  try {
    const r = await fetch(youtubeSearchUrl(q, key), { signal: AbortSignal.timeout(10_000) });
    const body = await r.text();
    if (!r.ok) {
      const e = keyError(r.status, body);
      // a wrong or restricted server key is the owner's to fix: said as "unavailable", never as the key
      return NextResponse.json(
        { error: e === "quota" ? "quota" : "unavailable" },
        { status: e === "quota" ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { videos: parseYoutubeSearch(JSON.parse(body)) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
