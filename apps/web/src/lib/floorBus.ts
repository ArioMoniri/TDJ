"use client";
import { cleanFloor, type FloorState, floorOf } from "./floor";

/**
 * 2026-11 — how the dancers' Floor screen follows the Booth, never controlling it:
 * - the same browser (a window the Booth opened on the projector): a BroadcastChannel, the state at once on every
 *   change and once a second (the viewer carries the position between);
 * - any other device (a TV, a phone): the room's code — the Booth says the state with the playing song
 *   (`/api/rooms/<code>/hearts`), the screen reads it every second.
 * The Booth's side runs on its page (startFloorBroadcast); the screen's side is `watchFloor`.
 */
export const FLOOR_CHANNEL = "tdj-floor";

type BoothLike = {
  getState: () => Parameters<typeof floorOf>[0] & {
    positionOf?: (id: string) => { sec: number; where: string } | null;
  };
  subscribe: (f: (s: unknown, p: unknown) => void) => () => void;
};
type RoomLike = { server: string; code: string; user: string };

const sameShape = (a: FloorState | null, b: FloorState) =>
  !!a &&
  a.kind === b.kind &&
  a.k === b.k &&
  a.tanda === b.tanda &&
  a.title === b.title &&
  a.playing === b.playing &&
  Math.abs(a.positionSec + (b.at - a.at) / 1000 - b.positionSec) < (b.playing ? 1.5 : 0.25);

/**
 * The Booth's side: publish its Floor state. `room()` gives the room the DJ is in (null: none) and `nightId` the
 * night's id the hearts are kept under. Returns its stop.
 */
export function startFloorBroadcast(
  booth: BoothLike,
  o: { room?: () => RoomLike | null; nightId?: () => string | null; fetch?: typeof fetch } = {},
): () => void {
  const ch = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(FLOOR_CHANNEL) : null;
  let last: FloorState | null = null;
  let lastRoom = 0;
  let lastSong: { songId: string; title: string; artist: string } | null = null;
  const f = o.fetch ?? ((u, i) => fetch(u, i));
  const room = async (s: FloorState, force: boolean) => {
    const r = o.room?.();
    const night = o.nightId?.();
    if (!r || !night) return;
    if (!force && Date.now() - lastRoom < 5000) return;
    if (s.kind === "song" && s.songId) lastSong = { songId: s.songId, title: s.title, artist: s.orchestra };
    const song = lastSong ?? (s.songId ? { songId: s.songId, title: s.title, artist: s.orchestra } : null);
    if (!song) return;
    lastRoom = Date.now();
    try {
      await f(`${r.server.replace(/\/+$/, "")}/api/rooms/${r.code}/hearts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: r.user, playing: { ...song, nightId: night, screen: s } }),
      });
    } catch {}
  };
  const say = (force = false) => {
    const st = booth.getState();
    const s = floorOf(st);
    // the recording's second of the item's start (cue in, cut head): the screen's lyrics and video line up
    const rec = s.songId ? st.positionOf?.(s.songId) : null;
    if (rec?.where === "room") s.srcStartSec = Math.max(0, Math.round((rec.sec - s.positionSec) * 100) / 100);
    const changed = !sameShape(last, s);
    if (!force && !changed) return;
    last = s;
    ch?.postMessage({ type: "floor", state: s });
    void room(s, changed);
  };
  const unsub = booth.subscribe(() => say());
  const beat = setInterval(() => say(true), 1000);
  if (ch)
    ch.onmessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "hello") say(true);
    };
  say(true);
  return () => {
    unsub();
    clearInterval(beat);
    ch?.close();
  };
}

/** the screen's side: the Booth's state as it comes (this browser, else the room every second); returns its stop */
export function watchFloor(
  on: (s: FloorState | null) => void,
  o: { room?: { server: string; code: string } | null; fetch?: typeof fetch; everyMs?: number } = {},
): () => void {
  const stops: Array<() => void> = [];
  if (o.room) {
    const f = o.fetch ?? ((u, i) => fetch(u, i));
    const url = `${o.room.server.replace(/\/+$/, "")}/api/rooms/${o.room.code}/hearts`;
    let live = true;
    const poll = async () => {
      try {
        const r = await f(url, { cache: "no-store" });
        const j = (await r.json()) as { screen?: unknown };
        if (live) on(cleanFloor(j.screen));
      } catch {}
    };
    void poll();
    const t = setInterval(poll, o.everyMs ?? 1000);
    stops.push(() => {
      live = false;
      clearInterval(t);
    });
  } else if (typeof BroadcastChannel !== "undefined") {
    const ch = new BroadcastChannel(FLOOR_CHANNEL);
    ch.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; state?: unknown };
      if (d?.type === "floor") on(cleanFloor(d.state));
    };
    ch.postMessage({ type: "hello" });
    stops.push(() => ch.close());
  }
  return () => {
    for (const s of stops) s();
  };
}

/**
 * "Floor screen" from the Booth: a window on the second display, full screen, where the browser can place it (the
 * Window Management API: Chrome asks the DJ once), else a window to drag to the projector. Resolves to how it went.
 */
export async function openFloorScreen(href = "/screen"): Promise<"placed" | "window" | "blocked" | string> {
  // the Mac app: its own window on the external monitor, the Booth's window staying primary (commands.rs)
  if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    const { invoke } = await import("./app/native");
    try {
      return await invoke<string>("floor_window", { path: href });
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  type Screen = { left: number; top: number; availWidth: number; availHeight: number; isPrimary?: boolean };
  const w = window as unknown as {
    getScreenDetails?: () => Promise<{ screens: Screen[]; currentScreen: Screen }>;
  };
  let target: Screen | null = null;
  if (w.getScreenDetails && (window.screen as unknown as { isExtended?: boolean }).isExtended) {
    try {
      const d = await w.getScreenDetails();
      target =
        d.screens.find((s) => s !== d.currentScreen && !s.isPrimary) ??
        d.screens.find((s) => s !== d.currentScreen) ??
        null;
    } catch {}
  }
  const feats = target
    ? `popup,left=${target.left},top=${target.top},width=${target.availWidth},height=${target.availHeight}`
    : "popup,width=1280,height=720";
  const win = window.open(href, "tdj-floor-screen", feats);
  if (!win) return "blocked";
  return target ? "placed" : "window";
}
