"use client";
import type { Song, SongSearchHit } from "@tdj/core";
import { Headphones, Play } from "lucide-react";
import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { boothNightRunning, PlayListContext, tapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { LibraryRow } from "../library/LibraryRow";

export const asHit = (song: Song): SongSearchHit => ({ song, score: 0, highlights: {}, popularity: 0 });

/**
 * A list of sides that play (the app's player; in a running Booth, the headphones), each with its rhythm badge,
 * voice, year and length, the ⓘ song details and "+ Add to tonight"; "Play all" (or "Pre-listen all") steps through
 * the list in the mini player. Shared by the DNA pages and the Database's orchestra sheet.
 */
export function SidesList({
  songs,
  label,
  testId = "sides-list",
  max,
}: {
  songs: readonly Song[];
  /** the list's name in the mini player */
  label: string;
  testId?: string;
  max?: number;
}) {
  const items = useMemo<PlayItem[]>(
    () => songs.map((song) => ({ kind: "song", song, where: label })),
    [songs, label],
  );
  const list = useMemo(() => ({ label, items }), [label, items]);
  const headphones = boothNightRunning();
  const shown = max ? songs.slice(0, max) : songs;
  if (!songs.length) return null;
  return (
    <PlayListContext.Provider value={list}>
      <div className="group-inset" data-testid={testId}>
        {/* (QA fix 2026-11: "Play all 1" for one side: its row plays it) */}
        {songs.length > 1 && (
          <button
            type="button"
            className="cell cell-tap w-full text-left text-[var(--tint)]"
            data-testid={`${testId}-play-all`}
            onClick={() => void tapPlay(items[0]!, list)}
          >
            {headphones ? (
              <Headphones size={16} strokeWidth={2} aria-hidden />
            ) : (
              <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              {headphones
                ? t("song.prelisten_all", { n: songs.length })
                : t("song.play_all", { n: songs.length })}
            </span>
          </button>
        )}
        {shown.map((s, i) => (
          <LibraryRow key={s.id} hit={asHit(s)} id={`${testId}-${i}`} active={false} />
        ))}
        {max && songs.length > max && (
          <div className="cell text-footnote text-[var(--label-2)]">
            {t("song.more_sides", { n: songs.length - max })}
          </div>
        )}
      </div>
    </PlayListContext.Provider>
  );
}
