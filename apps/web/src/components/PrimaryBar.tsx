"use client";
import { motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { ComposeLabel } from "./ComposeNarrative";

/**
 * Phone primary action (wave 4). iOS 26 keeps a page's actions in its navigation bar: once a set exists, Regenerate
 * and Export are icon buttons there (Composer.tsx) and nothing floats over the content. Before the first set, the
 * one compact floating action is "Compose the night": a 50 pt capsule sized to its label at the trailing edge,
 * 10 pt above the tab capsule, never a full-width bar stacked on it. It leaves the screen under sheets and the
 * mini-player. Transform/opacity only.
 */
export function PrimaryBar({
  hasPlaylist,
  busy,
  hidden,
  onCompose,
  errorNudge,
}: {
  hasPlaylist: boolean;
  busy: boolean;
  /** a sheet or the mini-player is open: the button leaves the screen (one glass unit over the tab bar at a time) */
  hidden: boolean;
  onCompose: () => void;
  errorNudge: { x: number | number[] };
}) {
  if (hasPlaylist) return null;
  // visibility rides along so a hidden state is not a composited (blurred) layer at all; it flips after the fade
  const show = !hidden;
  return (
    <div
      className="fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--chrome-stack)+10px)] z-30 sm:hidden"
      data-testid="primary-bar"
      data-hidden={hidden || undefined}
      aria-hidden={!show || undefined}
      style={{
        transition: `transform var(--dur-s) var(--ease-settle), opacity var(--dur-s) var(--ease-settle), visibility 0s linear ${show ? "0s" : "var(--dur-s)"}`,
        transform: show ? "none" : "translateY(calc(100% + 80px))",
        opacity: show ? 1 : 0,
        visibility: show ? "visible" : "hidden",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      <motion.button
        type="button"
        onClick={onCompose}
        disabled={busy}
        className="btn btn-primary h-[var(--fab-h)] min-h-0 max-w-[calc(100vw-2rem)] px-5 shadow-[0_6px_20px_rgb(0_0_0/0.18)]"
        animate={errorNudge}
        transition={{ duration: 0.28, ease: EASE.inOut }}
        data-testid="bar-compose"
        tabIndex={show ? 0 : -1}
      >
        <ComposeLabel busy={busy} steps />
      </motion.button>
    </div>
  );
}
