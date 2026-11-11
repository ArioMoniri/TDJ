import type { Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { withoutCortinas } from "@/lib/exportPaths";
import { getCatalog } from "@/lib/server/catalog";
import { requestOrigin } from "@/lib/server/cookies";
import { crossOriginResponse } from "@/lib/server/guard";
import {
  addTracks,
  createPlaylist,
  hostedEnabled,
  MATCH_BUDGET_MS,
  matchItems,
  replaceTracks,
  SpotifyError,
  updatePlaylistDetails,
  withSession,
} from "@/lib/server/spotify";
import { orderedUris, spotifyPlanFor, standInCortinas } from "@/lib/spotifyPlan";
export const dynamic = "force-dynamic";

/**
 * Creates the playlist in the logged-in user's library. The Export sheet matches first through /api/spotify/match
 * and sends `uris` in running order; `playlistId` with `replace` overwrites a playlist made earlier (updating it,
 * or the "Try again" after a rate limit), `playlistId` alone appends. Without
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
  /** round 19: the cortinas Spotify could not match and the Spotify-ready cue of their family that stands in */
  let standIns: Array<{ id: string; cue: string; standIn: string; uri: string }> = [];
  let rateLimited: number | undefined;
  try {
    if (!given && playlist) {
      const plan = spotifyPlanFor(includeCortinas ? playlist : withoutCortinas(playlist), null, {
        includeCortinas,
      });
      const r = await matchItems(s.session.access, plan.items, { deadline: started + MATCH_BUDGET_MS });
      const found = new Map(r.matches.map((m) => [m.id, m.uri] as const));
      // round 19: a cortina with no match gets the nearest Spotify-ready cue of its family, never a gap
      const si = includeCortinas
        ? standInCortinas(playlist, r.missing, found, getCatalog().cortinas)
        : { standIns: [], missing: r.missing };
      standIns = si.standIns;
      // running order: each match goes back into its own row (cortinas stay between the tandas)
      uris.push(...orderedUris(plan, found));
      for (const id of si.missing) {
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
      const added =
        body.replace === true
          ? await replaceTracks(s.session.access, playlistId, uris)
          : await addTracks(s.session.access, playlistId, uris);
      // an update brings the title and description (with the set's score) up to date too; append ("Try again")
      // and calls without them leave the details alone
      const details =
        body.replace === true && (typeof body.name === "string" || typeof body.description === "string")
          ? await updatePlaylistDetails(s.session.access, playlistId, {
              name: typeof body.name === "string" ? body.name.trim() : undefined,
              description: typeof body.description === "string" ? body.description : undefined,
            })
          : false;
      const res = NextResponse.json({
        id: playlistId,
        url: typeof body.url === "string" ? body.url : `https://open.spotify.com/playlist/${playlistId}`,
        added,
        details,
        missing,
        ...(standIns.length ? { standIns } : {}),
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
      ...(standIns.length ? { standIns } : {}),
      ...(rateLimited ? { rateLimited } : {}),
    });
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const status = e instanceof SpotifyError ? (e.status === 401 ? 401 : e.status === 429 ? 429 : 502) : 500;
    return NextResponse.json({ error: (e as Error).message, added: uris.length, missing }, { status });
  }
}
