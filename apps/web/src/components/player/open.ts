"use client";
/**
 * 2026-11 - the one player's way into the Booth's Now playing, through what the Booth already has (no new state
 * there): its `useNowView` store, loaded on demand, so the pages carry none of the Booth's code. (The room's output
 * picker opens where the player is: BoothMini -> PlayerToolbar's RoomOutputSheet.)
 */
export function openNowPlaying(push: (href: string) => void) {
  void import("../booth/NowPlayingView").then((m) => m.useNowView.getState().set(true)).catch(() => {});
  if (!location.pathname.startsWith("/booth")) push("/booth");
}
