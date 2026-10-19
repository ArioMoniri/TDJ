"use client";
import { Pause, Play, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { haptic } from "@/lib/haptics";
import { sheetUp } from "@/lib/motion";
import { usePlayer } from "@/lib/player";
import { SpotifyEmbed } from "./Listen";

const fmt = (s: number) => {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

/**
 * Persistent mini-player on the control layer (glass): title · orchestra · year, progress scrubber, 30 s badge, close.
 * Phone: above the tab bar (and above the composer's accessory bar on /). Desktop: bottom-right card.
 * The one `<audio playsInline>` element of the app lives here; Spotify sources render the inline embed instead.
 */
export function MiniPlayer() {
  const { track, playing, position, duration, error, toggle, close, seek, _tick, _ended, _error } =
    usePlayer();
  const audio = useRef<HTMLAudioElement>(null);
  const reduced = useReducedMotion();
  const path = usePathname();
  const preview = track?.source.kind === "preview" ? track.source.ref : null;

  // play / pause follow the store; a new source loads and starts
  useEffect(() => {
    const el = audio.current;
    if (!el || !preview) return;
    if (el.src !== preview) {
      el.src = preview;
      el.load();
    }
    if (playing)
      el.play().catch((e: Error) =>
        _error(e.name === "NotAllowedError" ? "Tap play to start" : "Could not play this preview"),
      );
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

  const offset =
    path === "/"
      ? "calc(max(0.75rem, env(safe-area-inset-bottom)) + 68px + 64px)"
      : "calc(max(0.75rem, env(safe-area-inset-bottom)) + 68px)";

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: a 30 s music preview has no captions to offer */}
      <audio
        ref={audio}
        playsInline
        preload="none"
        onTimeUpdate={(e) => _tick(e.currentTarget.currentTime, e.currentTarget.duration || 30)}
        onEnded={_ended}
        onError={() => _error("Could not load this preview")}
        aria-hidden
      />
      <AnimatePresence>
        {track && (
          <motion.div
            key="mini-player"
            variants={reduced ? undefined : sheetUp}
            initial={reduced ? { opacity: 0 } : "hidden"}
            animate={reduced ? { opacity: 1 } : "show"}
            exit={reduced ? { opacity: 0 } : "exit"}
            role="region"
            aria-label="Now playing"
            data-testid="mini-player"
            className="glass fixed inset-x-3 z-30 rounded-[var(--radius-m)] p-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px] lg:bottom-6"
            style={{ bottom: `var(--mini-bottom, ${offset})` }}
          >
            <style>{`@media (min-width: 640px){[data-testid="mini-player"]{--mini-bottom:1.5rem}}`}</style>
            <div className="flex items-center gap-2">
              {track.source.kind === "preview" ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={playing ? "Pause" : "Play"}
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
              <span className="text-caption2 rounded-full bg-[var(--fill-3)] px-2 py-0.5 font-medium text-[var(--label-2)]">
                {track.source.kind === "preview" ? "30 s preview" : "Spotify"}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn-bare"
                aria-label="Close player"
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
                  aria-label="Position"
                  min={0}
                  max={Math.max(1, Math.floor(duration || 30))}
                  step={1}
                  value={Math.min(position, duration || 30)}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="!h-8 min-w-0 flex-1"
                  style={{ ["--pct" as string]: `${(position / (duration || 30)) * 100}%` }}
                />
                <span className="text-caption1 w-8 text-right tabular-nums text-[var(--label-2)]">
                  {fmt(duration || 30)}
                </span>
              </div>
            ) : (
              <div className="px-1 pb-1">
                <SpotifyEmbed
                  kind="track"
                  id={track.source.ref}
                  title={`${track.title} on Spotify`}
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
