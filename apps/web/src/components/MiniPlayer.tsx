"use client";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { mediaUrl } from "@/lib/app/media";
import { APP } from "@/lib/app/target";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { sheetUp } from "@/lib/motion";
import { externalSeek, loadPlayAccess, stepList, useFindSheet } from "@/lib/playback";
import { externalAudio, ownAudio, stopAt, usePlayer } from "@/lib/player";
import { scopeStep } from "@/lib/playScope";
import { playableStart } from "@/lib/playSource";
import { SpotifyEmbed } from "./Listen";
import { SeekBar } from "./ui/SeekBar";

const ResolveSheet = dynamic(() => import("./ResolveSheet").then((m) => m.ResolveSheet), { ssr: false });

const fmt = (s: number) => {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

/**
 * Persistent mini-player on the control layer (glass): title · orchestra · year, progress scrubber, 30 s badge, close.
 * Phone: docked onto the tab bar as one glass unit (square bottom corners meet the bar's squared top; the composer's
 * primary bar hides meanwhile, round8-ux.md §1.12). Desktop: bottom-right card.
 * The one `<audio playsInline>` element of the app lives here; Spotify sources render the inline embed instead.
 */
export function MiniPlayer() {
  const {
    track,
    playing,
    position,
    duration,
    error,
    queue,
    list,
    toggle,
    close,
    seek,
    _tick,
    _ended,
    _error,
  } = usePlayer();
  const audio = useRef<HTMLAudioElement>(null);
  const reduced = useReducedMotion();
  const preview = ownAudio(track?.source) ? track!.source.ref : null;
  const external = externalAudio(track?.source);
  const controllable = !!track && track.source.kind !== "spotify";
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

  const total = stopAt(track, queue, list?.clipSec) ?? (duration || 30);
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
    const put = () => root.style.setProperty("--mini-h", `${Math.ceil(el.offsetHeight)}px`);
    put();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(put) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--mini-h");
    };
  }, [track]);
  // the tab bar squares its top corners while the player is docked on it
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('[data-testid="tab-bar"]');
    if (!nav) return;
    if (track) nav.dataset.docked = "1";
    else delete nav.dataset.docked;
    return () => {
      delete nav.dataset.docked;
    };
  }, [track]);

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
            className="glass mini-docked fixed inset-x-4 z-30 mx-auto max-w-[440px] sm:max-w-none rounded-[var(--radius-m)] p-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px] lg:bottom-6"
            style={{ bottom: `var(--mini-bottom, ${offset})` }}
          >
            <style>{'@media (min-width: 600px){[data-testid="mini-player"]{--mini-bottom:1.5rem}}'}</style>
            <div className="flex items-center gap-2">
              {stepper && (
                <button
                  type="button"
                  className="icon-btn icon-btn-bare"
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
                  className="icon-btn"
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
                  className="icon-btn icon-btn-bare"
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
              <span className="min-w-0 flex-1 px-1">
                <span className="text-subhead block truncate font-semibold" data-testid="mini-title">
                  {track.title}
                </span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {track.orchestra}
                  {track.singer ? ` · ${track.singer}` : ""}
                  {track.year ? ` · ${track.year}` : ""}
                </span>
              </span>
              <span
                className="text-caption2 rounded-full bg-[var(--fill-3)] px-2 py-0.5 font-medium text-[var(--label-2)]"
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
              <button
                type="button"
                className="icon-btn icon-btn-bare"
                aria-label={t("miniPlayer.close_player")}
                onClick={close}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            {(track.where || list?.scopeLabel) && (
              <p className="text-caption1 truncate px-3 text-[var(--label-2)]">
                {track.where && <span data-testid="mini-where">{track.where}</span>}
                {track.where && list?.scopeLabel ? " · " : ""}
                {list?.scopeLabel && <span data-testid="mini-scope">{list.scopeLabel}</span>}
              </p>
            )}
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
      <FindHost />
    </>
  );
}

/** the "Find on services" sheet a no-audio toast opens from any row (lib/playback.ts → openFind) */
function FindHost() {
  const song = useFindSheet((s) => s.song);
  if (!song) return null;
  return <ResolveSheet song={song} open onClose={() => useFindSheet.setState({ song: null })} />;
}
