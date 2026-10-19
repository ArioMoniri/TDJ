"use client";
import { AudioWaveform, LoaderCircle, Pause, Play, Repeat2, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { analyseSong, isAnalysing, keyLabel } from "@/lib/analyze";
import { effectiveSong } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { DUR, EASE, lineSwap } from "@/lib/motion";
import { sourceFor, trackFor, usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { AudioDetails } from "./AudioDetails";
import { Menu } from "./Menu";
import { ResolveSheet } from "./ResolveSheet";
import { SwipeRow } from "./SwipeRow";

/**
 * Apple Music track row: a 44 pt play/pause control in the number slot (the number returns on pause), title + year,
 * trailing key chip (F♯m · 11A) and BPM when analysed, tabular energy, hover swap (desktop) / swipe swap (phone),
 * and a menu with "Find on services…" and "Analyse in browser". Space toggles playback while the row is focused.
 */
export function TrackRow({
  n,
  song,
  rhythm,
  inFlight = false,
  nudge = 0,
  onSwap,
  disabled,
  swapLabel,
}: {
  n: number;
  song: Song;
  rhythm?: string;
  inFlight?: boolean;
  nudge?: number;
  onSwap: () => void;
  disabled?: boolean;
  swapLabel: string;
}) {
  const reduced = useReducedMotion();
  const overrides = useStore((s) => s.overrides);
  const token = useStore((s) => s.spotifyToken);
  const connected = !!token && token.expires > Date.now();
  const eff = effectiveSong(song, overrides);
  const source = sourceFor(eff, connected);
  const player = usePlayer();
  const current = player.track?.id === song.id;
  const playing = current && player.playing;
  const [details, setDetails] = useState(false);
  const [find, setFind] = useState(false);
  const [busy, setBusy] = useState(false);
  const audio = eff.audio ?? null;
  const title = song.title;
  const year = eff.year;
  const approx = song.yearApprox;
  const energy = song.energy ?? 50;

  const toggle = () => {
    if (!source) {
      setFind(true);
      return;
    }
    haptic(4);
    player.toggle(trackFor(eff, source));
  };
  const analyse = async () => {
    setBusy(true);
    try {
      await analyseSong(song, rhythm);
    } finally {
      setBusy(false);
    }
  };
  const analysing = busy || isAnalysing(song.id);
  const playLabel = playing ? `Pause ${title}` : source ? `Play ${title}` : `Find ${title} on services`;

  return (
    <motion.li
      layout={reduced ? false : "position"}
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
          { kind: "swap", label: "Swap", icon: Repeat2, onClick: onSwap, disabled: disabled || inFlight },
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
              <Pause size={18} fill="currentColor" strokeWidth={0} aria-hidden />
            ) : source ? (
              <>
                <span className="text-subhead tabular-nums group-focus-within/row:hidden group-hover/row:hidden">
                  {n}
                </span>
                <Play
                  size={18}
                  fill="currentColor"
                  strokeWidth={0}
                  className="hidden group-focus-within/row:block group-hover/row:block"
                  aria-hidden
                />
              </>
            ) : (
              <>
                <span className="text-subhead tabular-nums group-focus-within/row:hidden group-hover/row:hidden">
                  {n}
                </span>
                <Search
                  size={16}
                  strokeWidth={2.25}
                  className="hidden group-focus-within/row:block group-hover/row:block"
                  aria-hidden
                />
              </>
            )}
          </button>
          <motion.span
            className="min-w-0 flex-1 truncate"
            animate={{ opacity: inFlight ? 0.6 : 1, x: nudge && !reduced ? [0, -3, 3, 0] : 0 }}
            transition={{ duration: nudge ? 0.24 : DUR.fast }}
            key={`${title}-${nudge}`}
          >
            {title}{" "}
            <span className="text-[var(--label-2)]">
              {approx ? "c. " : ""}
              {year ?? "?"}
            </span>
          </motion.span>
          {audio && (
            <button
              type="button"
              className="text-caption1 -my-1 inline-flex min-h-[28px] items-center rounded-md bg-[var(--fill-4)] px-1.5 font-mono tabular-nums text-[var(--label-2)]"
              title={`Key ${keyLabel(audio)} · ${Math.round(audio.bpm)} BPM · ${audio.loudnessDb.toFixed(1)} dBFS · analysed from a 30 s preview`}
              aria-label={`Key ${keyLabel(audio)}, ${Math.round(audio.bpm)} BPM, details`}
              data-testid="key-chip"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setDetails(true)}
            >
              {keyLabel(audio)}
              <span className="ml-1.5 hidden text-[var(--label-2)] sm:inline">{Math.round(audio.bpm)}</span>
            </button>
          )}
          <span className="text-subhead tabular-nums text-[var(--label-2)]">
            <span className="sr-only">energy </span>
            {energy}
          </span>
          <span
            className="relative hidden h-1 w-10 overflow-hidden rounded-full bg-[var(--fill-3)] sm:block"
            aria-hidden
          >
            <motion.span
              className="block h-full w-full origin-left rounded-full bg-[var(--tint)]"
              initial={false}
              animate={{ scaleX: energy / 100 }}
              transition={{ duration: DUR.slow, ease: EASE.inOut }}
            />
          </span>
          <button
            type="button"
            onClick={onSwap}
            disabled={disabled || inFlight}
            aria-label={swapLabel}
            title="Swap this track for another of the same family"
            className="icon-btn icon-btn-bare -my-2 hidden h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-0 group-hover/row:opacity-100 sm:inline-flex"
          >
            <Repeat2 size={18} strokeWidth={1.75} className={inFlight ? "animate-spin" : ""} />
          </button>
          <Menu
            label={`Track ${n} actions`}
            className="icon-btn-bare -my-2 -mr-3 h-11 w-10"
            icon={analysing ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : undefined}
            items={[
              { label: "Find on services…", icon: Search, onClick: () => setFind(true) },
              {
                label: audio ? "Analyse again in browser" : "Analyse in browser",
                icon: AudioWaveform,
                onClick: analyse,
                disabled: analysing || !eff.resolved?.previewUrl,
              },
              audio ? { label: "Audio details", icon: AudioWaveform, onClick: () => setDetails(true) } : null,
            ]}
          />
        </div>
      </SwipeRow>
      {audio && <AudioDetails song={eff} audio={audio} open={details} onClose={() => setDetails(false)} />}
      <ResolveSheet song={find ? song : null} open={find} onClose={() => setFind(false)} />
    </motion.li>
  );
}
