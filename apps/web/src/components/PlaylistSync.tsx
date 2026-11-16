"use client";
import { useEffect } from "react";
import { whenIdle } from "@/lib/hooks";

/**
 * 2026-11: mounted once in the layout — the night's exported playlists follow it from every page
 * (lib/playlistSyncRun.ts). The sync's code loads when the page is idle, never in the first bundle.
 */
export function PlaylistSync() {
  useEffect(
    () =>
      whenIdle(() => {
        void import("@/lib/playlistSyncRun").then((m) => m.installPlaylistSync());
      }, 3000),
    [],
  );
  return null;
}
