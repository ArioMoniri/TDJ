"use client";
import { t } from "@/lib/i18n";
import "./compose-db.css";
import { Pause, Play } from "lucide-react";
import { memo, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { sourceFor, trackFor, usePlayer } from "@/lib/player";
import { bpmText, keyText, useSongData } from "@/lib/songView";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { Artwork } from "./Artwork";
import { EraBadge } from "./EraBadge";
import { Tip } from "./Tip";

/** the 44 pt play / pause of a side's preview (or its full track with Spotify connected) */
export function PlayButton({ song, className = "" }: { song: Song; className?: string }) {
  const { song: eff } = useSongData(song);
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
  const playing = usePlayer((s) => s.playing && s.track?.id === song.id);
  const src = sourceFor(eff, connected);
  return (
    <Tip
      text={
        src
          ? playing
            ? t("songRow.pause_2")
            : t("songRow.play_a_preview_in_the_mini")
          : t("songRow.no_preview_found_for_this_side")
      }
    >
      <button
        type="button"
        className={`icon-btn icon-btn-bare h-11 w-11 shrink-0 ${playing ? "text-[var(--tint)]" : "text-[var(--label-2)]"} ${className}`}
        aria-label={
          playing ? t("songRow.pause", { title: song.title }) : t("songRow.play", { title: song.title })
        }
        aria-pressed={playing}
        disabled={!src}
        data-testid="song-play"
        onClick={(e) => {
          e.stopPropagation();
          if (!src) return;
          haptic(4);
          usePlayer.getState().toggle(trackFor(eff, src));
        }}
      >
        {playing ? (
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
  const body = (
    <>
      <Artwork
        src={data.artwork?.value as string | undefined}
        orchestra={song.orchestra}
        orchestraId={song.orchestraId}
        song={song}
      />
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
      className={`cell gap-2 ${dim ? "opacity-60" : ""}`}
      data-leading="art"
      data-testid={testId}
      data-song-id={song.id}
    >
      {onClick ? (
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
          onClick={onClick}
          aria-label={ariaLabel}
          disabled={busy}
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      {showPlay && <PlayButton song={song} className="-my-2" />}
      {trailing}
    </div>
  );
});
