"use client";
import { Pause, Play, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { mediaUrl } from "@/lib/app/media";
import { APP } from "@/lib/app/target";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { sheetUp } from "@/lib/motion";
import { stopAt, usePlayer } from "@/lib/player";
import { SpotifyEmbed } from "./Listen";

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
  const { track, playing, position, duration, error, queue, toggle, close, seek, _tick, _ended, _error } =
    usePlayer();
  const audio = useRef<HTMLAudioElement>(null);
  const reduced = useReducedMotion();
  const preview = track?.source.kind === "preview" ? track.source.ref : null;

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
    if (Math.abs(el.currentTime - position) > 1.5 && position !== lastSeek.current) el.currentTime = position;
    lastSeek.current = position;
  }, [position, preview]);

  const total = stopAt(track, queue) ?? (duration || 30);
  // the phone tab capsule (wave 4: --tabbar-h over --tabbar-bottom): the player's bottom edge sits on its top edge
  const offset = "calc(var(--tabbar-bottom) + var(--tabbar-h))";
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
            className="glass mini-docked fixed inset-x-4 z-30 mx-auto max-w-[440px] sm:max-w-none rounded-[var(--radius-m)] p-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px] lg:bottom-6"
            style={{ bottom: `var(--mini-bottom, ${offset})` }}
          >
            <style>{'@media (min-width: 600px){[data-testid="mini-player"]{--mini-bottom:1.5rem}}'}</style>
            <div className="flex items-center gap-2">
              {track.source.kind === "preview" ? (
                <button
                  type="button"
                  className="icon-btn"
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
              <span className="min-w-0 flex-1 px-1">
                <span className="text-subhead block truncate font-semibold">{track.title}</span>
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
                  : track.kind === "cortina" && track.stopSec
                    ? t("miniPlayer.cortina_s", { stopSec: track.stopSec })
                    : track.source.kind === "preview"
                      ? t("miniPlayer.30_s_preview")
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
            {track.source.kind === "preview" ? (
              <div className="flex items-center gap-2 px-2 pb-1">
                <span className="text-caption1 w-8 tabular-nums text-[var(--label-2)]">{fmt(position)}</span>
                <input
                  type="range"
                  aria-label={t("miniPlayer.position")}
                  min={0}
                  max={Math.max(1, Math.floor(total))}
                  step={1}
                  value={Math.min(position, total)}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="!h-8 min-w-0 flex-1"
                  style={{ ["--pct" as string]: `${(position / total) * 100}%` }}
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
    </>
  );
}
