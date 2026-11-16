import type { Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/server/cookies";
import {
  addYoutubeItems,
  checkYoutube,
  createYoutubePlaylist,
  featureLogin,
  hasScope,
  syncYoutube,
  YOUTUBE_BUDGET_MS,
  youtubePlaylist,
  youtubeUrl,
} from "@/lib/server/google";
import { crossOriginResponse } from "@/lib/server/guard";
import { enabled, errorStatus, GOOGLE, withSession } from "@/lib/server/oauth";
import { YOUTUBE_BATCH, youtubeQueries } from "@/lib/youtubePlan";
export const dynamic = "force-dynamic";

/**
 * A YouTube playlist (YouTube Music shows it too), built like the Spotify export, batch by batch so no request
 * outlives the function:
 *   `{ queries: [≤ 10], name?, isPublic?, playlistId? }` → `{ id, url, added, missing, skipped, quota, timeout }`.
 *   The first call (no `playlistId`) creates the playlist; the Export sheet sends the next batch with its `id`.
 * Older callers send `{ playlist, includeCortinas, name?, isPublic?, next? }` and get the whole set in one go, as
 * far as the time budget allows. YouTube has no ISRC lookup: every track is a text search out of the 100
 * searches/day the whole deployment shares, so the result says what was `missing` (not found) and `skipped`
 * (quota ran out, or the budget did).
 */
export async function POST(req: Request) {
  const started = Date.now();
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!(await enabled(GOOGLE)))
    return NextResponse.json({ error: "Google login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(GOOGLE, req, origin);
  if (!s) return NextResponse.json({ error: "Not connected with Google" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const playlist = body.playlist as Playlist | undefined;
  // `{ verify: true, playlistId, expected: [{ videoId, query }], region? }`: the playlist read back with the DJ's
  // token, every page, checked video by video for their country and put right (lib/youtubeVerify.ts)
  if (body.verify === true) {
    const playlistId =
      typeof body.playlistId === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(body.playlistId)
        ? (body.playlistId as string)
        : null;
    // 2026-11, `sync: true` (the exported playlists' sync): a row may come without its video (a new song): it is
    // searched first (lib/server/google.ts → syncYoutube)
    const sync = body.sync === true;
    const expected = Array.isArray(body.expected)
      ? (body.expected as Array<{ videoId?: unknown; query?: unknown }>)
          .slice(0, 400)
          .filter(
            (x) =>
              (typeof x?.videoId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x.videoId)) ||
              (sync && x?.videoId === "" && typeof x?.query === "string" && !!x.query.trim()),
          )
          .map((x) => ({ videoId: x.videoId as string, query: String(x.query ?? "").slice(0, 200) }))
      : null;
    if (!playlistId || !expected)
      return NextResponse.json({ error: "playlistId and expected required" }, { status: 400 });
    if (!hasScope(s.session, "youtube"))
      return NextResponse.json(
        { error: "needs_scope", scope: "youtube", login: featureLogin("youtube", "/") },
        { status: 403 },
      );
    const region =
      typeof body.region === "string" && /^[A-Z]{2}$/.test(body.region) ? body.region : undefined;
    const check = sync
      ? await syncYoutube(s.session.access, playlistId, expected, region, {
          deadline: started + YOUTUBE_BUDGET_MS,
        })
      : await checkYoutube(s.session.access, playlistId, expected, region);
    const res = NextResponse.json({ app: "youtube", id: playlistId, url: youtubeUrl(playlistId), check });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  }
  const queries = Array.isArray(body.queries)
    ? (body.queries as unknown[]).filter((q): q is string => typeof q === "string" && !!q.trim())
    : null;
  if (!playlist?.tandas && !queries)
    return NextResponse.json({ error: "playlist required" }, { status: 400 });
  if (queries && queries.length > YOUTUBE_BATCH)
    return NextResponse.json({ error: `at most ${YOUTUBE_BATCH} queries per request` }, { status: 400 });
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
  const tandas = typeof body.tandas === "number" ? body.tandas : (playlist?.tandas.length ?? 0);
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 150)
      : `TDJ · ${playlist?.name ?? "set"}`;
  const description = `${tandas} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}.`;
  const isPublic = body.isPublic === true;
  try {
    if (queries) {
      const playlistId =
        typeof body.playlistId === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(body.playlistId)
          ? (body.playlistId as string)
          : null;
      const pl = playlistId
        ? { id: playlistId, url: youtubeUrl(playlistId) }
        : await createYoutubePlaylist(s.session.access, { name, description, isPublic });
      const r = await addYoutubeItems(
        s.session.access,
        pl.id,
        queries.map((q) => q.slice(0, 200)),
        {
          deadline: started + YOUTUBE_BUDGET_MS,
        },
      );
      const res = NextResponse.json({ app: "youtube", ...pl, ...r, created: !playlistId });
      if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
      return res;
    }
    const r = await youtubePlaylist(s.session.access, {
      name,
      description,
      isPublic,
      queries: youtubeQueries(playlist!, includeCortinas),
    });
    const res = NextResponse.json({ app: "youtube", ...r, created: true });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: errorStatus(e) });
  }
}
