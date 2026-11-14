"use client";
import type { Playlist } from "@tdj/core";
import { useBooth } from "@/lib/booth/store";
import { useStore } from "@/lib/store";
import { SongSearchPanel } from "./SongSearchPanel";

/**
 * Round 22 — the song search panel in the Booth: the tanda that is playing and everything before it are closed (sent
 * locked, never changed); a swap or an add ahead of the playhead lands in the running night's plan.
 */
export function BoothSongSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const playlist = useStore((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const cur = useBooth((s) => s.plan?.items[s.planIndex]);
  const apply = useBooth((s) => s.applySwappedPlaylist);
  // the plan counts tandas from 1; the panel from 0
  const running =
    !started || !cur ? undefined : cur.kind === "closing" && cur.tanda > 0 ? Infinity : cur.tanda - 1;
  const locked = (p: Playlist): Playlist =>
    running === undefined
      ? p
      : { ...p, tandas: p.tandas.map((t, i) => (i <= running ? { ...t, locked: true } : t)) };
  return (
    <SongSearchPanel
      open={open && !!playlist}
      onClose={onClose}
      playlist={playlist ? locked(playlist) : null}
      closedBefore={running}
      onChange={async (np) => {
        await apply({
          ...np,
          tandas: np.tandas.map((x, i) => ({ ...x, locked: x.pinned ? true : playlist?.tandas[i]?.locked })),
        });
      }}
    />
  );
}
