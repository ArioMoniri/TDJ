import type { Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { withoutCortinas } from "@/lib/exportPaths";
import { requestOrigin } from "@/lib/server/cookies";
import { crossOriginResponse } from "@/lib/server/guard";
import {
  addTracks,
  createPlaylist,
  hostedEnabled,
  MATCH_BUDGET_MS,
  matchItems,
  SpotifyError,
  withSession,
} from "@/lib/server/spotify";
import { spotifyPlanFor } from "@/lib/spotifyPlan";
export const dynamic = "force-dynamic";

/**
 * Creates the playlist in the logged-in user's library. The Export sheet matches first through /api/spotify/match
 * and sends `uris`; `playlistId` appends to a playlist made earlier (the "Try again" after a rate limit). Without
 * `uris` (older callers) the unresolved tracks are matched here, one search at a time, stopping at a rate limit
 * or at the 20 s budget (`rateLimited`), so the request never outlives the function.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  if (!(await hostedEnabled()))
    return NextResponse.json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const origin = await requestOrigin(req);
  const s = await withSession(req, origin);
  if (!s) return NextResponse.json({ error: "Not logged in with Spotify" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const playlist = body?.playlist as Playlist | undefined;
  const given = Array.isArray(body?.uris)
    ? (body.uris as unknown[]).filter((u): u is string => typeof u === "string" && /^spotify:track:/.test(u))
    : null;
  if (!playlist?.tandas && !given) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const includeCortinas = body.includeCortinas !== false;
  const uris: string[] = given ? [...given] : [];
  const missing: string[] = [];
  let rateLimited: number | undefined;
  try {
    if (!given && playlist) {
      const plan = spotifyPlanFor(includeCortinas ? playlist : withoutCortinas(playlist), null, {
        includeCortinas,
      });
      uris.push(...plan.uris);
      const r = await matchItems(s.session.access, plan.items, { deadline: started + MATCH_BUDGET_MS });
      uris.push(...r.matches.map((m) => m.uri));
      for (const id of r.missing) {
        const t = plan.tracks.find((x) => (x.id ?? "") === id);
        missing.push(t ? `${t.title} ${t.orchestra ?? t.artist}` : id);
      }
      rateLimited = r.rateLimited;
    }
    const playlistId =
      typeof body.playlistId === "string" && /^[A-Za-z0-9]+$/.test(body.playlistId)
        ? (body.playlistId as string)
        : null;
    if (playlistId) {
      const added = await addTracks(s.session.access, playlistId, uris);
      const res = NextResponse.json({
        id: playlistId,
        url: typeof body.url === "string" ? body.url : `https://open.spotify.com/playlist/${playlistId}`,
        added,
        missing,
        ...(rateLimited ? { rateLimited } : {}),
      });
      if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
      return res;
    }
    const tandas = playlist?.tandas.length ?? 0;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : `TDJ · ${playlist?.name ?? "set"}`;
    const description =
      typeof body.description === "string"
        ? body.description
        : `${tandas} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist?.score?.total ?? "–"}/100.`;
    const pl = await createPlaylist(s.session.access, {
      name,
      description,
      isPublic: body.isPublic === true,
      uris,
    });
    const res = NextResponse.json({
      ...pl,
      added: uris.length,
      missing,
      ...(rateLimited ? { rateLimited } : {}),
    });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const status = e instanceof SpotifyError ? (e.status === 401 ? 401 : e.status === 429 ? 429 : 502) : 500;
    return NextResponse.json({ error: (e as Error).message, added: uris.length, missing }, { status });
  }
}
