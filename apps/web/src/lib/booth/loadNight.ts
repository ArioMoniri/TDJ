"use client";
import { create } from "zustand";
import { recordEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { useBooth } from "./store";

/**
 * 2026-11 (the owner: "there should be a clear or reset button for the Booth, to add another playlist to play — from
 * Compose, or import from a list, Spotify, text or connectors"): the Booth loads another night or clears itself.
 *
 * - The Booth plays the app's current night (Compose's). Loading another (History, a featured night, an import) makes
 *   it the current night — as History's "Play in the Booth" always did — and the Booth boots on it: ready, its plan,
 *   cortinas and La Cumparsita worked out, nothing playing.
 * - Mid-night it asks first: now (the night ends — its log goes to History — and the new one loads), or after the
 *   current song (the same, once the room's song has played out).
 * - Clearing unloads the Booth only (Compose keeps its night): the Booth shows "No night loaded" and its ways to load
 *   one. Mid-night the music stops first (the sheet asks, like Stop). Undo (the toast, ⌘Z) loads it back.
 */
interface LoadState {
  /** the Booth shows no night (Compose keeps its own) */
  cleared: boolean;
  /** a night waiting for the room's song to end */
  pending: Playlist | null;
  /** one more on every load: the Booth boots again even when the night loaded is the one it had */
  seq: number;
}
export const useBoothLoad = create<LoadState>(() => ({ cleared: false, pending: null, seq: 0 }));

/** a night as the Booth takes it: every tanda unlocked (the Booth locks what has played) */
const fresh = (p: Playlist): Playlist => ({ ...p, tandas: p.tandas.map((x) => ({ ...x, locked: false })) });

/** is a night playing in the room (a load must ask first) */
export function nightLive(): boolean {
  const b = useBooth.getState();
  return b.started && b.state !== "stopped" && b.state !== "idle";
}

/** load `p` into the Booth now (ends a running night first: its log goes to History) */
export async function loadNight(p: Playlist, o: { historyId?: string | null } = {}): Promise<void> {
  if (nightLive()) await useBooth.getState().endNight();
  const st = useStore.getState();
  if (o.historyId !== undefined) st.setCurrentEntry(o.historyId);
  st.setPlaylist(fresh(p));
  useBoothLoad.setState((x) => ({ cleared: false, pending: null, seq: x.seq + 1 }));
  toast(t("booth.load.loaded", { name: p.name || t("booth.load.untitled") }));
}

let unsub: (() => void) | null = null;
/** load `p` once the room's song has played out (the next item starts, or the night stops) */
export function loadAfterThisSong(p: Playlist): void {
  unsub?.();
  const b0 = useBooth.getState();
  const at = b0.planIndex;
  useBoothLoad.setState({ pending: p });
  toast(t("booth.load.after_song", { name: p.name || t("booth.load.untitled") }));
  unsub = useBooth.subscribe((s) => {
    if (s.planIndex === at && s.state !== "stopped") return;
    unsub?.();
    unsub = null;
    const next = useBoothLoad.getState().pending;
    if (next) void loadNight(next);
  });
}
/** a waiting load taken back */
export function cancelPendingLoad(): void {
  unsub?.();
  unsub = null;
  useBoothLoad.setState({ pending: null });
}

/** unload the Booth (stop the music first: `stop` when a night plays); Undo loads it back */
export async function clearBooth(o: { fade?: boolean } = {}): Promise<void> {
  cancelPendingLoad();
  const b = useBooth.getState();
  if (nightLive()) {
    if (o.fade) {
      const sec = b.settings.stopFadeSec;
      b.stop(sec);
      await new Promise((r) => setTimeout(r, sec * 1000 + 200));
    }
    await useBooth.getState().endNight();
  }
  useBoothLoad.setState({ cleared: true });
  const restore = () => useBoothLoad.setState({ cleared: false });
  recordEdit({
    label: t("booth.load.cleared_label"),
    scope: "/booth",
    undo: restore,
    redo: () => useBoothLoad.setState({ cleared: true }),
  });
  toast(t("booth.load.cleared"), restore);
}
