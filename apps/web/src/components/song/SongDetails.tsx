"use client";
import type { Song } from "@tdj/core";
import { useState } from "react";
import { firstSungSec, type Lyrics } from "@/lib/lyrics";
import { LyricsGroup } from "./LyricsGroup";
import { MarksGroup, type PositionFn } from "./MarksGroup";
import { type BoothVersionActions, OtherVersions } from "./OtherVersions";
import { RhythmLane } from "./RhythmLane";
import { SongFacts } from "./SongFacts";

/**
 * 2026-11 — the one song details component every place shares (the Booth's song sheet, the app-wide details sheet
 * behind Compose, Library, Database and search rows, the DNA pages): the facts, the rhythm lane while it plays, the
 * lyrics, the marks and every other version of the work.
 */
export function SongDetails({
  song,
  position,
  onMeasure,
  booth,
  header = true,
  versions = true,
  durationSec,
}: {
  song: Song;
  /** the side's second while it plays here (the Booth); the lane, the synced lyrics and "Mark now" follow it */
  position?: PositionFn;
  onMeasure?: () => Promise<string | null>;
  booth?: BoothVersionActions;
  header?: boolean;
  versions?: boolean;
  durationSec?: number;
}) {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const dur = durationSec ?? song.durationSec ?? 180;
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1"
      data-testid="song-details"
      data-song={song.id}
    >
      <SongFacts song={song} header={header} />
      {position && <RhythmLane song={song} durationSec={dur} position={position} lines={lyrics?.lines} />}
      <LyricsGroup song={song} position={position} onLyrics={setLyrics} />
      <MarksGroup
        song={song}
        position={position}
        onMeasure={onMeasure}
        lyricsHint={firstSungSec(lyrics?.lines)}
      />
      {versions && <OtherVersions song={song} booth={booth} />}
    </div>
  );
}
