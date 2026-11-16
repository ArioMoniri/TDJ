/**
 * A linked TDJ server in memory, for the Rooms screenshots only. In the app, Rooms go through a server the DJ linked
 * under Settings → Connections (apps/web/src/lib/app/routes.ts → VIA_LINKED_SERVER); the capture links one and
 * answers its /api/rooms requests here, with the same room engine the server runs (@tdj/core room.ts), so two
 * browser contexts (two DJs) share one room as they would through a real server. Nothing leaves the machine.
 */
import { createHash } from "node:crypto";
import type { BrowserContext } from "playwright";
import {
  applyRoomOps,
  cleanDancerToken,
  cleanRoomId,
  cleanRoomName,
  cleanRoomOps,
  cleanRoomUser,
  createRoom,
  heartRoom,
  importNight,
  type NightFile,
  normalizeRoomCode,
  parseNightFile,
  type RoomState,
  roomHeartsView,
  roomPresence,
  setRoomPlaying,
} from "../../../../packages/core/src/index";
import { loadCatalog } from "../../../../packages/core/src/load";

export const LINKED = { server: "https://tdj.local", apiBase: "http://127.0.0.1:9/__linked" } as const;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

type Res = { status: number; body: unknown };

export class RoomServer {
  rooms = new Map<string, RoomState>();
  private catalog: ReturnType<typeof loadCatalog> | null = null;
  private seq = 0;

  private view(room: RoomState, o: { since?: number; all?: boolean; resolve?: boolean } = {}) {
    const log = o.all ? room.log : room.log.filter((e) => e.rev > (o.since ?? 0));
    const v: Record<string, unknown> = {
      code: room.code,
      name: room.name,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      rev: room.rev,
      slots: room.slots,
      night: room.night,
      log: o.since || o.all ? log : log.slice(-100),
      presence: roomPresence(room, Date.now()),
    };
    if (o.resolve) {
      if (!room.night) v.playlist = null;
      else {
        this.catalog ??= loadCatalog();
        const r = importNight(room.night, { catalog: this.catalog.catalog, cortinas: this.catalog.cortinas });
        v.playlist = r.playlist;
        v.missing = r.missing;
      }
    }
    return v;
  }

  private touch(room: RoomState, user: string): RoomState {
    const next = { ...room, members: { ...room.members, [user]: new Date().toISOString() } };
    this.rooms.set(room.code, next);
    return next;
  }

  /** one request of the page to its linked server: path (with query), method, JSON body */
  handle(url: string, method: string, body: Record<string, unknown> | null): Res {
    const u = new URL(url, "http://x");
    const parts = u.pathname
      .replace(/^.*?\/api\/rooms/, "")
      .split("/")
      .filter(Boolean);
    if (!u.pathname.includes("/api/rooms")) return { status: 404, body: { error: "Not here." } };
    if (!parts.length) {
      if (method === "GET") return { status: 200, body: { available: true, shortLinks: false } };
      const user = cleanRoomUser(body?.user);
      if (!user) return { status: 400, body: { error: "Choose a name first." } };
      const night = body?.night ? parseNightFile(body.night) : null;
      // stable codes, so the panels read the same on every run
      const code = ["P5Y6P8", "K7M2QD", "T3HX9W"][this.seq++ % 3]!;
      const room = createRoom({
        code,
        name: cleanRoomName(body?.name) ?? `${user}’s room`,
        by: user,
        at: new Date().toISOString(),
        night: night as NightFile | null,
      });
      this.rooms.set(code, room);
      return { status: 201, body: this.view(room, { all: true }) };
    }
    const code = normalizeRoomCode(parts[0]);
    let room = code ? this.rooms.get(code) : undefined;
    if (!code || !room)
      return { status: 404, body: { error: "No room has this code. Check it and try again." } };
    if (parts[1] === "hearts") {
      if (method === "GET")
        return { status: 200, body: roomHeartsView(room, cleanRoomId(u.searchParams.get("night"))) };
      if (body?.heart && typeof body.heart === "object") {
        const h = body.heart as Record<string, unknown>;
        const nightId = cleanRoomId(h.nightId);
        const songId = cleanRoomId(h.songId);
        const dancer = cleanDancerToken(h.dancer);
        if (!nightId || !songId || !dancer) return { status: 400, body: { error: "Nothing to heart." } };
        const r = heartRoom(room, {
          nightId,
          songId,
          dancer: createHash("sha256").update(`${code}:${dancer}`).digest("base64url").slice(0, 22),
        });
        this.rooms.set(code, r.room);
        return { status: 200, body: { ...roomHeartsView(r.room, nightId), counted: r.counted } };
      }
      if (body && "playing" in body) {
        const p = body.playing as Record<string, unknown> | null;
        const songId = p ? cleanRoomId(p.songId) : null;
        const nightId = p ? cleanRoomId(p.nightId) : null;
        room = setRoomPlaying(
          room,
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
        this.rooms.set(code, room);
        return { status: 200, body: roomHeartsView(room, nightId) };
      }
      return { status: 400, body: { error: "Nothing to change." } };
    }
    if (method === "GET") {
      const user = cleanRoomUser(u.searchParams.get("user"));
      if (user) room = this.touch(room, user);
      const since = Number(u.searchParams.get("since") ?? 0) || 0;
      if (since && since === room.rev && u.searchParams.get("log") !== "all")
        return {
          status: 200,
          body: { code, rev: room.rev, unchanged: true, presence: roomPresence(room, Date.now()) },
        };
      return {
        status: 200,
        body: this.view(room, {
          since,
          all: u.searchParams.get("log") === "all",
          resolve: ["1", "true"].includes(u.searchParams.get("resolve") ?? ""),
        }),
      };
    }
    if (method === "DELETE") return { status: 403, body: { error: "Not in a capture." } };
    const user = cleanRoomUser(body?.user);
    if (!user) return { status: 400, body: { error: "Choose a name first." } };
    const ops = cleanRoomOps(body?.ops, parseNightFile);
    if (!ops) return { status: 400, body: { error: "Nothing to change." } };
    const next = applyRoomOps(room, ops, user, new Date().toISOString()).room;
    this.rooms.set(code, next);
    const since = Number(body?.since ?? 0) || 0;
    return { status: 200, body: this.view(next, { since, resolve: body?.resolve === true }) };
  }

  /** answers the context's linked-server requests (the mock's apiBase) */
  async attach(ctx: BrowserContext) {
    await ctx.route(`${LINKED.apiBase}/**`, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      let body: Record<string, unknown> | null = null;
      try {
        body = req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : null;
      } catch {}
      let r: Res;
      try {
        r = this.handle(req.url(), req.method(), body);
      } catch (e) {
        r = { status: 500, body: { error: (e as Error).message } };
      }
      await route.fulfill({
        status: r.status,
        contentType: "application/json",
        headers: { "cache-control": "no-store", ...CORS },
        body: JSON.stringify(r.body),
      });
    });
  }
}
