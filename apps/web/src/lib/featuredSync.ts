"use client";
import { t } from "@/lib/i18n";
import { loadNight, NIGHT_MAX_AGE_MS } from "./booth/persist";
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
// 2026-11 ("order in each tanda should be changeable in all tabs"): the songs of a tanda are compared as a set, so
// the DJ's own order inside a tanda is not taken for an older copy (and survives a reload)
const signature = (p: Playlist) =>
  JSON.stringify([
    p.tandas.map((x) => x.songs.map((s) => s.id).sort()),
    p.tandas.map((x) => x.cortina?.id ?? null),
    // 2026-11: a cortina's start (its chorus) shipped since reaches a browser's older copy too
    p.tandas.map((x) => x.cortina?.startSec ?? 0),
    p.opening?.id ?? null,
    p.closing?.id ?? null,
    p.tandas.map((x) => x.songs.map((s) => `${s.id}=${s.spotify?.uri ?? ""}`).sort()),
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
    // a night the booth is playing (or paused mid-way, or holds to resume) is never swapped under the DJ: the update
    // waits for the DJ's tap, after the night
    if (await nightInProgress(local.id)) {
      toast(t("featuredSync.available_after_night"), () => apply(local, shipped), t("featuredSync.load_now"));
      return;
    }
    apply(local, shipped);
    return;
  }
}

function apply(local: Playlist, shipped: Playlist) {
  const before = local;
  useStore.getState().setPlaylist(shipped);
  toast(t("featuredSync.updated"), () => useStore.getState().setPlaylist(before));
}

/** the booth started this night less than 12 h ago (a saved playhead; the sync runs once, at page load) */
export async function nightInProgress(playlistId: string): Promise<boolean> {
  const n = await loadNight().catch(() => undefined);
  if (
    n &&
    n.playlistId === playlistId &&
    Date.now() - n.updatedAt < NIGHT_MAX_AGE_MS &&
    (n.planIndex > 0 || n.state !== "idle")
  )
    return true;
  return false;
}
