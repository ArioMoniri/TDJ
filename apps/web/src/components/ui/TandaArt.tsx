"use client";
import { type ReactNode, useMemo } from "react";
import type { Entity } from "@/lib/artwork";
import { usePlayer } from "@/lib/player";
import { Artwork } from "./Artwork";

const LETTER: Record<string, string> = { tango: "T", vals: "V", milonga: "M" };

/**
 * 2026-11 (the owner: "images are not getting loaded here"): one look for a tanda everywhere a list shows one — the
 * cover of its first side (components/ui/Artwork.tsx: the DJ's, the shipped match, a live lookup, the orchestra's
 * placeholder) with the rhythm letter (T / V / M) on its corner. With artwork off in Show, the letter tile alone (as
 * before). Used by the sidebar's Tonight, the Compose inspector, the Rooms night, History, the shared night and the
 * tanda Swap sheet. `badge` replaces the letter (a tanda number).
 */
export function TandaArt({
  tanda,
  size = 32,
  badge,
  className = "",
  testId = "tanda-art",
}: {
  tanda: { rhythm: string; orchestra: string; songs: ReadonlyArray<Entity & { id: string }> };
  size?: number;
  badge?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const first = tanda.songs[0];
  return (
    <span
      className={`tanda-art ${className}`}
      style={{ ["--tanda-art" as string]: `${size}px` }}
      data-testid={testId}
      data-rhythm={tanda.rhythm}
    >
      {first && <Artwork entity={first} orchestra={tanda.orchestra} size={size} />}
      <span className="side-num tanda-art-letter" data-rhythm={tanda.rhythm} aria-hidden>
        {badge ?? LETTER[tanda.rhythm] ?? "·"}
      </span>
    </span>
  );
}

/** one side's cover with its rhythm letter (a search result, a suggestion): the tanda look for one song */
export function SongArt({
  song,
  size = 44,
  label,
}: {
  song: { id: string; rhythm: string; orchestra: string };
  size?: number;
  /** the rhythm in words, for assistive tech (the letter is decoration) */
  label?: string;
}) {
  return (
    <span role="img" aria-label={label ?? song.rhythm} className="inline-flex">
      <TandaArt
        tanda={{ rhythm: song.rhythm, orchestra: song.orchestra, songs: [song] }}
        size={size}
        testId="song-art"
      />
    </span>
  );
}

/**
 * the side or cortina behind the mini player's track (its list item), for its cover. (2026-11: a track with no list —
 * the Preview cortina button — built a new `{ id }` in the selector on every read, so the store's snapshot never
 * settled and React stopped the app with "Maximum update depth exceeded"; the selectors return stable values only.)
 */
export function usePlayingEntity(): Entity {
  const listed = usePlayer((s) => {
    const it = s.list?.items[s.list.index];
    if (!it || !s.track) return null;
    return it.kind === "song" ? it.song : it.cortina;
  });
  const id = usePlayer((s) => (s.track ? s.track.id.replace(/^(song|cortina):/, "") : null));
  return useMemo(() => listed ?? (id ? { id } : null), [listed, id]);
}
