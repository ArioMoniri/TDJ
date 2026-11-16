"use client";
import { useBooth } from "./booth/store";
import { nightIdOf } from "./favourites";
import { openFloorScreen, startFloorBroadcast } from "./floorBus";
import { t } from "./i18n";
import { roomClient } from "./rooms";
import { toast } from "./toast";

/**
 * 2026-11 — the Booth page's side of the dancers' Floor screen: its state on the BroadcastChannel (a window this
 * browser opened) and, while the DJ is in a room, with the room's playing song (any device with the room's code).
 */
export function startBoothFloor(): () => void {
  return startFloorBroadcast(useBooth as unknown as Parameters<typeof startFloorBroadcast>[0], {
    room: () => {
      const c = roomClient();
      return c ? { server: c.server, code: c.code, user: c.user } : null;
    },
    nightId: () => {
      const p = useBooth.getState().playlist;
      return p ? nightIdOf(p) : null;
    },
  });
}

/**
 * More → Floor screen: the window on the second display (or one to drag there), and — in a room — the link other
 * devices open (copied), said in one toast. iPhone and iPad: AirPlay mirroring, or the room's link on another device.
 */
export async function showFloorScreen(): Promise<void> {
  const link = floorRoomLink();
  if (link) void navigator.clipboard?.writeText(link).catch(() => {});
  const how = await openFloorScreen("/screen");
  const tail = link ? ` ${t("floor.room_link_copied")}` : ` ${t("floor.room_hint")}`;
  if (how === "placed") toast(t("floor.opened_placed") + tail);
  else if (how === "window" || how === "focused") toast(t("floor.opened_window") + tail);
  else if (how === "blocked") toast(t("floor.blocked") + tail);
  else toast(how + tail);
}

/** the room's Floor screen link for other devices (a TV, a phone): null outside a room */
export function floorRoomLink(
  origin = typeof location !== "undefined" ? location.origin : "",
): string | null {
  const c = roomClient();
  if (!c) return null;
  const server = c.server.replace(/\/+$/, "");
  const q = new URLSearchParams({ room: c.code });
  if (server && server !== origin) q.set("server", server);
  return `${server || origin}/screen?${q}`;
}
