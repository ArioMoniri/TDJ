import "server-only";
import { importNight, type RoomState } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalog } from "./catalog";
import { presenceOf } from "./rooms";

/**
 * HTTP helpers for the room and share routes. Rooms carry no cookie and no account (a username and the code are
 * the identity), so they answer any origin without credentials: the Mac and iPad apps join a room on the server of
 * whoever made it from their own origin.
 */
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "600",
};
export function json(body: unknown, init: ResponseInit = {}): NextResponse {
  const res = NextResponse.json(body, init);
  res.headers.set("cache-control", "no-store");
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

/** The JSON body, refused past `max` bytes. */
export async function readBody(req: Request, max = 600_000): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > max) return null;
  try {
    const x = JSON.parse(text);
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** What a client sees of a room: everything but the members list, the log after `since` (or all of it). */
export function roomView(room: RoomState, o: { since?: number; all?: boolean; resolve?: boolean } = {}) {
  const log = o.all ? room.log : room.log.filter((e) => e.rev > (o.since ?? 0));
  const view: Record<string, unknown> = {
    code: room.code,
    name: room.name,
    createdAt: room.createdAt,
    createdBy: room.createdBy,
    rev: room.rev,
    slots: room.slots,
    night: room.night,
    log: o.since || o.all ? log : log.slice(-100),
    presence: presenceOf(room),
  };
  if (o.resolve) {
    if (!room.night) view.playlist = null;
    else {
      const { catalog, cortinas } = getCatalog();
      const r = importNight(room.night, { catalog, cortinas });
      view.playlist = r.playlist;
      view.missing = r.missing;
    }
  }
  return view;
}
