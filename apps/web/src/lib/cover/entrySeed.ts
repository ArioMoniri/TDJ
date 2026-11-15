"use client";
import { useStore } from "@/lib/store";
import type { HistorySnapshot } from "@/lib/types";
import { coverSeedOf, isSeed } from "./seed";

/**
 * Wave 4 — the cover seed of a night on screen: the seed of the History entry that holds it (so the Spotify cover,
 * the Share preview and the History thumbnail are one image, an edited version included), else the night's own
 * generation id.
 */
export function coverSeedFor(p: unknown): string {
  const own = coverSeedOf(p);
  const id = p && typeof p === "object" ? (p as { id?: unknown }).id : undefined;
  try {
    const st = useStore.getState();
    const keep = (h: HistorySnapshot | undefined) => (h && isSeed(h.coverSeed) ? h.coverSeed : null);
    const byId = typeof id === "string" ? st.history.find((h) => h.playlist.id === id) : undefined;
    const current =
      st.currentEntry && st.playlist && (st.playlist === p || st.playlist.id === id)
        ? st.history.find((h) => h.id === st.currentEntry)
        : undefined;
    const byVersion =
      typeof id === "string"
        ? st.history.find((h) => h.versions?.some((v) => v.playlist.id === id))
        : undefined;
    return keep(byId) ?? keep(current) ?? keep(byVersion) ?? own;
  } catch {
    return own;
  }
}

/** the night with its cover seed stamped on (what every cover of it is drawn from) */
export const withCoverSeed = <T extends object>(p: T): T & { coverSeed: string } => ({
  ...p,
  coverSeed: coverSeedFor(p),
});
