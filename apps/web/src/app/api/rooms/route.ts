import { cleanRoomName, cleanRoomUser, parseNightFile } from "@tdj/core";
import { clientKey } from "@/lib/server/guard";
import { json, preflight, readBody, roomView } from "@/lib/server/roomHttp";
import { newRoom, rateLimited, roomStoreKind } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Whether this server keeps rooms and short share links. */
export async function GET() {
  const kind = roomStoreKind();
  return json({ available: !!kind, shortLinks: !!kind });
}

/** Body: `{ user, name, night? }` → the new room. */
export async function POST(req: Request) {
  if (!roomStoreKind()) return json({ error: "Rooms are not available on this server." }, { status: 503 });
  if (rateLimited(`create:${clientKey(req)}`, 10))
    return json({ error: "Too many new rooms at once. Wait a minute." }, { status: 429 });
  const body = await readBody(req);
  const user = cleanRoomUser(body?.user);
  if (!body || !user) return json({ error: "Choose a name first." }, { status: 400 });
  const name = cleanRoomName(body.name) ?? `${user}’s room`;
  let night = null;
  if (body.night) {
    try {
      night = parseNightFile(body.night);
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 400 });
    }
  }
  try {
    const room = await newRoom({ name, by: user, night });
    return json(roomView(room, { all: true }), { status: 201 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
}
