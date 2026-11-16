import { createHash } from "node:crypto";
import { cleanDancerToken, cleanRoomId, cleanRoomUser, normalizeRoomCode, roomHeartsView } from "@tdj/core";
import { clientKey } from "@/lib/server/guard";
import { json, preflight, readBody } from "@/lib/server/roomHttp";
import { getRoom, heartSong, rateLimited, roomStoreKind, setPlaying } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * 2026-11, dancer hearts. GET `?night=<id>` → `{ playing, hearts }` (counts only). POST `{ user, playing }` (the DJ's
 * booth: what is playing now) or `{ heart: { nightId, songId, dancer } }` (a dancer: once per song per night). The
 * dancer's token is hashed with the room's code before it is kept, and never sent back.
 */
type Ctx = { params: Promise<{ code: string }> };
const off = () => json({ error: "Rooms are not available on this T-DJ site." }, { status: 503 });
const missing = () => json({ error: "No room has this code. Check it and try again." }, { status: 404 });
const hashOf = (code: string, token: string) =>
  createHash("sha256").update(`${code}:${token}`).digest("base64url").slice(0, 22);

export async function GET(req: Request, ctx: Ctx) {
  if (!roomStoreKind()) return off();
  const code = normalizeRoomCode((await ctx.params).code);
  if (!code) return missing();
  const room = await getRoom(code);
  if (!room) return missing();
  const night = cleanRoomId(new URL(req.url).searchParams.get("night"));
  return json(roomHeartsView(room, night));
}

export async function POST(req: Request, ctx: Ctx) {
  if (!roomStoreKind()) return off();
  const code = normalizeRoomCode((await ctx.params).code);
  if (!code) return missing();
  if (rateLimited(`hearts:${clientKey(req)}`, 120))
    return json({ error: "Too many hearts at once. Wait a moment." }, { status: 429 });
  const body = await readBody(req, 4000);
  if (!body) return json({ error: "Nothing to change." }, { status: 400 });
  if (body.heart && typeof body.heart === "object") {
    const h = body.heart as Record<string, unknown>;
    const nightId = cleanRoomId(h.nightId);
    const songId = cleanRoomId(h.songId);
    const dancer = cleanDancerToken(h.dancer);
    if (!nightId || !songId || !dancer) return json({ error: "Nothing to heart." }, { status: 400 });
    // (one atomic add to the song's own set: hearts that arrive together all count; rooms.ts)
    const r = await heartSong(code, { nightId, songId, dancer: hashOf(code, dancer) });
    return r ? json(r) : missing();
  }
  if ("playing" in body) {
    const user = cleanRoomUser(body.user);
    if (!user) return json({ error: "Choose a name first." }, { status: 400 });
    const p = body.playing as Record<string, unknown> | null;
    const songId = p ? cleanRoomId(p.songId) : null;
    const nightId = p ? cleanRoomId(p.nightId) : null;
    if (p && (!songId || !nightId)) return json({ error: "Nothing to change." }, { status: 400 });
    // only a DJ of the room says what plays
    const r = await setPlaying(
      code,
      user,
      p && songId && nightId
        ? {
            songId,
            nightId,
            title: String(p.title ?? ""),
            artist: String(p.artist ?? ""),
            at: new Date().toISOString(),
          }
        : null,
    );
    if (!r) return missing();
    if (r === "forbidden") return json({ error: "Join the room first." }, { status: 403 });
    return json(roomHeartsView(r, nightId));
  }
  return json({ error: "Nothing to change." }, { status: 400 });
}
