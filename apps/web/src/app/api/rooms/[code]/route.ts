import { cleanRoomOps, cleanRoomUser, normalizeRoomCode, parseNightFile } from "@tdj/core";
import { clientKey } from "@/lib/server/guard";
import { json, preflight, readBody, roomView } from "@/lib/server/roomHttp";
import { applyOps, getRoom, presenceOf, rateLimited, roomStoreKind, touch } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

type Ctx = { params: Promise<{ code: string }> };
const off = () => json({ error: "Rooms are not available on this T-DJ site." }, { status: 503 });
const missing = () => json({ error: "No room has this code. Check it and try again." }, { status: 404 });

/** `?since=<rev>&user=<name>[&resolve=1][&log=all]`: the room after `since`, or `{ unchanged }`. */
export async function GET(req: Request, ctx: Ctx) {
  if (!roomStoreKind()) return off();
  const code = normalizeRoomCode((await ctx.params).code);
  const q = new URL(req.url).searchParams;
  if (!code) return missing();
  let room = await getRoom(code);
  if (!room) {
    if (rateLimited(`miss:${clientKey(req)}`, 30))
      return json({ error: "Too many tries. Wait a minute." }, { status: 429 });
    return missing();
  }
  const user = cleanRoomUser(q.get("user"));
  if (user) room = await touch(room, user);
  const since = Number(q.get("since") ?? 0) || 0;
  if (since && since === room.rev && q.get("log") !== "all")
    return json({ code, rev: room.rev, unchanged: true, presence: presenceOf(room) });
  return json(
    roomView(room, {
      since,
      all: q.get("log") === "all",
      resolve: ["1", "true"].includes(q.get("resolve") ?? ""),
    }),
  );
}

/** Body: `{ user, ops, since, resolve? }` → the merged room. */
export async function POST(req: Request, ctx: Ctx) {
  if (!roomStoreKind()) return off();
  const code = normalizeRoomCode((await ctx.params).code);
  if (!code) return missing();
  if (rateLimited(`ops:${clientKey(req)}`, 240))
    return json({ error: "Too many edits at once. Wait a moment." }, { status: 429 });
  const body = await readBody(req);
  const user = cleanRoomUser(body?.user);
  if (!body || !user) return json({ error: "Choose a name first." }, { status: 400 });
  const ops = cleanRoomOps(body.ops, parseNightFile);
  if (!ops) return json({ error: "Nothing to change." }, { status: 400 });
  try {
    const room = await applyOps(code, ops, user);
    if (!room) return missing();
    const since = Number(body.since ?? 0) || 0;
    return json(roomView(room, { since, resolve: body.resolve === true }));
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
}
