"use client";
import { recordEdit, undoEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { endLiveNight, loadIntoBooth, restoreBooth, setBoothHandle, takeBooth } from "@/lib/nightActions";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { bootBooth, useBoothLoad } from "./loadState";
import { useBooth } from "./store";

export { useBoothLoad } from "./loadState";

/**
 * 2026-11 (the owner: "there should be a clear or reset button for the Booth, to add another playlist to play — from
 * Compose, or import from a list, Spotify, text or connectors"; then "you can't reset or close the night or import
 * other nights"): the Booth loads another night, clears itself, closes the night or resets it.
 *
 * - The Booth plays the app's current night (Compose's). Loading another (History, a featured night, an import) makes
 *   it the current night — as History's "Play in the Booth" always did — and the Booth boots on it: ready, its plan,
 *   cortinas and La Cumparsita worked out, nothing playing.
 * - Mid-night it asks first: now (the night ends — its log goes to History — and the new one loads), or after the
 *   current song (the same, once the room's song has played out).
 * - Clearing unloads the Booth only (Compose keeps its night): the Booth shows "No night loaded" and its ways to load
 *   one. Mid-night the music stops first (the sheet asks, like Stop) and the night's log goes to History ("Close the
 *   night"). Undo (the toast, ⌘Z) loads it back, the playhead where it was, nothing playing.
 * - Reset: the same night from its start (mid-night it asks first); Undo puts the playhead back.
 */

// the Booth's own store, for the shared night actions (lib/nightActions.ts)
setBoothHandle(useBooth as never);

/** is a night playing in the room (a load must ask first) */
export function nightLive(): boolean {
  const b = useBooth.getState();
  return b.started && b.state !== "stopped" && b.state !== "idle";
}

/** load `p` into the Booth now (ends a running night first: its log goes to History) */
export async function loadNight(p: Playlist, o: { historyId?: string | null } = {}): Promise<void> {
  await loadIntoBooth(p, o);
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

/** stop the music (faded when asked) and end the night, if one plays */
async function stopFirst(fade?: boolean) {
  if (!nightLive()) return;
  if (fade) {
    const b = useBooth.getState();
    const sec = b.settings.stopFadeSec;
    b.stop(sec);
    await new Promise((r) => setTimeout(r, sec * 1000 + 200));
  }
  await endLiveNight();
}

/** unload the Booth (stop the music first: `stop` when a night plays); Undo loads it back */
export async function clearBooth(o: { fade?: boolean } = {}): Promise<void> {
  cancelPendingLoad();
  const before = takeBooth();
  await stopFirst(o.fade);
  useBoothLoad.setState({ cleared: true });
  const label = before.live ? t("nights.closed") : t("booth.load.cleared_label");
  const id = recordEdit({
    label,
    scope: "/booth",
    undo: () => restoreBooth({ ...before, cleared: false }),
    redo: () => useBoothLoad.setState({ cleared: true }),
  });
  toast(before.live ? t("nights.closed") : t("booth.load.cleared"), () => void undoEdit({ id }));
}

/** the same night again from its start, nothing playing (the night that played ends first); Undo goes back */
export async function resetBooth(o: { fade?: boolean } = {}): Promise<void> {
  cancelPendingLoad();
  const before = takeBooth();
  await stopFirst(o.fade);
  bootBooth({ resumeAt: 0 });
  const label = t("nights.reset_done");
  const id = recordEdit({
    label,
    scope: "/booth",
    undo: () => restoreBooth({ ...before, cleared: false }),
    redo: () => bootBooth({ resumeAt: 0 }),
  });
  toast(label, () => void undoEdit({ id }));
}
