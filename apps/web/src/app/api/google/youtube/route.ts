import { flatten, type Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { withoutCortinas } from "@/lib/exportPaths";
import { requestOrigin } from "@/lib/server/cookies";
import { featureLogin, hasScope, youtubePlaylist } from "@/lib/server/google";
import { enabled, errorStatus, GOOGLE, withSession } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/**
 * `{ playlist, includeCortinas, name?, isPublic?, next? }` → a YouTube playlist (YouTube Music shows it too).
 * YouTube has no ISRC lookup: every track is a text search out of the 100 searches/day the whole deployment
 * shares, so the result says what was `missing` (not found) and `skipped` (quota ran out).
 */
export async function POST(req: Request) {
  if (!(await enabled(GOOGLE)))
    return NextResponse.json({ error: "Google login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(GOOGLE, req, origin);
  if (!s) return NextResponse.json({ error: "Not connected with Google" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const playlist = body?.playlist as Playlist | undefined;
  if (!playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  if (!hasScope(s.session, "youtube"))
    return NextResponse.json(
      {
        error: "needs_scope",
        scope: "youtube",
        login: featureLogin("youtube", typeof body.next === "string" ? body.next : "/"),
      },
      { status: 403 },
    );
  const includeCortinas = body.includeCortinas !== false;
  const queries = flatten(includeCortinas ? playlist : withoutCortinas(playlist), { includeCortinas }).map(
    (t) => `${t.title} ${t.orchestra ?? t.artist}${t.singer ? ` ${t.singer}` : ""}`,
  );
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : `TDJ · ${playlist.name}`;
  const description = `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}.`;
  try {
    const r = await youtubePlaylist(s.session.access, {
      name,
      description,
      isPublic: body.isPublic === true,
      queries,
    });
    const res = NextResponse.json({ app: "youtube", ...r });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}
