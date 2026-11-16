"use client";
import type { Song } from "@tdj/core";
import { useMemo, useState } from "react";
import { firstSungSec, type Lyrics } from "@/lib/lyrics";
import { playingPositionFn, usePlayingPosition } from "@/lib/playingPosition";
import { measureFromFolder } from "@/lib/songMeasure";
import { LyricsGroup } from "./LyricsGroup";
import { MarksGroup, type PositionFn } from "./MarksGroup";
import { type BoothVersionActions, OtherVersions } from "./OtherVersions";
import { RhythmLane } from "./RhythmLane";
import { SongFacts } from "./SongFacts";

/**
 * 2026-11 — the one song details component every place shares (the Booth's song sheet, the app-wide details sheet
 * behind Compose, Library, Database, search, History, Rooms and the mini player's cover, the DNA pages): the facts,
 * the rhythm lane while it plays, the lyrics, the marks and every other version of the work. Wherever it opens it
 * follows the side where it plays (lib/playingPosition.ts: the Booth's room or pre-listen, else the mini player): the
 * lane, the synced lyrics (a tap on a line plays from there) and "Mark now"; "Measure" reads the DJ's linked file.
 */
export function SongDetails({
  song,
  position,
  onMeasure,
  booth,
  header = true,
  versions = true,
  durationSec,
  shownLyrics,
}: {
  song: Song;
  /** the side's second while it plays (default: wherever it plays — the Booth, else the mini player) */
  position?: PositionFn;
  /** measure from the DJ's file (default: the linked music folder's file of the side) */
  onMeasure?: () => Promise<string | null>;
  booth?: BoothVersionActions;
  header?: boolean;
  versions?: boolean;
  durationSec?: number;
  /**
   * 2026-11 (QA: two lyric lines "current" at once in Now playing, its Lyrics tab and this About tab's copy): the
   * lyrics the view around this already shows (null while they load). When given, no second lyrics group and no
   * second rhythm lane are drawn here; the marks read these lyrics for their hint.
   */
  shownLyrics?: Lyrics | null;
}) {
  const [own, setLyrics] = useState<Lyrics | null>(null);
  const elsewhere = shownLyrics !== undefined;
  const lyrics = elsewhere ? shownLyrics : own;
  const dur = durationSec ?? song.durationSec ?? 180;
  const anywhere = useMemo(() => playingPositionFn(song.id), [song.id]);
  const pos = position ?? anywhere;
  // the lane shows while the side plays with a recording clock (a 30 s clip has none)
  const now = usePlayingPosition(song.id, { stepSec: 5 });
  const measure = useMemo(() => onMeasure ?? (() => measureFromFolder(song)), [onMeasure, song]);
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1"
      data-testid="song-details"
      data-song={song.id}
      data-playing-from={now?.source ?? undefined}
    >
      <SongFacts song={song} header={header} />
      {now?.synced && !elsewhere && (
        <RhythmLane song={song} durationSec={dur} position={pos} lines={lyrics?.lines} />
      )}
      {!elsewhere && <LyricsGroup song={song} onLyrics={setLyrics} />}
      <MarksGroup song={song} position={pos} onMeasure={measure} lyricsHint={firstSungSec(lyrics?.lines)} />
      {versions && <OtherVersions song={song} booth={booth} />}
    </div>
  );
}
