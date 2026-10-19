"use client";
import { AudioWaveform, LoaderCircle, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useCallback, useState } from "react";
import { analyseSong, isAnalysing, keyLabel } from "@/lib/analyze";
import { patchedSong } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { lineSwap } from "@/lib/motion";
import { sourceFor, trackFor, usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { I } from "./Icons";
import { Menu } from "./Menu";
import { SwipeRow } from "./SwipeRow";

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
}) {
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const patch = useStore((s) => s.overrides.songs?.[song.id]);
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
  const eff = patchedSong(song, patch);
  const source = sourceFor(eff, connected);
  const playing = usePlayer((s) => s.playing && s.track?.id === song.id);
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
  const toggle = () => {
    if (!source) {
      openFind();
      return;
    }
    haptic(4);
    usePlayer.getState().toggle(trackFor(eff, source));
  };
  const analyse = async () => {
    setBusy(true);
    try {
      await analyseSong(song, rhythm);
    } finally {
      setBusy(false);
    }
  };
  const swap = () => onSwap(k);
  const analysing = busy || isAnalysing(song.id);
  const playLabel = playing ? `Pause ${title}` : source ? `Play ${title}` : `Find ${title} on services`;

  return (
    <motion.li
      layout={animateLayout && !reduced ? "position" : false}
      variants={lineSwap}
      initial="hidden"
      animate="show"
      exit="exit"
      className="group/row"
      data-song={song.id}
      data-playing={playing || undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== " " || e.target !== e.currentTarget) return;
        e.preventDefault();
        toggle();
      }}
    >
      <SwipeRow
        leading="num"
        actions={[
          { kind: "swap", label: "Swap", icon: "swap", onClick: swap, disabled: disabled || inFlight },
        ]}
      >
        <div className="cell" data-leading="num">
          <button
            type="button"
            className={`icon-btn icon-btn-bare -my-2 -ml-3 h-11 w-11 shrink-0 ${playing ? "text-[var(--tint)]" : "text-[var(--label-2)]"}`}
            aria-label={playLabel}
            aria-pressed={playing}
            data-testid="play-button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggle}
          >
            {playing ? (
              <I name="pause" size={18} fill="currentColor" strokeWidth={0} />
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
          {/* the title truncates in its own block and the year never shrinks: an inline year inside a truncated
              span could still overflow the viewport by a pixel on phones (round4 mobile-overflow flake) */}
          <span
            key={`${title}-${nudge}`}
            className={`flex min-w-0 flex-1 items-baseline gap-1 ${nudge && !reduced ? "nudge-x" : ""}`}
            style={{ opacity: inFlight ? 0.6 : 1, transition: "opacity var(--dur-xs) var(--ease-settle)" }}
          >
            <span className="min-w-0 truncate">{title}</span>
            <span className="shrink-0 text-[var(--label-2)]">
              {approx ? "c. " : ""}
              {year ?? "?"}
            </span>
          </span>
          {audio && (
            <button
              type="button"
              className="text-caption1 -my-1 inline-flex min-h-[28px] items-center rounded-md bg-[var(--fill-4)] px-1.5 font-mono tabular-nums text-[var(--label-2)]"
              title={`Key ${keyLabel(audio)} · ${Math.round(audio.bpm)} BPM · ${audio.loudnessDb.toFixed(1)} dBFS · analysed from a 30 s preview`}
              aria-label={`Key ${keyLabel(audio)}, ${Math.round(audio.bpm)} BPM, details`}
              data-testid="key-chip"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={openDetails}
            >
              {keyLabel(audio)}
              <span className="ml-1.5 hidden text-[var(--label-2)] sm:inline">{Math.round(audio.bpm)}</span>
            </button>
          )}
          <span className="text-subhead tabular-nums text-[var(--label-2)]">
            <span className="sr-only">energy </span>
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
            <button
              type="button"
              onClick={swap}
              disabled={disabled || inFlight}
              aria-label={swapLabel}
              title="Swap this track for another of the same family"
              className="icon-btn icon-btn-bare -my-2 inline-flex h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-0 group-hover/row:opacity-100"
            >
              <I name="swap" size={18} strokeWidth={1.75} className={inFlight ? "animate-spin" : ""} />
            </button>
          )}
          <Menu
            label={`Track ${n} actions`}
            className="icon-btn-bare -my-2 -mr-3 h-11 w-10"
            icon={
              analysing ? (
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
              ) : (
                <I name="more" size={20} strokeWidth={2} />
              )
            }
            items={[
              { label: "Find on services…", icon: Search, onClick: openFind },
              {
                label: audio ? "Analyse again in browser" : "Analyse in browser",
                icon: AudioWaveform,
                onClick: analyse,
                disabled: analysing || !eff.resolved?.previewUrl,
              },
              audio ? { label: "Audio details", icon: AudioWaveform, onClick: openDetails } : null,
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
        />
      )}
      {findMounted && <ResolveSheet song={find ? song : null} open={find} onClose={() => setFind(false)} />}
    </motion.li>
  );
});
