import { NextResponse } from "next/server";
import type { MatchItem } from "@/lib/match";
import { requestOrigin } from "@/lib/server/cookies";
import { hostedEnabled, matchItems, SpotifyError, withSession } from "@/lib/server/spotify";
import { MATCH_BATCH } from "@/lib/spotifyPlan";
export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * POST { items: [{ id, title, orchestra, singer?, year?, durationSec?, isrc? }] } (≤ 10) →
 * { matches: [{ id, uri, name, artist, album, year, durationMs, score }], missing: [ids], rateLimited?: seconds }.
 * Searches run one at a time on the server with the hosted session; a 429 Spotify would not let us wait out
 * ends the batch early and `rateLimited` tells the browser how long to pause.
 */
export async function POST(req: Request) {
  if (!(await hostedEnabled()))
    return NextResponse.json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(req, origin);
  if (!s) return NextResponse.json({ error: "Not logged in with Spotify" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.items) ? (body.items as unknown[]) : null;
  if (!raw?.length) return NextResponse.json({ error: "items required" }, { status: 400 });
  if (raw.length > MATCH_BATCH)
    return NextResponse.json({ error: `at most ${MATCH_BATCH} items per request` }, { status: 400 });
  const items: MatchItem[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = str(o.id, 80);
    const title = str(o.title);
    const orchestra = str(o.orchestra);
    if (!id || !title) return NextResponse.json({ error: "each item needs id and title" }, { status: 400 });
    items.push({
      id,
      title,
      orchestra,
      singer: str(o.singer, 120) || null,
      year: num(o.year),
      durationSec: num(o.durationSec),
      isrc: /^[A-Z0-9]{12}$/i.test(str(o.isrc, 12)) ? str(o.isrc, 12).toUpperCase() : null,
    });
  }
  try {
    const r = await matchItems(s.session.access, items);
    const res = NextResponse.json(r);
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const status = e instanceof SpotifyError ? (e.status === 401 ? 401 : 502) : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
