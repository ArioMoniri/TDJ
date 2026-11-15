"use client";
import { t } from "@/lib/i18n";
import "./compose-db.css";
import { Pause, Play } from "lucide-react";
import { memo, type ReactNode, useMemo } from "react";
import { haptic } from "@/lib/haptics";
import { fmtLen } from "@/lib/lengths";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { bpmText, keyText, useSongData } from "@/lib/songView";
import type { Song } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { Artwork } from "./Artwork";
import { EraBadge } from "./EraBadge";
import { NoAudio, NowBars } from "./NowPlaying";
import { Tip } from "./Tip";

/**
 * the 44 pt play / pause of a side: the full track with Spotify Premium, else its 30 s preview, else the DJ's file;
 * nothing to play → a toast that says why (2026-11: never a disabled button)
 */
export function PlayButton({ song, className = "" }: { song: Song; className?: string }) {
  const item = useMemo<PlayItem>(() => ({ kind: "song", song }), [song]);
  const play = useTapPlay(item);
  return (
    <Tip
      text={
        play.audible
          ? play.playing
            ? t("songRow.pause_2")
            : t("songRow.play_a_preview_in_the_mini")
          : t("songRow.no_preview_found_for_this_side")
      }
    >
      <button
        type="button"
        className={`icon-btn icon-btn-bare h-11 w-11 shrink-0 ${play.state ? "text-[var(--tint)]" : "text-[var(--label-2)]"} ${className}`}
        aria-label={
          play.playing ? t("songRow.pause", { title: song.title }) : t("songRow.play", { title: song.title })
        }
        aria-pressed={play.playing}
        data-testid="song-play"
        onClick={(e) => {
          e.stopPropagation();
          haptic(4);
          void play.tap();
        }}
      >
        {play.playing ? (
          <Pause size={18} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={18} fill="currentColor" strokeWidth={0} />
        )}
      </button>
    </Tip>
  );
}

/**
 * One side in a list (the search panel, the Swap sheet, the Database versions): artwork, title, orchestra · singer ·
 * year, the era badge, BPM and key, an optional pill (where it sits tonight, the fit), a play button and trailing
 * actions.
 */
export const SongRow = memo(function SongRow({
  song,
  pill,
  pillTip,
  trailing,
  onClick,
  sub,
  dim = false,
  testId = "song-row",
  showPlay = true,
  ariaLabel,
  busy = false,
}: {
  song: Song;
  pill?: ReactNode;
  pillTip?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  sub?: ReactNode;
  dim?: boolean;
  testId?: string;
  showPlay?: boolean;
  /** the accessible name of the row's main button */
  ariaLabel?: string;
  busy?: boolean;
}) {
  const { song: eff, data } = useSongData(song);
  const bpm = bpmText(data);
  const key = keyText(data);
  const item = useMemo<PlayItem>(() => ({ kind: "song", song }), [song]);
  const play = useTapPlay(item);
  const tapPlay = () => {
    haptic(4);
    void play.tap();
  };
  // 2026-11: the cover plays the side (a tap on the image), with the bars while it plays
  const art = (
    <span className="relative shrink-0" data-testid="row-art">
      <Artwork
        src={data.artwork?.value as string | undefined}
        orchestra={song.orchestra}
        orchestraId={song.orchestraId}
      />
      {play.state && (
        <span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/45">
          <NowBars on={play.playing} className="!text-white" />
        </span>
      )}
    </span>
  );
  const text = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{song.title}</span>
        <span className="text-footnote block truncate text-[var(--label-2)]">
          {sub ?? metaLine(song.orchestra, song.singer ?? "instrumental", yearText(eff.year))}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          <EraBadge song={eff} />
          {bpm && <span className="data-chip">{bpm}</span>}
          {key && <span className="data-chip font-mono">{key}</span>}
          {pill &&
            (pillTip ? (
              <Tip text={pillTip}>
                <span className="place-pill" data-testid="song-pill">
                  {pill}
                </span>
              </Tip>
            ) : (
              <span className="place-pill" data-testid="song-pill">
                {pill}
              </span>
            ))}
        </span>
      </span>
    </>
  );
  return (
    <div
      className={`cell gap-2 ${dim ? "opacity-60" : ""} ${play.state ? "row-now" : ""}`}
      data-leading="art"
      data-testid={testId}
      data-song-id={song.id}
      data-now={play.state ?? undefined}
    >
      {onClick ? (
        // a row whose body picks the side (Swap, search): the cover plays it, the body picks
        <>
          <button
            type="button"
            className="-my-1 shrink-0"
            onClick={tapPlay}
            aria-label={
              play.playing
                ? t("songRow.pause", { title: song.title })
                : t("songRow.play", { title: song.title })
            }
            data-testid="art-play"
          >
            {art}
          </button>
          <button
            type="button"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
            onClick={onClick}
            aria-label={ariaLabel}
            disabled={busy}
          >
            {text}
          </button>
        </>
      ) : (
        // nothing else to do on the row: its body plays the side
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
          onClick={tapPlay}
          aria-label={
            play.playing
              ? t("songRow.pause", { title: song.title })
              : t("songRow.play", { title: song.title })
          }
          data-testid="row-play"
        >
          {art}
          {text}
        </button>
      )}
      {!play.audible && <NoAudio />}
      <span className="len text-footnote" data-testid="row-len">
        <span className="sr-only">{t("play.length")} </span>
        {fmtLen(song.durationSec)}
      </span>
      {showPlay && <PlayButton song={song} className="-my-2" />}
      {trailing}
    </div>
  );
});
