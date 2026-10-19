"use client";
import { Disc3, Ellipsis, Repeat2, Share } from "lucide-react";
import { motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { ComposeLabel } from "./ComposeNarrative";

/**
 * Phone primary bar (round5-design.md §1): a glass capsule directly above the tab bar, in thumb reach.
 * No set yet: one full-width "Compose the night" (50 pt). With a set: Regenerate (secondary) + Export (primary)
 * + the `•••` menu. It hides under sheets, and when the tab bar minimises on scroll-down it becomes an icon-only
 * pill that returns with the bar on scroll-up. Transform/opacity only; the two states cross-fade.
 */
export function PrimaryBar({
  hasPlaylist,
  busy,
  minimised,
  hidden,
  onCompose,
  onExport,
  errorNudge,
  onMore,
}: {
  hasPlaylist: boolean;
  busy: boolean;
  /** the tab bar is minimised: show the icon-only pill */
  minimised: boolean;
  /** a sheet is open: the bar leaves the screen */
  hidden: boolean;
  onCompose: () => void;
  onExport: () => void;
  errorNudge: { x: number | number[] };
  /** opens the `•••` actions sheet; it lives outside the bar, which leaves the screen while any sheet is up */
  onMore: () => void;
}) {
  // visibility rides along so a hidden state is not a composited (blurred) layer at all; it flips after the fade
  const tr = (on: boolean) =>
    `transform var(--dur-s) var(--ease-settle), opacity var(--dur-s) var(--ease-settle), visibility 0s linear ${on ? "0s" : "var(--dur-s)"}`;
  const showFull = !hidden && !minimised;
  const showPill = !hidden && minimised;
  return (
    <>
      {/* full bar */}
      <div
        className="glass fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+68px)] z-30 flex items-center gap-1.5 rounded-full p-1.5 sm:hidden"
        data-testid="primary-bar"
        data-min={minimised || undefined}
        data-hidden={hidden || undefined}
        aria-hidden={!showFull || undefined}
        style={{
          transition: tr(showFull),
          transform: showFull ? "none" : "translateY(calc(100% + 80px))",
          opacity: showFull ? 1 : 0,
          visibility: showFull ? "visible" : "hidden",
          pointerEvents: showFull ? "auto" : "none",
        }}
      >
        {hasPlaylist ? (
          <>
            <motion.button
              type="button"
              onClick={onCompose}
              disabled={busy}
              className="btn btn-ghost min-h-[50px] flex-1 px-3"
              animate={errorNudge}
              transition={{ duration: 0.28, ease: EASE.inOut }}
              data-testid="bar-regenerate"
            >
              <ComposeLabel busy={busy} steps idle="Regenerate" />
            </motion.button>
            <button
              type="button"
              onClick={onExport}
              className="btn btn-primary min-h-[50px] flex-1 px-3"
              data-testid="bar-export"
            >
              <Share size={18} strokeWidth={2} aria-hidden /> Export
            </button>
            <button type="button" className="icon-btn" aria-label="Set actions" onClick={onMore}>
              <Ellipsis size={20} strokeWidth={2} aria-hidden />
            </button>
          </>
        ) : (
          <motion.button
            type="button"
            onClick={onCompose}
            disabled={busy}
            className="btn btn-primary min-h-[50px] flex-1"
            animate={errorNudge}
            transition={{ duration: 0.28, ease: EASE.inOut }}
            data-testid="bar-compose"
          >
            <ComposeLabel busy={busy} steps />
          </motion.button>
        )}
      </div>
      {/* minimised: an icon-only pill that keeps the primary action within reach while reading the set */}
      <div
        className="glass fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+68px)] left-1/2 z-30 flex items-center gap-0.5 rounded-full p-1 sm:hidden"
        data-testid="primary-pill"
        aria-hidden={!showPill || undefined}
        style={{
          transition: tr(showPill),
          transform: showPill ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          opacity: showPill ? 1 : 0,
          visibility: showPill ? "visible" : "hidden",
          pointerEvents: showPill ? "auto" : "none",
        }}
      >
        {hasPlaylist ? (
          <>
            <button
              type="button"
              onClick={onCompose}
              disabled={busy}
              className="icon-btn icon-btn-bare h-11 w-11"
              aria-label="Regenerate"
              tabIndex={showPill ? 0 : -1}
            >
              <Repeat2 size={20} strokeWidth={2} className={busy ? "animate-spin" : ""} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onExport}
              className="icon-btn icon-btn-send h-11 w-11"
              aria-label="Export"
              tabIndex={showPill ? 0 : -1}
            >
              <Share size={20} strokeWidth={2} aria-hidden />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onCompose}
            disabled={busy}
            className="icon-btn icon-btn-send h-11 w-11"
            aria-label="Compose the night"
            tabIndex={showPill ? 0 : -1}
          >
            <Disc3 size={20} strokeWidth={2} className={busy ? "animate-spin" : ""} aria-hidden />
          </button>
        )}
      </div>
    </>
  );
}
