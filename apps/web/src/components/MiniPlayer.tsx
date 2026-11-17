"use client";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { mediaUrl } from "@/lib/app/media";
import { APP } from "@/lib/app/target";
import { useDock } from "@/lib/dock/store";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { sheetUp } from "@/lib/motion";
import { openSong } from "@/lib/openSong";
import { externalSeek, loadPlayAccess, stepList, useFindSheet } from "@/lib/playback";
import { externalAudio, ownAudio, stopAt, usePlayer } from "@/lib/player";
import { scopeStep } from "@/lib/playScope";
import { playableStart } from "@/lib/playSource";
import { openSongDetails } from "@/lib/songOpen";
import { toast } from "@/lib/toast";
import type { Song } from "@/lib/types";
import { SpotifyEmbed } from "./Listen";
import { DockGrip } from "./player/DockGrip";
import { Artwork } from "./ui/Artwork";
import { Marquee } from "./ui/Marquee";
import { SeekBar } from "./ui/SeekBar";
import { usePlayingEntity } from "./ui/TandaArt";

const ResolveSheet = dynamic(() => import("./ResolveSheet").then((m) => m.ResolveSheet), { ssr: false });

const fmt = (s: number) => {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

/**
 * The preview's sound: the one `<audio playsInline>` element of the app lives here (its card, MiniPlayerCard, is held
 * by the one player, components/player/PlayerDock.tsx); Spotify sources render the inline embed in the card instead.
 */
export function MiniPlayer() {
  const { track, playing, position, _tick, _ended, _error } = usePlayer();
  const audio = useRef<HTMLAudioElement>(null);
  const preview = ownAudio(track?.source) ? track!.source.ref : null;
  // whether a Spotify session streams full tracks: asked once, when the page is idle
  useEffect(() => {
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => number })
      .requestIdleCallback;
    const go = () => void loadPlayAccess();
    if (ric) ric(go);
    else setTimeout(go, 1500);
  }, []);
  // a cortina starts at its chorus: once the clip's length is known, where the clip can honour it
  const startFor = useRef<{ ref: string; sec: number } | null>(null);
  useEffect(() => {
    startFor.current = preview && track?.startSec ? { ref: preview, sec: track.startSec } : null;
  }, [preview, track?.startSec]);
  const onMeta = (el: HTMLAudioElement) => {
    const want = startFor.current;
    if (!want || !preview || want.ref !== preview) return;
    startFor.current = null;
    const at = playableStart(want.sec, el.duration);
    if (at > 0) el.currentTime = at;
    else if (track?.stopSec && track.startSec) {
      // a 30 s excerpt shorter than the chorus start: it plays from its own beginning for the cortina length
      const len = track.stopSec - track.startSec;
      usePlayer.setState({ track: { ...track, startSec: 0, stopSec: len }, position: 0 });
    }
  };

  // play / pause follow the store; a new source loads and starts
  useEffect(() => {
    const el = audio.current;
    if (!el || !preview) return;
    // apps: a media element cannot reach the on-device /api/preview, so it gets the signed link itself
    if (APP && preview.startsWith("/api/")) {
      let live = true;
      void mediaUrl(preview).then(
        (url) => {
          if (!live) return;
          if (el.dataset.ref !== preview) {
            el.dataset.ref = preview;
            el.src = url;
            el.load();
          }
          if (playing)
            el.play().catch((e: Error) => {
              if (e.name === "AbortError") return;
              _error(
                e.name === "NotAllowedError"
                  ? t("miniPlayer.tap_play_to_start")
                  : t("miniPlayer.could_not_play_this_preview"),
              );
            });
          else el.pause();
        },
        () => live && _error(t("miniPlayer.could_not_load_this_preview")),
      );
      return () => {
        live = false;
      };
    }
    // `el.src` reads back absolute, our preview refs are relative: compare resolved URLs, or every run of this
    // effect reloads the element and the pending play() is aborted (cortinas never started)
    const want = new URL(preview, window.location.href).href;
    if (el.src !== want) {
      el.src = preview;
      el.load();
    }
    if (playing)
      el.play().catch((e: Error) => {
        if (e.name === "AbortError") return; // superseded by a newer load/pause, not a failure
        _error(
          e.name === "NotAllowedError"
            ? t("miniPlayer.tap_play_to_start")
            : t("miniPlayer.could_not_play_this_preview"),
        );
      });
    else el.pause();
  }, [preview, playing, _error]);
  // seek requests (the scrubber) land on the element
  const lastSeek = useRef(position);
  useEffect(() => {
    const el = audio.current;
    if (!el || !preview) return;
    // (the element's own ticks set `position` to its currentTime: only a real move lands; 2026-11: a seek of under
    // 1.5 s — a ← press on the bar — was dropped)
    if (Math.abs(el.currentTime - position) > 0.25 && position !== lastSeek.current)
      el.currentTime = position;
    lastSeek.current = position;
  }, [position, preview]);

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: a 30 s music preview has no captions to offer */}
      <audio
        ref={audio}
        playsInline
        preload="none"
        onTimeUpdate={(e) => _tick(e.currentTarget.currentTime, e.currentTarget.duration || 30)}
        onLoadedMetadata={(e) => onMeta(e.currentTarget)}
        onEnded={_ended}
        onError={() => _error(t("miniPlayer.could_not_load_this_preview"))}
        aria-hidden
      />
      <FindHost />
    </>
  );
}

/**
 * 2026-11 — the preview's card, held by the one player (components/player/PlayerDock.tsx): the bottom bar on a phone
 * (docked on the tab bar) and an iPad portrait, the sidebar's player on a wider window, or a floating card; its audio
 * stays in MiniPlayer, so moving it never stops the sound.
 */
export function MiniPlayerCard() {
  const { track, playing, position, duration, error, queue, list, toggle, close, seek } = usePlayer();
  const reduced = useReducedMotion();
  const place = useDock((s) => s.place);
  const external = externalAudio(track?.source);
  const controllable = !!track && track.source.kind !== "spotify";
  const total = stopAt(track, queue, list?.clipSec) ?? (duration || 30);
  const artistLine = track
    ? `${track.orchestra}${track.singer ? ` · ${track.singer}` : ""}${track.year ? ` · ${track.year}` : ""}`
    : "";
  // 2026-11: Previous / Next stay inside what the play covers (a tanda only, on to the end, this song only)
  const canPrev = !!list && scopeStep(list.scope, list.items.length, list.index, -1) !== null;
  const canNext = !!list && scopeStep(list.scope, list.items.length, list.index, 1) !== null;
  const stepper = !!list && list.items.length > 1 && list.scope?.kind !== "one";
  const onSeek = (sec: number) => (external ? void externalSeek(sec) : seek(sec));
  // the phone tab capsule (wave 4: --tabbar-h over --tabbar-bottom): the player's bottom edge sits on its top edge
  // (--chrome-stack is the tab capsule plus this player's own reserve: the player sits on the capsule, under it)
  const offset = "calc(var(--chrome-stack) - var(--mini-reserve))";
  // the page reserves the docked player's height (globals.css: --mini-h → --mini-reserve → --bottom-chrome), so the
  // last rows, the guide box and anything scrolled into view clear the player as well as the tab capsule
  const docked = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = docked.current;
    const root = document.documentElement;
    if (!track || !el) return;
    // 2026-11: only the bottom bar takes room from the page (in the sidebar, floating or round it takes none)
    if (place !== "bar") {
      root.style.setProperty("--mini-h", "0px");
      return () => root.style.removeProperty("--mini-h");
    }
    const put = () => root.style.setProperty("--mini-h", `${Math.ceil(el.offsetHeight)}px`);
    put();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(put) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--mini-h");
    };
  }, [track, place]);
  // the tab bar squares its top corners while the player is docked on it
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('[data-testid="tab-bar"]');
    if (!nav) return;
    if (track && place === "bar") nav.dataset.docked = "1";
    else delete nav.dataset.docked;
    return () => {
      delete nav.dataset.docked;
    };
  }, [track, place]);

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          key="mini-player"
          ref={docked}
          variants={reduced ? undefined : sheetUp}
          initial={reduced ? { opacity: 0 } : "hidden"}
          animate={reduced ? { opacity: 1 } : "show"}
          exit={reduced ? { opacity: 0 } : "exit"}
          role="region"
          aria-label={t("miniPlayer.now_playing")}
          data-testid="mini-player"
          data-source={track.source.kind}
          data-kind={track.kind ?? "song"}
          data-place={place ?? undefined}
          className="glass mini-docked fixed inset-x-4 z-30 mx-auto max-w-[440px] sm:max-w-none rounded-[var(--radius-m)] p-2 sm:inset-x-auto sm:bottom-6 sm:w-[400px] lg:bottom-6"
          style={{ bottom: `var(--mini-bottom, ${offset})` }}
        >
          <style>{'@media (min-width: 600px){[data-testid="mini-player"]{--mini-bottom:1.5rem}}'}</style>
          <DockGrip />
          <div className="mini-row1 flex items-center gap-2">
            {stepper && (
              <button
                type="button"
                className="mini-ctl icon-btn icon-btn-bare"
                aria-label={t("play.previous")}
                disabled={!canPrev}
                data-testid="mini-prev"
                onClick={() => {
                  haptic(4);
                  void stepList(-1);
                }}
              >
                <SkipBack size={18} fill="currentColor" strokeWidth={0} />
              </button>
            )}
            {controllable ? (
              <button
                type="button"
                className="mini-ctl icon-btn"
                data-testid="mini-toggle"
                data-playing={playing || undefined}
                aria-label={playing ? t("miniPlayer.pause") : t("miniPlayer.play")}
                onClick={() => {
                  haptic(4);
                  toggle();
                }}
              >
                {playing ? (
                  <Pause size={20} fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play size={20} fill="currentColor" strokeWidth={0} />
                )}
              </button>
            ) : null}
            {stepper && (
              <button
                type="button"
                className="mini-ctl icon-btn icon-btn-bare"
                aria-label={t("play.next")}
                disabled={!canNext}
                data-testid="mini-next"
                onClick={() => {
                  haptic(4);
                  void stepList(1);
                }}
              >
                <SkipForward size={18} fill="currentColor" strokeWidth={0} />
              </button>
            )}
            {/* 2026-11: the side's cover; a tap opens its details (the song page listens for tdj:open-song) */}
            <MiniCover id={track.id} title={track.title} orchestra={track.orchestra} />
            {/* 2026-11 (the owner: "name won't slide to show all"): the title and artist have the row's room (the
                  source badge moved under them) and slide when they still do not fit (components/ui/Marquee.tsx) */}
            <span className="mini-meta min-w-0 flex-1 px-1">
              <Marquee
                text={track.title}
                className="text-subhead block font-semibold"
                testId="mini-title-marquee"
              >
                <span data-testid="mini-title">{track.title}</span>
              </Marquee>
              <Marquee
                text={artistLine}
                className="text-footnote block text-[var(--label-2)]"
                testId="mini-artist-marquee"
              >
                {artistLine}
              </Marquee>
            </span>
            <button
              type="button"
              className="mini-close icon-btn icon-btn-bare"
              aria-label={t("miniPlayer.close_player")}
              onClick={close}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-2 px-3">
            <span
              className="text-caption2 shrink-0 rounded-full bg-[var(--fill-3)] px-2 py-0.5 font-medium text-[var(--label-2)]"
              data-testid="player-badge"
            >
              {queue
                ? t("miniPlayer.of", {
                    label: queue.label,
                    p1: queue.index + 1,
                    length: queue.tracks.length,
                  })
                : track.source.kind === "cue"
                  ? t("play.headphones")
                  : track.kind === "cortina" && track.stopSec
                    ? t("miniPlayer.cortina_s", {
                        stopSec: Math.round(track.stopSec - (track.startSec ?? 0)),
                      })
                    : track.source.kind === "preview"
                      ? t("miniPlayer.30_s_preview")
                      : track.source.kind === "file"
                        ? t("play.your_file")
                        : track.source.kind === "spotify-full"
                          ? t("play.full_track")
                          : t("miniPlayer.spotify")}
            </span>
            {(track.where || list?.scopeLabel) && (
              <p className="text-caption1 min-w-0 truncate text-[var(--label-2)]">
                {track.where && <span data-testid="mini-where">{track.where}</span>}
                {track.where && list?.scopeLabel ? " · " : ""}
                {list?.scopeLabel && <span data-testid="mini-scope">{list.scopeLabel}</span>}
              </p>
            )}
          </div>
          {track.source.kind !== "spotify" ? (
            <div className="flex items-center gap-2 px-2 pb-1">
              <span className="text-caption1 w-8 tabular-nums text-[var(--label-2)]">{fmt(position)}</span>
              {/* 2026-11: the shared seek bar (drag, tap, ← / → ±5 s; a 44 px target, the 32 px range was not) */}
              <SeekBar
                value={Math.min(position, total)}
                max={total}
                onSeek={onSeek}
                label={t("miniPlayer.position")}
                hint={t("miniPlayer.seek_hint")}
                testId="mini-seek"
              />
              <span className="text-caption1 w-8 text-right tabular-nums text-[var(--label-2)]">
                {fmt(total)}
              </span>
            </div>
          ) : (
            <div className="px-1 pb-1">
              <SpotifyEmbed
                kind="track"
                id={track.source.ref}
                title={t("miniPlayer.on_spotify", { title: track.title })}
                height={80}
              />
            </div>
          )}
          {error && (
            <p className="text-caption1 px-3 pb-1 text-[var(--destructive)]" role="status">
              {error}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 2026-11: the playing side's cover in the mini player; a tap opens the song's details (lib/songOpen.ts) — a
 * cortina, which has none, finds its row on the page (lib/openSong.ts)
 */
function MiniCover({ id, title, orchestra }: { id: string; title: string; orchestra: string }) {
  const entity = usePlayingEntity();
  return (
    <button
      type="button"
      className="mini-cover shrink-0"
      aria-label={t("miniPlayer.song_details", { title })}
      data-testid="mini-cover"
      onClick={() => {
        haptic(4);
        if (entity && "rhythm" in entity) {
          openSongDetails(entity as Song);
          return;
        }
        if (openSong({ id, title }) === "none") toast(t("miniPlayer.details_not_here", { title }));
      }}
    >
      <Artwork entity={entity} orchestra={orchestra} size={40} />
    </button>
  );
}

/** the "Find on services" sheet a no-audio toast opens from any row (lib/playback.ts → openFind) */
function FindHost() {
  const song = useFindSheet((s) => s.song);
  if (!song) return null;
  return <ResolveSheet song={song} open onClose={() => useFindSheet.setState({ song: null })} />;
}
