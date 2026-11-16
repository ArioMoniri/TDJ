"use client";
import type { ReactNode } from "react";
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

/** the side or cortina behind the mini player's track (its list item), for its cover */
export function usePlayingEntity(): Entity {
  return usePlayer((s) => {
    const it = s.list?.items[s.list.index];
    if (it && s.track) {
      const e = it.kind === "song" ? it.song : it.cortina;
      return e;
    }
    return s.track ? { id: s.track.id.replace(/^(song|cortina):/, "") } : null;
  });
}
