"use client";
import { t } from "@/lib/i18n";
import { FEATURED, loadFeatured } from "./featured";
import { useStore } from "./store";
import { toast } from "./toast";
import type { Playlist } from "./types";

/**
 * A browser keeps the night it last had open (localStorage). When that night is the featured night in an older
 * version — the same night id, or most of its sides — a correction shipped since (the DJ's edits, Turkey streams,
 * the Cumparsitas) never reached the Composer, the player or the exports. On load the open night follows the
 * shipped version, with Undo back to the copy the browser had.
 */
const sides = (p: Pick<Playlist, "tandas">) => p.tandas.flatMap((x) => x.songs.map((s) => s.id));
const signature = (p: Playlist) =>
  JSON.stringify([
    sides(p),
    p.tandas.map((x) => x.cortina?.id ?? null),
    p.opening?.id ?? null,
    p.closing?.id ?? null,
    p.tandas.map((x) => x.songs.map((s) => s.spotify?.uri ?? null)),
  ]);

/** the open night is an older copy of the shipped one: its id, or ≥ 60 % of its sides */
export function isOlderCopy(local: Playlist, shipped: Playlist): boolean {
  if (signature(local) === signature(shipped)) return false;
  if (local.id === shipped.id) return true;
  const a = new Set(sides(shipped));
  const b = sides(local);
  if (!a.size || !b.length) return false;
  const shared = b.filter((id) => a.has(id)).length;
  return shared / Math.max(a.size, b.length) >= 0.6;
}

let ran = false;
export async function syncFeaturedNight() {
  if (ran || typeof window === "undefined") return;
  ran = true;
  const local = useStore.getState().playlist;
  if (!local) return;
  for (const f of FEATURED) {
    const shipped = await loadFeatured(f.id).catch(() => null);
    if (!shipped || !isOlderCopy(local, shipped)) continue;
    const before = local;
    useStore.getState().setPlaylist(shipped);
    toast(t("featuredSync.updated"), () => useStore.getState().setPlaylist(before));
    return;
  }
}
