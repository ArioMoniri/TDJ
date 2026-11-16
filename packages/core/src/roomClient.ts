import type { MissingItem, NightFile } from "./night";
import { normalizeRoomCode, type RoomLogEntry, type RoomOp } from "./room";
import type { Playlist } from "./types";

/**
 * The room client: one module the web app and the Mac / iPad apps share. A room lives on the server of whoever made
 * it; the apps reach that server only through a room link the DJ opens (opt-in, the one case where a standalone
 * app talks to a server). No accounts: a username and the room code are the identity. Plain `fetch`, no cookies.
 *
 *   GET  <server>/api/rooms                 → { available, shortLinks }
 *   POST <server>/api/rooms                 { user, name, night? } → RoomView
 *   GET  <server>/api/rooms/<code>?since=&user=&resolve=1&log=all → RoomView | { unchanged: true }
 *   POST <server>/api/rooms/<code>          { user, ops, since, resolve? } → RoomView
 */
export interface RoomView {
  code: string;
  name: string;
  createdAt: string;
  createdBy: string;
  rev: number;
  slots: string[];
  night: NightFile | null;
  /** entries after `since` (all of them with `log=all`) */
  log: RoomLogEntry[];
  /** who is in the room now */
  presence: string[];
  /** the night resolved against the server's catalogue (with `resolve`) */
  playlist?: Playlist | null;
  missing?: MissingItem[];
}
export interface RoomUnchanged {
  code: string;
  rev: number;
  unchanged: true;
  presence: string[];
}
export interface RoomsInfo {
  /** the server keeps rooms */
  available: boolean;
  /** the server keeps short share links */
  shortLinks: boolean;
}

export class RoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const trimServer = (s: string) => s.replace(/\/+$/, "");

async function call<T>(f: Fetch, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await f(url, {
      ...init,
      headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    throw new RoomError("The room's server cannot be reached.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new RoomError(body.error || "The room's server refused the request.", res.status);
  return body;
}

export class RoomClient {
  readonly server: string;
  readonly code: string;
  readonly user: string;
  private readonly f: Fetch;
  /** `server`: an origin (`https://tdj.example`) or "" for the page's own origin */
  constructor(o: { server: string; code: string; user: string; fetch?: Fetch }) {
    const code = normalizeRoomCode(o.code);
    if (!code) throw new RoomError("That room code is not valid.", 400);
    this.server = trimServer(o.server);
    this.code = code;
    this.user = o.user;
    this.f = o.fetch ?? ((i, n) => fetch(i, n));
  }
  private url(q?: Record<string, string | number | boolean | undefined>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q ?? {}))
      if (v !== undefined && v !== false) p.set(k, v === true ? "1" : String(v));
    const s = p.toString();
    return `${this.server}/api/rooms/${this.code}${s ? `?${s}` : ""}`;
  }
  static info(server: string, f: Fetch = (i, n) => fetch(i, n)): Promise<RoomsInfo> {
    return call<RoomsInfo>(f, `${trimServer(server)}/api/rooms`);
  }
  static async create(o: {
    server: string;
    user: string;
    name: string;
    night?: NightFile | null;
    fetch?: Fetch;
  }): Promise<{ client: RoomClient; view: RoomView }> {
    const f = o.fetch ?? ((i, n) => fetch(i, n));
    const view = await call<RoomView>(f, `${trimServer(o.server)}/api/rooms`, {
      method: "POST",
      body: JSON.stringify({ user: o.user, name: o.name, night: o.night ?? null }),
    });
    return { client: new RoomClient({ server: o.server, code: view.code, user: o.user, fetch: f }), view };
  }
  /** The room after revision `since` (unchanged when nothing happened since). */
  get(o: { since?: number; resolve?: boolean; log?: "all" } = {}): Promise<RoomView | RoomUnchanged> {
    return call(this.f, this.url({ since: o.since ?? 0, user: this.user, resolve: o.resolve, log: o.log }));
  }
  /** Sends edits; the answer is the merged room (entries after `since`). */
  send(ops: RoomOp[], o: { since?: number; resolve?: boolean } = {}): Promise<RoomView> {
    return call(this.f, this.url(), {
      method: "POST",
      body: JSON.stringify({ user: this.user, ops, since: o.since ?? 0, resolve: !!o.resolve }),
    });
  }
  join(): Promise<RoomView> {
    return this.send([{ type: "join" }], { since: 0 });
  }
  rename(name: string, base: number): Promise<RoomView> {
    return this.send([{ type: "rename", name, base }], { since: base });
  }
  /**
   * 2026-11: the room's owner closes it — the night, the log and the dancer hearts are deleted for everyone (a
   * RoomError 403 for any other DJ; the room then answers 410 "closed by its owner" for a while).
   */
  close(): Promise<{ closed: true; code: string }> {
    return call(this.f, this.url(), { method: "DELETE", body: JSON.stringify({ user: this.user }) });
  }
  /** 2026-11: the owner puts another night in the room (every DJ in it gets it, the log says so) */
  switchNight(night: NightFile, base: number): Promise<RoomView> {
    return this.send([{ type: "night", night, base }], { since: base, resolve: true });
  }
  /**
   * 2026-11, dancer hearts: `GET/POST <server>/api/rooms/<code>/hearts`. The booth says what is playing; a dancer
   * hearts it with their device's anonymous token; the DJ reads the night's counts.
   */
  static hearts(
    server: string,
    code: string,
    nightId?: string,
    f: Fetch = (i, n) => fetch(i, n),
  ): Promise<RoomHearts> {
    const q = nightId ? `?night=${encodeURIComponent(nightId)}` : "";
    return call<RoomHearts>(f, `${trimServer(server)}/api/rooms/${code}/hearts${q}`);
  }
  static heart(
    server: string,
    code: string,
    h: { nightId: string; songId: string; dancer: string },
    f: Fetch = (i, n) => fetch(i, n),
  ): Promise<{ counted: boolean; count: number }> {
    return call(f, `${trimServer(server)}/api/rooms/${code}/hearts`, {
      method: "POST",
      body: JSON.stringify({ heart: h }),
    });
  }
  hearts(nightId: string): Promise<RoomHearts> {
    return RoomClient.hearts(this.server, this.code, nightId, this.f);
  }
  playing(p: { songId: string; nightId: string; title: string; artist: string } | null): Promise<RoomHearts> {
    return call(this.f, `${this.server}/api/rooms/${this.code}/hearts`, {
      method: "POST",
      body: JSON.stringify({ user: this.user, playing: p }),
    });
  }
}

/** a room's playing song and the night's heart counts (no dancer is ever named) */
export interface RoomHearts {
  playing: { songId: string; nightId: string; title: string; artist: string } | null;
  hearts: Record<string, number>;
}

export const isUnchanged = (v: RoomView | RoomUnchanged): v is RoomUnchanged =>
  (v as RoomUnchanged).unchanged === true;

/** `https://host/rooms?join=ABC234`: opens the room on the server that holds it. */
export function roomLink(server: string, code: string): string {
  return `${trimServer(server)}/rooms?join=${code}`;
}
/** `tdj://room?server=https%3A%2F%2Fhost&code=ABC234`: the same room in the Mac and iPad apps. */
export function appRoomLink(server: string, code: string): string {
  return `tdj://room?server=${encodeURIComponent(trimServer(server))}&code=${code}`;
}
/** The server and code a room link (web or app) carries; null when it is not one. */
export function parseRoomLink(link: string): { server: string; code: string } | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol === "tdj:") {
    const code = normalizeRoomCode(u.searchParams.get("code"));
    const server = u.searchParams.get("server") ?? "";
    if (!code || !/^https?:\/\/[^/\s]+$/i.test(trimServer(server))) return null;
    return { server: trimServer(server), code };
  }
  if ((u.protocol === "https:" || u.protocol === "http:") && u.pathname.replace(/\/$/, "") === "/rooms") {
    const code = normalizeRoomCode(u.searchParams.get("join"));
    return code ? { server: u.origin, code } : null;
  }
  return null;
}
