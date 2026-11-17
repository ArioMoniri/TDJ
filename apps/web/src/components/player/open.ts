"use client";
/**
 * 2026-11 — the one player's ways into the Booth, through what the Booth already has (no new state there): Now
 * playing is its `useNowView` store (loaded on demand, so the pages carry none of the Booth's code), the room's
 * output is its toolbar's picker (`tdj:booth-open-room`, lib/booth/sources/spotify.ts OPEN_ROOM_EVENT).
 */
const OPEN_ROOM_EVENT = "tdj:booth-open-room";

export function openNowPlaying(push: (href: string) => void) {
  void import("../booth/NowPlayingView").then((m) => m.useNowView.getState().set(true)).catch(() => {});
  if (!location.pathname.startsWith("/booth")) push("/booth");
}

export function openRoomOutput(push: (href: string) => void) {
  if (!location.pathname.startsWith("/booth")) push("/booth");
  // the picker listens once the Booth's toolbar is on the page
  const until = Date.now() + 8000;
  const tick = () => {
    if (document.querySelector('[data-testid="booth-toolbar"]')) {
      window.dispatchEvent(new Event(OPEN_ROOM_EVENT));
      return;
    }
    if (Date.now() < until) setTimeout(tick, 150);
  };
  setTimeout(tick, 150);
}
