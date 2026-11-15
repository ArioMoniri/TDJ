"use client";
import type { Playlist } from "@tdj/core";
import { Search } from "lucide-react";
import { useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { SongSearchPanel } from "./SongSearchPanel";
import { Tip } from "./Tip";

/**
 * Round 22 — the song search panel in the Booth, self-contained (its own "Find songs" button and state, so the Booth
 * page only mounts it): the tanda that is playing and everything before it are closed (sent locked, never changed);
 * a swap or an add ahead of the playhead lands in the running night's plan.
 */
export function BoothSongSearch() {
  const [open, setOpen] = useState(false);
  const playlist = useStore((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const cur = useBooth((s) => s.plan?.items[s.planIndex]);
  const apply = useBooth((s) => s.applySwappedPlaylist);
  if (!playlist) return null;
  // the plan counts tandas from 1; the panel from 0
  const running =
    !started || !cur ? undefined : cur.kind === "closing" && cur.tanda > 0 ? Infinity : cur.tanda - 1;
  const locked = (p: Playlist): Playlist =>
    running === undefined
      ? p
      : { ...p, tandas: p.tandas.map((t, i) => (i <= running ? { ...t, locked: true } : t)) };
  return (
    <>
      <div className="mt-3 flex justify-end">
        <Tip text={tx("boothSongSearch.search_every_recording_swap_one_in")}>
          <button
            type="button"
            className="btn-plain min-h-11"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            data-testid="booth-find-songs"
          >
            <Search size={16} strokeWidth={2} aria-hidden /> {tx("boothSongSearch.find_songs")}
          </button>
        </Tip>
      </div>
      <SongSearchPanel
        open={open}
        onClose={() => setOpen(false)}
        playlist={locked(playlist)}
        closedBefore={running}
        onChange={async (np) => {
          await apply({
            ...np,
            tandas: np.tandas.map((x, i) => ({ ...x, locked: x.pinned ? true : playlist.tandas[i]?.locked })),
          });
        }}
      />
    </>
  );
}
