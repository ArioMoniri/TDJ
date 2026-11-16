"use client";
import {
  ArrowDown,
  ArrowUp,
  AudioWaveform,
  GripVertical,
  Info,
  ListMusic,
  ListPlus,
  LoaderCircle,
  Play,
  Repeat2,
  Search,
  Trash2,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useCallback, useMemo, useState } from "react";
import { analyseSong, isAnalysing, keyLabel, useMeasuring } from "@/lib/analyze";
import { patchedSong } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { isAction } from "@/lib/keymap";
import { fmtLen } from "@/lib/lengths";
import { lineSwap } from "@/lib/motion";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { openSongDetails } from "@/lib/songOpen";
import { bpmText, keyText, useSongData } from "@/lib/songView";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { yearText } from "@/lib/year";
import { I } from "./Icons";
import { Menu } from "./Menu";
import { SwipeRow } from "./SwipeRow";
import { Artwork } from "./ui/Artwork";
import { EraBadge } from "./ui/EraBadge";
import { NoAudio, NowBars } from "./ui/NowPlaying";
import { Tip, useTip } from "./ui/Tip";

/* The two sheets are rare (one row at a time): their code arrives when the first one opens. */
const AudioDetails = dynamic(() => import("./AudioDetails").then((m) => m.AudioDetails), { ssr: false });
const ResolveSheet = dynamic(() => import("./ResolveSheet").then((m) => m.ResolveSheet), { ssr: false });

/**
 * Apple Music track row: a 44 pt play/pause control in the number slot (the number returns on pause), title + year,
 * trailing key chip (F♯m · 11A) and BPM when analysed, tabular energy, hover swap (desktop) / swipe swap (phone),
 * and a menu with "Find on services…" and "Analyse in browser". Space toggles playback while the row is focused.
 *
 * Memoised: a set has 88 of these, so a swap, a lock or a player tick must only re-render the rows it touches.
 * Store subscriptions are narrowed to this song's patch and this row's playing state for the same reason.
 */
export const TrackRow = memo(function TrackRow({
  n,
  song,
  rhythm,
  inFlight = false,
  nudge = 0,
  onSwap,
  disabled,
  swapLabel,
  animateLayout = false,
  lockedWhy,
  lengthSec,
  count,
  onMove,
  dragHandle,
  onInsert,
  onRemove,
}: {
  n: number;
  song: Song;
  rhythm?: string;
  inFlight?: boolean;
  nudge?: number;
  /** called with the track index (`n - 1`) */
  onSwap: (k: number) => void;
  disabled?: boolean;
  swapLabel: string;
  /** the parent card is the one being swapped/locked: animate this row's position */
  animateLayout?: boolean;
  /** why Swap is off ("unlock the tanda first", "a night from History is read-only") */
  lockedWhy?: string;
  /** 2026-11: the side's played length (its cue window, else its recording); null prints "–:–" */
  lengthSec?: number | null;
  /** the tanda's size (Move down stops at the last chair) */
  count?: number;
  /** 2026-11: reorder inside the tanda — called with (from, to) track indexes; absent on a read-only night */
  onMove?: (from: number, to: number) => void;
  /** the drag handle's pointer props for track index k (useDragReorder: stable, so the row stays memoised) */
  dragHandle?: (k: number) => Record<string, unknown>;
  /** 2026-11: "Add song here" — a side at this row's place (opens the Insert sheet); absent on a read-only night */
  onInsert?: (at: number) => void;
  /** 2026-11: "Remove song" — this side out of the tanda (through the rule check, Undo); absent when read-only */
  onRemove?: (k: number) => void;
}) {
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const patch = useStore((s) => s.overrides.songs?.[song.id]);
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
  const eff = patchedSong(song, patch);
  // round 22: artwork, BPM and key from the DJ's edits, their sources, then the index
  const { data, bpm: bpmPick } = useSongData(song);
  // wave 2: one BPM per side (DJ edit > analysed preview > source > estimate), printed once on the row
  const bpm = bpmText(data);
  const level = typeof eff.level?.gainDb === "number" ? eff.level.gainDb : null;
  const tempoLine = [bpm, level !== null ? `${level.toFixed(1).replace("-", "−")} dB` : null]
    .filter(Boolean)
    .join(" · ");
  const keyOnly = !eff.audio ? keyText(data) : null;
  const item = useMemo<PlayItem>(() => ({ kind: "song", song }), [song]);
  const play = useTapPlay(item);
  const playing = play.playing;
  const source = play.audible;
  void connected;
  const [details, setDetails] = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);
  const [find, setFind] = useState(false);
  const [findMounted, setFindMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const audio = eff.audio ?? null;
  const title = song.title;
  const year = eff.year;
  const approx = song.yearApprox;
  const energy = song.energy ?? 50;
  const k = n - 1;

  const openFind = useCallback(() => {
    setFindMounted(true);
    setFind(true);
  }, []);
  const openDetails = useCallback(() => {
    setDetailsMounted(true);
    setDetails(true);
  }, []);
  // 2026-11: one tap plays (the playing row pauses); nothing to play → a toast that says why, with "Find…"
  const toggle = () => {
    haptic(4);
    void play.tap({ find: openFind });
  };
  const analyse = async () => {
    setBusy(true);
    try {
      await analyseSong(song, rhythm, false, { find: openFind });
    } finally {
      setBusy(false);
    }
  };
  const swap = () => onSwap(k);
  const analysing = busy || isAnalysing(song.id);
  // QA fix 2026-11: "Measuring… 40 %" on the row while its audio is read and analysed
  const measuring = useMeasuring((m) => m.progress[song.id]);
  const playLabel = playing
    ? t("trackRow.pause", { title })
    : source
      ? t("trackRow.play", { title })
      : t("trackRow.find_on_services_2", { title });
  const playTip = useTip<HTMLButtonElement>(
    playing
      ? "Pause"
      : source
        ? t("trackRow.play_a_preview_in_the_mini")
        : t("trackRow.look_for_this_side_on_spotify"),
  );

  return (
    <motion.li
      layout={animateLayout && !reduced ? "position" : false}
      variants={lineSwap}
      initial="hidden"
      animate="show"
      exit="exit"
      className="group/row relative"
      data-song={song.id}
      data-playing={playing || undefined}
      data-now={play.state ?? undefined}
      data-reorder-row
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // 2026-11: the row's keys — S opens its Swap sheet, Alt+↑ / Alt+↓ move it inside the tanda (EditKeys, ⌘Z undoes)
        if (isAction("edit.swap", e)) {
          e.preventDefault();
          if (!disabled && !inFlight) swap();
          return;
        }
        const up = isAction("edit.moveUp", e);
        if ((up || isAction("edit.moveDown", e)) && onMove && !disabled) {
          e.preventDefault();
          const to = up ? k - 1 : k + 1;
          if (to >= 0 && to < (count ?? 0)) onMove(k, to);
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && onRemove && !disabled) {
          e.preventDefault();
          onRemove(k);
          return;
        }
        if (e.key !== " ") return;
        e.preventDefault();
        toggle();
      }}
    >
      <SwipeRow
        leading="num"
        actions={[
          {
            kind: "swap",
            label: t("trackRow.swap_2"),
            icon: "swap",
            onClick: swap,
            disabled: disabled || inFlight,
          },
          ...(onRemove && !disabled
            ? [
                {
                  kind: "destructive" as const,
                  label: t("spot.remove_song"),
                  icon: Trash2,
                  onClick: () => onRemove(k),
                },
              ]
            : []),
        ]}
      >
        <div className={`cell ${play.state ? "row-now" : ""}`} data-leading="num">
          <button
            type="button"
            className={`icon-btn icon-btn-bare -my-2 -ml-3 h-11 w-11 shrink-0 ${playing ? "text-[var(--tint)]" : "text-[var(--label-2)]"}`}
            aria-label={playLabel}
            aria-pressed={playing}
            {...playTip.props}
            data-testid="play-button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggle}
          >
            {playTip.tag}
            {play.state ? (
              <NowBars on={playing} />
            ) : (
              <>
                <span className="text-subhead tabular-nums group-focus-within/row:hidden group-hover/row:hidden">
                  {n}
                </span>
                {source ? (
                  <I
                    name="play"
                    size={18}
                    fill="currentColor"
                    strokeWidth={0}
                    className="hidden group-focus-within/row:block group-hover/row:block"
                  />
                ) : (
                  <I
                    name="search"
                    size={16}
                    strokeWidth={2.25}
                    className="hidden group-focus-within/row:block group-hover/row:block"
                  />
                )}
              </>
            )}
          </button>
          {/* 2026-11: the cover and the title are one play target (a tap on the image plays too) */}
          <button
            type="button"
            className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={playLabel}
            data-testid="row-play"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggle}
          >
            {/* round 22: the cover with the era badge on its corner (one slot, so the title keeps its room) */}
            <span className="relative shrink-0" data-testid="row-art">
              <Artwork
                src={data.artwork?.value as string | undefined}
                orchestra={song.orchestra}
                orchestraId={song.orchestraId}
                song={song}
                size="s"
              />
              <EraBadge song={eff} compact overlay />
            </span>
            {/* the title truncates in its own block and the year never shrinks: an inline year inside a truncated
              span could still overflow the viewport by a pixel on phones (round4 mobile-overflow flake) */}
            <span
              key={`${title}-${nudge}`}
              className={`flex min-w-0 flex-1 items-baseline gap-1 ${nudge && !reduced ? "nudge-x" : ""}`}
              style={{ opacity: inFlight ? 0.6 : 1, transition: "opacity var(--dur-xs) var(--ease-settle)" }}
            >
              <span className="min-w-[5rem] truncate">{title}</span>
              {/* phones: the year is in the tanda header; here it took the title's room ("La Vida M…") */}
              <span className={`shrink-0 text-[var(--label-2)] ${isPhone ? "sr-only" : ""}`}>
                {song.transcription || approx ? (
                  <span className="text-caption1" data-testid="undated">
                    {t("trackRow.undated_transcription", { p1: year ? ` · c. ${year}` : "" })}
                  </span>
                ) : (
                  yearText(year)
                )}
              </span>
            </span>
          </button>
          {!source && <NoAudio />}
          {keyOnly && (
            <span className="data-chip font-mono" data-testid="key-chip">
              <span className="sr-only">{t("trackRow.key")} </span>
              {keyOnly}
            </span>
          )}
          {bpm && !isPhone && level === null && (
            <Tip text={bpmPick?.note ?? t("trackRow.beats_per_minute")}>
              <span className="data-chip" data-testid="row-bpm">
                {bpm}
              </span>
            </Tip>
          )}
          {audio && !isPhone && (
            <Tip text={t("trackRow.key_analysed_from_a_30_s", { p1: keyLabel(audio) })}>
              <button
                type="button"
                className="key-chip text-caption1 -my-1 inline-flex min-h-[28px] shrink-0 items-center whitespace-nowrap rounded-md bg-[var(--fill-4)] px-1.5 font-mono tabular-nums text-[var(--label-2)]"
                aria-label={t("trackRow.key_details", { p1: keyLabel(audio) })}
                data-testid="key-chip"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={openDetails}
              >
                {keyLabel(audio)}
              </button>
            </Tip>
          )}
          {/* phones: a 55 × 28 chip is not a target; the key is a label, the details are on ••• */}
          {audio && isPhone && (
            <span
              className="text-caption1 rounded-md bg-[var(--fill-4)] px-1.5 py-0.5 font-mono tabular-nums text-[var(--label-2)]"
              data-testid="key-chip"
            >
              <span className="sr-only">{t("trackRow.key")} </span>
              {keyLabel(audio)}
            </span>
          )}
          {/* round 21: the measured tempo and level the tanda's bands read */}
          {level !== null && tempoLine && !isPhone && (
            <Tip text={bpmPick?.note ?? t("trackRow.the_side_s_level")}>
              <span
                className="row-tempo text-caption1 shrink-0 whitespace-nowrap tabular-nums text-[var(--label-3)]"
                data-testid="row-tempo"
              >
                {tempoLine}
              </span>
            </Tip>
          )}
          <span className="len text-subhead" data-testid="row-len">
            <span className="sr-only">{t("play.length")} </span>
            {fmtLen(lengthSec)}
          </span>
          <span className="text-subhead tabular-nums text-[var(--label-2)]">
            <span className="sr-only">{t("trackRow.energy")} </span>
            {energy}
          </span>
          {!isPhone && (
            <span
              className="energy-bar relative h-1 w-10 overflow-hidden rounded-full bg-[var(--fill-3)]"
              aria-hidden
            >
              <span
                className="block h-full w-full origin-left rounded-full bg-[var(--tint)]"
                style={{ transform: `scaleX(${energy / 100})` }}
              />
            </span>
          )}
          {!isPhone && (
            <Tip
              text={
                disabled
                  ? `Swap: ${lockedWhy ?? t("trackRow.unlock_the_tanda_first")}`
                  : t("trackRow.swap_this_track_for_another_of")
              }
            >
              <button
                type="button"
                onClick={swap}
                disabled={disabled || inFlight}
                aria-label={swapLabel}
                className="icon-btn icon-btn-bare -my-2 inline-flex h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-0 group-hover/row:opacity-100"
              >
                <I name="swap" size={18} strokeWidth={1.75} className={inFlight ? "animate-spin" : ""} />
              </button>
            </Tip>
          )}
          {onMove && !disabled && (
            <button
              type="button"
              className="drag-handle icon-btn icon-btn-bare -my-2 -mx-2 h-11 w-11 shrink-0 text-[var(--label-3)]"
              aria-label={t("play.drag_to_reorder", { title })}
              data-testid="drag-handle"
              {...dragHandle?.(k)}
            >
              <GripVertical size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
          {measuring !== undefined && (
            <span
              className="text-caption1 shrink-0 tabular-nums text-[var(--label-2)]"
              role="status"
              data-testid="row-measuring"
            >
              {t("analyze.measuring", { p: Math.round(measuring * 100) })}
            </span>
          )}
          <Menu
            label={t("trackRow.track_actions", { n })}
            className="icon-btn-bare -my-2 -mr-3 h-11 w-10"
            icon={
              analysing ? (
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
              ) : (
                <I name="more" size={20} strokeWidth={2} />
              )
            }
            items={[
              // round 21: the side's Swap sheet (suggestions that keep the tanda valid, search, AI pick)
              // wave 2: a greyed-out Swap says why
              {
                label: disabled
                  ? `Swap… (${lockedWhy ?? t("trackRow.unlock_the_tanda_first")})`
                  : inFlight
                    ? t("trackRow.swap_swapping")
                    : t("trackRow.swap"),
                icon: Repeat2,
                onClick: swap,
                disabled: disabled || inFlight,
              },
              // QA fix 2026-11: a locked tanda's sides never move — greyed, with the reason (as Swap)
              onMove && {
                label: disabled
                  ? `${t("play.move_up")} (${lockedWhy ?? t("trackRow.unlock_the_tanda_first")})`
                  : t("play.move_up"),
                icon: ArrowUp,
                onClick: () => onMove(k, k - 1),
                disabled: disabled || k === 0,
              },
              onMove && {
                label: disabled
                  ? `${t("play.move_down")} (${lockedWhy ?? t("trackRow.unlock_the_tanda_first")})`
                  : t("play.move_down"),
                icon: ArrowDown,
                onClick: () => onMove(k, k + 1),
                disabled: disabled || k >= (count ?? 0) - 1,
              },
              // 2026-11: this song only, or on from it to the end of the night (whatever the tap setting says)
              {
                label: t("play.play_this_song"),
                icon: Play,
                onClick: () => void play.tap({ find: openFind, scope: "one" }),
              },
              {
                label: t("play.play_from_here"),
                icon: ListMusic,
                onClick: () => void play.tap({ find: openFind, scope: "from" }),
              },
              { label: t("song.details"), icon: Info, onClick: () => openSongDetails(eff) },
              onInsert && {
                label: t("spot.add_song_before"),
                icon: ListPlus,
                onClick: () => onInsert(k),
                disabled: disabled,
              },
              onInsert && {
                label: t("spot.add_song_after"),
                icon: ListPlus,
                onClick: () => onInsert(k + 1),
                disabled: disabled,
              },
              onRemove && {
                label: t("spot.remove_song"),
                icon: Trash2,
                onClick: () => onRemove(k),
                disabled: disabled,
                destructive: true,
              },
              { label: t("trackRow.find_on_services"), icon: Search, onClick: openFind },
              {
                label: audio ? t("trackRow.measure_again_from_file") : t("trackRow.measure_from_file"),
                icon: AudioWaveform,
                onClick: analyse,
                // (QA fix 2026-11: never greyed without a reason — the ladder tries the file and the clip, and says why)
                disabled: analysing,
              },
              audio
                ? { label: t("trackRow.audio_details"), icon: AudioWaveform, onClick: openDetails }
                : null,
            ]}
          />
        </div>
      </SwipeRow>
      {audio && detailsMounted && (
        <AudioDetails
          song={eff}
          audio={audio}
          open={details}
          onClose={() => setDetails(false)}
          onSwap={disabled || inFlight ? undefined : swap}
          bpm={bpmPick}
        />
      )}
      {findMounted && <ResolveSheet song={find ? song : null} open={find} onClose={() => setFind(false)} />}
    </motion.li>
  );
});
