import { NextResponse } from "next/server";
import { youtubeMyPlaylists, youtubePlaylistId, youtubeReadPlaylist } from "@/lib/playlistSources";
import { requestOrigin } from "@/lib/server/cookies";
import { featureLogin, hasScope, youtubeCall } from "@/lib/server/google";
import { crossOriginResponse, noStore } from "@/lib/server/guard";
import { enabled, errorStatus, GOOGLE, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/**
 * "Import a playlist" from YouTube / YouTube Music (2026-11), with the DJ's own Google session (the `youtube` scope
 * the export asks for): `GET` → `{ playlists }` (the DJ's own, every page); `POST { link }` → the playlist's videos
 * as import items (core playlistImport.ts), each with its length and its video id kept so it plays in the Booth.
 * Reading costs 1 quota unit per 50 rows (no search), so an import never touches the export's search budget.
 */
async function session(req: Request) {
  if (!(await enabled(GOOGLE)))
    return { error: NextResponse.json({ error: "Google login is not enabled" }, { status: 404 }) };
  const s = await withSession(GOOGLE, req, await requestOrigin(req));
  if (!s) return { error: NextResponse.json({ error: "Not connected with Google" }, { status: 401 }) };
  if (!hasScope(s.session, "youtube"))
    return {
      error: NextResponse.json(
        { error: "needs_scope", scope: "youtube", login: featureLogin("youtube", "/import?from=youtube") },
        { status: 403 },
      ),
    };
  return { s };
}
const yt = (access: string) => {
  const call = youtubeCall(access);
  return <T>(path: string) => call<T>("GET", path);
};

export async function GET(req: Request) {
  const { s, error } = await session(req);
  if (error) return noStore(error);
  try {
    const res = noStore(NextResponse.json({ playlists: await youtubeMyPlaylists(yt(s.session.access)) }));
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    return noStore(NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) }));
  }
}

export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const body = (await req.json().catch(() => null)) as { link?: unknown } | null;
  const id = typeof body?.link === "string" ? youtubePlaylistId(body.link) : null;
  if (!id) return NextResponse.json({ error: "not_a_playlist" }, { status: 400 });
  const { s, error } = await session(req);
  if (error) return error;
  try {
    const res = NextResponse.json(await youtubeReadPlaylist(yt(s.session.access), id));
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}
