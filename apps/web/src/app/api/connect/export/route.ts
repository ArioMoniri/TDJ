import { EXPORT_META, type ExportFormat, flatten, type Playlist, toSpotifyPlan } from "@tdj/core";
import { NextResponse } from "next/server";
import { withoutCortinas } from "@/lib/exportPaths";
import {
  connectEnabled,
  isConnectApp,
  listAccounts,
  spotifyPlaylistViaProxy,
  uploadDrive,
  uploadDropbox,
  youtubePlaylist,
} from "@/lib/server/connect";
import { userFromRequest } from "@/lib/server/db";
export const dynamic = "force-dynamic";

/**
 * Sends an export through the Pipedream proxy to one of the user's connected apps:
 * files (`{ accountId, app, format, filename, text }`) to Dropbox / Google Drive, playlists
 * (`{ accountId, app, playlist, includeCortinas }`) to YouTube (quota-bound, best effort) or Spotify.
 */
export async function POST(req: Request) {
  if (!connectEnabled())
    return NextResponse.json({ error: "Pipedream Connect is not enabled" }, { status: 404 });
  const user = userFromRequest(req);
  if (user.setCookie) return NextResponse.json({ error: "No connected accounts" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !isConnectApp(body.app) || typeof body.accountId !== "string")
    return NextResponse.json({ error: "app and accountId required" }, { status: 400 });
  const account = (await listAccounts(user.id).catch(() => [])).find(
    (a) => a.id === body.accountId && a.app === body.app,
  );
  if (!account) return NextResponse.json({ error: "That account is not connected" }, { status: 403 });
  try {
    if (body.app === "dropbox" || body.app === "google_drive") {
      const format = body.format as ExportFormat;
      if (typeof body.text !== "string" || !Object.hasOwn(EXPORT_META, format))
        return NextResponse.json({ error: "format and text required" }, { status: 400 });
      const m = EXPORT_META[format];
      const filename =
        typeof body.filename === "string" && body.filename ? body.filename : `tdj-set.${m.ext}`;
      const r =
        body.app === "dropbox"
          ? await uploadDropbox(user.id, account.id, { filename, text: body.text })
          : await uploadDrive(user.id, account.id, { filename, mime: m.mime, text: body.text });
      return NextResponse.json({ app: body.app, ...r });
    }
    const playlist = body.playlist as Playlist | undefined;
    if (!playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
    const includeCortinas = body.includeCortinas !== false;
    const plan = toSpotifyPlan(includeCortinas ? playlist : withoutCortinas(playlist), { includeCortinas });
    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : `TDJ · ${playlist.name}`;
    const description = `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}.`;
    const isPublic = body.isPublic === true;
    if (body.app === "youtube_data_api") {
      // YouTube has no ISRC lookup: every track is a text search, 100 searches/day for the whole deployment
      const queries = flatten(includeCortinas ? playlist : withoutCortinas(playlist), {
        includeCortinas,
      }).map((t) => `${t.title} ${t.orchestra ?? t.artist}${t.singer ? ` ${t.singer}` : ""}`);
      const r = await youtubePlaylist(user.id, account.id, { name, description, isPublic, queries });
      return NextResponse.json({ app: body.app, ...r });
    }
    const r = await spotifyPlaylistViaProxy(user.id, account.id, {
      name,
      description,
      isPublic,
      uris: plan.uris,
      queries: plan.unresolved.map((u) => ({
        isrc: (u.track as { isrc?: string | null }).isrc ?? null,
        query: u.query,
      })),
    });
    return NextResponse.json({ app: body.app, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
