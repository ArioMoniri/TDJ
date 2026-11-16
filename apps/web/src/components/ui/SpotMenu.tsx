"use client";
import { BetweenHorizontalEnd, BetweenHorizontalStart, ListPlus, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { type ApplyNight, openInsert, removeSongAt, removeTandaAt } from "@/lib/spot";
import type { Playlist } from "@/lib/types";
import { I } from "../Icons";
import { Menu } from "../Menu";

/**
 * 2026-11 — a tanda's insert / remove menu for the screens that list tandas without a full card (Rooms): Add song here,
 * Insert tanda before / after, Remove a song, Remove tanda — the same Insert sheet and removals as Compose (lib/spot.ts).
 */
export function SpotMenu({
  playlist,
  i,
  apply,
  disabled,
}: {
  playlist: Playlist;
  i: number;
  apply: ApplyNight;
  disabled?: boolean;
}) {
  const tanda = playlist.tandas[i];
  if (!tanda) return null;
  const locked = !!tanda.locked || disabled;
  return (
    <Menu
      label={t("spot.menu", { n: i + 1 })}
      className="icon-btn-bare h-11 w-11"
      icon={<I name="more" size={18} strokeWidth={2} />}
      items={[
        !locked && {
          label: t("spot.add_song_here"),
          icon: ListPlus,
          onClick: () =>
            openInsert({ spot: { kind: "song", tanda: i, at: tanda.songs.length }, playlist, apply }),
        },
        {
          label: t("spot.insert_tanda_before"),
          icon: BetweenHorizontalStart,
          onClick: () => openInsert({ spot: { kind: "tanda", at: i }, playlist, apply }),
          disabled,
        },
        {
          label: t("spot.insert_tanda_after"),
          icon: BetweenHorizontalEnd,
          onClick: () => openInsert({ spot: { kind: "tanda", at: i + 1 }, playlist, apply }),
          disabled,
        },
        ...(!locked
          ? tanda.songs.map((s, k) => ({
              label: t("booth.setColumn.remove_song", { title: s.title }),
              icon: Trash2,
              destructive: true,
              onClick: () => void removeSongAt(playlist, i, k, apply),
            }))
          : []),
        !locked && {
          label: t("spot.remove_tanda"),
          icon: Trash2,
          destructive: true,
          onClick: () => void removeTandaAt(playlist, i, apply),
        },
      ]}
    />
  );
}
