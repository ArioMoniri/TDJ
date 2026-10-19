import { type Playlist, toSpotifyPlan } from "@tdj/core";
import { NextResponse } from "next/server";
import { withoutCortinas } from "@/lib/exportPaths";
import { requestOrigin } from "@/lib/server/cookies";
import { createPlaylist, findTrack, hostedEnabled, SpotifyError, withSession } from "@/lib/server/spotify";
export const dynamic = "force-dynamic";

/** Creates the playlist in the logged-in user's library: known URIs first, `isrc:` search, then a text search. */
export async function POST(req: Request) {
  if (!hostedEnabled())
    return NextResponse.json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const origin = requestOrigin(req);
  const s = await withSession(req, origin);
  if (!s) return NextResponse.json({ error: "Not logged in with Spotify" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const playlist = body?.playlist as Playlist | undefined;
  if (!playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const includeCortinas = body.includeCortinas !== false;
  const plan = toSpotifyPlan(includeCortinas ? playlist : withoutCortinas(playlist), { includeCortinas });
  const uris = [...plan.uris];
  const missing: string[] = [];
  try {
    for (const u of plan.unresolved) {
      const uri = await findTrack(s.session.access, {
        isrc: (u.track as { isrc?: string | null }).isrc ?? null,
        query: u.query,
      });
      if (uri) uris.push(uri);
      else missing.push(u.query);
    }
    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : `TDJ · ${playlist.name}`;
    const description =
      typeof body.description === "string"
        ? body.description
        : `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist.score?.total ?? "–"}/100.`;
    const pl = await createPlaylist(s.session.access, {
      name,
      description,
      isPublic: body.isPublic === true,
      uris,
    });
    const res = NextResponse.json({ ...pl, added: uris.length, missing });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const status = e instanceof SpotifyError ? (e.status === 401 ? 401 : 502) : 500;
    return NextResponse.json({ error: (e as Error).message, added: uris.length, missing }, { status });
  }
}
