"use client";
import { Play } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { fmtLen, nightLength, totalText } from "@/lib/lengths";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { useStore } from "@/lib/store";
import type { Cortina, Playlist, Song } from "@/lib/types";
import { NoAudio, NowBars } from "./NowPlaying";

/**
 * 2026-11 — a song row whose body plays it (one tap; a second tap on the playing row pauses). The leading slot
 * (the artwork, a tile or a number) is inside the button, so a tap on the image plays too. Trailing controls stay
 * outside the button and keep their own actions.
 */
export function PlayRow({
  song,
  where,
  leading,
  title,
  sub,
  trailing,
  lengthSec,
  testId,
  className = "",
  leadingKind = "art",
  onFind,
  playTestId = "row-play",
}: {
  song: Song;
  where?: string;
  leading?: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  /** printed right-aligned (m:ss); undefined leaves it out */
  lengthSec?: number | null;
  testId?: string;
  className?: string;
  leadingKind?: "art" | "num" | "tile";
  /** nothing to play: the toast offers "Find…" (the Find on services sheet) */
  onFind?: () => void;
  /** the play button's test id */
  playTestId?: string;
}) {
  const item = useMemo<PlayItem>(() => ({ kind: "song", song, where }), [song, where]);
  const play = useTapPlay(item);
  return (
    <div
      className={`cell ${play.state ? "row-now" : ""} ${className}`}
      data-leading={leadingKind}
      data-testid={testId}
      data-song-id={song.id}
      data-now={play.state ?? undefined}
    >
      <button
        type="button"
        className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={
          play.playing
            ? t("play.pause_title", { title: song.title })
            : t("play.play_title", { title: song.title })
        }
        aria-pressed={play.playing}
        data-testid={playTestId}
        onClick={() => {
          haptic(4);
          void play.tap(onFind ? { find: onFind } : undefined);
        }}
      >
        {leading && (
          <span className="relative shrink-0" data-testid="row-art">
            {leading}
            {play.state && (
              <span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/45 text-white">
                <NowBars on={play.playing} className="!text-white" />
              </span>
            )}
          </span>
        )}
        {!leading && play.state && <NowBars on={play.playing} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title ?? song.title}</span>
          {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
        </span>
      </button>
      {!play.audible && <NoAudio />}
      {lengthSec !== undefined && (
        <span className="len text-subhead" data-testid="row-len">
          <span className="sr-only">{t("play.length")} </span>
          {fmtLen(lengthSec)}
        </span>
      )}
      {trailing}
    </div>
  );
}

/** a 44 pt play / pause for a cortina (from its chorus, for its cortina length) where the row does something else */
export function CortinaPlayButton({ cortina, where }: { cortina: Cortina; where?: string }) {
  const item = useMemo<PlayItem>(() => ({ kind: "cortina", cortina, where }), [cortina, where]);
  const play = useTapPlay(item);
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-bare -my-2 h-11 w-11 shrink-0 ${play.state ? "text-[var(--tint)]" : "text-[var(--label-2)]"}`}
      aria-label={
        play.playing
          ? t("play.pause_cortina", { title: cortina.title })
          : t("play.play_title", { title: cortina.title })
      }
      aria-pressed={play.playing}
      data-testid="cortina-play-button"
      onClick={(e) => {
        e.stopPropagation();
        haptic(4);
        void play.tap();
      }}
    >
      {play.state ? <NowBars on={play.playing} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
    </button>
  );
}

/** the night's played length (cues, cortinas from their start for their length), "≈" when a length is unknown */
export function useNightLength(p: Playlist | null | undefined) {
  const settings = useStore((s) => s.settings);
  // 2026-11: the same seconds as the Booth plan (lib/lengths `nightLength`)
  return useMemo(() => (p ? nightLength(p, settings) : null), [p, settings]);
}

export function NightLength({
  playlist,
  className = "",
}: {
  playlist: Playlist | null | undefined;
  className?: string;
}) {
  const total = useNightLength(playlist);
  if (!total) return null;
  return (
    <span
      className={`text-footnote tabular-nums text-[var(--label-2)] ${className}`}
      data-testid="night-total"
    >
      {t("play.night_total", { total: totalText(total) })}
    </span>
  );
}
